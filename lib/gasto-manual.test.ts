import { describe, it, expect } from 'vitest'
import { validarGasto } from './gasto-manual'

const HOY = '2026-08-30'

describe('validarGasto', () => {
  it('acepta una carga normal', () => {
    const r = validarGasto({ date: '2026-08-29', spend: '1500.50', currency: 'usd' }, HOY)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.valor.spend).toBe(1500.5)
      expect(r.valor.currency).toBe('USD') // se normaliza a mayusculas
    }
  })

  it('acepta cero: gastar nada es un dato valido', () => {
    expect(validarGasto({ date: HOY, spend: '0', currency: 'USD' }, HOY).ok).toBe(true)
  })

  it('rechaza fechas futuras', () => {
    const r = validarGasto({ date: '2026-09-15', spend: '10', currency: 'USD' }, HOY)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/futuro/i)
  })

  it('rechaza montos negativos', () => {
    const r = validarGasto({ date: HOY, spend: '-5', currency: 'USD' }, HOY)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/negativ/i)
  })

  it('rechaza montos que no son numeros', () => {
    expect(validarGasto({ date: HOY, spend: 'mil pesos', currency: 'USD' }, HOY).ok).toBe(false)
    expect(validarGasto({ date: HOY, spend: '', currency: 'USD' }, HOY).ok).toBe(false)
  })

  it('rechaza fechas mal formadas', () => {
    expect(validarGasto({ date: '30/08/2026', spend: '10', currency: 'USD' }, HOY).ok).toBe(false)
    expect(validarGasto({ date: '', spend: '10', currency: 'USD' }, HOY).ok).toBe(false)
  })

  it('rechaza monedas que no son codigos ISO de 3 letras', () => {
    expect(validarGasto({ date: HOY, spend: '10', currency: 'dolares' }, HOY).ok).toBe(false)
    expect(validarGasto({ date: HOY, spend: '10', currency: 'US' }, HOY).ok).toBe(false)
  })

  // El campo del formulario manda "1500.50", pero alguien que pega un valor
  // de una planilla en español escribe "1.500,50". Los dos tienen que andar.
  it.each([
    ['1500.50', 1500.5],   // punto decimal, como lo manda el input
    ['1500,50', 1500.5],   // coma decimal, como lo escribe la gente
    ['1.500,50', 1500.5],  // miles con punto, decimal con coma
    ['1,500.50', 1500.5],  // miles con coma, decimal con punto
    ['1500', 1500],
    ['1 500,50', 1500.5],  // con espacio de miles
  ])('interpreta %s como %d', (texto, esperado) => {
    const r = validarGasto({ date: HOY, spend: texto, currency: 'USD' }, HOY)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor.spend).toBe(esperado)
  })
})
