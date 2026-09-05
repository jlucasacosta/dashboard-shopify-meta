// Escribe sync_log. Es como el panel se entera de que algo se salteo.
//
// Esta tabla es la razon por la que el usuario no descubre a la mala que le
// faltan datos: components/aviso-datos.tsx la lee y muestra el cartel. Si una
// fuente falla y no escribe aca, el panel muestra numeros incompletos como si
// estuvieran completos — que es exactamente la falla que este repo trata de
// no tener.
//
// Por eso: TODA corrida escribe su fila, tanto si salio bien como si no.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'

export type Fuente = 'shopify' | 'meta' | 'fx' | 'meli'
export type Estado = 'ok' | 'error' | 'skipped'

type Cliente = SupabaseClient<Database>

export type Resultado = {
  fuente: Fuente
  estado: Estado
  filas: number
  desde: string
  hasta: string
  error?: string
}

export async function registrar(supabase: Cliente, r: Resultado): Promise<void> {
  const { error } = await supabase.from('sync_log').insert({
    source: r.fuente,
    status: r.estado,
    finished_at: new Date().toISOString(),
    rows_written: r.filas,
    date_from: r.desde,
    date_to: r.hasta,
    // Los mensajes largos no aportan: el panel muestra un cartel, no un stack.
    error: r.error ? r.error.slice(0, 500) : null,
  })

  // Si ni siquiera se puede escribir el log, no hay que tapar el problema
  // original: se avisa por consola y se sigue.
  if (error) {
    console.error('[sync] no se pudo escribir sync_log:', error.message)
  }
}

/**
 * Envuelve una fuente para que su fallo no tumbe a las demas.
 *
 * Que una cuenta de Meta este vencida no puede impedir que se traigan las
 * ventas de Shopify. Cada fuente falla sola y lo deja anotado.
 */
export async function conRegistro(
  supabase: Cliente,
  fuente: Fuente,
  desde: string,
  hasta: string,
  tarea: () => Promise<number>,
): Promise<Resultado> {
  try {
    const filas = await tarea()
    const r: Resultado = { fuente, estado: 'ok', filas, desde, hasta }
    await registrar(supabase, r)
    return r
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    const r: Resultado = {
      fuente,
      estado: 'error',
      filas: 0,
      desde,
      hasta,
      error: mensaje,
    }
    await registrar(supabase, r)
    return r
  }
}

/** Para cuando una fuente no esta configurada: no es un error, es una ausencia. */
export async function saltear(
  supabase: Cliente,
  fuente: Fuente,
  desde: string,
  hasta: string,
  motivo: string,
): Promise<Resultado> {
  const r: Resultado = {
    fuente,
    estado: 'skipped',
    filas: 0,
    desde,
    hasta,
    error: motivo,
  }
  await registrar(supabase, r)
  return r
}
