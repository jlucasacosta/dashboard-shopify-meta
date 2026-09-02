-- Test de la vista daily_metrics.
-- Correr pidiendoselo a Claude:  "corre supabase/tests/daily_metrics.test.sql
-- en mi proyecto de Supabase" (lo ejecuta por el MCP, en una sola llamada).
--
-- Todo corre dentro de una transaccion que termina en rollback, asi que
-- no ensucia la base. Si una asercion falla, la consulta corta con error.

begin;

truncate daily_sales, daily_traffic, daily_ad_spend, fx_rates cascade;

-- Caso A: misma moneda. Gasto 100 USD, ventas 1000 USD, 10 clientes nuevos.
insert into daily_sales (date, orders, total_sales, new_customers, currency)
values ('2026-01-01', 20, 1000, 10, 'USD');
insert into daily_ad_spend (date, ad_account_id, spend, currency)
values ('2026-01-01', 'act_1', 100, 'USD');

-- Caso B: monedas distintas CON tasa. 100 USD -> 4000 UYU. Ventas 8000 UYU.
insert into daily_sales (date, orders, total_sales, new_customers, currency)
values ('2026-01-02', 40, 8000, 20, 'UYU');
insert into daily_ad_spend (date, ad_account_id, spend, currency)
values ('2026-01-02', 'act_1', 100, 'USD');
insert into fx_rates (date, base_currency, quote_currency, rate)
values ('2026-01-02', 'USD', 'UYU', 40);

-- Caso C: monedas distintas SIN tasa. Tiene que dar NULL, nunca un numero.
-- Este es el caso que impide mostrar un ROAS inflado 40 veces.
insert into daily_sales (date, orders, total_sales, new_customers, currency)
values ('2026-01-03', 10, 5000, 5, 'UYU');
insert into daily_ad_spend (date, ad_account_id, spend, currency)
values ('2026-01-03', 'act_1', 100, 'USD');

-- Caso D: cero clientes nuevos. CAC NULL, sin error de division por cero.
insert into daily_sales (date, orders, total_sales, new_customers, currency)
values ('2026-01-04', 5, 500, 0, 'USD');
insert into daily_ad_spend (date, ad_account_id, spend, currency)
values ('2026-01-04', 'act_1', 50, 'USD');

-- Caso E: dia sin gasto de ads. Ventas presentes, metricas cruzadas NULL.
insert into daily_sales (date, orders, total_sales, new_customers, currency)
values ('2026-01-05', 3, 300, 2, 'USD');

do $$
declare r record;
begin
  -- A
  select * into r from daily_metrics where date = '2026-01-01';
  assert r.ad_spend = 100, format('A ad_spend: esperaba 100, obtuve %s', r.ad_spend);
  assert r.cac      = 10,  format('A cac: esperaba 10, obtuve %s', r.cac);
  assert r.roas     = 10,  format('A roas: esperaba 10, obtuve %s', r.roas);
  assert r.mer      = 0.1, format('A mer: esperaba 0.1, obtuve %s', r.mer);
  assert r.contribution = 900,
    format('A contribution: esperaba 900, obtuve %s', r.contribution);

  -- B
  select * into r from daily_metrics where date = '2026-01-02';
  assert r.ad_spend = 4000, format('B ad_spend: esperaba 4000, obtuve %s', r.ad_spend);
  assert r.cac      = 200,  format('B cac: esperaba 200, obtuve %s', r.cac);
  assert r.roas     = 2,    format('B roas: esperaba 2, obtuve %s', r.roas);

  -- C
  select * into r from daily_metrics where date = '2026-01-03';
  assert r.ad_spend is null, format('C ad_spend: esperaba NULL, obtuve %s', r.ad_spend);
  assert r.cac      is null, format('C cac: esperaba NULL, obtuve %s', r.cac);
  assert r.roas     is null, format('C roas: esperaba NULL, obtuve %s', r.roas);

  -- D
  select * into r from daily_metrics where date = '2026-01-04';
  assert r.cac  is null, format('D cac: esperaba NULL, obtuve %s', r.cac);
  assert r.roas = 10,    format('D roas: esperaba 10, obtuve %s', r.roas);

  -- E
  select * into r from daily_metrics where date = '2026-01-05';
  assert r.total_sales = 300,
    format('E total_sales: esperaba 300, obtuve %s', r.total_sales);
  assert r.ad_spend is null, format('E ad_spend: esperaba NULL, obtuve %s', r.ad_spend);
  assert r.cac      is null, format('E cac: esperaba NULL, obtuve %s', r.cac);

  raise notice 'daily_metrics: 5/5 casos OK';
end $$;

rollback;
