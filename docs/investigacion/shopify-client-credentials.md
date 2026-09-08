# Shopify — por qué el panel pide el token solo (client credentials)

> Última actualización: 2026-09-07. Cubre cómo se autentica el panel contra
> Shopify desde que las apps se crean en el Dev Dashboard, y qué cambió en el
> repo por eso. Verificado en vivo creando una app sobre una tienda de prueba.

## Resumen

| Qué | Estado |
|---|---|
| Token de Shopify por client credentials grant, cacheado en `conexiones` | Hecho. `npm test` 104/104, `npm run build` OK (2026-09-07) |
| Migración `0013_conexion_shopify.sql` | Escrita y aplicada en el proyecto de la instalación real |
| `npm run shopify:probar` (prueba local antes de desplegar) | Hecho, sin correr contra una tienda real todavía |
| `webhooks:registrar` lee `.env.local` y pide el token solo | Hecho, sin correr contra una tienda real todavía |
| Docs 02/03/07/08, `.env.example`, `/vincular`, `README`, `AGENTS.md` | Actualizados |
| `docs/guia-visual.html` + `docs/img/` (27 capturas) | Hecho: Shopify completo, Vercel, Meta hasta "Asignar activos" |
| Prueba de punta a punta (sync, webhooks, cron) con la app nueva | **Pendiente**: falta el secreto en `.env.local` |

## Lo que se descubrió

Hasta 2026 las guías (incluida la de este repo) decían: crear la app, ir a
*API credentials*, copiar el **Admin API access token**. Ese token era de las
"apps personalizadas creadas desde el admin", y Shopify las cerró:

> *"You can no longer create new admin-created custom apps. For new apps, use
> Dev Dashboard or Shopify CLI."*
> — https://shopify.dev/docs/apps/build/authentication-authorization/legacy/admin-custom-apps

Las apps del **Dev Dashboard** (`dev.shopify.com/dashboard`; ojo, no
`shopify.dev/dashboard`, que da 404) muestran solo **Client ID** y **Client
secret**. No hay ninguna pantalla con un token. Para una app que trabaja
únicamente con tiendas de la propia organización, la doc indica el *client
credentials grant*:

> *"With a client credentials grant, you won't see a token in the Shopify
> admin. Instead, you request tokens programmatically when you need them."*
> — https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant

Detalles que importan:

- `POST https://{tienda}.myshopify.com/admin/oauth/access_token` con
  `client_id`, `client_secret`, `grant_type=client_credentials`.
- El token dura **24 h** (`expires_in` siempre 86399). La respuesta trae
  `scope`: sirve para avisar si falta `read_reports` antes de la primera
  consulta.
- Pedir un token nuevo **no mata al anterior de golpe**: Shopify lo "retira"
  pero sigue valiendo hasta vencer. Dos corridas del cron pidiendo a la vez no
  se pisan. Por eso no hace falta el lock que sí necesita Mercado Libre.
- Solo funciona si la app y la tienda están en la **misma organización** del
  Dev Dashboard. Si no: `shop_not_permitted`.

## Cómo funciona ahora

- `lib/sync/shopify-token.ts` — `credencialShopify(supabase, cfg)`: si hay
  `SHOPIFY_ADMIN_TOKEN` (app vieja) lo usa; si no, lee `conexiones` con
  `fuente = 'shopify'`, y si el token vence en menos de 10 minutos pide uno
  nuevo con `pedirToken()` y lo guarda. Traduce `shop_not_permitted`, 401 y 404
  a mensajes que dicen qué pantalla mirar.
- `lib/sync/config.ts` — `ConfigShopify` ahora tiene `clientId`, `apiSecret`
  y `adminToken` (los tres opcionales); exige `adminToken` **o**
  `clientId + apiSecret` al leer la configuración, no en la primera llamada.
- `lib/sync/shopify.ts` — las consultas reciben una `CredencialShopify`
  (`shopDomain` + `token`), ya no la configuración. `motor.ts` resuelve la
  credencial una vez por corrida.
- `scripts/lib/shopify-token.mjs` — la misma lógica en JS plano para los
  scripts, sin cache (un script corre una vez).
- `scripts/probar-shopify.mjs` (`npm run shopify:probar`) — pide token, lista
  scopes, hace una consulta ShopifyQL de 7 días. Nunca imprime secretos.
- `scripts/registrar-webhooks.mjs` — lee `.env.local`, pide el token, y avisa
  si falta `read_orders` antes de intentar crear suscripciones.
- `supabase/migrations/0013_conexion_shopify.sql` — `conexiones.fuente`
  acepta `'shopify'`; `refresh_token` con default `''`.

## Decisiones de diseño

- **Cache en `conexiones`, no en memoria.** Cada corrida del cron es una
  invocación nueva de la función de Vercel; sin cache en la base, cada corrida
  pediría un token (288 por día). Con la base, uno por día.
- **Sin lock.** Justificado arriba: los tokens no se invalidan entre sí. Menos
  código y menos formas de fallar que el lease de MeLi.
- **`SHOPIFY_ADMIN_TOKEN` se mantiene como override.** Quien tenga una app
  vieja del admin sigue funcionando sin tocar nada. Está comentado en
  `.env.example` para que nadie nuevo lo busque.
- **Margen de 10 minutos.** Un token de 24 h se renueva a las 23:50. Ninguna
  corrida dura más que eso, así que nunca se agarra vencido a mitad de camino.
- **Fallar al leer la configuración.** `configShopify()` tira el error con la
  ruta exacta (Configuración de la app → Credenciales) en vez de dejar que
  Shopify responda 401 sin contexto.
- **No se usa Shopify CLI.** El CLI arma un proyecto de app completo y obtiene
  tokens por OAuth en runtime; no entrega nada que pegar en Vercel, y el repo
  es MCP-only a propósito.

## Puntos de integración

- Variables: `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_API_SECRET`
  (obligatorias); `SHOPIFY_ADMIN_TOKEN` (solo apps viejas).
  `scripts/subir-env.mjs` marca las dos nuevas como obligatorias.
- Tabla `conexiones` (sin policies; solo service key). Diagnóstico:
  `select fuente, expires_at, ultimo_error from conexiones where fuente = 'shopify'`.
- `app/api/webhooks/shopify/route.ts` sigue usando `apiSecret` para el HMAC,
  sin cambios.

## Verificación

- [x] `npm test`: 9 archivos, 104 tests, todos pasan (incluye
      `shopify-token.test.ts`: grant, vencimiento con margen, traducción de
      `shop_not_permitted` y 401, no llama sin credenciales).
- [x] `npm run build`: compila y tipa sin errores. `.next` borrado después
      (ver "Trampas" en `AGENTS.md`).
- [x] Migración 0013 aplicada en el proyecto de la instalación real
      (constraint verificado antes: `conexiones_fuente_check`).
- [x] Flujo del Dev Dashboard recorrido en vivo: crear app → versión con
      `read_reports,read_orders` → lanzar → instalar → Credenciales. Capturas
      en `docs/img/02-*.jpg`.
- [ ] `npm run shopify:probar` contra la tienda de prueba. Destraba: pegar
      `SHOPIFY_API_SECRET` en `.env.local` (lo tiene que hacer una persona: el
      agente no maneja secretos).
- [ ] `disparar_sync('hoy')` con `sync_log` en `ok` y fila `shopify` en
      `conexiones`. Depende del anterior más `env:subir` + redeploy.
- [ ] `webhooks:registrar` y `programar_sync()`. Depende del anterior.
- [ ] Meta: usuario del sistema creado, **sin activos ni token**. Faltan tres
      clics manuales (Asignar activos → Ver rendimiento; Generar token con
      `ads_read`). Las capturas de esas dos pantallas también faltan en
      `guia-visual.html`.
