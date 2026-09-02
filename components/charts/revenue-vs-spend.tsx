'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { ChartFrame, EJE, GRILLA, diaCorto } from './chart-frame'
import { TooltipGrafica } from './tooltip'
import type { PuntoSerie } from '@/lib/queries'
import { LOCALE } from '@/lib/format'

/**
 * Facturación e inversión publicitaria sobre UN SOLO eje.
 *
 * Dos ejes Y con escalas distintas es el error más común en dashboards:
 * el punto donde se cruzan las líneas es arbitrario, lo elige la escala,
 * y la gente lo lee como si significara algo. Acá no hace falta: el gasto ya
 * viene convertido a la moneda de la tienda, así que ambas series comparten
 * unidad y se pueden comparar de verdad.
 */
export function RevenueVsSpend({
  datos,
  currency,
}: {
  datos: PuntoSerie[]
  currency: string
}) {
  const Tip = TooltipGrafica({
    currency,
    filas: [
      { clave: 'total_sales', etiqueta: 'Facturación', tipo: 'money', color: 'var(--chart-revenue)' },
      { clave: 'ad_spend',    etiqueta: 'Inversión',   tipo: 'money', color: 'var(--chart-cost)' },
    ],
  })

  return (
    <ChartFrame
      titulo="Facturación e inversión"
      descripcion={`Ambas en ${currency}, sobre la misma escala`}
    >
      <AreaChart data={datos} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="gradFact" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-revenue)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--chart-revenue)" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid {...GRILLA} />
        <XAxis dataKey="date" tickFormatter={diaCorto} minTickGap={40} {...EJE} />
        <YAxis
          {...EJE}
          width={52}
          tickFormatter={(v) =>
            new Intl.NumberFormat(LOCALE, { notation: 'compact' }).format(Number(v))
          }
        />
        <Tooltip content={Tip} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
        <Legend
          verticalAlign="top"
          align="left"
          height={28}
          iconType="square"
          iconSize={8}
          wrapperStyle={{ fontSize: 12 }}
        />

        <Area
          name="Facturación"
          type="monotone"
          dataKey="total_sales"
          stroke="var(--chart-revenue)"
          strokeWidth={2}
          fill="url(#gradFact)"
          // Los huecos se dibujan como huecos. Unirlos inventaría datos
          // que no existen.
          connectNulls={false}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
        />
        <Area
          name="Inversión"
          type="monotone"
          dataKey="ad_spend"
          stroke="var(--chart-cost)"
          strokeWidth={2}
          fill="none"
          connectNulls={false}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
        />
      </AreaChart>
    </ChartFrame>
  )
}
