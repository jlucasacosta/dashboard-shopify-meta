#!/usr/bin/env node
// Da de alta a alguien para que pueda entrar al panel, con su contraseña.
//
//   npm run usuario:crear -- vos@tutienda.com https://tu-panel.vercel.app
//
// Hace falta porque el panel es privado: nadie se da de alta solo. Es lo mismo
// que hacer Authentication > Users > Add user en Supabase, pero sin salir de la
// terminal y, sobre todo, sin tener que inventar una contraseña: la genera acá
// y la deja escrita en un HTML con la cara del panel, listo para pasarle a
// quien la va a usar.
//
// Pasale siempre las credenciales de tu proyecto de Supabase:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... npm run usuario:crear -- vos@tutienda.com
//
// La service key la sacás de Project Settings > API Keys. NO la guardes en
// ningún archivo del proyecto: se saltea todos los permisos.
//
// Si el correo ya estaba dado de alta, no falla: le pone una contraseña nueva.
// Es el mismo comando para crear y para "me la olvidé", que es lo que uno
// necesita cuando el panel no tiene pantalla de recuperación.

import { randomInt } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
const email = (process.argv[2] ?? '').trim().toLowerCase()
const panel = (process.argv[3] ?? process.env.PANEL_URL ?? '').trim().replace(/\/$/, '')

if (!email || !email.includes('@')) {
  console.error('Uso: npm run usuario:crear -- vos@tutienda.com [https://tu-panel.vercel.app]')
  process.exit(1)
}

if (!url || !key) {
  console.error('Faltan las credenciales de tu proyecto de Supabase.\n')
  console.error('Corré el comando así, en una sola línea:\n')
  console.error('  SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... npm run usuario:crear -- ' + email)
  console.error('\nEn PowerShell:\n')
  console.error('  $env:SUPABASE_URL="https://xxx.supabase.co"; $env:SUPABASE_SERVICE_KEY="eyJ..."; npm run usuario:crear -- ' + email)
  process.exit(1)
}

/**
 * Contraseña que se puede dictar por teléfono.
 *
 * El alfabeto no tiene 0/O, 1/l/I ni 5/S: son los pares que la gente confunde
 * al copiar de una pantalla a otra, y una contraseña mal tipeada acá termina
 * en "no puedo entrar" sin ninguna pista de por qué.
 *
 * 16 caracteres de un alfabeto de 30 son ~78 bits de entropía: de sobra para
 * algo que nadie va a tener que recordar de memoria, porque queda escrito en
 * el HTML y en el gestor de contraseñas del navegador.
 */
function generarPassword() {
  const alfabeto = 'abcdefghjkmnpqrtuvwxyz2346789'
  const grupos = []
  for (let g = 0; g < 4; g++) {
    let grupo = ''
    for (let i = 0; i < 4; i++) grupo += alfabeto[randomInt(alfabeto.length)]
    grupos.push(grupo)
  }
  return grupos.join('-')
}

const password = generarPassword()

const cabeceras = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
}

// Si Supabase no responde, fetch tira y Node imprime un stack trace de veinte
// líneas terminado en ECONNREFUSED. Es de los primeros comandos que corre
// alguien que arranca el proyecto, y ese volcado no le dice qué hacer.
async function llamar(ruta, opciones) {
  try {
    return await fetch(`${url}${ruta}`, { ...opciones, headers: cabeceras })
  } catch {
    console.error(`No se pudo contactar a Supabase en ${url}.`)
    console.error('')
    console.error('Revisá que la URL sea la de tu proyecto y que tengas internet.')
    process.exit(1)
  }
}

function mensajeDe(cuerpo) {
  return cuerpo.msg ?? cuerpo.message ?? cuerpo.error_description ?? ''
}

// email_confirm evita pedirle que confirme la casilla: la contraseña se la
// entregamos nosotros, así que la confirmación no prueba nada que no sepamos
// ya, y un correo sin abrir deja al usuario creado pero sin poder entrar, con
// un "email not confirmed" que no explica el resto.
let r = await llamar('/auth/v1/admin/users', {
  method: 'POST',
  body: JSON.stringify({ email, password, email_confirm: true }),
})

let cuerpo = await r.json().catch(() => ({}))
const creado = r.ok

if (!r.ok && r.status === 422 && /already|registered|exists/i.test(mensajeDe(cuerpo))) {
  // Ya existía: le ponemos contraseña nueva en vez de fallar. Para eso hace
  // falta su id, y la API de admin no filtra por correo de forma estable entre
  // versiones de GoTrue, así que lo buscamos en la lista.
  const lista = await llamar('/auth/v1/admin/users?page=1&per_page=1000', { method: 'GET' })
  const usuarios = (await lista.json().catch(() => ({}))).users ?? []
  const existente = usuarios.find((u) => (u.email ?? '').toLowerCase() === email)

  if (!existente) {
    console.error(`${email} ya está registrado pero no aparece en la lista de usuarios.`)
    console.error('Cambiale la contraseña a mano desde Authentication > Users en Supabase.')
    process.exit(1)
  }

  r = await llamar(`/auth/v1/admin/users/${existente.id}`, {
    method: 'PUT',
    body: JSON.stringify({ password, email_confirm: true }),
  })
  cuerpo = await r.json().catch(() => ({}))
}

if (!r.ok) {
  console.error(`No se pudo dar de alta el usuario (${r.status}): ${mensajeDe(cuerpo) || JSON.stringify(cuerpo)}`)
  if (r.status === 401 || r.status === 403) {
    console.error('\nEsa clave no es la service key. Sacala de Project Settings > API Keys.')
  }
  if (/password/i.test(mensajeDe(cuerpo))) {
    console.error('\nParece que subiste el largo mínimo de contraseña en Authentication > Providers.')
    console.error('La que genera este script tiene 19 caracteres; si pide más, bajá el mínimo.')
  }
  process.exit(1)
}

// El HTML es el entregable: la contraseña queda escrita una sola vez, en algo
// que se puede mandar. Va a la raíz del proyecto y está en .gitignore, porque
// es una credencial y no tiene que terminar en GitHub por descuido.
const archivo = resolve(process.cwd(), `credenciales-${email.replace(/[^a-z0-9]+/g, '-')}.html`)
writeFileSync(archivo, armarHtml({ email, password, panel }), 'utf8')

console.log('')
console.log(creado
  ? `Listo. ${email} ya puede entrar al panel.`
  : `${email} ya estaba dado de alta: le pusimos una contraseña nueva.`)
console.log('')
console.log(`  Correo:      ${email}`)
console.log(`  Contraseña:  ${password}`)
if (panel) console.log(`  Panel:       ${panel}/login`)
console.log('')
console.log(`Credenciales en HTML: ${archivo}`)
console.log('Abrilo en el navegador y pasalo por un canal privado. No lo subas al repo.')

function escapar(valor) {
  const mapa = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
  return String(valor).replace(/[&<>"]/g, (c) => mapa[c])
}

/**
 * El HTML usa los mismos tokens que el panel (el índigo de la marca, el gris
 * frío del fondo, la elevación al estilo Stripe) para que quien lo recibe
 * reconozca de dónde salió antes de leer una palabra.
 *
 * Todo va inline: es un archivo suelto que se manda por correo o WhatsApp y
 * tiene que verse igual sin servidor, sin fuentes externas y sin conexión.
 */
function armarHtml({ email, password, panel }) {
  const fecha = new Date().toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' })
  const enlace = panel ? `${escapar(panel)}/login` : ''
  const boton = enlace ? `<a class="boton" href="${enlace}">Entrar al panel</a>` : ''

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Tus credenciales del panel</title>
<style>
  :root {
    --fondo: oklch(0.9705 0.0045 264);
    --tinta: oklch(0.2385 0.0325 266);
    --suave: oklch(0.5485 0.0225 264);
    --marca: oklch(0.5385 0.2185 277);
    --marca-tinta: oklch(0.4685 0.2085 277);
    --marca-suave: oklch(0.9585 0.0165 277);
    --borde: oklch(0.9245 0.0065 264);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 20px;
    background: var(--fondo); color: var(--tinta);
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .hoja { max-width: 440px; margin: 0 auto; }
  .marca { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; }
  .logo {
    width: 32px; height: 32px; border-radius: 9px;
    background: var(--marca); color: #fff;
    display: grid; place-items: center;
    font-weight: 600; font-size: 14px;
  }
  .marca p { margin: 0; font-weight: 600; font-size: 14px; letter-spacing: -0.01em; }
  .tarjeta {
    background: #fff; border-radius: 16px; padding: 26px;
    box-shadow: 0 0 0 1px oklch(0.2385 0.0325 266 / 0.06),
                0 8px 24px -12px oklch(0.2385 0.0325 266 / 0.22);
  }
  h1 { margin: 0; font-size: 18px; letter-spacing: -0.015em; }
  .bajada { margin: 6px 0 22px; color: var(--suave); font-size: 14px; }
  .campo + .campo { margin-top: 14px; }
  .etiqueta {
    display: block; margin-bottom: 6px;
    font-size: 12px; font-weight: 600; color: var(--suave);
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .valor {
    display: block; padding: 11px 13px;
    background: oklch(0.9685 0.0045 264);
    border: 1px solid var(--borde); border-radius: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 15px; word-break: break-all; user-select: all;
  }
  .valor.clave { font-size: 17px; letter-spacing: 0.02em; color: var(--marca); font-weight: 600; }
  .boton {
    display: block; margin-top: 22px; padding: 12px;
    background: var(--marca); color: #fff;
    text-align: center; text-decoration: none;
    border-radius: 10px; font-weight: 600; font-size: 14px;
  }
  .aviso {
    margin-top: 18px; padding: 13px 15px;
    background: var(--marca-suave); border-radius: 10px;
    font-size: 13px; color: var(--marca-tinta);
  }
  .aviso strong { display: block; margin-bottom: 3px; }
  .pie { margin-top: 18px; text-align: center; font-size: 12px; color: var(--suave); }
  @media print {
    body { background: #fff; padding: 0; }
    .tarjeta { box-shadow: none; border: 1px solid var(--borde); }
    .boton { display: none; }
  }
</style>
</head>
<body>
  <div class="hoja">
    <div class="marca">
      <span class="logo" aria-hidden="true">D</span>
      <p>Dashboard</p>
    </div>

    <div class="tarjeta">
      <h1>Tus credenciales</h1>
      <p class="bajada">Con esto entrás al panel. Guardalas en el gestor de contraseñas de tu navegador la primera vez que las uses.</p>

      <div class="campo">
        <span class="etiqueta">Correo</span>
        <code class="valor">${escapar(email)}</code>
      </div>

      <div class="campo">
        <span class="etiqueta">Contraseña</span>
        <code class="valor clave">${escapar(password)}</code>
      </div>

      ${boton}

      <div class="aviso">
        <strong>Esta contraseña no se puede volver a ver.</strong>
        Si la perdés se genera una nueva y la anterior deja de servir. Nadie más que vos tiene que tener este archivo.
      </div>
    </div>

    <p class="pie">Generado el ${escapar(fecha)}</p>
  </div>
</body>
</html>
`
}
