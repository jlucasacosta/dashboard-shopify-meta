# Referencia técnica — Shopify + Mercado Libre

Fecha: 2026-09-05. Todo verificado contra documentación oficial (shopify.dev y
global-selling.mercadolibre.com/devsite). Lo que no pude verificar está marcado
como **⚠️ a confirmar**.

Canales de venta: **Shopify + Mercado Libre**. Meta Ads = solo gasto.
Mercado Pago = solo cobros, nunca facturación (evita el doble conteo).

Criterio transversal: **es un sistema base para replicar**. Cada decisión se
juzga por si sobrevive a 50 instalaciones distintas sin intervención manual.

---

## 0. Auditoría de fuentes — qué es oficial y qué no

Me lo preguntaste y la respuesta honesta es: **casi todo, pero no todo.**

| Tema | Fuente | ¿Oficial? |
|---|---|---|
| Shopify: webhooks, bulk ops, ShopifyQL, scopes | shopify.dev vía MCP | ✅ Sí |
| Shopify: `OrderSortKeys`, tipos | schema GraphQL real, consultado en vivo | ✅ Sí, del schema mismo |
| Mercado Libre: OAuth, notificaciones, órdenes | global-selling.mercadolibre.com/devsite | ✅ Sí — pero es la variante **Global Selling / CBT** |
| Mercado Libre: vendedor **local** (MLA/MLU) | — | ❌ **No verificado.** `developers.mercadolibre.com.ar` bloquea el acceso automatizado (HTTP 403) |
| Meta Ads: endpoints de Insights, `ads_read` | developers.facebook.com (§2bis) | ✅ Sí — **corregido**, la primera versión salía de blogs |
| Meta Ads: System User token | developers.facebook.com/docs/business-management-apis/system-users | ✅ Sí — *"Tokens sin vencimiento: nunca vence"* |
| Meta Ads: sin app review para cuentas propias | developers.facebook.com/docs/marketing-api/access | ✅ Sí — *"Si tu app solo administra tu cuenta publicitaria, el acceso estándar [...] es suficiente"* |
| Vercel: límites de cron y plan Hobby | vercel.com/docs/cron-jobs/usage-and-pricing | ✅ Sí — Hobby: 1 vez/día, precisión ±59 min |
| Supabase: pg_cron / pg_net | supabase.com/docs + prueba en vivo (HTTP 200) | ✅ Sí |
| API de tipo de cambio (fawazahmed0) | probada en vivo, incluso con fechas históricas | ✅ Sí |
| MeLi: nombres de los parámetros de `/orders/search` | tabla oficial de Global Selling | ⚠️ **La tabla se contradice**: `order.status` con prefijo, `date_created.from` sin él. Centralizados en `PARAM` dentro de `lib/sync/meli.ts` |

Lo marcado con ⚠️ no invalida las decisiones (todas las fuentes coinciden en el
sentido general), pero conviene confirmarlo antes de escribir código. Lo marcado
con ❌ sí hay que resolverlo: se hace en 5 minutos con un token real.

---

## 1. Shopify

### 1.1 Registrar webhooks — `webhookSubscriptionCreate`

Forma exacta (API 2026-07+):

```graphql
mutation webhookSubscriptionCreate(
  $topic: WebhookSubscriptionTopic!
  $webhookSubscription: WebhookSubscriptionInput!
) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription { id topic filter uri includeFields }
    userErrors { field message }
  }
}
```

```json
{
  "topic": "ORDERS_CREATE",
  "webhookSubscription": {
    "uri": "https://SU-PANEL.vercel.app/api/webhooks/shopify",
    "includeFields": ["id", "updated_at", "total_price", "currency"]
  }
}
```

Campos de `WebhookSubscriptionInput` que importan:

- **`uri`** — HTTPS, o `pubsub://` / EventBridge ARN.
- **`includeFields`** — lista blanca de campos. Si es `null` viene todo.
  **Usarlo**: payload más chico = handler más rápido = menos riesgo de timeout.
- **`filter`** — search syntax, para no recibir eventos que no interesan.
- **`format`** — JSON.
- **`apiVersion`** — se hereda de la app que creó la suscripción.

Existen `webhookSubscriptionUpdate` (cambia config sin recrear, atómico y sin
cortar entregas) y `webhookSubscriptionDelete`.

> **Replicabilidad:** `webhookSubscriptionCreate` **no es idempotente**. Si el
> alumno corre el setup dos veces, quedan suscripciones duplicadas y cada pedido
> llega dos veces. El setup tiene que consultar `webhookSubscriptions` primero y
> hacer create/update/delete según corresponda. No es opcional.

### 1.2 Verificar la entrega

- Header `X-Shopify-Hmac-SHA256`, base64. HMAC-SHA256 del **body crudo** con el
  client secret. En Next.js hay que leer el body como texto (`await req.text()`),
  no como JSON — parsear antes rompe la firma.
- Dedupe por `X-Shopify-Webhook-Id` (índice único).
- Ordenar por `updated_at` del payload o `X-Shopify-Triggered-At`.
- Tras rotar el client secret, hasta **1 hora** de deliveries firmados con el viejo.

### 1.3 Reconciliación incremental

`OrderSortKeys` incluye **`UPDATED_AT`** (verificado contra el schema real).
La query de reconciliación:

```graphql
query($cursor: String) {
  orders(
    first: 100
    after: $cursor
    sortKey: UPDATED_AT
    query: "updated_at:>='2026-09-05T00:00:00Z'"
  ) {
    edges { cursor node { id updatedAt ... } }
    pageInfo { hasNextPage endCursor }
  }
}
```

La search syntax soporta comparadores (`updated_at:>='...'`, `<now`, `<=2024`).
Nota del propio Shopify: *"If your query is slow or returns an error, then try
specifying a sort key that matches the field used in the search"* — por eso
`sortKey: UPDATED_AT` va junto al filtro `updated_at`.

### 1.4 Backfill histórico — bulk operations

```graphql
mutation {
  bulkOperationRunQuery(query: """
    { orders(query: "created_at:>=2025-09-05") { edges { node { id createdAt updatedAt ... } } } }
  """) {
    bulkOperation { id status }
    userErrors { field message }
  }
}
```

Restricciones exactas:

- La query **debe** incluir al menos una connection.
- Máximo **5 connections**, anidamiento máximo **2 niveles**.
- No se pueden usar los campos raíz `node` / `nodes`.
- Resultado en **JSONL**, en una `url` que **expira a los 7 días**.
- Desde **2026-01**: hasta **5 bulk queries concurrentes por tienda**.
- `currentBulkOperation` está **deprecado** → usar `bulkOperations(query: "status:RUNNING")`
  o `bulkOperation(id:)`.
- `groupObjects` por defecto `false` en 2026-01+; activarlo hace la operación más
  lenta y más propensa a timeout. Dejarlo apagado.

**El hallazgo que resuelve el timeout de Vercel:** existe el topic
`bulk_operations/finish`. Se suscribe con `webhookSubscriptionCreate` y Shopify
avisa cuando el backfill terminó. No hace falta poletear ni mantener viva una
función serverless — se dispara, se corta, y cuando llega el webhook se baja el
JSONL. Encaja perfecto con Vercel.

### 1.5 Tráfico — ShopifyQL

Sintaxis verificada:

```
FROM sessions
SHOW sessions, conversion_rate
TIMESERIES day
SINCE startOfDay(-30d) UNTIL endOfDay(-1d)
ORDER BY day ASC
```

`startOfDay()` / `endOfDay()` recortan a días completos y **excluyen el parcial
de hoy** — importante para no guardar un día incompleto como si fuera final.
Se ejecuta vía `shopifyqlQuery`, scope `read_reports`. No hay webhook: polling.

### 1.6 Scopes

`read_orders` (últimos 60 días) · `read_products` · `read_reports`.
`read_all_orders` para histórico completo — **scope protegido**, requiere pedido
con justificación. **⚠️ a confirmar** si se concede a una app que el propio
merchant instala en su tienda desde el Dev Dashboard.

---

## 2. Mercado Libre

### 2.1 OAuth — el flujo exacto

**Paso 1 — autorización** (redirigir al alumno):

```
https://auth.mercadolibre.com.ar/authorization
  ?response_type=code
  &client_id=$APP_ID
  &redirect_uri=$YOUR_URL
```

(Global Selling usa `https://global-selling.mercadolibre.com/authorization`.
El host de auth cambia por país: `.com.ar`, `.com.uy`, `.com.br`…)

PKCE es **opcional**: `code_challenge` + `code_challenge_method` (`S256`).
El `redirect_uri` **tiene que coincidir exacto** con el registrado en la app, y
*"the URL cannot contain variable information"*.

**Paso 2 — canjear el code:**

```bash
curl -X POST \
  -H 'accept: application/json' \
  -H 'content-type: application/x-www-form-urlencoded' \
  'https://api.mercadolibre.com/oauth/token' \
  -d 'grant_type=authorization_code' \
  -d 'client_id=$APP_ID' \
  -d 'client_secret=$SECRET_KEY' \
  -d 'code=$CODE' \
  -d 'redirect_uri=$REDIRECT_URI' \
  -d 'code_verifier=$CODE_VERIFIER'
```

Respuesta:

```json
{
  "access_token": "APP_USR-...",
  "token_type": "bearer",
  "expires_in": 10800,
  "scope": "offline_access read write",
  "user_id": 1234567,
  "refresh_token": "TG-..."
}
```

> ⚠️ La doc oficial se contradice: el texto dice *"valid for 6 hours"* pero el
> ejemplo devuelve `expires_in: 10800` (3 h). **Leer siempre `expires_in` de la
> respuesta, nunca hardcodear el número.**

**Paso 3 — refresh:**

```bash
curl -X POST 'https://api.mercadolibre.com/oauth/token' \
  -d 'grant_type=refresh_token' \
  -d 'client_id=$APP_ID' \
  -d 'client_secret=$SECRET_KEY' \
  -d 'refresh_token=$REFRESH_TOKEN'
```

Reglas textuales, y son minas antipersonales:

> - We only allow using the **last REFRESH_TOKEN** generated for the exchange.
> - The REFRESH_TOKEN **can only be used once** and only by the client_id it is
>   associated with, **after being used it will become invalid**.
> - We suggest you renew your access token **only when it expires**.

El refresh token dura ~6 meses y **rota en cada uso**.

> **Replicabilidad — el riesgo más serio de todo el sistema:** si dos procesos
> refrescan a la vez (el cron y el handler de webhook, o dos ejecuciones del cron
> solapadas), el segundo usa un refresh token ya quemado y **la conexión del
> alumno muere**. Tiene que haber **un solo escritor** con lock en la base
> (`SELECT ... FOR UPDATE` o advisory lock de Postgres) y refresco solo por
> expiración, nunca preventivo desde varios lugares. En una instalación
> individual esto casi no se nota; multiplicado por 50 alumnos, alguien lo rompe.

### 2.2 Notificaciones — el problema de los 500 ms

Se configuran en el devcenter de MeLi: **Callback URL** (HTTPS) + selección de
**topics**. No se registran por API como en Shopify.

Payload (es solo un aviso, **no trae los datos**):

```json
{
  "id": "5e2827f2-99b7-474e-b68b-6a86e934cc7e",
  "resource": "/orders/2000003456789012",
  "user_id": 123456789,
  "topic": "orders_v2",
  "actions": ["created"],
  "application_id": 89745685555,
  "attempts": 1,
  "sent": "2026-10-09T13:44:33.006Z",
  "received": "2026-10-09T13:44:32.984Z"
}
```

Hay que hacer un GET al `resource` para tener el pedido.

La regla que cambia el diseño, textual:

> Update your integration to return an **HTTP 200 within 500 milliseconds** of
> receiving the notification and prevent us from **disabling your notification
> topics**. Otherwise, you will have to subscribe to the topics again.

Además:

- Reintentos a intervalos exponenciales durante **1 hora**; después se descartan.
- Zona horaria **UTC**.
- MeLi notifica desde una **lista fija de IPs** (útil si se filtra).
- Red de seguridad oficial:
  `GET https://api.mercadolibre.com/missed_feeds?app_id=$APP_ID[&topic=$TOPIC]`
  devuelve las notificaciones perdidas (10 por defecto, con `limit`/`offset`).

**Topics relevantes:** `orders_v2` / *marketplace orders* (ventas confirmadas),
`items`, `shipments`, `questions`, `messages`, `claims`.

> **Replicabilidad — recomendación fuerte:** 500 ms es incompatible con un cold
> start de una función serverless en Vercel. Si el alumno tiene poco tráfico —
> que es el caso — sus funciones están frías casi siempre, MeLi le **desactiva
> los topics en silencio**, y para arreglarlo hay que volver al devcenter a
> resuscribirse a mano. Es exactamente el tipo de falla que rompe un producto
> replicable.
>
> Como el payload no trae datos igual (siempre hay que hacer el GET) y existe
> `missed_feeds`, **MeLi conviene resolverlo con polling puro**:
> `/orders/search` filtrando por `last_updated.from` cada X minutos. Se pierde
> latencia (minutos en vez de segundos) y se gana algo que no se rompe solo.
> Si más adelante se quiere el webhook, que sea una optimización opcional sobre
> una base que ya funciona sin él.

### 2.3 Pedidos — endpoints y parámetros

Un pedido:

```bash
curl -H 'Authorization: Bearer $ACCESS_TOKEN' \
  https://api.mercadolibre.com/orders/$ORDER_ID
```

Campos que importan para el panel: `id`, `status` (`paid`, `cancelled`,
`payment_required`), `date_created`, `date_closed`, `total_amount`,
`currency_id`, `order_items[]` (`item.id`, `title`, `quantity`, `unit_price`,
`discounts`, `gross_price`), `payments[]` (`transaction_amount`, `status`),
`buyer.id`, `tags[]`.

Búsqueda con filtros — **parámetros verificados**:

| Parámetro | Para qué |
|---|---|
| `seller.id` | pedidos de un vendedor |
| `order.status` | `paid`, `cancelled`, `payment_required` |
| `site` | `MLA`, `MLU`, `MLM`, `MLB`, `MLC` |
| **`last_updated.from` / `.to`** | **la clave de la reconciliación incremental** |
| `date_created.from` / `.to` | backfill histórico por ventanas |
| `date_closed.from` / `.to` | por fecha de cierre |
| `limit` | máx **50** en la búsqueda con filtros |
| `offset` | paginación |

`last_updated.from` es el equivalente exacto de `updated_at:>=` de Shopify: el
mismo patrón de reconciliación sirve para los dos canales.

> ⚠️ **A confirmar:** la doc que pude leer es la de **Global Selling / CBT**
> (`/marketplace/orders/search`). Para un vendedor **local** (MLA, MLU) el
> recurso es `/orders/search?seller=$SELLER_ID`. No pude verificarlo contra la
> página oficial porque `developers.mercadolibre.com.ar` bloquea el acceso
> automatizado (HTTP 403). Se resuelve en 5 minutos con un token real.
>
> ⚠️ **A confirmar también:** el tope de `offset` (históricamente `offset+limit`
> no puede pasar de 1000) y el modo `search_type=scan` con `scroll_id` para
> exportar volúmenes grandes. En la respuesta de ejemplo aparece un `scroll_id`,
> así que el modo scan existe. Importa para el backfill de un vendedor con miles
> de ventas.

### 2.4 Réplica: cada alumno necesita su propia app de MeLi

No es una decisión de diseño, es una consecuencia: el `redirect_uri` debe
coincidir exacto con el registrado y no admite información variable. Como cada
alumno tiene una URL de Vercel distinta, **no se puede compartir una sola app de
MeLi entre todos**. Cada uno crea la suya en el devcenter y pega `APP_ID` +
`SECRET_KEY`. Hay que documentarlo con capturas, no se puede automatizar.

---

## 2bis. Meta Ads — fuente oficial

De `developers.facebook.com/docs/marketing-api/insights` (actualizado 27-abr-2026).

**Requisitos, textual:** una app, y el permiso **`ads_read`**. Nada más.

**Endpoints** — `insights` es un edge de cada objeto de anuncio:

| Recurso | Devuelve |
|---|---|
| `/{ad-account-id}/insights` | estadísticas de la cuenta publicitaria |
| `/{campaign-id}/insights` | estadísticas de una campaña |
| `/{ad-set-id}/insights` | de un conjunto de anuncios |
| `/{ad-id}/insights` | de un anuncio |

```bash
curl -G \
  -d "date_preset=last_7d" \
  -d "fields=clicks" \
  -d "breakdowns=gender" \
  -d "access_token=<ACCESS_TOKEN>" \
  "https://graph.facebook.com/v26.0/<CAMPAIGN_ID>/insights"
```

Respuesta: `data[]` con `account_id`, `campaign_id`, `date_start`, `date_stop`,
`impressions`, `spend`, más los `fields` que pidas. Paginación por cursores.

Por defecto un `GET` devuelve métricas básicas de **los últimos 30 días**. La
request se arma con tres piezas: **parámetros** (rango de fechas, ventana de
atribución), **campos** (las métricas) y **desgloses** (`breakdowns`).

Para el panel alcanza con `/{ad-account-id}/insights` + `time_increment=1` para
tener una fila por día, y una segunda llamada a nivel campaña.

> ⚠️ Lo del **System User token** y lo de "no hace falta app review para cuentas
> propias" sale de fuentes de terceros, no de la doc oficial. Coincide con cómo
> funciona el modo de desarrollo de Meta, pero hay que confirmarlo antes de
> documentárselo al alumno.

---

## 3. Comparación de los dos canales

| | Shopify | Mercado Libre |
|---|---|---|
| Registrar webhooks | por API (`webhookSubscriptionCreate`) | a mano en el devcenter |
| Payload del webhook | trae los datos | solo un aviso, hay que hacer GET |
| SLA de respuesta | 200 rápido, sin número duro | **200 en 500 ms o te desactivan** |
| Verificación | HMAC-SHA256 del body crudo | lista de IPs |
| Recuperar perdidas | reconciliación por `updated_at` | `/missed_feeds` + `last_updated.from` |
| Filtro incremental | `updated_at:>=` + `sortKey: UPDATED_AT` | `last_updated.from` |
| Backfill | bulk operations (JSONL, asíncrono) | paginado por ventanas de fecha |
| Token | fijo, no expira | **rota, single-use, ~3–6 h** |
| App compartible entre alumnos | no (cada uno la suya) | no (redirect_uri fijo) |

---

## 3bis. El embudo: visitas → carrito → pagos iniciados → ventas

**Buena noticia: esto ya está hecho casi entero.**

### Shopify lo da nativo, en una sola query

Ejemplo textual de la doc de ShopifyQL:

```
FROM sessions
SHOW sessions, online_store_visitors, sessions_with_cart_additions,
     sessions_that_reached_checkout, sessions_that_completed_checkout, conversion_rate
WHERE human_or_bot_session = 'human'
TIMESERIES day
SINCE startOfDay(-30d) UNTIL endOfDay(-1d)
ORDER BY day ASC
```

El `WHERE human_or_bot_session = 'human'` **filtra bots**. Sin eso el tope del
embudo viene inflado y toda la conversión da mal. Detalle chico, consecuencia grande.

### Las columnas ya existen en la base

`daily_traffic` (migración `0001_schema.sql`) ya tiene el embudo completo, y el
mapeo con ShopifyQL es uno a uno:

| ShopifyQL | Columna que ya existe | Paso del embudo |
|---|---|---|
| `online_store_visitors` | `visitors` | — |
| `sessions` | `sessions` | **Visitas** |
| `sessions_with_cart_additions` | `sessions_with_cart` | **Agregados al carrito** |
| `sessions_that_reached_checkout` | `sessions_reached_checkout` | **Pagos iniciados** |
| `sessions_that_completed_checkout` | `sessions_completed_checkout` | **Ventas** |
| `conversion_rate` | `conversion_rate` | conversión total |

Además ya pasan por la vista `daily_metrics` (`0002`), `period_totals` los expone
(`0004`, como `checkouts`), y están tipadas en `lib/types.ts`.

**Lo único que falta es la pantalla del embudo** y las tasas paso a paso
(carrito/visitas, checkout/carrito, venta/checkout). Cero tablas nuevas, cero
llamadas nuevas a la API. Es una feature de UI, no de datos.

### Mercado Libre no tiene embudo

Solo da **visitas**, y por ítem:

```bash
curl -H 'Authorization: Bearer $ACCESS_TOKEN' \
  'https://api.mercadolibre.com/items/visits?ids=$ITEM_ID&date_from=$FROM&date_to=$TO'
```

También hay visitas por usuario y por ventana de tiempo
(`/items/$ITEM_ID/visits/time_window`). Pero **no existe "agregado al carrito" ni
"pago iniciado"**: el checkout de MeLi es de MeLi, no del vendedor.

**Consecuencia de diseño:** el embudo completo es de **Shopify solamente**. De
MeLi se pueden sumar visitas y ventas, pero los dos pasos del medio quedan
vacíos, y mezclarlos en un solo embudo daría un número falso.

Lo honesto — y además lo más simple — es **el embudo con selector de canal**,
arrancando por Shopify. Coincide con la regla que el repo ya tiene: *un dato
ausente se muestra como "—", nunca como cero.*

---

## 3ter. Alcance mínimo — lo que hace falta y nada más

Anotado porque esto se agranda solo. Lo que **no** hay que construir:

| No hacer | Por qué |
|---|---|
| Webhooks de Mercado Libre | El SLA de 500 ms se rompe con cold starts. Polling con `last_updated.from` + `/missed_feeds` alcanza y no se rompe. |
| Cola de eventos con reintentos elaborados | La reconciliación por `updated_at` ya es la red de seguridad. Una tabla de dedupe y listo. |
| Recalcular el embudo | Ya está en `daily_traffic`. Solo falta la pantalla. |
| Mercado Pago | No es canal de venta. Fuera de alcance salvo pedido explícito. |
| Railway, colas externas, workers | `pg_cron` + una route de Vercel cubren todo. |
| Multi-tenancy, tabla `shops`, cifrado de tokens | Una instalación = un alumno = una tienda. |

Lo que sí hace falta, en orden:

1. Tabla `orders` cruda multi-canal + `daily_sales` derivada.
2. Route `/api/webhooks/shopify` con HMAC y dedupe.
3. Route `/api/cron/sync` disparada por `pg_cron`: reconcilia Shopify por
   `updated_at` y MeLi por `last_updated.from`, trae ShopifyQL y Meta Insights.
4. OAuth de MeLi (botón + callback + refresh con lock).
5. Backfill con bulk operations + `bulk_operations/finish`.
6. Pantalla del embudo.

---

## 4. ¿Sirven los MCP de Shopify y Meta que tenemos conectados?

Los probé en esta sesión, no es teoría.

- `mcp__claude_ai_Shopify__get-shop-info` devolvió una tienda real: nombre,
  dominio, plan, país y moneda.
- `mcp__claude_ai_Meta__ads_get_ad_accounts` devolvió nueve cuentas
  publicitarias reales, con su moneda y su estado.

**Los dos funcionan — y los dos están atados a las cuentas de Lucas, vía la
autorización de claude.ai.**

### En el sistema replicado (runtime): **no sirven**

Tres razones independientes, cualquiera alcanza:

1. **Dónde corren.** Un MCP vive dentro de una sesión de Claude. Una función
   serverless de Vercel o un job de `pg_cron` no tienen cómo invocarlo.
2. **De quién son.** Están autenticados contra las cuentas de quien autorizó el
   conector en claude.ai. El alumno no hereda eso, y no queremos que lo herede.
3. **No son estables.** El propio Meta MCP devuelve
   `is_ads_mcp_enabled: false` en una de las cuentas, con el motivo
   *"Ads MCP is gradually being rolled out"*. Una dependencia de runtime no
   puede estar en rollout gradual.

### Construyendo el sistema (nosotros): **sirven mucho**

Es donde hay que usarlos, y es un ahorro real:

| Herramienta | Para qué |
|---|---|
| `search_docs_chunks` | doc oficial de Shopify sin scrapear — es la fuente de casi todo este documento |
| `graphql_schema` | confirmar tipos y enums contra el schema real (así verifiqué `UPDATED_AT` en `OrderSortKeys`) |
| `validate_graphql_codeblocks` | validar cada query **antes** de que llegue al repo del alumno |
| `graphql_query` / `run-analytics-query` | probar las queries y el ShopifyQL contra una tienda de verdad |
| `ads_*` de Meta | fijar la forma exacta de la respuesta de Insights antes de escribir el parser |

Traducido: **el MCP es nuestro banco de pruebas, no el motor del producto.**
Toda query que se meta en el repo tendría que pasar antes por
`validate_graphql_codeblocks` y por una corrida real contra una tienda.

### En el curso: como reparación, no como camino principal

El `/sync` actual por MCP sigue teniendo valor como herramienta manual de
arreglo cuando algo se desincroniza. Pero no puede ser el mecanismo normal:
volvería a exigirle a cada alumno tener Claude Code y sus MCP conectados, que es
justo lo que se está sacando del medio.

---

## 5. Verificaciones — resueltas el 2026-09-05

### ✅ `read_all_orders` NO hace falta

El límite de 60 días es del **objeto `Order`**, no de ShopifyQL. Textual de la
doc del objeto Order:

> Only the last 60 days' worth of orders from a store are accessible from the
> `Order` object by default.

Como el motor de sync usa **ShopifyQL** (`FROM sales`) y nunca toca `Order`, el
límite no aplica. Comprobado en vivo contra la tienda real: una consulta
`SINCE 2023-01-01 UNTIL 2026-09-05 TIMESERIES month` devolvió **45 filas
mensuales sin error ni truncado**. (La tienda no tiene ventas, así que los
valores son 0 — pero el rango se aceptó entero, que es lo que se estaba
probando. Confirmar con una tienda con histórico real en la primera corrida.)

**Por qué importa para el curso:** pedir `read_all_orders` obliga a *"From the
Partner Dashboard → API access → Request access → describe your app and why
you're applying"*, con aprobación manual de Shopify **por cada app**. Con un
alumno por app, eso era un trámite por alumno. **Se evita entero.**

Scopes finales: `read_reports` (para `shopifyqlQuery`) + `read_orders` (para el
webhook disparador). Nada protegido.

### ✅ *Protected customer data* tampoco aplica

Se leen `customers`, `new_customers` y `returning_customers` como **agregados**
de ShopifyQL, no registros de clientes. La doc excluye explícitamente lo que no
refiere a un cliente único: *"Types and resources that don't refer to a single
customer [...] aren't included."*

### ✅ El campo de gasto de Meta es `spend`

Confirmado en la doc oficial de Insights (ejemplo de respuesta y
best-practices): `fields=impressions,spend,ad_id,adset_id&level=ad`.
`amount_spent` es el campo del objeto *ad account*, no de Insights — el MCP usa
ese, la Graph API usa `spend`. **No copiar el nombre del MCP.**

### ⚠️ MeLi vendedor local — sigue sin poder verificarse

`api.mercadolibre.com` devuelve `403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES`
(`blocked_by: PolicyAgent`) a **todo** desde acá: con y sin token, con distintos
User-Agent, e incluso en `/sites/MLU`, que es público y sin auth. O sea, es un
**bloqueo por IP del entorno**, no una respuesta sobre el endpoint. No se puede
distinguir "el endpoint no existe" de "no me dejan entrar".

Quedan dos cosas abiertas, y **las dos se resuelven en el primer deploy**:

1. Que el recurso del vendedor local sea `/orders/search?seller=$SELLER_ID` (lo
   verificado es la variante Global Selling, `/marketplace/orders/search`).
2. **Que MeLi no bloquee las IP de Vercel.** Si el PolicyAgent filtra
   datacenters, el diseño de polling desde Vercel se cae. Es poco probable —
   hay muchas integraciones de MeLi corriendo en AWS — pero es lo primero que
   hay que probar al desplegar, antes de construir nada más sobre MeLi.

### Sin resolver, no bloqueantes

- Tope de `offset` y modo `search_type=scan` en MeLi (importa para el backfill
  de un vendedor con miles de ventas).
- Si `orders_v2` acepta subtopics (`created`/`updated`) por separado. Irrelevante
  mientras MeLi vaya por polling.

---

## Fuentes

**Shopify**
- https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/webhookSubscriptionCreate
- https://shopify.dev/docs/api/admin-graphql/2026-07/objects/WebhookSubscription
- https://shopify.dev/docs/api/admin-graphql/2026-07/enums/OrderSortKeys
- https://shopify.dev/docs/api/usage/bulk-operations/queries
- https://shopify.dev/docs/api/shopifyql/2026-07/syntax/since-until-during
- https://shopify.dev/docs/apps/build/webhooks/verify-deliveries

**Mercado Libre**
- https://global-selling.mercadolibre.com/devsite/authentication-and-authorization-global-selling
- https://global-selling.mercadolibre.com/devsite/receive-notifications
- https://global-selling.mercadolibre.com/devsite/manage-orders-cbt
- https://global-selling.mercadolibre.com/devsite/visits

**Meta**
- https://developers.facebook.com/docs/marketing-api/insights

**ShopifyQL (embudo)**
- https://shopify.dev/docs/api/shopifyql/2026-07/schemas/sessions_and_behavior/sessions
