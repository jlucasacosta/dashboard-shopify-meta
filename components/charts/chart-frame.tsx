'use client'

import { ResponsiveContainer } from 'recharts'
import { LOCALE } from '@/lib/format'

export function ChartFrame({
  titulo,
  descripcion,
  children,
  alto = 240,
}: {
  titulo: string
  descripcion?: string
  children: React.ReactElement
  alto?: number
}) {
  return (
    <figure className="rounded-xl bg-card p-5 shadow-card">
      <figcaption className="mb-4">
        <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>
        {descripcion && (
          <p className="mt-0.5 text-xs text-muted-foreground">{descripcion}</p>
        )}
      </figcaption>
      <div style={{ height: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

/** Ejes y grilla recesivos: la tinta fuerte es para los datos, no para el marco. */
export const EJE = {
  tick: { fontSize: 11, fill: 'var(--muted-foreground)' },
  tickLine: false,
  axisLine: false,
} as const

export const GRILLA = {
  stroke: 'var(--border)',
  strokeDasharray: '0',
  vertical: false,
} as const

/** Fecha corta para el eje X: "12 mar". */
export function diaCorto(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(d)
}

/** Fecha larga para el tooltip: "jueves, 12 de marzo". */
export function diaLargo(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(d)
}
