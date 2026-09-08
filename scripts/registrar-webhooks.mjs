// Registra en Shopify los webhooks que avisan cuando algo cambio.
//
//   SHOPIFY_SHOP_DOMAIN=tu-tienda.myshopify.com \
//   SHOPIFY_CLIENT_ID=... SHOPIFY_API_SECRET=... \
//   APP_URL=https://tu-panel.vercel.app \
//   npm run webhooks:registrar
//
// (Si .env.local ya tiene esos valores, alcanza con `npm run webhooks:registrar`.)
//
// LA TRAMPA QUE ESTE SCRIPT EVITA:
//
//   `webhookSubscriptionCreate` NO es idempotente. Si lo corres dos veces con
//   el mismo topic y la misma URL, Shopify crea DOS suscripciones y te manda
//   cada pedido por duplicado. Como el webhook de este panel solo marca dias
//   sucios, un duplicado no rompe los numeros — pero el dia que alguien use el
//   payload para algo, si.
//
//   Por eso el script primero PREGUNTA que hay (`webhookSubscriptions`), y
//   despues crea, actualiza o borra segun el estado real. Correrlo diez veces
//   deja lo mismo que correrlo una.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokenDeShopify } from './lib/shopify-token.mjs'

const API_VERSION = '2026-07'

// .env.local, si existe, completa lo que no venga por el entorno. Asi el
// comando queda en `npm run webhooks:registrar` a secas.
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const archivoEnv = resolve(raiz, '.env.local')
if (existsSync(archivoEnv)) {
  for (const linea of readFileSync(archivoEnv, 'utf8').split('\n')) {
    const limpia = linea.trim()
    if (!limpia || limpia.startsWith('#')) continue
    const corte = limpia.indexOf('=')
    if (corte === -1) continue
    const nombre = limpia.slice(0, corte).trim()
    let valor = limpia.slice(corte + 1)
    const marca = valor.indexOf('#')
    if (marca !== -1) valor = valor.slice(0, marca)
    valor = valor.trim().replace(/^["']|["']$/g, '')
    if (valor && !process.env[nombre]) process.env[nombre] = valor
  }
}

// Solo lo que hace falta para saber que un dia cambio. `orders/cancelled` no
// esta porque una cancelacion tambien dispara `orders/updated`.
const TOPICS = ['ORDERS_CREATE', 'ORDERS_UPDATED', 'REFUNDS_CREATE']

function exigir(nombre, donde) {
  const v = process.env[nombre]
  if (!v) {
    console.error(`\nFalta la variable de entorno ${nombre}.\n  ${donde}\n`)
    process.exit(1)
  }
  return v
}

const shopDomain = exigir(
  'SHOPIFY_SHOP_DOMAIN',
  'Es el dominio .myshopify.com de tu tienda.',
)
const appUrl = exigir(
  'APP_URL',
  'La URL publica de tu panel, por ejemplo https://mi-panel.vercel.app',
).replace(/\/$/, '')

const destino = `${appUrl}/api/webhooks/shopify`

// Se resuelve una sola vez, al arrancar main(). Ver scripts/lib/shopify-token.mjs.
let token = ''

async function graphql(query, variables = {}) {
  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!res.ok) {
    const cuerpo = await res.text()
    throw new Error(
      `Shopify respondio ${res.status}. ` +
        (res.status === 401 || res.status === 403
          ? 'Revisa el token y que la app tenga el scope read_orders. '
          : '') +
        cuerpo.slice(0, 300),
    )
  }

  const json = await res.json()
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }
  return json.data
}

// `uri` y no `endpoint`: este ultimo esta deprecado en la API 2026-07.
// Para una suscripcion HTTPS, `uri` es directamente la URL de destino.
const CONSULTA = `
  query {
    webhookSubscriptions(first: 100) {
      edges { node { id topic uri } }
    }
  }`

const CREAR = `
  mutation ($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
      webhookSubscription { id topic }
      userErrors { field message }
    }
  }`

const ACTUALIZAR = `
  mutation ($id: ID!, $sub: WebhookSubscriptionInput!) {
    webhookSubscriptionUpdate(id: $id, webhookSubscription: $sub) {
      webhookSubscription { id topic }
      userErrors { field message }
    }
  }`

const BORRAR = `
  mutation ($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors { field message }
    }
  }`

function fallarSiHayUserErrors(bloque, etiqueta) {
  const errores = bloque?.userErrors ?? []
  if (errores.length) {
    throw new Error(`${etiqueta}: ${errores.map((e) => e.message).join('; ')}`)
  }
}

async function main() {
  console.log(`Tienda:  ${shopDomain}`)
  console.log(`Destino: ${destino}\n`)

  const cred = await tokenDeShopify()
  token = cred.token
  if (cred.scopes && !cred.scopes.includes('read_orders')) {
    throw new Error(
      `La app no tiene el scope read_orders (tiene: ${cred.scopes.join(', ') || 'ninguno'}). ` +
        'Sin el, Shopify no deja crear los webhooks de pedidos. Crea una version ' +
        'nueva con read_reports,read_orders, lanzala y reinstala la app.',
    )
  }

  const data = await graphql(CONSULTA)
  const existentes = data.webhookSubscriptions.edges
    .map((e) => e.node)
    // Solo las HTTPS. Una suscripcion puede apuntar a Pub/Sub o EventBridge,
    // y esas no son nuestras.
    .filter((n) => typeof n.uri === 'string' && n.uri.startsWith('http'))
    .map((n) => ({ id: n.id, topic: n.topic, url: n.uri }))

  const acciones = []

  for (const topic of TOPICS) {
    const delTopic = existentes.filter((s) => s.topic === topic)
    const yaApunta = delTopic.filter((s) => s.url === destino)
    // Los que apuntan a otra URL, tipico al mover el panel de dominio.
    const apuntanAOtroLado = delTopic.filter((s) => s.url !== destino)

    if (yaApunta.length === 0 && apuntanAOtroLado.length > 0) {
      // Se reusa uno y se borran los demas, en vez de crear otro nuevo.
      const [primero, ...resto] = apuntanAOtroLado
      const r = await graphql(ACTUALIZAR, { id: primero.id, sub: { callbackUrl: destino } })
      fallarSiHayUserErrors(r.webhookSubscriptionUpdate, `actualizar ${topic}`)
      acciones.push(`  ~ ${topic}  actualizado (apuntaba a ${primero.url})`)
      for (const sobrante of resto) {
        const d = await graphql(BORRAR, { id: sobrante.id })
        fallarSiHayUserErrors(d.webhookSubscriptionDelete, `borrar ${topic}`)
        acciones.push(`  - ${topic}  duplicado borrado`)
      }
      continue
    }

    if (yaApunta.length === 0) {
      const r = await graphql(CREAR, { topic, sub: { callbackUrl: destino } })
      fallarSiHayUserErrors(r.webhookSubscriptionCreate, `crear ${topic}`)
      acciones.push(`  + ${topic}  creado`)
      continue
    }

    acciones.push(`  = ${topic}  ya estaba`)

    // Todo lo que sobre se borra: es exactamente el duplicado que causa que
    // cada pedido llegue dos veces.
    for (const sobrante of [...yaApunta.slice(1), ...apuntanAOtroLado]) {
      const d = await graphql(BORRAR, { id: sobrante.id })
      fallarSiHayUserErrors(d.webhookSubscriptionDelete, `borrar ${topic}`)
      acciones.push(`  - ${topic}  duplicado borrado`)
    }
  }

  console.log(acciones.join('\n'))

  // Verificacion final contra Shopify, no contra lo que creemos que hicimos.
  const verificacion = await graphql(CONSULTA)
  const finales = verificacion.webhookSubscriptions.edges
    .map((e) => e.node)
    .filter((n) => n.uri === destino)

  console.log(`\n${finales.length} suscripciones apuntando al panel:`)
  for (const t of TOPICS) {
    const n = finales.filter((s) => s.topic === t).length
    const marca = n === 1 ? 'ok' : `PROBLEMA: ${n}`
    console.log(`  ${t}: ${marca}`)
  }

  const duplicados = TOPICS.some((t) => finales.filter((s) => s.topic === t).length !== 1)
  if (duplicados) {
    console.error('\nQuedo mas de una suscripcion para algun topic. Volve a correr el script.')
    process.exit(1)
  }
  console.log('\nListo. Correrlo de nuevo no cambia nada.')
}

main().catch((e) => {
  console.error(`\n${e.message}\n`)
  process.exit(1)
})
