#!/usr/bin/env node
// Igual que probar-realtime.mjs, pero como usuario AUTENTICADO, que es el caso
// real del dashboard.
//
//   node scripts/probar-realtime-auth.mjs
//
// Importa porque las policies de RLS son "to authenticated". Si el socket de
// Realtime no lleva el JWT del usuario, el canal igual dice SUBSCRIBED y no
// llega nunca nada: el fallo más silencioso de todos.

import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'

// Valores de Supabase corriendo en tu maquina. Son publicos e iguales para todo
// el mundo, asi que el script anda recien clonado, sin exportar nada.
const URL_LOCAL = 'http://127.0.0.1:54321'
const ANON_LOCAL =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_LOCAL =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const URL = process.env.SUPABASE_URL ?? URL_LOCAL
const ANON = process.env.SUPABASE_ANON_KEY ?? ANON_LOCAL
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? SERVICE_LOCAL

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
execFileSync('node', ['scripts/psql.mjs', '-c',
  'update daily_sales set updated_at = now() where date = current_date;'],
  { stdio: 'ignore' })

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
