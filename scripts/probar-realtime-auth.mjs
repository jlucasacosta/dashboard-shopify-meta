#!/usr/bin/env node
// Prueba Realtime como usuario AUTENTICADO, que es el caso real del dashboard.
//
//   node scripts/probar-realtime-auth.mjs
//
// Importa porque las policies de RLS son "to authenticated". Si el socket de
// Realtime no lleva el JWT del usuario, el canal igual dice SUBSCRIBED y no
// llega nunca nada: el fallo más silencioso de todos.

import { createClient } from '@supabase/supabase-js'

// Corré el script con las credenciales de tu proyecto:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... SUPABASE_SERVICE_KEY=eyJ... npm run test:realtime
const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_KEY

if (!URL || !ANON || !SERVICE) {
  console.error('Faltan SUPABASE_URL, SUPABASE_ANON_KEY o SUPABASE_SERVICE_KEY.')
  console.error('Las dos primeras están en tu .env.local; la service key sale de')
  console.error('Project Settings > API Keys y no se guarda en ningún archivo.')
  process.exit(1)
}

// 1. Crear sesión real para un usuario de prueba, usando la API de admin.
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const email = 'realtime-test@tutienda.com'

// Usuario descartable con contraseña: es la vía más directa para obtener una
// sesión real en un script. El dashboard usa magic link, pero la sesión que
// resulta es la misma y es lo único que importa acá.
const password = 'prueba-realtime-1234'
await admin.auth.admin.deleteUser(
  (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email)?.id ?? '',
).catch(() => {})

const { error: errUser } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})
if (errUser) { console.error('No se pudo crear el usuario:', errUser.message); process.exit(1) }

const cliente = createClient(URL, ANON, { auth: { persistSession: false } })
const { data: sesion, error: errOtp } = await cliente.auth.signInWithPassword({ email, password })
if (errOtp) { console.error('No se pudo iniciar sesión:', errOtp.message); process.exit(1) }

const token = sesion.session?.access_token
console.log('1) sesión creada para', sesion.user?.email)

// 2. Pasarle el token al socket de Realtime.
//    Sin esto el canal se autentica como anon y RLS lo deja sin eventos.
await cliente.realtime.setAuth(token)
console.log('2) token pasado a realtime.setAuth()')

const recibidos = []
const canal = cliente
  .channel('prueba-auth')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_sales' }, (p) => {
    recibidos.push(p.eventType)
  })

const estado = await new Promise((res) => {
  canal.subscribe((s) => { if (['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(s)) res(s) })
  setTimeout(() => res('SIN_RESPUESTA'), 10000)
})
console.log('3) estado del canal:', estado)
if (estado !== 'SUBSCRIBED') process.exit(1)

await new Promise((r) => setTimeout(r, 1500))
console.log('4) provocando un UPDATE...')
// Con la service key el UPDATE se saltea RLS, que es justo lo que queremos:
// probamos si el evento LLEGA, no si el escritor tenía permiso. Tocamos una
// sola fila, la más reciente, y solo su updated_at: ninguna métrica cambia.
const { data: fila } = await admin
  .from('daily_sales')
  .select('date')
  .order('date', { ascending: false })
  .limit(1)
  .maybeSingle()

if (!fila) {
  console.error('daily_sales está vacía: no hay ninguna fila para tocar.')
  console.error('Cargá datos (seed o /sync) y volvé a correr esto.')
  process.exit(1)
}

const { error: errUpdate } = await admin
  .from('daily_sales')
  .update({ updated_at: new Date().toISOString() })
  .eq('date', fila.date)
if (errUpdate) {
  console.error('No se pudo tocar daily_sales:', errUpdate.message)
  process.exit(1)
}

await new Promise((r) => setTimeout(r, 5000))
console.log('5) eventos recibidos:', recibidos.length, recibidos)

await cliente.removeChannel(canal)
await admin.auth.admin.deleteUser(sesion.user.id).catch(() => {})

if (recibidos.length === 0) {
  console.error('FALLA: usuario autenticado suscrito pero sin eventos.')
  process.exit(1)
}
console.log('OK: un usuario autenticado recibe eventos de Realtime.')
process.exit(0)
