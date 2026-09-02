#!/usr/bin/env node
// Da de alta a alguien para que pueda entrar al panel.
//
//   npm run usuario:crear -- vos@tutienda.com
//
// Hace falta porque el panel es privado: nadie se da de alta solo. Es lo mismo
// que hacer Authentication > Users > Add user en Supabase, pero sin salir de
// la terminal.
//
// Pasale siempre las credenciales de tu proyecto de Supabase:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... npm run usuario:crear -- vos@tutienda.com
//
// La service key la sacás de Project Settings > API Keys. NO la guardes en
// ningún archivo del proyecto: se saltea todos los permisos.

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
const email = (process.argv[2] ?? '').trim().toLowerCase()

if (!email || !email.includes('@')) {
  console.error('Uso: npm run usuario:crear -- vos@tutienda.com')
  process.exit(1)
}

if (!url || !key) {
  console.error('Faltan las credenciales de tu proyecto de Supabase.\n')
  console.error('Corré el comando así, en una sola línea:\n')
  console.error('  SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... npm run usuario:crear -- ' + (email || 'vos@tutienda.com'))
  console.error('\nEn PowerShell:\n')
  console.error('  $env:SUPABASE_URL="https://xxx.supabase.co"; $env:SUPABASE_SERVICE_KEY="eyJ..."; npm run usuario:crear -- ' + (email || 'vos@tutienda.com'))
  process.exit(1)
}

// Si Supabase no esta levantado, fetch tira y Node imprime un stack trace de
// veinte lineas terminado en ECONNREFUSED. Es el primer comando que corre
// alguien que arranca el proyecto, y ese volcado no le dice que hacer.
let r
try {
  r = await fetch(`${url}/auth/v1/admin/users`, {
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
} catch {
  console.error(`No se pudo contactar a Supabase en ${url}.`)
  console.error('')
  console.error('Revisá que la URL sea la de tu proyecto y que tengas internet.')
  process.exit(1)
}

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
if (r.status === 401 || r.status === 403) {
  console.error('\nEsa clave no es la service key. Sacala de Project Settings > API Keys.')
}
process.exit(1)
