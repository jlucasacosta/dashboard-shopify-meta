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
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>

      <p
        className={cn(
          'mt-1.5 text-2xl font-medium tabular-nums tracking-tight',
          falta && 'text-muted-foreground',
        )}
      >
        {texto}
      </p>

      {falta && motivoFalta ? (
        // Un dato ausente explicado es informacion. Un cero en su lugar
        // seria una mentira que nadie detecta.
        <p className="mt-1 text-xs text-muted-foreground">{motivoFalta}</p>
      ) : (
        <Delta valor={delta} bajarEsBueno={bajarEsBueno} />
      )}
    </div>
  )
}

function Delta({ valor, bajarEsBueno }: { valor: Valor; bajarEsBueno: boolean }) {
  const texto = formatDelta(valor)
  if (texto === SIN_DATO) return <p className="mt-1 h-4 text-xs" />

  const n = Number(valor)
  const neutro = !Number.isFinite(n) || n === 0
  const bueno = bajarEsBueno ? n < 0 : n > 0

  return (
    <p className="mt-1 flex items-center gap-1 text-xs">
      {/* El color no lleva el significado solo: el signo del numero ya lo dice. */}
      <span
        className={cn(
          'tabular-nums',
          neutro ? 'text-muted-foreground' : bueno ? 'text-[#0ca30c]' : 'text-[#d03b3b]',
        )}
      >
        {texto}
      </span>
      <span className="text-muted-foreground">vs. período anterior</span>
    </p>
  )
}
