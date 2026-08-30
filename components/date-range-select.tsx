'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { RANGOS, PRESET_POR_DEFECTO } from '@/lib/ranges'

// Select nativo a proposito: menos piezas moviles, funciona con teclado y
// lectores de pantalla sin que tengamos que programar nada.
export function DateRangeSelect() {
  const router = useRouter()
  const ruta = usePathname()
  const params = useSearchParams()
  const actual = params.get('r') ?? PRESET_POR_DEFECTO

  function cambiar(valor: string) {
    const nuevos = new URLSearchParams(params.toString())
    nuevos.set('r', valor)
    router.push(`${ruta}?${nuevos.toString()}`)
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Período</span>
      <select
        value={actual}
        onChange={(e) => cambiar(e.target.value)}
        className="rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {RANGOS.map((r) => (
          <option key={r.valor} value={r.valor}>
            {r.etiqueta}
          </option>
        ))}
      </select>
    </label>
  )
}
