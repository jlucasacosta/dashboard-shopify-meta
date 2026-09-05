// Sube las variables de .env.local a Vercel, todas de una.
//
//   npm run env:subir
//
// Por que existe: son doce variables. Cargarlas a mano en la interfaz de Vercel
// es lento y es donde la gente pega una con un espacio de mas o se saltea una,
// y despues el panel falla con un error que no apunta a eso.
//
// Nunca imprime valores, solo nombres. Si algo sale mal, el mensaje dice que
// variable fue, no cuanto vale.

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const archivo = resolve(raiz, '.env.local')

// Lo que NO va a Vercel:
//   - Los alias sin prefijo: son solo para los scripts de esta carpeta.
//   - Lo que pone la CLI de Vercel por su cuenta.
const NO_SUBIR = new Set([
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VERCEL_OIDC_TOKEN',
])

// Sin estas el panel no arranca o el sync no corre.
const OBLIGATORIAS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
  'SHOPIFY_SHOP_DOMAIN',
  'SHOPIFY_ADMIN_TOKEN',
  'APP_URL',
  'CRON_SECRET',
  'STORE_CURRENCY',
]

const entorno = process.argv[2] ?? 'production'

if (!existsSync(archivo)) {
  console.error('\nNo encontré .env.local. Copiá .env.example y completalo.\n')
  process.exit(1)
}

/** Parser mínimo: KEY=valor, ignora comentarios y comentarios al final de línea. */
function leerEnv(texto) {
  const vars = new Map()
  for (const linea of texto.split('\n')) {
    const limpia = linea.trim()
    if (!limpia || limpia.startsWith('#')) continue
    const corte = limpia.indexOf('=')
    if (corte === -1) continue
    const nombre = limpia.slice(0, corte).trim()
    let valor = limpia.slice(corte + 1)

    // El comentario se saca ANTES de recortar los espacios. Al reves, una linea
    // como `CLAVE=            # falta` queda con valor "# falta" en vez de
    // vacio, y termina subiendo esa cadena como si fuera el secreto. Paso.
    const marca = valor.indexOf('#')
    if (marca !== -1) valor = valor.slice(0, marca)
    valor = valor.trim()
    // Comillas opcionales.
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1)
    }
    vars.set(nombre, valor)
  }
  return vars
}

function vercel(args, entrada) {
  return execFileSync('vercel', args, {
    cwd: raiz,
    input: entrada,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
}

const vars = leerEnv(readFileSync(archivo, 'utf8'))

const aSubir = []
const vacias = []
for (const [nombre, valor] of vars) {
  if (NO_SUBIR.has(nombre)) continue
  if (valor === '') {
    vacias.push(nombre)
    continue
  }
  aSubir.push([nombre, valor])
}

if (aSubir.length === 0) {
  console.error('\n.env.local no tiene ningún valor completo todavía.\n')
  process.exit(1)
}

console.log(`\nSubiendo ${aSubir.length} variables a Vercel (${entorno})\n`)

let fallaron = 0
for (const [nombre, valor] of aSubir) {
  try {
    // Se borra antes de agregar: `vercel env add` no pisa una que ya existe.
    // Si no existía, el rm falla y no pasa nada.
    try {
      vercel(['env', 'rm', nombre, entorno, '--yes'])
    } catch {
      /* no existía */
    }
    vercel(['env', 'add', nombre, entorno], valor)
    console.log(`  ok    ${nombre}`)
  } catch (e) {
    const detalle = (e.stderr || e.stdout || e.message || '').toString().trim().split('\n').pop()
    console.log(`  FALLA ${nombre} — ${detalle}`)
    fallaron++
  }
}

const faltanObligatorias = OBLIGATORIAS.filter((n) => !vars.get(n))

if (vacias.length) {
  console.log(`\nSin completar en .env.local (no se subieron):`)
  for (const n of vacias) {
    console.log(`  ${OBLIGATORIAS.includes(n) ? '!' : '-'} ${n}`)
  }
}

if (faltanObligatorias.length) {
  console.log(`\nLas marcadas con ! son obligatorias: sin ellas el sync no corre.`)
}

console.log(
  fallaron === 0
    ? `\nListo. Ahora volvé a desplegar para que Vercel las tome:\n  vercel redeploy $(vercel ls --yes 2>/dev/null | head -1)\n  (o en la web: Deployments → ⋯ → Redeploy)\n`
    : `\n${fallaron} fallaron. Revisá que estés logueado: vercel whoami\n`,
)

process.exit(fallaron === 0 ? 0 : 1)
