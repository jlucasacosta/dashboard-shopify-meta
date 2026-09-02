import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SidebarNav } from '@/components/sidebar-nav'
import { DateRangeSelect } from '@/components/date-range-select'
import { cerrarSesion } from './actions'

export default async function DashLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Iniciales del correo para el avatar. Sin foto de perfil que mantener.
  const inicial = (user?.email ?? '?').slice(0, 1).toUpperCase()

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2 pt-2">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-[0.8125rem] font-semibold text-primary-foreground shadow-pill"
          >
            D
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">Dashboard</p>
            <p className="truncate text-xs text-muted-foreground">Shopify + Meta Ads</p>
          </div>
        </div>

        <Suspense>
          <SidebarNav />
        </Suspense>

        <div className="mt-auto pt-6">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
            >
              {inicial}
            </span>
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={user?.email}>
              {user?.email}
            </p>
          </div>
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b bg-background/85 px-4 py-2.5 backdrop-blur-sm md:px-8">
          {/* En mobile el sidebar se esconde, asi que la nav va aca arriba. */}
          <div className="md:hidden">
            <Suspense>
              <SidebarNav />
            </Suspense>
          </div>
          <div className="ml-auto">
            <Suspense>
              <DateRangeSelect />
            </Suspense>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
