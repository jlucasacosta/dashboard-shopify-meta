-- Test de period_totals(desde, hasta).
-- Correr con:  npm run db:test
--
-- Lo que se protege aca: agregar un periodo NO es promediar los valores
-- diarios. El CAC del mes es (todo lo gastado) / (todos los clientes nuevos),
-- no el promedio de los CAC de cada dia. Los dos numeros son distintos y el
-- segundo esta mal.

begin;

truncate daily_sales, daily_traffic, daily_ad_spend, fx_rates cascade;

-- Dos dias armados a proposito para que promedio y agregado NO coincidan.
--   Dia 1: gasto 100, 10 clientes nuevos -> CAC diario 10
--   Dia 2: gasto 100, 1  cliente  nuevo  -> CAC diario 100
--   Promedio de los CAC diarios = 55      <- INCORRECTO
--   Agregado 200/11                       = 18.18  <- CORRECTO
insert into daily_sales (date, orders, total_sales, new_customers, returning_customers, currency)
values ('2026-03-01', 10, 1000, 10, 0, 'USD'),
       ('2026-03-02',  5,  500,  1, 4, 'USD');
insert into daily_ad_spend (date, ad_account_id, spend, impressions, clicks, currency)
values ('2026-03-01', 'act_1', 100, 10000, 200, 'USD'),
       ('2026-03-02', 'act_1', 100, 10000, 100, 'USD');
insert into daily_traffic (date, sessions, sessions_completed_checkout)
values ('2026-03-01', 1000, 10),
       ('2026-03-02',  500,  5);

-- Un tercer dia SIN tasa de cambio: el gasto no se puede convertir.
insert into daily_sales (date, orders, total_sales, new_customers, currency)
values ('2026-03-03', 4, 400, 4, 'UYU');
insert into daily_ad_spend (date, ad_account_id, spend, currency)
values ('2026-03-03', 'act_1', 50, 'USD');

do $$
declare r record;
begin
  -- Periodo de 2 dias, ambos con datos completos.
  select * into r from period_totals('2026-03-01', '2026-03-02');

  assert r.dias = 2,                format('dias: esperaba 2, obtuve %s', r.dias);
  assert r.orders = 15,             format('orders: esperaba 15, obtuve %s', r.orders);
  assert r.total_sales = 1500,      format('total_sales: esperaba 1500, obtuve %s', r.total_sales);
  assert r.ad_spend = 200,          format('ad_spend: esperaba 200, obtuve %s', r.ad_spend);
  assert r.new_customers = 11,      format('new_customers: esperaba 11, obtuve %s', r.new_customers);

  -- El corazon del test: 18.18, no 55.
  assert r.cac = 18.18,
    format('cac: esperaba 18.18 (agregado), obtuve %s. Si dice 55, se esta promediando el CAC diario.', r.cac);

  assert r.roas = 7.5,              format('roas: esperaba 7.5, obtuve %s', r.roas);
  assert r.aov = 100,               format('aov: esperaba 100 (1500/15), obtuve %s', r.aov);
  assert r.mer = 0.1333,            format('mer: esperaba 0.1333, obtuve %s', r.mer);
  assert r.contribution = 1300,     format('contribution: esperaba 1300, obtuve %s', r.contribution);

  -- CTR agregado = total clics / total impresiones, no promedio de CTRs.
  assert r.ctr = 1.5,               format('ctr: esperaba 1.5 (300/20000), obtuve %s', r.ctr);
  assert r.cpc = 0.6667,            format('cpc: esperaba 0.6667 (200/300), obtuve %s', r.cpc);

  -- Conversion agregada = checkouts completados / sesiones.
  assert r.conversion_rate = 1,     format('conversion_rate: esperaba 1 (15/1500), obtuve %s', r.conversion_rate);

  -- Un rango sin datos no explota: devuelve una fila con ceros y NULLs.
  select * into r from period_totals('2020-01-01', '2020-01-31');
  assert r.dias = 0,        format('rango vacio dias: esperaba 0, obtuve %s', r.dias);
  assert r.cac is null,     format('rango vacio cac: esperaba NULL, obtuve %s', r.cac);
  assert r.roas is null,    format('rango vacio roas: esperaba NULL, obtuve %s', r.roas);

  -- Un dia sin tasa de cambio se reporta, no se esconde. Sin esto, el total
  -- de inversion aparece mas bajo de lo real y nadie se entera.
  select * into r from period_totals('2026-03-01', '2026-03-03');
  assert r.dias_sin_tasa = 1,
    format('dias_sin_tasa: esperaba 1, obtuve %s', r.dias_sin_tasa);
  assert r.ad_spend = 200,
    format('ad_spend con un dia sin tasa: esperaba 200 (el dia sin tasa no suma), obtuve %s', r.ad_spend);

  raise notice 'period_totals: 16/16 aserciones OK';
end $$;

rollback;
