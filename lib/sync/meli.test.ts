import { describe, expect, it } from 'vitest'
import { agregarPorDia, compradoresDe, estaVencido } from './meli'

/** Arma una orden minima con lo que mira la agregacion. */
function orden(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    status: 'paid',
    date_created: '2026-09-01T10:00:00.000-03:00',
    total_amount: 1000,
    currency_id: 'UYU',
    buyer: { id: 111 },
    order_items: [
      {
        quantity: 2,
        unit_price: 400,
        gross_price: 800,
        discounts: [{ amounts: { full: 100 } }],
        item: { id: 'MLU123', title: 'Remera' },
      },
    ],
    ...over,
  }
}

const nuevoSiempre = () => true

describe('agregarPorDia', () => {
  it('agrupa por dia y suma totales', () => {
    const { ventas } = agregarPorDia([orden(), orden({ id: 2 })], 'UYU', nuevoSiempre)

    expect(ventas).toHaveLength(1)
    expect(ventas[0].date).toBe('2026-09-01')
    expect(ventas[0].orders).toBe(2)
    expect(ventas[0].total_sales).toBe(2000)
    expect(ventas[0].gross_sales).toBe(1600)
    expect(ventas[0].discounts).toBe(200)
    expect(ventas[0].net_sales).toBe(1400)
  })

  it('calcula el ticket promedio sobre los totales del dia', () => {
    const { ventas } = agregarPorDia(
      [orden({ total_amount: 1000 }), orden({ id: 2, total_amount: 500 })],
      'UYU',
      nuevoSiempre,
    )
    expect(ventas[0].aov).toBe(750)
  })

  it('deja el ticket promedio en null si no hubo pedidos, nunca en 0', () => {
    // Solo una cancelacion: hay fila del dia, pero no hay ventas.
    const { ventas } = agregarPorDia(
      [orden({ status: 'cancelled' })],
      'UYU',
      nuevoSiempre,
    )
    expect(ventas[0].orders).toBe(0)
    expect(ventas[0].aov).toBeNull()
  })

  it('cuenta las canceladas como devolucion, no como venta', () => {
    const { ventas } = agregarPorDia(
      [orden(), orden({ id: 2, status: 'cancelled', total_amount: 300 })],
      'UYU',
      nuevoSiempre,
    )
    expect(ventas[0].orders).toBe(1)
    expect(ventas[0].total_sales).toBe(1000)
    expect(ventas[0].returns).toBe(300)
  })

  it('ignora estados que no son ni venta ni cancelacion', () => {
    const { ventas } = agregarPorDia(
      [orden({ status: 'payment_required' })],
      'UYU',
      nuevoSiempre,
    )
    expect(ventas).toHaveLength(0)
  })

  it('no cuenta dos veces al mismo comprador en el mismo dia', () => {
    const { ventas } = agregarPorDia(
      [orden(), orden({ id: 2 })], // mismo buyer 111
      'UYU',
      nuevoSiempre,
    )
    expect(ventas[0].customers).toBe(1)
    expect(ventas[0].new_customers).toBe(1)
  })

  it('separa nuevos de recurrentes segun el resolver', () => {
    const conocidos = new Set(['111'])
    const { ventas } = agregarPorDia(
      [orden(), orden({ id: 2, buyer: { id: 222 } })],
      'UYU',
      (id) => !conocidos.has(id),
    )
    expect(ventas[0].customers).toBe(2)
    expect(ventas[0].new_customers).toBe(1)
    expect(ventas[0].returning_customers).toBe(1)
  })

  it('arma las filas de producto sin duplicar el total del dia', () => {
    const { productos } = agregarPorDia([orden(), orden({ id: 2 })], 'UYU', nuevoSiempre)
    expect(productos).toHaveLength(1)
    expect(productos[0].product_id).toBe('MLU123')
    expect(productos[0].units).toBe(4)
    expect(productos[0].orders).toBe(2)
  })

  it('usa unit_price x cantidad si no viene gross_price', () => {
    const sinBruto = orden({
      order_items: [
        { quantity: 3, unit_price: 100, item: { id: 'MLU9', title: 'X' } },
      ],
    })
    const { ventas } = agregarPorDia([sinBruto], 'UYU', nuevoSiempre)
    expect(ventas[0].gross_sales).toBe(300)
  })

  it('separa dias distintos', () => {
    const { ventas } = agregarPorDia(
      [orden(), orden({ id: 2, date_created: '2026-09-02T10:00:00.000-03:00' })],
      'UYU',
      nuevoSiempre,
    )
    expect(ventas.map((v) => v.date).sort()).toEqual(['2026-09-01', '2026-09-02'])
  })
})

describe('compradoresDe', () => {
  it('devuelve id y fecha de cada orden con comprador', () => {
    expect(compradoresDe([orden()])).toEqual([{ id: '111', fecha: '2026-09-01' }])
  })

  it('omite las ordenes sin comprador', () => {
    expect(compradoresDe([orden({ buyer: undefined })])).toEqual([])
  })
})

describe('estaVencido', () => {
  const base = { accessToken: 'a', refreshToken: 'r', cuentaId: '1' }

  it('es true cuando ya paso la fecha', () => {
    expect(
      estaVencido({ ...base, expiresAt: new Date(Date.now() - 1000).toISOString() }),
    ).toBe(true)
  })

  it('es false cuando todavia falta', () => {
    expect(
      estaVencido({ ...base, expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    ).toBe(false)
  })
})
