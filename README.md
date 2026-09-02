# Dashboard Ecommerce — Shopify + Meta Ads

Panel de métricas que junta las ventas de tu tienda Shopify con la inversión de
tus anuncios de Meta, y calcula lo que ninguna de las dos te da sola: **CAC**,
**ROAS**, **MER** y contribución.

Pensado para clonarse y usarse por tienda. **No necesitás generar ni una clave
de API.**

## Cómo se actualiza

No hay servidor corriendo tareas. Escribís `/sync` en Claude Code y Claude va a
buscar los datos a Shopify y Meta y los guarda en tu Supabase. El panel escucha
la base y se actualiza solo, en vivo, mientras la sincronización corre.

```
/sync  →  Claude lee los MCP de Shopify y Meta
       →  escribe en Supabase por el MCP de Supabase
       →  el panel abierto se actualiza en vivo
```

## Arrancar en 5 pasos

```bash
npm install
```

```bash
npx supabase start
```

```bash
npm run db:reset
```

```bash
npm run dev
```

Abrí **http://localhost:3000** (por `localhost`, no por `127.0.0.1`) y vas a ver
el panel con **12 meses de datos de ejemplo**, antes de conectar nada.

No hay que copiar ni completar ningún archivo de configuración: `.env.development`
ya viene en el repo con las claves de Supabase local, que son públicas e iguales
para todo el mundo. Las tuyas de la nube van después en `.env.local`.

Habilitá tu correo con `npm run usuario:crear -- vos@tutienda.com`. El código
de acceso llega a la casilla falsa en **http://localhost:54324**.

Después seguí **[docs/00-empezar-aca.md](docs/00-empezar-aca.md)**.

## Qué muestra

| | |
|---|---|
| **Ventas** | Facturación, ventas netas, pedidos, ticket promedio, descuentos, devoluciones |
| **Anuncios** | Inversión, impresiones, clics, CTR, CPC, CPM, alcance — total y por campaña |
| **Cruce** | CAC, ROAS, MER, % de facturación en ads, contribución |
| **Clientes** | Nuevos vs recurrentes |
| **Tráfico** | Sesiones, visitantes, tasa de conversión |
| **Productos** | Top 20 por facturación |

## Tres decisiones que definen este proyecto

**Shopify es la única verdad de ventas.** De Meta sale solo el gasto. Meta
atribuye conversiones con su propio modelo y siempre reporta más: los números de
acá son conservadores y cierran con lo que ves en tu banco.

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
| `npm run db:test` | Tests de las métricas en SQL |
| `npm run db:reset` | Recrea la base y carga los datos de ejemplo |
| `npm run db:sql -- -c "..."` | Ejecuta SQL contra la base local |
| `npm run test:realtime` | Diagnostica si Realtime entrega eventos |
| `npm run usuario:crear -- mail@x.com` | Habilita a alguien para entrar al panel |

`db:sql` y `db:test` usan el psql que viene adentro del contenedor de Docker,
así que **no hace falta instalar psql**.

## Duplicar para otra tienda

1. Cloná el repo.
2. Creá un proyecto nuevo en Supabase y ejecutá las migraciones.
3. Cambiá tres valores en `sync.config.json`: `shopDomain`, `adAccountId` y
   `storeCurrency`.
4. Completá `.env.local`.
5. Deploy a Vercel.

Sin tocar una línea de código. Si hace falta tocar código para adaptarlo a otra
tienda, eso es un error del repo base.

## Stack

Next.js 16 · TypeScript · Tailwind CSS · shadcn/ui · Recharts · Supabase ·
Vercel

Se entra con un código de 6 dígitos que llega por correo. Sin contraseñas, sin
links que abrir, y sin altas automáticas: solo entran los correos que vos
habilitás.

## Documentación

| | |
|---|---|
| [00 — Empezá acá](docs/00-empezar-aca.md) | Qué es y cómo probarlo sin configurar nada |
| [01 — Supabase](docs/01-supabase.md) | Base de datos, tablas y acceso |
| [02 — Shopify](docs/02-shopify-mcp.md) | Conectar la tienda |
| [03 — Meta Ads](docs/03-meta-mcp.md) | Conectar los anuncios |
| [04 — Primera sync](docs/04-primera-sync.md) | Traer tus datos reales |
| [05 — GitHub](docs/05-github.md) | Guardar el código |
| [06 — Vercel](docs/06-vercel.md) | Publicarlo online |
| [07 — Problemas](docs/07-problemas-comunes.md) | Cuando algo no anda |
