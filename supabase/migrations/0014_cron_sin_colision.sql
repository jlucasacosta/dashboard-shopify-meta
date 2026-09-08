-- Los cuatro trabajos dejan de arrancar en el mismo instante.
--
-- El problema: `sync-hoy` estaba en `*/5` y `sync-backfill` en `*/10`. Esos dos
-- patrones coinciden EXACTAMENTE cada diez minutos —a las :00, :10, :20— y no
-- de casualidad: */10 es un subconjunto de */5. `sync-diario` a las `0 4` caia
-- encima de los dos.
--
-- Como se ve cuando pasa: los dos jobs escriben `daily_sales` a la vez, uno con
-- un lote grande de backfill, y PostgREST corta el otro con 504. En sync_log
-- queda "daily_sales: Gateway Timeout", que parece un problema de red y es una
-- colision nuestra.
--
-- Verificado en una instalacion real: cron.job_run_details mostro `sync-hoy` a
-- las 23:00:00.233 y `sync-backfill` a las 23:00:00.231. Dos milisegundos.
--
-- No es fatal —el sync es idempotente y la pasada siguiente arregla el dia— pero
-- durante la primera hora, que es cuando corre el backfill, una de cada dos
-- pasadas de `sync-hoy` fallaba. Alguien recien instalando ve el panel tirando
-- errores justo cuando mira si funciono.
--
-- El arreglo son minutos primos entre si: 0/5 para hoy, 3-59/10 para backfill
-- (3, 13, 23...), 17 para reciente, y 04:07 para el diario. Ningun par vuelve a
-- coincidir.

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
  -- porque el gasto del dia anterior recien ahi esta cerrado. El minuto 7 y no
  -- el 0: a las 04:00 en punto tambien corre sync-hoy.
  perform cron.schedule('sync-diario', '7 4 * * *', $cmd$select disparar_sync('diario')$cmd$);

  -- Historico, de a un lote por corrida. Se apaga solo cuando termina.
  -- Minutos 3, 13, 23...: nunca cae en un multiplo de 5, que es cuando corre
  -- sync-hoy. Los lotes del backfill son grandes y bloquean daily_sales.
  perform cron.schedule('sync-backfill', '3-59/10 * * * *', $cmd$select disparar_sync('backfill')$cmd$);

  return query
    select unnest(array['sync-hoy','sync-reciente','sync-diario','sync-backfill']),
           unnest(array['cada 5 min','cada hora','1 vez por dia (04:07 UTC)','cada 10 min hasta terminar']);
end;
$$;

comment on function programar_sync is
  'Agenda los cuatro trabajos en pg_cron, con minutos que no se pisan entre si. Llamar despues de cargar app_url y cron_secret.';
