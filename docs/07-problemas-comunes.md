# 7. Problemas comunes

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

## `is_ads_mcp_enabled: false`

**Síntoma:** Claude dice que tu cuenta publicitaria no tiene el conector
habilitado.

**Causa:** Meta lo está liberando de a poco. No hay nada que configurar.

**Solución:** ninguna de tu lado, y no es una respuesta cómoda. Hasta que Meta
habilite el conector no vas a tener CAC, ROAS, MER ni contribución: el panel te
los muestra como "—" y te dice por qué. Las ventas, el tráfico y los productos
se siguen trayendo normal. Probá de nuevo cada un par de semanas.

---

## El ROAS me da un número absurdo

**Síntoma:** ROAS de 150x, o de 0,08x.

**Causa:** casi siempre, monedas mezcladas. Tu tienda factura en pesos y tu
cuenta de Meta gasta en dólares.

**Solución:** revisá que `storeCurrency` en `sync.config.json` sea la moneda de
**tu tienda**. Después corré `/sync` de nuevo para que traiga los tipos de
cambio.

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

**Síntoma:** el puntito está verde, corrés `/sync`, y el panel no se mueve.

**Causa:** hay dos requisitos que fallan en silencio. El canal reporta que se
conectó igual, y no aparece ningún error en ningún lado.

**Solución:** corré el diagnóstico:

```bash
npm run test:realtime
```

Te dice si el problema está en la base o en el navegador. Si falla, revisá que
las migraciones `0003` se hayan ejecutado completas: incluyen
`REPLICA IDENTITY FULL`, que es lo que le permite a Supabase evaluar los
permisos sobre la fila que cambió.

---

## `npx supabase start` falla la primera vez

**Síntoma:** un error que dice `LegacyImagePrepullError` o
`failed to inspect docker image`.

**Causa:** Docker todavía está descargando las imágenes.

**Solución:** volvé a correr el mismo comando. La segunda vez funciona.

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

## Claude dice que le falta un MCP

**Síntoma:** al correr `/sync`, Claude avisa que no tiene Shopify, Meta o
Supabase conectado.

**Causa:** los MCP se conectan cuando Claude Code arranca.

**Solución:** cerrá Claude Code y volvé a abrirlo. Si lo agregaste con Claude ya
abierto, no lo va a ver hasta reiniciar.

---

## `/sync` se corta por la mitad

**Síntoma:** empieza a traer datos y se detiene sin terminar.

**Causa:** el rango de fechas es muy grande para una sola corrida.

**Solución:** bajá `diasPorLote` en `sync.config.json` de 90 a 30, y volvé a
correr `/sync`. Lo que ya se trajo no se pierde: continúa desde donde quedó.

---

## Los números no coinciden con Shopify

**Síntoma:** el panel dice una facturación y Shopify dice otra.

**Causa:** el mapeo de columnas está mal.

**Solución:** decíselo a Claude, con los dos números concretos, y pedile que
revise el mapeo de la skill `sync-dashboard`.

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
