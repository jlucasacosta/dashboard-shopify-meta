import Link from 'next/link'
import { AlertTriangle, Info } from 'lucide-react'
import type { Totales, EstadoSync } from '@/lib/queries'

/**
 * Avisos sobre la calidad de los datos que se están mostrando.
 *
 * Existe porque un dashboard silencioso es peligroso: si falta el gasto de
 * unos días, los totales salen más bajos que la realidad y todo "se ve bien".
 * Preferimos decirlo antes de que alguien tome una decisión con un número
 * incompleto.
 */
export function AvisoDatos({
  totales,
  sync,
}: {
  totales: Totales | null
  sync: EstadoSync[]
}) {
  const avisos: { tono: 'alerta' | 'info'; texto: React.ReactNode }[] = []

  const metaSalteado = sync.find((s) => s.source === 'meta' && s.status === 'skipped')
  if (metaSalteado) {
    avisos.push({
      tono: 'alerta',
      texto: (
        <>
          La última sincronización no pudo leer Meta Ads (tu cuenta todavía no
          tiene habilitado el conector). Mientras tanto podés{' '}
          <Link href="/gasto-manual" className="underline underline-offset-4">
            cargar la inversión a mano
          </Link>
          .
        </>
      ),
    })
  }

  if (totales && totales.dias_sin_tasa > 0) {
    avisos.push({
      tono: 'alerta',
      texto: (
        <>
          {totales.dias_sin_tasa}{' '}
          {totales.dias_sin_tasa === 1 ? 'día no tiene' : 'días no tienen'} tipo de
          cambio guardado, así que su inversión no está sumada acá. La inversión
          real fue mayor que la que ves.
        </>
      ),
    })
  }

  if (totales && totales.dias_sin_gasto > 0 && totales.dias_sin_gasto < totales.dias) {
    avisos.push({
      tono: 'info',
      texto: (
        <>
          {totales.dias_sin_gasto} de {totales.dias} días no tienen inversión
          registrada. En las gráficas aparecen como huecos, no como cero.
        </>
      ),
    })
  }

  const errores = sync.filter((s) => s.status === 'error')
  for (const e of errores) {
    avisos.push({
      tono: 'alerta',
      texto: <>La última sincronización de {e.source} falló: {e.error}</>,
    })
  }

  if (avisos.length === 0) return null

  return (
    <div className="space-y-2">
      {avisos.map((a, i) => {
        const Icono = a.tono === 'alerta' ? AlertTriangle : Info
        return (
          <div
            key={i}
            role="status"
            className="flex items-start gap-2.5 rounded-xl bg-card px-4 py-3 text-sm shadow-card"
          >
            <Icono
              className="mt-0.5 size-4 shrink-0"
              style={{ color: a.tono === 'alerta' ? 'var(--warning)' : 'var(--muted-foreground)' }}
              aria-hidden
            />
            <p className="text-muted-foreground">{a.texto}</p>
          </div>
        )
      })}
    </div>
  )
}
