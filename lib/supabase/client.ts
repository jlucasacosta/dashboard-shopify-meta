'use client'

// Cliente de Supabase para el navegador.
// Solo lee datos. La escritura de la sincronizacion pasa por la skill /sync,
// nunca por el browser.

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types'
import { supabaseKey, supabaseUrl } from './env'

export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseKey())
}
