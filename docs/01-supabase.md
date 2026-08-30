# 1. Supabase

Supabase es donde se guardan tus datos. Es gratis para lo que necesitamos.

## Crear el proyecto

1. Entrá a [supabase.com](https://supabase.com) y creá una cuenta.
2. **New project**. Ponele un nombre (por ejemplo `dashboard-mitienda`).
3. Elegí una contraseña para la base y **guardala** en tu gestor de contraseñas.
4. Elegí la región más cercana a vos.
5. Esperá unos dos minutos a que termine de crearse.

## Crear las tablas

En el panel de Supabase, andá a **SQL Editor** y ejecutá los archivos de la
carpeta `supabase/migrations/` **en orden numérico**:

1. `0001_schema.sql`
2. `0002_view_metrics.sql`
3. `0003_rls_realtime.sql`
4. `0004_period_totals.sql`
5. `0005_breakdowns.sql`
6. `0006_meta_atribucion_nullable.sql`

Abrí cada archivo, copiá todo el contenido, pegalo en el SQL Editor y apretá
**Run**. Uno por vez, en orden.

> Si querés ver el panel con datos de mentira antes de conectar tu tienda,
> ejecutá también `supabase/seed.sql`. Después lo vas a poder borrar.

## Configurar las URLs de acceso

**Este paso no se puede saltear.** Si lo salteás, el link que te llega por
correo te va a mandar a la página equivocada y no vas a poder entrar. Y no da
ningún error: simplemente no funciona.

En Supabase, andá a **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000`
- **Redirect URLs**: agregá estas tres, una por línea:
  ```
  http://localhost:3000/**
  http://127.0.0.1:3000/**
  https://TU-PROYECTO.vercel.app/**
  ```

La tercera la vas a poder completar recién después de la [guía de Vercel](06-vercel.md).
Volvé a este paso cuando la tengas.

> **Por qué pasa esto:** la app le pide a Supabase "cuando el usuario haga clic
> en el link, mandalo a esta dirección". Supabase solo obedece si esa dirección
> está en la lista de arriba. Si no está, usa la Site URL sin avisarte.

## Conectar el MCP

El MCP es lo que le permite a Claude escribir en tu base.

1. Copiá el archivo `.mcp.json.example` a `.mcp.json`.
2. Reemplazá `TU_PROJECT_REF` por el identificador de tu proyecto. Lo encontrás
   en **Project Settings → General → Reference ID**, o en la URL del panel:
   `supabase.com/dashboard/project/AQUI_ESTA`.
3. **Cerrá y volvé a abrir Claude Code.** Los MCP se conectan al arrancar; si lo
   agregás con Claude abierto, no lo va a ver.
4. La primera vez te va a pedir autorizar en el navegador. Aceptá.

> **No pongas tu Personal Access Token en un archivo.** El MCP por HTTP se
> autentica solo, en el navegador. Si ves una guía que te dice que pegues un
> token `sbp_...` en un archivo de configuración, esa guía es vieja: ese token
> da acceso a **toda tu cuenta**, no a un proyecto, y queda en texto plano en
> tu disco.

## Conectar la app

Copiá `.env.example` a `.env.local` y completá los dos valores. Los encontrás en
**Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

La clave que necesitás es la **anon** (o **publishable**, si tu proyecto es
nuevo — son la misma cosa con distinto nombre).

> **Nunca pongas acá la clave `service_role`.** Esa clave se saltea todos los
> permisos. En este archivo termina en el navegador de cualquiera que abra tu
> panel.

## Cómo saber que funcionó

```bash
npm run dev
```

Entrá a `http://localhost:3000`, poné tu correo, abrí el link que te llega, y
tenés que ver el panel. Si ejecutaste el seed vas a ver datos; si no, todo en
cero. Las dos cosas están bien.
