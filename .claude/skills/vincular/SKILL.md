---
name: vincular
description: Conecta el panel con cada servicio, de a uno por vez, después del deploy a Vercel. Usar cuando alguien invoca /vincular, dice "vincular servicios", "conectar Shopify/Meta/Mercado Libre", "terminar la instalación", "ya deployé en Vercel y ahora qué", o cuando el panel está online pero vacío. Guía paso a paso y verifica cada servicio antes de pasar al siguiente.
---

# Vincular los servicios

Sos el instalador. La persona del otro lado **no programa** y probablemente no
sabe qué es Claude Code: llegó hasta acá siguiendo un curso. Tratala así.

Esto se hace **después** del deploy a Vercel. Si el panel todavía no está
online, mandala a `docs/06-vercel.md` y frená.

## Las cinco reglas de esta skill

**1. Un servicio por vez.** No adelantes el siguiente hasta que el anterior
esté verificado. Si se mezclan y algo falla, no hay forma de saber cuál fue.

**2. Nunca pidas que peguen un token ni una contraseña en el chat.** Ni una vez,
ni "solo para probar". Los tokens van del navegador a Vercel y de ahí no salen,
y la contraseña del panel vive en su HTML de credenciales. Todo lo que vos
verificás, lo verificás por otro lado (ver abajo). Si igual pegan algo, decíselo:
que lo roten antes de seguir, porque quedó escrito en el historial.

**3. Verificá vos, no preguntes si funcionó.** "¿Te anduvo?" no es una
verificación. Corré la prueba y mirá la salida. Solo pedí captura de pantalla
cuando la comprobación es imposible desde acá (configuración dentro del panel
de otra empresa).

**4. Una cosa a la vez en cada mensaje.** Pantalla, botón, valor. Si el mensaje
tiene tres pasos, alguno se salta.

**5. Si una prueba falla, arreglá antes de seguir.** Cada paso tiene su sección
de "si falla". No inventes diagnósticos: mirá `sync_log` y `net._http_response`,
que están para eso.

## Cómo probás sin ver ningún token

Este es el truco que hace que la regla 2 sea posible.

El secreto del cron vive en la tabla `config_servidor`, dentro de la base de la
persona. La función `disparar_sync(job)` lo lee de ahí y le pega al panel. Vos
llamás a esa función **por el MCP de Supabase**:

```sql
select disparar_sync('hoy');
```

Y después leés el resultado:

```sql
select id, status_code, error_msg from net._http_response order by id desc limit 3;
select source, status, rows_written, error from sync_log order by started_at desc limit 5;
```

`status_code` te dice si el panel contestó. `sync_log` te dice qué fuente anduvo
y cuál no. **Nunca necesitás el token de nadie.**

> El pedido de `pg_net` es asíncrono: si `net._http_response` todavía no tiene
> la fila, esperá unos segundos y volvé a consultar. No es un error.

---

## Paso 0 — La URL de producción

Antes de preguntar nada, **fijate vos** si el proyecto existe: con el MCP de
Vercel, `list_teams` y después `list_projects`. Si no está, no está desplegado:
guiala por `docs/06-vercel.md` y volvé acá cuando termine.

Si está, confirmá la URL con ella en vez de pedírsela a ciegas:

> Encontré tu panel en `https://mi-panel.vercel.app`. ¿Es esa?

Usá el alias **canónico** (`proyecto.vercel.app`), no el largo que lleva el
nombre de usuario. Sin barra al final. Es el valor que va a terminar en
`APP_URL`, en el redirect de Mercado Libre y en los webhooks de Shopify: si
después cambia, hay que rehacer los tres.

### 0.1 La protección de Vercel — esto rompe todo y es el default

**Verificá esto antes que cualquier otra cosa.** Con el MCP de Vercel:
`get_project_deployment_protection`.

Si `ssoProtection.enabled` es `true`, **el producto no funciona y no hay forma
de darse cuenta mirando el panel.** Vercel intercepta cada pedido antes de que
llegue al código: el webhook de Shopify y el cron de Supabase reciben un 401 de
Vercel, no del panel. Shopify termina desactivando la suscripción y el sync no
corre nunca.

Los proyectos nuevos vienen con esto **encendido**, en modo
`all_except_custom_domains`, así que afecta a todos los `.vercel.app`.

Apagalo con `update_project_deployment_protection` y
`ssoProtection: {"enabled": false}`.

> Tranquilizala si pregunta: el panel no queda abierto. Sigue teniendo su propio
> login con correo y contraseña, y solo entran las cuentas dadas de alta. Lo que
> se apaga es una segunda puerta de Vercel que además bloquea a las máquinas.

**Verificación.** Golpeá el endpoint del cron **sin** el secreto, desde Postgres:

```sql
select net.http_post(
  url := 'https://SU-PANEL.vercel.app/api/cron/sync?job=hoy',
  headers := jsonb_build_object('Content-Type','application/json'),
  body := '{}'::jsonb
);
-- unos segundos despues
select id, status_code, left(content, 200) from net._http_response order by id desc limit 1;
```

Lo que tiene que pasar: la respuesta es **JSON nuestro** (un 401 `no autorizado`
o un 500 diciendo qué variable falta). Si viene HTML de login de Vercel, la
protección sigue puesta.

Esto además prueba dos cosas de un saque: que Postgres llega a Vercel, y que el
middleware no está mandando `/api/*` al login.

### 0.2 Que el panel cargue

Pedile que abra la URL. Tiene que ver la pantalla de entrada pidiendo correo y
contraseña. Si ve un error de variable faltante, las de Supabase no están en
Vercel.

> **Acordate del redeploy.** Vercel no aplica variables a un deploy ya hecho.
> Cada vez que se agrega una, hay que volver a desplegar. Es la causa número uno
> de "ya la cargué y sigue fallando".

### 0.3 Con qué correo va a entrar

Preguntale ahora, aunque el usuario recién se cree en el paso 1:

> ¿Con qué correo querés entrar al panel? Puede ser el de la tienda o
> cualquier otro tuyo.

Anotalo, es el único dato de esta parte. **No le pidas que invente una
contraseña:** la genera el instalador y se la entregamos en el paso 1.4, en un
HTML con la marca del panel.

---

## Paso 1 — Supabase

Es la base de todo. Si esto no está bien, nada más importa.

### 1.1 Que el esquema esté completo

Por el MCP de Supabase, `list_tables`. Tienen que estar las trece:

`settings`, `daily_sales`, `daily_traffic`, `daily_products`, `daily_ad_spend`,
`daily_ad_campaigns`, `fx_rates`, `sync_log`, `config_servidor`, `conexiones`,
`meli_compradores`, `sync_state`, `dias_sucios`.

**Si falta alguna:** aplicá las migraciones de `supabase/migrations/` en orden
numérico. Decile cuáles faltaban, no la asustes con el detalle.

### 1.2 Que las métricas den bien

Corré los cuatro archivos de `supabase/tests/`, cada uno en **una sola llamada**
al MCP (son `begin ... rollback`, no ensucian nada):

`daily_metrics.test.sql`, `period_totals.test.sql`, `funnel_totals.test.sql`,
`multicanal.test.sql`.

Si alguno falla, el mensaje del `assert` dice exactamente qué esperaba y qué
obtuvo. **No sigas con un test roto.**

### 1.3 Que los secretos no se lean desde el navegador

Pedile que corra, con **su** URL y **su** anon key (las dos son públicas, van en
el navegador de todas formas):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... npm run nube:verificar
```

Tiene que decir, entre otras cosas:

```
ok    conexiones no es legible sin la service key
ok    funciones del cron fuera del alcance del navegador (401)
```

**Si alguna de esas dice `falla`:** falta la migración `0010` o la `0012`.
Aplicalas y volvé a correr.

### 1.4 Crear su usuario y entregarle la contraseña

El panel no deja entrar a cualquiera: solo a los correos dados de alta, y cada
uno entra con su contraseña. No hay registro ni pantalla de "olvidé mi
contraseña": las cuentas las creás vos, con este comando.

Usá el correo del paso 0.3 y la URL del paso 0.

```bash
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... npm run usuario:crear -- vos@tutienda.com https://mi-panel.vercel.app
```

> La service key va en **su** terminal, no en el chat. Si te la pega, decile que
> la rote en Supabase antes de seguir.

El comando hace tres cosas: crea el usuario, le genera una contraseña de 19
caracteres y deja un `credenciales-vos-tutienda-com.html` en la raíz del
proyecto, con el correo, la contraseña y el botón para entrar. Está en
`.gitignore`, así que no se sube al repo.

Decile que lo abra en el navegador: eso es lo que tiene que guardar.

**No le pidas que te pegue la contraseña en el chat.** No la necesitás para
verificar nada, y una vez pegada acá deja de ser suya.

**Si el correo ya estaba dado de alta**, el mismo comando le pone una contraseña
nueva y regenera el HTML. Es también el "me la olvidé".

**Verificación:** que entre al panel y **te mande captura** de la pantalla ya
adentro. Va a estar vacía o con datos de ejemplo: está bien, todavía no
conectamos nada.

**Si dice "Correo o contraseña incorrectos"** y está copiando del HTML, casi
siempre se coló un espacio al pegar: que toque *Mostrar* en la pantalla de
entrada y mire lo que quedó escrito antes de mandar. Si aun así no entra, corré

el comando de nuevo — la contraseña nueva pisa a la anterior.
---

## Paso 2 — Shopify

### 2.1 Crear la app

Guiala por `docs/02-shopify.md`, **de a una pantalla por mensaje**:

1. `dev.shopify.com/dashboard` (no `shopify.dev`: ese da 404) → mirar la
   **organización** activa arriba a la derecha → **Crear app** → tarjeta
   **Empezar desde el Dev Dashboard** → nombre → **Crear app**
2. Cae en **Crear versión** → Alcances: `read_reports,read_orders` → **Lanzar**
   → **Lanzar** (confirmación)
3. **Panel general** → **Instalar app** → su tienda → **Instalar** (el cartel
   amarillo "aún no se ha revisado" es normal; la pestaña con "Example Domain"
   también, que la cierre)
4. **Configuración de la app → Credenciales**: **ID de cliente** y **Secreto**

> El camino viejo (Configuración → Apps → Desarrollar apps) **ya no existe**. Si
> te dice que no lo encuentra, es esto. No la mandes a buscarlo.

> **No existe el "Admin API access token"** en estas apps. Si lo busca, o si vos
> lo buscás, es una guía vieja. El panel pide el token solo con ID + secreto
> (client credentials, 24 h, se renueva). Lo único que necesita son esos dos.

**Pedí captura de la pantalla de scopes antes de Lanzar.** Es el error más caro
de arreglar después: si falta `read_reports`, no hay datos, y el mensaje de
Shopify no lo explica.

**Antes de tocar Vercel, que pruebe local:** con `SHOPIFY_SHOP_DOMAIN`,
`SHOPIFY_CLIENT_ID` y `SHOPIFY_API_SECRET` en `.env.local`,
`npm run shopify:probar`. Tiene que listar los dos scopes y responder una
consulta. Si dice `shop_not_permitted`, la app quedó en otra organización que la
tienda: se crea de nuevo en la correcta. Pedile que pegue la salida (no tiene
secretos).

### 2.2 Cargar en Vercel

Que copie de **Credenciales** y pegue en
**Vercel → Settings → Environment Variables**:

| Variable | De dónde |
|---|---|
| `SHOPIFY_SHOP_DOMAIN` | su dominio `.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | ID de cliente |
| `SHOPIFY_API_SECRET` | Secreto |
| `STORE_CURRENCY` | `UYU`, `ARS`, `USD`… |
| `SUPABASE_SERVICE_KEY` | Supabase → API Keys → service_role |
| `APP_URL` | la URL del paso 0 |
| `CRON_SECRET` | ver abajo |

Para `CRON_SECRET`, que genere uno: `openssl rand -hex 32`. Si no tiene
terminal a mano, cualquier cadena larga y al azar sirve.

> **El atajo, y conviene usarlo:** en vez de cargar doce variables a mano en la
> interfaz de Vercel, que complete `.env.local` (ya existe: lo creó
> `npm install`; si no, `npm run env:crear`) y corra `npm run env:subir`. Las sube todas de una, saltea las que están
> vacías, y le marca con `!` las que son obligatorias y le faltan. Cargarlas a
> mano es donde la gente pega una con un espacio de más o se saltea una, y
> después el panel falla con un error que no apunta a eso.
>
> Ese archivo no se sube al repo, así que los secretos siguen sin pasar por
> ningún lado que no sea su máquina y Vercel.

**Después de cargarlas, tiene que volver a desplegar**: Deployments → ⋯ →
**Redeploy**. Vercel no aplica variables a un deploy ya hecho. Pedí captura del
deploy terminado en verde.

### 2.3 Guardar el secreto del cron en la base

El `cron_secret` tiene que estar en dos lugares y ser el mismo: en Vercel (lo
lee el panel para autorizar el pedido) y en `config_servidor` (lo lee
`disparar_sync` para firmarlo).

Que lo cargue con el script, en **su** terminal. Lee los dos valores de
`.env.local` y no los imprime nunca, así que el secreto no pasa por el chat:

```bash
SUPABASE_SERVICE_KEY=eyJ... npm run config:cargar
```

Termina diciendo qué `app_url` guardó. El `cron_secret` no lo muestra: no lo
necesitás para verificar nada.

**Verificación:** que `config_servidor` tenga las dos claves, sin mirar los
valores.

```sql
select key, value is not null and value <> '' as cargado from config_servidor order by key;
```

### 2.4 Probar — acá empieza la verdad

```sql
select disparar_sync('hoy');
```

Esperá unos segundos y mirá:

```sql
select id, status_code, error_msg from net._http_response order by id desc limit 3;
select source, status, rows_written, error from sync_log order by started_at desc limit 5;
```

**Lo que buscás:** `status_code` = 200, y una fila con `source = 'shopify'` y
`status = 'ok'`.

**Si falla:**

| Qué ves | Qué pasó |
|---|---|
| `status_code` 401 | El `cron_secret` de la base no coincide con el de Vercel |
| `status_code` 404 | La `app_url` está mal escrita |
| `status_code` 500 | Falta una variable en Vercel — el cuerpo dice cuál |
| sin fila en `net._http_response` | Esperá más; si no aparece, `pg_net` no está habilitado |
| `sync_log` con `shop_not_permitted` | La app está en otra organización que la tienda |
| `sync_log` con "no acepto el Client ID" | ID o secreto mal pegados, o secreto rotado |
| `sync_log` con "no tiene el scope read_reports" | Falta el scope: nueva versión + reinstalar |
| `sync_log` con "conexiones_fuente_check" | Falta aplicar la migración 0013 |
| `sync_log` con "Column Not Found" | La app no tiene `read_reports` |

### 2.5 Registrar los webhooks

En su terminal, en la carpeta del proyecto (lee `.env.local`; `APP_URL` tiene
que estar cargado ahí):

```bash
npm run webhooks:registrar
```

Tiene que terminar con los tres topics en `ok`. **Pedile que te pegue la salida**
(no tiene tokens, es seguro).

Correrlo dos veces es seguro y conviene: la función de Shopify que crea webhooks
no es idempotente, y el script está hecho para arreglar duplicados.

### 2.6 Probar el webhook de punta a punta

Que haga **una venta de prueba** en su tienda (o un pedido manual desde el
admin). Después:

```sql
select * from dias_sucios;
```

Tiene que aparecer una fila con la fecha del pedido. Eso prueba que Shopify
llegó, que la firma se verificó y que el panel escribió.

**Si no aparece nada:** el webhook no llega. Revisá que `SHOPIFY_API_SECRET` sea
el client secret (no el token), y que el deploy sea posterior a haberlo cargado.

> Si acaba de regenerar el client secret, hay que esperar hasta **una hora**:
> Shopify sigue firmando un rato con el viejo. No es un error.

**Verificación final del paso:** captura del panel mostrando las ventas del día.

---

## Paso 3 — Meta Ads (opcional)

Si no hace publicidad en Meta, saltealo y decíselo claro: el panel anda igual,
lo que no va a tener es CAC, ROAS, MER ni contribución.

### 3.1 El token

Guiala por `docs/03-meta-ads.md`. **Insistí en una cosa**: tiene que ser un
token de **usuario del sistema** (Business Manager), no el del Graph API
Explorer.

Es el error más común de todo el proceso: el del Explorer dura **dos horas**, el
de larga duración **60 días**, y el panel deja de actualizarse sin avisar. El de
usuario del sistema no vence.

Permiso: **`ads_read`**. Nada más. Alcanza porque el panel solo lee
(`/insights`, `/campaigns` y la moneda de la cuenta). `ads_management` da
permiso de crear y modificar campañas: no lo pidas.

**Al usuario del sistema hay que darle DOS activos, no uno.** La cuenta
publicitaria (*Ver rendimiento*) y **la app** (*Desarrollar app*). Si solo le
das la cuenta, el generador de tokens dice *"No hay permisos disponibles: asigna
un rol de app al usuario del sistema"* — y ese mensaje no deja claro que habla
de otro activo.

**Y después de asignar la app, que recargue con F5.** El diálogo de *Generar
token* se queda con los permisos que había cuando se abrió: sigue diciendo "No
hay permisos disponibles" aunque el rol ya esté bien puesto. Verificado en una
instalación real; se pierde un rato largo buscando el problema en la app, en el
portfolio y en el caso de uso, cuando ya estaba resuelto.

### 3.2 Cargar y probar

`META_ACCESS_TOKEN` y `META_AD_ACCOUNT_ID` en Vercel → Redeploy.

```sql
select disparar_sync('diario');
```

Después:

```sql
select source, status, rows_written, error from sync_log
where source in ('meta','fx') order by started_at desc limit 5;

select count(*) as dias_con_gasto from daily_ad_spend;
```

**Lo que buscás:** `meta` con `status = 'ok'` y `daily_ad_spend` con filas.

**Si falla:**

| Error en `sync_log` | Qué pasó |
|---|---|
| `status = 'skipped'` | Faltan las variables, o el redeploy |
| código 190 | El token venció: usó uno del Explorer o de larga duración |
| algo con "permiso" | Al usuario del sistema le falta `ads_read` o el acceso a esa cuenta |

### 3.3 Si su cuenta de Meta está en otra moneda

Es común: tienda en pesos, cuenta de anuncios en dólares. Mirá:

```sql
select count(*) as tasas from fx_rates;
select dias_sin_tasa from period_totals(current_date - 30, current_date);
```

Si `dias_sin_tasa` es mayor que cero, esos días no tienen cotización y el panel
los muestra como "—". Explicale que es a propósito: prefiere no saber antes que
inventar un número.

**Verificación final:** captura del panel con CAC y ROAS mostrando números.

---

## Paso 4 — Mercado Libre (opcional)

Si no vende en Mercado Libre, saltealo.

### 4.1 Su propia app

Acá hay algo que tenés que explicarle bien, porque no es obvio: **necesita crear
su propia app de Mercado Libre**. No se puede compartir una.

El motivo: MeLi exige que la dirección de retorno coincida exacto con la del
panel, y la de cada persona es distinta.

Guiala por `docs/04-mercado-libre.md`:

- **URI de redirect**: `https://SU-PANEL.vercel.app/api/meli/callback`
- **Scopes**: `read` y `offline_access`
- **Topics**: sin marcar

**Pedí captura de la pantalla del redirect URI.** Es donde más se equivoca la
gente: una barra de más al final y falla con un error que no explica cuál de los
dos lados está mal.

### 4.2 Cargar y conectar

`MELI_APP_ID`, `MELI_SECRET_KEY` y `MELI_AUTH_HOST` (con su país) en Vercel →
Redeploy.

Después que entre a `https://SU-PANEL.vercel.app/api/meli/conectar` y autorice.

### 4.3 Probar

```sql
select fuente, cuenta_id, expires_at, ultimo_error from conexiones;
```

Tiene que haber una fila con `fuente = 'meli'`, un `cuenta_id` y `ultimo_error`
en `null`.

Después:

```sql
select disparar_sync('hoy');
-- esperá unos segundos
select source, status, rows_written, error from sync_log
where source = 'meli' order by started_at desc limit 3;

select canal, count(*) from daily_sales group by canal;
```

**Lo que buscás:** `meli` con `status = 'ok'`, y filas con `canal = 'meli'`.

**Si `conexiones` está vacía:** no completó la autorización. Que vuelva a
`/api/meli/conectar`.

**Si `ultimo_error` dice `invalid_grant`:** el permiso se invalidó. Que
reconecte por el mismo link.

**Si `sync_log` dice 403 con `PolicyAgent`:** Mercado Libre está bloqueando el
pedido. **Esto es lo primero que hay que descartar en la primera instalación**
y todavía no está confirmado que Vercel pueda llegarle. Si aparece, avisá y
frená ese paso: no es algo que se arregle cambiando variables.

**Verificación final:** captura del panel con el selector de canal en Mercado
Libre, mostrando sus ventas.

---

## Paso 5 — Encender el reloj

Hasta acá probaste todo disparando a mano. Ahora que corra solo.

```sql
select programar_sync();
```

Devuelve los cuatro trabajos. Verificá:

```sql
select jobname, schedule, active from cron.job order by jobname;
```

Tienen que estar `sync-hoy`, `sync-reciente`, `sync-diario` y `sync-backfill`.

> `programar_sync()` se niega si falta `app_url` o `cron_secret`. Si tira ese
> error, volvé al paso 2.3.

**Verificación:** esperá cinco minutos y mirá que el reloj esté llegando solo:

```sql
select id, status_code, created from net._http_response order by id desc limit 5;
```

Tiene que haber filas nuevas con 200, sin que vos hayas disparado nada.

---

## Paso 6 — El histórico

El backfill trae un año, de a noventa días por vuelta, y se apaga solo.

```sql
select cursor_desde, completo from sync_state where fuente = 'backfill';
```

Explicale que puede tardar hasta una hora y que no tiene que hacer nada. Puede
cerrar todo.

Cuando `completo` sea `true`, terminó.

---

## Cierre

Repasá con ella qué quedó conectado y qué no, sin adornos:

- Los servicios vinculados y los que salteó.
- Que de ahora en más no tiene que hacer nada: se actualiza solo.
- Que si algún día los números se congelan, el primer lugar donde mirar es
  `sync_log`, y que `docs/08-problemas-comunes.md` tiene los casos con su
  diagnóstico.

**Última verificación:** captura del panel con datos reales y el cartel *En
vivo* en verde.

Si algo quedó a medias, decilo explícitamente en el cierre. Una instalación con
un paso pendiente que nadie anotó es una instalación que va a fallar en dos
semanas sin que nadie sepa por qué.
