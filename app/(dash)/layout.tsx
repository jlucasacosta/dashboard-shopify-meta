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

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-56 shrink-0 flex-col border-r p-4 md:flex">
        <div className="mb-6 px-2.5">
          <p className="text-sm font-medium tracking-tight">Dashboard</p>
          <p className="text-xs text-muted-foreground">Shopify + Meta Ads</p>
        </div>

        <Suspense>
          <SidebarNav />
        </Suspense>

        <div className="mt-auto space-y-2 px-2.5 pt-6">
          <p className="truncate text-xs text-muted-foreground" title={user?.email}>
            {user?.email}
          </p>
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
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

        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
