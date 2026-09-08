// Configuracion del motor de sincronizacion.
//
// Dos origenes, a proposito:
//   - Los SECRETOS viven solo en variables de entorno. Nunca en un archivo del
//     repo, que es publico.
//   - Lo que no es secreto (dominio de la tienda, moneda, tamaño de lote) puede
//     venir de una variable de entorno o de sync.config.json. La variable gana.
//     Asi el que despliega en Vercel pone todo en un solo lugar, y el que clona
//     y corre local puede seguir editando sync.config.json como hasta ahora.
//
// Igual que en lib/supabase/env.ts: si falta algo, el error dice QUE falta y
// DONDE se consigue. Un "undefined is not a string" no le sirve a nadie.

import configArchivo from '@/sync.config.json'

/** Valores por defecto que no tiene sentido pedirle a nadie. */
const DIAS_POR_LOTE = 90
const DIAS_PRIMERA_CORRIDA = 365

/** Marcadores que trae el repo. Si siguen ahi, es que nadie configuro nada. */
const PLACEHOLDERS = new Set([
  'tu-tienda.myshopify.com',
  '000000000000000',
  '',
])

function faltante(nombre: string, donde: string): never {
  throw new Error(
    [
      ``,
      `Falta la configuracion ${nombre}.`,
      ``,
      `Como arreglarlo:`,
      `  1. ${donde}`,
      `  2. Cargala como variable de entorno ${nombre}`,
      `     - En Vercel: Project Settings > Environment Variables`,
      `     - Local: agregala a .env.local y reinicia (Ctrl+C y npm run dev)`,
      ``,
    ].join('\n'),
  )
}

/** Lee una variable obligatoria. `alterna` es el valor de sync.config.json. */
function requerido(nombre: string, donde: string, alterna?: string): string {
  const valor = process.env[nombre] ?? alterna
  if (!valor || PLACEHOLDERS.has(valor)) faltante(nombre, donde)
  return valor
}

/** Lee una variable opcional. Devuelve null si no esta, sin romper. */
function opcional(nombre: string, alterna?: string): string | null {
  const valor = process.env[nombre] ?? alterna
  if (!valor || PLACEHOLDERS.has(valor)) return null
  return valor
}

function entero(nombre: string, alterna: number): number {
  const crudo = process.env[nombre]
  if (!crudo) return alterna
  const n = Number.parseInt(crudo, 10)
  return Number.isFinite(n) && n > 0 ? n : alterna
}

// ---------------------------------------------------------------- Shopify

export type ConfigShopify = {
  shopDomain: string
  /**
   * Client ID de la app del Dev Dashboard. Junto con apiSecret, el panel pide
   * el token solo (ver shopify-token.ts).
   */
  clientId: string | null
  /**
   * Client secret de la app. Dos usos: pedir el token, y verificar el HMAC de
   * los webhooks.
   */
  apiSecret: string | null
  /**
   * Token fijo. SOLO para apps viejas creadas desde el admin de Shopify, que
   * ya no se pueden crear. Si esta, gana sobre clientId + apiSecret.
   */
  adminToken: string | null
}

const DONDE_CREDENCIALES =
  'Entra a dev.shopify.com/dashboard > tu app > Configuracion de la app > ' +
  'Credenciales: copia el ID de cliente (SHOPIFY_CLIENT_ID) y el Secreto (SHOPIFY_API_SECRET)'

export function configShopify(): ConfigShopify {
  const cfg: ConfigShopify = {
    shopDomain: requerido(
      'SHOPIFY_SHOP_DOMAIN',
      'Es el dominio .myshopify.com de tu tienda (lo ves en la barra del admin)',
      configArchivo.shopDomain,
    ),
    clientId: opcional('SHOPIFY_CLIENT_ID'),
    apiSecret: opcional('SHOPIFY_API_SECRET'),
    adminToken: opcional('SHOPIFY_ADMIN_TOKEN'),
  }

  // Hace falta UNA de las dos formas de autenticarse. Se avisa aca, al leer la
  // configuracion, y no en la primera llamada a Shopify.
  if (!cfg.adminToken && !(cfg.clientId && cfg.apiSecret)) {
    faltante('SHOPIFY_CLIENT_ID y SHOPIFY_API_SECRET', DONDE_CREDENCIALES)
  }

  return cfg
}

// ------------------------------------------------------------------- Meta

export type ConfigMeta = {
  accessToken: string
  adAccountId: string
}

/**
 * Meta es opcional a proposito: sin el, el panel muestra las ventas pero no
 * CAC/ROAS/MER. Es mejor que no arranque nada. Devuelve null si no esta.
 */
export function configMeta(): ConfigMeta | null {
  const accessToken = opcional('META_ACCESS_TOKEN')
  const adAccountId = opcional('META_AD_ACCOUNT_ID', configArchivo.adAccountId)
  if (!accessToken || !adAccountId) return null
  // La Graph API quiere el id con prefijo act_; aceptamos las dos formas.
  return {
    accessToken,
    adAccountId: adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`,
  }
}

// ----------------------------------------------------------- Mercado Libre

export type ConfigMeli = {
  appId: string
  secretKey: string
  /** Host de autorizacion, distinto por pais: MLU -> .com.uy, MLA -> .com.ar */
  authHost: string
  redirectUri: string
}

/** Tambien opcional: quien no vende en MeLi no configura nada y no pasa nada. */
export function configMeli(): ConfigMeli | null {
  const appId = opcional('MELI_APP_ID')
  const secretKey = opcional('MELI_SECRET_KEY')
  if (!appId || !secretKey) return null

  return {
    appId,
    secretKey,
    authHost: opcional('MELI_AUTH_HOST') ?? 'https://auth.mercadolibre.com.uy',
    // Tiene que coincidir EXACTO con el registrado en la app de MeLi, y no
    // admite informacion variable. Por eso cada alumno necesita su propia app.
    redirectUri: `${appUrl()}/api/meli/callback`,
  }
}

// ------------------------------------------------------------------ Comun

/** URL publica del panel. La necesitan los webhooks y el callback de OAuth. */
export function appUrl(): string {
  const url =
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined)

  if (!url) {
    faltante(
      'APP_URL',
      'Es la URL publica de tu panel, por ejemplo https://mi-panel.vercel.app',
    )
  }
  return url.replace(/\/$/, '')
}

/** Secreto compartido con pg_cron. Sin el, cualquiera dispara el sync. */
export function cronSecret(): string {
  return requerido(
    'CRON_SECRET',
    'Inventa una cadena larga al azar (por ejemplo con: openssl rand -hex 32)',
  )
}

/** Moneda en la que el panel muestra todo. Las demas se convierten a esta. */
export function monedaTienda(): string {
  return requerido(
    'STORE_CURRENCY',
    'Es el codigo de la moneda de tu tienda, por ejemplo UYU, ARS o USD',
    configArchivo.storeCurrency,
  )
}

export function diasPorLote(): number {
  return entero('DIAS_POR_LOTE', configArchivo.diasPorLote ?? DIAS_POR_LOTE)
}

export function diasPrimeraCorrida(): number {
  return entero(
    'DIAS_PRIMERA_CORRIDA',
    configArchivo.diasPrimeraCorrida ?? DIAS_PRIMERA_CORRIDA,
  )
}
