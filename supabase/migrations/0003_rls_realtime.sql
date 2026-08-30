-- 0003_rls_realtime.sql
--
-- Este repo es single-tenant: una instalacion = una tienda. Por eso cualquier
-- usuario autenticado puede leer todo. Lo que NO puede es escribir: los datos
-- de sincronizacion los escribe la skill /sync como service role, que bypassa RLS.
--
-- La unica excepcion es la carga manual del gasto publicitario, que existe para
-- cuando la cuenta de Meta todavia no tiene habilitado el MCP de Ads.

alter table settings           enable row level security;
alter table daily_sales        enable row level security;
alter table daily_traffic      enable row level security;
alter table daily_ad_spend     enable row level security;
alter table daily_ad_campaigns enable row level security;
alter table daily_products     enable row level security;
alter table fx_rates           enable row level security;
alter table sync_log           enable row level security;

-- Lectura para todo usuario logueado, tabla por tabla.
do $$
declare t text;
begin
  foreach t in array array[
    'settings','daily_sales','daily_traffic','daily_ad_spend',
    'daily_ad_campaigns','daily_products','fx_rates','sync_log'
  ] loop
    execute format(
      'create policy "auth lee %1$s" on %1$I for select to authenticated using (true)', t
    );
  end loop;
end $$;

-- Unica escritura permitida desde el browser: el gasto cargado a mano.
-- El check sobre `source` impide que alguien pise datos reales del MCP
-- haciendose pasar por carga manual.
create policy "auth inserta gasto manual"
  on daily_ad_spend for insert to authenticated
  with check (source = 'manual');

create policy "auth edita gasto manual"
  on daily_ad_spend for update to authenticated
  using (source = 'manual')
  with check (source = 'manual');

-- Realtime: cuando /sync escribe, el dashboard abierto se actualiza solo.
alter publication supabase_realtime add table daily_sales;
alter publication supabase_realtime add table daily_ad_spend;
