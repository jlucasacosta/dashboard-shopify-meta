<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Dashboard Ecommerce — guía del proyecto

Panel que cruza las ventas de Shopify y Mercado Libre con la inversión de Meta
Ads y calcula CAC, ROAS, MER y contribución. Se sincroniza solo: `pg_cron`, en
el Supabase de quien lo instala, le pega cada 5 minutos a `/api/cron/sync`, y el
webhook de Shopify avisa en el momento cuando entra una venta.

El repo es una **base clonable por tienda**. Si para adaptarlo a otra tienda hay
que tocar código, eso es un bug del repo, no una tarea del usuario: lo que cambia
va en variables de entorno (ver `.env.example`).

Está escrito para gente que recién arranca. Comentarios, mensajes de error y
documentación van en español y explican el *por qué*, no el *qué*.

## Cuatro reglas que no se negocian

**1. Los cálculos viven en la base.** CAC, ROAS, MER, ticket promedio y
contribución se definen en la vista `daily_metrics` y en las funciones
`period_totals`, `campaign_totals` y `product_totals`. Ni el frontend ni vos
calculan métricas. Si un número no cierra con Shopify, el bug está en el mapeo
del sync — **nunca** ajustes `daily_metrics` para que el número dé lindo.

**2. Un dato que falta es NULL, jamás 0.** Shopify devuelve `""` (no `0`) cuando
no hubo pedidos ni sesiones, y `Number('')` es `0`: la conversión a número es
donde se cuela el cero falso. Hay que preguntar por la ausencia **antes** de
convertir (`aNumeroONull` en `lib/sync/shopify.ts`, `esAusente` en el embudo).

Lo mismo en SQL: una tasa con denominador 0 es NULL, no 0%. Y si a un canal le
falta el tipo de cambio del día, el total de ese día es NULL — no se suma "lo
que se puede", porque daría un número más chico que la realidad con cara de
estar completo.

El panel muestra "—" y avisa. Un dashboard que muestra un cero falso no falla
nunca y miente siempre.

**3. El panel es privado.** El login usa `shouldCreateUser: false`. Sin eso
cualquiera con un correo entra. No lo saques ni lo hagas configurable.

**4. El navegador nunca escribe. El servidor sí.** Ninguna tabla tiene policy de
insert ni de update para `anon` ni para `authenticated`: desde el navegador solo
se lee. Quien escribe es el servidor, con la service key, y únicamente desde
`lib/sync/` disparado por el cron o el webhook — nunca desde una acción del
usuario.

Tres tablas van más lejos y no tienen **ninguna** policy: `config_servidor`,
`conexiones` y `meli_compradores`. Guardan secretos y datos de personas, y solo
las ve la service key. Si alguna vez les agregás una policy de select, estás
publicando el token de Mercado Libre y el secreto del cron a cualquiera que abra
el panel.

Si te piden una pantalla que escriba en la base, eso sigue siendo un cambio de
arquitectura: planteálo antes de codearlo.

**5. El webhook es un timbre, no una fuente de datos.** `/api/webhooks/shopify`
verifica el HMAC, marca el día en `dias_sucios` y contesta 200. No escribe ni
una métrica. El cron después le vuelve a preguntar a ShopifyQL cómo quedó ese
día. Es lo que garantiza que los totales coincidan con el admin de Shopify, y
de paso hace que los reintentos y los webhooks duplicados sean inofensivos.

## Cómo se mueve el dato

```
pg_cron ──► /api/cron/sync ──► lib/sync/ ──► ShopifyQL, Mercado Libre, Meta
Shopify ──► /api/webhooks/shopify ──► dias_sucios ──┘        │
                                                             ▼
                                                    tablas crudas
                          daily_sales (date, canal)  daily_traffic
                          daily_products             daily_ad_spend
                          daily_ad_campaigns         fx_rates
                                                             │
                                                             ▼
                          daily_sales_total ──► daily_metrics ──► period_totals
                          (suma canales,        (un renglón        campaign_totals
                           convierte moneda)     por día)          product_totals
                                                                   channel_totals
                                                             │     funnel_totals
                                                             ▼
                                                    páginas (server
                                                    components) + realtime
```

El gasto de ads se cruza contra `daily_sales_total`, nunca contra `daily_sales`:
con dos canales, esa tabla tiene dos filas por día y el join duplicaría el gasto
de cada campaña.

`sync_log` es cómo el panel se entera de que algo se salteó. Si el sync no
escribe ahí, el usuario no se entera de que le faltan datos.

## Dónde está cada cosa

| Ruta | Qué hay |
|---|---|
| `lib/sync/` | **El motor.** `motor.ts` orquesta los cuatro trabajos; `shopify.ts`, `meta.ts`, `meli.ts` y `fx.ts` hablan con cada API; `firmas.ts` verifica HMAC. Leelo entero antes de tocar el sync. |
| `app/api/` | Los tres puntos de entrada: cron, webhook de Shopify y OAuth de Mercado Libre. |
| `docs/investigacion/` | Por qué el sistema es así, con las citas de la documentación oficial de cada plataforma. |
| `.claude/skills/vincular/` | El instalador guiado (`/vincular`). Conecta un servicio por vez y verifica cada uno. Nunca pide tokens por chat: prueba llamando a `disparar_sync()` por el MCP. |
| `supabase/migrations/` | Esquema. Una migración nueva y numerada por cambio; las aplicadas no se editan. |
| `supabase/tests/` | Tests SQL de las métricas. Si tocás `daily_metrics` o las funciones, se corren sí o sí. |
| `lib/queries.ts` | Todas las lecturas a Supabase. |
| `lib/supabase/{client,server,env}.ts` | Clientes de browser y de servidor, y validación de variables. |
| `lib/{format,ranges,auth}.ts` | Lógica pura, con tests al lado (`*.test.ts`). |
| `proxy.ts` | Middleware: refresca sesión y manda al login. La protección va acá, no por página. |
| `components/aviso-datos.tsx` | Los avisos de calidad de datos que lee `sync_log`. |
| `docs/` | Guías para el usuario, numeradas y en orden. |

## Comandos

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor. Entrá por `localhost`, **no** por `127.0.0.1`. |
| `npm test` | Tests unitarios (vitest). |
| `npm run test:realtime` | Realtime como usuario logueado — el caso real del panel. |
| `npm run usuario:crear -- mail@x.com` | Crea la cuenta con contraseña y deja el HTML de credenciales. |
| `npm run nube:verificar` | Chequea que el proyecto de Supabase esté completo. |
| `npm run config:cargar` | Guarda `app_url` y `cron_secret` en `config_servidor`, leyéndolos de `.env.local`. |
| `npm run shopify:probar` | Pide un token con ID + secreto y hace una consulta. Prueba la app antes de desplegar. |
| `npm run webhooks:registrar` | Registra los webhooks en Shopify. Idempotente. |
| `npm run tipos:filtrar` | Regenera `lib/types.ts` sin filtrar otras apps del proyecto. |

**No hay base de datos local ni CLI de Supabase.** Todo el SQL se ejecuta por el
MCP de Supabase, contra el proyecto en la nube: aplicar `supabase/migrations/`,
cargar `supabase/seed.sql`, correr los tests de `supabase/tests/` (cada archivo
en una sola llamada: son un `begin ... rollback`), o consultar cualquier tabla.

Ojo: un proyecto de Supabase puede alojar más de una aplicación. Los tipos
generados traen el schema entero, así que después de regenerarlos hay que pasar
`npm run tipos:filtrar` — este repo es público.

Los scripts que tocan la base necesitan `SUPABASE_URL`, `SUPABASE_ANON_KEY`
y/o `SUPABASE_SERVICE_KEY` por variable de entorno. El de webhooks necesita las
de Shopify.

## Trampas ya pisadas

- **`npm run build` rompe `npm run dev`.** Comparten `.next` y la carpeta que
  deja el build no le sirve al dev: todas las rutas dan 404, sin ningún error.
  Se arregla con `rm -rf .next`.
- **`127.0.0.1` no es `localhost`.** Por `127.0.0.1` la página carga pero los
  botones no responden y no aparece ningún error.
- **Realtime con la anon key da 0 eventos y está bien.** Las policies son
  `to authenticated`. Para probar de verdad, `npm run test:realtime`.
- **Filas de producto con `product_id` vacío son el total del día**, no un
  producto. Se descartan.
- **El middleware se come las rutas de API.** El `matcher` de `proxy.ts` agarra
  todo menos archivos estáticos, así que sin la excepción de `esRutaDeMaquina`
  el webhook de Shopify recibe un **302 al login** en vez de un 200 — y Shopify
  termina desactivando la suscripción. Falla en silencio: una redirección no
  parece un error.
- **`Number(null)` es `0`, y `0` es finito.** Chequear solo `Number.isFinite()`
  convierte cada dato ausente en un cero perfecto. Ver la regla 2.
- **Con dos canales, `join daily_sales on date` duplica.** Esa tabla tiene una
  fila por canal. Cualquier cosa que cruce contra las ventas del día tiene que
  ir a `daily_sales_total`. Hay un test que lo fija (`multicanal.test.sql`).
- **`webhookSubscriptionCreate` no es idempotente.** Llamarla dos veces crea dos
  suscripciones y cada pedido llega duplicado. Por eso el script consulta antes
  de crear.
- **El refresh token de Mercado Libre es de un solo uso y rota.** Dos procesos
  refrescando a la vez matan la conexión. Se refresca bajo lock y solo cuando ya
  venció, nunca por las dudas.
- **`npx tsc --noEmit` con `.next` borrado inventa errores.** Tipos como
  `LayoutProps` los genera Next dentro de `.next/types`. Si vas a correr tsc
  suelto, corré `npm run build` antes. El build ya tipa igual, así que casi
  siempre alcanza con el build.

## Variables de entorno

`.env.local` está ignorado y es el único archivo de configuración: sin él la app
no arranca, porque no hay claves por defecto ni base local a la que caer. La
plantilla versionada es `.env.example`; `npm install` la copia a `.env.local`
si no existe (`postinstall` → `scripts/crear-env.mjs`) y nunca pisa uno
existente.

`.mcp.json` también está ignorado: lleva el `project_ref` de quien clona. Lo
versionado es `.mcp.json.example`.

La `service_role` no va en ningún archivo del repo. Los scripts que la necesitan
la exigen por variable de entorno y fallan con un mensaje si no está.

Este repo es público: nada de URLs, `project_ref`, claves ni dominios de tienda
reales en archivos versionados.

## Antes de decir que algo funciona

Corré lo que corresponda y mirá la salida: `npm test`, `npm run build`, y los
tests SQL de `supabase/tests/` por el MCP. Si cambiaste algo que se ve, abrilo en el navegador. "Debería
andar" no es una verificación.
