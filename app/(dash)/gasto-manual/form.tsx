'use client'

import { useActionState } from 'react'
import { guardarGasto, type EstadoForm } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function FormGasto({ monedaSugerida }: { monedaSugerida: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(
    guardarGasto,
    null,
  )
  const hoy = new Date().toISOString().slice(0, 10)

  return (
    <form action={accion} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="date">Día</Label>
          <Input id="date" name="date" type="date" max={hoy} defaultValue={hoy} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="spend">Cuánto gastaste</Label>
          <Input
            id="spend"
            name="spend"
            type="text"
            inputMode="decimal"
            placeholder="1500,50"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="currency">Moneda</Label>
          <Input
            id="currency"
            name="currency"
            maxLength={3}
            defaultValue={monedaSugerida}
            className="uppercase"
            required
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar'}
        </Button>

        {estado && (
          <p
            role="status"
            className="text-sm font-medium"
            style={{ color: estado.ok ? 'var(--success)' : 'var(--danger)' }}
          >
            {estado.mensaje}
          </p>
        )}
      </div>
    </form>
  )
}
