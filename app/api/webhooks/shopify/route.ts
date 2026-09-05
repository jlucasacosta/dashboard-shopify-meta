// Webhook de Shopify. Es un TIMBRE, no una fuente de datos.
//
// Cuando entra un pedido, Shopify avisa aca. Este endpoint NO escribe ninguna
// metrica: solo marca el dia como sucio y contesta 200. El proximo tick del
// cron (cada 5 minutos) le vuelve a preguntar a ShopifyQL como quedo ese dia y
// pisa la fila.
//
// Por que asi, y no guardando el pedido que viene en el payload:
//
//   Si calcularamos net_sales, devoluciones y descuentos desde pedidos crudos,
//   tarde o temprano difeririamos de lo que muestra Analytics en el admin de
//   Shopify, que tiene sus propias reglas para reembolsos, cancelaciones,
//   impuestos y envios. La regla 1 de AGENTS.md dice que si un numero no cierra
//   con Shopify, el bug es nuestro. La forma de no tener nunca ese bug es no
//   calcular: preguntarle siempre a Shopify.
//
// Efecto util del diseño: no hace falta deduplicar. Marcar dos veces el mismo
// dia es exactamente igual que marcarlo una vez, asi que los reintentos de
// Shopify y las suscripciones duplicadas son inofensivos.

import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { configShopify } from '@/lib/sync/config'
import { diaAResincronizar, hmacShopifyValido } from '@/lib/sync/firmas'

export const runtime = 'nodejs'
export const maxDuration = 15

export async function POST(request: NextRequest) {
  let clientSecret: string | null
  try {
    clientSecret = configShopify().apiSecret
  } catch (e) {
    console.error('[webhook shopify] configuracion incompleta:', e)
    return new Response('configuracion incompleta', { status: 500 })
  }

  if (!clientSecret) {
    console.error(
      '[webhook shopify] falta SHOPIFY_API_SECRET (client secret de la app, en shopify.dev/dashboard > tu app > API credentials). Sin el no se puede verificar que el webhook venga de Shopify.',
    )
    return new Response('configuracion incompleta', { status: 500 })
  }

  // El cuerpo CRUDO, antes de parsear. Si se hiciera request.json() primero, el
  // texto reserializado no seria byte a byte el que firmo Shopify y el HMAC no
  // daria nunca. Hay un test que fija esto.
  const crudo = await request.text()

  if (!hmacShopifyValido(crudo, request.headers.get('x-shopify-hmac-sha256'), clientSecret)) {
    // 401 sin detalle: a quien no pudo firmar no se le explica que fallo.
    return new Response('firma invalida', { status: 401 })
  }

  const fecha = diaAResincronizar(crudo)

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('dias_sucios')
    .upsert({ date: fecha, canal: 'shopify' }, { onConflict: 'date,canal' })

  if (error) {
    // 500 a proposito: Shopify reintenta. Perder la marca significa que ese dia
    // no se refresca hasta la pasada de la hora.
    console.error('[webhook shopify] no se pudo marcar el dia:', error.message)
    return new Response('no se pudo registrar', { status: 500 })
  }

  return new Response('ok', { status: 200 })
}
