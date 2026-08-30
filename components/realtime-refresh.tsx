'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Escucha cambios en Supabase y refresca la página sola.
 *
 * Cuando corrés /sync, se escriben cientos de filas en pocos segundos. Sin el
 * retardo de abajo eso serían cientos de refrescos seguidos, así que
 * esperamos a que se calme antes de recargar una sola vez.
 */
export function RealtimeRefresh() {
  const router = useRouter()
  const [conectado, setConectado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()

    function refrescarPronto() {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => router.refresh(), 800)
    }

    const canal = supabase
      .channel('cambios-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_sales' }, refrescarPronto)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_ad_spend' }, refrescarPronto)
      .subscribe((estado) => setConectado(estado === 'SUBSCRIBED'))

    return () => {
      if (timer.current) clearTimeout(timer.current)
      supabase.removeChannel(canal)
    }
  }, [router])

  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ background: conectado ? '#0ca30c' : 'var(--muted-foreground)' }}
      />
      {conectado ? 'En vivo' : 'Sin conexión en vivo'}
    </p>
  )
}
