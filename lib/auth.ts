// Helpers del inicio de sesión con contraseña.
//
// Separados de la pantalla para poder testearlos sin navegador. Lo que hacen
// es poco, pero es lo que evita los dos motivos más tontos por los que alguien
// no puede entrar: un correo pegado con espacios o mayúsculas, y un error en
// inglés que no explica nada.

/**
 * Largo mínimo de la contraseña.
 *
 * Es el default de Supabase (Authentication > Providers > Email). No lo
 * subimos: la contraseña la genera `npm run usuario:crear` con 19 caracteres,
 * así que este mínimo solo existe para que el botón no se habilite con dos
 * letras y la persona descubra el problema recién después del viaje al
 * servidor.
 */
export const LARGO_MIN_PASSWORD = 6

export function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase()
}

/**
 * Deja la contraseña como la escribió la persona, salvo por los espacios de
 * los bordes.
 *
 * Copiar y pegar del HTML de credenciales se trae un espacio o un salto de
 * línea con muchísima frecuencia, y Supabase lo cuenta como parte de la clave:
 * el resultado es "credenciales inválidas" con la clave correcta a la vista.
 * Lo del medio no se toca, porque ahí sí podría ser parte de la contraseña.
 */
export function normalizarPassword(valor: string): string {
  return valor.trim()
}

export function passwordCompleta(valor: string): boolean {
  return normalizarPassword(valor).length >= LARGO_MIN_PASSWORD
}

/**
 * Traduce los errores de Supabase, que vienen en inglés y a veces no dicen lo
 * que realmente pasó. Si no reconocemos el error, lo mostramos tal cual: es
 * preferible un mensaje feo y verdadero a uno lindo e inventado.
 */
export function mensajeDeError(original: string): string {
  const e = original.toLowerCase()

  // El más común de todos, y el que peor informa: Supabase responde lo mismo
  // si el correo no existe, si la contraseña está mal y si el usuario fue
  // borrado. No podemos distinguirlos, así que nombramos las tres salidas en
  // vez de mandar a la persona a adivinar cuál de ellas le tocó.
  if (e.includes('invalid login credentials') || e.includes('invalid credentials')) {
    return 'Correo o contraseña incorrectos. Revisá que no se haya colado un espacio al pegar; si seguís sin poder entrar, pedile al dueño del panel una contraseña nueva.'
  }
  if (e.includes('email not confirmed')) {
    return 'Ese usuario quedó sin confirmar. Pedile al dueño del panel que vuelva a darte de alta.'
  }
  if (e.includes('signups not allowed') || e.includes('user not found')) {
    return 'Ese email no está habilitado para entrar. Pedile al dueño del panel que te agregue.'
  }
  if (e.includes('rate limit') || e.includes('too many')) {
    return 'Probaste varias veces seguidas. Esperá un minuto y volvé a intentar.'
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

/**
 * Rutas que llama una maquina, no una persona.
 *
 * El webhook de Shopify se autentica con su HMAC y el cron con un secreto
 * compartido con pg_cron. Ninguno tiene cookies de sesion, asi que si el
 * middleware los manda al login, Shopify ve un 302 en vez de un 200 y termina
 * desactivando el webhook, y el cron no sincroniza nunca. Las dos cosas fallan
 * en silencio, porque una redireccion no parece un error.
 *
 * `/api/meli/*` NO entra aca: ese flujo lo arranca una persona desde el panel
 * y tiene que exigir sesion.
 */
const RUTAS_DE_MAQUINA = ['/api/webhooks/', '/api/cron/']

export function esRutaDeMaquina(ruta: string): boolean {
  return RUTAS_DE_MAQUINA.some((prefijo) => ruta.startsWith(prefijo))
}
