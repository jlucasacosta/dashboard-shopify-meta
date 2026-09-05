// Arranca el OAuth de Mercado Libre.
//
// Es el unico conector que necesita esto: Shopify y Meta dan un token fijo que
// se pega en una variable de entorno. MeLi obliga a que el vendedor autorice
// desde su cuenta, y devuelve un token que vence y rota.
//
// Consecuencia para el curso: como el `redirect_uri` tiene que coincidir EXACTO
// con el registrado en la app de MeLi, y cada instalacion vive en una URL
// distinta de Vercel, cada persona necesita crear SU PROPIA app de Mercado
// Libre. No se puede compartir una entre todos.

import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { configMeli } from '@/lib/sync/config'
import { COOKIE_ESTADO, urlAutorizacion } from '@/lib/sync/meli'

export const runtime = 'nodejs'

export async function GET() {
  // Solo alguien logueado en el panel puede conectar una cuenta. Sin esto,
  // cualquiera que conozca la URL podria empujar el flujo.
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    return Response.redirect(new URL('/login', process.env.APP_URL ?? 'http://localhost:3000'))
  }

  const cfg = configMeli()
  if (!cfg) {
    return Response.json(
      {
        error:
          'Faltan MELI_APP_ID y MELI_SECRET_KEY. Se sacan de la app que creaste en el devcenter de Mercado Libre.',
      },
      { status: 500 },
    )
  }

  // `state` contra CSRF: se guarda en una cookie y se compara en el callback.
  // Sin esto, alguien podria hacerte canjear SU codigo y terminarias con la
  // cuenta de Mercado Libre de otro conectada a tu panel.
  const estado = randomBytes(24).toString('hex')
  const jar = await cookies()
  jar.set(COOKIE_ESTADO, estado, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax', // 'lax' y no 'strict': la cookie tiene que sobrevivir la vuelta desde MeLi
    path: '/api/meli',
    maxAge: 600,
  })

  return Response.redirect(urlAutorizacion(cfg, estado))
}
