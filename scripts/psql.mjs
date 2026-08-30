#!/usr/bin/env node
// Ejecuta SQL contra la base de Supabase local sin necesidad de instalar psql.
// Usa el psql que ya viene adentro del contenedor de Postgres.
//
//   node scripts/psql.mjs archivo.sql      -> ejecuta un archivo
//   node scripts/psql.mjs -c "select 1"    -> ejecuta una sentencia suelta
//
// Sale con codigo 1 si el SQL falla, asi sirve para tests en CI.

import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

function encontrarContenedor() {
  let salida
  try {
    salida = execFileSync('docker', ['ps', '--format', '{{.Names}}'], {
      encoding: 'utf8',
    })
  } catch {
    console.error('No se pudo hablar con Docker. Abri Docker Desktop y volve a intentar.')
    process.exit(1)
  }

  const contenedor = salida
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('supabase_db_'))

  if (!contenedor) {
    console.error('No encontre el contenedor de Supabase. Corre primero:  npx supabase start')
    process.exit(1)
  }
  return contenedor
}

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Uso: node scripts/psql.mjs <archivo.sql>  |  -c "<sentencia>"')
  process.exit(1)
}

const contenedor = encontrarContenedor()
const base = ['exec', '-i', contenedor, 'psql', '-U', 'postgres', '-d', 'postgres',
  // ON_ERROR_STOP hace que un error de SQL devuelva codigo distinto de cero.
  '-v', 'ON_ERROR_STOP=1']

let resultado
if (args[0] === '-c') {
  resultado = spawnSync('docker', [...base, '-c', args[1]], { stdio: 'inherit' })
} else {
  const archivo = args[0]
  if (!existsSync(archivo)) {
    console.error(`No existe el archivo: ${archivo}`)
    process.exit(1)
  }
  resultado = spawnSync('docker', [...base, '-f', '-'], {
    input: readFileSync(archivo),
    stdio: ['pipe', 'inherit', 'inherit'],
  })
}

process.exit(resultado.status ?? 1)
