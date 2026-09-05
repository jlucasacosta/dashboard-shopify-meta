// El embudo: cuatro magnitudes en orden fijo, y cuanto se pierde entre una y
// la siguiente.
//
// Decisiones de la forma, y por que:
//
// - BARRAS DE ALTURA UNIFORME, no un trapecio que se angosta. El embudo
//   clasico codifica el valor en el AREA de una figura que ademas cambia de
//   alto: dos codificaciones para un solo numero, y ninguna se lee bien. Aca
//   solo el largo dice la magnitud, que es lo unico que el ojo compara bien.
//
// - UN SOLO TONO para las cuatro barras. Es una sola serie: pintarlas de
//   colores distintos sugeriria categorias que no existen. El largo alcanza.
//
// - CADA BARRA CON SU NUMERO al lado, en tinta normal y no en el color de la
//   barra. Con cuatro marcas, etiquetar todas es lo correcto; el color queda
//   solo como refuerzo, nunca como el unico portador del dato.
//
// - LA CAIDA ENTRE PASOS es el dato que la gente viene a buscar, asi que va
//   entre las barras y no en una tarjeta aparte.

import { formatMetric, SIN_DATO } from '@/lib/format'

export type PasoEmbudo = {
  etiqueta: string
  valor: number | string | null
  /** Tasa desde el paso anterior. El primero no tiene. */
  tasaDesdeAnterior?: number | string | null
  ayuda?: string
}

/**
 * El ancho de la barra es proporcional al primer paso, que es el 100%.
 *
 * Exportada para poder testearla: es la unica cuenta del componente, y una
 * cuenta mal hecha aca dibuja una barra que contradice al numero que tiene al
 * lado. Un grafico que no coincide con su propia etiqueta es peor que no tener
 * grafico.
 */
export function proporcion(valor: number | string | null | undefined, tope: number): number {
  if (esAusente(valor) || tope <= 0) return 0
  const n = Number(valor)
  return Math.max(0, Math.min(100, (n / tope) * 100))
}

/**
 * Un dato que falta no es un cero.
 *
 * Ojo con la trampa: `Number(null)` es 0 y `Number.isFinite(0)` es true, asi
 * que chequear solo "es finito" convierte cada ausencia en un cero perfecto.
 * Con `''` pasa lo mismo, y ShopifyQL devuelve `''` justamente cuando no hubo
 * nada. Por eso la ausencia se pregunta antes de convertir a numero.
 */
export function esAusente(valor: number | string | null | undefined): boolean {
  if (valor === null || valor === undefined) return true
  if (typeof valor === 'string' && valor.trim() === '') return true
  return !Number.isFinite(Number(valor))
}

export function Embudo({ pasos }: { pasos: PasoEmbudo[] }) {
  const tope = Number(pasos[0]?.valor) || 0
  const hayDatos = tope > 0

  return (
    <figure className="rounded-xl bg-card p-5 shadow-card">
      <figcaption className="mb-5">
        <h2 className="text-sm font-semibold tracking-tight">Embudo de conversión</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          De cada visita a la tienda hasta la venta. El ancho es proporcional a
          las visitas del período.
        </p>
      </figcaption>

      {!hayDatos ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No hay visitas registradas en este período.
        </p>
      ) : (
        <ol className="space-y-0">
          {pasos.map((paso, i) => (
            <li key={paso.etiqueta}>
              {/* La caida va ENTRE los pasos: es la lectura principal. */}
              {i > 0 && (
                <p className="flex items-center gap-2 py-2 pl-1 text-xs text-muted-foreground">
                  <span aria-hidden className="ml-1 h-4 w-px bg-border" />
                  {formatMetric(paso.tasaDesdeAnterior, 'pct', 'USD') === SIN_DATO ? (
                    // Sin paso anterior no se puede calcular una tasa. Decirlo
                    // es mejor que un "—" suelto en medio de una frase.
                    <span>sin datos suficientes para calcular la caída</span>
                  ) : (
                    <>
                      <span className="tabular-nums">
                        {formatMetric(paso.tasaDesdeAnterior, 'pct', 'USD')}
                      </span>
                      <span>pasa al siguiente paso</span>
                    </>
                  )}
                </p>
              )}

              <div className="group flex items-center gap-3 rounded-lg py-1.5 transition-colors hover:bg-muted/40">
                <div className="w-36 shrink-0">
                  <p className="text-xs font-medium">{paso.etiqueta}</p>
                  {paso.ayuda && (
                    <p className="text-[0.6875rem] leading-4 text-muted-foreground">
                      {paso.ayuda}
                    </p>
                  )}
                </div>

                {/* La barra: alto uniforme, extremo redondeado, anclada a la
                    izquierda. Un minimo de ancho para que un paso chico pero
                    distinto de cero siga siendo visible. */}
                <div className="min-w-0 flex-1">
                  {esAusente(paso.valor) ? (
                    // Sin dato no se dibuja nada. Una barra minima seria
                    // indistinguible de un valor chico pero real.
                    <span aria-hidden className="block h-7 rounded-md border border-dashed border-border" />
                  ) : (
                    <span
                      aria-hidden
                      className="block h-7 rounded-md transition-[width] duration-300"
                      style={{
                        // El minimo mantiene visible un paso chico pero real.
                        width: `max(0.5rem, ${proporcion(paso.valor, tope)}%)`,
                        background: 'var(--chart-revenue)',
                      }}
                    />
                  )}
                </div>

                {/* El numero en tinta normal, no en el color de la barra. */}
                <p className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {formatMetric(paso.valor, 'int', 'USD')}
                </p>
                <p className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {esAusente(paso.valor)
                    ? SIN_DATO
                    : `${proporcion(paso.valor, tope).toFixed(1)}%`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </figure>
  )
}
