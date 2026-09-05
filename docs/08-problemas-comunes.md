# 8. Problemas comunes

Ordenados por probabilidad de que te pasen.

---

## Los botones no responden y no aparece ningún error

**Síntoma:** la página se ve bien, pero apretás "Enviar link de acceso" y no
pasa nada, o el formulario se limpia solo.

**Causa:** entraste por `http://127.0.0.1:3000` en vez de
`http://localhost:3000`. Para el navegador son dos sitios distintos, y Next.js
bloquea por seguridad los archivos que se piden entre sitios distintos. Los
scripts dan error 403, la página nunca "despierta", y no se ve ningún aviso.

**Solución:** entrá por `http://localhost:3000`.

El proyecto ya incluye los dos en `allowedDevOrigins` dentro de
`next.config.ts`, así que debería andar igual. Si tu servidor está en otro
puerto o dirección, agregala ahí.

---

## Me dice que mi email no está habilitado

**Síntoma:** *"Ese email no está habilitado para entrar."*

**Causa:** el panel es privado y ese correo no está dado de alta. No es un error:
es el comportamiento esperado.

**Solución:**

```bash
npm run usuario:crear -- vos@tutienda.com
```

Si estás en tu panel publicado, agregale las credenciales de tu proyecto de la
nube (ver [la guía de Vercel](06-vercel.md)). Un usuario creado en tu máquina
**no** existe en la nube: son dos bases distintas.

---

## El correo me llega con un link, no con un código

**Síntoma:** la pantalla te pide un código pero el correo trae un botón o un link.

**Causa:** la plantilla del correo en tu proyecto de la nube sigue siendo la de
Supabase por defecto.

**Solución:** **Authentication → Emails → Magic Link**, y cambiá
`{{ .ConfirmationURL }}` por `{{ .Token }}`. El contenido completo está en
`supabase/templates/magic_link.html`.

---

## El código no me lo toma

**Síntoma:** *"Ese código no es correcto"* o *"El código venció"*.

**Causas y qué hacer:**

- **Venció:** dura 15 minutos. Pedí uno nuevo con *Usar otro correo* y volvé a
  entrar tu email.
- **Es viejo:** si pediste varios códigos, solo sirve el último.
- **Está mal copiado:** la pantalla ignora espacios y guiones, así que podés
  pegarlo como venga. Lo que no perdona es un dígito cambiado.

---

## Pedí muchos códigos y ahora no me manda ninguno

**Síntoma:** *"Pediste varios códigos seguidos. Esperá un minuto."*

**Causa:** Supabase limita cuántos correos manda seguidos, para que nadie use tu
proyecto para spamear.

**Solución:** esperá un minuto. No hay nada roto.

---

## No aparece el gasto de anuncios

**Síntoma:** el panel muestra ventas pero CAC, ROAS, MER y contribución están
en "—".

**Causa:** las cuatro necesitan saber cuánto invertiste. Mirá `sync_log`:

```sql
select * from sync_log where source = 'meta' order by started_at desc limit 5;
```

- `status = 'skipped'` → falta `META_ACCESS_TOKEN` o `META_AD_ACCOUNT_ID` en
  Vercel. Es opcional a propósito: el resto del panel anda igual.
- `status = 'error'` con código 190 → el token venció o lo revocaron. Pasa
  cuando se usó uno del Graph API Explorer (dura 2 horas) o uno de larga
  duración (60 días) en vez de uno **de usuario del sistema**, que no vence.
  Ver [03 — Meta Ads](03-meta-ads.md).
- `status = 'error'` con "permiso" → al usuario del sistema le falta `ads_read`
  o el acceso a esa cuenta publicitaria.

---

## El ROAS me da un número absurdo

**Síntoma:** ROAS de 150x, o de 0,08x.

**Causa:** casi siempre, monedas mezcladas. Tu tienda factura en pesos y tu
cuenta de Meta gasta en dólares.

**Solución:** revisá que `STORE_CURRENCY` en Vercel sea la moneda de **tu
tienda**. Si la cambiás, volvé a desplegar y esperá a que corra `sync-diario`
(o dispará el trabajo a mano) para que traiga los tipos de cambio.

Si el panel te avisa *"X días no tienen tipo de cambio guardado"*, es eso: la
inversión real fue mayor que la que ves.

---

## CAC o ROAS aparecen como "—"

**Síntoma:** una tarjeta muestra un guion en vez de un número.

**Causa:** falta un dato para calcularlo. Puede ser que no haya inversión ese
día, que no haya clientes nuevos, o que falte el tipo de cambio.

**Esto es a propósito.** El panel prefiere decirte "no sé" antes que mostrarte
un número inventado. Debajo del guion está la explicación de qué falta.

---

## Realtime dice "En vivo" pero no se actualiza nada

**Síntoma:** el puntito está verde, entra una venta, y el panel no se mueve.

**Causa:** hay dos requisitos que fallan en silencio. El canal reporta que se
conectó igual, y no aparece ningún error en ningún lado.

**Solución:** corré el diagnóstico, con las credenciales de tu proyecto en la
misma línea:

```bash
SUPABASE_URL=https://xxxxx.supabase.co SUPABASE_ANON_KEY=eyJ... SUPABASE_SERVICE_KEY=eyJ... npm run test:realtime
```

Te dice si el problema está en la base o en el navegador. Si falla, revisá que
las migraciones `0003` y `0008` se hayan ejecutado completas: incluyen
`REPLICA IDENTITY FULL`, que es lo que le permite a Supabase evaluar los
permisos sobre la fila que cambió.

Antes de culpar a Realtime, confirmá que el sync esté escribiendo algo:
`select * from sync_log order by started_at desc limit 5;`. Si no hay filas
nuevas, el problema es el cron, no el navegador — mirá el caso de abajo.

---

## Claude dice que no tiene el MCP de Supabase

**Síntoma:** le pedís que aplique las migraciones y responde que no puede, o no
encuentra ninguna herramienta de Supabase.

**Causa:** los MCP se conectan cuando arranca Claude Code. Si armaste
`.mcp.json` con la sesión abierta, esa sesión no lo ve.

**Solución:** cerrá Claude Code y volvé a abrirlo. Si sigue igual, revisá que
`.mcp.json` tenga tu `project_ref` de verdad y no `TU_PROJECT_REF`, y
autenticá el servidor desde una terminal normal con `claude /mcp`.

---

## Las tablas no existen

**Síntoma:** el panel no muestra nada, o `npm run nube:verificar` dice que
faltan tablas.

**Causa:** las migraciones no se aplicaron, o se aplicaron a medias.

**Solución:** pedile a Claude *aplicá las migraciones de
`supabase/migrations/` en orden numérico y mostrame cuáles ya estaban*. El
orden importa: cada una asume que la anterior corrió.

---

## Después de `npm run build`, todas las páginas dan 404

**Síntoma:** corriste `npm run build` y ahora `npm run dev` responde
**404 This page could not be found** en todas las rutas, incluso en `/login`.

**Causa:** `build` y `dev` escriben en la misma carpeta `.next`, y la que dejó
el build no le sirve al servidor de desarrollo.

**Solución:** borrá esa carpeta y arrancá de nuevo.

```bash
rm -rf .next && npm run dev
```

En Windows, si `rm` no existe: `rmdir /s /q .next`.

---

## El panel no se actualiza nunca

**Síntoma:** los datos quedaron congelados y `sync_log` no tiene filas nuevas.

**Causa:** el reloj no está corriendo, o no llega al panel.

**Solución:** revisá en este orden.

**1. ¿Están agendados los trabajos?**

```sql
select jobname, schedule, active from cron.job;
```

Si está vacío, faltó `select programar_sync();` — ver
[07 — Encender el sync](07-encender-el-sync.md).

**2. ¿Llega el pedido al panel?**

```sql
select id, status_code, error_msg from net._http_response order by id desc limit 5;
```

- `401` → el `cron_secret` de `config_servidor` no coincide con el `CRON_SECRET`
  de Vercel. Tienen que ser idénticos.
- `404` → la `app_url` de `config_servidor` está mal escrita.
- `error_msg` con timeout → el panel tardó demasiado; suele arreglarse solo en
  la vuelta siguiente.

**3. ¿Está cargado todo en Vercel?** Si falta `SUPABASE_SERVICE_KEY` o una
variable de Shopify, el endpoint devuelve 500 con el nombre de la que falta.
Acordate de **volver a desplegar** después de agregarlas.

---

## Shopify dejó de avisar cuando entra una venta

**Síntoma:** las ventas aparecen recién en la pasada de la hora, no en 5 minutos.

**Causa:** el webhook no está registrado, o apunta a una URL vieja.

**Solución:** volvé a correr `npm run webhooks:registrar` con tu `APP_URL`
actual. Es seguro correrlo las veces que quieras: consulta lo que hay antes de
crear nada, y borra los duplicados.

Si el panel devuelve **401** a Shopify, el `SHOPIFY_API_SECRET` de Vercel no es
el client secret de la app. Y si acabás de regenerarlo, esperá una hora: Shopify
sigue firmando un rato con el viejo.

---

## Mercado Libre dejó de traer ventas

**Síntoma:** las ventas de Shopify se actualizan, las de MeLi no.

**Causa:** casi siempre, la conexión se rompió.

**Solución:**

```sql
select expires_at, ultimo_error from conexiones where fuente = 'meli';
```

Si `ultimo_error` dice algo con `invalid_grant`, el permiso se invalidó y hay
que reconectar: entrá a `https://tu-panel.vercel.app/api/meli/conectar`.

Pasa porque el permiso que da Mercado Libre es **de un solo uso y rota** en cada
renovación. El panel lo renueva bajo llave para que dos procesos no se pisen,
pero si algo interrumpe la renovación no hay vuelta atrás automática.

---

## Los números no coinciden con Shopify

**Síntoma:** el panel dice una facturación y Shopify dice otra.

**Causa:** el mapeo de columnas está mal.

**Solución:** decíselo a Claude, con los dos números concretos, y pedile que
revise el mapeo en `lib/sync/shopify.ts`.

Ojo con una diferencia que **no** es un error: el panel filtra bots
(`human_or_bot_session = 'human'`), así que sus sesiones van a ser menos que las
de un informe de Shopify que no las filtre.

**No cambies la vista `daily_metrics` para que "dé bien".** Esa vista define qué
significa cada métrica. Si la retocás, vas a romper el resto sin enterarte.

---

## Vercel publica pero la página muestra un error de variable

**Síntoma:** la página dice que falta `NEXT_PUBLIC_SUPABASE_URL`.

**Causa:** las variables no están cargadas en Vercel, o se cargaron después del
deploy.

**Solución:** **Settings → Environment Variables**, agregalas, y después
**Deployments → ⋯ → Redeploy**. El redeploy es obligatorio: las variables no se
aplican solas a un deploy ya hecho.
