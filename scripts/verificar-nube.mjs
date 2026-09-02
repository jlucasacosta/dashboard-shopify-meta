#!/usr/bin/env node
// Revisa que un proyecto de Supabase en la nube quedo bien armado para el panel.
//
//   npm run nube:verificar
//
// Corre despues de crear el proyecto y aplicar las migraciones, y antes de
// pelearte con Vercel. Existe porque el camino a la nube falla distinto que el
// local: aca no hay un error rojo en la terminal, hay un panel que carga y
// muestra numeros que parecen bien.
//
// Lee la URL y la anon key de .env.local (o de las variables de entorno).
//
// Las revisiones profundas necesitan la service key, que NO va en ningun
// archivo del repo. Pasala solo para esta corrida:
//
//   SUPABASE_SERVICE_KEY=eyJ... npm run nube:verificar
//
// Sin ella igual sirve: chequea que las tablas existan y que nadie pueda
// escribir sin permiso.

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// --- de donde salen las credenciales ---------------------------------------

function leerEnv(archivo) {
  if (!existsSync(archivo)) return {}
  const out = {}
  for (const linea of readFileSync(archivo, 'utf-8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...leerEnv('.env.development'), ...leerEnv('.env.local'), ...process.env }
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const SERVICE = process.env.SUPABASE_SERVICE_KEY

if (!URL || !ANON) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  console.error('Copiá .env.example a .env.local y completá los dos valores.')
  process.exit(1)
}

const esLocal = URL.includes('127.0.0.1') || URL.includes('localhost')

// --- reporte ---------------------------------------------------------------

const fallas = []
const avisos = []
function ok(t)    { console.log(`  ok    ${t}`) }
function falla(t, detalle) { console.log(`  FALLA ${t}`); if (detalle) console.log(`        ${detalle}`); fallas.push(t) }
function aviso(t) { console.log(`  aviso ${t}`); avisos.push(t) }
function titulo(t){ console.log(`\n${t}`) }

const rest = (ruta, opciones = {}, clave = ANON) =>
  fetch(`${URL}/rest/v1/${ruta}`, {
    ...opciones,
    headers: { apikey: clave, Authorization: `Bearer ${opciones.token ?? clave}`,
               'Content-Type': 'application/json', ...(opciones.headers ?? {}) },
  })

console.log(`Verificando ${URL}`)
if (esLocal) console.log('(es tu Supabase local, no la nube)')

// --- 1. las migraciones se aplicaron ---------------------------------------

titulo('Tablas y vistas')

// Con RLS puesto y sin sesion, PostgREST devuelve 200 y una lista vacia: las
// filas se filtran, la tabla existe. Si la tabla NO existe devuelve 404. Esa
// diferencia es lo que distingue "faltan migraciones" de "faltan permisos".
const ESPERADAS = [
  'settings', 'daily_sales', 'daily_traffic', 'daily_products',
  'daily_ad_spend', 'daily_ad_campaigns', 'fx_rates', 'sync_log',
  'daily_metrics',
]

for (const t of ESPERADAS) {
  const r = await rest(`${t}?select=*&limit=1`)
  if (r.status === 404) falla(`${t} no existe`, 'faltan migraciones: corré supabase db push o pegá los .sql en el SQL Editor')
  else if (r.ok || r.status === 401 || r.status === 403) ok(t)
  else falla(`${t} respondió ${r.status}`, (await r.text()).slice(0, 120))
}

// period_totals es una funcion, no una tabla: se prueba llamandola.
const rpc = await rest('rpc/period_totals', {
  method: 'POST',
  body: JSON.stringify({ desde: '2020-01-01', hasta: '2020-01-02' }),
})
if (rpc.status === 404) falla('period_totals no existe', 'falta la migración 0004')
else ok('period_totals')

// --- 2. nadie escribe sin permiso ------------------------------------------

titulo('El panel es de solo lectura')

const escritura = await rest('daily_ad_spend', {
  method: 'POST',
  body: JSON.stringify({ date: '2020-01-01', ad_account_id: 'verificacion', spend: 1,
                         currency: 'USD', source: 'mcp', impressions: 0, clicks: 0 }),
})
if (escritura.ok) falla('una clave anónima pudo escribir en daily_ad_spend',
                        'revisá que RLS esté activo y que no haya policies de insert')
else ok(`escritura anónima rechazada (${escritura.status})`)

// --- 3. lo que solo se ve con la service key -------------------------------

if (!SERVICE) {
  titulo('Revisiones profundas')
  aviso('sin SUPABASE_SERVICE_KEY no puedo revisar la moneda ni probar una sesión real')
  console.log('        SUPABASE_SERVICE_KEY=eyJ... npm run nube:verificar')
} else {
  titulo('Moneda de la tienda')

  const config = JSON.parse(readFileSync('sync.config.json', 'utf-8'))
  const filas = await (await rest('settings?select=key,value&key=eq.store_currency', {}, SERVICE)).json()
  const guardada = Array.isArray(filas) ? filas[0]?.value : undefined

  if (!guardada) {
    falla('settings.store_currency no está',
          `el panel va a formatear todo en la moneda equivocada. Corré /sync: la escribe desde storeCurrency (${config.storeCurrency}).`)
  } else if (guardada !== config.storeCurrency) {
    falla(`settings.store_currency dice ${guardada} y sync.config.json dice ${config.storeCurrency}`,
          'los montos se van a mostrar con el símbolo equivocado. Corré /sync para alinearlos.')
  } else {
    ok(`store_currency = ${guardada}, igual que sync.config.json`)
  }

  titulo('Un usuario logueado: lee pero no escribe')

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
  const email = 'verificacion-nube@tutienda.com'
  const password = `verif-${Math.abs(Date.now() % 1e8)}`

  const previos = await admin.auth.admin.listUsers()
  const viejo = previos.data?.users?.find((u) => u.email === email)
  if (viejo) await admin.auth.admin.deleteUser(viejo.id)

  const { error: errAlta } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (errAlta) {
    falla('no pude crear el usuario de prueba', errAlta.message)
  } else {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } })
    const { data: sesion, error: errLogin } = await anon.auth.signInWithPassword({ email, password })

    if (errLogin || !sesion?.session) {
      falla('no pude iniciar sesión con el usuario de prueba', errLogin?.message)
    } else {
      const token = sesion.session.access_token

      const lectura = await rest('daily_sales?select=date&limit=1', { token })
      if (lectura.ok) ok('lectura autenticada')
      else falla(`lectura autenticada respondió ${lectura.status}`, 'falta la policy de select de la migración 0003')

      const escrituraAuth = await rest('daily_ad_spend', {
        method: 'POST', token,
        body: JSON.stringify({ date: '2020-01-01', ad_account_id: 'verificacion', spend: 1,
                               currency: 'USD', source: 'mcp', impressions: 0, clicks: 0 }),
      })
      if (escrituraAuth.ok) {
        falla('un usuario logueado pudo escribir en daily_ad_spend',
              'quedó una policy de insert o update: revisá la migración 0007')
      } else {
        ok(`escritura autenticada rechazada (${escrituraAuth.status})`)
      }
    }

    const { data: despues } = await admin.auth.admin.listUsers()
    const creado = despues?.users?.find((u) => u.email === email)
    if (creado) await admin.auth.admin.deleteUser(creado.id)
  }
}

// --- 4. lo que este script no puede ver ------------------------------------

titulo('Esto revisalo a mano (no se puede desde acá)')
console.log('  - Authentication → Emails → Magic Link tiene que usar {{ .Token }},')
console.log('    no {{ .ConfirmationURL }}. Copiá supabase/templates/magic_link.html.')
console.log('    Si no, el correo llega con un link y la pantalla te pide 6 dígitos.')
console.log('  - Authentication → URL Configuration: agregá la URL de Vercel')
console.log('    a los redirect URLs.')

// --- cierre ----------------------------------------------------------------

console.log('')
if (fallas.length === 0) {
  console.log(avisos.length === 0
    ? 'Todo bien. El proyecto está listo.'
    : `Sin fallas, con ${avisos.length} aviso(s).`)
  process.exit(0)
}
console.log(`${fallas.length} problema(s):`)
for (const f of fallas) console.log(`  - ${f}`)
process.exit(1)
