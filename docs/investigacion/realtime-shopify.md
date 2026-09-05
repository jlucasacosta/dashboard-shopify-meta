# Realtime multi-fuente — investigación

Fecha: 2026-09-05. Fuentes: shopify.dev, developers.facebook.com,
developers.mercadolibre.com, mercadopago developers, vercel.com/docs, docs Supabase.

**Contexto del producto:** componente pre-hecho que se entrega dentro de un curso.
Cada alumno lo despliega **en sus propias cuentas** (se le enseña el deploy a
Vercel). Nosotros no hospedamos nada ni vemos sus datos. El alumno no programa.

**Alcance:** canales de venta = **Shopify + Mercado Libre**. Meta Ads = solo
gasto. Mercado Pago = solo cobros, nunca facturacion.

> Detalle exacto de endpoints, mutations y parametros:
> [referencia-tecnica.md](referencia-tecnica.md).

Actualización por webhooks + reconciliación cada X minutos.

---

## 0. Resumen de decisiones

| Pregunta | Respuesta | Por qué |
|---|---|---|
| ¿Dónde reciben los webhooks? | **Vercel** — routes `/api/webhooks/*` del mismo Next.js | Ya se enseña el deploy. Un repo, un lenguaje, un deploy. Se cae la Edge Function de Supabase. |
| ¿Dónde vive el cron? | **Supabase `pg_cron` + `pg_net`** | Gratis, cada minuto, cero cuentas nuevas. Ver §3. |
| ¿Railway? | **No** | Cuenta nueva + tarjeta + ~US$5/mes, para hacer lo mismo que pg_cron hace gratis. Solo se justifica si aparece un worker de larga duración. |
| ¿Vercel Cron? | **No** | Hobby está capado a **1 vez por día**. Ver §3. |
| ¿OAuth? | **Solo Mercado Libre lo exige** | Shopify, Meta y MP dan token directo para la cuenta propia. Ver §4. |

---

## 1. Shopify

### 1.1 Webhooks solos NO alcanzan — Shopify lo dice explícitamente

De `shopify.dev/docs/apps/build/webhooks`:

> **Implement reconciliation jobs.** Your app shouldn't rely on receiving data
> from Shopify webhooks. Webhook delivery isn't always guaranteed [...] use
> reconciliation jobs to periodically fetch data. Many GraphQL queries support
> `updated_at` filter parameters.

> Shopify doesn't guarantee ordering within a topic [...] use
> `X-Shopify-Triggered-At` (header) or `updated_at` (payload) to organize webhooks.

Webhooks + GET cada X min no son dos opciones: son las dos mitades obligatorias
del mismo diseño. Además, **sesiones / visitantes / tasa de conversión no tienen
webhook** — solo ShopifyQL. El polling es la única fuente de varias tablas.

### 1.2 Reglas duras

| Regla | Detalle |
|---|---|
| HMAC | `X-Shopify-Hmac-SHA256`, base64, HMAC-SHA256 del **body crudo** con el client secret. Verificar antes de parsear. |
| Dedupe | `X-Shopify-Webhook-Id` con índice único. Shopify reintenta y duplica. |
| Respuesta | `200` rápido. Lo pesado va a cola. |
| Rotación de secret | Hasta **1 hora** de deliveries firmados con el secret viejo. |

Topics: `orders/create`, `orders/updated`, `orders/cancelled`, `refunds/create`,
`products/update`, `app/uninstalled`.

### 1.3 Cómo instala el alumno

El flujo viejo murió. De `.../legacy/admin-custom-apps`:

> **Caution: You can no longer create new admin-created custom apps.** For new
> apps, use Dev Dashboard or Shopify CLI.

El reemplazo sirve, y la doc aclara que es también para merchants:

> The Dev Dashboard is your central hub [...] **whether you're a merchant
> creating custom apps** or a partner developing public apps.

Pasos del alumno (todo web, sin terminal, sin OAuth, sin revisión de Shopify):
`shopify.dev/dashboard` → Create app → Start from Dev Dashboard → Versions
(scopes + webhooks API version) → Release → Home → Install app → copiar
**Admin API access token** y **client secret**.

### 1.4 Riesgos

- `read_orders` solo llega a los **últimos 60 días**. El histórico de 365 días
  necesita `read_all_orders`, que es **scope protegido**.
- Datos de cliente (nuevos vs recurrentes) pueden requerir aprobación de
  *protected customer data*.
- Backfill inicial → `bulkOperationRunQuery`, no paginación sincrónica.
  Es asíncrono, encaja perfecto con el cron (se dispara, se poletea después).

---

## 2. Los otros tres conectores

### 2.1 Meta Ads — sin app review para cuentas propias

Hallazgo clave: **no hace falta revisión de Meta si solo leés tus propias
cuentas publicitarias.** La app queda en Development Mode / Standard Access, que
alcanza para "assets you own or admin". La revisión solo aplica si accedés a
cuentas de otros negocios fuera de tu Business portfolio.

Token: el del Graph API Explorer dura 1–2 h; el long-lived dura ~60 días. Para
algo siempre encendido va **System User token** (Business Manager), pensado para
backend, renovable y no atado a una sesión humana. **Es el que hay que enseñar.**

- Permisos: `ads_read` (alcanza para leer gasto; `ads_management` no hace falta).
- No hay webhooks de gasto útiles → **polling puro**, 1×/día alcanza.
- Endpoint: Insights de la cuenta publicitaria, por día y por campaña.

### 2.2 Mercado Pago — el más fácil de todos

- **Sin OAuth para la cuenta propia.** Panel → *Tus integraciones* → crear
  aplicación → copiar el **Access Token de producción**.
- Webhooks se configuran **en el mismo panel**: URL + eventos. Al configurarlos
  Mercado Pago genera una **clave secreta**.
- Firma: header `x-signature` con formato `ts=<timestamp>,v1=<hash>`.
  Se valida armando el manifest `id:<resourceId>;request-id:<requestId>;ts:<ts>;`
  y comparando un HMAC-SHA256 con la clave secreta. Mismo patrón mental que
  Shopify — un solo helper de verificación para los dos.
- Hay simulador de notificaciones en el panel → se puede probar sin vender nada.
  Muy bueno para el curso.

### 2.3 Mercado Libre — el único que obliga a OAuth

Es el más caro en trabajo y el que más puede romper la promesa de "súper simple".

- OAuth 2.0 obligatorio. Scopes: `offline_access`, `read`.
- El access token dura poco (la doc se contradice: dice 6 h, el ejemplo devuelve
  `expires_in: 10800` = 3 h). **Leer siempre `expires_in`.** El `refresh_token`
  es **de un solo uso y rota** en cada refresco: si dos procesos refrescan a la
  vez, la conexion del alumno muere. Necesita lock. Ver referencia-tecnica §2.1.
- Callback URL **debe ser HTTPS** → la URL de Vercel sirve.
- Notificaciones: se configuran a mano en el devcenter. **MeLi exige responder
  200 en 500 ms o desactiva los topics.** Incompatible con cold starts de
  serverless → recomendacion: **MeLi por polling puro** (`last_updated.from`)
  + `/missed_feeds`. Ver referencia-tecnica §2.2.

**Implicancia de producto:** ML necesita un botón *"Conectar Mercado Libre"* en
el panel, una route de callback, y refresh automático. Es el único conector que
no se resuelve pegando un token. Vale considerar dejarlo para una fase 2.

### 2.4 Comparación de fricción para el alumno

| Fuente | Cómo obtiene acceso | OAuth | Expira | Dificultad |
|---|---|---|---|---|
| Mercado Pago | Access Token del panel | No | No | ★☆☆☆☆ |
| Shopify | Dev Dashboard, 4 pantallas | No | No | ★★☆☆☆ |
| Meta Ads | System User token en Business Manager | No | No (si es System User) | ★★★☆☆ |
| Mercado Libre | Botón "Conectar" → OAuth | **Sí** | **6 h + refresh** | ★★★★★ |

---

## 3. Dónde vive el cron: Supabase, sí. Railway, no.

### Vercel Cron queda descartado

Plan **Hobby: 100 jobs pero cadencia mínima de 1 vez por día**, y el horario
solo se garantiza dentro de la hora. Cadencia por minuto es **Pro**. Un panel
que se actualiza "cada X minutos" no entra en el free tier de Vercel.

> ⚠️ Aparte: el plan Hobby de Vercel **no permite uso comercial**. Una tienda
> real usándolo para su negocio, en rigor, necesita Pro (US$20/mes). Hay que
> decirlo en el curso, no descubrirlo después.

### Supabase pg_cron + pg_net — la elegida

- Gratis en el free tier, granularidad **por minuto**.
- El alumno ya tiene Supabase: **cero cuentas nuevas, cero tarjetas**.
- El cron hace un POST a `https://<su-panel>.vercel.app/api/cron/sync` con un
  header secreto. Toda la lógica sigue viviendo en el repo, en TypeScript.
- Efecto secundario bueno: mantiene despierto el proyecto free de Supabase, que
  se pausa por inactividad.

### Railway — solo si aparece un worker largo

Cuenta nueva + tarjeta + ~US$5/mes para hacer lo mismo. Se justificaría solo si
hiciera falta un proceso de larga duración (backfill pesado, cola con reintentos
elaborados). Hoy no hace falta: las bulk operations de Shopify ya son asíncronas
y el cron las poletea. **Mantener el stack en 2 cuentas (Vercel + Supabase) vale
más que la flexibilidad de Railway.**

---

## 4. Arquitectura propuesta

Todo dentro de las cuentas del alumno. Dos cuentas: Vercel + Supabase.

```
 Shopify ──┐
 Meli ─────┼──webhooks──►  Next.js en Vercel
 Mercado   │               /api/webhooks/shopify
 Pago  ────┘               /api/webhooks/meli
                           /api/webhooks/mercadopago
                                 │ verifica firma, dedupe, 200 rápido
                                 ▼
                           Supabase: webhook_events (cola)
                                 ▲
 Supabase pg_cron ──POST──► /api/cron/sync   (cada N min, header secreto)
                                 │   · drena la cola
                                 │   · reconcilia updated_at >= last_sync
                                 │   · ShopifyQL (sesiones)
                                 │   · renueva el token de Meli (cada <6 h)
                                 │   · Meta Ads Insights + FX (1×/día)
                                 ▼
                    orders (crudo, multi-canal)
                                 │
                                 ▼
                    daily_sales / daily_traffic / daily_products /
                    daily_ad_spend   ← derivadas, recalculadas por día tocado
                                 │
                                 ▼  Supabase Realtime (ya funciona hoy)
                           El panel se actualiza solo
```

---

## 5. Lo que hay que cambiar en el modelo de datos

### 5.1 De agregado a crudo

Hoy `daily_sales` es un snapshot por día que escribe Claude. Un `orders/create`
no le puede "sumar" de forma segura: no hay orden garantizado y hay reintentos.
Hace falta una tabla `orders` cruda idempotente, y que `daily_sales` pase a ser
**derivada**, recalculada solo para los días que cambiaron. Refuerza una decisión
que el repo ya tomó: *"los cálculos viven en la base de datos"*.

### 5.2 Multi-canal rompe un principio actual del repo

El README declara hoy: *"Shopify es la única verdad de ventas."* Con Mercado
Libre eso deja de ser cierto. Hace falta:

- Columna `canal` (`shopify` | `meli`) en `orders` y en los agregados diarios.
- Filtro por canal en el panel, y totales consolidados.
- Reescribir esa decisión de diseño en el README.

### 5.3 Mercado Pago NO es una fuente de ventas — decidido

Confirmado: los canales de venta son Shopify y Mercado Libre. Riesgo de doble conteo: si el alumno vende por Shopify **cobrando con Mercado
Pago**, cada venta aparecería dos veces. MP tiene que tratarse como fuente de
**cobros** (payouts, comisiones, contracargos, plata realmente acreditada), no
de facturación. Un panel que suma dos veces no falla nunca y miente siempre.

### 5.4 Tablas nuevas

`orders` (crudo, multi-canal) · `webhook_events` (dedupe por id de evento) ·
`sync_state` (último `updated_at` por recurso) · `conexiones` (tokens por
fuente, con `expires_at` y `refresh_token` para Meli).

Los tokens **no** pueden ser legibles con la anon key: RLS que los bloquee, solo
service role.

---

## 6. La experiencia del alumno, de punta a punta

Lo que hace a mano:

1. Cuenta gratis en Supabase.
2. Deploy a Vercel (ya se enseña) → de ahí sale su URL pública.
3. Por cada fuente que use: sacar el token (§2) y pegarlo **en un solo lugar**.
4. Mercado Libre, si lo usa: apretar "Conectar" y aprobar.

Lo que tiene que pasar solo, sin que lo entienda:

- Migraciones aplicadas.
- Webhooks registrados apuntando a su URL de Vercel (Shopify por
  `webhookSubscriptionCreate`; MP y Meli se configuran en sus paneles → esos dos
  hay que documentarlos con capturas, no se pueden automatizar).
- Jobs de pg_cron agendados.
- Backfill de histórico disparado.

**El cuello de botella del "súper sencillo" es el paso 3.** La forma que mejor
encaja con "cero conocimiento" es una página `/setup` dentro del propio panel:
un formulario por fuente, con validación en vivo ("token OK, veo tu tienda") y
un botón que registra webhooks y agenda los crons. Es más código que un
`.env`, pero es la diferencia entre un producto y un tutorial.

---

## 7. Riesgos abiertos

1. `read_all_orders` (Shopify) es scope protegido → sin él, histórico de 60 días.
2. Protected customer data en Shopify para nuevos vs recurrentes.
3. Vercel Hobby prohíbe uso comercial → costo real US$20/mes. Decir esto de entrada.
4. Refresh token de Meli: si se rompe, el alumno tiene que reconectar. Necesita
   aviso visible en el panel, no un fallo silencioso.
5. Doble conteo Shopify + Mercado Pago (§5.3).
6. Free tier de Supabase: verificar que un cron cada 5 min no se coma la cuota.
7. Timeout de funciones en Vercel (60 s Hobby / 300 s Pro) → el backfill tiene
   que ser asíncrono sí o sí.
8. Cadencia propuesta: 5 min ventas · 1 h tráfico · 4 h refresh de Meli ·
   1×día Meta y FX.

---

## Fuentes

**Shopify**
- https://shopify.dev/docs/apps/build/webhooks
- https://shopify.dev/docs/apps/build/webhooks/verify-deliveries
- https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard
- https://shopify.dev/docs/apps/build/authentication-authorization/legacy/admin-custom-apps
- https://shopify.dev/docs/api/usage/limits

**Meta**
- https://admanage.ai/blog/meta-ads-api
- https://adlibrary.com/posts/meta-ads-api-integration-guide

**Mercado Libre**
- https://developers.mercadolibre.com.ar/en_us/authentication-and-authorization
- https://global-selling.mercadolibre.com/devsite/receive-notifications

**Mercado Pago**
- https://www.mercadopago.com.mx/developers/es/docs/checkout-pro/additional-content/notifications/webhooks
- https://www.mercadopago.com.pe/developers/en/news/2024/01/11/Webhooks-Notifications-Simulator-and-Secret-Signature

**Infra**
- https://vercel.com/docs/limits
- https://vercel.com/docs/plans/hobby
- https://supabase.com/docs/guides/database/extensions/pg_net
