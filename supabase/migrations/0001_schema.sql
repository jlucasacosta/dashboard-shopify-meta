-- 0001_schema.sql
-- Tablas crudas. Guardan exactamente lo que devuelven Shopify y Meta,
-- sin transformar. Todo calculo derivado vive en 0002_view_metrics.sql.

-- Config por instalacion. Una fila por clave.
create table settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

-- Ventas Shopify, un snapshot por dia.
create table daily_sales (
  date                date primary key,
  orders              integer       not null default 0,
  gross_sales         numeric(14,2) not null default 0,
  discounts           numeric(14,2) not null default 0,
  returns             numeric(14,2) not null default 0,
  net_sales           numeric(14,2) not null default 0,
  shipping            numeric(14,2) not null default 0,
  taxes               numeric(14,2) not null default 0,
  total_sales         numeric(14,2) not null default 0,
  aov                 numeric(14,2),
  customers           integer       not null default 0,
  new_customers       integer       not null default 0,
  returning_customers integer       not null default 0,
  currency            text          not null,
  updated_at          timestamptz   not null default now()
);

-- Trafico Shopify.
create table daily_traffic (
  date                        date primary key,
  sessions                    integer not null default 0,
  visitors                    integer not null default 0,
  sessions_with_cart          integer not null default 0,
  sessions_reached_checkout   integer not null default 0,
  sessions_completed_checkout integer not null default 0,
  conversion_rate             numeric(8,4),
  updated_at                  timestamptz not null default now()
);

-- Gasto Meta a nivel cuenta. `source` distingue lo que vino del MCP
-- de lo que cargo una persona a mano cuando el MCP no esta disponible.
create table daily_ad_spend (
  date           date    not null,
  ad_account_id  text    not null,
  spend          numeric(14,2) not null default 0,
  impressions    bigint  not null default 0,
  clicks         bigint  not null default 0,
  reach          bigint  not null default 0,
  frequency      numeric(8,4),
  ctr            numeric(8,4),
  cpc            numeric(14,4),
  cpm            numeric(14,4),
  meta_purchases integer not null default 0,
  meta_revenue   numeric(14,2) not null default 0,
  currency       text    not null,
  source         text    not null default 'mcp' check (source in ('mcp','manual')),
  updated_at     timestamptz not null default now(),
  primary key (date, ad_account_id)
);

-- Desglose por campana.
create table daily_ad_campaigns (
  date          date not null,
  campaign_id   text not null,
  campaign_name text not null,
  status        text,
  objective     text,
  spend         numeric(14,2) not null default 0,
  impressions   bigint  not null default 0,
  clicks        bigint  not null default 0,
  reach         bigint  not null default 0,
  ctr           numeric(8,4),
  cpc           numeric(14,4),
  cpm           numeric(14,4),
  currency      text not null,
  updated_at    timestamptz not null default now(),
  primary key (date, campaign_id)
);

-- Top productos por dia.
create table daily_products (
  date          date not null,
  product_id    text not null,
  product_title text not null,
  gross_sales   numeric(14,2) not null default 0,
  net_sales     numeric(14,2) not null default 0,
  orders        integer not null default 0,
  units         integer not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (date, product_id)
);

-- Tasas de cambio historicas. Una fila por (dia, par de monedas).
-- Se guarda la tasa del dia, no la de hoy, para que el historico no se distorsione.
create table fx_rates (
  date           date not null,
  base_currency  text not null,
  quote_currency text not null,
  rate           numeric(20,10) not null check (rate > 0),
  fetched_at     timestamptz not null default now(),
  primary key (date, base_currency, quote_currency)
);

-- Auditoria de cada corrida de /sync.
create table sync_log (
  id           bigserial primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  source       text not null check (source in ('shopify','meta','fx')),
  status       text not null check (status in ('ok','error','skipped')),
  rows_written integer not null default 0,
  date_from    date,
  date_to      date,
  error        text
);

create index on daily_ad_campaigns (date);
create index on daily_products (date);
create index on sync_log (started_at desc);
