-- 0013_conexion_shopify.sql
--
-- Shopify tambien guarda su token en `conexiones`.
--
-- POR QUE: Shopify cerro las apps personalizadas que se creaban desde el admin
-- y entregaban un token fijo. Las apps nuevas (Dev Dashboard) solo dan un
-- Client ID y un Client secret; el token se pide por codigo (client credentials
-- grant) y dura 24 horas. El panel lo pide solo y lo guarda aca para no pedir
-- uno nuevo en cada corrida del cron.
--
-- Sigue sin policies: solo la service key lo ve. Ver la regla de 0010.

alter table conexiones drop constraint conexiones_fuente_check;
alter table conexiones
  add constraint conexiones_fuente_check check (fuente in ('meli', 'shopify'));

-- El grant de Shopify no entrega refresh token: se vuelve a pedir con ID y
-- secreto. La columna queda obligatoria para MeLi; Shopify guarda vacio.
alter table conexiones alter column refresh_token set default '';

comment on table conexiones is
  'Tokens de OAuth: meli (refresh de un solo uso, ver bloqueado_hasta) y shopify (client credentials, 24 h, sin refresh). Sin policies: solo la service key.';
