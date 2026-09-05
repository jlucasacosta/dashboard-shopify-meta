-- 0011_cron.sql
--
-- El reloj del sistema. Es lo que reemplaza a la persona escribiendo /sync.
--
-- POR QUE ACA Y NO EN VERCEL: el plan Hobby de Vercel permite cron una sola vez
-- por dia, y ni siquiera a una hora exacta (garantiza dentro de la hora). Un
-- panel que se actualiza "cada 5 minutos" no entra ahi. pg_cron corre cada
-- minuto, es gratis, y vive al lado de los datos. Efecto secundario util: un
-- proyecto free de Supabase se pausa por inactividad, y esto lo mantiene
-- despierto.
--
-- Postgres no ejecuta la sincronizacion: solo golpea una URL. Toda la logica
-- sigue en TypeScript, en el repo, donde se puede leer y testear.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ------------------------------------------------------------- El disparador

-- Lee la URL y el secreto de config_servidor EN CADA CORRIDA, no cuando se
-- agenda. Asi rotar el secreto no obliga a reprogramar los jobs.
--
-- security definer porque config_servidor tiene RLS sin policies: nadie la lee,
-- ni siquiera esta funcion, salvo que corra como su dueño.
create or replace function disparar_sync(job text)
returns bigint
language plpgsql
security definer
set search_path = public, net
as $$
declare
  url     text;
  secreto text;
  req_id  bigint;
begin
  select value into url     from config_servidor where key = 'app_url';
  select value into secreto from config_servidor where key = 'cron_secret';

  if url is null or secreto is null then
    raise notice 'sync no disparado: falta app_url o cron_secret en config_servidor';
    return null;
  end if;

  select net.http_post(
    url     := rtrim(url, '/') || '/api/cron/sync?job=' || job,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', secreto
               ),
    body    := '{}'::jsonb,
    -- Un poco menos que el maximo de una funcion de Vercel, para que el timeout
    -- lo corte del lado nuestro y quede registrado.
    timeout_milliseconds := 55000
  ) into req_id;

  return req_id;
end;
$$;

comment on function disparar_sync is
  'Golpea /api/cron/sync?job=... con el secreto. No sincroniza nada por si misma: la logica esta en el repo.';

-- ------------------------------------------------------------ Programacion

-- Se llama a mano una vez, despues de cargar app_url y cron_secret. No se
-- agenda solo al aplicar la migracion porque sin esos dos valores los jobs
-- correrian en vano cada 5 minutos.
create or replace function programar_sync()
returns table (job text, cadencia text)
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  j record;
begin
  if not exists (select 1 from config_servidor where key = 'app_url')
     or not exists (select 1 from config_servidor where key = 'cron_secret') then
    raise exception
      'Faltan app_url y/o cron_secret en config_servidor. Cargalos antes de programar el sync.';
  end if;

  -- Borrar los que ya estan, para que llamar dos veces no duplique jobs.
  for j in
    select jobname from cron.job
    where jobname in ('sync-hoy', 'sync-reciente', 'sync-diario', 'sync-backfill')
  loop
    perform cron.unschedule(j.jobname);
  end loop;

  -- Ventas del dia en curso. Es lo que hace que el panel se sienta en vivo.
  perform cron.schedule('sync-hoy', '*/5 * * * *', $cmd$select disparar_sync('hoy')$cmd$);

  -- Ultimos dias: un pedido puede cambiar (reembolso, cancelacion) despues de
  -- cerrado el dia, y el webhook de ese cambio se puede haber perdido.
  perform cron.schedule('sync-reciente', '17 * * * *', $cmd$select disparar_sync('reciente')$cmd$);

  -- Meta, tipo de cambio y una pasada larga de reconciliacion. De madrugada
  -- porque el gasto del dia anterior recien ahi esta cerrado.
  perform cron.schedule('sync-diario', '0 4 * * *', $cmd$select disparar_sync('diario')$cmd$);

  -- Historico, de a un lote por corrida. Se apaga solo cuando termina.
  perform cron.schedule('sync-backfill', '*/10 * * * *', $cmd$select disparar_sync('backfill')$cmd$);

  return query
    select unnest(array['sync-hoy','sync-reciente','sync-diario','sync-backfill']),
           unnest(array['cada 5 min','cada hora','1 vez por dia (04:00 UTC)','cada 10 min hasta terminar']);
end;
$$;

comment on function programar_sync is
  'Agenda los 4 jobs. Llamar despues de cargar app_url y cron_secret. Es idempotente: borra y reagenda.';

-- Apaga todo. Util para depurar sin que el cron te pise los datos.
create or replace function apagar_sync()
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  j record;
begin
  for j in
    select jobname from cron.job
    where jobname in ('sync-hoy', 'sync-reciente', 'sync-diario', 'sync-backfill')
  loop
    perform cron.unschedule(j.jobname);
  end loop;
end;
$$;

comment on function apagar_sync is
  'Desagenda los 4 jobs. El sync deja de correr hasta que se llame programar_sync() de nuevo.';
