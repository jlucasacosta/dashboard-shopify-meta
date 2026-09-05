'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { CANALES, CANAL_POR_DEFECTO } from '@/lib/canales'

// Misma estructura que DateRangeSelect: select nativo, el valor viaja por la
// URL. Un select nativo funciona con teclado y lector de pantalla sin que
// tengamos que programar nada.
export function ChannelSelect() {
  const router = useRouter()
  const ruta = usePathname()
  const params = useSearchParams()
  const actual = params.get('ch') ?? CANAL_POR_DEFECTO

  function cambiar(valor: string) {
    const nuevos = new URLSearchParams(params.toString())
    // 'todos' es el default: se saca de la URL en vez de escribirlo, asi el
    // link que se comparte no lleva ruido.
    if (valor === CANAL_POR_DEFECTO) nuevos.delete('ch')
    else nuevos.set('ch', valor)
    const query = nuevos.toString()
    router.push(query ? `${ruta}?${query}` : ruta)
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Canal de venta</span>
      <select
        value={actual}
        onChange={(e) => cambiar(e.target.value)}
        className="cursor-pointer rounded-lg bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-pill outline-none transition-shadow hover:shadow-pop focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        {CANALES.map((c) => (
          <option key={c.valor} value={c.valor}>
            {c.etiqueta}
          </option>
        ))}
      </select>
    </label>
  )
}
