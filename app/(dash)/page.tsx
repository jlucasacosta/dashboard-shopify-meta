import { createClient } from '@/lib/supabase/server'

export default async function ResumenPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="space-y-2">
      <h1 className="text-xl font-medium tracking-tight">Resumen</h1>
      <p className="text-sm text-muted-foreground">
        Sesión activa: {user?.email}
      </p>
    </div>
  )
}
