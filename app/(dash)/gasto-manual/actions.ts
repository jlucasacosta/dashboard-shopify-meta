'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validarGasto } from '@/lib/gasto-manual'

export type EstadoForm = { ok: boolean; mensaje: string } | null

export async function guardarGasto(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const validacion = validarGasto({
    date: String(formData.get('date') ?? ''),
    spend: String(formData.get('spend') ?? ''),
    currency: String(formData.get('currency') ?? ''),
  })

  if (!validacion.ok) return { ok: false, mensaje: validacion.error }

  const { date, spend, currency } = validacion.valor
  const supabase = await createClient()

  // Regla de precedencia: lo que trajo la sincronizacion manda.
  // Si ya hay un dato real de Meta para ese dia, no se pisa a mano. Fallamos
  // con un mensaje claro en vez de sobrescribir en silencio.
  const { data: existente } = await supabase
    .from('daily_ad_spend')
    .select('source')
    .eq('date', date)
    .maybeSingle()

  if (existente?.source === 'mcp') {
    return {
      ok: false,
      mensaje: `El ${date} ya tiene datos traídos de Meta. No se sobrescriben con una carga manual.`,
    }
  }

  const { error } = await supabase.from('daily_ad_spend').upsert(
    {
      date,
      ad_account_id: 'manual',
      spend,
      currency,
      source: 'manual',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'date,ad_account_id' },
  )

  if (error) {
    return { ok: false, mensaje: `No se pudo guardar: ${error.message}` }
  }

  revalidatePath('/gasto-manual')
  revalidatePath('/')
  return { ok: true, mensaje: `Gasto del ${date} guardado.` }
}
