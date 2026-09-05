// Mercado Libre: segundo canal de venta.
//
// Tres decisiones que explican por que este archivo es como es:
//
// 1. VA POR POLLING, NO POR WEBHOOKS. MeLi exige responder HTTP 200 en 500 ms o
//    te desactiva los topics en silencio, y hay que volver a suscribirse a mano
//    en el devcenter. Un cold start de una funcion serverless no llega. Ademas
//    su notificacion no trae datos (solo avisa que algo cambio), asi que igual
//    habria que hacer el GET. Con `last_updated.from` cada 5 minutos alcanza y
//    no se rompe solo.
//
// 2. EL REFRESH TOKEN ES DE UN SOLO USO Y ROTA. Textual de la doc: "The
//    REFRESH_TOKEN can only be used once [...] after being used it will become
//    invalid". Si dos procesos refrescan a la vez, el segundo usa uno quemado y
//    la conexion del usuario muere. Por eso el refresh se hace bajo lock y solo
//    cuando el token ya vencio, nunca por las dudas.
//
// 3. NUNCA SE HARDCODEA LA DURACION. La doc oficial se contradice: el texto dice
//    6 horas y el ejemplo devuelve expires_in: 10800 (3 horas). Se lee siempre
//    expires_in de la respuesta.
//
// Este modulo es un cliente puro: no toca Supabase. La persistencia de tokens
// se le inyecta, asi se puede testear sin base.

import type { ConfigMeli } from './config'

const API = 'https://api.mercadolibre.com'

// -------------------------------------------------------------------- Tokens

export type Conexion = {
  accessToken: string
  refreshToken: string
  /** ISO. Cuando pasa, hay que refrescar. */
  expiresAt: string
  /** El user_id del vendedor en MeLi. Se usa como filtro `seller`. */
  cuentaId: string
}

type RespuestaToken = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  user_id?: number
  error?: string
  message?: string
}

/**
 * Cookie donde viaja el `state` del OAuth, para verificarlo a la vuelta.
 *
 * Vive aca y no en el route handler porque Next valida que un archivo `route.ts`
 * exporte solo los metodos HTTP y la config de segmento: cualquier otro export
 * rompe el build.
 */
export const COOKIE_ESTADO = 'meli_oauth_estado'

/** URL a la que se manda al usuario para que autorice. */
export function urlAutorizacion(cfg: ConfigMeli, estado: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    state: estado,
  })
  return `${cfg.authHost}/authorization?${params}`
}

async function pedirToken(
  cfg: ConfigMeli,
  cuerpo: Record<string, string>,
): Promise<Conexion> {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: cfg.appId,
      client_secret: cfg.secretKey,
      ...cuerpo,
    }),
  })

  const json = (await res.json()) as RespuestaToken

  if (!res.ok || !json.access_token || !json.refresh_token) {
    throw new Error(
      `Mercado Libre rechazo el token (${res.status}): ${json.message ?? json.error ?? 'sin detalle'}. ` +
        'Si dice invalid_grant, la conexion se rompio y hay que volver a conectar Mercado Libre desde el panel.',
    )
  }

  // expires_in siempre de la respuesta. Se le restan 60 s de margen para no
  // quedar del lado equivocado del vencimiento por latencia de red.
  const segundos = (json.expires_in ?? 10800) - 60

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + segundos * 1000).toISOString(),
    cuentaId: String(json.user_id ?? ''),
  }
}

/** Canjea el `code` del callback de OAuth por el primer par de tokens. */
export function canjearCodigo(cfg: ConfigMeli, code: string): Promise<Conexion> {
  return pedirToken(cfg, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
  })
}

/** Usa el refresh token. Ojo: el que se pasa queda invalidado al volver. */
export function refrescar(cfg: ConfigMeli, refreshToken: string): Promise<Conexion> {
  return pedirToken(cfg, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
}

export function estaVencido(conexion: Conexion): boolean {
  return new Date(conexion.expiresAt).getTime() <= Date.now()
}

// -------------------------------------------------------------------- Ventas

type OrdenMeli = {
  id: number
  status: string
  date_created: string
  last_updated?: string
  total_amount?: number
  currency_id?: string
  buyer?: { id?: number }
  order_items?: {
    quantity?: number
    unit_price?: number
    gross_price?: number
    discounts?: { amounts?: { full?: number } }[]
    item?: { id?: string; title?: string }
  }[]
}

type BusquedaOrdenes = {
  results?: OrdenMeli[]
  paging?: { total?: number; limit?: number; offset?: number }
  message?: string
  error?: string
}

/** MeLi topea el tamaño de pagina en 50 cuando se filtra. */
const LIMITE = 50

async function buscarOrdenes(
  conexion: Conexion,
  filtros: Record<string, string>,
): Promise<OrdenMeli[]> {
  const todas: OrdenMeli[] = []
  let offset = 0

  for (;;) {
    const params = new URLSearchParams({
      seller: conexion.cuentaId,
      limit: String(LIMITE),
      offset: String(offset),
      ...filtros,
    })

    const res = await fetch(`${API}/orders/search?${params}`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${conexion.accessToken}`,
      },
    })

    const json = (await res.json()) as BusquedaOrdenes

    if (!res.ok) {
      throw new Error(
        `Mercado Libre respondio ${res.status} al buscar ordenes: ${json.message ?? json.error ?? ''}. ` +
          (res.status === 401
            ? 'El token vencio: hay que refrescar antes de reintentar.'
            : ''),
      )
    }

    const lote = json.results ?? []
    todas.push(...lote)

    offset += LIMITE
    const total = json.paging?.total ?? 0
    // El tope historico de offset es 1000. Pasado eso hay que partir el rango
    // en ventanas mas chicas en vez de seguir paginando.
    if (lote.length < LIMITE || offset >= total || offset >= 1000) break
  }

  return todas
}

/** Ordenes modificadas desde una fecha. Es la reconciliacion incremental. */
export function ordenesActualizadasDesde(
  conexion: Conexion,
  desdeIso: string,
): Promise<OrdenMeli[]> {
  return buscarOrdenes(conexion, { 'order.last_updated.from': desdeIso })
}

/** Ordenes creadas en una ventana. Es el backfill del historico. */
export function ordenesCreadasEntre(
  conexion: Conexion,
  desdeIso: string,
  hastaIso: string,
): Promise<OrdenMeli[]> {
  return buscarOrdenes(conexion, {
    'order.date_created.from': desdeIso,
    'order.date_created.to': hastaIso,
  })
}

// --------------------------------------------------------------- Agregacion

export type FilaVentasMeli = {
  date: string
  canal: 'meli'
  orders: number
  gross_sales: number
  discounts: number
  returns: number
  net_sales: number
  shipping: number
  taxes: number
  total_sales: number
  aov: number | null
  customers: number
  new_customers: number
  returning_customers: number
  currency: string
}

export type FilaProductoMeli = {
  date: string
  canal: 'meli'
  product_id: string
  product_title: string
  gross_sales: number
  net_sales: number
  orders: number
  units: number
}

/** Estados que cuentan como venta. El resto no suma ni resta. */
const VENDIDAS = new Set(['paid'])
const DEVUELTAS = new Set(['cancelled'])

function dia(iso: string): string {
  return iso.slice(0, 10)
}

/**
 * Convierte ordenes crudas en filas diarias.
 *
 * `esCompradorNuevo` decide si un buyer_id compra por primera vez. Se inyecta
 * porque la respuesta depende de lo que ya haya en la base: MeLi no marca
 * "cliente nuevo" en la orden. Sin esto tendriamos que escribir 0 clientes
 * nuevos, y el CAC saldria inflado sin que nadie se entere.
 */
export function agregarPorDia(
  ordenes: OrdenMeli[],
  monedaPorDefecto: string,
  esCompradorNuevo: (buyerId: string, fecha: string) => boolean,
): { ventas: FilaVentasMeli[]; productos: FilaProductoMeli[] } {
  const porDia = new Map<string, FilaVentasMeli>()
  const compradoresPorDia = new Map<string, Set<string>>()
  const productos = new Map<string, FilaProductoMeli>()

  for (const orden of ordenes) {
    if (!orden.date_created) continue
    const fecha = dia(orden.date_created)
    const esVenta = VENDIDAS.has(orden.status)
    const esDevolucion = DEVUELTAS.has(orden.status)
    if (!esVenta && !esDevolucion) continue

    const fila =
      porDia.get(fecha) ??
      ({
        date: fecha,
        canal: 'meli' as const,
        orders: 0,
        gross_sales: 0,
        discounts: 0,
        returns: 0,
        net_sales: 0,
        // MeLi no separa envio ni impuestos a nivel orden: total_amount es lo
        // que se cobro. Se dejan en 0 y total_sales es el numero bueno.
        shipping: 0,
        taxes: 0,
        total_sales: 0,
        aov: null,
        customers: 0,
        new_customers: 0,
        returning_customers: 0,
        currency: orden.currency_id ?? monedaPorDefecto,
      } satisfies FilaVentasMeli)

    const total = orden.total_amount ?? 0

    if (esDevolucion) {
      fila.returns += total
      porDia.set(fecha, fila)
      continue
    }

    fila.orders += 1
    fila.total_sales += total

    for (const item of orden.order_items ?? []) {
      const cantidad = item.quantity ?? 0
      const bruto = item.gross_price ?? (item.unit_price ?? 0) * cantidad
      const descuento = (item.discounts ?? []).reduce(
        (acc, d) => acc + (d.amounts?.full ?? 0),
        0,
      )
      fila.gross_sales += bruto
      fila.discounts += descuento
      fila.net_sales += bruto - descuento

      const idItem = item.item?.id
      if (idItem) {
        const clave = `${fecha}|${idItem}`
        const p =
          productos.get(clave) ??
          ({
            date: fecha,
            canal: 'meli' as const,
            product_id: idItem,
            product_title: item.item?.title ?? '',
            gross_sales: 0,
            net_sales: 0,
            orders: 0,
            units: 0,
          } satisfies FilaProductoMeli)
        p.gross_sales += bruto
        p.net_sales += bruto - descuento
        p.orders += 1
        p.units += cantidad
        productos.set(clave, p)
      }
    }

    const buyerId = orden.buyer?.id != null ? String(orden.buyer.id) : null
    if (buyerId) {
      const set = compradoresPorDia.get(fecha) ?? new Set<string>()
      if (!set.has(buyerId)) {
        set.add(buyerId)
        fila.customers += 1
        if (esCompradorNuevo(buyerId, fecha)) fila.new_customers += 1
        else fila.returning_customers += 1
      }
      compradoresPorDia.set(fecha, set)
    }

    porDia.set(fecha, fila)
  }

  // El ticket promedio se calcula al final, sobre los totales del dia. Sin
  // pedidos queda NULL, nunca 0: son cosas distintas.
  const ventas = [...porDia.values()].map((f) => ({
    ...f,
    aov: f.orders > 0 ? Number((f.total_sales / f.orders).toFixed(2)) : null,
  }))

  return { ventas, productos: [...productos.values()] }
}

/** Los buyer_id de un lote de ordenes, para resolver nuevos vs recurrentes. */
export function compradoresDe(ordenes: OrdenMeli[]): { id: string; fecha: string }[] {
  const vistos: { id: string; fecha: string }[] = []
  for (const o of ordenes) {
    if (o.buyer?.id != null && o.date_created) {
      vistos.push({ id: String(o.buyer.id), fecha: dia(o.date_created) })
    }
  }
  return vistos
}
