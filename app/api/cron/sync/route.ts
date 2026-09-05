// Endpoint que dispara la sincronizacion. Lo llama pg_cron desde Supabase.
//
// Por que el cron vive en Postgres y no en Vercel: el plan Hobby de Vercel
// permite cron una sola vez por dia, y ni siquiera a una hora exacta. pg_cron
// corre cada minuto y es gratis. Ver la migracion 0011.
//
// Este endpoint no calcula nada: delega en lib/sync/motor.ts.

import type { NextRequest } from 'next/server'
import { cronSecret } from '@/lib/sync/config'
import { comparacionSegura } from '@/lib/sync/firmas'
import { ejecutarJob, esJob } from '@/lib/sync/motor'

export const runtime = 'nodejs'
// Un poco menos de lo que aguanta una funcion en Vercel. Cada job toca una
// ventana acotada de dias justamente para no acercarse a este limite.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  let esperado: string
  try {
    esperado = cronSecret()
  } catch (e) {
    // Falta CRON_SECRET: es un problema de configuracion, no del que llama.
    return Response.json(
      { error: e instanceof Error ? e.message : 'sin CRON_SECRET' },
      { status: 500 },
    )
  }

  const recibido = request.headers.get('x-cron-secret')
  if (!recibido || !comparacionSegura(recibido, esperado)) {
    return Response.json({ error: 'no autorizado' }, { status: 401 })
  }

  const job = request.nextUrl.searchParams.get('job') ?? 'hoy'
  if (!esJob(job)) {
    return Response.json(
      { error: `job desconocido: ${job}. Validos: hoy, reciente, diario, backfill` },
      { status: 400 },
    )
  }

  try {
    const resumen = await ejecutarJob(job)

    // Siempre 200 si el disparo fue valido. El detalle de que fuente fallo va
    // en el cuerpo y, sobre todo, en sync_log: si devolvieramos 500, pg_net lo
    // registraria como error de red y se perderia el motivo real.
    return Response.json({
      job: resumen.job,
      fuentes: resumen.resultados.map((r) => ({
        fuente: r.fuente,
        estado: r.estado,
        filas: r.filas,
        error: r.error ?? null,
      })),
    })
  } catch (e) {
    // Solo llega aca lo que rompe antes de poder registrar nada, tipico de una
    // variable de entorno faltante.
    return Response.json(
      { job, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

/** Para probar a mano con el navegador o curl. Mismo secreto, mismo camino. */
export async function GET(request: NextRequest) {
  return POST(request)
}
