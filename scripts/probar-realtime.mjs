#!/usr/bin/env node
// Prueba que la cadena de Realtime funcione: se suscribe, provoca un cambio en
// la base, y verifica que el evento llegue.
//
//   node scripts/probar-realtime.mjs
//
// Sirve para separar "Realtime no anda" de "mi componente no anda". Si esto
// pasa, el problema está en el front. Si falla, está en la base o en la
// configuración de Supabase.

import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'

// Service key de Supabase local: publica e igual para todo el mundo, asi que el
// script anda recien clonado. Para tu proyecto de la nube, pasa las dos:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_KEY_PRUEBA=... node scripts/probar-realtime.mjs
//
// Va la service key y no la anon a proposito: las policies de RLS son
// "to authenticated", asi que con la anon este script da 0 eventos SIEMPRE,
// incluso con todo bien configurado. Con la service key, 0 eventos significa
// que el problema esta de verdad en la plomeria de Realtime, que es lo que este
// script existe para responder. Para probar el caso real del panel (usuario
// logueado, con RLS), usa `npm run test:realtime`.
const KEY_LOCAL =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_KEY_PRUEBA ?? KEY_LOCAL

const supabase = createClient(URL, KEY, { realtime: { params: { eventsPerSecond: 10 } } })
const recibidos = []

const canal = supabase
  .channel('prueba')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_sales' }, (p) => {
    recibidos.push(p.eventType)
  })

const estado = await new Promise((res) => {
  canal.subscribe((s) => { if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') res(s) })
  setTimeout(() => res('SIN_RESPUESTA'), 10000)
})
console.log('1) estado del canal:', estado)
if (estado !== 'SUBSCRIBED') process.exit(1)

// Dar tiempo a que el servidor registre la suscripción antes de disparar.
await new Promise((r) => setTimeout(r, 1500))

console.log('2) provocando un UPDATE en daily_sales...')
execFileSync('node', ['scripts/psql.mjs', '-c',
  'update daily_sales set updated_at = now() where date = current_date;'],
  { stdio: 'ignore' })

await new Promise((r) => setTimeout(r, 5000))

console.log('3) eventos recibidos:', recibidos.length, recibidos)
await supabase.removeChannel(canal)

if (recibidos.length === 0) {
  console.error('FALLA: el canal quedó suscrito pero no llegó ningún evento.')
  console.error('Revisá: la tabla en la publicación supabase_realtime, REPLICA IDENTITY FULL,')
  console.error('y que el rol de esta clave pase las policies de RLS.')
  console.error('')
  console.error('Si pasaste la anon key en SUPABASE_KEY_PRUEBA, 0 eventos es lo esperado:')
  console.error('las policies son "to authenticated". Probá con `npm run test:realtime`.')
  process.exit(1)
}
console.log('OK: Realtime entrega eventos.')
process.exit(0)
