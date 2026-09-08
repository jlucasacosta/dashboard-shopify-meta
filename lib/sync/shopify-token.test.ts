import { describe, expect, it, vi } from 'vitest'
import { pedirToken, vigente } from './shopify-token'

const cfg = {
  shopDomain: 'tienda-de-prueba.myshopify.com',
  clientId: 'id-de-prueba',
  apiSecret: 'secreto-de-prueba',
}

function respuesta(status: number, cuerpo: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  })) as unknown as typeof fetch
}

describe('vigente', () => {
  const ahora = Date.parse('2026-09-07T12:00:00.000Z')

  it('acepta un vencimiento lejano', () => {
    expect(vigente('2026-09-08T11:00:00.000Z', ahora)).toBe(true)
  })

  it('renueva antes de que venza de verdad: 5 minutos no alcanzan', () => {
    expect(vigente('2026-09-07T12:05:00.000Z', ahora)).toBe(false)
  })

  it('un vencimiento ilegible cuenta como vencido', () => {
    expect(vigente('no es una fecha', ahora)).toBe(false)
  })
})

describe('pedirToken', () => {
  it('manda el grant de client credentials y devuelve token, vencimiento y scopes', async () => {
    const fetchImpl = respuesta(200, {
      access_token: 'tok',
      scope: 'read_reports,read_orders',
      expires_in: 86399,
    })

    const r = await pedirToken(cfg, fetchImpl)

    expect(r.token).toBe('tok')
    expect(r.scopes).toEqual(['read_reports', 'read_orders'])
    expect(Date.parse(r.expiresAt) - Date.now()).toBeGreaterThan(86000 * 1000)

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://tienda-de-prueba.myshopify.com/admin/oauth/access_token')
    expect(JSON.parse(init.body as string)).toEqual({
      client_id: 'id-de-prueba',
      client_secret: 'secreto-de-prueba',
      grant_type: 'client_credentials',
    })
  })

  it('explica shop_not_permitted en vez de repetir el codigo', async () => {
    const fetchImpl = respuesta(400, {
      error: 'shop_not_permitted',
      error_description: 'Client credentials cannot be performed on this shop',
    })
    await expect(pedirToken(cfg, fetchImpl)).rejects.toThrow(/MISMA organizacion/)
  })

  it('un 401 apunta a las credenciales', async () => {
    const fetchImpl = respuesta(401, { error: 'invalid_client' })
    await expect(pedirToken(cfg, fetchImpl)).rejects.toThrow(/Client ID o el Client secret/)
  })

  it('sin ID o secreto no llama a nadie', async () => {
    const fetchImpl = respuesta(200, {})
    await expect(
      pedirToken({ ...cfg, apiSecret: null }, fetchImpl),
    ).rejects.toThrow(/SHOPIFY_API_SECRET/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
