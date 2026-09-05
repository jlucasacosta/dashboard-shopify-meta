// Tipo de cambio historico, para cuando la cuenta de Meta factura en una moneda
// y la tienda vende en otra (por ejemplo cuenta en USD, tienda en UYU).
//
// La regla que ordena todo esto: se usa la tasa DEL DIA de cada gasto, nunca la
// de hoy. Convertir el gasto de marzo con la tasa de septiembre da un CAC que
// parece razonable y es mentira.
//
// Y si un dia no se consigue la tasa, ese dia queda SIN tasa. La vista
// daily_metrics devuelve NULL para ese dia y el panel avisa que la inversion
// esta incompleta. Nunca se aproxima con la tasa del dia anterior.

/** API publica, sin clave, con historico diario. */
function url(fecha: string, base: string) {
  return `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${fecha}/v1/currencies/${base.toLowerCase()}.json`
}

export type FilaTasa = {
  date: string
  base_currency: string
  quote_currency: string
  rate: number
}

/**
 * Trae las tasas de las fechas pedidas. Las que no se consiguen simplemente no
 * vuelven en el resultado: el que llama las reporta como dias sin tasa.
 */
export async function traerTasas(
  fechas: string[],
  base: string,
  quote: string,
): Promise<{ tasas: FilaTasa[]; sinTasa: string[] }> {
  const tasas: FilaTasa[] = []
  const sinTasa: string[] = []

  // De a 5 en paralelo: es un CDN, pero no hay por que golpearlo con 365
  // pedidos simultaneos desde una funcion serverless.
  const LOTE = 5
  for (let i = 0; i < fechas.length; i += LOTE) {
    const grupo = fechas.slice(i, i + LOTE)
    const resultados = await Promise.all(
      grupo.map(async (fecha) => {
        try {
          const res = await fetch(url(fecha, base))
          if (!res.ok) return null
          const json = (await res.json()) as Record<string, unknown>
          const monedas = json[base.toLowerCase()] as
            | Record<string, number>
            | undefined
          const rate = monedas?.[quote.toLowerCase()]
          if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
            return null
          }
          return {
            date: fecha,
            base_currency: base,
            quote_currency: quote,
            rate,
          } satisfies FilaTasa
        } catch {
          return null
        }
      }),
    )

    resultados.forEach((r, j) => {
      if (r) tasas.push(r)
      else sinTasa.push(grupo[j])
    })
  }

  return { tasas, sinTasa }
}
