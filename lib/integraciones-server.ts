// Lecturas que necesitan la service key. Vive aparte de queries.ts a proposito.
//
// `queries.ts` es el archivo de lecturas del panel: usa el cliente de servidor
// con la sesion de la persona, asi que todo lo que pide pasa por las policies.
// Dos componentes de graficos importan tipos de ahi. Hoy son `import type` y se
// borran al compilar, pero si `queries.ts` importara el cliente admin, alcanzaria
// con que alguien sacara la palabra `type` para arrastrar la service key al
// bundle del navegador.
//
// Por eso lo privilegiado vive en este archivo, que nadie del lado del cliente
// tiene motivo para tocar, y que ademas es `server-only`: importarlo desde un
// componente 'use client' rompe el build.

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FilaConexion } from '@/lib/integraciones'

/**
 * Las conexiones de OAuth, para la pantalla de Configuracion.
 *
 * Usa el cliente admin porque `conexiones` no tiene NINGUNA policy: es la tabla
 * que guarda los tokens y solo la ve la service key.
 *
 * Las columnas van enumeradas a mano y NO hay `select('*')`. Un asterisco aca
 * mandaria `access_token` y `refresh_token` al HTML que recibe el navegador, y
 * el panel entero dejaria de tener sentido. Si algun dia hace falta un campo
 * nuevo, se agrega por nombre despues de mirar que no sea un secreto.
 */
export async function getConexiones(): Promise<Record<string, FilaConexion>> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('conexiones')
    .select('fuente, cuenta_id, expires_at, ultimo_error')

  const porFuente: Record<string, FilaConexion> = {}
  for (const fila of data ?? []) {
    porFuente[fila.fuente] = {
      cuenta_id: fila.cuenta_id,
      expires_at: fila.expires_at,
      ultimo_error: fila.ultimo_error,
    }
  }
  return porFuente
}
