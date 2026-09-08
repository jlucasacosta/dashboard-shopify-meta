// Token de Shopify para los scripts de esta carpeta.
//
// Es la version en JavaScript plano de lib/sync/shopify-token.ts (los scripts
// no pasan por TypeScript). Misma logica, sin cache: un script corre una vez y
// un token de 24 horas sobra.
//
//   - Si esta SHOPIFY_ADMIN_TOKEN (app vieja creada desde el admin), se usa.
//   - Si no, se piden SHOPIFY_CLIENT_ID + SHOPIFY_API_SECRET y se hace el
//     client credentials grant contra la tienda.
//
// Nunca imprime el token.

const DONDE =
  'dev.shopify.com/dashboard > tu app > Configuracion de la app > Credenciales.'

export async function tokenDeShopify(env = process.env) {
  const shopDomain = env.SHOPIFY_SHOP_DOMAIN
  if (!shopDomain) {
    throw new Error('Falta SHOPIFY_SHOP_DOMAIN: es el dominio .myshopify.com de tu tienda.')
  }

  if (env.SHOPIFY_ADMIN_TOKEN) {
    return { token: env.SHOPIFY_ADMIN_TOKEN, scopes: null, origen: 'SHOPIFY_ADMIN_TOKEN' }
  }

  const clientId = env.SHOPIFY_CLIENT_ID
  const secret = env.SHOPIFY_API_SECRET
  if (!clientId || !secret) {
    throw new Error(`Faltan SHOPIFY_CLIENT_ID o SHOPIFY_API_SECRET. Estan en ${DONDE}`)
  }

  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: secret,
      grant_type: 'client_credentials',
    }),
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok || !json.access_token) {
    const codigo = json.error ?? ''
    const detalle = json.error_description ?? ''
    if (codigo === 'shop_not_permitted' || detalle.includes('shop_not_permitted')) {
      throw new Error(
        'Shopify respondio "shop_not_permitted": la app y la tienda tienen que estar ' +
          'en la MISMA organizacion del Dev Dashboard. Revisa la organizacion activa ' +
          '(arriba a la derecha) y que la tienda figure en "Tiendas".',
      )
    }
    if (res.status === 401 || codigo === 'invalid_client') {
      throw new Error(`Shopify no acepto el Client ID o el secreto. Copialos de nuevo de ${DONDE}`)
    }
    throw new Error(`Shopify respondio ${res.status} al pedir el token: ${codigo} ${detalle}`.trim())
  }

  return {
    token: json.access_token,
    scopes: (json.scope ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    origen: 'client credentials',
  }
}
