-- El panel pasa a ser de solo lectura.
--
-- Se saco la pantalla de Gasto manual: los datos entran unicamente por /sync,
-- a traves de los MCP. Con esa pantalla se van las dos unicas policies que
-- permitian escribir desde el navegador.
--
-- No es limpieza cosmetica. Mientras esas policies existan, cualquiera con una
-- sesion valida puede escribir en daily_ad_spend desde la consola del browser,
-- aunque en la interfaz no haya ningun formulario. Una superficie de escritura
-- que nadie usa es una superficie de escritura que nadie mira.
--
-- Despues de esto, todas las tablas quedan con policies de select y ninguna de
-- insert o update: el unico que escribe es el MCP de Supabase, que va con la
-- service key y se saltea RLS por diseno.

drop policy if exists "auth inserta gasto manual" on daily_ad_spend;
drop policy if exists "auth edita gasto manual"   on daily_ad_spend;

-- La columna `source` se queda. Sigue diciendo de donde vino cada fila, la
-- vista daily_metrics la expone como ad_source, y el check ('mcp','manual')
-- no molesta: simplemente ya nadie escribe 'manual'. Si algun dia vuelve una
-- carga a mano, alcanza con volver a crear las policies de arriba.
comment on column daily_ad_spend.source is
  'De donde vino la fila. Hoy siempre mcp: la carga manual se saco del panel.';
