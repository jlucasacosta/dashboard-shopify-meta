'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Escucha cambios en Supabase y refresca la página sola.
 *
 * Dos detalles que hacen la diferencia entre que ande y que no:
 *
 * 1. `realtime.setAuth(token)`. Las policies de RLS son "to authenticated", así
 *    que el socket tiene que llevar el JWT del usuario. Si se conecta sin él,
 *    queda como anónimo, RLS filtra todos los eventos, y el canal igual reporta
 *    SUBSCRIBED. Todo parece bien y no llega nunca nada: el fallo más silencioso
 *    de los que hay acá. Se puede verificar con `npm run test:realtime`.
 *
 * 2. El retardo antes de refrescar. Una corrida de /sync escribe cientos de
 *    filas en pocos segundos; sin esto serían cientos de refrescos seguidos.
 */
export function RealtimeRefresh() {
  const router = useRouter()
  const [conectado, setConectado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let canal: ReturnType<typeof supabase.channel> | null = null
    let cancelado = false

    function refrescarPronto() {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => router.refresh(), 800)
    }

    async function conectar() {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token || cancelado) return

      await supabase.realtime.setAuth(token)
      if (cancelado) return

      canal = supabase
        .channel('cambios-dashboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_sales' }, refrescarPronto)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_ad_spend' }, refrescarPronto)
        .subscribe((estado) => setConectado(estado === 'SUBSCRIBED'))
    }

    conectar()

    return () => {
      cancelado = true
      if (timer.current) clearTimeout(timer.current)
      if (canal) supabase.removeChannel(canal)
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
