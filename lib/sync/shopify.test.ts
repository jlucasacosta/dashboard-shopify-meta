import { describe, expect, it } from 'vitest'
import { aNumeroONull } from './shopify'

// Este es el detalle que mas facil se rompe y mas caro sale: Shopify devuelve
// texto vacio (no 0) cuando no hubo pedidos ni sesiones. Si eso entra a la base
// como 0, el panel muestra "ticket promedio: $0" y "conversion: 0%" en vez de
// "—", y un numero equivocado no falla nunca: miente siempre.
describe('aNumeroONull', () => {
  it('convierte texto vacio en null, nunca en 0', () => {
    expect(aNumeroONull('')).toBeNull()
    expect(aNumeroONull('   ')).toBeNull()
  })

  it('trata undefined como ausencia', () => {
    expect(aNumeroONull(undefined)).toBeNull()
  })

  it('conserva el cero de verdad', () => {
    expect(aNumeroONull('0')).toBe(0)
  })

  it('lee decimales', () => {
    expect(aNumeroONull('1234.56')).toBe(1234.56)
  })

  it('devuelve null si no es un numero', () => {
    expect(aNumeroONull('N/A')).toBeNull()
  })
})
