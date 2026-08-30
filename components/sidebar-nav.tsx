'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { BarChart3, Megaphone, Package, PencilLine } from 'lucide-react'
import { cn } from '@/lib/utils'

const SECCIONES = [
  { href: '/',             etiqueta: 'Resumen',      icono: BarChart3 },
  { href: '/ads',          etiqueta: 'Anuncios',     icono: Megaphone },
  { href: '/productos',    etiqueta: 'Productos',    icono: Package },
  { href: '/gasto-manual', etiqueta: 'Gasto manual', icono: PencilLine },
]

export function SidebarNav() {
  const ruta = usePathname()
  const params = useSearchParams()
  // El rango elegido viaja entre secciones, asi no hay que volver a elegirlo.
  const query = params.get('r') ? `?r=${params.get('r')}` : ''

  return (
    <nav className="flex flex-col gap-0.5">
      {SECCIONES.map(({ href, etiqueta, icono: Icono }) => {
        const activo = ruta === href
        return (
          <Link
            key={href}
            href={`${href}${query}`}
            aria-current={activo ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
              activo
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            <Icono className="size-4 shrink-0" aria-hidden />
            {etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}
