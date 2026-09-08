import { describe, it, expect } from 'vitest'
import {
  normalizarEmail, normalizarPassword, passwordCompleta, LARGO_MIN_PASSWORD,
  mensajeDeError, esRutaDeMaquina,
} from './auth'

describe('normalizarEmail', () => {
  it('saca espacios y pasa a minusculas', () => {
    expect(normalizarEmail('  Vos@TuTienda.com ')).toBe('vos@tutienda.com')
  })
})

describe('normalizarPassword', () => {
  // La contraseña se copia del HTML de credenciales, y copiar y pegar se trae
  // un espacio o un salto de linea con muchisima frecuencia. Supabase lo cuenta
  // como parte de la clave: el resultado es "credenciales invalidas" con la
  // clave correcta a la vista.
  it.each([
    ['kq7m-3ptz-9wrf-x2nd', 'kq7m-3ptz-9wrf-x2nd'],
    [' kq7m-3ptz-9wrf-x2nd ', 'kq7m-3ptz-9wrf-x2nd'],
    ['kq7m-3ptz-9wrf-x2nd\n', 'kq7m-3ptz-9wrf-x2nd'],
  ])('limpia los bordes de %s', (entrada, esperado) => {
    expect(normalizarPassword(entrada)).toBe(esperado)
  })

  // Lo del medio no se toca: ahi si podria ser parte de la contraseña de
  // alguien que la eligio a mano en Supabase.
  it('no toca los espacios del medio', () => {
    expect(normalizarPassword(' dos palabras ')).toBe('dos palabras')
  })
})

describe('passwordCompleta', () => {
  it('exige el minimo de Supabase', () => {
    expect(passwordCompleta('a'.repeat(LARGO_MIN_PASSWORD))).toBe(true)
    expect(passwordCompleta('a'.repeat(LARGO_MIN_PASSWORD - 1))).toBe(false)
  })

  it('acepta la que genera el script', () => {
    expect(passwordCompleta('kq7m-3ptz-9wrf-x2nd')).toBe(true)
  })

  // Sin esto, el boton se habilita con lo que en realidad es una clave vacia y
  // el error llega recien despues del viaje al servidor.
  it('no acepta solo espacios', () => {
    expect(passwordCompleta('          ')).toBe(false)
  })
})

describe('mensajeDeError', () => {
  // Traducimos los errores de Supabase, que vienen en inglés y no siempre
  // dicen lo que realmente pasó.
  it('nombra las salidas posibles de "invalid login credentials"', () => {
    // Supabase responde lo mismo si el correo no existe, si la contraseña esta
    // mal y si el usuario fue borrado. No podemos distinguirlos, asi que el
    // mensaje tiene que cubrir las dos cosas que la persona puede hacer.
    const m = mensajeDeError('Invalid login credentials')
    expect(m).toMatch(/espacio/i)
    expect(m).toMatch(/contraseña nueva/i)
  })

  it('explica el usuario sin confirmar', () => {
    expect(mensajeDeError('Email not confirmed')).toMatch(/sin confirmar/i)
  })

  it('explica que el email no esta habilitado', () => {
    expect(mensajeDeError('Signups not allowed for this instance')).toMatch(/no está habilitado/i)
    expect(mensajeDeError('User not found')).toMatch(/no está habilitado/i)
  })

  it('avisa cuando se prueba demasiadas veces seguidas', () => {
    expect(mensajeDeError('Request rate limit reached')).toMatch(/esperá/i)
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
