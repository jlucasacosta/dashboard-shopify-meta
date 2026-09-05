-- Test de daily_sales_total, channel_totals, product_totals y campaign_totals
-- con dos canales de venta.
-- Correr: "corre supabase/tests/multicanal.test.sql en mi proyecto de Supabase".
--
-- Dos cosas se protegen aca, y las dos son formas de mentir con numeros:
--
--   1. Sumar solo los canales que se pudieron convertir de moneda. Eso da un
--      total mas chico que la realidad, con cara de estar completo. Si a un
--      canal le falta la tasa del dia, el total del dia es NULL.
--
--   2. Contar el gasto de ads dos veces. campaign_totals joinea las ventas del
--      dia para saber a que moneda convertir; si joineara daily_sales (dos
--      filas por dia ahora) el gasto de cada campaña se duplicaria. Este test
--      es el que atrapa esa regresion.

begin;

truncate daily_sales, daily_products, daily_ad_campaigns, fx_rates cascade;

-- Dia 1: los dos canales en la misma moneda. Suma directa.
insert into daily_sales
  (date, canal, orders, gross_sales, net_sales, total_sales,
   customers, new_customers, returning_customers, currency)
values
  ('2026-04-01', 'shopify', 10, 1200, 1100, 1000, 8, 5, 3, 'USD'),
  ('2026-04-01', 'meli',     5,  600,  550,  500, 4, 2, 2, 'USD');

-- Dia 2: MeLi factura en otra moneda y SI hay tasa. Se convierte.
insert into daily_sales
  (date, canal, orders, gross_sales, net_sales, total_sales, new_customers, currency)
values
  ('2026-04-02', 'shopify', 10, 1000, 1000, 1000, 5, 'USD'),
  ('2026-04-02', 'meli',     4, 40000, 40000, 40000, 2, 'UYU');
insert into fx_rates (date, base_currency, quote_currency, rate)
values ('2026-04-02', 'UYU', 'USD', 0.025);

-- Dia 3: MeLi en otra moneda y NO hay tasa. El total del dia es desconocido.
insert into daily_sales
  (date, canal, orders, gross_sales, net_sales, total_sales, new_customers, currency)
values
  ('2026-04-03', 'shopify', 10, 1000, 1000, 1000, 5, 'USD'),
  ('2026-04-03', 'meli',     4, 40000, 40000, 40000, 2, 'UYU');

-- Una campaña con gasto en el dia 1, que tiene DOS filas de ventas.
insert into daily_ad_campaigns
  (date, campaign_id, campaign_name, spend, impressions, clicks, currency)
values ('2026-04-01', 'c1', 'Campaña 1', 100, 10000, 200, 'USD');

-- Productos de los dos canales, el mismo dia.
insert into daily_products (date, canal, product_id, product_title, gross_sales, net_sales, orders, units)
values
  ('2026-04-01', 'shopify', 'p-shop', 'Remera',  800, 750, 6, 10),
  ('2026-04-01', 'meli',    'MLU123', 'Buzo',    600, 550, 5,  7);

do $$
declare r record; n integer;
begin
  -- ---------------------------------------------------- daily_sales_total

  select * into r from daily_sales_total where date = '2026-04-01';
  assert r.orders = 15,        format('dia 1 orders: esperaba 15, obtuve %s', r.orders);
  assert r.total_sales = 1500, format('dia 1 total_sales: esperaba 1500, obtuve %s', r.total_sales);
  assert r.gross_sales = 1800, format('dia 1 gross_sales: esperaba 1800, obtuve %s', r.gross_sales);
  assert r.new_customers = 7,  format('dia 1 new_customers: esperaba 7, obtuve %s', r.new_customers);
  assert r.customers = 12,     format('dia 1 customers: esperaba 12, obtuve %s', r.customers);
  assert r.aov = 100,          format('dia 1 aov: esperaba 100 (1500/15), obtuve %s', r.aov);
  assert r.currency = 'USD',   format('dia 1 currency: esperaba USD, obtuve %s', r.currency);
  assert r.canales_sin_tasa = 0, format('dia 1 canales_sin_tasa: esperaba 0, obtuve %s', r.canales_sin_tasa);

  -- 1000 de Shopify + 40000 UYU * 0.025 = 1000 -> 2000
  select * into r from daily_sales_total where date = '2026-04-02';
  assert r.total_sales = 2000,
    format('dia 2 total_sales: esperaba 2000 (1000 + 40000*0.025), obtuve %s', r.total_sales);
  assert r.canales_sin_tasa = 0, format('dia 2 canales_sin_tasa: esperaba 0, obtuve %s', r.canales_sin_tasa);

  -- El corazon del test: sin tasa, el total es desconocido. NO 1000.
  select * into r from daily_sales_total where date = '2026-04-03';
  assert r.total_sales is null,
    format('dia 3 total_sales: esperaba NULL, obtuve %s. Si dice 1000, se esta ignorando el canal sin tasa y el total sale mas chico que la realidad.', r.total_sales);
  assert r.gross_sales is null, format('dia 3 gross_sales: esperaba NULL, obtuve %s', r.gross_sales);
  assert r.aov is null,         format('dia 3 aov: esperaba NULL, obtuve %s', r.aov);
  -- Los conteos no dependen de la moneda: se saben igual.
  assert r.orders = 14,         format('dia 3 orders: esperaba 14, obtuve %s', r.orders);
  assert r.canales_sin_tasa = 1, format('dia 3 canales_sin_tasa: esperaba 1, obtuve %s', r.canales_sin_tasa);

  -- Una fila por dia, no una por canal.
  select count(*) into n from daily_sales_total;
  assert n = 3, format('daily_sales_total: esperaba 3 filas (una por dia), obtuve %s', n);

  -- ------------------------------------------------------- daily_metrics

  -- daily_metrics ahora lee el total, no solo Shopify.
  select * into r from daily_metrics where date = '2026-04-01';
  assert r.total_sales = 1500,
    format('daily_metrics dia 1: esperaba 1500 (los dos canales), obtuve %s', r.total_sales);
  assert r.new_customers = 7,
    format('daily_metrics dia 1 new_customers: esperaba 7, obtuve %s', r.new_customers);

  -- -------------------------------------------------------- campaign_totals

  -- Con dos filas de venta ese dia, el gasto tiene que seguir siendo 100.
  select * into r from campaign_totals('2026-04-01', '2026-04-01');
  assert r.spend = 100,
    format('campaign_totals spend: esperaba 100, obtuve %s. Si dice 200, el join contra las ventas esta duplicando el gasto por canal.', r.spend);
  assert r.clicks = 200, format('campaign_totals clicks: esperaba 200, obtuve %s', r.clicks);

  -- --------------------------------------------------------- channel_totals

  select count(*) into n from channel_totals('2026-04-01', '2026-04-01');
  assert n = 2, format('channel_totals: esperaba 2 canales, obtuve %s', n);

  select * into r from channel_totals('2026-04-01', '2026-04-01') where canal = 'shopify';
  assert r.total_sales = 1000, format('channel_totals shopify: esperaba 1000, obtuve %s', r.total_sales);
  assert r.aov = 100,          format('channel_totals shopify aov: esperaba 100, obtuve %s', r.aov);

  select * into r from channel_totals('2026-04-01', '2026-04-01') where canal = 'meli';
  assert r.total_sales = 500,  format('channel_totals meli: esperaba 500, obtuve %s', r.total_sales);
  assert r.currency = 'UYU' or r.currency = 'USD',
    format('channel_totals meli currency: esperaba la moneda original, obtuve %s', r.currency);

  -- --------------------------------------------------------- product_totals

  -- Sin filtro: los dos canales.
  select count(*) into n from product_totals('2026-04-01', '2026-04-01', 20);
  assert n = 2, format('product_totals sin filtro: esperaba 2 productos, obtuve %s', n);

  -- Con filtro: solo el canal pedido.
  select count(*) into n from product_totals('2026-04-01', '2026-04-01', 20, 'meli');
  assert n = 1, format('product_totals canal meli: esperaba 1 producto, obtuve %s', n);

  select * into r from product_totals('2026-04-01', '2026-04-01', 20, 'meli');
  assert r.product_id = 'MLU123', format('product_totals canal meli: esperaba MLU123, obtuve %s', r.product_id);
  assert r.canal = 'meli',        format('product_totals canal: esperaba meli, obtuve %s', r.canal);
  assert r.pct_del_total = 100,
    format('product_totals pct con filtro: esperaba 100 (es el unico del canal), obtuve %s', r.pct_del_total);

  raise notice 'multicanal: 26/26 aserciones OK';
end $$;

rollback;
