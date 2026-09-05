// Persistencia de la conexion con Mercado Libre, con el lock que evita
// matarla.
//
// EL PROBLEMA, textual de la doc de MeLi:
//
//   "The REFRESH_TOKEN can only be used once and only by the client_id it is
//    associated with, after being used it will become invalid."
//
// O sea: cada refresh quema el token anterior y devuelve uno nuevo. Si el cron
// de las 12:00 y el de las 12:05 se solapan, o si dos jobs distintos refrescan
// a la vez, el segundo manda un token ya quemado, MeLi responde invalid_grant,
// y la conexion del usuario queda muerta hasta que vuelva a apretar "Conectar".
//
// LA SOLUCION: un arrendamiento (lease) en la propia base. Antes de refrescar,
// se intenta un UPDATE condicional sobre la fila. Postgres garantiza que solo
// uno de los procesos concurrentes se lo lleva; el que no, espera y relee lo
// que escribio el ganador. No hace falta ni una tabla de locks ni Redis.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'
import type { ConfigMeli } from './config'
import { refrescar, type Conexion } from './meli'

type Cliente = SupabaseClient<Database>

/** Cuanto dura el arrendamiento. Mas que cualquier refresh razonable. */
const LEASE_MS = 2 * 60 * 1000

export async function leerConexion(supabase: Cliente): Promise<Conexion | null> {
  const { data } = await supabase
    .from('conexiones')
    .select('access_token, refresh_token, expires_at, cuenta_id')
    .eq('fuente', 'meli')
    .maybeSingle()

  if (!data) return null
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    cuentaId: data.cuenta_id,
  }
}

export async function guardarConexion(
  supabase: Cliente,
  conexion: Conexion,
): Promise<void> {
  const { error } = await supabase.from('conexiones').upsert(
    {
      fuente: 'meli',
      access_token: conexion.accessToken,
      refresh_token: conexion.refreshToken,
      expires_at: conexion.expiresAt,
      cuenta_id: conexion.cuentaId,
      bloqueado_hasta: null,
      ultimo_error: null,
      actualizado_at: new Date().toISOString(),
    },
    { onConflict: 'fuente' },
  )
  if (error) throw new Error(`No se pudo guardar la conexion de MeLi: ${error.message}`)
}

/** Deja el motivo a la vista en vez de fallar en silencio. */
export async function anotarError(supabase: Cliente, mensaje: string): Promise<void> {
  await supabase
    .from('conexiones')
    .update({ ultimo_error: mensaje.slice(0, 500), bloqueado_hasta: null })
    .eq('fuente', 'meli')
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Devuelve una conexion utilizable, refrescandola si hace falta.
 *
 * Refresca SOLO si ya vencio. La propia doc de MeLi lo pide: "we suggest you to
 * renew your access token only when it expires". Refrescar por las dudas
 * multiplica las chances de pisarse.
 */
export async function conexionValida(
  supabase: Cliente,
  cfg: ConfigMeli,
): Promise<Conexion | null> {
  const actual = await leerConexion(supabase)
  if (!actual) return null

  const ahora = Date.now()
  if (new Date(actual.expiresAt).getTime() > ahora) return actual

  const ahoraIso = new Date(ahora).toISOString()

  // Intento de quedarme con el arrendamiento. Las tres condiciones importan:
  //   - es la fila de meli
  //   - el token efectivamente vencio
  //   - nadie mas tiene el arrendamiento vigente
  // Si otro proceso llego primero, este UPDATE afecta 0 filas.
  const { data: tomadas, error } = await supabase
    .from('conexiones')
    .update({ bloqueado_hasta: new Date(ahora + LEASE_MS).toISOString() })
    .eq('fuente', 'meli')
    .lt('expires_at', ahoraIso)
    .or(`bloqueado_hasta.is.null,bloqueado_hasta.lt.${ahoraIso}`)
    .select('refresh_token')

  if (error) throw new Error(`No se pudo tomar el lock de MeLi: ${error.message}`)

  if (!tomadas || tomadas.length === 0) {
    // Otro proceso esta refrescando. Se espera y se relee lo que dejo.
    // No se reintenta el refresh: eso es justamente lo que rompe la conexion.
    await dormir(3000)
    const despues = await leerConexion(supabase)
    if (despues && new Date(despues.expiresAt).getTime() > Date.now()) return despues
    throw new Error(
      'Otro proceso esta refrescando el token de Mercado Libre y no termino a tiempo. ' +
        'La proxima corrida del cron lo vuelve a intentar.',
    )
  }

  try {
    const nueva = await refrescar(cfg, tomadas[0].refresh_token)
    await guardarConexion(supabase, nueva)
    return nueva
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    // Se libera el arrendamiento y se deja anotado por que fallo, para que el
    // panel pueda decir "reconecta Mercado Libre" en vez de mostrar ventas
    // viejas como si fueran de hoy.
    await anotarError(supabase, mensaje)
    throw e
  }
}

// --------------------------------------------------- Nuevos vs recurrentes

/**
 * MeLi no marca "cliente nuevo" en la orden, asi que se deduce: si el buyer_id
 * nunca aparecio antes, es nuevo. Devuelve el resolver que usa agregarPorDia.
 *
 * Se resuelve en dos pasos (leer los conocidos, decidir, registrar los nuevos)
 * para no hacer una consulta por comprador.
 */
export async function resolverCompradores(
  supabase: Cliente,
  compradores: { id: string; fecha: string }[],
): Promise<(buyerId: string) => boolean> {
  const ids = [...new Set(compradores.map((c) => c.id))]
  if (ids.length === 0) return () => false

  const { data } = await supabase
    .from('meli_compradores')
    .select('buyer_id')
    .in('buyer_id', ids)

  const conocidos = new Set((data ?? []).map((r) => r.buyer_id))

  // Los que no estaban quedan registrados con su primera compra. `ignoreDuplicates`
  // hace que dos corridas simultaneas no se pisen ni fallen.
  const nuevos = compradores
    .filter((c) => !conocidos.has(c.id))
    .reduce((acc, c) => {
      const previo = acc.get(c.id)
      if (!previo || c.fecha < previo) acc.set(c.id, c.fecha)
      return acc
    }, new Map<string, string>())

  if (nuevos.size > 0) {
    await supabase.from('meli_compradores').upsert(
      [...nuevos].map(([buyer_id, primera_compra]) => ({ buyer_id, primera_compra })),
      { onConflict: 'buyer_id', ignoreDuplicates: true },
    )
  }

  return (buyerId: string) => !conocidos.has(buyerId)
}
