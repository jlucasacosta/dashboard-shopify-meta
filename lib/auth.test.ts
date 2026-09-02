import { describe, it, expect } from 'vitest'
import { normalizarEmail, normalizarCodigo, codigoCompleto, LARGO_MAX, mensajeDeError } from './auth'

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
