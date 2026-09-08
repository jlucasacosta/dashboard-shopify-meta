// Cliente de Supabase con la service key. Es el UNICO que puede escribir.
//
// Por que existe: hasta ahora los datos entraban por el MCP de Supabase, con
// una persona adelante. Ahora entran solos, y alguien tiene que tener permiso
// de escritura. Ese alguien es el servidor, nunca el navegador.
//
// Reglas que no se negocian:
//   1. Este archivo solo se importa desde codigo de servidor (route handlers y
//      lib/sync). Si aparece importado desde un componente 'use client', la
//      service key termina en el bundle del navegador y la base queda abierta.
//      El `import 'server-only'` de abajo hace que eso sea un error de BUILD y
//      no una regla que alguien tiene que recordar.
//   2. La service key bypassa RLS por completo. Las policies de lectura del
//      panel siguen intactas: el navegador sigue sin poder escribir nada.
//   3. Nunca se expone por una accion del usuario. Solo la usan el cron y el
//      webhook, y los dos estan detras de un secreto.

import 'server-only'
import { createClient as crearCliente } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'
import { supabaseUrl } from './env'

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_KEY

  if (!key) {
    throw new Error(
      [
        ``,
        `Falta la variable de entorno SUPABASE_SERVICE_KEY.`,
        ``,
        `Es la clave que le permite al sync escribir en tu base.`,
        ``,
        `Como arreglarlo:`,
        `  1. Entra a supabase.com > tu proyecto > Project Settings > API Keys`,
        `  2. Copia la clave "service_role" (la secreta, no la anon)`,
        `  3. Cargala en Vercel: Project Settings > Environment Variables`,
        ``,
        `No la pongas en ningun archivo del repo: este repo es publico.`,
        ``,
      ].join('\n'),
    )
  }

  return crearCliente<Database>(supabaseUrl(), key, {
    auth: {
      // No hay usuario ni sesion: es un proceso de servidor.
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
