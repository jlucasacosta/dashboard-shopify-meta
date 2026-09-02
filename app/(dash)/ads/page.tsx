import { resolveRange, etiquetaDe, PRESET_POR_DEFECTO, esPreset } from '@/lib/ranges'
import { getTotales, getCampanas, getMonedaTienda, getEstadoSync } from '@/lib/queries'
import { KpiCard } from '@/components/kpi-card'
import { AvisoDatos } from '@/components/aviso-datos'
import { formatMetric, SIN_DATO } from '@/lib/format'

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>
}) {
  const { r } = await searchParams
  const preset = r && esPreset(r) ? r : PRESET_POR_DEFECTO
  const rango = resolveRange(preset)

  const [currency, totales, campanas, sync] = await Promise.all([
    getMonedaTienda(),
    getTotales(rango),
    getCampanas(rango),
    getEstadoSync(),
  ])

  const motivoAds = totales?.ad_spend === null ? 'Falta la inversión de Meta' : undefined

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Anuncios</h1>
        <p className="mt-1 text-sm text-muted-foreground">{etiquetaDe(preset)}</p>
      </div>

      <AvisoDatos totales={totales} sync={sync} />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard etiqueta="Inversión total" valor={totales?.ad_spend} tipo="money" currency={currency} motivoFalta={motivoAds} />
        <KpiCard etiqueta="Impresiones" valor={totales?.impressions} tipo="int" currency={currency} />
        <KpiCard etiqueta="Clics" valor={totales?.clicks} tipo="int" currency={currency} />
        <KpiCard etiqueta="CTR" valor={totales?.ctr} tipo="pct" currency={currency} />
        <KpiCard etiqueta="CPC" valor={totales?.cpc} tipo="money" currency={currency} bajarEsBueno motivoFalta={motivoAds} />
        <KpiCard etiqueta="CPM" valor={totales?.cpm} tipo="money" currency={currency} bajarEsBueno motivoFalta={motivoAds} />
        <KpiCard etiqueta="Alcance" valor={totales?.reach} tipo="int" currency={currency} />
        <KpiCard etiqueta="ROAS" valor={totales?.roas} tipo="ratio" currency={currency} motivoFalta={motivoAds} />
      </section>

      <section className="overflow-hidden rounded-xl bg-card shadow-card">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold tracking-tight">Campañas</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ordenadas por inversión. Los montos ya están convertidos a {currency}.
          </p>
        </div>

        {campanas.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            No hay campañas con datos en este período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="th-dato text-left">Campaña</th>
                  <th className="th-dato text-left">Objetivo</th>
                  <th className="th-dato text-right">Inversión</th>
                  <th className="th-dato text-right">Impresiones</th>
                  <th className="th-dato text-right">Clics</th>
                  <th className="th-dato text-right">CTR</th>
                  <th className="th-dato text-right">CPC</th>
                  <th className="th-dato text-right">CPM</th>
                </tr>
              </thead>
              <tbody>
                {campanas.map((c) => (
                  <tr key={c.campaign_id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      {c.campaign_name}
                      {c.dias_sin_tasa > 0 && (
                        <span
                          className="ml-2 text-xs text-muted-foreground"
                          title="Algunos días no tienen tipo de cambio, así que la inversión está incompleta"
                        >
                          (incompleta)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.objective ?? SIN_DATO}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMetric(c.spend, 'money', currency)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMetric(c.impressions, 'int', currency)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMetric(c.clicks, 'int', currency)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMetric(c.ctr, 'pct', currency)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMetric(c.cpc, 'money', currency)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMetric(c.cpm, 'money', currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
