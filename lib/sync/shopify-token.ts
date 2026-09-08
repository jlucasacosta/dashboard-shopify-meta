// Como consigue el panel su token de Shopify.
//
// EL CAMBIO QUE OBLIGO A ESCRIBIR ESTO: Shopify cerro las "apps personalizadas"
// que se creaban desde el admin y entregaban un Admin API access token fijo.
// Las apps nuevas se crean en el Dev Dashboard (dev.shopify.com/dashboard) y
// esas NO muestran ningun token: solo un Client ID y un Client secret.
//
// Para una app que solo trabaja con tiendas de tu propia organizacion, la doc
// oficial indica el "client credentials grant": el servidor manda ID + secreto
// y recibe un token que dura 24 horas.
//
//   https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
//
// Entonces el panel pide el token solo, lo guarda en `conexiones` y lo vuelve a
// pedir cuando esta por vencer. Nadie tiene que pegar un token en ningun lado.
//
// A DIFERENCIA DE MERCADO LIBRE, aca no hace falta lock. Pedir un token nuevo
// no invalida al anterior de golpe: Shopify lo "retira" pero sigue valiendo
// hasta que vence. Si dos corridas del cron piden a la vez, las dos reciben un
// token utilizable. Lo peor que pasa es una llamada de mas.
//
// SHOPIFY_ADMIN_TOKEN sigue existiendo como salida de emergencia para quien
// todavia tenga una app vieja creada desde el admin: si esta, se usa tal cual.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'
import type { ConfigShopify } from './config'

type Cliente = SupabaseClient<Database>

/** Lo unico que necesitan las consultas: donde pegar y con que token. */
export type CredencialShopify = {
  shopDomain: string
  token: string
}

/**
 * Cuanto antes del vencimiento se renueva. Un token dura 24 h; con 10 minutos
 * de margen ninguna corrida del cron (que dura segundos) lo agarra vencido a
 * mitad de camino.
 */
const MARGEN_MS = 10 * 60 * 1000

/** ¿Sirve todavia este vencimiento, con margen? Separado para poder testearlo. */
export function vigente(expiresAt: string, ahora = Date.now()): boolean {
  const t = new Date(expiresAt).getTime()
  return Number.isFinite(t) && t - ahora > MARGEN_MS
}

type RespuestaToken = {
  access_token?: string
  scope?: string
  expires_in?: number
  error?: string
  error_description?: string
}

/**
 * Pide un token nuevo a Shopify. Es la llamada cruda; no guarda nada.
 *
 * Devuelve tambien los scopes que Shopify concedio: sirve para avisar si a la
 * app le falta `read_reports` ANTES de que la primera consulta falle con un
 * mensaje que no lo explica.
 */
export async function pedirToken(
  cfg: Pick<ConfigShopify, 'shopDomain' | 'clientId' | 'apiSecret'>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ token: string; expiresAt: string; scopes: string[] }> {
  if (!cfg.clientId || !cfg.apiSecret) {
    throw new Error(
      'Faltan SHOPIFY_CLIENT_ID o SHOPIFY_API_SECRET. Estan en ' +
        'dev.shopify.com/dashboard > tu app > Configuracion de la app > Credenciales.',
    )
  }

  const res = await fetchImpl(`https://${cfg.shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.apiSecret,
      grant_type: 'client_credentials',
    }),
  })

  const json = (await res.json().catch(() => ({}))) as RespuestaToken

  if (!res.ok || !json.access_token) {
    throw new Error(explicarError(res.status, json))
  }

  // `expires_in` viene en segundos (siempre 86399). Si por algun motivo no
  // viniera, se asume una hora: mejor renovar de mas que usar uno vencido.
  const segundos = json.expires_in ?? 3600
  return {
    token: json.access_token,
    expiresAt: new Date(Date.now() + segundos * 1000).toISOString(),
    scopes: (json.scope ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  }
}

/** Traduce los errores del grant a algo que diga que hacer. */
function explicarError(status: number, json: RespuestaToken): string {
  const codigo = json.error ?? ''
  const detalle = json.error_description ?? ''

  if (codigo === 'shop_not_permitted' || detalle.includes('shop_not_permitted')) {
    return (
      'Shopify rechazo el pedido de token: "shop_not_permitted". La app y la ' +
      'tienda tienen que estar en la MISMA organizacion del Dev Dashboard. ' +
      'Entra a dev.shopify.com/dashboard, mira arriba a la derecha que ' +
      'organizacion esta activa, y confirma que en "Tiendas" figure la tuya. ' +
      'Tambien revisa que SHOPIFY_SHOP_DOMAIN sea exactamente tu dominio ' +
      '.myshopify.com.'
    )
  }

  if (status === 401 || codigo === 'invalid_client') {
    return (
      'Shopify no acepto el Client ID o el Client secret. Copialos de nuevo de ' +
      'dev.shopify.com/dashboard > tu app > Configuracion de la app > Credenciales, ' +
      'sin espacios al final. Si rotaste el secreto, el viejo ya no sirve.'
    )
  }

  if (status === 404) {
    return (
      `Shopify respondio 404: SHOPIFY_SHOP_DOMAIN no apunta a una tienda. ` +
      `Tiene que ser el dominio .myshopify.com, no el dominio propio.`
    )
  }

  return `Shopify respondio ${status} al pedir el token: ${codigo} ${detalle}`.trim()
}

/** Scope sin el cual no hay ni un numero. Se avisa antes de la primera consulta. */
const SCOPE_MINIMO = 'read_reports'

/**
 * Devuelve una credencial utilizable: la fija si hay, la guardada si sigue
 * vigente, o una nueva (que queda guardada para la proxima corrida).
 */
export async function credencialShopify(
  supabase: Cliente,
  cfg: ConfigShopify,
): Promise<CredencialShopify> {
  if (cfg.adminToken) {
    return { shopDomain: cfg.shopDomain, token: cfg.adminToken }
  }

  const { data: guardada } = await supabase
    .from('conexiones')
    .select('access_token, expires_at')
    .eq('fuente', 'shopify')
    .maybeSingle()

  if (guardada && vigente(guardada.expires_at)) {
    return { shopDomain: cfg.shopDomain, token: guardada.access_token }
  }

  const nuevo = await pedirToken(cfg)

  if (!nuevo.scopes.includes(SCOPE_MINIMO)) {
    throw new Error(
      `La app de Shopify no tiene el scope ${SCOPE_MINIMO} (tiene: ${nuevo.scopes.join(', ') || 'ninguno'}). ` +
        'En dev.shopify.com/dashboard > tu app > Versiones, crea una version con ' +
        '`read_reports,read_orders`, lanzala, y volve a instalar la app en la tienda.',
    )
  }

  const { error } = await supabase.from('conexiones').upsert(
    {
      fuente: 'shopify',
      access_token: nuevo.token,
      // El grant no entrega refresh token: se pide uno nuevo con ID + secreto.
      refresh_token: '',
      expires_at: nuevo.expiresAt,
      cuenta_id: cfg.shopDomain,
      bloqueado_hasta: null,
      ultimo_error: null,
      actualizado_at: new Date().toISOString(),
    },
    { onConflict: 'fuente' },
  )

  if (error) {
    throw new Error(
      `No se pudo guardar el token de Shopify en conexiones: ${error.message}. ` +
        'Si dice algo de "conexiones_fuente_check", falta aplicar la migracion 0013.',
    )
  }

  return { shopDomain: cfg.shopDomain, token: nuevo.token }
}
