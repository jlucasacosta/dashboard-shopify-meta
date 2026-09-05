-- 0008_multicanal.sql
--
-- Segundo canal de venta: Mercado Libre.
--
-- Hasta aca "una fila por dia" alcanzaba porque habia una sola fuente de
-- ventas. Ahora hay dos, y la clave pasa a ser (fecha, canal).
--
-- La decision que ordena todo el resto: EL GASTO DE ADS NO SE PARTE POR CANAL.
-- Un anuncio de Meta puede empujar una venta en Shopify y una en Mercado Libre,
-- y no hay forma honesta de saber cual. Entonces las ventas se guardan por
-- canal, pero CAC, ROAS, MER y contribucion se calculan siempre contra el TOTAL
-- de canales. Repartir el gasto seria inventar un numero.

-- ---------------------------------------------------------------- Columnas

alter table daily_sales
  add column canal text not null default 'shopify'
  check (canal in ('shopify', 'meli'));

alter table daily_products
  add column canal text not null default 'shopify'
  check (canal in ('shopify', 'meli'));

-- El default deja las filas que ya existen marcadas como Shopify, que es lo
-- que son. La clave primaria se amplia para que los dos canales convivan.
alter table daily_sales    drop constraint daily_sales_pkey;
alter table daily_sales    add primary key (date, canal);

alter table daily_products drop constraint daily_products_pkey;
alter table daily_products add primary key (date, canal, product_id);

-- daily_traffic NO cambia: el embudo (visitas -> carrito -> checkout) es de
-- Shopify. Mercado Libre solo expone visitas por item, no tiene "agregado al
-- carrito" ni "pago iniciado" porque su checkout es suyo. Cuando haga falta
-- sumar visitas de MeLi, va en su propia migracion.

-- Mercado Libre pasa a ser una fuente valida del log.
alter table sync_log drop constraint sync_log_source_check;
alter table sync_log add constraint sync_log_source_check
  check (source in ('shopify', 'meta', 'fx', 'meli'));

-- ------------------------------------------------- Total de todos los canales

-- Suma los canales de un dia y los deja todos en la moneda de la tienda.
--
-- Misma regla que daily_metrics: si un canal factura en otra moneda y no hay
-- tasa de ESE dia, el total del dia es NULL. No se suma "lo que se puede" y se
-- ignora el resto: eso daria un total mas chico que la realidad, con cara de
-- estar completo.
create or replace view daily_sales_total
with (security_invoker = on) as
with moneda_dia as (
  -- La moneda de referencia de un dia es la de su fila de Shopify. Se resuelve
  -- por dia y no desde `settings` a proposito: asi cada dia queda consistente
  -- consigo mismo, igual que antes de que existieran los canales, y el
  -- comportamiento de daily_metrics no cambia para quien solo usa Shopify.
  select
    date,
    coalesce(
      max(currency) filter (where canal = 'shopify'),
      min(currency)
    ) as store_currency
  from daily_sales
  group by date
),
convertido as (
  select
    s.date,
    m.store_currency,
    s.orders, s.customers, s.new_customers, s.returning_customers,
    s.gross_sales, s.discounts, s.returns, s.net_sales,
    s.shipping, s.taxes, s.total_sales,
    case
      when s.currency = m.store_currency then 1::numeric
      when fx.rate is not null           then fx.rate
      else null
    end as tasa
  from daily_sales s
  join moneda_dia m on m.date = s.date
  left join fx_rates fx
    on  fx.date           = s.date
    and fx.base_currency  = s.currency
    and fx.quote_currency = m.store_currency
)
select
  date,
  max(store_currency) as currency,
  -- Los conteos no dependen de la moneda: se suman siempre.
  sum(orders)::integer              as orders,
  sum(customers)::integer           as customers,
  sum(new_customers)::integer       as new_customers,
  sum(returning_customers)::integer as returning_customers,
  -- La plata solo se suma si TODOS los canales del dia se pudieron convertir.
  -- `sum()` ignora los NULL por su cuenta, y eso es justo lo que no queremos.
  case when bool_or(tasa is null) then null else round(sum(gross_sales * tasa), 2) end as gross_sales,
  case when bool_or(tasa is null) then null else round(sum(discounts   * tasa), 2) end as discounts,
  case when bool_or(tasa is null) then null else round(sum(returns     * tasa), 2) end as returns,
  case when bool_or(tasa is null) then null else round(sum(net_sales   * tasa), 2) end as net_sales,
  case when bool_or(tasa is null) then null else round(sum(shipping    * tasa), 2) end as shipping,
  case when bool_or(tasa is null) then null else round(sum(taxes       * tasa), 2) end as taxes,
  case when bool_or(tasa is null) then null else round(sum(total_sales * tasa), 2) end as total_sales,
  -- Ticket promedio recalculado sobre los totales del dia, no promediando los
  -- de cada canal. Sin pedidos queda NULL, nunca 0.
  case
    when bool_or(tasa is null) then null
    when coalesce(sum(orders), 0) = 0 then null
    else round(sum(total_sales * tasa) / sum(orders), 2)
  end as aov,
  count(*) filter (where tasa is null)::integer as canales_sin_tasa
from convertido
group by date;

comment on view daily_sales_total is
  'Ventas de todos los canales de un dia, en la moneda de la tienda. Si a un canal le falta la tasa del dia, el total es NULL.';

-- --------------------------------------------------------- daily_metrics

-- Cambia una sola cosa: lee daily_sales_total en vez de daily_sales. El resto
-- de la vista es identico, y por eso period_totals sigue andando sin tocarse.
drop view if exists daily_metrics;

create view daily_metrics
with (security_invoker = on) as
with base as (
  select
    s.date,
    s.currency as store_currency,
    s.orders, s.gross_sales, s.discounts, s.returns, s.net_sales,
    s.shipping, s.taxes, s.total_sales, s.aov,
    s.customers, s.new_customers, s.returning_customers,

    t.sessions, t.visitors, t.sessions_with_cart,
    t.sessions_reached_checkout, t.sessions_completed_checkout,
    t.conversion_rate,

    a.ad_account_id,
    a.currency  as ad_currency,
    a.spend     as ad_spend_original,
    a.impressions, a.clicks, a.reach, a.frequency, a.ctr, a.cpc, a.cpm,
    a.meta_purchases, a.meta_revenue,
    a.source    as ad_source,

    -- Conversion a la moneda de la tienda usando la tasa DE ESE DIA,
    -- no la de hoy. Si no hay tasa, el gasto convertido es NULL y arrastra
    -- a NULL todas las metricas que dependen de el.
    case
      when a.spend is null         then null
      when a.currency = s.currency then a.spend
      when fx.rate is null         then null
      else round(a.spend * fx.rate, 2)
    end as ad_spend
  from daily_sales_total s
  left join daily_traffic  t on t.date = s.date
  left join daily_ad_spend a on a.date = s.date
  left join fx_rates fx
    on  fx.date           = s.date
    and fx.base_currency  = a.currency
    and fx.quote_currency = s.currency
)
select
  base.*,
  -- Costo de adquirir un cliente nuevo.
  case when ad_spend is null or new_customers = 0 then null
       else round(ad_spend / new_customers, 2) end     as cac,
  -- Retorno sobre la inversion publicitaria, con las ventas de todos los canales.
  case when ad_spend is null or ad_spend = 0 or total_sales is null then null
       else round(total_sales / ad_spend, 2) end       as roas,
  -- Marketing Efficiency Ratio: que porcion de la facturacion se va en ads.
  case when ad_spend is null or coalesce(total_sales, 0) = 0 then null
       else round(ad_spend / total_sales, 4) end       as mer,
  case when ad_spend is null or coalesce(total_sales, 0) = 0 then null
       else round(ad_spend / total_sales * 100, 2) end as ad_spend_pct,
  -- Lo que queda despues de pagar los anuncios.
  case when ad_spend is null or total_sales is null then null
       else round(total_sales - ad_spend, 2) end       as contribution
from base;

comment on view daily_metrics is
  'Metricas derivadas sobre el TOTAL de canales. Unico lugar donde se calcula CAC, ROAS y MER. Nunca calcular en el cliente.';

-- --------------------------------------------------------- campaign_totals

-- BUG QUE ARREGLA ESTA VERSION: antes hacia `join daily_sales on date`, que
-- con un solo canal devolvia una fila y con dos devuelve dos. El gasto de cada
-- campaña se habria contado DOS VECES apenas se conectara Mercado Libre.
-- Ahora joinea daily_sales_total, que siempre tiene una fila por dia.
create or replace function campaign_totals(desde date, hasta date)
returns table (
  campaign_id   text,
  campaign_name text,
  status        text,
  objective     text,
  spend         numeric,
  impressions   bigint,
  clicks        bigint,
  reach         bigint,
  ctr           numeric,
  cpc           numeric,
  cpm           numeric,
  dias_sin_tasa integer
)
language sql
stable
security invoker
as $$
  with convertido as (
    select
      c.campaign_id,
      c.campaign_name,
      c.status,
      c.objective,
      c.impressions,
      c.clicks,
      c.reach,
      case
        when c.currency = s.currency then c.spend
        when fx.rate is null         then null
        else round(c.spend * fx.rate, 2)
      end as spend_convertido,
      (c.currency <> s.currency and fx.rate is null) as falta_tasa
    from daily_ad_campaigns c
    join daily_sales_total s on s.date = c.date
    left join fx_rates fx
      on  fx.date           = c.date
      and fx.base_currency  = c.currency
      and fx.quote_currency = s.currency
    where c.date between desde and hasta
  )
  select
    campaign_id,
    max(campaign_name) as campaign_name,
    max(status)        as status,
    max(objective)     as objective,
    sum(spend_convertido)   as spend,
    sum(impressions)::bigint as impressions,
    sum(clicks)::bigint      as clicks,
    sum(reach)::bigint       as reach,
    case when coalesce(sum(impressions), 0) = 0 then null
         else round(sum(clicks)::numeric / sum(impressions) * 100, 4) end as ctr,
    case when sum(spend_convertido) is null or coalesce(sum(clicks), 0) = 0 then null
         else round(sum(spend_convertido) / sum(clicks), 4) end as cpc,
    case when sum(spend_convertido) is null or coalesce(sum(impressions), 0) = 0 then null
         else round(sum(spend_convertido) / sum(impressions) * 1000, 4) end as cpm,
    count(*) filter (where falta_tasa)::integer as dias_sin_tasa
  from convertido
  group by campaign_id
  order by sum(spend_convertido) desc nulls last;
$$;

-- ---------------------------------------------------------- product_totals

-- Ahora acepta filtrar por canal. NULL (el default) = todos los canales, que
-- es como se comportaba antes: quien ya llamaba a la funcion no cambia nada.
drop function if exists product_totals(date, date, integer);

create or replace function product_totals(
  desde date,
  hasta date,
  tope integer default 20,
  canal_filtro text default null
)
returns table (
  product_id     text,
  product_title  text,
  canal          text,
  gross_sales    numeric,
  net_sales      numeric,
  orders         bigint,
  units          integer,
  pct_del_total  numeric
)
language sql
stable
security invoker
as $$
  with p as (
    select
      dp.product_id,
      max(dp.product_title) as product_title,
      -- Un mismo producto no vive en dos canales: el id es de cada plataforma.
      min(dp.canal)         as canal,
      sum(dp.gross_sales)   as gross_sales,
      sum(dp.net_sales)     as net_sales,
      sum(dp.orders)::bigint as orders,
      sum(dp.units)::integer as units
    from daily_products dp
    where dp.date between desde and hasta
      and (canal_filtro is null or dp.canal = canal_filtro)
    group by dp.product_id
  ),
  total as (select nullif(sum(gross_sales), 0) as g from p)
  select
    p.product_id, p.product_title, p.canal,
    p.gross_sales, p.net_sales, p.orders, p.units,
    case when total.g is null then null
         else round(p.gross_sales / total.g * 100, 2) end as pct_del_total
  from p cross join total
  order by p.gross_sales desc
  limit tope;
$$;

-- ---------------------------------------------------------- channel_totals

-- Ventas por canal para un periodo. Alimenta el selector de canal del panel.
-- Cada canal en su propia moneda original: mezclarlas seria mentir, y para el
-- total consolidado ya esta daily_sales_total.
create or replace function channel_totals(desde date, hasta date)
returns table (
  canal        text,
  currency     text,
  orders       bigint,
  gross_sales  numeric,
  net_sales    numeric,
  total_sales  numeric,
  aov          numeric,
  customers    bigint
)
language sql
stable
security invoker
as $$
  select
    s.canal,
    max(s.currency) as currency,
    sum(s.orders)::bigint      as orders,
    sum(s.gross_sales)         as gross_sales,
    sum(s.net_sales)           as net_sales,
    sum(s.total_sales)         as total_sales,
    -- Sobre las sumas del periodo, no promediando los aov diarios.
    case when coalesce(sum(s.orders), 0) = 0 then null
         else round(sum(s.total_sales) / sum(s.orders), 2) end as aov,
    sum(s.customers)::bigint   as customers
  from daily_sales s
  where s.date between desde and hasta
  group by s.canal
  order by sum(s.total_sales) desc nulls last;
$$;

comment on function channel_totals is
  'Ventas por canal, cada uno en su moneda original. Para el consolidado usar period_totals.';

-- --------------------------------------------------------------- Realtime

-- El embudo lee daily_traffic: sin esto la pantalla no se actualiza sola.
alter publication supabase_realtime add table daily_traffic;

-- Igual que en 0003: con RLS activo, Realtime necesita la fila entera para
-- poder evaluar la policy en un UPDATE. Sin esto descarta el evento en
-- silencio y el canal queda 'SUBSCRIBED' sin que llegue nada.
alter table daily_traffic replica identity full;
