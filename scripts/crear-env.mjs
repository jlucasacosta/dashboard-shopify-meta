// Crea .env.local a partir de .env.example si todavia no existe.
//
// Corre solo despues de `npm install` (postinstall), asi que recien clonado el
// repo ya hay un .env.local para completar: no hay que acordarse de copiar
// nada. Si el archivo ya existe no lo toca, nunca: ahi adentro estan tus
// claves y pisarlas seria peor que no crearlo.
//
// .env.local esta en .gitignore. La plantilla que se versiona es .env.example.

import { existsSync, copyFileSync } from 'node:fs'

const PLANTILLA = '.env.example'
const DESTINO = '.env.local'

// En Vercel (o cualquier CI) las variables vienen del panel, no de un archivo.
// Si aca se creara un .env.local con los valores de ejemplo, Next lo leeria en
// el build y cualquier variable que faltara en Vercel tomaria el placeholder
// en silencio (APP_URL=https://tu-panel.vercel.app) en vez de fallar claro.
if (process.env.VERCEL || process.env.CI) {
  process.exit(0)
}

if (existsSync(DESTINO)) {
  process.exit(0)
}

if (!existsSync(PLANTILLA)) {
  console.error(`No encuentro ${PLANTILLA}: no puedo crear ${DESTINO}.`)
  process.exit(0)
}

copyFileSync(PLANTILLA, DESTINO)
console.log(`Creado ${DESTINO} a partir de ${PLANTILLA}. Abrilo y completá las variables.`)
