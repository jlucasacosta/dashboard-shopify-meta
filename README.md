# Dashboard Ecommerce — Shopify + Mercado Libre + Meta Ads

Panel de métricas que junta las ventas de tus canales con la inversión de tus
anuncios de Meta, y calcula lo que ninguna de las plataformas te da sola:
**CAC**, **ROAS**, **MER** y contribución.

Pensado para clonarse y usarse por tienda.

## Cómo se actualiza

Solo. Una vez instalado, nadie tiene que apretar nada.

```
pg_cron (en tu Supabase)  ──cada 5 min──►  /api/cron/sync
Shopify, cuando hay venta ──webhook────►  /api/webhooks/shopify
                                              │
                                              ▼
                          lee ShopifyQL, Mercado Libre y Meta Ads
                                              │
                                              ▼
                                  escribe en tu Supabase
                                              │
                                              ▼
                              el panel abierto se actualiza en vivo
```

El reloj vive en Postgres y no en Vercel por un motivo concreto: el plan gratis
de Vercel permite una tarea programada **por día**, y ni siquiera a una hora
exacta. `pg_cron` corre cada minuto y no cuesta nada.

El webhook de Shopify no trae números: solo avisa que un día cambió, y el panel
se lo vuelve a preguntar a Shopify. Así los totales siempre coinciden con los
del admin.

## Arrancar

No hace falta instalar Docker ni la CLI de Supabase. **Todo lo que toca la base
de datos lo hace Claude por el MCP de Supabase.**

1. Creá un proyecto gratis en [supabase.com](https://supabase.com).
2. Conectá el MCP de Supabase apuntándolo a ese proyecto
   (copiá `.mcp.json.example` a `.mcp.json` y poné tu `project_ref`).
3. Pedile a Claude: *aplicá las migraciones de `supabase/migrations/` en mi
   proyecto de Supabase*.
4. Copiá `.env.example` a `.env.local` y completá la URL y la anon key.

```bash
npm install
```

```bash
npm run dev
```

Abrí **http://localhost:3000** (por `localhost`, no por `127.0.0.1`).

Si querés ver el panel con datos antes de conectar tu tienda, pedile a Claude
que cargue `supabase/seed.sql`: son **12 meses de datos de ejemplo**. Acordate
de borrarlos antes de la primera sync real.

Habilitá tu correo con
`SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run usuario:crear -- vos@tutienda.com`.
El código de acceso llega a tu casilla de verdad.

Después seguí **[docs/00-empezar-aca.md](docs/00-empezar-aca.md)**.

## Qué muestra

| | |
|---|---|
| **Ventas** | Facturación, ventas netas, pedidos, ticket promedio, descuentos, devoluciones |
| **Anuncios** | Inversión, impresiones, clics, CTR, CPC, CPM, alcance — total y por campaña |
| **Cruce** | CAC, ROAS, MER, % de facturación en ads, contribución |
| **Clientes** | Nuevos vs recurrentes |
| **Tráfico** | Sesiones, visitantes, tasa de conversión |
| **Embudo** | Visitas → agregados al carrito → pagos iniciados → ventas |
| **Productos** | Top 20 por facturación, filtrable por canal |

## Tres decisiones que definen este proyecto

**Las ventas salen de los canales; de Meta sale solo el gasto.** Meta atribuye
conversiones con su propio modelo y siempre reporta más: los números de acá son
conservadores y cierran con lo que ves en tu banco.

Y dentro de cada canal, la plataforma manda: los totales de Shopify se leen de
ShopifyQL, la misma fuente que alimenta Analytics en su admin. El panel no
recalcula ventas netas ni devoluciones por su cuenta, justamente para no
diferir de lo que Shopify te muestra.

**El gasto de anuncios no se parte por canal.** Un anuncio de Meta puede empujar
una venta en Shopify y otra en Mercado Libre, y no hay forma honesta de saber
cuál. Por eso las ventas se guardan por canal, pero CAC, ROAS, MER y
contribución se calculan siempre contra el total. Repartir el gasto sería
inventar un número.

**Los cálculos viven en la base de datos**, en la vista `daily_metrics` y en las
funciones `period_totals`, `campaign_totals` y `product_totals`. Ni el frontend
ni Claude calculan métricas. Hay un solo lugar donde está definido qué significa
cada número, y se puede auditar.

**Un dato ausente se muestra como "—", nunca como cero.** Si falta el tipo de
cambio de un día, el CAC de ese día no aparece y el panel avisa que la inversión
está incompleta. Un dashboard que muestra un número equivocado no falla nunca y
miente siempre.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compila para producción |
| `npm test` | Tests unitarios |
| `npm run test:realtime` | Diagnostica si Realtime entrega eventos |
| `npm run nube:verificar` | Revisa que tu proyecto de Supabase esté bien armado |
| `npm run usuario:crear -- mail@x.com` | Habilita a alguien para entrar al panel |
| `npm run webhooks:registrar` | Le dice a Shopify a dónde avisar. Correrlo dos veces es seguro |
| `npm run tipos:filtrar` | Regenera `lib/types.ts` dejando solo las tablas del panel |

Los que tocan la base necesitan las credenciales por variable de entorno
(`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`). Nunca van en un archivo.

**Las migraciones y las consultas sueltas se las pedís a Claude**, que las
ejecuta por el MCP de Supabase. Eso es para instalar y para depurar: la
sincronización de todos los días no necesita a nadie.

## Duplicar para otra tienda

1. Cloná el repo.
2. Creá un proyecto nuevo en Supabase, apuntá el MCP ahí y pedile a Claude que
   aplique las migraciones. **No cargues el seed**: son datos de mentira y se
   mezclan con los reales.
3. Deploy a Vercel.
4. Cargá las variables de entorno (`.env.example` las lista todas, separadas
   entre las públicas y las que nunca salen del servidor).
5. Seguí [07 — Encender el sync](docs/07-encender-el-sync.md): registrar los
   webhooks y arrancar el reloj.

Sin tocar una línea de código. Si hace falta tocar código para adaptarlo a otra
tienda, eso es un error del repo base.

La única excepción es el idioma de los números: las fechas y los separadores
salen en `es-UY` (coma decimal, punto de miles). Si tu tienda es de otro país,
cambiá `LOCALE` en `lib/format.ts` — está en un solo lugar y las gráficas lo
importan de ahí. La moneda **no** se toca desde el código: sale de
`STORE_CURRENCY`.

## Stack

Next.js 16 · TypeScript · Tailwind CSS · shadcn/ui · Recharts · Supabase ·
Vercel

Se entra con un código que llega por correo. Sin contraseñas, sin
links que abrir, y sin altas automáticas: solo entran los correos que vos
habilitás.

## Documentación

| | |
|---|---|
| [00 — Empezá acá](docs/00-empezar-aca.md) | Qué es y cómo probarlo sin configurar nada |
| [01 — Supabase](docs/01-supabase.md) | Base de datos, tablas y acceso |
| [02 — Shopify](docs/02-shopify.md) | Crear la app y sacar el token |
| [03 — Meta Ads](docs/03-meta-ads.md) | El token del gasto publicitario |
| [04 — Mercado Libre](docs/04-mercado-libre.md) | El segundo canal de venta |
| [05 — GitHub](docs/05-github.md) | Guardar el código |
| [06 — Vercel](docs/06-vercel.md) | Publicarlo online |
| [07 — Encender el sync](docs/07-encender-el-sync.md) | Que se actualice solo — o escribí `/vincular` |
| [08 — Problemas](docs/08-problemas-comunes.md) | Cuando algo no anda |
