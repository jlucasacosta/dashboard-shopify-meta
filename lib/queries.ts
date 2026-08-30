// Lecturas a Supabase.
//
// Este archivo NO calcula metricas. Solo pide datos ya calculados por la base
// (period_totals, campaign_totals, product_totals, daily_metrics) y los
// entrega tipados. Si necesitas una metrica nueva, se agrega en una migracion,
// no aca.

import { createClient } from '@/lib/supabase/server'
import type { Rango } from '@/lib/ranges'

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
  gross_sales: Num
  net_sales: Num
  orders: Num
  units: Num
  pct_del_total: Num
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

export async function getProductos(rango: Rango, tope = 20): Promise<Producto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('product_totals', { desde: rango.from, hasta: rango.to, tope })

  if (error) throw new Error(`No se pudieron leer los productos: ${error.message}`)
  return (data ?? []) as Producto[]
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

  return data?.value ?? 'USD'
}
