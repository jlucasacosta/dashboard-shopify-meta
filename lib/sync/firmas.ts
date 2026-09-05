// Verificacion de firmas. Vive aparte de los route handlers para poder
// testearla: es el codigo que decide quien entra, y no se puede confiar en
// que "se ve bien".

import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Compara dos secretos en tiempo constante.
 *
 * Con `===`, JavaScript corta en el primer caracter distinto. Eso hace que el
 * tiempo de respuesta revele cuantos caracteres acerto quien esta probando, y
 * con suficientes intentos el secreto se reconstruye de a un caracter.
 *
 * El largo si se compara antes y de forma normal: timingSafeEqual exige buffers
 * del mismo tamaño, y el largo de un secreto no es informacion util para nadie.
 */
export function comparacionSegura(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * Verifica el HMAC de un webhook de Shopify.
 *
 * `cuerpoCrudo` tiene que ser el texto tal cual llego (request.text()). Si se
 * parsea a JSON y se vuelve a serializar, los bytes cambian y la firma no da
 * nunca. Es el error mas comun de esta integracion.
 */
export function hmacShopifyValido(
  cuerpoCrudo: string,
  firmaBase64: string | null,
  clientSecret: string,
): boolean {
  if (!firmaBase64) return false

  const calculado = createHmac('sha256', clientSecret).update(cuerpoCrudo, 'utf8').digest()

  let recibido: Buffer
  try {
    recibido = Buffer.from(firmaBase64, 'base64')
  } catch {
    return false
  }

  if (calculado.length !== recibido.length) return false
  return timingSafeEqual(calculado, recibido)
}

/**
 * El dia que hay que volver a sincronizar segun el payload de un webhook.
 *
 * Es la fecha de CREACION del pedido, no la de hoy: un reembolso de hoy sobre
 * una venta de la semana pasada cambia la fila de la semana pasada. Usar hoy
 * dejaria ese dia viejo desactualizado para siempre.
 */
export function diaAResincronizar(cuerpoCrudo: string, hoy = new Date()): string {
  try {
    const payload = JSON.parse(cuerpoCrudo) as {
      created_at?: string
      updated_at?: string
    }
    const referencia = payload.created_at ?? payload.updated_at
    if (referencia) {
      const d = new Date(referencia)
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
  } catch {
    // Payload ilegible: se cae al dia de hoy, que es lo mas probable.
  }
  return hoy.toISOString().slice(0, 10)
}
