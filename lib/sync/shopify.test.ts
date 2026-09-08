import { describe, expect, it } from 'vitest'
import { aNumeroONull, hoyEnZona } from './shopify'

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

// ShopifyQL NO reporta en UTC: reporta en la zona horaria de la tienda. Pedirle
// el dia UTC a una tienda que no esta en UTC devuelve el dia equivocado, y el
// sync termina con status ok escribiendo numeros que no cierran con el admin.
describe('hoyEnZona', () => {
  it('usa el calendario de la tienda, no el de UTC', () => {
    // 03:00 UTC del 9 todavia es el 8 en Montevideo (UTC-3).
    const ahora = new Date('2026-09-09T02:00:00.000Z')
    expect(hoyEnZona('America/Montevideo', ahora)).toBe('2026-09-08')
    expect(hoyEnZona('UTC', ahora)).toBe('2026-09-09')
  })

  it('adelanta el dia en zonas al este', () => {
    // El caso real que destapo esto: una tienda quedo en Asia/Dubai (+04).
    const ahora = new Date('2026-09-08T20:36:50.000Z')
    expect(hoyEnZona('Asia/Dubai', ahora)).toBe('2026-09-09')
    expect(hoyEnZona('America/Montevideo', ahora)).toBe('2026-09-08')
  })

  it('cae a UTC si la zona no existe, en vez de explotar', () => {
    // Shopify siempre manda una IANA valida, pero un sync que se cae entero
    // por una zona rara es peor que uno que corre con el dia UTC.
    const ahora = new Date('2026-09-08T20:36:50.000Z')
    expect(hoyEnZona('No/Existe', ahora)).toBe('2026-09-08')
  })
})
