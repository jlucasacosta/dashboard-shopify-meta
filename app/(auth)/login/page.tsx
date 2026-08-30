'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Estado =
  | { tipo: 'inicial' }
  | { tipo: 'enviando' }
  | { tipo: 'enviado'; email: string }
  | { tipo: 'error'; mensaje: string }

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState<Estado>({ tipo: 'inicial' })

  async function enviarLink(e: React.FormEvent) {
    e.preventDefault()
    setEstado({ tipo: 'enviando' })

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // origin en vez de una URL fija: asi funciona igual en tu maquina,
        // en el preview de Vercel y en produccion.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setEstado({ tipo: 'error', mensaje: error.message })
      return
    }
    setEstado({ tipo: 'enviado', email })
  }

  if (estado.tipo === 'enviado') {
    return (
      <Marco>
        <h1 className="text-lg font-medium tracking-tight">Revisá tu correo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Te mandamos un link de acceso a{' '}
          <span className="text-foreground">{estado.email}</span>. Abrilo desde
          este mismo dispositivo.
        </p>
        <button
          onClick={() => setEstado({ tipo: 'inicial' })}
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
        Te mandamos un link por correo. No hace falta contraseña.
      </p>

      <form onSubmit={enviarLink} className="mt-6 space-y-4">
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
            onChange={(e) => setEmail(e.target.value)}
            disabled={estado.tipo === 'enviando'}
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={estado.tipo === 'enviando'}
        >
          {estado.tipo === 'enviando' ? 'Enviando…' : 'Enviar link de acceso'}
        </Button>

        {estado.tipo === 'error' && (
          <p role="alert" className="text-sm text-destructive">
            {estado.mensaje}
          </p>
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
