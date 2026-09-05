// Vuelta del OAuth de Mercado Libre: canjea el codigo por los tokens.
//
// El `code` dura poquisimo y es de un solo uso. Lo que hay que guardar es el
// par access_token / refresh_token, con su vencimiento leido de `expires_in`
// (nunca hardcodeado: la doc oficial de MeLi se contradice a si misma, dice 6
// horas en el texto y devuelve 10800 segundos, o sea 3, en el ejemplo).

import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { appUrl, configMeli } from '@/lib/sync/config'
import { COOKIE_ESTADO, canjearCodigo } from '@/lib/sync/meli'
import { guardarConexion } from '@/lib/sync/meli-tokens'

export const runtime = 'nodejs'

function volverAlPanel(mensaje: string, ok: boolean) {
  const destino = new URL('/', appUrl())
  destino.searchParams.set(ok ? 'meli' : 'meli_error', mensaje)
  return Response.redirect(destino)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: sesion } = await supabase.auth.getUser()
  if (!sesion.user) return Response.redirect(new URL('/login', appUrl()))

  const cfg = configMeli()
  if (!cfg) return volverAlPanel('falta-configuracion', false)

  const params = request.nextUrl.searchParams

  // MeLi avisa por query string cuando la persona cancela o rechaza.
  const errorDeMeli = params.get('error')
  if (errorDeMeli) return volverAlPanel(errorDeMeli, false)

  const code = params.get('code')
  const estado = params.get('state')
  if (!code) return volverAlPanel('sin-codigo', false)

  // Verificacion del state contra CSRF. La cookie se borra siempre, haya
  // salido bien o mal: un state reutilizable no sirve de nada.
  const jar = await cookies()
  const esperado = jar.get(COOKIE_ESTADO)?.value
  jar.delete(COOKIE_ESTADO)

  if (!esperado || estado !== esperado) {
    return volverAlPanel('estado-invalido', false)
  }

  try {
    const conexion = await canjearCodigo(cfg, code)
    // Con la service key: la tabla `conexiones` no tiene policies, justamente
    // para que nadie pueda leer los tokens desde el navegador.
    await guardarConexion(createAdminClient(), conexion)
    return volverAlPanel('conectado', true)
  } catch (e) {
    console.error('[meli callback]', e)
    return volverAlPanel('canje-fallido', false)
  }
}
