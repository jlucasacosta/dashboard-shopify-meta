import { describe, expect, it } from 'vitest'
import {
  CANAL_POR_DEFECTO,
  esCanal,
  etiquetaCanal,
  filtroCanal,
  tieneEmbudo,
} from './canales'

describe('esCanal', () => {
  it('acepta los tres validos', () => {
    expect(esCanal('todos')).toBe(true)
    expect(esCanal('shopify')).toBe(true)
    expect(esCanal('meli')).toBe(true)
  })

  it('rechaza cualquier otra cosa que venga por la URL', () => {
    // Lo que llega en ?ch= lo escribe cualquiera: si no se valida, termina
    // como filtro en una consulta.
    expect(esCanal('amazon')).toBe(false)
    expect(esCanal('')).toBe(false)
    expect(esCanal('SHOPIFY')).toBe(false)
    expect(esCanal("shopify' or 1=1")).toBe(false)
  })
})

describe('filtroCanal', () => {
  it('traduce "todos" a undefined: no manda el argumento y la funcion SQL usa su default', () => {
    expect(filtroCanal('todos')).toBeUndefined()
  })

  it('pasa el canal tal cual cuando hay filtro', () => {
    expect(filtroCanal('shopify')).toBe('shopify')
    expect(filtroCanal('meli')).toBe('meli')
  })
})

describe('tieneEmbudo', () => {
  it('Shopify tiene embudo completo', () => {
    expect(tieneEmbudo('shopify')).toBe(true)
  })

  it('Mercado Libre no: su checkout no es del vendedor', () => {
    // Si esto cambia a true, el panel muestra un embudo con dos pasos vacios
    // como si fueran ceros reales.
    expect(tieneEmbudo('meli')).toBe(false)
  })

  it('con "todos" se muestra, porque los datos son de Shopify', () => {
    expect(tieneEmbudo('todos')).toBe(true)
  })
})

describe('etiquetaCanal', () => {
  it('devuelve el nombre para mostrar', () => {
    expect(etiquetaCanal('meli')).toBe('Mercado Libre')
    expect(etiquetaCanal(CANAL_POR_DEFECTO)).toBe('Todos los canales')
  })
})
