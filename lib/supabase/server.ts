// Cliente de Supabase para Server Components, Server Actions y Route Handlers.
// Lee y escribe las cookies de sesion, por eso es async: en Next 16
// `cookies()` devuelve una promesa.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/types'
import { supabaseKey, supabaseUrl } from './env'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Los Server Components no pueden escribir cookies. No es un problema:
          // el middleware ya refresco la sesion antes de llegar aca.
        }
      },
    },
  })
}
