// Canales de venta.
//
// Hasta la migracion 0008 habia uno solo (Shopify) y no hacia falta nombrarlo.
// Ahora hay dos, y el filtro viaja por la URL igual que el rango de fechas
// (`?ch=`), por el mismo motivo: compartir un link lleva lo que estabas viendo.

export type Canal = 'todos' | 'shopify' | 'meli'

export const CANALES: { valor: Canal; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos los canales' },
  { valor: 'shopify', etiqueta: 'Shopify' },
  { valor: 'meli', etiqueta: 'Mercado Libre' },
]

export const CANAL_POR_DEFECTO: Canal = 'todos'

export function esCanal(valor: string): valor is Canal {
  return CANALES.some((c) => c.valor === valor)
}

export function etiquetaCanal(canal: Canal): string {
  return CANALES.find((c) => c.valor === canal)?.etiqueta ?? canal
}

/**
 * El valor que espera la base. `undefined` significa "todos".
 *
 * La funcion SQL recibe `canal_filtro text default null`, y no mandar el
 * argumento es lo que hace que use ese default. Se devuelve `undefined` y no
 * `null` porque asi lo tipan los tipos generados de PostgREST: un parametro con
 * default es opcional, no nullable.
 */
export function filtroCanal(canal: Canal): string | undefined {
  return canal === 'todos' ? undefined : canal
}
