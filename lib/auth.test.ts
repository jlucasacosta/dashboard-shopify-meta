import { describe, it, expect } from 'vitest'
import { normalizarEmail, normalizarCodigo, LARGO_CODIGO, mensajeDeError } from './auth'

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
    expect(normalizarCodigo('12345678901')).toHaveLength(LARGO_CODIGO)
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
