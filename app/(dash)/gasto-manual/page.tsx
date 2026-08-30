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
        <h1 className="text-xl font-medium tracking-tight">Gasto manual</h1>
        <p className="text-sm text-muted-foreground">
          Para cuando el conector de Meta todavía no está disponible en tu cuenta.
        </p>
      </div>

      {metaSalteado && (
        <div role="status" className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
          La última sincronización no pudo leer Meta Ads. Cargá acá la inversión
          de cada día y el CAC, el ROAS y el MER van a funcionar igual.
        </div>
      )}

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-4 text-sm font-medium tracking-tight">Cargar un día</h2>
        <FormGasto monedaSugerida={currency} />
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium tracking-tight">Últimos 30 días</h2>
          <p className="text-xs text-muted-foreground">
            Los días marcados como <strong className="font-medium">Meta</strong> vienen
            de la sincronización y no se pueden editar a mano.
          </p>
        </div>

        {!filas?.length ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Todavía no hay inversión registrada.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-normal">Día</th>
                  <th className="px-4 py-2 text-right font-normal">Inversión</th>
                  <th className="px-4 py-2 text-left font-normal">Moneda</th>
                  <th className="px-4 py-2 text-left font-normal">Origen</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={`${f.date}-${f.source}`} className="border-b last:border-0">
                    <td className="px-4 py-2.5 tabular-nums">{f.date}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMetric(f.spend, 'money', f.currency ?? currency)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{f.currency ?? SIN_DATO}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
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
