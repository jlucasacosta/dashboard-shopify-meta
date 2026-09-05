import { describe, it, expect } from 'vitest'
import { normalizarEmail, normalizarCodigo, codigoCompleto, LARGO_MAX, mensajeDeError , esRutaDeMaquina } from './auth'

describe('normalizarEmail', () => {
  it('saca espacios y pasa a minusculas', () => {
    expect(normalizarEmail('  Vos@TuTienda.com ')).toBe('vos@tutienda.com')
  })
})

describe('normalizarCodigo', () => {
  // La gente copia el código del correo y se trae espacios, guiones o saltos
  // de línea. Rechazarlo por eso sería un error nuestro, no del usuario.
  it.each([
    ['123456', '123456'],
    [' 123456 ', '123456'],
    ['123 456', '123456'],
    ['123-456', '123456'],
    ['123\n456', '123456'],
  ])('limpia %s', (entrada, esperado) => {
    expect(normalizarCodigo(entrada)).toBe(esperado)
  })

  it('descarta cualquier cosa que no sea un digito', () => {
    expect(normalizarCodigo('12a3b4c56')).toBe('123456')
  })

  it('nunca devuelve mas digitos de los que tiene el codigo', () => {
    expect(normalizarCodigo('123456789012345')).toHaveLength(LARGO_MAX)
  })

  // Un proyecto de Supabase en la nube manda 8 digitos por defecto, no 6.
  // Cuando la app recortaba a 6, Supabase respondia "otp_expired" y no habia
  // forma de entrar. Estos dos casos son ese bug, congelado.
  it('no recorta un codigo de 8 digitos, como el que manda la nube', () => {
    expect(normalizarCodigo('63075525')).toBe('63075525')
  })

  it('acepta como completo tanto 6 digitos como 8', () => {
    expect(codigoCompleto('123456')).toBe(true)
    expect(codigoCompleto('63075525')).toBe(true)
    expect(codigoCompleto('12345')).toBe(false)
  })
})

describe('mensajeDeError', () => {
  // Traducimos los errores de Supabase, que vienen en inglés y no siempre
  // dicen lo que realmente pasó.
  it('explica que el email no esta habilitado', () => {
    expect(mensajeDeError('Signups not allowed for otp')).toMatch(/no está habilitado/i)
    expect(mensajeDeError('User not found')).toMatch(/no está habilitado/i)
  })

  it('distingue codigo equivocado de codigo vencido', () => {
    expect(mensajeDeError('Token has expired')).toMatch(/venció/i)
    expect(mensajeDeError('Invalid token')).toMatch(/no es correcto/i)
  })

  it('avisa cuando se piden demasiados codigos seguidos', () => {
    expect(mensajeDeError('email rate limit exceeded')).toMatch(/esperá/i)
  })

  it('ante un error desconocido no inventa una explicacion', () => {
    const m = mensajeDeError('algo rarísimo del servidor')
    expect(m).toContain('algo rarísimo del servidor')
  })
})

describe('mensajeDeError con la red caida', () => {
  // Es el primer error que ve alguien que arranca el proyecto sin `.env.local`
  // o con la URL equivocada. Si queda en inglés, no sabe qué revisar.
  it('explica que no se llego a Supabase, en vez de "Failed to fetch"', () => {
    const m = mensajeDeError('Failed to fetch')
    expect(m).toContain('Supabase')
    expect(m).toContain('.env.local')
    expect(m).not.toContain('Failed to fetch')
  })
})

describe('esRutaDeMaquina', () => {
  it('deja pasar el webhook de Shopify', () => {
    // Si esto se rompe, Shopify recibe un 302 al login en vez de un 200 y
    // termina desactivando la suscripcion.
    expect(esRutaDeMaquina('/api/webhooks/shopify')).toBe(true)
  })

  it('deja pasar el cron', () => {
    expect(esRutaDeMaquina('/api/cron/sync')).toBe(true)
  })

  it('NO deja pasar el OAuth de Mercado Libre', () => {
    // Ese flujo lo arranca una persona desde el panel: tiene que exigir sesion.
    expect(esRutaDeMaquina('/api/meli/conectar')).toBe(false)
    expect(esRutaDeMaquina('/api/meli/callback')).toBe(false)
  })

  it('NO deja pasar las paginas del panel', () => {
    expect(esRutaDeMaquina('/')).toBe(false)
    expect(esRutaDeMaquina('/productos')).toBe(false)
    expect(esRutaDeMaquina('/embudo')).toBe(false)
  })

  it('no se deja enganar por un prefijo parecido', () => {
    expect(esRutaDeMaquina('/api/cronica')).toBe(false)
    expect(esRutaDeMaquina('/falso/api/cron/sync')).toBe(false)
  })
})
