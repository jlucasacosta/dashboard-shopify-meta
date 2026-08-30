'use client'

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import { ChartFrame, EJE, GRILLA, diaCorto } from './chart-frame'
import { TooltipGrafica } from './tooltip'
import type { PuntoSerie } from '@/lib/queries'

// Una sola serie no lleva leyenda: el título ya dice qué se está mirando.

export function RoasTrend({ datos, currency }: { datos: PuntoSerie[]; currency: string }) {
  const Tip = TooltipGrafica({
    currency,
    filas: [{ clave: 'roas', etiqueta: 'ROAS', tipo: 'ratio', color: 'var(--chart-revenue)' }],
  })

  return (
    <ChartFrame
      titulo="ROAS"
      descripcion="Facturación de Shopify dividida por la inversión en Meta"
    >
      <LineChart data={datos} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid {...GRILLA} />
        <XAxis dataKey="date" tickFormatter={diaCorto} minTickGap={40} {...EJE} />
        {/* Con `${v}x` el eje sale con punto decimal ("0.95x") mientras el resto
            del dashboard usa coma. Formatear con Intl mantiene una sola convención. */}
        <YAxis
          {...EJE}
          width={44}
          tickFormatter={(v) =>
            `${new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 }).format(Number(v))}x`
          }
        />
        <Tooltip content={Tip} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
        {/* Debajo de 1x cada peso invertido devuelve menos de un peso. */}
        <ReferenceLine
          y={1}
          stroke="var(--muted-foreground)"
          strokeDasharray="3 3"
          label={{ value: 'equilibrio 1x', position: 'insideTopLeft', fontSize: 10, fill: 'var(--muted-foreground)' }}
        />
        <Line
          type="monotone"
          dataKey="roas"
          stroke="var(--chart-revenue)"
          strokeWidth={2}
          connectNulls={false}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
        />
      </LineChart>
    </ChartFrame>
  )
}

export function CacTrend({ datos, currency }: { datos: PuntoSerie[]; currency: string }) {
  const Tip = TooltipGrafica({
    currency,
    filas: [
      { clave: 'cac', etiqueta: 'CAC', tipo: 'money', color: 'var(--chart-cost)' },
      { clave: 'new_customers', etiqueta: 'Clientes nuevos', tipo: 'int' },
    ],
  })

  return (
    <ChartFrame
      titulo="Costo por cliente nuevo (CAC)"
      descripcion="Inversión del día dividida por los clientes nuevos de ese día"
    >
      <LineChart data={datos} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid {...GRILLA} />
        <XAxis dataKey="date" tickFormatter={diaCorto} minTickGap={40} {...EJE} />
        <YAxis
          {...EJE}
          width={48}
          tickFormatter={(v) =>
            new Intl.NumberFormat('es-UY', { notation: 'compact' }).format(Number(v))
          }
        />
        <Tooltip content={Tip} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
        <Line
          type="monotone"
          dataKey="cac"
          stroke="var(--chart-cost)"
          strokeWidth={2}
          connectNulls={false}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
        />
      </LineChart>
    </ChartFrame>
  )
}

export function OrdersBar({ datos, currency }: { datos: PuntoSerie[]; currency: string }) {
  const Tip = TooltipGrafica({
    currency,
    filas: [
      { clave: 'orders', etiqueta: 'Pedidos', tipo: 'int', color: 'var(--chart-revenue)' },
      { clave: 'total_sales', etiqueta: 'Facturación', tipo: 'money' },
    ],
  })

  return (
    <ChartFrame titulo="Pedidos por día" descripcion="Cantidad de órdenes registradas en Shopify">
      <BarChart data={datos} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid {...GRILLA} />
        <XAxis dataKey="date" tickFormatter={diaCorto} minTickGap={40} {...EJE} />
        <YAxis {...EJE} width={36} allowDecimals={false} />
        <Tooltip content={Tip} cursor={{ fill: 'var(--accent)' }} />
        <Bar
          dataKey="orders"
          fill="var(--chart-revenue)"
          // Extremo redondeado del lado del dato, anclado a la base.
          radius={[4, 4, 0, 0]}
          maxBarSize={18}
        />
      </BarChart>
    </ChartFrame>
  )
}
