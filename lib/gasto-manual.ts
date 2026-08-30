// Validacion de la carga manual del gasto publicitario.
//
// Se separa de la server action para poder testearla sin base de datos.
// Es la unica escritura que el dashboard permite desde el navegador, asi que
// vale la pena que sea estricta y que los mensajes de error se entiendan.

export type EntradaGasto = {
  date: string
  spend: string
  currency: string
}

export type GastoValido = {
  date: string
  spend: number
  currency: string
}

export type Resultado =
  | { ok: true; valor: GastoValido }
  | { ok: false; error: string }

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/
const MONEDA_ISO = /^[A-Za-z]{3}$/

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Normaliza un monto escrito a mano a un numero que JS entienda.
 *
 * El campo del formulario devuelve "1500.50" (punto decimal), pero alguien
 * pegando un valor de una planilla en español escribe "1.500,50". Los dos
 * tienen que funcionar.
 *
 * Regla: si aparecen los dos separadores, el ULTIMO es el decimal y el otro
 * es de miles. Si aparece uno solo, es el decimal.
 */
function aNumeroFlexible(texto: string): string {
  const limpio = texto.replace(/\s/g, '')
  const ultimaComa = limpio.lastIndexOf(',')
  const ultimoPunto = limpio.lastIndexOf('.')

  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    const decimal = ultimaComa > ultimoPunto ? ',' : '.'
    const miles = decimal === ',' ? '.' : ','
    return limpio.split(miles).join('').replace(decimal, '.')
  }
  return limpio.replace(',', '.')
}

export function validarGasto(entrada: EntradaGasto, hoy = hoyISO()): Resultado {
  const date = entrada.date?.trim() ?? ''
  if (!FECHA_ISO.test(date)) {
    return { ok: false, error: 'La fecha tiene que estar en formato AAAA-MM-DD.' }
  }
  if (Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    return { ok: false, error: 'Esa fecha no existe.' }
  }
  if (date > hoy) {
    return { ok: false, error: 'No se puede cargar gasto de una fecha en el futuro.' }
  }

  const crudo = (entrada.spend ?? '').trim()
  if (crudo === '') {
    return { ok: false, error: 'Escribí cuánto gastaste.' }
  }
  const spend = Number(aNumeroFlexible(crudo))
  if (!Number.isFinite(spend)) {
    return { ok: false, error: 'El monto tiene que ser un número.' }
  }
  if (spend < 0) {
    return { ok: false, error: 'El monto no puede ser negativo.' }
  }

  const currency = (entrada.currency ?? '').trim()
  if (!MONEDA_ISO.test(currency)) {
    return {
      ok: false,
      error: 'La moneda tiene que ser un código de 3 letras, como USD o UYU.',
    }
  }

  return {
    ok: true,
    valor: { date, spend, currency: currency.toUpperCase() },
  }
}
