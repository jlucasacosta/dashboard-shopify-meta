// Prueba la conexion con Shopify sin tocar la base ni Vercel.
//
//   npm run shopify:probar
//
// Lee SHOPIFY_SHOP_DOMAIN, SHOPIFY_CLIENT_ID y SHOPIFY_API_SECRET de .env.local
// (o del entorno), pide un token y hace UNA consulta ShopifyQL chica. Sirve
// para saber, antes de desplegar, que la app esta bien creada, instalada y con
// los scopes que hacen falta.
//
// Nunca imprime el token ni el secreto.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokenDeShopify } from './lib/shopify-token.mjs'

const API_VERSION = '2026-07'

// .env.local, si existe, completa lo que no venga por el entorno.
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const archivo = resolve(raiz, '.env.local')
if (existsSync(archivo)) {
  for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
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

const CONSULTA = `query ($q: String!) {
  shopifyqlQuery(query: $q) { tableData { rows } parseErrors }
}`

async function main() {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN
  console.log(`Tienda: ${shop ?? '(falta SHOPIFY_SHOP_DOMAIN)'}\n`)

  const { token, scopes, origen } = await tokenDeShopify()
  console.log(`1. Token conseguido (${origen}).`)

  if (scopes) {
    console.log(`   Scopes de la app: ${scopes.join(', ') || '(ninguno)'}`)
    for (const s of ['read_reports', 'read_orders']) {
      if (!scopes.includes(s)) {
        console.log(`   FALTA ${s}. Crea una version nueva con read_reports,read_orders y reinstala la app.`)
      }
    }
  }

  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({
      query: CONSULTA,
      variables: { q: 'FROM sales SHOW total_sales SINCE -7d UNTIL today' },
    }),
  })

  if (!res.ok) {
    throw new Error(`Shopify respondio ${res.status} a la consulta: ${(await res.text()).slice(0, 300)}`)
  }
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
  const q = json.data?.shopifyqlQuery
  if (q?.parseErrors?.length) throw new Error(`ShopifyQL: ${q.parseErrors.join('; ')}`)

  const filas = q?.tableData?.rows?.length ?? 0
  console.log(`2. ShopifyQL responde: ${filas} fila(s) para los ultimos 7 dias.`)
  console.log('\nListo. Shopify esta conectado. Segui con npm run env:subir.')
}

main().catch((e) => {
  console.error(`\n${e.message}\n`)
  process.exit(1)
})
