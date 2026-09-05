-- Test de funnel_totals(desde, hasta).
-- Correr pidiendoselo a Claude: "corre supabase/tests/funnel_totals.test.sql
-- en mi proyecto de Supabase" (lo ejecuta por el MCP, en una sola llamada).
--
-- Lo que se protege aca es lo mismo que en period_totals: una tasa de un
-- periodo NO es el promedio de las tasas diarias. Promediar porcentajes le da
-- el mismo peso a un martes de 10 visitas que a un Black Friday de 1.000.

begin;

truncate daily_traffic cascade;

-- Dos dias armados a proposito para que promedio y agregado NO coincidan.
--   Dia 1: 1000 visitas, 100 carritos -> 10% de agregado al carrito
--   Dia 2:   10 visitas,   5 carritos -> 50%
--   Promedio de las tasas diarias = 30%     <- INCORRECTO
--   Agregado 105/1010             = 10.40%  <- CORRECTO
insert into daily_traffic
  (date, sessions, visitors, sessions_with_cart,
   sessions_reached_checkout, sessions_completed_checkout)
values
  ('2026-04-01', 1000, 900, 100, 50, 10),
  ('2026-04-02',   10,   8,   5,  4,  2);

-- Un dia sin trafico: sirve para probar que dividir por cero no devuelve 0%.
insert into daily_traffic
  (date, sessions, visitors, sessions_with_cart,
   sessions_reached_checkout, sessions_completed_checkout)
values ('2026-05-01', 0, 0, 0, 0, 0);

do $$
declare r record;
begin
  select * into r from funnel_totals('2026-04-01', '2026-04-02');

  assert r.dias = 2,                 format('dias: esperaba 2, obtuve %s', r.dias);
  assert r.visitantes = 908,         format('visitantes: esperaba 908, obtuve %s', r.visitantes);
  assert r.visitas = 1010,           format('visitas: esperaba 1010, obtuve %s', r.visitas);
  assert r.carritos = 105,           format('carritos: esperaba 105, obtuve %s', r.carritos);
  assert r.checkouts_iniciados = 54, format('checkouts: esperaba 54, obtuve %s', r.checkouts_iniciados);
  assert r.ventas = 12,              format('ventas: esperaba 12, obtuve %s', r.ventas);

  -- El corazon del test: 10.40, no 30.
  assert r.tasa_carrito = 10.40,
    format('tasa_carrito: esperaba 10.40 (105/1010), obtuve %s. Si dice 30, se estan promediando las tasas diarias.', r.tasa_carrito);

  assert r.tasa_checkout = 51.43,
    format('tasa_checkout: esperaba 51.43 (54/105), obtuve %s', r.tasa_checkout);
  assert r.tasa_venta = 22.22,
    format('tasa_venta: esperaba 22.22 (12/54), obtuve %s', r.tasa_venta);
  assert r.conversion_total = 1.19,
    format('conversion_total: esperaba 1.19 (12/1010), obtuve %s', r.conversion_total);

  -- Sin visitas no hay tasa. Cero visitas y cero carritos no es "0% de
  -- conversion": es que no se puede saber. El panel muestra "—".
  select * into r from funnel_totals('2026-05-01', '2026-05-01');
  assert r.dias = 1,                   format('dia sin trafico dias: esperaba 1, obtuve %s', r.dias);
  assert r.visitas = 0,                format('dia sin trafico visitas: esperaba 0, obtuve %s', r.visitas);
  assert r.tasa_carrito is null,       format('dia sin trafico tasa_carrito: esperaba NULL, obtuve %s', r.tasa_carrito);
  assert r.tasa_checkout is null,      format('dia sin trafico tasa_checkout: esperaba NULL, obtuve %s', r.tasa_checkout);
  assert r.tasa_venta is null,         format('dia sin trafico tasa_venta: esperaba NULL, obtuve %s', r.tasa_venta);
  assert r.conversion_total is null,   format('dia sin trafico conversion_total: esperaba NULL, obtuve %s', r.conversion_total);

  -- Un rango vacio no explota.
  select * into r from funnel_totals('2020-01-01', '2020-01-31');
  assert r.dias = 0,                 format('rango vacio dias: esperaba 0, obtuve %s', r.dias);
  assert r.tasa_carrito is null,     format('rango vacio tasa_carrito: esperaba NULL, obtuve %s', r.tasa_carrito);

  raise notice 'funnel_totals: 16/16 aserciones OK';
end $$;

rollback;
