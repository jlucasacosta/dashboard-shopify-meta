'use client'

import type { TooltipContentProps } from 'recharts'
import { formatMetric, type TipoMetrica } from '@/lib/format'
import { diaLargo } from './chart-frame'

type Fila = { clave: string; etiqueta: string; tipo: TipoMetrica; color?: string }

/**
 * Tooltip compartido por todas las gráficas.
 * El texto va siempre en tinta normal; el color lo lleva el cuadradito de al
 * lado. Un número pintado del color de su serie es más difícil de leer y
 * deja de cumplir contraste.
 */
export function TooltipGrafica({ filas, currency }: { filas: Fila[]; currency: string }) {
  function Contenido({ active, payload, label }: TooltipContentProps) {
    if (!active || !payload?.length) return null
    const punto = payload[0].payload as Record<string, unknown>

    return (
      <div className="rounded-lg bg-popover px-3 py-2.5 text-xs shadow-pop">
        <p className="mb-2 font-semibold text-popover-foreground">
          {diaLargo(String(label ?? punto.date))}
        </p>
        <ul className="space-y-1">
          {filas.map((f) => (
            <li key={f.clave} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                {f.color && (
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ background: f.color }}
                  />
                )}
                {f.etiqueta}
              </span>
              <span className="tabular-nums text-popover-foreground">
                {formatMetric(punto[f.clave] as never, f.tipo, currency)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  return Contenido
}
