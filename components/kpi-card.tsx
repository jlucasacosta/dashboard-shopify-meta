import { formatMetric, formatDelta, SIN_DATO, type TipoMetrica, type Valor } from '@/lib/format'
import { cn } from '@/lib/utils'

type Props = {
  etiqueta: string
  valor: Valor
  tipo: TipoMetrica
  currency: string
  /** Variacion porcentual contra el periodo anterior. */
  delta?: Valor
  /** Si true, que el numero baje es bueno (CAC, CPC, CPM). */
  bajarEsBueno?: boolean
  /** Se muestra cuando el valor falta, explicando por que. */
  motivoFalta?: string
}

export function KpiCard({
  etiqueta,
  valor,
  tipo,
  currency,
  delta,
  bajarEsBueno = false,
  motivoFalta,
}: Props) {
  const texto = formatMetric(valor, tipo, currency)
  const falta = texto === SIN_DATO

  return (
    <div className="rounded-xl bg-card p-4 shadow-card transition-shadow hover:shadow-pop">
      <p className="etiqueta-kpi">{etiqueta}</p>

      <p
        className={cn(
          'text-[1.75rem] leading-9 font-semibold tabular-nums tracking-[-0.02em]',
          falta && 'text-muted-foreground',
        )}
      >
        {texto}
      </p>

      {falta && motivoFalta ? (
        // Un dato ausente explicado es informacion. Un cero en su lugar
        // seria una mentira que nadie detecta.
        <p className="mt-2 text-xs leading-4 text-muted-foreground">{motivoFalta}</p>
      ) : (
        <Delta valor={delta} bajarEsBueno={bajarEsBueno} />
      )}
    </div>
  )
}

function Delta({ valor, bajarEsBueno }: { valor: Valor; bajarEsBueno: boolean }) {
  const texto = formatDelta(valor)
  if (texto === SIN_DATO) return <p className="mt-2 h-5 text-xs" />

  const n = Number(valor)
  const neutro = !Number.isFinite(n) || n === 0
  const bueno = bajarEsBueno ? n < 0 : n > 0

  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5">
      {/* El color no lleva el significado solo: la flecha y el signo del
          numero dicen lo mismo sin depender de la vista. */}
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular-nums',
          neutro
            ? 'bg-muted text-muted-foreground'
            : bueno
              ? 'bg-success-soft text-success'
              : 'bg-danger-soft text-danger',
        )}
      >
        {!neutro && <span aria-hidden>{n > 0 ? '↑' : '↓'}</span>}
        {texto}
      </span>
      <span className="text-muted-foreground">vs. período anterior</span>
    </p>
  )
}
