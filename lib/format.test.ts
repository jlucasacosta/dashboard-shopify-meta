import { describe, it, expect } from 'vitest'
import { formatMoney, formatPct, formatInt, formatRatio, formatMetric, SIN_DATO } from './format'

describe('formatMoney', () => {
  it('usa coma decimal y punto de miles, como en es-UY', () => {
    expect(formatMoney(12.5, 'UYU')).toContain('12,5')
    expect(formatMoney(1234, 'UYU')).toContain('1.234')
  })

  // Con decimales fijos, los montos grandes quedaban con una cola irregular
  // ("$ 1.131.760,8") que se lee como si faltara un digito.
  it('arriba de mil no muestra centavos', () => {
    expect(formatMoney(1131760.8, 'UYU')).not.toContain(',')
    expect(formatMoney(1234.5, 'UYU')).not.toContain(',5')
  })
  it('abajo de mil si muestra centavos, y siempre dos', () => {
    expect(formatMoney(999.5, 'UYU')).toContain('999,50')
    expect(formatMoney(12, 'UYU')).toContain('12,00')
  })

  it('muestra el guion cuando no hay dato', () => {
    expect(formatMoney(null, 'UYU')).toBe(SIN_DATO)
    expect(formatMoney(undefined, 'UYU')).toBe(SIN_DATO)
  })
  it('acepta el numero como texto, que es como lo devuelve Postgres', () => {
    expect(formatMoney('999.5', 'UYU')).toContain('999,50')
  })
})

describe('formatInt / formatPct / formatRatio', () => {
  it('formatea enteros con separador de miles', () => {
    expect(formatInt(12345)).toBe('12.345')
  })
  it('formatea porcentajes', () => {
    expect(formatPct(27.44)).toBe('27,44%')
  })
  it('formatea ratios con una x', () => {
    expect(formatRatio(3.64)).toBe('3,64x')
  })
})

describe('formatMetric', () => {
  // Este es el contrato que impide que el dashboard invente un numero.
  it('nunca inventa un valor cuando el dato falta', () => {
    expect(formatMetric(null, 'money', 'UYU')).toBe(SIN_DATO)
    expect(formatMetric(null, 'pct', 'UYU')).toBe(SIN_DATO)
    expect(formatMetric(null, 'int', 'UYU')).toBe(SIN_DATO)
    expect(formatMetric(null, 'ratio', 'UYU')).toBe(SIN_DATO)
  })

  // Cero es un dato. "No hay dato" es otra cosa. Confundirlos es como
  // un dashboard miente sin que nadie lo note.
  it('no confunde cero con ausencia de dato', () => {
    expect(formatMetric(0, 'int', 'UYU')).toBe('0')
    expect(formatMetric(0, 'pct', 'UYU')).toBe('0%')
    expect(formatMetric(0, 'money', 'UYU')).not.toBe(SIN_DATO)
  })

  it('trata el texto vacio y NaN como ausencia de dato', () => {
    expect(formatMetric('', 'money', 'UYU')).toBe(SIN_DATO)
    expect(formatMetric(NaN, 'money', 'UYU')).toBe(SIN_DATO)
  })
})

describe('formatDelta', () => {
  it('marca el signo explicitamente', async () => {
    const { formatDelta } = await import('./format')
    expect(formatDelta(12.3)).toBe('+12,3%')
    expect(formatDelta(-8)).toBe('-8%')
    expect(formatDelta(0)).toBe('0%')
    expect(formatDelta(null)).toBe(SIN_DATO)
  })
})
