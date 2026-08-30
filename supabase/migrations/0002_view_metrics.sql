-- 0002_view_metrics.sql
--
-- Unica fuente de verdad de las metricas derivadas.
-- CAC, ROAS, MER y contribucion se calculan SOLO aca. Nunca en el frontend,
-- nunca en la skill de sincronizacion, nunca a mano.
--
-- Regla: si falta un insumo, la metrica es NULL. Nunca un numero aproximado.
-- Un dashboard que muestra "—" es honesto. Uno que muestra un numero
-- equivocado no falla nunca y miente siempre.

create or replace view daily_metrics
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
  from daily_sales s
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
  -- Retorno sobre la inversion publicitaria, medido con ventas de Shopify.
  case when ad_spend is null or ad_spend = 0 then null
       else round(total_sales / ad_spend, 2) end       as roas,
  -- Marketing Efficiency Ratio: que porcion de la facturacion se va en ads.
  case when ad_spend is null or total_sales = 0 then null
       else round(ad_spend / total_sales, 4) end       as mer,
  case when ad_spend is null or total_sales = 0 then null
       else round(ad_spend / total_sales * 100, 2) end as ad_spend_pct,
  -- Lo que queda despues de pagar los anuncios.
  case when ad_spend is null then null
       else round(total_sales - ad_spend, 2) end       as contribution
from base;

comment on view daily_metrics is
  'Metricas derivadas. Unico lugar donde se calcula CAC, ROAS y MER. Nunca calcular en el cliente ni en el LLM.';
