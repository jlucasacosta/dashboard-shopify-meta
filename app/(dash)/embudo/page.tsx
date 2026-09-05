import { resolveRange, etiquetaDe, PRESET_POR_DEFECTO, esPreset } from '@/lib/ranges'
import { CANAL_POR_DEFECTO, esCanal, etiquetaCanal, tieneEmbudo } from '@/lib/canales'
import { getEmbudo } from '@/lib/queries'
import { KpiCard } from '@/components/kpi-card'
import { Embudo, type PasoEmbudo } from '@/components/charts/embudo'
import { RealtimeRefresh } from '@/components/realtime-refresh'

export default async function EmbudoPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; ch?: string }>
}) {
  const { r, ch } = await searchParams
  const preset = r && esPreset(r) ? r : PRESET_POR_DEFECTO
  const canal = ch && esCanal(ch) ? ch : CANAL_POR_DEFECTO
  const rango = resolveRange(preset)

  // Mercado Libre no tiene los pasos del medio: su checkout es de MeLi, no del
  // vendedor. En vez de mostrar dos ceros que parecen datos, se dice por que
  // no hay dato.
  const aplica = tieneEmbudo(canal)
  const embudo = aplica ? await getEmbudo(rango) : null

  const motivoFalta = aplica
    ? undefined
    : 'Mercado Libre no informa carrito ni checkout: su proceso de compra es de MeLi, no de la tienda.'

  const pasos: PasoEmbudo[] = [
    {
      etiqueta: 'Visitas',
      valor: embudo?.visitas ?? null,
      ayuda: 'Sesiones en la tienda',
    },
    {
      etiqueta: 'Agregados al carrito',
      valor: embudo?.carritos ?? null,
      tasaDesdeAnterior: embudo?.tasa_carrito ?? null,
      ayuda: 'Sesiones que sumaron algo',
    },
    {
      etiqueta: 'Pagos iniciados',
      valor: embudo?.checkouts_iniciados ?? null,
      tasaDesdeAnterior: embudo?.tasa_checkout ?? null,
      ayuda: 'Llegaron al checkout',
    },
    {
      etiqueta: 'Ventas',
      valor: embudo?.ventas ?? null,
      tasaDesdeAnterior: embudo?.tasa_venta ?? null,
      ayuda: 'Compra completada',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Embudo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {etiquetaDe(preset)}
            {canal !== CANAL_POR_DEFECTO && ` · ${etiquetaCanal(canal)}`}
          </p>
        </div>
        <RealtimeRefresh />
      </div>

      {aplica ? (
        <p className="rounded-xl bg-card px-5 py-4 text-sm text-muted-foreground shadow-card">
          El embudo mide la tienda de <strong className="font-medium text-foreground">Shopify</strong>.
          Mercado Libre no expone agregados al carrito ni pagos iniciados, así que
          sus ventas no entran acá aunque el selector diga «todos los canales».
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {pasos.map((paso) => (
          <KpiCard
            key={paso.etiqueta}
            etiqueta={paso.etiqueta}
            valor={paso.valor}
            tipo="int"
            currency="USD"
            motivoFalta={motivoFalta}
          />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          etiqueta="Visita → carrito"
          valor={embudo?.tasa_carrito ?? null}
          tipo="pct"
          currency="USD"
          motivoFalta={motivoFalta}
        />
        <KpiCard
          etiqueta="Carrito → checkout"
          valor={embudo?.tasa_checkout ?? null}
          tipo="pct"
          currency="USD"
          motivoFalta={motivoFalta}
        />
        <KpiCard
          etiqueta="Checkout → venta"
          valor={embudo?.tasa_venta ?? null}
          tipo="pct"
          currency="USD"
          motivoFalta={motivoFalta}
        />
      </section>

      {aplica && <Embudo pasos={pasos} />}

      <section className="rounded-xl bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold tracking-tight">Conversión total</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          De todas las visitas del período, cuántas terminaron en venta.
        </p>
        <p className="mt-3 text-[2rem] leading-10 font-semibold tabular-nums tracking-[-0.02em]">
          {embudo && aplica && embudo.conversion_total != null
            ? `${Number(embudo.conversion_total).toFixed(2)}%`
            : '—'}
        </p>
      </section>
    </div>
  )
}
