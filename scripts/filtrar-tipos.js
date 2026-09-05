// Filtra los tipos generados de Supabase a solo lo que usa el panel.
//
// Por que existe: un proyecto de Supabase puede alojar mas de una aplicacion.
// `generate_typescript_types` devuelve TODO el schema public, y este repo es
// publico: publicar los tipos de otra app filtra su modelo de datos entero.
//
// Uso:
//   1. Pedile a Claude que genere los tipos con el MCP de Supabase.
//   2. Guarda la salida cruda en un archivo, por ejemplo tipos-crudos.ts
//   3. node scripts/filtrar-tipos.js tipos-crudos.ts
//
// Acepta el .ts crudo o el JSON que devuelve el MCP.
//
// Sin expresiones regulares a proposito: el escapeo entre el shell y JS ya
// rompio una version de este script en silencio, dejando el archivo vacio.

const fs = require('fs')
const path = require('path')

const DESTINO = path.join(__dirname, '..', 'lib', 'types.ts')

// Lo que el panel realmente usa. Si agregas una tabla o funcion nueva y no la
// sumas aca, TypeScript te va a decir que no existe.
const TABLAS = new Set([
  'settings', 'daily_sales', 'daily_traffic', 'daily_ad_spend',
  'daily_ad_campaigns', 'daily_products', 'fx_rates', 'sync_log',
  'config_servidor', 'conexiones', 'meli_compradores', 'sync_state',
  'dias_sucios',
])
const VISTAS = new Set(['daily_metrics', 'daily_sales_total'])
// disparar_sync, programar_sync y apagar_sync NO van: se revoco su permiso de
// ejecucion para anon y authenticated (migracion 0012), asi que PostgREST ni
// siquiera las expone. Se llaman desde SQL, nunca desde el panel.
const FUNCS = new Set([
  'period_totals', 'campaign_totals', 'product_totals',
  'funnel_totals', 'channel_totals',
])

const entrada = process.argv[2]
if (!entrada) {
  console.error('Uso: node scripts/filtrar-tipos.js <archivo-con-los-tipos-crudos>')
  process.exit(1)
}

let texto = fs.readFileSync(entrada, 'utf8')
// Si es la respuesta del MCP en JSON, sacar el campo `types`.
if (texto.trimStart().startsWith('[') || texto.trimStart().startsWith('{')) {
  try {
    const json = JSON.parse(texto)
    const crudo = Array.isArray(json) ? JSON.parse(json[0].text) : json
    texto = crudo.types ?? texto
  } catch {
    // No era JSON: se usa tal cual.
  }
}

const lines = texto.split('\n')

/** Indice de la linea siguiente al cierre del bloque que abre en `desde`. */
function finDeBloque(desde) {
  let prof = 0
  for (let i = desde; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') prof++
      else if (ch === '}') prof--
    }
    if (prof === 0) return i + 1
  }
  throw new Error('bloque sin cerrar en la linea ' + desde)
}

/** "      nombre: {" -> "nombre". null si la linea no abre un item. */
function nombreDeItem(linea, indent) {
  if (!linea.startsWith(' '.repeat(indent))) return null
  if (linea.charAt(indent) === ' ') return null
  if (!linea.endsWith(': {')) return null
  return linea.slice(indent, linea.length - 3)
}

const publicIdx = lines.indexOf('  public: {')
if (publicIdx === -1) throw new Error('no encontre el schema public en la entrada')

function filtrarEn(ini, nombreSeccion, permitidos) {
  const fin = finDeBloque(ini)
  const conservadas = []
  let encontradas = 0
  let i = ini + 1
  while (i < fin - 1) {
    const nombre = nombreDeItem(lines[i], 6)
    if (nombre === null) { i++; continue }
    encontradas++
    const finItem = finDeBloque(i)
    if (permitidos.has(nombre)) conservadas.push(...lines.slice(i, finItem))
    i = finItem
  }
  console.log(`${nombreSeccion}: ${encontradas} en el proyecto, ${conservadas.filter((l) => nombreDeItem(l, 6)).length} conservadas`)
  // Se reusa la linea de cierre original: en el bloque Constants termina con
  // coma (`    },`) y hardcodear `    }` rompe el archivo.
  return { ini, fin, contenido: [lines[ini], ...conservadas, lines[fin - 1]] }
}

function filtrar(nombreSeccion, permitidos) {
  const ini = lines.indexOf('    ' + nombreSeccion + ': {', publicIdx)
  if (ini === -1) throw new Error('no encontre la seccion ' + nombreSeccion)
  return filtrarEn(ini, nombreSeccion, permitidos)
}

/** Todas las apariciones de una seccion, no solo la primera. */
function filtrarTodas(nombreSeccion, permitidos) {
  const marca = '    ' + nombreSeccion + ': {'
  const salidas = []
  let desde = 0
  for (;;) {
    const ini = lines.indexOf(marca, desde)
    if (ini === -1) break
    salidas.push(filtrarEn(ini, nombreSeccion, permitidos))
    desde = ini + 1
  }
  return salidas
}

// Ninguna tabla del panel usa enums ni tipos compuestos: son todos text. Se
// vacian los dos, porque son del otro negocio que vive en el mismo proyecto.
// `Enums` aparece dos veces: en los tipos y en el export `Constants`.
const VACIO = new Set()

const secciones = [
  filtrar('Tables', TABLAS),
  filtrar('Views', VISTAS),
  filtrar('Functions', FUNCS),
  ...filtrarTodas('Enums', VACIO),
  ...filtrarTodas('CompositeTypes', VACIO),
].sort((a, b) => b.ini - a.ini) // de atras para adelante, para no correr los indices

const salida = lines.slice()
for (const s of secciones) salida.splice(s.ini, s.fin - s.ini, ...s.contenido)

const cabecera = `// Tipos de la base. Generados con el MCP de Supabase y filtrados con
// scripts/filtrar-tipos.js a las tablas, vistas y funciones del panel.
//
// No se editan a mano: se regeneran. Si agregas algo al esquema, sumalo a las
// listas del script o TypeScript va a decir que no existe.

`

fs.writeFileSync(DESTINO, cabecera + salida.join('\n'), 'utf8')

const txt = salida.join('\n')
let problemas = 0
for (const n of [...TABLAS, ...VISTAS, ...FUNCS]) {
  if (!txt.includes('      ' + n + ': {')) {
    console.log('  FALTA en la entrada: ' + n)
    problemas++
  }
}
console.log(problemas === 0
  ? `OK — lib/types.ts, ${salida.length} lineas`
  : `${problemas} faltantes: revisa que el esquema este aplicado antes de generar`)
