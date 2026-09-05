# Plan — Sync automático multi-canal + embudo

## Contexto

Hoy los datos entran de una sola forma: una persona escribe `/sync` en Claude
Code, con los MCP de Shopify, Meta y Supabase conectados, y Claude copia los
datos a mano (`.claude/skills/sync-dashboard/SKILL.md`). Funciona, pero es
incompatible con lo que este repo tiene que ser: un componente pre-hecho que se
entrega en un curso, que cada alumno despliega en **sus** cuentas y que se
actualiza solo, sin que nadie sepa qué es Claude Code.

El cambio: mover ese motor de sincronización al repo, en TypeScript, disparado
por `pg_cron` desde el Supabase del alumno contra una route de su Vercel. Además
se suma **Mercado Libre como segundo canal de venta** y una pantalla de
**embudo** (visitas → agregados al carrito → pagos iniciados → ventas).

Investigación previa, con fuentes y citas:
`docs/investigacion/realtime-shopify.md` y `docs/investigacion/referencia-tecnica.md`.

### Las cinco decisiones que definen este plan

**1. ShopifyQL sigue siendo la única fuente de los números de Shopify.** El cron
corre las mismas tres consultas que hoy corre `/sync`. El webhook `orders/create`
se usa **solo como disparador** ("el día de hoy quedó sucio, resincronizá"),
nunca como fuente de datos. Si calculáramos `net_sales` desde pedidos crudos
empezaríamos a diferir del admin de Shopify, que es justo lo que prohíbe la
regla 1 de `AGENTS.md`. Efecto colateral: no hacen falta bulk operations
(ShopifyQL devuelve ~365 filas para un año entero), ni tabla de pedidos crudos
de Shopify, ni deduplicación de webhooks.

**2. Mercado Libre va por polling, sin webhooks.** MeLi exige responder 200 en
**500 ms** o desactiva los topics en silencio, y eso no sobrevive a un cold start
de serverless. Su payload no trae datos igual (siempre hay que hacer un GET), y
existe `/missed_feeds` como red. Polling con `last_updated.from` alcanza.

**3. El gasto de Meta no se atribuye por canal.** Un anuncio puede empujar venta
en Shopify y en MeLi. Partir el gasto sería inventar. Entonces: las ventas se
guardan por canal, pero **CAC, ROAS, MER y contribución se calculan siempre
sobre el total de canales**. El selector de canal afecta ventas y productos, no
las métricas cruzadas.

**4. El embudo es de Shopify solamente.** MeLi da visitas por ítem pero no tiene
"agregado al carrito" ni "pago iniciado" — su checkout es suyo. Mezclarlos daría
un número falso. La pantalla lo dice explícitamente.

**5. Esto rompe una regla del repo, a propósito.** `AGENTS.md` dice que el panel
es de solo lectura y que un cambio así "planteálo antes de codearlo". Acá está
planteado: el servidor pasa a escribir en la base con la service key. **El
navegador sigue sin poder escribir nada** — no se toca ninguna policy de RLS de
lectura, no se agrega ninguna policy de insert/update. La regla se reescribe
como: *el navegador nunca escribe; el servidor sí, con la service key, y nunca
desde una acción del usuario.*

---

## Fase 0 — Documentar el cambio de arquitectura

**Archivos:** `AGENTS.md`, `README.md`, `docs/investigacion/plan-realtime.md` (copiar este plan al repo).

- Reescribir la regla 4 de `AGENTS.md` según la decisión 5.
- Actualizar el diagrama "Cómo se mueve el dato" (ya no hay `/sync`).
- Reescribir en `README.md` la decisión *"Shopify es la única verdad de ventas"*
  → ahora hay dos canales; Shopify sigue siendo la única verdad **de su propio
  canal**, y Meta sigue aportando solo gasto.

---

## Fase 1 — Motor de sincronización (`lib/sync/`)

Todo TypeScript, sin dependencias nuevas (`fetch` nativo). La lógica y los
mapeos se **portan literalmente** de `.claude/skills/sync-dashboard/SKILL.md`,
que ya tiene los nombres de columna verificados contra las APIs reales.

| Archivo nuevo | Qué hace |
|---|---|
| `lib/supabase/admin.ts` | Cliente con `SUPABASE_SERVICE_KEY`. Falla con mensaje claro si falta. Único lugar donde vive la service key. |
| `lib/sync/shopify.ts` | Cliente de `shopifyqlQuery` + las 3 consultas |
| `lib/sync/meta.ts` | `/{ad-account-id}/insights` y nivel campaña |
| `lib/sync/meli.ts` | OAuth, refresh con lock, `/orders/search`, agregación a filas diarias |
| `lib/sync/fx.ts` | Tipo de cambio histórico |
| `lib/sync/log.ts` | Escribe `sync_log` (tabla ya existente) |
| `lib/sync/config.ts` | Lee y valida env vars + `sync.config.json` |

### `lib/sync/shopify.ts`

`POST https://{shop}/admin/api/2026-07/graphql.json` con header
`X-Shopify-Access-Token`. Query verificada contra la doc:

```graphql
query($q: String!) {
  shopifyqlQuery(query: $q) {
    tableData { columns { name dataType } rows }
    parseErrors
  }
}
```

**`parseErrors` no vacío tiene que abortar y escribir en `sync_log`**: la
respuesta viene con `tableData: null` y HTTP 200, así que un `try/catch` no lo
detecta.

Las tres consultas, portadas del SKILL.md:

```
FROM sales SHOW orders, gross_sales, discounts, sales_reversals, net_sales,
  shipping_charges, taxes, total_sales, average_order_value, customers,
  new_customers, returning_customers
TIMESERIES day SINCE {desde} UNTIL {hasta}
```

```
FROM sessions SHOW sessions, online_store_visitors, sessions_with_cart_additions,
  sessions_that_reached_checkout, sessions_that_completed_checkout, conversion_rate
WHERE human_or_bot_session = 'human'
TIMESERIES day SINCE {desde} UNTIL {hasta}
```

```
FROM sales SHOW gross_sales, net_sales, orders, net_items_sold
GROUP BY product_title, product_id
SINCE {desde} UNTIL {hasta}
```

> **Cambio respecto de hoy:** se agrega `WHERE human_or_bot_session = 'human'`.
> Sin eso el tope del embudo viene inflado por bots y toda la conversión da mal.
> Consecuencia: los números de tráfico van a bajar respecto de los ya cargados.
> Hay que resincronizar el histórico de `daily_traffic`, no dejarlo mezclado.

Se conservan tal cual las reglas ya documentadas: `""` → `NULL` (nunca `0`) en
`average_order_value` y `conversion_rate`; se descartan filas de producto con
`product_id` vacío (son el total del día).

### `lib/sync/meta.ts`

```
GET https://graph.facebook.com/v26.0/{ad-account-id}/insights
  ?time_range={"since":"...","until":"..."}
  &time_increment=1
  &fields=spend,impressions,clicks,reach,frequency,ctr,cpc,cpm
```

Segunda llamada con `level=campaign` y `campaign_id,campaign_name`. Paginación
por cursores (`paging.next`).

> **Ojo con el nombre del campo.** El MCP usa `amount_spent`; la Graph API
> devuelve **`spend`** (confirmado en el ejemplo de respuesta oficial). Verificar
> contra la cuenta real antes de dar por buena la primera corrida.

Si falta `META_ACCESS_TOKEN`, se escribe `sync_log` con `status='skipped'` y se
sigue con el resto — mismo comportamiento que hoy tiene `/sync`.

### `lib/sync/meli.ts`

- **Refresh con lock.** El `refresh_token` de MeLi es de un solo uso y rota: dos
  procesos refrescando a la vez matan la conexión del alumno. Envolver el
  refresh en `pg_advisory_xact_lock(hashtext('meli_refresh'))` y refrescar
  **solo cuando `expires_at` ya pasó**, nunca preventivamente.
- Leer `expires_in` de la respuesta, **nunca hardcodear** 3 h ni 6 h (la doc
  oficial se contradice a sí misma).
- Reconciliación: `GET /orders/search?seller={id}&last_updated.from={iso}`,
  `limit=50`, paginando por `offset`.
- Backfill: ventanas por `date_created.from`/`.to`, avanzando un cursor.
- Agregación en TypeScript a filas diarias: por `date_created`, `status='paid'`
  suma a `gross_sales`/`orders`, `cancelled` resta. Se escribe con `canal='meli'`.

### `lib/sync/fx.ts`

Se porta tal cual: detecta fechas faltantes en `fx_rates` y pide
`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{YYYY-MM-DD}/v1/currencies/{base}.json`.
Si falla un día, **se deja sin tasa**. Nunca se usa la tasa de hoy para ayer.

---

## Fase 2 — Migraciones

Migraciones nuevas y numeradas; las aplicadas no se editan.

### `0008_multicanal.sql`

```sql
alter table daily_sales    add column canal text not null default 'shopify'
  check (canal in ('shopify','meli'));
alter table daily_products add column canal text not null default 'shopify'
  check (canal in ('shopify','meli'));
-- PKs: (date) → (date, canal); (date, product_id) → (date, canal, product_id)
```

`daily_traffic` **no** cambia: el embudo es de Shopify y no hay dato de MeLi que
poner ahí. Cuando haga falta se agrega en su propia migración.

Vista nueva `daily_sales_total` — suma los canales de un día a la moneda de la
tienda, reusando **exactamente** el patrón de conversión que ya tiene
`daily_metrics`: si la moneda coincide suma directo, si hay tasa convierte, y si
falta la tasa devuelve `NULL` para ese día.

`daily_metrics` se recrea cambiando su join de `daily_sales` a
`daily_sales_total`. **El resto de la vista no se toca**, y por lo tanto
`period_totals` sigue andando sin cambios de firma.

Función nueva `channel_totals(desde date, hasta date)` → una fila por canal con
`orders, gross_sales, net_sales, total_sales, aov`. Alimenta el selector de canal.

`product_totals` se recrea con parámetro `canal text default null` (null = todos).

`sync_log`: el check de `source` pasa a `('shopify','meta','fx','meli')`.

### `0009_embudo.sql`

```sql
create function funnel_totals(desde date, hasta date) returns table (
  visitas bigint, carritos bigint, checkouts_iniciados bigint, ventas bigint,
  tasa_carrito numeric, tasa_checkout numeric, tasa_venta numeric,
  conversion_total numeric
) language sql stable security invoker
```

Suma sobre `daily_traffic` y **recalcula las tasas sobre las sumas**, nunca
promedia tasas diarias — el mismo criterio que ya usa `period_totals` para el
CAC, y que su test SQL verifica explícitamente. Cada tasa es `NULL` si su
denominador es 0.

### `0010_estado_sync.sql`

- `sync_state(fuente text primary key, cursor_hasta date, cursor_offset int, actualizado_at timestamptz)`
- `conexiones(fuente text primary key, access_token text, refresh_token text, expires_at timestamptz, cuenta_id text, actualizado_at timestamptz)`

> **Ninguna de las dos tiene policy de select.** RLS queda activo y sin policies:
> el navegador, con anon key o autenticado, no puede leer tokens. Solo la service
> key (que bypassa RLS) las ve. Hay que agregar un caso a
> `scripts/verificar-nube.mjs` que confirme esto.

### `0011_cron.sql`

`create extension if not exists pg_cron; create extension if not exists pg_net;`

| Job | Cadencia | Qué hace |
|---|---|---|
| `sync-hoy` | `*/5 * * * *` | Shopify + MeLi, solo el día de hoy |
| `sync-reciente` | `17 * * * *` | últimos 7 días (pedidos que cambian tarde) |
| `sync-diario` | `0 4 * * *` | Meta + FX + últimos 30 días |
| `sync-backfill` | `*/10 * * * *` | un lote de histórico; se auto-desactiva al terminar |

Cada job es un `net.http_post` a `{APP_URL}/api/cron/sync?job=...` con header
`x-cron-secret`. La URL y el secreto salen de `settings` (no se hardcodean en la
migración, que es un archivo versionado en un repo público).

---

## Fase 3 — Rutas de API

### `app/api/cron/sync/route.ts`

- Compara `x-cron-secret` con `CRON_SECRET` en **tiempo constante**.
- Despacha por `?job=`. Cada job escribe su fila en `sync_log`.
- Devuelve 200 siempre que el disparo sea válido, con el detalle en el body: un
  fallo de una fuente no puede tumbar a las otras.
- `export const maxDuration = 60` y **una fuente por invocación**, para no
  chocar con el límite de funciones de Vercel.

### `app/api/webhooks/shopify/route.ts`

- `const raw = await req.text()` **antes** de parsear: parsear primero rompe el
  HMAC.
- Verifica `X-Shopify-Hmac-SHA256` (HMAC-SHA256 del body crudo con
  `SHOPIFY_API_SECRET`), comparación en tiempo constante.
- Marca el día como sucio en `sync_state` y devuelve `200`. **No escribe ninguna
  métrica.**
- No necesita dedupe: marcar dos veces el mismo día es idempotente.

### `app/api/meli/conectar/route.ts` y `app/api/meli/callback/route.ts`

Flujo OAuth de MeLi: redirect a `/authorization?response_type=code&client_id=…&redirect_uri=…`,
callback que canjea el code contra `POST https://api.mercadolibre.com/oauth/token`
y guarda `access_token`, `refresh_token`, `expires_at` (calculado con el
`expires_in` de la respuesta) y `user_id` en `conexiones`.

> El `redirect_uri` tiene que coincidir **exacto** con el registrado y no admite
> información variable. Como cada alumno tiene su propia URL de Vercel, **cada
> alumno necesita crear su propia app de MeLi**. No se puede compartir una.
> Va documentado con capturas; no es automatizable.

### Registro de webhooks de Shopify

Script `scripts/registrar-webhooks.mjs`, ejecutable con `npm run webhooks:registrar`.

> **`webhookSubscriptionCreate` no es idempotente.** Si el alumno lo corre dos
> veces le llegan los eventos duplicados. El script tiene que consultar
> `webhookSubscriptions` primero y hacer create / update / delete según el
> estado real. Este es el bug más fácil de introducir en todo el plan.

---

## Fase 4 — Frontend

Todo reusa los patrones que ya existen. Nada nuevo de infraestructura.

### Pantalla de embudo — `app/(dash)/embudo/page.tsx`

Server component con el mismo molde que `app/(dash)/page.tsx`: `searchParams`
→ `esPreset` → `resolveRange` (`lib/ranges.ts`) → `getEmbudo(rango)` nueva en
`lib/queries.ts` (`supabase.rpc('funnel_totals', …)`, igual que `getTotales`).

- 4 `<KpiCard/>` (`components/kpi-card.tsx`) con los pasos, `tipo="int"`.
- 3 tarjetas con las tasas paso a paso, `tipo="pct"`.
- Gráfico de embudo nuevo en `components/charts/embudo.tsx`, envuelto en
  `ChartFrame` como el resto, con `var(--chart-revenue)`.
- Entrada nueva en `SECCIONES` de `components/sidebar-nav.tsx` (icono de lucide),
  que ya propaga el `?r=` solo.
- Cartel fijo: **el embudo es de Shopify**. Si el canal seleccionado es MeLi,
  se muestra `SIN_DATO` con el motivo, usando el `motivoFalta` que `KpiCard` ya
  soporta.

### Selector de canal

`components/channel-select.tsx`, copia estructural de
`components/date-range-select.tsx`: `<select>` nativo, `router.push` preservando
los otros params. Viaja como `?ch=todos|shopify|meli`, mismo mecanismo que `?r=`.
Se monta en el header de `app/(dash)/layout.tsx`, al lado del de fechas.

Afecta a ventas y productos. **No afecta CAC/ROAS/MER** (decisión 3): esas
tarjetas se muestran siempre sobre el total, con una nota al pie que lo aclara.

### Realtime

`components/realtime-refresh.tsx` ya escucha `daily_sales` y `daily_ad_spend`.
Agregar `daily_traffic` al chain de `.on(...)` y sumarla a la publication en la
migración `0008`. El resto del componente (debounce de 800 ms,
`realtime.setAuth`) no se toca.

---

## Fase 5 — Variables de entorno, docs y limpieza

`.env.example` pasa a tener dos bloques bien separados:

```
# --- Público (navegador) ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# --- Privado (solo servidor, se cargan en Vercel) ---
SUPABASE_SERVICE_KEY=
SHOPIFY_SHOP_DOMAIN=
SHOPIFY_ADMIN_TOKEN=
SHOPIFY_API_SECRET=
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=
MELI_APP_ID=
MELI_SECRET_KEY=
CRON_SECRET=
APP_URL=
```

Docs nuevos, siguiendo la numeración que ya existe en `docs/`:
`08-app-shopify.md` (Dev Dashboard, 4 pantallas), `09-meta-ads.md`,
`10-mercado-libre.md` (crear la app propia + conectar), `11-encender-el-sync.md`
(env vars en Vercel + registrar webhooks + agendar los crons).

**Se borra `.claude/skills/sync-dashboard/` y `.claude/commands/sync.md`.** Su
reemplazo manual es `curl` a `/api/cron/sync?job=diario` con el secreto, o el
botón de "sincronizar ahora" si más adelante se agrega.

---

## Verificación

No se da nada por bueno sin correr esto y mirar la salida.

**Chequeos previos — hechos el 2026-09-05** (detalle en `referencia-tecnica.md` §5):

1. ✅ **`read_all_orders` no hace falta.** El límite de 60 días es del objeto
   `Order`, no de ShopifyQL. Verificado en vivo: `SINCE 2023-01-01` devolvió 45
   filas mensuales sin truncar. Se evita un trámite de aprobación de Shopify por
   alumno. Scopes finales: `read_reports` + `read_orders`.
2. ✅ **Protected customer data no aplica**: se leen agregados, no registros.
3. ✅ **El campo de Meta es `spend`**, no `amount_spent` (ese es del objeto ad
   account, que es lo que usa el MCP).
4. ⚠️ **MeLi sigue sin verificarse.** `api.mercadolibre.com` responde 403
   `PolicyAgent` a todo desde este entorno, incluso a endpoints públicos: es
   bloqueo por IP, no una respuesta sobre el endpoint. **Primera tarea del primer
   deploy: confirmar que Vercel puede llegar a MeLi**, antes de construir nada
   más sobre ese canal.

**Durante la implementación**, usando los MCP como banco de pruebas (no como
parte del producto):

- Toda consulta de ShopifyQL contra una tienda real con `run-analytics-query`,
  y las GraphQL por `validate_graphql_codeblocks`, **antes** de que entren al
  repo.
- Meta: `ads_get_ad_entities` para fijar la forma exacta de la respuesta.

**Al terminar cada fase:**

- `npm test` (vitest) y `npm run build`.
- Tests SQL por el MCP de Supabase, cada archivo en una sola llamada (son
  `begin … rollback`): los dos existentes más dos nuevos —
  `supabase/tests/funnel_totals.test.sql` (tasas sobre sumas, no promedio de
  tasas; denominador 0 → `NULL`) y
  `supabase/tests/multicanal.test.sql` (que `daily_sales_total` sume dos canales,
  y que dé `NULL` cuando falta la tasa de cambio).
- `npm run nube:verificar`, extendido para chequear las tablas y funciones nuevas
  y **que `conexiones` no sea legible con la anon key**.
- `npm run test:realtime` tras agregar `daily_traffic` a la publication.

**Prueba de punta a punta**, en este orden:

1. Cargar las env vars y correr `npm run webhooks:registrar`. Verificar con
   `webhookSubscriptions` que quedó **una** suscripción por topic. Correrlo de
   nuevo y verificar que sigue habiendo una sola.
2. Disparar `/api/cron/sync?job=diario` a mano con el secreto → mirar `sync_log`
   y las filas escritas.
3. `shopify app webhook trigger --topic=orders/create --address=…` (o una compra
   de prueba) → confirmar que el día queda marcado sucio y que el siguiente tick
   de `sync-hoy` lo refresca.
4. Con el panel abierto, confirmar que Realtime lo actualiza solo.
5. Abrir `/embudo` en el navegador y **contrastar los cuatro números contra
   Analytics del admin de Shopify**. Si no cierran, el bug está en el mapeo —
   nunca se ajusta la función SQL para que el número dé lindo.
6. Conectar MeLi, verificar que aparecen sus ventas con `canal='meli'` y que el
   selector de canal las separa bien.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `webhookSubscriptionCreate` duplicado | El script consulta antes de crear. Se prueba corriéndolo dos veces. |
| Refresh de MeLi concurrente mata la conexión | Advisory lock + refrescar solo por expiración. Aviso visible en el panel si la conexión murió, nunca fallo silencioso. |
| El filtro de bots cambia los números históricos | Resincronizar `daily_traffic` entero, no mezclar. Avisarlo en el changelog. |
| Vercel Hobby no permite uso comercial | Decirlo en el curso de entrada: una tienda real necesita Pro (US$20/mes). |
| Timeout de funciones en Vercel | Una fuente por invocación, backfill por lotes con cursor. |
| El proyecto free de Supabase se pausa | El cron cada 5 min lo mantiene despierto. Verificar que no se coma la cuota. |
| Secretos en un repo público | Nada de tokens ni URLs reales en archivos versionados. `0011_cron.sql` lee URL y secreto de `settings`. |
