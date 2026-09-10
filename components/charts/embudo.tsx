// El embudo: cuatro magnitudes en orden fijo, y cuanto queda de la primera en
// cada paso.
//
// Decisiones de la forma, y por que:
//
// - COLUMNAS ANCLADAS ABAJO, no un trapecio que se angosta. El embudo clasico
//   codifica el valor en el AREA de una figura que ademas cambia de ancho: dos
//   codificaciones para un solo numero, y ninguna se lee bien. Aca todas las
//   columnas tienen el mismo ancho y arrancan de la misma linea: solo el alto
//   dice la magnitud, que es lo unico que el ojo compara bien.
//
// - UN SOLO RELLENO para las cuatro columnas. Es una sola serie: pintarlas de
//   colores distintos sugeriria categorias que no existen. El degrade (indigo
//   de la marca arriba, azul de facturacion abajo) es el mismo en todas, asi
//   que no carga ningun dato: es identidad visual, no una escala.
//
// - CADA COLUMNA CON SU NUMERO debajo, en tinta normal y no en el color de la
//   barra. El porcentaje grande es "cuanto queda de las visitas"; el conteo
//   chico, el valor absoluto. Con cuatro marcas, etiquetar todas es lo correcto.
//
// - LA CAIDA ENTRE PASOS (visita -> carrito, etc.) ya esta en las tarjetas de
//   arriba de la pagina. Aca queda en el tooltip y para lectores de pantalla,
//   para no repetir seis numeros en un grafico de cuatro columnas.

import { formatMetric, LOCALE, SIN_DATO } from '@/lib/format'

export type PasoEmbudo = {
  etiqueta: string
  valor: number | string | null
  /** Tasa desde el paso anterior. El primero no tiene. */
  tasaDesdeAnterior?: number | string | null
  ayuda?: string
}

/**
 * El alto de la columna es proporcional al primer paso, que es el 100%.
 *
 * Exportada para poder testearla: es la unica cuenta del componente, y una
 * cuenta mal hecha aca dibuja una barra que contradice al numero que tiene
 * debajo. Un grafico que no coincide con su propia etiqueta es peor que no
 * tener grafico.
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

/** Siempre un decimal: "100,0%", "3,6%". Asi las cuatro cifras alinean. */
function porcentajeDelTotal(p: number): string {
  return `${new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(p)}%`
}

export function Embudo({ pasos }: { pasos: PasoEmbudo[] }) {
  const tope = Number(pasos[0]?.valor) || 0
  const hayDatos = tope > 0

  return (
    <figure className="rounded-xl bg-card p-5 shadow-card sm:p-6">
      <figcaption className="mb-6">
        <h2 className="text-sm font-semibold tracking-tight">Embudo de conversión</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          De cada visita a la tienda hasta la venta. El alto es proporcional a
          las visitas del período.
        </p>
      </figcaption>

      {!hayDatos ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No hay visitas registradas en este período.
        </p>
      ) : (
        <ol className="grid grid-cols-4 gap-2 sm:gap-3">
          {pasos.map((paso, i) => {
            const ausente = esAusente(paso.valor)
            const p = proporcion(paso.valor, tope)
            const tasa = formatMetric(paso.tasaDesdeAnterior, 'pct', 'USD')
            const caida = i > 0 && tasa !== SIN_DATO ? `${tasa} pasa desde el paso anterior` : null

            return (
              <li
                key={paso.etiqueta}
                className="group flex min-w-0 flex-col"
                title={[paso.ayuda, caida].filter(Boolean).join(' · ') || undefined}
              >
                {/* Zona de dibujo de alto fijo, con todo anclado abajo: el
                    rotulo viaja pegado al techo de su columna, como en un
                    grafico de barras rotulado. */}
                <div className="flex h-60 flex-col justify-end sm:h-72">
                  <p className="mb-2.5 text-center text-[0.6875rem] leading-4 font-semibold tracking-[0.08em] text-muted-foreground uppercase sm:text-xs">
                    {paso.etiqueta}
                  </p>

                  {ausente ? (
                    // Sin dato no se dibuja nada. Una barra minima seria
                    // indistinguible de un valor chico pero real.
                    <span
                      aria-hidden
                      className="block h-9 shrink-0 rounded-xl border border-dashed border-border"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="block shrink-0 rounded-xl transition-[height,filter] duration-500 group-hover:brightness-110"
                      style={{
                        // Se reservan 4rem para el rotulo (hasta tres lineas en
                        // un celular). El minimo mantiene visible un paso chico
                        // pero real: un 0,9% seria una raya de 2px.
                        height: `max(2.25rem, calc((100% - 4rem) * ${p / 100}))`,
                        background:
                          'linear-gradient(180deg, var(--primary) 0%, var(--chart-revenue) 100%)',
                      }}
                    />
                  )}
                </div>

                {/* Los numeros en tinta normal, no en el color de la barra. */}
                <p className="mt-4 text-center text-lg leading-7 font-semibold tracking-[-0.02em] tabular-nums sm:text-2xl sm:leading-8">
                  {ausente ? SIN_DATO : porcentajeDelTotal(p)}
                </p>
                <p className="text-center text-xs text-muted-foreground tabular-nums sm:text-sm">
                  {formatMetric(paso.valor, 'int', 'USD')}
                </p>
                {caida && <span className="sr-only">{caida}</span>}
              </li>
            )
          })}
        </ol>
      )}
    </figure>
  )
}
