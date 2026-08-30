#!/usr/bin/env node
// Da de alta a alguien para que pueda entrar al panel.
//
//   npm run usuario:crear -- vos@tutienda.com
//
// Hace falta porque el panel es privado: nadie se da de alta solo. Es lo mismo
// que hacer Authentication > Users > Add user en Supabase, pero sin salir de
// la terminal.
//
// Para tu Supabase en la nube, pasale las credenciales del proyecto:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... npm run usuario:crear -- vos@tutienda.com
//
// La service key la sacás de Project Settings > API. NO la guardes en ningún
// archivo del proyecto: se saltea todos los permisos.

// Estos son los valores de Supabase corriendo en tu máquina. Son públicos e
// iguales para todo el mundo, así que no son un secreto.
const URL_LOCAL = 'http://127.0.0.1:54321'
const KEY_LOCAL =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const url = process.env.SUPABASE_URL ?? URL_LOCAL
const key = process.env.SUPABASE_SERVICE_KEY ?? KEY_LOCAL
const email = (process.argv[2] ?? '').trim().toLowerCase()

if (!email || !email.includes('@')) {
  console.error('Uso: npm run usuario:crear -- vos@tutienda.com')
  process.exit(1)
}

if (url !== URL_LOCAL && key === KEY_LOCAL) {
  console.error(
    'Pusiste una URL de la nube pero la clave sigue siendo la local.\n' +
    'Pasá también SUPABASE_SERVICE_KEY con la service key de tu proyecto.',
  )
  process.exit(1)
}

const r = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  // email_confirm evita que le pidamos confirmar la casilla: el propio código
  // que va a recibir para entrar ya prueba que el correo es suyo.
  body: JSON.stringify({ email, email_confirm: true }),
})

const cuerpo = await r.json().catch(() => ({}))

if (r.ok) {
  console.log(`Listo. ${email} ya puede entrar al panel.`)
  console.log('Va a recibir un código de 6 dígitos cada vez que inicie sesión.')
  process.exit(0)
}

if (r.status === 422 && /already/i.test(cuerpo.msg ?? '')) {
  console.log(`${email} ya estaba habilitado. No hay nada que hacer.`)
  process.exit(0)
}

console.error(`No se pudo crear el usuario (${r.status}): ${cuerpo.msg ?? JSON.stringify(cuerpo)}`)
if (!process.env.SUPABASE_URL) {
  console.error('\n¿Está corriendo Supabase? Probá:  npx supabase start')
}
process.exit(1)
