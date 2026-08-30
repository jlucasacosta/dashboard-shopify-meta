// Corre antes de cada pagina. Hace dos cosas:
//   1. Refresca la sesion para que no se venza mientras navegas.
//   2. Manda al login a quien no esta autenticado.
//
// La proteccion va aca y no en cada pagina para que nunca se vea un
// parpadeo del dashboard antes de redirigir.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseKey, supabaseUrl } from '@/lib/supabase/env'

// Rutas que se pueden ver sin estar logueado.
const RUTAS_PUBLICAS = ['/login', '/auth']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        )
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })

  // getUser() y no getSession(): getUser valida el token contra Supabase.
  // getSession lee la cookie y confia en ella, que es otra cosa.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const ruta = request.nextUrl.pathname
  const esPublica = RUTAS_PUBLICAS.some((p) => ruta.startsWith(p))

  if (!user && !esPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Guardamos a donde queria ir, para devolverlo ahi despues de entrar.
    if (ruta !== '/') url.searchParams.set('next', ruta)
    return NextResponse.redirect(url)
  }

  if (user && ruta === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // Todo menos archivos estaticos e imagenes.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
