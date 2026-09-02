# 1. Supabase

Supabase es donde se guardan tus datos. Es gratis para lo que necesitamos.

## Crear el proyecto

1. Entrá a [supabase.com](https://supabase.com) y creá una cuenta.
2. **New project**. Ponele un nombre (por ejemplo `dashboard-mitienda`).
3. Elegí una contraseña para la base y **guardala** en tu gestor de contraseñas.
4. Elegí la región más cercana a vos.
5. Esperá unos dos minutos a que termine de crearse.

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

## Crear las tablas

Con el MCP conectado no tenés que copiar y pegar nada: pedile a Claude

> aplicá las migraciones de `supabase/migrations/` en mi proyecto de Supabase,
> en orden numérico

y las ejecuta él, en orden y verificando que cada una haya entrado.

Son siete y el orden importa: cada una asume que la anterior corrió. La última,
`0007_panel_solo_lectura.sql`, es la que quita los permisos de escritura del
navegador — si te la salteás, el panel queda escribible desde la consola del
navegador por cualquiera con una sesión.

**Si preferís hacerlo a mano**, andá a **SQL Editor** en el panel de Supabase y
ejecutá los archivos de `supabase/migrations/` **en orden numérico**:

1. `0001_schema.sql`
2. `0002_view_metrics.sql`
3. `0003_rls_realtime.sql`
4. `0004_period_totals.sql`
5. `0005_breakdowns.sql`
6. `0006_meta_atribucion_nullable.sql`
7. `0007_panel_solo_lectura.sql`

Abrí cada archivo, copiá todo el contenido, pegalo en el SQL Editor y apretá
**Run**. Uno por vez, en orden.

> **Cuidado con `supabase/seed.sql`.** Son 12 meses de datos de mentira, útiles
> para ver el panel andando antes de conectar la tienda. Si los cargás, pedile
> a Claude que los borre **antes** de la primera sync real: mezclados con los
> datos de verdad no hay forma de distinguirlos. Cómo borrarlos está en
> [04 — Primera sync](04-primera-sync.md).

## Habilitar a quien puede entrar

Este panel es privado: **nadie se da de alta solo**. Vos decidís qué correos
pueden entrar, y el resto recibe un "no estás habilitado".

Para habilitar a alguien, desde la terminal, con las credenciales del proyecto
en la misma línea:

```bash
SUPABASE_URL=https://xxxxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... npm run usuario:crear -- vos@tutienda.com
```

La `service_role key` está en **Project Settings → API**. Usala solo en ese
comando y **no la guardes en ningún archivo del proyecto**: se saltea todos los
permisos.

También podés hacerlo con el mouse, en **Authentication → Users → Add user**.
Marcá *Auto Confirm User*.

## Hacer que el correo mande el código

Por defecto Supabase manda un link, y nosotros queremos un código.

En **Authentication → Emails → Magic Link**, reemplazá el contenido por el de
`supabase/templates/magic_link.html`. Lo único que importa de verdad es que
diga `{{ .Token }}` en vez de `{{ .ConfirmationURL }}`.

> Si te salteás este paso, el correo va a llegar con un link en vez de un
> código, y la pantalla te va a seguir pidiendo el código.

> **El largo del código lo decide tu proyecto**, y por defecto son 8 dígitos.
> La pantalla acepta entre 6 y 10, así que no tenés que configurar nada: copiá
> el código completo que te llegó, sea del largo que sea.

## Conectar la app

Copiá `.env.example` a `.env.local` y completá los dos valores. Los encontrás en
**Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

La clave que necesitás es la **anon** (o **publishable**, si tu proyecto es
nuevo — son la misma cosa con distinto nombre).

`.env.local` está en `.gitignore`: es tuyo y no se sube. Sin él la app no
arranca, porque no hay ninguna base por defecto a la que caer.

> **Nunca pongas acá la clave `service_role`.** Esa clave se saltea todos los
> permisos. En este archivo termina en el navegador de cualquiera que abra tu
> panel.

## Cómo saber que funcionó

```bash
npm run dev
```

Entrá a `http://localhost:3000`, poné el correo que habilitaste, y escribí el
código que llega. Tenés que ver el panel. Si ejecutaste el seed vas a ver datos; si no, todo en
cero. Las dos cosas están bien.
