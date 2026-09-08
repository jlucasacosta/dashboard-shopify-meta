'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { BarChart3, Filter, Megaphone, Package, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const SECCIONES = [
  { href: '/',          etiqueta: 'Resumen',   icono: BarChart3 },
  { href: '/embudo',    etiqueta: 'Embudo',    icono: Filter },
  { href: '/ads',       etiqueta: 'Anuncios',  icono: Megaphone },
  { href: '/productos', etiqueta: 'Productos', icono: Package },
  // Ultima a proposito: no se mira todos los dias, pero tiene que estar a la
  // vista. Es el unico lugar desde donde se reconecta Mercado Libre.
  { href: '/configuracion', etiqueta: 'Configuración', icono: Settings },
]

// Filtros que se conservan al cambiar de seccion. Si agregas uno nuevo y no lo
// sumas aca, se pierde en silencio cada vez que alguien navega.
const FILTROS = ['r', 'ch']

export function SidebarNav() {
  const ruta = usePathname()
  const params = useSearchParams()
  // El rango y el canal elegidos viajan entre secciones, asi no hay que volver
  // a elegirlos en cada pantalla.
  const conservados = new URLSearchParams()
  for (const filtro of FILTROS) {
    const valor = params.get(filtro)
    if (valor) conservados.set(filtro, valor)
  }
  const query = conservados.toString() ? `?${conservados.toString()}` : ''

  return (
    // En el sidebar va en columna; en el header de mobile, en fila.
    <nav className="-mx-1 flex flex-row gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0">
      {SECCIONES.map(({ href, etiqueta, icono: Icono }) => {
        const activo = ruta === href
        return (
          <Link
            key={href}
            href={`${href}${query}`}
            aria-current={activo ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
              activo
                // La sección activa se levanta del fondo gris: superficie
                // blanca con un pelo de sombra, como una pestaña encendida.
                ? 'bg-sidebar-accent text-foreground shadow-pill'
                : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
            )}
          >
            <Icono
              className={cn('size-4 shrink-0', activo ? 'text-primary' : 'text-muted-foreground')}
              aria-hidden
            />
            {etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}
