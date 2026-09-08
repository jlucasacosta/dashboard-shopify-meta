import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { comparacionSegura, diaAResincronizar, hmacShopifyValido } from './firmas'

const SECRETO = 'shpss_secreto_de_prueba'

function firmar(cuerpo: string, secreto = SECRETO) {
  return createHmac('sha256', secreto).update(cuerpo, 'utf8').digest('base64')
}

describe('comparacionSegura', () => {
  it('acepta dos valores iguales', () => {
    expect(comparacionSegura('abc123', 'abc123')).toBe(true)
  })

  it('rechaza valores distintos del mismo largo', () => {
    expect(comparacionSegura('abc123', 'abc124')).toBe(false)
  })

  it('rechaza largos distintos sin explotar', () => {
    // timingSafeEqual tira si los buffers no miden igual: si esto explota en
    // vez de devolver false, el endpoint del cron devuelve 500 en vez de 401.
    expect(comparacionSegura('corto', 'muchisimo mas largo')).toBe(false)
    expect(comparacionSegura('', 'algo')).toBe(false)
  })

  it('rechaza el prefijo correcto', () => {
    expect(comparacionSegura('abc', 'abc123')).toBe(false)
  })
})

describe('hmacShopifyValido', () => {
  const cuerpo = '{"id":123,"created_at":"2026-09-01T10:00:00-03:00","total_price":"100.00"}'

  it('acepta un cuerpo firmado con el secreto correcto', () => {
    expect(hmacShopifyValido(cuerpo, firmar(cuerpo), SECRETO)).toBe(true)
  })

  it('rechaza si el cuerpo cambio aunque sea un byte', () => {
    const firma = firmar(cuerpo)
    expect(hmacShopifyValido(cuerpo + ' ', firma, SECRETO)).toBe(false)
  })

  it('rechaza una firma hecha con otro secreto', () => {
    expect(hmacShopifyValido(cuerpo, firmar(cuerpo, 'otro_secreto_distinto'), SECRETO)).toBe(false)
  })

  it('rechaza si no viene firma', () => {
    expect(hmacShopifyValido(cuerpo, null, SECRETO)).toBe(false)
  })

  it('rechaza una firma vacia o basura sin explotar', () => {
    expect(hmacShopifyValido(cuerpo, '', SECRETO)).toBe(false)
    expect(hmacShopifyValido(cuerpo, 'no-es-base64-!!!', SECRETO)).toBe(false)
  })

  // Este es el caso que documenta por que el route handler usa request.text()
  // y no request.json().
  //
  // Un JSON puede volver a serializarse distinto sin dejar de ser el mismo
  // JSON: los espacios se pierden y un 100.00 vuelve como 100. El objeto es
  // equivalente, los BYTES no, y el HMAC firma bytes.
  it('falla si el cuerpo se reserializo, aunque el JSON sea equivalente', () => {
    const original = '{"id": 123, "total_price": 100.00}'
    const firma = firmar(original)

    const reserializado = JSON.stringify(JSON.parse(original))
    expect(reserializado).toBe('{"id":123,"total_price":100}')
    expect(reserializado).not.toBe(original)

    // Mismo objeto, distinta firma.
    expect(JSON.parse(reserializado)).toEqual(JSON.parse(original))
    expect(hmacShopifyValido(original, firma, SECRETO)).toBe(true)
    expect(hmacShopifyValido(reserializado, firma, SECRETO)).toBe(false)
  })
})

describe('diaAResincronizar', () => {
  const hoy = new Date('2026-09-05T12:00:00.000Z')

  it('usa la fecha de creacion del pedido, no la de hoy', () => {
    // Un reembolso de hoy sobre una venta vieja tiene que refrescar el dia
    // viejo. Si devolviera hoy, ese dia quedaria mal para siempre.
    const cuerpo = JSON.stringify({ created_at: '2026-08-20T15:30:00-03:00' })
    expect(diaAResincronizar(cuerpo, hoy)).toBe('2026-08-20')
  })

  it('cae a updated_at si no hay created_at', () => {
    const cuerpo = JSON.stringify({ updated_at: '2026-08-21T15:30:00-03:00' })
    expect(diaAResincronizar(cuerpo, hoy)).toBe('2026-08-21')
  })

  it('cae al dia de hoy si el payload no trae fecha', () => {
    expect(diaAResincronizar(JSON.stringify({ id: 1 }), hoy)).toBe('2026-09-05')
  })

  it('cae al dia de hoy si el payload no es JSON', () => {
    expect(diaAResincronizar('no soy json', hoy)).toBe('2026-09-05')
  })

  it('cae al dia de hoy si la fecha es invalida', () => {
    const cuerpo = JSON.stringify({ created_at: 'mañana a la tarde' })
    expect(diaAResincronizar(cuerpo, hoy)).toBe('2026-09-05')
  })

  it('respeta el calendario de la tienda, no el UTC', () => {
    // 2026-08-20 22:00 en UTC-3 es 2026-08-21 01:00 UTC. ShopifyQL cuenta esa
    // venta el 20, porque reporta en la zona horaria de la tienda. Si aca
    // marcaramos el 21, el dia 20 quedaria desactualizado para siempre: el
    // cron refrescaria un dia que no cambio y nunca el que si.
    const cuerpo = JSON.stringify({ created_at: '2026-08-20T22:00:00-03:00' })
    expect(diaAResincronizar(cuerpo, hoy)).toBe('2026-08-20')
  })

  it('respeta el calendario de la tienda tambien con offset positivo', () => {
    // El caso real que destapo esto: tienda en Asia/Dubai (+04). Un pedido de
    // las 20:36 UTC es 00:36 del dia siguiente en la tienda, y asi lo cuenta
    // ShopifyQL.
    const cuerpo = JSON.stringify({ created_at: '2026-09-09T00:36:50+04:00' })
    expect(diaAResincronizar(cuerpo, hoy)).toBe('2026-09-09')
  })

  it('acepta una fecha que ya viene en UTC', () => {
    const cuerpo = JSON.stringify({ created_at: '2026-08-20T22:00:00Z' })
    expect(diaAResincronizar(cuerpo, hoy)).toBe('2026-08-20')
  })
})
