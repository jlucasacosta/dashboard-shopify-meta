// Meta Ads: de aca sale UNICAMENTE el gasto publicitario.
//
// Meta atribuye conversiones con su propio modelo y siempre reporta mas ventas
// que las que cierran en el banco. Por eso no le pedimos ventas: las ventas son
// de Shopify y de Mercado Libre. Meta aporta el costo, y con eso se calculan
// CAC, ROAS, MER y contribucion.
//
// Ojo con el nombre del campo: la Graph API usa `spend`. El MCP de Meta usa
// `amount_spent`, que es el campo del objeto *ad account*, no de Insights.
// Copiar el nombre del MCP hace que Insights devuelva un error de campo.
//
// No hay webhooks utiles de gasto: esto es polling puro, 1 vez por dia alcanza.

import type { ConfigMeta } from './config'

/** Version de la Graph API. Meta las deprecia; subirla es una tarea periodica. */
const GRAPH_VERSION = 'v26.0'

const CAMPOS_BASE = [
  'spend',
  'impressions',
  'clicks',
  'reach',
  'frequency',
  'ctr',
  'cpc',
  'cpm',
] as const

type RespuestaGraph<T> = {
  data?: T[]
  paging?: { next?: string }
  error?: { message: string; type: string; code: number }
}

async function pedir<T>(url: string): Promise<T[]> {
  const acumulado: T[] = []
  let siguiente: string | undefined = url

  // Insights pagina por cursores. Con time_increment=1 y rangos de 90 dias
  // rara vez hay mas de una pagina, pero si el rango crece, hay.
  while (siguiente) {
    const res: Response = await fetch(siguiente)
    const json = (await res.json()) as RespuestaGraph<T>

    if (json.error) {
      throw new Error(
        `Meta respondio un error (${json.error.code}): ${json.error.message}. ` +
          (json.error.code === 190
            ? 'El token vencio o fue revocado. Genera uno nuevo de System User en Business Manager.'
            : 'Revisa que el token tenga el permiso ads_read y acceso a esa cuenta.'),
      )
    }
    if (!res.ok) {
      throw new Error(`Meta respondio ${res.status}.`)
    }

    acumulado.push(...(json.data ?? []))
    siguiente = json.paging?.next
  }

  return acumulado
}

function urlInsights(
  cfg: ConfigMeta,
  desde: string,
  hasta: string,
  extra: Record<string, string>,
) {
  const params = new URLSearchParams({
    access_token: cfg.accessToken,
    time_range: JSON.stringify({ since: desde, until: hasta }),
    // Una fila por dia. Sin esto Meta agrega todo el rango en una sola fila.
    time_increment: '1',
    limit: '500',
    ...extra,
  })
  return `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.adAccountId}/insights?${params}`
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Ausente de verdad: Meta no manda la clave si no hay dato. No es 0. */
function numONull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ------------------------------------------------------------ Moneda cuenta

/**
 * La moneda de la cuenta publicitaria puede no ser la de la tienda (por ejemplo
 * cuenta en USD y tienda en UYU). Se guarda tal cual viene y la conversion la
 * hace la base con fx_rates — nunca aca.
 */
export async function monedaCuenta(cfg: ConfigMeta): Promise<string> {
  const params = new URLSearchParams({
    access_token: cfg.accessToken,
    fields: 'currency',
  })
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.adAccountId}?${params}`,
  )
  const json = (await res.json()) as { currency?: string; error?: { message: string } }
  if (json.error) throw new Error(`Meta: ${json.error.message}`)
  if (!json.currency) throw new Error('Meta no devolvio la moneda de la cuenta.')
  return json.currency
}

// -------------------------------------------------------- Gasto de la cuenta

export type FilaGasto = {
  date: string
  ad_account_id: string
  spend: number
  impressions: number
  clicks: number
  reach: number
  frequency: number | null
  ctr: number | null
  cpc: number | null
  cpm: number | null
  currency: string
  source: 'mcp'
}

type InsightCuenta = Record<string, unknown> & { date_start?: string }

export async function traerGastoDiario(
  cfg: ConfigMeta,
  desde: string,
  hasta: string,
  moneda: string,
): Promise<FilaGasto[]> {
  const filas = await pedir<InsightCuenta>(
    urlInsights(cfg, desde, hasta, { fields: CAMPOS_BASE.join(',') }),
  )

  // El id se guarda sin el prefijo act_, que es como lo escribe el usuario en
  // la config y como quedo en las filas que ya estan en la base.
  const idLimpio = cfg.adAccountId.replace(/^act_/, '')

  return filas
    .filter((f) => Boolean(f.date_start))
    .map((f) => ({
      date: String(f.date_start),
      ad_account_id: idLimpio,
      spend: num(f.spend),
      impressions: num(f.impressions),
      clicks: num(f.clicks),
      reach: num(f.reach),
      frequency: numONull(f.frequency),
      ctr: numONull(f.ctr),
      cpc: numONull(f.cpc),
      cpm: numONull(f.cpm),
      currency: moneda,
      source: 'mcp' as const,
    }))
}

// ------------------------------------------------------------ Por campaña

export type FilaCampana = {
  date: string
  campaign_id: string
  campaign_name: string
  status: string | null
  objective: string | null
  spend: number
  impressions: number
  clicks: number
  reach: number
  ctr: number | null
  cpc: number | null
  cpm: number | null
  currency: string
}

type InsightCampana = InsightCuenta & {
  campaign_id?: string
  campaign_name?: string
  objective?: string
}

/**
 * `status` no es un campo de Insights: vive en el objeto campaña. Se trae
 * aparte con una sola llamada y se cruza por id. Si falla, queda en null —
 * un dato ausente nunca se inventa.
 */
async function estadosDeCampanas(cfg: ConfigMeta): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  try {
    const params = new URLSearchParams({
      access_token: cfg.accessToken,
      fields: 'id,status',
      limit: '500',
    })
    const campanas = await pedir<{ id: string; status?: string }>(
      `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.adAccountId}/campaigns?${params}`,
    )
    for (const c of campanas) if (c.status) mapa.set(c.id, c.status)
  } catch {
    // El gasto por campaña sigue sirviendo sin el estado.
  }
  return mapa
}

export async function traerGastoPorCampana(
  cfg: ConfigMeta,
  desde: string,
  hasta: string,
  moneda: string,
): Promise<FilaCampana[]> {
  const [filas, estados] = await Promise.all([
    pedir<InsightCampana>(
      urlInsights(cfg, desde, hasta, {
        level: 'campaign',
        fields: [...CAMPOS_BASE, 'campaign_id', 'campaign_name', 'objective'].join(','),
      }),
    ),
    estadosDeCampanas(cfg),
  ])

  return filas
    .filter((f) => Boolean(f.date_start) && Boolean(f.campaign_id))
    .map((f) => ({
      date: String(f.date_start),
      campaign_id: String(f.campaign_id),
      campaign_name: f.campaign_name ?? '',
      status: estados.get(String(f.campaign_id)) ?? null,
      objective: f.objective ?? null,
      spend: num(f.spend),
      impressions: num(f.impressions),
      clicks: num(f.clicks),
      reach: num(f.reach),
      ctr: numONull(f.ctr),
      cpc: numONull(f.cpc),
      cpm: numONull(f.cpm),
      currency: moneda,
    }))
}
