// Estado de cada integracion, para la pantalla de Configuracion.
//
// Logica pura, sin Supabase: se testea sola y no depende de que haya base.
// Quien lee la tabla es `getConexiones` en queries.ts, del lado del servidor.
//
// LO QUE NO SALE DE ACA: la tabla `conexiones` guarda `access_token` y
// `refresh_token`. Esta funcion es la frontera entre esa tabla y el HTML, asi
// que devuelve un objeto con campos explicitos y jamas la fila entera. Hay un
// test que fija exactamente que claves salen.

/** Lo unico que se lee de `conexiones`. Nunca los tokens. */
export type FilaConexion = {
  cuenta_id: string
  expires_at: string
  ultimo_error: string | null
}

export type EstadoConexion = 'sin-conectar' | 'conectada' | 'vencida' | 'con-error'

export type ResumenConexion = {
  estado: EstadoConexion
  cuentaId: string | null
  /** El error tal como lo guardo el sync. Null si no hubo. */
  detalle: string | null
  /** Cuando vence el permiso actual, para mostrarlo. Null si no hay conexion. */
  expiraEn: string | null
}

/**
 * En que estado esta una conexion de OAuth.
 *
 * El orden de las preguntas importa. Un `ultimo_error` gana sobre la fecha de
 * vencimiento: cuando Mercado Libre invalida el permiso, el access_token puede
 * seguir vigente por fecha y no servir para nada. Mostrar "conectada" ahi seria
 * el mismo tipo de mentira que un cero falso.
 */
export function estadoDeConexion(
  fila: FilaConexion | null,
  ahora = new Date(),
): ResumenConexion {
  if (!fila) {
    return { estado: 'sin-conectar', cuentaId: null, detalle: null, expiraEn: null }
  }

  const base = {
    cuentaId: fila.cuenta_id,
    detalle: fila.ultimo_error,
    expiraEn: fila.expires_at,
  }

  if (fila.ultimo_error) return { estado: 'con-error', ...base }

  const vence = new Date(fila.expires_at).getTime()
  if (Number.isNaN(vence) || vence <= ahora.getTime()) {
    return { estado: 'vencida', ...base }
  }

  return { estado: 'conectada', ...base }
}

export type EstadoVariables = 'sin-configurar' | 'configurada'

/**
 * Si las variables de entorno de un servicio estan puestas.
 *
 * Se calcula en el servidor con las funciones de lib/sync/config.ts, que ya
 * saben cuales son obligatorias para cada fuente. Aca solo se traduce a algo
 * que la pantalla pueda mostrar, sin que ningun valor cruce al navegador.
 */
export function estadoDeVariables(hayConfig: boolean): EstadoVariables {
  return hayConfig ? 'configurada' : 'sin-configurar'
}
