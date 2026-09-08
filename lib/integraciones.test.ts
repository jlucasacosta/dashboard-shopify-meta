import { describe, expect, it } from 'vitest'
import { estadoDeConexion, estadoDeVariables } from './integraciones'

// El estado que se muestra en Configuracion tiene que distinguir cuatro cosas
// que la gente confunde: no configurado, configurado pero sin autorizar,
// autorizado, y autorizado pero roto. Mostrar "conectado" cuando el token esta
// muerto es la version de esta pantalla del cero falso de la regla 2.
describe('estadoDeConexion', () => {
  const ahora = new Date('2026-09-08T20:00:00.000Z')

  it('sin fila es sin conectar', () => {
    expect(estadoDeConexion(null, ahora).estado).toBe('sin-conectar')
  })

  it('con token vigente y sin error es conectada', () => {
    const r = estadoDeConexion(
      { cuenta_id: '123', expires_at: '2026-09-08T23:00:00.000Z', ultimo_error: null },
      ahora,
    )
    expect(r.estado).toBe('conectada')
    expect(r.cuentaId).toBe('123')
  })

  it('un error guardado gana sobre el token vigente', () => {
    // Si MeLi invalido el permiso, el access_token puede seguir "vigente" por
    // fecha y no servir para nada. El error es el dato que manda.
    const r = estadoDeConexion(
      {
        cuenta_id: '123',
        expires_at: '2026-09-08T23:00:00.000Z',
        ultimo_error: 'invalid_grant',
      },
      ahora,
    )
    expect(r.estado).toBe('con-error')
    expect(r.detalle).toBe('invalid_grant')
  })

  it('token vencido es vencida, no conectada', () => {
    const r = estadoDeConexion(
      { cuenta_id: '123', expires_at: '2026-09-08T19:00:00.000Z', ultimo_error: null },
      ahora,
    )
    expect(r.estado).toBe('vencida')
  })

  it('no devuelve nada que se parezca a un token', () => {
    // La tabla conexiones guarda access_token y refresh_token. Esta funcion es
    // la frontera: lo que salga de aca se renderiza en HTML.
    const r = estadoDeConexion(
      { cuenta_id: '123', expires_at: '2026-09-08T23:00:00.000Z', ultimo_error: null },
      ahora,
    )
    expect(Object.keys(r)).toEqual(['estado', 'cuentaId', 'detalle', 'expiraEn'])
  })
})

describe('estadoDeVariables', () => {
  it('sin variables es sin configurar', () => {
    expect(estadoDeVariables(false)).toBe('sin-configurar')
  })

  it('con variables es configurada', () => {
    expect(estadoDeVariables(true)).toBe('configurada')
  })
})
