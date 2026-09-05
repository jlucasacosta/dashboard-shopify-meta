-- 0012_permisos_funciones.sql
--
-- Cierra dos cosas que dejo abiertas 0011, y que el linter de Supabase marco.
--
-- 1. LAS FUNCIONES DEL CRON ERAN LLAMABLES DESDE EL NAVEGADOR.
--
--    En Postgres, una funcion nueva queda con EXECUTE otorgado a PUBLIC por
--    defecto. Como `anon` y `authenticated` heredan de PUBLIC, y PostgREST
--    expone todo lo que esta en el schema `public`, cualquiera con la anon key
--    -- que viaja en el bundle del navegador, o sea, es publica -- podia hacer:
--
--      POST /rest/v1/rpc/apagar_sync      -> te apaga la sincronizacion
--      POST /rest/v1/rpc/disparar_sync    -> te martilla el endpoint del cron
--
--    Y son `security definer`, asi que corrian con permisos del dueño. El
--    secreto del cron nunca se filtraba (esta en config_servidor, que no tiene
--    policies), pero apagarle el sync a alguien sin que se entere es
--    exactamente la clase de falla silenciosa que este repo trata de no tener.
--
-- 2. search_path mutable en las funciones de metricas. Con el search_path
--    abierto, alguien que pueda crear objetos en un schema anterior de la ruta
--    puede secuestrar a que tabla resuelve un nombre. Fijarlo lo cierra.

-- ----------------------------------------- Funciones del cron: solo servidor

revoke all on function public.disparar_sync(text)  from public, anon, authenticated;
revoke all on function public.programar_sync()     from public, anon, authenticated;
revoke all on function public.apagar_sync()        from public, anon, authenticated;

-- Quien las necesita: el propio cron (corre como el dueño de la base) y la
-- service key, por si alguna vez se programa el sync desde un script.
grant execute on function public.disparar_sync(text) to postgres, service_role;
grant execute on function public.programar_sync()    to postgres, service_role;
grant execute on function public.apagar_sync()       to postgres, service_role;

-- ------------------------------------------------- search_path fijo

-- Estas cuatro son `security invoker` y solo leen, asi que el riesgo es menor
-- que en las de arriba. Se fija igual: es una linea y saca una advertencia
-- legitima de encima.
alter function public.funnel_totals(date, date)                    set search_path = public;
alter function public.channel_totals(date, date)                   set search_path = public;
alter function public.campaign_totals(date, date)                  set search_path = public;
alter function public.product_totals(date, date, integer, text)    set search_path = public;

-- period_totals viene de 0004 y tiene la misma advertencia. Se arregla aca en
-- vez de editar una migracion ya aplicada.
alter function public.period_totals(date, date)                    set search_path = public;
