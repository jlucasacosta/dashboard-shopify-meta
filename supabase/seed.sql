-- seed.sql
--
-- 12 meses de datos demo. Sirve para que puedas ver el dashboard funcionando
-- ANTES de conectar tu tienda real. Cuando corras /sync por primera vez,
-- estos datos se van a mezclar con los reales: borralos con
--   npm run db:sql -- -c "truncate daily_sales, daily_traffic, daily_ad_spend, daily_ad_campaigns, daily_products, fx_rates cascade;"
--
-- El gasto va en USD y las ventas en UYU a proposito: asi el demo ejercita
-- la conversion de moneda, que es donde mas facil se rompe un dashboard.

insert into settings (key, value) values
  ('store_currency', 'UYU'),
  ('demo_mode', 'true')
on conflict (key) do update set value = excluded.value;

with dias as (
  select generate_series(current_date - interval '364 days', current_date, '1 day')::date as d
),
modelo as (
  select
    d,
    -- Tendencia: el negocio crece suave hacia hoy.
    (1 + (current_date - d) * -0.0015)::numeric as tendencia,
    -- Los fines de semana se vende mas.
    (1 + 0.35 * case when extract(dow from d) in (0,6) then 1 else 0 end)::numeric as finde,
    -- Noviembre pega un pico (Black Friday).
    (1 + 0.8 * case when extract(month from d) = 11 then 1 else 0 end)::numeric as bf,
    -- Ruido determinista: mismo dia siempre da el mismo valor.
    (0.85 + (abs(hashtext(d::text)) % 30)::numeric / 100) as ruido
  from dias
),
calc as (
  select
    d,
    greatest(1, round(18 * tendencia * finde * bf * ruido))::int as orders,
    round(2400 * tendencia * finde * bf * ruido, 2) as aov_base
  from modelo
)
insert into daily_sales
  (date, orders, gross_sales, discounts, returns, net_sales, shipping, taxes,
   total_sales, aov, customers, new_customers, returning_customers, currency)
select
  d,
  orders,
  round(orders * aov_base, 2),
  round(orders * aov_base * 0.06, 2),
  round(orders * aov_base * 0.02, 2),
  round(orders * aov_base * 0.92, 2),
  round(orders * 180, 2),
  round(orders * aov_base * 0.22, 2),
  round(orders * aov_base * 0.92 + orders * 180, 2),
  round(aov_base, 2),
  orders,
  round(orders * 0.62)::int,
  orders - round(orders * 0.62)::int,
  'UYU'
from calc;

insert into daily_traffic
  (date, sessions, visitors, sessions_with_cart,
   sessions_reached_checkout, sessions_completed_checkout, conversion_rate)
select
  date,
  orders * 55,
  round(orders * 55 * 0.78)::int,
  round(orders * 55 * 0.11)::int,
  round(orders * 55 * 0.045)::int,
  orders,
  round(orders::numeric / (orders * 55) * 100, 4)
from daily_sales;

insert into daily_ad_spend
  (date, ad_account_id, spend, impressions, clicks, reach, frequency,
   ctr, cpc, cpm, meta_purchases, meta_revenue, currency, source)
select
  s.date,
  'act_demo',
  round(s.total_sales / 40 * 0.28, 2),
  (s.orders * 1900)::bigint,
  (s.orders * 34)::bigint,
  (s.orders * 1250)::bigint,
  1.52,
  round(34.0 / 1900 * 100, 4),
  round(s.total_sales / 40 * 0.28 / nullif(s.orders * 34, 0), 4),
  round(s.total_sales / 40 * 0.28 / nullif(s.orders * 1900, 0) * 1000, 4),
  round(s.orders * 1.25)::int,
  -- Meta se auto-atribuye ~40% mas de lo que registra Shopify.
  -- Es a proposito: muestra por que el dashboard usa Shopify como verdad.
  round(s.total_sales / 40 * 1.4, 2),
  'USD',
  'mcp'
from daily_sales s;

-- Tasa USD->UYU con deriva suave. El historico usa la tasa de cada dia,
-- no la de hoy, que es justamente el punto de guardarlas por fecha.
insert into fx_rates (date, base_currency, quote_currency, rate)
select date, 'USD', 'UYU', round(39.2 - (current_date - date) * 0.0028, 6)
from daily_sales;

insert into daily_ad_campaigns
  (date, campaign_id, campaign_name, status, objective,
   spend, impressions, clicks, reach, ctr, cpc, cpm, currency)
select
  a.date, c.id, c.nombre, 'ACTIVE', c.objetivo,
  round(a.spend * c.peso, 2),
  round(a.impressions * c.peso)::bigint,
  round(a.clicks * c.peso)::bigint,
  round(a.reach * c.peso)::bigint,
  a.ctr, a.cpc, a.cpm, 'USD'
from daily_ad_spend a
cross join (values
  ('c_prosp', 'Prospecting - Broad', 'OUTCOME_SALES',     0.45),
  ('c_retgt', 'Retargeting - 30d',   'OUTCOME_SALES',     0.30),
  ('c_brand', 'Brand Awareness',     'OUTCOME_AWARENESS', 0.15),
  ('c_catal', 'Catalogo Dinamico',   'OUTCOME_SALES',     0.10)
) as c(id, nombre, objetivo, peso);

insert into daily_products
  (date, product_id, product_title, gross_sales, net_sales, orders, units)
select
  s.date, p.id, p.titulo,
  round(s.gross_sales * p.peso, 2),
  round(s.net_sales  * p.peso, 2),
  greatest(1, round(s.orders * p.peso))::int,
  greatest(1, round(s.orders * p.peso * 1.4))::int
from daily_sales s
cross join (values
  ('p1', 'Bandas de Resistencia Pro', 0.28),
  ('p2', 'Guantes de Entrenamiento',  0.22),
  ('p3', 'Cinturon Lumbar',           0.18),
  ('p4', 'Straps de Levantamiento',   0.17),
  ('p5', 'Botella Termica 1L',        0.15)
) as p(id, titulo, peso);
