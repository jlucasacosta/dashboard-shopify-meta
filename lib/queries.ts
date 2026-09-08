// Lecturas a Supabase.
//
// Este archivo NO calcula metricas. Solo pide datos ya calculados por la base
// (period_totals, campaign_totals, product_totals, daily_metrics) y los
// entrega tipados. Si necesitas una metrica nueva, se agrega en una migracion,
// no aca.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FilaConexion } from '@/lib/integraciones'
import type { Rango } from '@/lib/ranges'
import { filtroCanal, type Canal } from '@/lib/canales'

/** Los `numeric` de Postgres llegan como string por JSON. */
type Num = number | string | null

export type Totales = {
  dias: number
  dias_sin_gasto: number
  /** Dias con gasto que no se pudo convertir de moneda. Si es > 0, el total miente por defecto. */
  dias_sin_tasa: number

  orders: Num
  gross_sales: Num
  discounts: Num
  returns: Num
  net_sales: Num
  total_sales: Num
  aov: Num

  customers: Num
  new_customers: Num
  returning_customers: Num

  sessions: Num
  visitors: Num
  conversion_rate: Num

  ad_spend: Num
  impressions: Num
  clicks: Num
  reach: Num
  ctr: Num
  cpc: Num
  cpm: Num

  cac: Num
  roas: Num
  mer: Num
  ad_spend_pct: Num
  contribution: Num

  store_currency: string | null
}

export type PuntoSerie = {
  date: string
  total_sales: Num
  ad_spend: Num
  orders: Num
  cac: Num
  roas: Num
  new_customers: Num
  sessions: Num
}

export type Campana = {
  campaign_id: string
  campaign_name: string
  status: string | null
  objective: string | null
  spend: Num
  impressions: Num
  clicks: Num
  reach: Num
  ctr: Num
  cpc: Num
  cpm: Num
  dias_sin_tasa: number
}

export type Producto = {
  product_id: string
  product_title: string
  canal: string
  gross_sales: Num
  net_sales: Num
  orders: Num
  units: Num
  pct_del_total: Num
}

/** Los cuatro pasos del embudo y las tasas de uno al siguiente. */
export type Embudo = {
  dias: number
  visitantes: Num
  visitas: Num
  carritos: Num
  checkouts_iniciados: Num
  ventas: Num
  tasa_carrito: Num
  tasa_checkout: Num
  tasa_venta: Num
  conversion_total: Num
}

/** Ventas de un canal, en su moneda original. */
export type VentasCanal = {
  canal: string
  currency: string | null
  orders: Num
  gross_sales: Num
  net_sales: Num
  total_sales: Num
  aov: Num
  customers: Num
}

export type EstadoSync = {
  source: string
  status: string
  finished_at: string | null
  rows_written: number
  error: string | null
}

export async function getTotales(rango: Rango): Promise<Totales | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('period_totals', { desde: rango.from, hasta: rango.to })
    .single()

  if (error) throw new Error(`No se pudieron leer los totales: ${error.message}`)
  return data as Totales | null
}

export async function getSerie(rango: Rango): Promise<PuntoSerie[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('daily_metrics')
    .select('date, total_sales, ad_spend, orders, cac, roas, new_customers, sessions')
    .gte('date', rango.from)
    .lte('date', rango.to)
    .order('date')

  if (error) throw new Error(`No se pudo leer la serie diaria: ${error.message}`)
  return (data ?? []) as PuntoSerie[]
}

export async function getCampanas(rango: Rango): Promise<Campana[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('campaign_totals', { desde: rango.from, hasta: rango.to })

  if (error) throw new Error(`No se pudieron leer las campañas: ${error.message}`)
  return (data ?? []) as Campana[]
}

export async function getProductos(
  rango: Rango,
  tope = 20,
  canal: Canal = 'todos',
): Promise<Producto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('product_totals', {
    desde: rango.from,
    hasta: rango.to,
    tope,
    canal_filtro: filtroCanal(canal),
  })

  if (error) throw new Error(`No se pudieron leer los productos: ${error.message}`)
  return (data ?? []) as Producto[]
}

/**
 * El embudo del periodo. Es de Shopify: Mercado Libre no expone "agregado al
 * carrito" ni "pago iniciado", asi que no hay filtro por canal aca.
 */
export async function getEmbudo(rango: Rango): Promise<Embudo | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('funnel_totals', { desde: rango.from, hasta: rango.to })
    .single()

  if (error) throw new Error(`No se pudo leer el embudo: ${error.message}`)
  return data as Embudo | null
}

/** Ventas por canal, para el selector y la comparacion. */
export async function getCanales(rango: Rango): Promise<VentasCanal[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('channel_totals', { desde: rango.from, hasta: rango.to })

  if (error) throw new Error(`No se pudieron leer los canales: ${error.message}`)
  return (data ?? []) as VentasCanal[]
}

/**
 * Ultimo resultado de cada fuente en la sincronizacion.
 * Sirve para avisar cuando el MCP de Meta no estaba disponible: en ese caso
 * queda una fila con status 'skipped' y el dashboard lo tiene que decir.
 */
export async function getEstadoSync(): Promise<EstadoSync[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sync_log')
    .select('source, status, finished_at, rows_written, error')
    .order('started_at', { ascending: false })
    .limit(20)

  if (error) return []

  const vistos = new Set<string>()
  return (data ?? []).filter((f) => {
    if (vistos.has(f.source)) return false
    vistos.add(f.source)
    return true
  }) as EstadoSync[]
}

export async function getMonedaTienda(): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'store_currency')
    .maybeSingle()

  if (data?.value) return data.value

  // Sin la fila en settings, la moneda la dice el propio dato: es la que /sync
  // escribio en cada venta, sacada de storeCurrency en sync.config.json.
  //
  // El fallback existe porque settings solo se llena cuando /sync corre. Antes
  // de eso, adivinar una moneda fija hacia que una tienda recien clonada viera
  // sus pesos etiquetados como dolares: los numeros bien y el simbolo mintiendo,
  // que es la clase de error que nadie mira dos veces.
  const { data: venta } = await supabase
    .from('daily_sales')
    .select('currency')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return venta?.currency ?? 'USD'
}

// --------------------------------------------------- Estado de integraciones

/**
 * Las conexiones de OAuth, para la pantalla de Configuracion.
 *
 * Usa el cliente admin porque `conexiones` no tiene NINGUNA policy: es la tabla
 * que guarda los tokens y solo la ve la service key. Por eso esta funcion solo
 * puede llamarse desde un server component.
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
