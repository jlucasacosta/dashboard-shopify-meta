'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  normalizarEmail, normalizarPassword, passwordCompleta, mensajeDeError,
} from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true)
    setError(null)

    const supabase = createClient()
    // Sin signUp en ningún lado de la app: las cuentas las crea el dueño del
    // panel con `npm run usuario:crear`. Es lo único que hace que el panel sea
    // realmente privado.
    const { error: err } = await supabase.auth.signInWithPassword({
      email: normalizarEmail(email),
      password: normalizarPassword(password),
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

  return (
    <Marco>
      <h1 className="text-lg font-semibold tracking-tight">Entrar</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Con el correo y la contraseña que te pasaron.
      </p>

      <form onSubmit={entrar} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="username"
            placeholder="vos@tutienda.com"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            disabled={cargando}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            {/* Mostrarla es lo que evita el intento a ciegas cuando la copiaron
                a mano de la hoja de credenciales. */}
            <button
              type="button"
              onClick={() => setVerClave((v) => !v)}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {verClave ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <Input
            id="password"
            type={verClave ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder="••••-••••-••••-••••"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            disabled={cargando}
            className="font-mono"
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={cargando || !email || !passwordCompleta(password)}
        >
          {cargando ? 'Entrando…' : 'Entrar'}
        </Button>

        {error && (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        )}
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        ¿Perdiste la contraseña? Pedile al dueño del panel que te genere una nueva.
      </p>
    </Marco>
  )
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-pill"
          >
            D
          </span>
          <p className="text-sm font-semibold tracking-tight">Dashboard</p>
        </div>
        <div className="rounded-xl bg-card p-6 shadow-pop">{children}</div>
      </div>
    </main>
  )
}
