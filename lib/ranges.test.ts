import { describe, it, expect } from 'vitest'
import { resolveRange, rangoAnterior, RANGOS, esPreset } from './ranges'

const HOY = new Date('2026-08-30T00:00:00Z')

describe('resolveRange', () => {
  it('7d devuelve 7 dias contando hoy', () => {
    expect(resolveRange('7d', HOY)).toEqual({ from: '2026-08-24', to: '2026-08-30' })
  })
  it('30d devuelve 30 dias contando hoy', () => {
    expect(resolveRange('30d', HOY)).toEqual({ from: '2026-08-01', to: '2026-08-30' })
  })
  it('90d cruza meses correctamente', () => {
    expect(resolveRange('90d', HOY)).toEqual({ from: '2026-06-02', to: '2026-08-30' })
  })
  it('12m devuelve 365 dias y cruza el ano', () => {
    expect(resolveRange('12m', HOY)).toEqual({ from: '2025-08-31', to: '2026-08-30' })
  })
  it('un preset invalido cae en 30d en vez de romper', () => {
    expect(resolveRange('cualquiera', HOY)).toEqual(resolveRange('30d', HOY))
  })
})

describe('rangoAnterior', () => {
  // Para comparar contra el periodo previo hay que retroceder exactamente
  // el mismo largo, sin solaparse ni dejar huecos.
  it('devuelve un periodo del mismo largo, pegado y sin solapar', () => {
    expect(rangoAnterior({ from: '2026-08-24', to: '2026-08-30' }))
      .toEqual({ from: '2026-08-17', to: '2026-08-23' })
  })
  it('funciona cruzando meses', () => {
    expect(rangoAnterior({ from: '2026-08-01', to: '2026-08-30' }))
      .toEqual({ from: '2026-07-02', to: '2026-07-31' })
  })
})

describe('catalogo de rangos', () => {
  it('expone los 4 presets con etiqueta', () => {
    expect(RANGOS.map((r) => r.valor)).toEqual(['7d', '30d', '90d', '12m'])
    expect(RANGOS.every((r) => r.etiqueta.length > 0)).toBe(true)
  })
  it('esPreset distingue validos de invalidos', () => {
    expect(esPreset('7d')).toBe(true)
    expect(esPreset('99d')).toBe(false)
  })
})
