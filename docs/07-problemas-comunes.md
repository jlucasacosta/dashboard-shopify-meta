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

## El link del correo no me deja entrar

**Síntoma:** hacés clic en el link y volvés a la pantalla de login, o caés en
una página que no existe.

**Causa:** la dirección no está en la lista de Supabase. Supabase ignora tu
pedido **sin avisar** y usa la Site URL por defecto.

**Solución:** Supabase → **Authentication → URL Configuration → Redirect URLs**.
Agregá la dirección desde la que estás entrando, con `/**` al final:

```
http://localhost:3000/**
https://tu-proyecto.vercel.app/**
```

Es el error más común al publicar en Vercel, porque hasta ese momento todo
funcionaba en tu compu.

---

## `is_ads_mcp_enabled: false`

**Síntoma:** Claude dice que tu cuenta publicitaria no tiene el conector
habilitado.

**Causa:** Meta lo está liberando de a poco. No hay nada que configurar.

**Solución:** usá la pantalla **Gasto manual** para cargar la inversión de cada
día. El CAC y el ROAS funcionan igual. Probá de nuevo cada un par de semanas.

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
