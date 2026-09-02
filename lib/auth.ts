// Helpers del inicio de sesión con código.
//
// Separados de la pantalla para poder testearlos sin navegador. Lo que hacen
// es poco, pero es lo que evita los dos motivos más tontos por los que alguien
// no puede entrar: un código pegado con espacios, y un error en inglés que no
// explica nada.

/**
 * Largo del código que manda Supabase.
 *
 * Acá vivía `LARGO_CODIGO = 6`, heredado de la configuración de un Supabase
 * local. Un proyecto en la nube emite el largo que tenga configurado en
 * Authentication > Emails, y por defecto son 8.
 *
 * Con el largo fijo en 6, la app recortaba el código de 8 a sus primeros 6
 * dígitos y Supabase respondía `otp_expired`: un error que miente, porque el
 * código no venció, llegó cortado. No había forma de entrar y el mensaje te
 * mandaba a buscar al lugar equivocado.
 *
 * Por eso la app ya no impone un largo: acepta lo que llegue, dentro del rango
 * que Supabase permite configurar.
 */
export const LARGO_MIN = 6
export const LARGO_MAX = 10

export function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase()
}

/**
 * Deja solo los dígitos del código.
 * La gente lo copia del correo y se trae espacios, guiones o saltos de línea;
 * rechazarlo por eso sería un error nuestro, no del usuario.
 */
export function normalizarCodigo(valor: string): string {
  return valor.replace(/\D/g, '').slice(0, LARGO_MAX)
}

export function codigoCompleto(valor: string): boolean {
  return normalizarCodigo(valor).length >= LARGO_MIN
}

/**
 * Traduce los errores de Supabase, que vienen en inglés y a veces no dicen lo
 * que realmente pasó. Si no reconocemos el error, lo mostramos tal cual: es
 * preferible un mensaje feo y verdadero a uno lindo e inventado.
 */
export function mensajeDeError(original: string): string {
  const e = original.toLowerCase()

  if (e.includes('signups not allowed') || e.includes('user not found')) {
    return 'Ese email no está habilitado para entrar. Pedile al dueño del panel que te agregue.'
  }
  if (e.includes('expired')) {
    return 'El código venció. Pedí uno nuevo.'
  }
  if (e.includes('invalid') && (e.includes('token') || e.includes('otp'))) {
    return 'Ese código no es correcto. Revisalo y probá de nuevo.'
  }
  if (e.includes('rate limit') || e.includes('too many')) {
    return 'Pediste varios códigos seguidos. Esperá un minuto y volvé a intentar.'
  }
  if (e.includes('invalid email') || e.includes('unable to validate email')) {
    return 'Ese correo no parece válido.'
  }
  // El navegador tira "Failed to fetch" cuando ni siquiera pudo llegar a
  // Supabase. Casi siempre es una de dos: falta `.env.local` (o quedó con la
  // URL equivocada) o el proyecto está pausado. Sin esto el mensaje queda en
  // inglés y no dice qué revisar, que es el peor momento para dejar a alguien
  // solo: es su primer intento de entrar.
  if (e.includes('failed to fetch') || e.includes('networkerror') ||
      e.includes('load failed')) {
    return 'No se pudo contactar a Supabase. Revisá que `.env.local` tenga la URL de tu proyecto y que el proyecto no esté pausado.'
  }

  return `No pudimos continuar: ${original}`
}
