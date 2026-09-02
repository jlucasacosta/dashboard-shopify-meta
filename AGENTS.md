<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Dashboard Ecommerce — guía del proyecto

Panel que cruza las ventas de Shopify con la inversión de Meta Ads y calcula
CAC, ROAS, MER y contribución. No hay servidor sincronizando: la persona escribe
`/sync` en Claude Code y vos traés los datos por MCP.

El repo es una **base clonable por tienda**. Si para adaptarlo a otra tienda hay
que tocar código, eso es un bug del repo, no una tarea del usuario: lo que cambia
va en `sync.config.json` y en `.env.local`.

Está escrito para gente que recién arranca. Comentarios, mensajes de error y
documentación van en español y explican el *por qué*, no el *qué*.

## Cuatro reglas que no se negocian

**1. Los cálculos viven en la base.** CAC, ROAS, MER, ticket promedio y
contribución se definen en la vista `daily_metrics` y en las funciones
`period_totals`, `campaign_totals` y `product_totals`. Ni el frontend ni vos
calculan métricas. Si un número no cierra con Shopify, el bug está en el mapeo
del sync — **nunca** ajustes `daily_metrics` para que el número dé lindo.

**2. Un dato que falta es NULL, jamás 0.** `aov` y `conversion_rate` son las
únicas columnas de métrica nullable, y lo son a propósito: Shopify devuelve `""`
(no `0`) cuando no hubo pedidos ni sesiones. El panel muestra "—" y avisa. Un
dashboard que muestra un cero falso no falla nunca y miente siempre.

**3. El panel es privado.** El login usa `shouldCreateUser: false`. Sin eso
cualquiera con un correo entra. No lo saques ni lo hagas configurable.

**4. El panel es de solo lectura.** Los datos entran únicamente por `/sync`, a
través de los MCP. Ninguna tabla tiene policy de insert ni de update para el
navegador. Si te piden una pantalla que escriba en la base, eso es un cambio de
arquitectura: planteálo antes de codearlo, no lo agregues de callado.

## Cómo se mueve el dato

```
MCP Shopify ─┐
             ├─ /sync ─→ tablas crudas ─→ daily_metrics (view) ─→ period_totals
MCP Meta ────┘           daily_sales         un renglón             campaign_totals
                         daily_traffic       por día                product_totals
                         daily_products                                   │
                         daily_ad_spend                                   ↓
                         daily_ad_campaigns                     páginas (server
                         fx_rates                                components) + realtime
```

`sync_log` es cómo el panel se entera de que algo se salteó. Si el sync no
escribe ahí, el usuario no se entera de que le faltan datos.

## Dónde está cada cosa

| Ruta | Qué hay |
|---|---|
| `.claude/skills/sync-dashboard/SKILL.md` | **Cómo sincronizar.** Consultas y campos verificados contra los MCP reales. Leelo entero antes de tocar el sync. |
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
| `npm run usuario:crear -- mail@x.com` | Habilita a alguien a entrar. |
| `npm run nube:verificar` | Chequea que el proyecto de Supabase esté completo. |

**No hay base de datos local ni CLI de Supabase.** Todo el SQL se ejecuta por el
MCP de Supabase, contra el proyecto en la nube: aplicar `supabase/migrations/`,
cargar `supabase/seed.sql`, correr los tests de `supabase/tests/` (cada archivo
en una sola llamada: son un `begin ... rollback`), o consultar cualquier tabla.

Los tres scripts de arriba (menos `npm test`) necesitan `SUPABASE_URL`,
`SUPABASE_ANON_KEY` y/o `SUPABASE_SERVICE_KEY` por variable de entorno.

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
- **`npx tsc --noEmit` con `.next` borrado inventa errores.** Tipos como
  `LayoutProps` los genera Next dentro de `.next/types`. Si vas a correr tsc
  suelto, corré `npm run build` antes. El build ya tipa igual, así que casi
  siempre alcanza con el build.

## Variables de entorno

`.env.local` está ignorado y es el único archivo de configuración: sin él la app
no arranca, porque no hay claves por defecto ni base local a la que caer. La
plantilla versionada es `.env.example`.

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
