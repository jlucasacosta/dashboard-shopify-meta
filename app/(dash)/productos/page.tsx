import { resolveRange, etiquetaDe, PRESET_POR_DEFECTO, esPreset } from '@/lib/ranges'
import { getProductos, getMonedaTienda } from '@/lib/queries'
import { formatMetric } from '@/lib/format'

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>
}) {
  const { r } = await searchParams
  const preset = r && esPreset(r) ? r : PRESET_POR_DEFECTO
  const rango = resolveRange(preset)

  const [currency, productos] = await Promise.all([
    getMonedaTienda(),
    getProductos(rango, 20),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium tracking-tight">Productos</h1>
        <p className="text-sm text-muted-foreground">{etiquetaDe(preset)}</p>
      </div>

      <section className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium tracking-tight">Más vendidos</h2>
          <p className="text-xs text-muted-foreground">
            Top 20 por facturación bruta del período.
          </p>
        </div>

        {productos.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No hay ventas registradas en este período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-normal">Producto</th>
                  <th className="px-4 py-2 text-right font-normal">Facturación</th>
                  <th className="px-4 py-2 text-right font-normal">Pedidos</th>
                  <th className="px-4 py-2 text-right font-normal">Unidades</th>
                  <th className="px-4 py-2 text-right font-normal">% del total</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.product_id} className="border-b last:border-0">
                    <td className="px-4 py-2.5">{p.product_title}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMetric(p.gross_sales, 'money', currency)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMetric(p.orders, 'int', currency)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMetric(p.units, 'int', currency)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span className="inline-flex items-center gap-2">
                        {/* Barra proporcional: el largo repite el numero, no lo reemplaza. */}
                        <span aria-hidden className="hidden h-1 w-16 overflow-hidden rounded-full bg-accent sm:block">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${Math.min(100, Number(p.pct_del_total) || 0)}%`,
                              background: 'var(--chart-revenue)',
                            }}
                          />
                        </span>
                        {formatMetric(p.pct_del_total, 'pct', currency)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
