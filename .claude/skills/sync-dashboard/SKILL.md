---
name: sync-dashboard
description: Trae los datos de Shopify y Meta Ads a Supabase para que el dashboard los muestre. Usar cuando el usuario escriba /sync, o pida "sincronizá el dashboard", "actualizá los datos", "traé las ventas", "traé lo de Meta", "el dashboard está desactualizado".
---

# Sincronizar el dashboard

## Regla número uno

**Copiás datos. No calculás nada.**

Si un MCP te da un número, lo escribís tal cual en Supabase. No lo sumás, no lo
promediás, no lo convertís, no lo redondeás.

El CAC, el ROAS, el MER y el ticket promedio los calcula la base de datos
(`daily_metrics` y `period_totals`). Si calculás vos, va a haber dos verdades
distintas y nadie va a saber cuál es la buena.

Si un dato no está, **no lo inventes ni pongas cero**. Dejá la columna sin
escribir. El dashboard sabe mostrar "sin dato"; no sabe detectar un cero falso.

---

## Antes de empezar

Necesitás tres MCPs conectados:

| MCP | Para qué |
|---|---|
| Shopify | Ventas, tráfico y productos |
| Meta Ads | Inversión publicitaria |
| Supabase | Donde se guarda todo |

Si falta alguno, **pará y decí cuál falta**. No sigas a medias: un sync
incompleto deja el dashboard mostrando números más bajos que la realidad.

Leé `sync.config.json` de la raíz del proyecto. De ahí salen `shopDomain`,
`adAccountId`, `storeCurrency`, `diasPorLote` y `diasPrimeraCorrida`.

Lo primero que hacés con eso es dejar la moneda de la tienda guardada en la
base, porque es de donde el panel la lee para formatear todos los montos:

```sql
insert into settings (key, value) values ('store_currency', 'STORE_CURRENCY')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

Va en cada corrida, no solo la primera. Es una línea y evita el peor error
callado del proyecto: si esa fila no coincide con `storeCurrency`, los números
salen bien y el símbolo de moneda sale mal, y nadie mira dos veces un símbolo.

---

## Paso 1 — Averiguar qué falta

No vuelvas a traer lo que ya está. Preguntale a Supabase hasta dónde llegó:

```sql
select coalesce(max(date), current_date - interval '365 days')::date as ultimo
from daily_sales;
```

- Si la tabla está vacía → sincronizá `diasPrimeraCorrida` días hacia atrás.
- Si tiene datos → sincronizá desde `ultimo` (inclusive, porque el día puede
  haber cambiado) hasta hoy.

Si el rango supera `diasPorLote`, **partilo en lotes** y hacé un lote por vez,
avisando el progreso. Traer 365 días de una sola vez agota el contexto y la
corrida se corta por la mitad.

---

## Paso 2 — Shopify

Tres consultas por lote, con el MCP de Shopify (`run-analytics-query`).
Reemplazá `DESDE` y `HASTA` por las fechas del lote en formato `YYYY-MM-DD`.

**Ventas:**
```
FROM sales
SHOW orders, gross_sales, discounts, sales_reversals, net_sales,
     shipping_charges, taxes, total_sales, average_order_value,
     customers, new_customers, returning_customers
TIMESERIES day SINCE DESDE UNTIL HASTA
```

**Tráfico:**
```
FROM sessions
SHOW sessions, online_store_visitors, sessions_with_cart_additions,
     sessions_that_reached_checkout, sessions_that_completed_checkout,
     conversion_rate
TIMESERIES day SINCE DESDE UNTIL HASTA
```

**Productos:**
```
FROM sales
SHOW gross_sales, net_sales, orders, net_items_sold
GROUP BY product_title, product_id
TIMESERIES day SINCE DESDE UNTIL HASTA
```

> Estas consultas están verificadas contra el MCP real. Si inventás otro nombre
> de columna, ShopifyQL te va a devolver `Column Not Found`. Dos que suenan bien
> y **no existen**: `ordered_product_quantity` (es `net_items_sold`) y
> `sessions_with_cart` (es `sessions_with_cart_additions`).

### Mapeo de columnas — Shopify a Supabase

`daily_sales`:

| ShopifyQL | Supabase |
|---|---|
| `day` | `date` |
| `orders` | `orders` |
| `gross_sales` | `gross_sales` |
| `discounts` | `discounts` |
| `sales_reversals` | `returns` |
| `net_sales` | `net_sales` |
| `shipping_charges` | `shipping` |
| `taxes` | `taxes` |
| `total_sales` | `total_sales` |
| `average_order_value` | `aov` |
| `customers` | `customers` |
| `new_customers` | `new_customers` |
| `returning_customers` | `returning_customers` |
| (de `sync.config.json`) | `currency` ← `storeCurrency` |

`daily_traffic`:

| ShopifyQL | Supabase |
|---|---|
| `day` | `date` |
| `sessions` | `sessions` |
| `online_store_visitors` | `visitors` |
| `sessions_with_cart_additions` | `sessions_with_cart` |
| `sessions_that_reached_checkout` | `sessions_reached_checkout` |
| `sessions_that_completed_checkout` | `sessions_completed_checkout` |
| `conversion_rate` | `conversion_rate` |

`daily_products`:

| ShopifyQL | Supabase |
|---|---|
| `day` | `date` |
| `product_id` | `product_id` |
| `product_title` | `product_title` |
| `gross_sales` | `gross_sales` |
| `net_sales` | `net_sales` |
| `orders` | `orders` |
| `net_items_sold` | `units` |

**Cuidado con el texto vacío.** Cuando no hubo pedidos, Shopify devuelve `""`
(no `0`) en `average_order_value` y en `conversion_rate`. Escribilo como `NULL`,
nunca como cero: son cosas distintas y el dashboard las muestra distinto.

Descartá las filas de productos donde `product_id` venga vacío: son el total
del día, no un producto.

---

## Paso 3 — Meta Ads

Primero verificá que la cuenta esté habilitada, con `ads_get_ad_accounts`.

Buscá tu `adAccountId` en la respuesta y mirá `is_ads_mcp_enabled`:

- **Si es `false`** → Meta todavía no habilitó el conector para esa cuenta.
  Registralo y seguí sin ads:
  ```sql
  insert into sync_log (source, status, finished_at, error, date_from, date_to)
  values ('meta', 'skipped', now(),
          'is_ads_mcp_enabled = false: Meta todavía no habilitó el conector en esta cuenta',
          'DESDE', 'HASTA');
  ```
  Después decile al usuario, sin vueltas, que hasta que Meta habilite el
  conector no va a haber CAC, ROAS, MER ni contribución, porque son las
  métricas que necesitan la inversión. No hay forma de cargarla por afuera:
  los datos entran solo por acá.
  **No abandones el sync**: las ventas de Shopify se traen igual.

- **Si es `true`** → seguí. Anotá también el `currency` de la cuenta: lo vas a
  necesitar en el paso 4.

Con `ads_get_ad_entities`, dos llamadas por lote:

**Total de la cuenta, día por día:**
```
ad_account_id:  el de sync.config.json
level:          "ad_account"
fields:         ["amount_spent","impressions","clicks","reach","frequency","ctr","cpc","cpm"]
time_increment: "1"
time_range:     {"since":"DESDE","until":"HASTA"}
```

**Por campaña, día por día:** igual pero con `level: "campaign"` y agregando
`"campaign_name"`, `"status"` y `"objective"` a `fields`.

> El campo se llama **`amount_spent`**, no `spend` (`spend` funciona como alias,
> pero `amount_spent` es el nombre canónico). Verificado con
> `ads_get_field_context`. `purchases` y `purchase_value` **no existen** con esos
> nombres: si los necesitás, buscá el nombre real con `ads_get_field_context`
> antes de pedirlos, no los adivines.
>
> `time_increment` va como **string** (`"1"`), no como número.

### Mapeo de campos — Meta a Supabase

`daily_ad_spend` (clave: `date` + `ad_account_id`):

| Meta | Supabase |
|---|---|
| fecha de la fila | `date` |
| `adAccountId` del config | `ad_account_id` |
| `amount_spent` | `spend` |
| `impressions` | `impressions` |
| `clicks` | `clicks` |
| `reach` | `reach` |
| `frequency` | `frequency` |
| `ctr` | `ctr` |
| `cpc` | `cpc` |
| `cpm` | `cpm` |
| moneda de la cuenta | `currency` |
| fijo | `source` = `'mcp'` |

`daily_ad_campaigns` (clave: `date` + `campaign_id`): igual, más `campaign_id`,
`campaign_name`, `status` y `objective`.

**`source` va siempre en `'mcp'`.** El panel es de solo lectura: vos sos lo
único que escribe en estas tablas. El valor `'manual'` quedó de cuando existía
una pantalla para cargar el gasto a mano; no lo uses.

---

## Paso 4 — Tipo de cambio

**Saltealo** si la moneda de la cuenta de Meta es igual a `storeCurrency`.

Si son distintas, el gasto no se puede comparar con la facturación hasta
convertirlo. La conversión la hace la base, pero necesita la tasa de cada día.

Fijate qué fechas faltan:

```sql
select d::date as falta
from generate_series('DESDE'::date, 'HASTA'::date, '1 day') d
where not exists (
  select 1 from fx_rates f
  where f.date = d::date
    and f.base_currency  = 'MONEDA_META'
    and f.quote_currency = 'MONEDA_TIENDA'
);
```

Para cada fecha faltante, pedí la tasa de **ese día** (no la de hoy):

```
https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@YYYY-MM-DD/v1/currencies/{base_en_minuscula}.json
```

La respuesta trae `{"date":"...","usd":{"uyu":40.27,...}}`. Tomá el valor de la
moneda de la tienda en minúscula y escribilo en `fx_rates`.

Si la API falla para una fecha, **dejala sin tasa**. El dashboard va a mostrar
CAC y ROAS como "sin dato" para ese día y avisa que la inversión está
incompleta. Es mucho mejor que inventar una tasa: un ROAS con la tasa
equivocada se ve perfectamente normal y está mal por un factor de 40.

---

## Paso 5 — Escribir en Supabase

Usá el MCP de Supabase, en lotes de 100 filas como máximo.

Todas las tablas usan `on conflict` sobre su clave, así que volver a
sincronizar un día ya traído lo actualiza en vez de duplicarlo:

```sql
insert into daily_sales (date, orders, gross_sales, ...)
values (...), (...), ...
on conflict (date) do update set
  orders = excluded.orders,
  gross_sales = excluded.gross_sales,
  ...,
  updated_at = now();
```

Claves de cada tabla:

| Tabla | `on conflict` |
|---|---|
| `daily_sales` | `(date)` |
| `daily_traffic` | `(date)` |
| `daily_ad_spend` | `(date, ad_account_id)` |
| `daily_ad_campaigns` | `(date, campaign_id)` |
| `daily_products` | `(date, product_id)` |
| `fx_rates` | `(date, base_currency, quote_currency)` |

---

## Paso 6 — Dejar registro

Una fila en `sync_log` por fuente y por corrida:

```sql
insert into sync_log (source, status, finished_at, rows_written, date_from, date_to, error)
values ('shopify', 'ok', now(), 123, 'DESDE', 'HASTA', null);
```

`source` puede ser `'shopify'`, `'meta'` o `'fx'`.
`status` puede ser `'ok'`, `'error'` o `'skipped'`.

El dashboard lee esta tabla para avisar cuando algo se salteó. Si no escribís
acá, el usuario no se entera de que le faltan datos.

---

## Paso 7 — Contar qué pasó

Terminá con un resumen corto y concreto:

- Qué rango de fechas cubriste
- Cuántas filas escribiste en cada tabla
- Qué se salteó y por qué
- Si quedaron días sin tipo de cambio

Si Meta quedó salteado, decí qué métricas quedan sin poder calcularse por eso.

---

## Errores frecuentes

| Síntoma | Qué pasa | Qué hacer |
|---|---|---|
| `Column Not Found` en ShopifyQL | Inventaste un nombre de columna | Usá las consultas de arriba tal cual |
| `is_ads_mcp_enabled: false` | Meta no habilitó el conector en esa cuenta | Registrá `skipped` y seguí con Shopify |
| El sync se corta por la mitad | Rango muy grande | Bajá `diasPorLote` en `sync.config.json` |
| CAC y ROAS aparecen como "—" | Faltan tasas de cambio o falta el gasto | Revisá `fx_rates` y `sync_log` |
| Los totales no cierran con Shopify | El mapeo de columnas está mal | Corregí el mapeo, **nunca** la vista `daily_metrics` |
