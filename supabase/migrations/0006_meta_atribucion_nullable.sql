-- 0006_meta_atribucion_nullable.sql
--
-- meta_purchases y meta_revenue son lo que Meta se auto-atribuye. El dashboard
-- no los usa para nada: la verdad de ventas y clientes sale siempre de Shopify.
-- Estan para poder comparar la brecha de atribucion si algun dia hace falta.
--
-- Estaban como `not null default 0`, y eso choca con la regla de toda la base:
-- si la sincronizacion no los trae, quedaba un cero que se lee como "Meta no
-- atribuyo ninguna compra" cuando en realidad es "no lo preguntamos".
-- Ahora quedan en NULL, que es lo que realmente son.

alter table daily_ad_spend
  alter column meta_purchases drop not null,
  alter column meta_purchases drop default,
  alter column meta_revenue   drop not null,
  alter column meta_revenue   drop default;

comment on column daily_ad_spend.meta_purchases is
  'Compras que Meta se auto-atribuye. Opcional, solo para comparar atribucion. NULL = no se consulto.';
comment on column daily_ad_spend.meta_revenue is
  'Facturacion que Meta se auto-atribuye. Opcional. La verdad de ventas sale de Shopify.';
