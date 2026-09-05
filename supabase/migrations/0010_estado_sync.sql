-- 0010_estado_sync.sql
--
-- Lo que el motor de sincronizacion necesita recordar entre corridas.
--
-- REGLA DE SEGURIDAD DE ESTA MIGRACION: las tres tablas que guardan secretos o
-- datos de personas (config_servidor, conexiones, meli_compradores) quedan con
-- RLS activo y SIN NINGUNA POLICY. Eso significa que nadie las lee desde el
-- navegador: ni con la anon key, ni logueado. Solo las ve la service key, que
-- bypassa RLS y vive unicamente en el servidor.
--
-- Si alguna vez le agregas una policy de select a esas tablas, estas publicando
-- el token de Mercado Libre y el secreto del cron a cualquiera que abra el
-- panel. No lo hagas.

-- ------------------------------------------------------- Config del servidor

-- Va aparte de `settings` a proposito: `settings` tiene policy de lectura para
-- usuarios autenticados (el panel lee de ahi la moneda de la tienda). Meter el
-- secreto del cron ahi seria dejarlo a la vista.
create table config_servidor (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

comment on table config_servidor is
  'Config que el navegador NUNCA debe ver: app_url y cron_secret. Sin policies, a proposito.';

alter table config_servidor enable row level security;

-- --------------------------------------------------------------- Conexiones

-- Tokens de OAuth. Hoy solo Mercado Libre: Shopify y Meta usan tokens fijos
-- que viven en variables de entorno y no rotan.
create table conexiones (
  fuente          text primary key check (fuente in ('meli')),
  access_token    text        not null,
  refresh_token   text        not null,
  expires_at      timestamptz not null,
  cuenta_id       text        not null,
  -- Lock por arrendamiento. Ver el comentario largo de abajo.
  bloqueado_hasta timestamptz,
  -- Si el refresh se rompe, el panel tiene que poder avisarlo en vez de fallar
  -- en silencio y mostrar ventas viejas como si fueran de hoy.
  ultimo_error    text,
  actualizado_at  timestamptz not null default now()
);

comment on table conexiones is
  'Tokens de OAuth. Sin policies: solo la service key. El refresh de MeLi es de un solo uso, ver bloqueado_hasta.';

comment on column conexiones.bloqueado_hasta is
  'Arrendamiento del refresh. El refresh_token de Mercado Libre es de UN SOLO USO y rota en cada uso: si dos procesos refrescan a la vez, el segundo usa uno ya quemado y la conexion muere. Quien va a refrescar toma el arrendamiento con un UPDATE condicional; el que no lo consigue espera y relee.';

alter table conexiones enable row level security;

-- ------------------------------------------------------ Compradores de MeLi

-- Mercado Libre no marca "cliente nuevo" en la orden, asi que lo deducimos:
-- si el buyer_id nunca aparecio antes, es nuevo.
--
-- Por que importa: si escribieramos 0 clientes nuevos para MeLi, el CAC saldria
-- inflado (menos denominador) y nadie se enteraria. Un numero equivocado no
-- falla nunca y miente siempre.
create table meli_compradores (
  buyer_id       text primary key,
  primera_compra date not null
);

comment on table meli_compradores is
  'Primera compra de cada comprador de MeLi, para distinguir nuevos de recurrentes. Sin policies: son datos de personas.';

alter table meli_compradores enable row level security;

-- ------------------------------------------------------------ Estado del sync

-- Hasta donde llego cada fuente. El backfill avanza su cursor de a un lote por
-- corrida, asi ninguna invocacion se pasa del limite de tiempo de Vercel.
create table sync_state (
  fuente         text primary key
                 check (fuente in ('shopify', 'meta', 'fx', 'meli', 'backfill')),
  cursor_desde   date,
  cursor_hasta   date,
  ultimo_ok      timestamptz,
  completo       boolean not null default false,
  actualizado_at timestamptz not null default now()
);

comment on table sync_state is
  'Hasta donde llego cada fuente. `completo` marca el backfill terminado para que deje de correr.';

alter table sync_state enable row level security;

-- Esta no tiene secretos: el panel puede mostrar el progreso del backfill.
create policy "auth lee sync_state"
  on sync_state for select to authenticated using (true);

-- ------------------------------------------------------------- Dias sucios

-- El webhook de Shopify no trae datos: solo avisa que algo cambio. Marca el dia
-- aca y el proximo tick del cron lo resincroniza desde ShopifyQL.
--
-- Es una tabla y no un array en sync_state porque varios webhooks pueden llegar
-- a la vez: `insert ... on conflict do nothing` es atomico, actualizar un array
-- no lo es y se pierden marcas.
create table dias_sucios (
  date       date not null,
  canal      text not null check (canal in ('shopify', 'meli')),
  marcado_at timestamptz not null default now(),
  primary key (date, canal)
);

comment on table dias_sucios is
  'Dias que un webhook marco como desactualizados. El cron los resincroniza y los borra. Marcar dos veces el mismo dia es inofensivo.';

alter table dias_sucios enable row level security;

create policy "auth lee dias_sucios"
  on dias_sucios for select to authenticated using (true);

create index dias_sucios_marcado_idx on dias_sucios (marcado_at);
