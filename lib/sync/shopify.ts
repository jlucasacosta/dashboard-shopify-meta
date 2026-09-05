// Shopify: la unica fuente de los numeros de venta y trafico de ese canal.
//
// Decision de diseño: leemos SIEMPRE por ShopifyQL, nunca por el objeto Order.
// Dos razones:
//   1. ShopifyQL es la misma fuente que alimenta Analytics en el admin. Si
//      calcularamos net_sales nosotros desde pedidos crudos, tarde o temprano
//      difeririamos del admin — y la regla 1 de AGENTS.md dice que si un numero
//      no cierra con Shopify, el bug es nuestro.
//   2. El objeto Order solo deja ver los ultimos 60 dias sin el scope protegido
//      read_all_orders, que exige un tramite aprobado por Shopify. ShopifyQL no
//      tiene ese limite (verificado: SINCE 2023-01-01 devuelve el rango entero).
//
// Scopes que necesita: read_reports. Nada protegido.

import { monedaTienda } from './config'
import type { ConfigShopify } from './config'

/** Version de la API. Shopify recomienda subirla una vez por trimestre. */
export const API_VERSION = '2026-07'

// --------------------------------------------------------------- Consultas

/**
 * Las tres consultas estan verificadas contra el MCP real. Si inventas un
 * nombre de columna, ShopifyQL responde `Column Not Found`. Dos que suenan
 * bien y NO existen: `ordered_product_quantity` (es `net_items_sold`) y
 * `sessions_with_cart` (es `sessions_with_cart_additions`).
 */
function consultaVentas(desde: string, hasta: string) {
  return `FROM sales
SHOW orders, gross_sales, discounts, sales_reversals, net_sales,
     shipping_charges, taxes, total_sales, average_order_value,
     customers, new_customers, returning_customers
TIMESERIES day SINCE ${desde} UNTIL ${hasta}`
}

/**
 * `WHERE human_or_bot_session = 'human'` filtra bots. Sin eso el tope del
 * embudo viene inflado y toda la conversion da mal. Es la unica diferencia
 * respecto de lo que hacia el /sync manual, y por eso el historico de
 * daily_traffic hay que resincronizarlo entero, no mezclarlo.
 */
function consultaTrafico(desde: string, hasta: string) {
  return `FROM sessions
SHOW sessions, online_store_visitors, sessions_with_cart_additions,
     sessions_that_reached_checkout, sessions_that_completed_checkout,
     conversion_rate
WHERE human_or_bot_session = 'human'
TIMESERIES day SINCE ${desde} UNTIL ${hasta}`
}

function consultaProductos(desde: string, hasta: string) {
  return `FROM sales
SHOW gross_sales, net_sales, orders, net_items_sold
GROUP BY product_title, product_id
TIMESERIES day SINCE ${desde} UNTIL ${hasta}`
}

// ----------------------------------------------------------------- Cliente

type RespuestaShopifyql = {
  data?: {
    shopifyqlQuery: {
      tableData: {
        columns: { name: string }[]
        // Segun la version, cada fila viene como array (en el orden de columns)
        // o como objeto. Aceptamos las dos formas.
        rows: (unknown[] | Record<string, unknown>)[]
      } | null
      parseErrors: string[] | null
    }
  }
  errors?: { message: string }[]
}

const DOCUMENTO = `query ($q: String!) {
  shopifyqlQuery(query: $q) {
    tableData { columns { name } rows }
    parseErrors
  }
}`

/** Una fila ya normalizada: nombre de columna -> valor crudo (siempre texto). */
export type Fila = Record<string, string>

export async function consultar(
  cfg: ConfigShopify,
  shopifyql: string,
): Promise<Fila[]> {
  const res = await fetch(
    `https://${cfg.shopDomain}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': cfg.adminToken,
      },
      body: JSON.stringify({ query: DOCUMENTO, variables: { q: shopifyql } }),
    },
  )

  if (!res.ok) {
    const cuerpo = await res.text()
    throw new Error(
      `Shopify respondio ${res.status}. ` +
        (res.status === 401 || res.status === 403
          ? 'Revisa SHOPIFY_ADMIN_TOKEN y que la app tenga el scope read_reports. '
          : '') +
        cuerpo.slice(0, 300),
    )
  }

  const json = (await res.json()) as RespuestaShopifyql

  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL: ${json.errors.map((e) => e.message).join('; ')}`)
  }

  const q = json.data?.shopifyqlQuery
  if (!q) throw new Error('Shopify devolvio una respuesta vacia e inesperada.')

  // Un error de ShopifyQL NO viene como HTTP 500 ni como `errors`: viene con
  // HTTP 200, `tableData: null` y el detalle aca. Un try/catch no lo ve.
  if (q.parseErrors?.length) {
    throw new Error(
      `ShopifyQL rechazo la consulta: ${q.parseErrors.join('; ')}\n\n${shopifyql}`,
    )
  }

  if (!q.tableData) return []

  const nombres = q.tableData.columns.map((c) => c.name)

  return q.tableData.rows.map((fila) => {
    const salida: Fila = {}
    if (Array.isArray(fila)) {
      nombres.forEach((nombre, i) => {
        salida[nombre] = fila[i] == null ? '' : String(fila[i])
      })
    } else {
      for (const nombre of nombres) {
        const v = (fila as Record<string, unknown>)[nombre]
        salida[nombre] = v == null ? '' : String(v)
      }
    }
    return salida
  })
}

// ------------------------------------------------------------ Conversiones

/**
 * Shopify devuelve texto vacio (`""`), no `0`, cuando no hubo pedidos ni
 * sesiones. Son cosas distintas y el panel las muestra distinto: "—" contra
 * "0". Un dashboard que muestra un cero falso no falla nunca y miente siempre.
 */
export function aNumeroONull(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Para columnas que si son un conteo: ausente significa cero de verdad. */
function aEntero(v: string | undefined): number {
  return Math.round(aNumeroONull(v) ?? 0)
}

function aDecimal(v: string | undefined): number {
  return aNumeroONull(v) ?? 0
}

/** ShopifyQL devuelve la fecha del TIMESERIES en la columna `day`. */
function fecha(f: Fila): string {
  // Puede venir como "2026-09-05" o como timestamp completo.
  return (f.day ?? '').slice(0, 10)
}

// -------------------------------------------------------------- Traductores

export type FilaVentas = {
  date: string
  canal: 'shopify'
  orders: number
  gross_sales: number
  discounts: number
  returns: number
  net_sales: number
  shipping: number
  taxes: number
  total_sales: number
  aov: number | null
  customers: number
  new_customers: number
  returning_customers: number
  currency: string
}

export type FilaTrafico = {
  date: string
  sessions: number
  visitors: number
  sessions_with_cart: number
  sessions_reached_checkout: number
  sessions_completed_checkout: number
  conversion_rate: number | null
}

export type FilaProducto = {
  date: string
  canal: 'shopify'
  product_id: string
  product_title: string
  gross_sales: number
  net_sales: number
  orders: number
  units: number
}

export async function traerVentas(
  cfg: ConfigShopify,
  desde: string,
  hasta: string,
): Promise<FilaVentas[]> {
  const moneda = monedaTienda()
  const filas = await consultar(cfg, consultaVentas(desde, hasta))

  return filas
    .filter((f) => fecha(f) !== '')
    .map((f) => ({
      date: fecha(f),
      canal: 'shopify' as const,
      orders: aEntero(f.orders),
      gross_sales: aDecimal(f.gross_sales),
      discounts: aDecimal(f.discounts),
      returns: aDecimal(f.sales_reversals),
      net_sales: aDecimal(f.net_sales),
      shipping: aDecimal(f.shipping_charges),
      taxes: aDecimal(f.taxes),
      total_sales: aDecimal(f.total_sales),
      // Nullable a proposito: sin pedidos no hay ticket promedio, no es 0.
      aov: aNumeroONull(f.average_order_value),
      customers: aEntero(f.customers),
      new_customers: aEntero(f.new_customers),
      returning_customers: aEntero(f.returning_customers),
      currency: moneda,
    }))
}

export async function traerTrafico(
  cfg: ConfigShopify,
  desde: string,
  hasta: string,
): Promise<FilaTrafico[]> {
  const filas = await consultar(cfg, consultaTrafico(desde, hasta))

  return filas
    .filter((f) => fecha(f) !== '')
    .map((f) => ({
      date: fecha(f),
      sessions: aEntero(f.sessions),
      visitors: aEntero(f.online_store_visitors),
      sessions_with_cart: aEntero(f.sessions_with_cart_additions),
      sessions_reached_checkout: aEntero(f.sessions_that_reached_checkout),
      sessions_completed_checkout: aEntero(f.sessions_that_completed_checkout),
      // Nullable: sin sesiones no hay tasa de conversion, no es 0%.
      conversion_rate: aNumeroONull(f.conversion_rate),
    }))
}

export async function traerProductos(
  cfg: ConfigShopify,
  desde: string,
  hasta: string,
): Promise<FilaProducto[]> {
  const filas = await consultar(cfg, consultaProductos(desde, hasta))

  return filas
    .filter((f) => fecha(f) !== '')
    // Las filas sin product_id son el TOTAL del dia, no un producto. Si se
    // cuelan, el top de productos suma el doble.
    .filter((f) => (f.product_id ?? '').trim() !== '')
    .map((f) => ({
      date: fecha(f),
      canal: 'shopify' as const,
      product_id: f.product_id,
      product_title: f.product_title ?? '',
      gross_sales: aDecimal(f.gross_sales),
      net_sales: aDecimal(f.net_sales),
      orders: aEntero(f.orders),
      units: aEntero(f.net_items_sold),
    }))
}
