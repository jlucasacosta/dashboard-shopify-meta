-- Dos ventanas para que el verificador pueda ver lo que hoy no ve.
--
-- El problema: `npm run verificar` sigue el camino de un dato real, pero las
-- dos cosas mas importantes de ese camino viven en schemas que PostgREST no
-- expone: la respuesta del panel esta en `net._http_response` y los relojes en
-- `cron.job`. Desde un script con la service key no se pueden leer, asi que el
-- verificador tenia dos puntos ciegos justo donde aparecieron los dos peores
-- bugs de la primera instalacion: el 401 del cron_secret y dos jobs arrancando
-- en el mismo milisegundo.
--
-- Son de solo lectura y devuelven lo minimo. `respuesta_sync` recorta el cuerpo
-- a 500 caracteres: alcanza para el mensaje de error y no convierte esto en una
-- forma de leer respuestas enteras.
--
-- Los permisos siguen la regla de 0012: nada de esto es llamable desde el
-- navegador. Solo la service key, que ya puede ver todo.

-- --------------------------------------------- Respuesta de un pedido del cron

create or replace function respuesta_sync(pedido bigint)
returns table (status_code integer, cuerpo text)
language sql
security definer
set search_path = public, net
as $$
  select r.status_code, left(r.content, 500)
  from net._http_response r
  where r.id = pedido;
$$;

comment on function respuesta_sync is
  'Que contesto el panel a un pedido de disparar_sync(). Para verificar la instalacion sin exponer el schema net.';

-- ------------------------------------------------------- Estado de los relojes

create or replace function estado_relojes()
returns table (nombre text, cadencia text, activo boolean)
language sql
security definer
set search_path = public, cron
as $$
  select j.jobname::text, j.schedule::text, j.active
  from cron.job j
  where j.jobname like 'sync-%'
  order by j.jobname;
$$;

comment on function estado_relojes is
  'Los trabajos de pg_cron del panel. Existe para que el verificador pueda detectar dos relojes que arrancan en el mismo minuto, que es una falla que se disfraza de problema de red.';

-- ------------------------------------------------------------------ Permisos

revoke all on function public.respuesta_sync(bigint) from public, anon, authenticated;
revoke all on function public.estado_relojes()       from public, anon, authenticated;

grant execute on function public.respuesta_sync(bigint) to postgres, service_role;
grant execute on function public.estado_relojes()       to postgres, service_role;
