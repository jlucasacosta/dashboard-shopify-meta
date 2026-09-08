// Configuracion → Integraciones.
//
// Es una pantalla de SOLO LECTURA con un enlace. No escribe nada en la base:
// muestra en que estado esta cada fuente y, para Mercado Libre, linkea a
// /api/meli/conectar, que es quien arranca el OAuth. Quien escribe sigue siendo
// el servidor en /api/meli/callback, con la service key. La regla 4 de
// AGENTS.md queda intacta.
//
// Por que existe: conectar Mercado Libre requeria escribir la URL del endpoint
// a mano en la barra del navegador, cosa que nadie adivina. Es la unica
// integracion que necesita una accion de la persona cada tanto —el permiso se
// puede invalidar— asi que necesitaba un lugar visible donde volver.
//
// Es un server component a proposito: lee `conexiones`, que no tiene ninguna
// policy y solo puede leerse con la service key. Nada de eso cruza al
// navegador salvo los cuatro campos que devuelve estadoDeConexion.

import Link from 'next/link'
import { CheckCircle2, CircleAlert, CircleDashed, ExternalLink, RefreshCw } from 'lucide-react'
import { getConexiones } from '@/lib/queries'
import { estadoDeConexion, type EstadoConexion } from '@/lib/integraciones'
import { configMeli, configMeta, configShopify } from '@/lib/sync/config'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

/** configShopify() tira si falta una variable; aca eso es un estado, no un error. */
function hayShopify(): boolean {
  try {
    const c = configShopify()
    return Boolean(c.shopDomain && c.clientId && c.apiSecret)
  } catch {
    return false
  }
}

const ESTILO: Record<EstadoConexion | 'configurada' | 'sin-configurar', {
  texto: string
  clase: string
  Icono: typeof CheckCircle2
}> = {
  conectada: {
    texto: 'Conectada',
    clase: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
    Icono: CheckCircle2,
  },
  configurada: {
    texto: 'Configurada',
    clase: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
    Icono: CheckCircle2,
  },
  vencida: {
    texto: 'Permiso vencido',
    clase: 'border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400',
    Icono: RefreshCw,
  },
  'con-error': {
    texto: 'Con error',
    clase: 'border-destructive/30 bg-destructive/10 text-destructive',
    Icono: CircleAlert,
  },
  'sin-conectar': {
    texto: 'Sin conectar',
    clase: 'border-border bg-muted text-muted-foreground',
    Icono: CircleDashed,
  },
  'sin-configurar': {
    texto: 'Sin configurar',
    clase: 'border-border bg-muted text-muted-foreground',
    Icono: CircleDashed,
  },
}

function Estado({ tipo }: { tipo: keyof typeof ESTILO }) {
  const { texto, clase, Icono } = ESTILO[tipo]
  return (
    <Badge variant="outline" className={`gap-1.5 font-medium ${clase}`}>
      <Icono className="size-3.5" aria-hidden />
      {texto}
    </Badge>
  )
}

export default async function ConfiguracionPage() {
  const conexiones = await getConexiones()
  const meli = estadoDeConexion(conexiones.meli ?? null)

  const shopifyOk = hayShopify()
  const metaOk = configMeta() !== null
  const meliConfigurado = configMeli() !== null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Configuración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          De dónde salen los números del panel.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Integraciones</h2>

        {/* --------------------------------------------------------- Shopify */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Shopify</CardTitle>
            <Estado tipo={shopifyOk ? 'configurada' : 'sin-configurar'} />
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {shopifyOk ? (
              <p>
                Ventas, visitas y productos. El token se pide y se renueva solo cada
                24&nbsp;horas: no hay nada que hacer acá.
              </p>
            ) : (
              <p>
                Faltan <code>SHOPIFY_SHOP_DOMAIN</code>, <code>SHOPIFY_CLIENT_ID</code> o{' '}
                <code>SHOPIFY_API_SECRET</code> en las variables de entorno. Sin Shopify el
                panel no tiene ventas.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------------------ Meta */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Meta Ads</CardTitle>
            <Estado tipo={metaOk ? 'configurada' : 'sin-configurar'} />
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {metaOk ? (
              <p>
                La inversión en anuncios, que es lo que hace posibles el CAC, el ROAS y el
                MER. El token de usuario del sistema no vence.
              </p>
            ) : (
              <p>
                Sin <code>META_ACCESS_TOKEN</code> y <code>META_AD_ACCOUNT_ID</code>. El panel
                funciona igual, pero sin CAC, ROAS, MER ni contribución.
              </p>
            )}
          </CardContent>
        </Card>

        {/* --------------------------------------------------- Mercado Libre */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Mercado Libre</CardTitle>
            <Estado tipo={meliConfigurado ? meli.estado : 'sin-configurar'} />
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            {!meliConfigurado ? (
              <p>
                Faltan <code>MELI_APP_ID</code> y <code>MELI_SECRET_KEY</code>. Cada panel
                necesita su propia app de Mercado Libre, porque la dirección de retorno tiene
                que coincidir exacto con esta URL.
              </p>
            ) : (
              <>
                {meli.estado === 'conectada' && (
                  <p>
                    Conectada a la cuenta <strong>{meli.cuentaId}</strong>. El permiso se
                    renueva solo; no hace falta volver acá salvo que algo falle.
                  </p>
                )}

                {meli.estado === 'sin-conectar' && (
                  <p>
                    Las credenciales están, pero falta que autorices el acceso desde tu cuenta
                    de Mercado Libre. Es un paso que solo podés dar vos.
                  </p>
                )}

                {meli.estado === 'vencida' && (
                  <p>
                    El permiso de la cuenta <strong>{meli.cuentaId}</strong> venció y no se
                    pudo renovar. Volvé a autorizar para que las ventas sigan entrando.
                  </p>
                )}

                {meli.estado === 'con-error' && (
                  <div className="space-y-2">
                    <p>
                      La última sincronización falló
                      {meli.cuentaId ? <> en la cuenta <strong>{meli.cuentaId}</strong></> : null}.
                    </p>
                    {/* El texto viene de la API de MeLi: se muestra crudo, sin
                        interpretarlo, porque inventar un diagnostico es peor
                        que mostrar el error real. */}
                    <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-xs text-destructive">
                      {meli.detalle}
                    </p>
                    <p>
                      Si dice <code>invalid_grant</code>, el permiso se invalidó y alcanza con
                      volver a autorizar.
                    </p>
                  </div>
                )}

                {/* Un <a> de verdad, no un boton con fetch: /api/meli/conectar
                    responde un redirect a Mercado Libre y el navegador tiene
                    que seguirlo. Con fetch, el redirect se resolveria en
                    segundo plano y la persona nunca veria la pantalla de
                    autorizacion. */}
                <a
                  href="/api/meli/conectar"
                  className={buttonVariants({
                    variant: meli.estado === 'conectada' ? 'outline' : 'default',
                  })}
                >
                  {meli.estado === 'conectada' ? 'Volver a autorizar' : 'Conectar Mercado Libre'}
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <p className="text-sm text-muted-foreground">
        Si un número se congela, el primer lugar donde mirar es el aviso de datos de cada
        pantalla.{' '}
        <Link href="/" className="underline underline-offset-4">
          Volver al resumen
        </Link>
      </p>
    </div>
  )
}
