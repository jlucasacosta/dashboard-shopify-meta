// Rangos de fecha del dashboard.
//
// Todo se calcula en UTC a proposito: si usaramos la zona horaria local, el
// mismo rango daria dias distintos segun donde este parado el usuario, y los
// totales no cerrarian con los de Shopify.

export type Preset = '7d' | '30d' | '90d' | '12m'

export type Rango = {
  /** Fecha inicial inclusive, formato YYYY-MM-DD */
  from: string
  /** Fecha final inclusive, formato YYYY-MM-DD */
  to: string
}

export const RANGOS: { valor: Preset; etiqueta: string; dias: number }[] = [
  { valor: '7d',  etiqueta: 'Últimos 7 días',   dias: 7 },
  { valor: '30d', etiqueta: 'Últimos 30 días',  dias: 30 },
  { valor: '90d', etiqueta: 'Últimos 90 días',  dias: 90 },
  { valor: '12m', etiqueta: 'Últimos 12 meses', dias: 365 },
]

export const PRESET_POR_DEFECTO: Preset = '30d'

export function esPreset(v: string): v is Preset {
  return RANGOS.some((r) => r.valor === v)
}

function aISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return aISO(d)
}

/**
 * Convierte un preset en un rango concreto.
 * El rango incluye hoy: "7 días" son hoy y los 6 anteriores.
 * Un preset desconocido cae en el por defecto en vez de romper la pagina.
 */
export function resolveRange(preset: string, hoy = new Date()): Rango {
  const elegido = RANGOS.find((r) => r.valor === preset)
    ?? RANGOS.find((r) => r.valor === PRESET_POR_DEFECTO)!

  const to = aISO(hoy)
  return { from: sumarDias(to, -(elegido.dias - 1)), to }
}

/**
 * Periodo inmediatamente anterior, del mismo largo.
 * Se usa para el "+12% contra el período anterior" de las tarjetas.
 * Tiene que quedar pegado al rango actual: sin solaparse y sin dejar huecos.
 */
export function rangoAnterior(rango: Rango): Rango {
  const desde = new Date(`${rango.from}T00:00:00Z`)
  const hasta = new Date(`${rango.to}T00:00:00Z`)
  const dias = Math.round((hasta.getTime() - desde.getTime()) / 86_400_000) + 1

  return {
    from: sumarDias(rango.from, -dias),
    to: sumarDias(rango.from, -1),
  }
}

export function etiquetaDe(preset: Preset): string {
  return RANGOS.find((r) => r.valor === preset)?.etiqueta ?? ''
}
