-- 0005_breakdowns.sql
--
-- Desgloses por campana y por producto para un periodo.
-- Misma regla que period_totals: los ratios se calculan sobre las sumas,
-- nunca promediando los valores diarios.

-- Campanas de Meta, con el gasto ya convertido a la moneda de la tienda.
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
      -- Misma logica de conversion que daily_metrics: tasa del dia de la fila.
      case
        when c.currency = s.currency then c.spend
        when fx.rate is null         then null
        else round(c.spend * fx.rate, 2)
      end as spend_convertido,
      (c.currency <> s.currency and fx.rate is null) as falta_tasa
    from daily_ad_campaigns c
    join daily_sales s on s.date = c.date
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

-- Productos mas vendidos del periodo, con su participacion en la facturacion.
create or replace function product_totals(desde date, hasta date, tope integer default 20)
returns table (
  product_id     text,
  product_title  text,
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
      product_id,
      max(product_title) as product_title,
      sum(gross_sales)   as gross_sales,
      sum(net_sales)     as net_sales,
      sum(orders)::bigint as orders,
      sum(units)::integer as units
    from daily_products
    where date between desde and hasta
    group by product_id
  ),
  total as (select nullif(sum(gross_sales), 0) as g from p)
  select
    p.product_id, p.product_title, p.gross_sales, p.net_sales, p.orders, p.units,
    case when total.g is null then null
         else round(p.gross_sales / total.g * 100, 2) end as pct_del_total
  from p cross join total
  order by p.gross_sales desc
  limit tope;
$$;

comment on function campaign_totals is
  'Desglose por campana. El gasto se convierte con la tasa del dia de cada fila, igual que daily_metrics.';
comment on function product_totals is
  'Top productos del periodo por facturacion bruta, con su participacion sobre el total.';
