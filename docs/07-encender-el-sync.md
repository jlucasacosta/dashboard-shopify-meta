# 7. Encender el sync

Hasta acá tenés el panel online pero vacío. Este paso lo pone a traer datos
solo, para siempre. Es el último de la instalación.

## Cómo funciona, en dos renglones

Tu base de datos tiene un reloj adentro. Cada 5 minutos le toca el timbre a tu
panel, y el panel va a buscar a Shopify y a Mercado Libre qué cambió. Además,
cuando entra una venta, Shopify avisa en el momento y el panel marca ese día
para refrescarlo en la próxima vuelta.

No hay ningún servidor extra que mantener ni pagar. El reloj es de Supabase y el
trabajo lo hace tu propio panel.

## 1. Cargar las variables en Vercel

En **vercel.com → tu proyecto → Settings → Environment Variables**, agregá las
que juntaste en las guías anteriores:

| Variable | De dónde salió |
|---|---|
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API Keys → `service_role` |
| `SHOPIFY_SHOP_DOMAIN` | Tu dominio `.myshopify.com` (guía 02) |
| `SHOPIFY_ADMIN_TOKEN` | Guía 02 |
| `SHOPIFY_API_SECRET` | Guía 02 (client secret) |
| `META_ACCESS_TOKEN` | Guía 03 — opcional |
| `META_AD_ACCOUNT_ID` | Guía 03 — opcional |
| `MELI_APP_ID` | Guía 04 — opcional |
| `MELI_SECRET_KEY` | Guía 04 — opcional |
| `MELI_AUTH_HOST` | `https://auth.mercadolibre.com.uy` (cambiá el país) |
| `APP_URL` | La URL de tu panel, sin barra al final |
| `STORE_CURRENCY` | `UYU`, `ARS`, `USD`… |
| `CRON_SECRET` | Lo inventás vos, ver abajo |

Para `CRON_SECRET` necesitás una cadena larga y al azar. Cualquiera sirve
mientras sea larga y no la use en otro lado. Si tenés a mano una terminal:

```bash
openssl rand -hex 32
```

> **Ninguna de estas lleva `NEXT_PUBLIC_`.** Ese prefijo le dice a Next que la
> mande al navegador, y ahí quedan públicas para siempre. Las dos únicas que sí
> lo llevan son las de Supabase que ya cargaste en la guía 06.

Después de agregarlas, **volvé a desplegar**: Vercel solo las toma en un deploy
nuevo. Alcanza con **Deployments → … → Redeploy**.

## 2. Avisarle a Shopify a dónde escribir

Desde tu computadora, en la carpeta del proyecto, todo en una línea:

```bash
SHOPIFY_SHOP_DOMAIN=tu-tienda.myshopify.com SHOPIFY_ADMIN_TOKEN=shpat_... APP_URL=https://tu-panel.vercel.app npm run webhooks:registrar
```

Tiene que terminar diciendo:

```
ORDERS_CREATE: ok
ORDERS_UPDATED: ok
REFUNDS_CREATE: ok

Listo. Correrlo de nuevo no cambia nada.
```

Correrlo dos veces es seguro: el script primero pregunta qué hay y después
arregla lo que falte. Está hecho así justamente porque la función de Shopify que
crea webhooks **no** es idempotente — llamada dos veces crea dos suscripciones y
te manda cada pedido por duplicado.

## 3. Poner en marcha el reloj

En Claude Code, pedile que corra esto en tu proyecto de Supabase, cambiando los
dos valores por los tuyos (el `cron_secret` tiene que ser **el mismo** que
cargaste en Vercel):

```sql
insert into config_servidor (key, value) values
  ('app_url',     'https://tu-panel.vercel.app'),
  ('cron_secret', 'el-mismo-que-pusiste-en-vercel')
on conflict (key) do update set value = excluded.value;

select programar_sync();
```

Te va a devolver los cuatro trabajos agendados:

| Trabajo | Cada cuánto | Qué hace |
|---|---|---|
| `sync-hoy` | 5 minutos | El día en curso |
| `sync-reciente` | 1 hora | Los últimos 7 días |
| `sync-diario` | 1 vez por día | Meta, tipo de cambio y 30 días |
| `sync-backfill` | 10 minutos | Trae el histórico y se apaga solo |

> `programar_sync()` se niega a agendar si falta alguno de los dos valores. Es a
> propósito: si no, los trabajos correrían en vano cada 5 minutos.

Si alguna vez querés frenar todo: `select apagar_sync();`

## 4. Esperar el histórico

El backfill trae un lote de 90 días por vuelta, hacia atrás, hasta completar un
año. Con una vuelta cada 10 minutos, en menos de una hora está todo.

Para ver cómo va:

```sql
select * from sync_state where fuente = 'backfill';
```

Cuando `completo` sea `true`, terminó y ese trabajo deja de correr solo.

## 5. Conectar Mercado Libre

Si hiciste la guía 04, ahora sí: entrá a
`https://tu-panel.vercel.app/api/meli/conectar` y autorizá.

## Cómo saber que funcionó

Tres señales, en orden:

1. **En la base**, `select * from sync_log order by started_at desc limit 10;`
   tiene filas con `status = 'ok'`.
2. **En el panel**, los números dejan de estar en cero y el cartel de arriba a
   la derecha dice *En vivo*.
3. **La prueba de fuego**: hacé una venta de prueba en tu tienda. En menos de
   5 minutos tiene que aparecer sin que toques nada.

Si algo de esto no pasa, `sync_log` te dice cuál fuente falló y por qué. Está
hecho para eso: una fuente que se rompe queda anotada y las demás siguen
andando.
