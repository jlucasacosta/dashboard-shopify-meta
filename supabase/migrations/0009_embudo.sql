-- 0009_embudo.sql
--
-- El embudo de conversion: visitas -> agregados al carrito -> pagos iniciados
-- -> ventas.
--
-- Los cuatro pasos YA estaban en daily_traffic desde la primera migracion. Lo
-- unico que faltaba era sumarlos por periodo y calcular las tasas de un paso al
-- siguiente, que es lo que dice donde se cae la gente.
--
-- Es de Shopify solamente. Mercado Libre expone visitas por item pero no tiene
-- "agregado al carrito" ni "pago iniciado": su checkout es de MeLi, no del
-- vendedor. Mezclar los dos canales en un solo embudo daria un numero falso.
--
-- Igual que period_totals: las tasas se calculan SOBRE LAS SUMAS del periodo,
-- nunca promediando las tasas diarias. Promediar porcentajes le da el mismo
-- peso a un martes de 3 visitas que a un Black Friday de 3.000.

create or replace function funnel_totals(desde date, hasta date)
returns table (
  dias                integer,
  visitantes          bigint,
  visitas             bigint,
  carritos            bigint,
  checkouts_iniciados bigint,
  ventas              bigint,
  tasa_carrito        numeric,
  tasa_checkout       numeric,
  tasa_venta          numeric,
  conversion_total    numeric
)
language sql
stable
security invoker
as $$
  with t as (
    select
      count(*)::integer                        as dias,
      sum(visitors)::bigint                    as visitantes,
      sum(sessions)::bigint                    as visitas,
      sum(sessions_with_cart)::bigint          as carritos,
      sum(sessions_reached_checkout)::bigint   as checkouts_iniciados,
      sum(sessions_completed_checkout)::bigint as ventas
    from daily_traffic
    where date between desde and hasta
  )
  select
    dias, visitantes, visitas, carritos, checkouts_iniciados, ventas,
    -- Cada tasa es NULL si su denominador es 0. Dividir por cero no es 0%:
    -- es "no se puede saber", y el panel lo muestra como "—".
    case when coalesce(visitas, 0) = 0 then null
         else round(carritos::numeric / visitas * 100, 2) end            as tasa_carrito,
    case when coalesce(carritos, 0) = 0 then null
         else round(checkouts_iniciados::numeric / carritos * 100, 2) end as tasa_checkout,
    case when coalesce(checkouts_iniciados, 0) = 0 then null
         else round(ventas::numeric / checkouts_iniciados * 100, 2) end   as tasa_venta,
    case when coalesce(visitas, 0) = 0 then null
         else round(ventas::numeric / visitas * 100, 2) end               as conversion_total
  from t;
$$;

comment on function funnel_totals is
  'Embudo de Shopify para un periodo. Las tasas se calculan sobre las sumas, nunca promediando tasas diarias.';
