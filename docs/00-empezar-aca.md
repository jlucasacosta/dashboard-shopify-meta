# Empezá acá

## Qué es esto

Un panel que junta en una sola pantalla lo que hoy mirás en dos lugares
distintos: las ventas de tu tienda Shopify y lo que gastás en anuncios de Meta.

Con los dos juntos aparecen los números que ninguna de las dos plataformas te
puede dar sola:

- **CAC** — cuánto te cuesta conseguir un cliente nuevo
- **ROAS** — cuánto facturás por cada peso que ponés en anuncios
- **MER** — qué porcentaje de tu facturación se va en publicidad
- **Contribución** — lo que te queda después de pagar los anuncios

## Cómo se actualiza

No hay un robot corriendo en un servidor. **Vos escribís `/sync` en Claude Code**
y Claude va a buscar los datos a Shopify y a Meta y los guarda en tu base.

Suena raro al principio, pero tiene una ventaja grande: **no tenés que generar
ni una sola clave de API**. Conectás los tres MCP (que es apretar botones) y
listo.

## Qué vas a necesitar

| Cosa | Para qué | Gratis |
|---|---|---|
| Cuenta de Shopify | Tus ventas | Ya la tenés |
| Cuenta de Meta Ads | Tu inversión | Ya la tenés |
| Cuenta de Supabase | Guardar los datos | Sí |
| Cuenta de Vercel | Publicar el panel | Sí |
| Cuenta de GitHub | Guardar el código | Sí |

No necesitás Docker ni instalar la CLI de Supabase. **Todo lo que toca la base
de datos lo hace Claude por el MCP de Supabase**: aplicar las migraciones,
cargar datos de ejemplo, correr una consulta. Vos no escribís SQL en ninguna
terminal.

## Probalo antes de conectar tu tienda

El proyecto viene con **12 meses de datos de mentira** para que veas el panel
funcionando antes de conectar Shopify y Meta.

Primero hacé la guía [01 — Supabase](01-supabase.md): creás el proyecto,
conectás el MCP y aplicás las migraciones. Son diez minutos y es el único paso
previo, porque la base vive en la nube desde el principio.

Después, en Claude Code:

```
cargá supabase/seed.sql en mi proyecto de Supabase
```

Y en la terminal:

```bash
npm install
```

```bash
npm run dev
```

Abrí **http://localhost:3000** y vas a ver el panel completo, con gráficas y
todo. Los números son inventados, pero el panel es el de verdad.

Antes de traer tus datos reales, pedile a Claude que borre los de ejemplo:
están explicados en [04 — Primera sync](04-primera-sync.md).

> **Importante:** entrá por `localhost`, no por `127.0.0.1`. Son la misma
> computadora pero para el navegador son sitios distintos, y por seguridad
> Next.js bloquea archivos entre sitios distintos. Si entrás por `127.0.0.1`
> vas a ver la página pero **los botones no van a responder** y no va a
> aparecer ningún error. Es el problema más confuso de toda la lista.

Para entrar necesitás un usuario habilitado. Creá el tuyo (en una sola línea,
con las credenciales de tu proyecto):

```bash
SUPABASE_URL=https://xxxxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... npm run usuario:crear -- vos@tutienda.com
```

Después poné ese correo en la pantalla de entrada. El código llega a tu casilla
de verdad, mandado por Supabase.

## El orden de las guías

1. [Supabase](01-supabase.md) — creás la base de datos
2. [Shopify](02-shopify-mcp.md) — conectás tu tienda
3. [Meta Ads](03-meta-mcp.md) — conectás tu cuenta de anuncios
4. [Primera sincronización](04-primera-sync.md) — traés tus datos reales
5. [GitHub](05-github.md) — guardás el código
6. [Vercel](06-vercel.md) — lo ponés online
7. [Problemas comunes](07-problemas-comunes.md) — cuando algo no anda

Hacelas en orden. Cada una arranca donde termina la anterior.

## Cómo saber que esta parte funcionó

Ves el panel en `localhost:3000` con gráficas y números. No importa que sean
inventados: si los ves, todo lo demás va a andar.
