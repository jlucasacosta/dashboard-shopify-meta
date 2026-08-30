// Recibe al usuario cuando vuelve del link que le llego por correo.
// Cambia el codigo de un solo uso por una sesion guardada en cookies.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const destino = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=link_invalido`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Lo mas comun: el link ya se uso, o vencio.
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    )
  }

  return NextResponse.redirect(`${origin}${destino}`)
}
