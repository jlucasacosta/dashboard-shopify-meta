#!/usr/bin/env node
// Revisa la instalacion ENTERA, de punta a punta, contra lo que esta corriendo.
//
//   SUPABASE_SERVICE_KEY=eyJ... npm run verificar
//
// Que lo distingue de los otros scripts: `nube:verificar` mira la base,
// `shopify:probar` mira Shopify. Este sigue el camino que recorre un dato real
// —Vercel, el cron, la base, las cuatro fuentes, los relojes— y busca los
// errores que NO se ven mirando el panel.
//
// Existe por una razon concreta: en la primera instalacion real aparecieron
// seis bugs, y los peores no rompian nada a la vista. El sync decia `ok` y
// escribia filas mientras los numeros no cerraban con Shopify. Dos jobs de
// pg_cron arrancaban en el mismo milisegundo y el error culpaba a la red. Un
// panel que carga y muestra numeros no prueba nada; esto si.
//
// Cada revision explica que significa si falla. Un verificador que dice
// "FALLA: cron" y no dice que hacer obliga a leer el codigo, que es justo lo
// que trata de evitar.

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function leerEnv(archivo) {
  if (!existsSync(archivo)) return {}
  const out = {}
  for (const linea of readFileSync(archivo, 'utf-8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...leerEnv('.env.local'), ...process.env }

const APP_URL = (env.APP_URL ?? '').replace(/\/+$/, '')
const SUPA_URL = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_KEY

const fallas = []
const avisos = []

const ok = (t) => console.log(`  ok    ${t}`)
const aviso = (t, d) => { console.log(`  aviso ${t}`); if (d) console.log(`        ${d}`); avisos.push(t) }
const falla = (t, d) => { console.log(`  FALLA ${t}`); if (d) console.log(`        ${d}`); fallas.push(t) }
const titulo = (t) => console.log(`\n${t}`)

if (!APP_URL || !SUPA_URL || !SERVICE) {
  console.error('\nMe faltan datos para revisar la instalacion.\n')
  if (!APP_URL) console.error('  APP_URL             la URL del panel, en .env.local')
  if (!SUPA_URL) console.error('  SUPABASE_URL        la URL del proyecto de Supabase')
  if (!SERVICE) console.error('  SUPABASE_SERVICE_KEY  pasala solo para esta corrida')
  console.error('\n  SUPABASE_SERVICE_KEY=eyJ... npm run verificar\n')
  process.exit(1)
}

const db = createClient(SUPA_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

console.log(`Verificando ${APP_URL}`)

// ------------------------------------------------------------------- Panel

titulo('Panel')

let htmlLogin = ''
try {
  const res = await fetch(`${APP_URL}/login`, { redirect: 'follow' })
  htmlLogin = await res.text()

  if (!res.ok) {
    falla(`la pantalla de entrada responde ${res.status}`, 'Mira los logs del deploy en Vercel.')
  } else if (/Falta la variable de entorno/i.test(htmlLogin)) {
    const cual = htmlLogin.match(/Falta la variable de entorno ([A-Z_]+)/)?.[1] ?? 'una variable'
    falla(`al panel le falta ${cual}`, 'Cargala con npm run env:subir y volve a desplegar.')
  } else if (/contrase/i.test(htmlLogin)) {
    ok('la pantalla de entrada carga y pide correo y contraseña')
  } else {
    aviso('la pantalla de entrada carga pero no reconozco el formulario')
  }
} catch (e) {
  falla('no pude abrir el panel', String(e.message ?? e))
}

// La proteccion de Vercel viene ENCENDIDA en los proyectos nuevos y rompe el
// producto entero sin que se note: intercepta al cron y al webhook antes de que
// lleguen al codigo, y Shopify termina desactivando la suscripcion.
try {
  const res = await fetch(`${APP_URL}/api/cron/sync?job=hoy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  const cuerpo = await res.text()

  if (/<!DOCTYPE|<html/i.test(cuerpo)) {
    falla(
      'la proteccion de Vercel esta encendida',
      'Vercel contesta HTML de login en vez de dejar pasar al codigo. El cron y el ' +
        'webhook de Shopify reciben 401 y nunca llegan. Apagala en Settings > ' +
        'Deployment Protection > Vercel Authentication.',
    )
  } else if (res.status === 401) {
    ok('la proteccion de Vercel esta apagada y /api/* llega al codigo')
  } else if (res.status === 500) {
    falla(
      'al endpoint del cron le falta configuracion',
      cuerpo.slice(0, 200),
    )
  } else {
    aviso(`el endpoint del cron sin secreto contesto ${res.status}`, cuerpo.slice(0, 120))
  }
} catch (e) {
  falla('no pude llegar al endpoint del cron', String(e.message ?? e))
}

// El middleware agarra todo menos archivos estaticos. Sin la excepcion de
// rutas de maquina, el webhook de Shopify recibe un 302 al login en vez de un
// 200, y Shopify desactiva la suscripcion. Una redireccion no parece un error.
try {
  const res = await fetch(`${APP_URL}/api/webhooks/shopify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    redirect: 'manual',
  })
  if (res.status >= 300 && res.status < 400) {
    falla(
      'el middleware manda el webhook de Shopify al login',
      `Contesto ${res.status} en vez de rechazar la firma. Revisa esRutaDeMaquina en proxy.ts.`,
    )
  } else if (res.status === 401) {
    ok('el webhook rechaza una firma invalida, como corresponde')
  } else {
    aviso(`el webhook contesto ${res.status} a un cuerpo sin firma`)
  }
} catch (e) {
  falla('no pude llegar al webhook de Shopify', String(e.message ?? e))
}

// ---------------------------------------------------------- Base de datos

titulo('Base de datos')

const { data: cfg } = await db.from('config_servidor').select('key, value')
const porClave = Object.fromEntries((cfg ?? []).map((r) => [r.key, r.value]))

if (!porClave.app_url || !porClave.cron_secret) {
  falla(
    'config_servidor no tiene app_url y cron_secret',
    'Sin eso, disparar_sync() no puede firmar el pedido. Corre npm run config:cargar.',
  )
} else if (porClave.app_url.replace(/\/+$/, '') !== APP_URL) {
  falla(
    'la app_url de la base no es la del panel',
    `La base dice ${porClave.app_url} y estoy verificando ${APP_URL}. El cron le pega a otro lado.`,
  )
} else {
  ok('config_servidor apunta al panel correcto')
}

// ----------------------------------------------------------------- El sync

titulo('Sync')

// La prueba de fuego: disparar_sync usa el secreto de la base contra el panel.
// Si da 200, los dos secretos coinciden. No hace falta ver ninguno.
const { data: pedido, error: errPedido } = await db.rpc('disparar_sync', { job: 'hoy' })

if (errPedido) {
  falla('no pude disparar el sync', errPedido.message)
} else {
  // pg_net es asincrono: la fila de la respuesta aparece unos segundos despues.
  let respuesta = null
  for (let intento = 0; intento < 12 && !respuesta; intento++) {
    await new Promise((r) => setTimeout(r, 2000))
    // Por RPC y no leyendo net._http_response directo: PostgREST no expone el
    // schema `net`, asi que desde aca esa tabla no existe. La funcion la
    // agrega la migracion 0015.
    const { data } = await db.rpc('respuesta_sync', { pedido })
    respuesta = Array.isArray(data) ? data[0] : data
  }

  if (!respuesta) {
    aviso(
      'el panel no contesto en 24 segundos',
      'Puede ser un arranque en frio. Volve a correr esto en un minuto.',
    )
  } else if (respuesta.status_code === 401) {
    falla(
      'el cron_secret de la base no coincide con el de Vercel',
      'Corre npm run config:cargar y volve a desplegar.',
    )
  } else if (respuesta.status_code === 404) {
    falla('la app_url esta mal escrita', 'El panel contesto 404.')
  } else if (respuesta.status_code !== 200) {
    falla(`el sync contesto ${respuesta.status_code}`, String(respuesta.cuerpo ?? '').slice(0, 200))
  } else {
    ok('el cron esta autorizado: la base le pega al panel y contesta 200')
  }
}

// Que dijo cada fuente en su ultima corrida.
const { data: logs } = await db
  .from('sync_log')
  .select('source, status, rows_written, error, started_at')
  .order('started_at', { ascending: false })
  .limit(40)

const ultimaDe = {}
for (const l of logs ?? []) if (!ultimaDe[l.source]) ultimaDe[l.source] = l

if (Object.keys(ultimaDe).length === 0) {
  falla('sync_log esta vacio', 'El sync nunca corrio. Sin esto no hay datos.')
}

for (const [fuente, l] of Object.entries(ultimaDe)) {
  if (l.status === 'error') {
    falla(`${fuente} fallo en su ultima corrida`, String(l.error ?? '').split('\n')[0].slice(0, 160))
  } else if (l.status === 'skipped') {
    aviso(`${fuente} se salteo`, 'Le faltan variables, o falta volver a desplegar.')
  } else {
    ok(`${fuente} corrio bien (${l.rows_written} filas)`)
  }
}

// ------------------------------------------------------------- Los relojes

titulo('Relojes')

// Por RPC: PostgREST tampoco expone el schema `cron`. Ver migracion 0015.
const { data: jobs, error: errJobs } = await db.rpc('estado_relojes')

if (errJobs || !jobs) {
  falla(
    'no pude leer el estado de los relojes',
    errJobs?.message?.includes('estado_relojes')
      ? 'Falta la migracion 0015_diagnostico.sql.'
      : 'Corre select programar_sync() si todavia no lo hiciste.',
  )
} else {
  const esperados = ['sync-hoy', 'sync-reciente', 'sync-diario', 'sync-backfill']
  const faltantes = esperados.filter((n) => !jobs.some((j) => j.nombre === n && j.activo))

  if (faltantes.length > 0) {
    falla(
      `faltan relojes: ${faltantes.join(', ')}`,
      'Sin ellos el panel no se actualiza solo. Corre select programar_sync().',
    )
  } else {
    ok('los cuatro relojes estan activos')
  }

  // Dos jobs en el mismo minuto se pelean por daily_sales y PostgREST corta uno
  // con 504. En sync_log queda "Gateway Timeout", que parece un problema de red.
  const minutosDe = (schedule) => {
    const campo = schedule.split(/\s+/)[0]
    const minutos = new Set()
    for (const parte of campo.split(',')) {
      const [rango, paso] = parte.split('/')
      const salto = paso ? Number(paso) : 1
      let desde = 0
      let hasta = 59
      if (rango !== '*') {
        const [a, b] = rango.split('-')
        desde = Number(a)
        hasta = b === undefined ? (paso ? 59 : Number(a)) : Number(b)
      }
      for (let m = desde; m <= hasta; m += salto) minutos.add(m)
    }
    return minutos
  }

  const choques = []
  for (let i = 0; i < jobs.length; i++) {
    for (let k = i + 1; k < jobs.length; k++) {
      const a = jobs[i]
      const b = jobs[k]
      // El diario corre una vez al dia: solo choca si ademas comparte la hora.
      const horaA = a.cadencia.split(/\s+/)[1]
      const horaB = b.cadencia.split(/\s+/)[1]
      if (horaA !== '*' && horaB !== '*' && horaA !== horaB) continue

      const comunes = [...minutosDe(a.cadencia)].filter((m) => minutosDe(b.cadencia).has(m))
      if (comunes.length > 0) choques.push(`${a.nombre} y ${b.nombre} (minuto ${comunes[0]})`)
    }
  }

  if (choques.length > 0) {
    falla(
      `hay relojes que arrancan juntos: ${choques.join('; ')}`,
      'Los dos escriben daily_sales a la vez y PostgREST corta uno con 504. En ' +
        'sync_log aparece como "Gateway Timeout", que parece un problema de red. ' +
        'Aplica la migracion 0014 y volve a correr select programar_sync().',
    )
  } else {
    ok('ningun reloj comparte minuto con otro')
  }
}

// ------------------------------------------------------------- Los numeros

titulo('Datos')

const { count: diasVentas } = await db
  .from('daily_sales')
  .select('date', { count: 'exact', head: true })

if (!diasVentas) {
  aviso('todavia no hay ventas cargadas', 'Si la tienda vende, revisa el sync_log de arriba.')
} else {
  ok(`${diasVentas} dia(s) de ventas en la base`)
}

const { data: estado } = await db
  .from('sync_state')
  .select('completo, cursor_desde')
  .eq('fuente', 'backfill')
  .maybeSingle()

if (estado?.completo) {
  ok('el historico termino de cargarse')
} else if (estado?.cursor_desde) {
  aviso(`el historico sigue cargando (va por ${estado.cursor_desde})`, 'Puede tardar una hora. Se apaga solo.')
}

// Un dia con gasto que no se pudo convertir de moneda hace que el total de ese
// dia sea NULL. El panel lo muestra como "—" a proposito, pero conviene saber.
const { data: totales } = await db.rpc('period_totals', {
  desde: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  hasta: new Date().toISOString().slice(0, 10),
})
const t = Array.isArray(totales) ? totales[0] : totales

if (t?.dias_sin_tasa > 0) {
  aviso(
    `${t.dias_sin_tasa} dia(s) sin tipo de cambio en los ultimos 30`,
    'Esos dias el panel muestra "—" en vez de un total incompleto. Es a proposito.',
  )
} else if (t) {
  ok('todos los dias con gasto tienen su tipo de cambio')
}

// --------------------------------------------------------------- Conexiones

titulo('Conexiones')

const { data: conexiones } = await db
  .from('conexiones')
  .select('fuente, cuenta_id, expires_at, ultimo_error')

for (const c of conexiones ?? []) {
  if (c.ultimo_error) {
    falla(`la conexion de ${c.fuente} tiene un error`, String(c.ultimo_error).slice(0, 160))
  } else if (new Date(c.expires_at).getTime() <= Date.now()) {
    aviso(
      `el permiso de ${c.fuente} vencio`,
      c.fuente === 'meli'
        ? 'Se renueva solo. Si no, reconecta desde Configuracion > Integraciones.'
        : 'Se renueva solo en la proxima corrida.',
    )
  } else {
    ok(`${c.fuente} conectada (cuenta ${c.cuenta_id})`)
  }
}

if (!conexiones?.some((c) => c.fuente === 'meli')) {
  aviso('Mercado Libre no esta conectado', 'Es opcional. Se conecta desde Configuracion > Integraciones.')
}

// ----------------------------------------------------------------- Resumen

console.log('')

if (fallas.length === 0) {
  console.log(
    avisos.length === 0
      ? 'Listo: la instalacion esta completa.'
      : `Sin fallas, con ${avisos.length} aviso(s).`,
  )
  process.exit(0)
}

console.log(`${fallas.length} problema(s):`)
for (const f of fallas) console.log(`  - ${f}`)
console.log('\nCada uno dice arriba como se arregla. Si algo no cierra, docs/08-problemas-comunes.md.')
process.exit(1)
