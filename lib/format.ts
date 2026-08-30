// Formateo de numeros para pantalla.
//
// Este archivo NO calcula nada. Ni CAC, ni ROAS, ni promedios. Eso vive en la
// vista daily_metrics de Postgres. Aca solo se decide como se ve un numero
// que ya viene calculado.
//
// La regla central: un dato ausente se muestra como "—", nunca como 0.
// Cero es informacion ("no gastaste nada hoy"). Ausencia es otra cosa
// ("no sabemos cuanto gastaste"). Mostrarlos igual es como un dashboard
// termina mintiendo sin que nadie lo note.

export const SIN_DATO = '—'

export type TipoMetrica = 'money' | 'pct' | 'int' | 'ratio'

/** Valor tal como puede llegar de Postgres: numero, texto, o nada. */
export type Valor = number | string | null | undefined

const LOCALE = 'es-UY'

/**
 * Convierte a numero, o devuelve null si no hay dato utilizable.
 * Postgres devuelve los `numeric` como string, por eso aceptamos texto.
 */
function aNumero(v: Valor): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export function formatMoney(v: Valor, currency: string): string {
  const n = aNumero(v)
  if (n === null) return SIN_DATO

  // Decimales segun magnitud. Con un rango fijo de 0 a 2 decimales, los montos
  // grandes quedan con una cola irregular ("$ 1.131.760,8") que se lee como si
  // faltara un digito. Arriba de mil los centavos no aportan nada; abajo, si.
  const decimales = Math.abs(n) >= 1000 ? 0 : 2

  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n)
}

export function formatInt(v: Valor): string {
  const n = aNumero(v)
  if (n === null) return SIN_DATO
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(n)
}

export function formatPct(v: Valor): string {
  const n = aNumero(v)
  if (n === null) return SIN_DATO
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(n)}%`
}

export function formatRatio(v: Valor): string {
  const n = aNumero(v)
  if (n === null) return SIN_DATO
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(n)}x`
}

/** Variacion contra el periodo anterior. El signo va siempre explicito. */
export function formatDelta(v: Valor): string {
  const n = aNumero(v)
  if (n === null) return SIN_DATO
  const texto = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(n)
  return `${n > 0 ? '+' : ''}${texto}%`
}

export function formatMetric(v: Valor, tipo: TipoMetrica, currency: string): string {
  switch (tipo) {
    case 'money': return formatMoney(v, currency)
    case 'pct':   return formatPct(v)
    case 'int':   return formatInt(v)
    case 'ratio': return formatRatio(v)
  }
}
