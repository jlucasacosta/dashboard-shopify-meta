// El motor. Es lo que reemplaza a la persona escribiendo /sync en Claude Code.
//
// Cuatro trabajos, cada uno con su cadencia (ver la migracion 0011):
//
//   hoy       cada 5 min   el dia en curso + lo que marco un webhook
//   reciente  cada hora    los ultimos 7 dias (un pedido cambia despues)
//   diario    1 vez/dia    Meta, tipo de cambio y una pasada de 30 dias
//   backfill  cada 10 min  un lote de historico, y se apaga solo al terminar
//
// Reglas heredadas del /sync manual, que siguen valiendo:
//   - Se copian datos, no se calculan metricas. Todo derivado vive en la base.
//   - Cada fuente falla sola y lo deja anotado en sync_log. Que Meta este
//     vencido no puede impedir que entren las ventas de Shopify.
//   - Un dato que falta se escribe NULL, jamas 0.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  configMeli,
  configMeta,
  configShopify,
  diasPorLote,
  diasPrimeraCorrida,
  monedaTienda,
} from './config'
import { traerProductos, traerTrafico, traerVentas } from './shopify'
import { credencialShopify } from './shopify-token'
import { monedaCuenta, traerGastoDiario, traerGastoPorCampana } from './meta'
import { traerTasas } from './fx'
import { agregarPorDia, compradoresDe, ordenesActualizadasDesde, ordenesCreadasEntre } from './meli'
import { conexionValida, resolverCompradores } from './meli-tokens'
import { conRegistro, saltear, type Resultado } from './log'

type Cliente = SupabaseClient<Database>

export type Job = 'hoy' | 'reciente' | 'diario' | 'backfill'

export const JOBS: Job[] = ['hoy', 'reciente', 'diario', 'backfill']

export function esJob(v: string): v is Job {
  return (JOBS as string[]).includes(v)
}

// -------------------------------------------------------------- Fechas UTC

/** Todo el sistema trabaja en UTC. Shopify y MeLi reportan en UTC. */
function hoyUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// ------------------------------------------------------------------ Shopify

async function escribirShopify(
  supabase: Cliente,
  desde: string,
  hasta: string,
): Promise<number> {
  // El token se pide o se lee de la cache en `conexiones`; ver shopify-token.ts.
  const cred = await credencialShopify(supabase, configShopify())
  let filas = 0

  const [ventas, trafico, productos] = await Promise.all([
    traerVentas(cred, desde, hasta),
    traerTrafico(cred, desde, hasta),
    traerProductos(cred, desde, hasta),
  ])

  if (ventas.length) {
    const { error } = await supabase
      .from('daily_sales')
      .upsert(ventas, { onConflict: 'date,canal' })
    if (error) throw new Error(`daily_sales: ${error.message}`)
    filas += ventas.length
  }

  if (trafico.length) {
    const { error } = await supabase
      .from('daily_traffic')
      .upsert(trafico, { onConflict: 'date' })
    if (error) throw new Error(`daily_traffic: ${error.message}`)
    filas += trafico.length
  }

  if (productos.length) {
    const { error } = await supabase
      .from('daily_products')
      .upsert(productos, { onConflict: 'date,canal,product_id' })
    if (error) throw new Error(`daily_products: ${error.message}`)
    filas += productos.length
  }

  return filas
}

// --------------------------------------------------------------------- Meta

async function escribirMeta(
  supabase: Cliente,
  desde: string,
  hasta: string,
): Promise<number> {
  const cfg = configMeta()
  if (!cfg) throw new Error('sin configuracion de Meta')

  const moneda = await monedaCuenta(cfg)
  let filas = 0

  const [cuenta, campanas] = await Promise.all([
    traerGastoDiario(cfg, desde, hasta, moneda),
    traerGastoPorCampana(cfg, desde, hasta, moneda),
  ])

  if (cuenta.length) {
    const { error } = await supabase
      .from('daily_ad_spend')
      .upsert(cuenta, { onConflict: 'date,ad_account_id' })
    if (error) throw new Error(`daily_ad_spend: ${error.message}`)
    filas += cuenta.length
  }

  if (campanas.length) {
    const { error } = await supabase
      .from('daily_ad_campaigns')
      .upsert(campanas, { onConflict: 'date,campaign_id' })
    if (error) throw new Error(`daily_ad_campaigns: ${error.message}`)
    filas += campanas.length
  }

  return filas
}

// ----------------------------------------------------------------------- FX

/**
 * Solo se piden las fechas que faltan, y solo si hay gasto en otra moneda.
 * Si un dia no se consigue la tasa, se deja sin tasa: daily_metrics lo va a
 * mostrar como "—" y period_totals lo va a contar en `dias_sin_tasa`.
 */
async function escribirFx(supabase: Cliente): Promise<number> {
  const quote = monedaTienda()

  const { data: gastos } = await supabase
    .from('daily_ad_spend')
    .select('date, currency')
    .neq('currency', quote)

  if (!gastos || gastos.length === 0) return 0

  const { data: existentes } = await supabase
    .from('fx_rates')
    .select('date, base_currency')
    .eq('quote_currency', quote)

  const yaEstan = new Set((existentes ?? []).map((r) => `${r.date}|${r.base_currency}`))

  const porBase = new Map<string, string[]>()
  for (const g of gastos) {
    if (yaEstan.has(`${g.date}|${g.currency}`)) continue
    const lista = porBase.get(g.currency) ?? []
    lista.push(g.date)
    porBase.set(g.currency, lista)
  }

  let filas = 0
  for (const [base, fechas] of porBase) {
    const { tasas } = await traerTasas([...new Set(fechas)], base, quote)
    if (tasas.length) {
      const { error } = await supabase
        .from('fx_rates')
        .upsert(tasas, { onConflict: 'date,base_currency,quote_currency' })
      if (error) throw new Error(`fx_rates: ${error.message}`)
      filas += tasas.length
    }
  }

  return filas
}

// ------------------------------------------------------------ Mercado Libre

async function escribirMeli(
  supabase: Cliente,
  desdeIso: string,
  hastaIso?: string,
): Promise<number> {
  const cfg = configMeli()
  if (!cfg) throw new Error('sin configuracion de Mercado Libre')

  const conexion = await conexionValida(supabase, cfg)
  if (!conexion) throw new Error('Mercado Libre no esta conectado todavia')

  const ordenes = hastaIso
    ? await ordenesCreadasEntre(conexion, desdeIso, hastaIso)
    : await ordenesActualizadasDesde(conexion, desdeIso)

  if (ordenes.length === 0) return 0

  const esNuevo = await resolverCompradores(supabase, compradoresDe(ordenes))
  const { ventas, productos } = agregarPorDia(ordenes, monedaTienda(), esNuevo)

  let filas = 0

  if (ventas.length) {
    const { error } = await supabase
      .from('daily_sales')
      .upsert(ventas, { onConflict: 'date,canal' })
    if (error) throw new Error(`daily_sales (meli): ${error.message}`)
    filas += ventas.length
  }

  if (productos.length) {
    const { error } = await supabase
      .from('daily_products')
      .upsert(productos, { onConflict: 'date,canal,product_id' })
    if (error) throw new Error(`daily_products (meli): ${error.message}`)
    filas += productos.length
  }

  return filas
}

/**
 * MeLi reconcilia por `last_updated.from`, que es el equivalente exacto del
 * `updated_at:>=` de Shopify. Se arranca desde el ultimo sync exitoso, con un
 * margen para atras por si algo quedo a mitad de camino.
 */
async function desdeParaMeli(supabase: Cliente): Promise<string> {
  const { data } = await supabase
    .from('sync_state')
    .select('ultimo_ok')
    .eq('fuente', 'meli')
    .maybeSingle()

  const base = data?.ultimo_ok ? new Date(data.ultimo_ok).getTime() : Date.now() - 86400000
  // 15 minutos de margen: mejor repetir ordenes (el upsert es idempotente) que
  // perderlas.
  return new Date(base - 15 * 60 * 1000).toISOString()
}

// --------------------------------------------------------- Estado y sucios

async function marcarEstado(
  supabase: Cliente,
  fuente: 'shopify' | 'meta' | 'fx' | 'meli' | 'backfill',
  campos: Partial<{ cursor_desde: string; cursor_hasta: string; ultimo_ok: string; completo: boolean }>,
): Promise<void> {
  await supabase.from('sync_state').upsert(
    { fuente, ...campos, actualizado_at: new Date().toISOString() },
    { onConflict: 'fuente' },
  )
}

/** Dias que un webhook marco como desactualizados. */
async function diasSucios(supabase: Cliente, canal: 'shopify' | 'meli'): Promise<string[]> {
  const { data } = await supabase
    .from('dias_sucios')
    .select('date')
    .eq('canal', canal)
    .order('date')
    .limit(30)
  return (data ?? []).map((r) => r.date)
}

async function limpiarSucios(
  supabase: Cliente,
  canal: 'shopify' | 'meli',
  fechas: string[],
): Promise<void> {
  if (fechas.length === 0) return
  await supabase.from('dias_sucios').delete().eq('canal', canal).in('date', fechas)
}

// ------------------------------------------------------------------- Jobs

export type Resumen = {
  job: Job
  resultados: Resultado[]
}

async function jobShopifyYMeli(
  supabase: Cliente,
  desde: string,
  hasta: string,
): Promise<Resultado[]> {
  const resultados: Resultado[] = []

  // Shopify: el rango pedido mas los dias que marco un webhook. Los sucios se
  // borran solo si la sincronizacion salio bien; si fallo, quedan para la
  // proxima corrida.
  const sucios = (await diasSucios(supabase, 'shopify')).filter(
    (d) => d < desde || d > hasta,
  )
  const shopify = await conRegistro(supabase, 'shopify', desde, hasta, async () => {
    let filas = await escribirShopify(supabase, desde, hasta)
    for (const dia of sucios) filas += await escribirShopify(supabase, dia, dia)
    return filas
  })
  resultados.push(shopify)
  if (shopify.estado === 'ok') {
    await limpiarSucios(supabase, 'shopify', sucios)
    await marcarEstado(supabase, 'shopify', {
      ultimo_ok: new Date().toISOString(),
      cursor_hasta: hasta,
    })
  }

  // Mercado Libre, si esta configurado.
  if (configMeli()) {
    const desdeIso = await desdeParaMeli(supabase)
    const meli = await conRegistro(supabase, 'meli', desde, hasta, () =>
      escribirMeli(supabase, desdeIso),
    )
    resultados.push(meli)
    if (meli.estado === 'ok') {
      await marcarEstado(supabase, 'meli', { ultimo_ok: new Date().toISOString() })
    }
  }

  return resultados
}

async function jobDiario(supabase: Cliente): Promise<Resultado[]> {
  const hasta = hoyUtc()
  const desde = sumarDias(hasta, -30)
  const resultados: Resultado[] = []

  resultados.push(...(await jobShopifyYMeli(supabase, desde, hasta)))

  if (configMeta()) {
    resultados.push(
      await conRegistro(supabase, 'meta', desde, hasta, () =>
        escribirMeta(supabase, desde, hasta),
      ),
    )
  } else {
    resultados.push(
      await saltear(
        supabase,
        'meta',
        desde,
        hasta,
        'Falta META_ACCESS_TOKEN: sin inversion no hay CAC, ROAS, MER ni contribucion. Las ventas entran igual.',
      ),
    )
  }

  // El tipo de cambio va despues del gasto: recien ahi se sabe que fechas y
  // que monedas hacen falta.
  resultados.push(
    await conRegistro(supabase, 'fx', desde, hasta, () => escribirFx(supabase)),
  )

  return resultados
}

/**
 * Trae el historico de a un lote por corrida, hacia atras, y se apaga solo.
 *
 * Un lote por invocacion es lo que mantiene cada llamada bien lejos del limite
 * de tiempo de una funcion de Vercel. El cursor vive en la base, asi que si una
 * corrida se cae, la siguiente retoma donde quedo.
 */
async function jobBackfill(supabase: Cliente): Promise<Resultado[]> {
  const { data: estado } = await supabase
    .from('sync_state')
    .select('cursor_desde, completo')
    .eq('fuente', 'backfill')
    .maybeSingle()

  if (estado?.completo) return []

  const hoy = hoyUtc()
  const limite = sumarDias(hoy, -diasPrimeraCorrida())
  const lote = diasPorLote()

  // El cursor apunta al dia mas viejo ya traido. Se sigue hacia atras.
  const hasta = estado?.cursor_desde ? sumarDias(estado.cursor_desde, -1) : hoy
  const desde = sumarDias(hasta, -(lote - 1)) < limite ? limite : sumarDias(hasta, -(lote - 1))

  if (hasta < limite) {
    await marcarEstado(supabase, 'backfill', { completo: true })
    return []
  }

  const resultados: Resultado[] = []

  const shopify = await conRegistro(supabase, 'shopify', desde, hasta, () =>
    escribirShopify(supabase, desde, hasta),
  )
  resultados.push(shopify)

  if (configMeta()) {
    resultados.push(
      await conRegistro(supabase, 'meta', desde, hasta, () =>
        escribirMeta(supabase, desde, hasta),
      ),
    )
  }

  if (configMeli()) {
    resultados.push(
      await conRegistro(supabase, 'meli', desde, hasta, () =>
        escribirMeli(supabase, `${desde}T00:00:00.000Z`, `${hasta}T23:59:59.999Z`),
      ),
    )
  }

  // El cursor avanza solo si Shopify salio bien: es la fuente que define el
  // rango. Si fallo, la proxima corrida reintenta el mismo lote.
  if (shopify.estado === 'ok') {
    const completo = desde <= limite
    await marcarEstado(supabase, 'backfill', { cursor_desde: desde, completo })
    if (completo) {
      resultados.push(
        await saltear(supabase, 'shopify', desde, hasta, 'Backfill terminado.'),
      )
    }
  }

  return resultados
}

export async function ejecutarJob(job: Job): Promise<Resumen> {
  const supabase = createAdminClient()
  const hoy = hoyUtc()

  switch (job) {
    case 'hoy':
      return { job, resultados: await jobShopifyYMeli(supabase, hoy, hoy) }
    case 'reciente':
      return { job, resultados: await jobShopifyYMeli(supabase, sumarDias(hoy, -7), hoy) }
    case 'diario':
      return { job, resultados: await jobDiario(supabase) }
    case 'backfill':
      return { job, resultados: await jobBackfill(supabase) }
  }
}
