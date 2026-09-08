// Carga app_url y cron_secret en la tabla config_servidor, leyendolos de
// .env.local.
//
//   npm run config:cargar
//
// Por que existe: el cron_secret tiene que estar en dos lugares y ser el mismo
// en los dos — en Vercel (lo lee el panel para autorizar el pedido) y en
// config_servidor (lo lee disparar_sync para firmarlo). Hasta ahora el segundo
// se cargaba pegando el secreto a mano en una consulta SQL, que es la unica
// parte de la instalacion donde un secreto tenia que pasar por la pantalla.
//
// Aca el valor va del archivo a la base y no se imprime nunca. Si algo falla,
// el mensaje dice que variable fue, no cuanto vale.
//
// La service key va por variable de entorno, igual que en los demas scripts:
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... npm run config:cargar
//
// Si no la pasas, la busca en .env.local.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const archivo = resolve(raiz, '.env.local')

/** Parser minimo: KEY=valor, ignora comentarios. */
function leerEnv(texto) {
  const vars = new Map()
  for (const linea of texto.split('\n')) {
    const limpia = linea.trim()
    if (!limpia || limpia.startsWith('#')) continue
    const corte = limpia.indexOf('=')
    if (corte === -1) continue
    const nombre = limpia.slice(0, corte).trim()
    let valor = limpia.slice(corte + 1).trim()
    if (valor.length >= 2 && valor[0] === valor.at(-1) && (valor[0] === '"' || valor[0] === "'")) {
      valor = valor.slice(1, -1)
    }
    if (valor) vars.set(nombre, valor)
  }
  return vars
}

const archivoVars = existsSync(archivo)
  ? leerEnv(readFileSync(archivo, 'utf8'))
  : new Map()

const tomar = (nombre) => process.env[nombre] ?? archivoVars.get(nombre)

const url = tomar('SUPABASE_URL') ?? tomar('NEXT_PUBLIC_SUPABASE_URL')
const serviceKey = tomar('SUPABASE_SERVICE_KEY')
const appUrl = tomar('APP_URL')
const cronSecret = tomar('CRON_SECRET')

const faltan = []
if (!url) faltan.push('SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL)')
if (!serviceKey) faltan.push('SUPABASE_SERVICE_KEY')
if (!appUrl) faltan.push('APP_URL')
if (!cronSecret) faltan.push('CRON_SECRET')

if (faltan.length > 0) {
  console.error(`\nMe faltan estas variables: ${faltan.join(', ')}.`)
  console.error('Completalas en .env.local o pasalas por variable de entorno.\n')
  process.exit(1)
}

// Una barra al final rompe el pedido del cron: la URL se arma concatenando.
const appUrlLimpia = appUrl.replace(/\/+$/, '')
if (appUrlLimpia !== appUrl) {
  console.log('APP_URL tenia una barra al final. La saque antes de guardarla.')
}

const respuesta = await fetch(`${url}/rest/v1/config_servidor`, {
  method: 'POST',
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    // Vuelve a cargar la config si ya estaba: es el caso de "cambie la URL".
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify([
    { key: 'app_url', value: appUrlLimpia },
    { key: 'cron_secret', value: cronSecret },
  ]),
})

if (!respuesta.ok) {
  const detalle = await respuesta.text()
  console.error(`\nNo pude guardar la config (${respuesta.status}).`)
  // El cuerpo de PostgREST no incluye los valores que mandamos, solo el error.
  console.error(detalle.slice(0, 300))
  if (respuesta.status === 401 || respuesta.status === 403) {
    console.error('\nEsa clave no es la service_role. config_servidor no tiene')
    console.error('ninguna policy: solo la service key la puede tocar.\n')
  }
  process.exit(1)
}

console.log('\nGuardado en config_servidor: app_url y cron_secret.')
console.log(`app_url = ${appUrlLimpia}`)
console.log('cron_secret = (guardado, no se imprime)')
console.log('\nProbalo pidiendole a Claude que corra:  select disparar_sync(\'hoy\');\n')
