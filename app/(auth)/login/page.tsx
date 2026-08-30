'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  normalizarEmail, normalizarCodigo, codigoCompleto,
  mensajeDeError, LARGO_CODIGO,
} from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Paso =
  | { en: 'email' }
  | { en: 'codigo'; email: string }

export default function LoginPage() {
  const router = useRouter()
  const [paso, setPaso] = useState<Paso>({ en: 'email' })
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pedirCodigo(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true)
    setError(null)

    const limpio = normalizarEmail(email)
    const supabase = createClient()

    const { error: err } = await supabase.auth.signInWithOtp({
      email: limpio,
      // Sin esto, Supabase crea el usuario en el momento y cualquiera con un
      // correo entra. Es lo único que hace que el panel sea realmente privado.
      options: { shouldCreateUser: false },
    })

    setCargando(false)
    if (err) return setError(mensajeDeError(err.message))

    setPaso({ en: 'codigo', email: limpio })
  }

  async function verificarCodigo(e: React.FormEvent) {
    e.preventDefault()
    if (paso.en !== 'codigo') return

    setCargando(true)
    setError(null)

    const supabase = createClient()
    const { error: err } = await supabase.auth.verifyOtp({
      email: paso.email,
      token: normalizarCodigo(codigo),
      type: 'email',
    })

    if (err) {
      setCargando(false)
      return setError(mensajeDeError(err.message))
    }

    // refresh() además de push() para que el layout del panel se vuelva a
    // renderizar en el servidor ya con la sesión puesta.
    router.push('/')
    router.refresh()
  }

  if (paso.en === 'codigo') {
    return (
      <Marco>
        <h1 className="text-lg font-medium tracking-tight">Escribí tu código</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Te mandamos {LARGO_CODIGO} dígitos a{' '}
          <span className="text-foreground">{paso.email}</span>. Vence en 15 minutos.
        </p>

        <form onSubmit={verificarCodigo} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="codigo">Código</Label>
            <Input
              id="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              maxLength={LARGO_CODIGO + 6}
              value={codigo}
              onChange={(ev) => setCodigo(normalizarCodigo(ev.target.value))}
              disabled={cargando}
              className="text-center font-mono text-xl tracking-[0.4em]"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={cargando || !codigoCompleto(codigo)}
          >
            {cargando ? 'Verificando…' : 'Entrar'}
          </Button>

          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
        </form>

        <button
          onClick={() => { setPaso({ en: 'email' }); setCodigo(''); setError(null) }}
          className="mt-6 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Usar otro correo
        </button>
      </Marco>
    )
  }

  return (
    <Marco>
      <h1 className="text-lg font-medium tracking-tight">Entrar</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Te mandamos un código por correo. No hace falta contraseña.
      </p>

      <form onSubmit={pedirCodigo} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            placeholder="vos@tutienda.com"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            disabled={cargando}
          />
        </div>

        <Button type="submit" className="w-full" disabled={cargando}>
          {cargando ? 'Enviando…' : 'Enviar código'}
        </Button>

        {error && (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        )}
      </form>
    </Marco>
  )
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6">
        {children}
      </div>
    </main>
  )
}
