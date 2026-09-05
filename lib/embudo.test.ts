import { describe, expect, it } from 'vitest'
import { esAusente, proporcion } from '@/components/charts/embudo'

// La barra y el numero que tiene al lado tienen que decir lo mismo. Si esta
// cuenta se rompe, el grafico contradice a su propia etiqueta, que es peor que
// no tener grafico.
describe('proporcion', () => {
  it('el primer paso ocupa el 100%', () => {
    expect(proporcion(1000, 1000)).toBe(100)
  })

  it('escala proporcional al tope', () => {
    expect(proporcion(250, 1000)).toBe(25)
    expect(proporcion(1, 8)).toBe(12.5)
  })

  it('acepta los numeric de Postgres, que llegan como string', () => {
    expect(proporcion('250', 1000)).toBe(25)
  })

  it('un cero real es una barra de cero, no un error', () => {
    expect(proporcion(0, 1000)).toBe(0)
  })

  it('un dato ausente no dibuja barra', () => {
    // Sin esto, un null se volveria NaN y el ancho quedaria "maxNaN%": la
    // barra desaparece o se estira entera, segun el navegador.
    expect(proporcion(null, 1000)).toBe(0)
    expect(proporcion(undefined, 1000)).toBe(0)
  })

  it('no divide por cero cuando no hubo visitas', () => {
    expect(proporcion(0, 0)).toBe(0)
    expect(proporcion(10, 0)).toBe(0)
  })

  it('nunca se pasa del 100% aunque los datos vengan raros', () => {
    // Un paso no puede ser mayor que el anterior, pero si la base se
    // desincroniza no se dibuja una barra que se sale de la tarjeta.
    expect(proporcion(2000, 1000)).toBe(100)
  })

  it('nunca es negativa', () => {
    expect(proporcion(-50, 1000)).toBe(0)
  })
})

describe('esAusente', () => {
  it('null y undefined son ausencia', () => {
    expect(esAusente(null)).toBe(true)
    expect(esAusente(undefined)).toBe(true)
  })

  it('el texto vacio de ShopifyQL es ausencia, no cero', () => {
    // Shopify devuelve '' (no 0) cuando no hubo sesiones ni pedidos.
    expect(esAusente('')).toBe(true)
    expect(esAusente('   ')).toBe(true)
  })

  it('un cero de verdad NO es ausencia', () => {
    // Esta es la distincion que sostiene todo el panel: 0 visitas es un dato,
    // "no sabemos cuantas visitas hubo" es otro.
    expect(esAusente(0)).toBe(false)
    expect(esAusente('0')).toBe(false)
  })

  it('un valor real no es ausencia', () => {
    expect(esAusente(1234)).toBe(false)
    expect(esAusente('1234.5')).toBe(false)
  })

  it('basura que no es numero cuenta como ausencia', () => {
    expect(esAusente('N/A')).toBe(true)
  })
})
