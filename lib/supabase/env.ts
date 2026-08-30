// Lee y valida las variables de entorno de Supabase.
//
// Existe para una sola razon: si te falta una variable, el error tiene que
// decirte QUE falta y DONDE conseguirlo. Sin esto, Next tira un
// "Invalid URL" que no le sirve a nadie.

function faltante(nombre: string, donde: string): never {
  throw new Error(
    [
      ``,
      `Falta la variable de entorno ${nombre}.`,
      ``,
      `Como arreglarlo:`,
      `  1. Copia el archivo .env.example a .env.local`,
      `  2. ${donde}`,
      `  3. Pega el valor en .env.local y reinicia el servidor (Ctrl+C y npm run dev)`,
      ``,
    ].join('\n'),
  )
}

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    faltante(
      'NEXT_PUBLIC_SUPABASE_URL',
      'Entra a tu proyecto en supabase.com > Project Settings > Data API > URL',
    )
  }
  return url
}

// Supabase renombro esta clave: los proyectos viejos la llaman "anon key" y los
// nuevos "publishable key". Son la misma cosa. Aceptamos los dos nombres para que
// no importe cuando creaste tu proyecto.
export function supabaseKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!key) {
    faltante(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'Entra a tu proyecto en supabase.com > Project Settings > API Keys > anon / publishable',
    )
  }
  return key
}
