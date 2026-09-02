import { createClient } from '@/lib/supabase/server'
import { getMonedaTienda, getEstadoSync } from '@/lib/queries'
import { formatMetric, SIN_DATO } from '@/lib/format'
import { FormGasto } from './form'

export default async function GastoManualPage() {
  const supabase = await createClient()
  const currency = await getMonedaTienda()
  const sync = await getEstadoSync()

  const desde = new Date()
  desde.setUTCDate(desde.getUTCDate() - 29)

  const { data: filas } = await supabase
    .from('daily_ad_spend')
    .select('date, spend, currency, source')
    .gte('date', desde.toISOString().slice(0, 10))
    .order('date', { ascending: false })

  const metaSalteado = sync.find((s) => s.source === 'meta' && s.status === 'skipped')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Gasto manual</h1>
        <p className="text-sm text-muted-foreground">
          Para cuando el conector de Meta todavía no está disponible en tu cuenta.
        </p>
      </div>

      {metaSalteado && (
        <div role="status" className="rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground shadow-card">
          La última sincronización no pudo leer Meta Ads. Cargá acá la inversión
          de cada día y el CAC, el ROAS y el MER van a funcionar igual.
        </div>
      )}

      <section className="rounded-xl bg-card p-5 shadow-card">
        <h2 className="mb-4 text-sm font-semibold tracking-tight">Cargar un día</h2>
        <FormGasto monedaSugerida={currency} />
      </section>

      <section className="overflow-hidden rounded-xl bg-card shadow-card">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold tracking-tight">Últimos 30 días</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Los días marcados como <strong className="font-medium">Meta</strong> vienen
            de la sincronización y no se pueden editar a mano.
          </p>
        </div>

        {!filas?.length ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Todavía no hay inversión registrada.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="th-dato text-left">Día</th>
                  <th className="th-dato text-right">Inversión</th>
                  <th className="th-dato text-left">Moneda</th>
                  <th className="th-dato text-left">Origen</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={`${f.date}-${f.source}`} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 tabular-nums">{f.date}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMetric(f.spend, 'money', f.currency ?? currency)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{f.currency ?? SIN_DATO}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {f.source === 'mcp' ? 'Meta' : 'Manual'}
                      </span>
                    </td>
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
