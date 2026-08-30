import { resolveRange, rangoAnterior, etiquetaDe, PRESET_POR_DEFECTO, esPreset } from '@/lib/ranges'
import { getTotales, getSerie, getMonedaTienda, getEstadoSync } from '@/lib/queries'
import { KpiCard } from '@/components/kpi-card'
import { AvisoDatos } from '@/components/aviso-datos'
import { RevenueVsSpend } from '@/components/charts/revenue-vs-spend'
import { RoasTrend, CacTrend, OrdersBar } from '@/components/charts/simple-charts'
import { RealtimeRefresh } from '@/components/realtime-refresh'

/** Variación porcentual entre dos períodos. Solo para las flechitas. */
function delta(actual: unknown, previo: unknown): number | null {
  const a = Number(actual)
  const p = Number(previo)
  if (!Number.isFinite(a) || !Number.isFinite(p) || p === 0) return null
  return ((a - p) / Math.abs(p)) * 100
}

export default async function ResumenPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>
}) {
  const { r } = await searchParams
  const preset = r && esPreset(r) ? r : PRESET_POR_DEFECTO
  const rango = resolveRange(preset)
  const previo = rangoAnterior(rango)

  const [currency, totales, anteriores, serie, sync] = await Promise.all([
    getMonedaTienda(),
    getTotales(rango),
    getTotales(previo),
    getSerie(rango),
    getEstadoSync(),
  ])

  const sinAds = !totales || totales.ad_spend === null
  const motivoAds = sinAds ? 'Falta la inversión de Meta' : undefined

  return (
    <div className="space-y-6">
      <RealtimeRefresh />

      <div>
        <h1 className="text-xl font-medium tracking-tight">Resumen</h1>
        <p className="text-sm text-muted-foreground">{etiquetaDe(preset)}</p>
      </div>

      <AvisoDatos totales={totales} sync={sync} />

      {/* Dinero */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard etiqueta="Facturación total" valor={totales?.total_sales} tipo="money" currency={currency}
          delta={delta(totales?.total_sales, anteriores?.total_sales)} />
        <KpiCard etiqueta="Inversión publicitaria" valor={totales?.ad_spend} tipo="money" currency={currency}
          delta={delta(totales?.ad_spend, anteriores?.ad_spend)} motivoFalta={motivoAds} />
        <KpiCard etiqueta="Contribución" valor={totales?.contribution} tipo="money" currency={currency}
          delta={delta(totales?.contribution, anteriores?.contribution)} motivoFalta={motivoAds} />
        <KpiCard etiqueta="ROAS" valor={totales?.roas} tipo="ratio" currency={currency}
          delta={delta(totales?.roas, anteriores?.roas)} motivoFalta={motivoAds} />
      </section>

      {/* Eficiencia */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard etiqueta="CAC promedio" valor={totales?.cac} tipo="money" currency={currency}
          delta={delta(totales?.cac, anteriores?.cac)} bajarEsBueno motivoFalta={motivoAds} />
        <KpiCard etiqueta="Ticket promedio" valor={totales?.aov} tipo="money" currency={currency}
          delta={delta(totales?.aov, anteriores?.aov)} />
        <KpiCard etiqueta="Pedidos" valor={totales?.orders} tipo="int" currency={currency}
          delta={delta(totales?.orders, anteriores?.orders)} />
        <KpiCard etiqueta="% de facturación en ads" valor={totales?.ad_spend_pct} tipo="pct" currency={currency}
          delta={delta(totales?.ad_spend_pct, anteriores?.ad_spend_pct)} bajarEsBueno motivoFalta={motivoAds} />
      </section>

      {/* Gente */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard etiqueta="Clientes nuevos" valor={totales?.new_customers} tipo="int" currency={currency}
          delta={delta(totales?.new_customers, anteriores?.new_customers)} />
        <KpiCard etiqueta="Clientes recurrentes" valor={totales?.returning_customers} tipo="int" currency={currency}
          delta={delta(totales?.returning_customers, anteriores?.returning_customers)} />
        <KpiCard etiqueta="Sesiones" valor={totales?.sessions} tipo="int" currency={currency}
          delta={delta(totales?.sessions, anteriores?.sessions)} />
        <KpiCard etiqueta="Tasa de conversión" valor={totales?.conversion_rate} tipo="pct" currency={currency}
          delta={delta(totales?.conversion_rate, anteriores?.conversion_rate)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="xl:col-span-2">
          <RevenueVsSpend datos={serie} currency={currency} />
        </div>
        <RoasTrend datos={serie} currency={currency} />
        <CacTrend datos={serie} currency={currency} />
        <div className="xl:col-span-2">
          <OrdersBar datos={serie} currency={currency} />
        </div>
      </section>
    </div>
  )
}
