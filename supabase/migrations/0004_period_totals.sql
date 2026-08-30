-- 0004_period_totals.sql
--
-- Totales de un periodo. Igual que daily_metrics, esto vive en la base y no
-- en el frontend, para que haya un solo lugar donde se calculan las metricas.
--
-- La regla que hace toda la diferencia: agregar NO es promediar.
--   CAC del mes  = todo lo gastado / todos los clientes nuevos
--   NO           = promedio de los CAC de cada dia
-- Los dos numeros son distintos y el segundo esta mal. Lo mismo aplica a
-- ROAS, AOV, CTR, CPC, CPM y tasa de conversion.

create or replace function period_totals(desde date, hasta date)
returns table (
  dias                integer,
  dias_sin_gasto      integer,
  dias_sin_tasa       integer,

  orders              bigint,
  gross_sales         numeric,
  discounts           numeric,
  returns             numeric,
  net_sales           numeric,
  total_sales         numeric,
  aov                 numeric,

  customers           bigint,
  new_customers       bigint,
  returning_customers bigint,

  sessions            bigint,
  visitors            bigint,
  conversion_rate     numeric,

  ad_spend            numeric,
  impressions         bigint,
  clicks              bigint,
  reach               bigint,
  ctr                 numeric,
  cpc                 numeric,
  cpm                 numeric,

  cac                 numeric,
  roas                numeric,
  mer                 numeric,
  ad_spend_pct        numeric,
  contribution        numeric,

  store_currency      text
)
language sql
stable
security invoker
as $$
  with t as (
    select
      count(*)::integer                                       as dias,
      -- Dias donde directamente no hubo fila de gasto.
      count(*) filter (where m.ad_spend_original is null)::integer as dias_sin_gasto,
      -- Dias donde SI hubo gasto pero no se pudo convertir de moneda.
      -- Se reporta en vez de esconderse: si no, el total de inversion aparece
      -- mas bajo de lo real y nadie se entera.
      count(*) filter (
        where m.ad_spend_original is not null and m.ad_spend is null
      )::integer                                              as dias_sin_tasa,

      sum(m.orders)::bigint                                   as orders,
      sum(m.gross_sales)                                      as gross_sales,
      sum(m.discounts)                                        as discounts,
      sum(m.returns)                                          as returns,
      sum(m.net_sales)                                        as net_sales,
      sum(m.total_sales)                                      as total_sales,

      sum(m.customers)::bigint                                as customers,
      sum(m.new_customers)::bigint                            as new_customers,
      sum(m.returning_customers)::bigint                      as returning_customers,

      sum(m.sessions)::bigint                                 as sessions,
      sum(m.visitors)::bigint                                 as visitors,
      sum(m.sessions_completed_checkout)::bigint              as checkouts,

      sum(m.ad_spend)                                         as ad_spend,
      sum(m.impressions)::bigint                              as impressions,
      sum(m.clicks)::bigint                                   as clicks,
      sum(m.reach)::bigint                                    as reach,

      max(m.store_currency)                                   as store_currency
    from daily_metrics m
    where m.date between desde and hasta
  )
  select
    t.dias, t.dias_sin_gasto, t.dias_sin_tasa,

    t.orders, t.gross_sales, t.discounts, t.returns, t.net_sales, t.total_sales,
    case when coalesce(t.orders, 0) = 0 then null
         else round(t.total_sales / t.orders, 2) end          as aov,

    t.customers, t.new_customers, t.returning_customers,

    t.sessions, t.visitors,
    case when coalesce(t.sessions, 0) = 0 then null
         else round(t.checkouts::numeric / t.sessions * 100, 4) end as conversion_rate,

    t.ad_spend, t.impressions, t.clicks, t.reach,
    case when coalesce(t.impressions, 0) = 0 then null
         else round(t.clicks::numeric / t.impressions * 100, 4) end as ctr,
    case when t.ad_spend is null or coalesce(t.clicks, 0) = 0 then null
         else round(t.ad_spend / t.clicks, 4) end             as cpc,
    case when t.ad_spend is null or coalesce(t.impressions, 0) = 0 then null
         else round(t.ad_spend / t.impressions * 1000, 4) end as cpm,

    case when t.ad_spend is null or coalesce(t.new_customers, 0) = 0 then null
         else round(t.ad_spend / t.new_customers, 2) end      as cac,
    case when t.ad_spend is null or t.ad_spend = 0 then null
         else round(t.total_sales / t.ad_spend, 2) end        as roas,
    case when t.ad_spend is null or coalesce(t.total_sales, 0) = 0 then null
         else round(t.ad_spend / t.total_sales, 4) end        as mer,
    case when t.ad_spend is null or coalesce(t.total_sales, 0) = 0 then null
         else round(t.ad_spend / t.total_sales * 100, 2) end  as ad_spend_pct,
    case when t.ad_spend is null then null
         else round(t.total_sales - t.ad_spend, 2) end        as contribution,

    t.store_currency
  from t;
$$;

comment on function period_totals is
  'Totales agregados de un periodo. CAC y ROAS se calculan sobre las sumas, nunca promediando los valores diarios.';
