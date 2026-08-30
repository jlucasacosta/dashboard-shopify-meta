# 4. Primera sincronización

Llegó el momento de traer tus datos de verdad.

## Antes de arrancar

Revisá que `sync.config.json` tenga tus datos:

```json
{
  "shopDomain": "mitienda.myshopify.com",
  "adAccountId": "123456789012345",
  "storeCurrency": "UYU",
  "diasPorLote": 90,
  "diasPrimeraCorrida": 365
}
```

Si ejecutaste el seed de datos de mentira, borralos ahora para que no se mezclen:

```bash
npm run db:sql -- -c "truncate daily_sales, daily_traffic, daily_ad_spend, daily_ad_campaigns, daily_products, fx_rates cascade;"
```

## Sincronizar

En Claude Code:

```
/sync
```

La primera vez trae un año entero, así que va a tardar unos minutos y lo va a
hacer por partes. Vas a ver el progreso lote por lote.

Para probar rápido primero, pedile solo una semana:

```
/sync 7
```

## Qué te tiene que contar Claude al terminar

Un resumen con:

- Qué rango de fechas cubrió
- Cuántas filas escribió en cada tabla
- Qué se salteó y por qué
- Si quedaron días sin tipo de cambio

Si dice que salteó Meta, andá a la pantalla **Gasto manual**. Es lo esperado si
tu cuenta todavía no está habilitada.

## Verificar que los números cierran

Este paso es el que más vale la pena y casi nadie hace.

Abrí el panel de Shopify, andá a **Analytics**, elegí los últimos 30 días y
anotá las **ventas totales**. Después abrí tu panel con el mismo período.

**Tienen que coincidir exactamente.** Si no coinciden, algo se está mapeando
mal. Decíselo a Claude:

> Las ventas totales de los últimos 30 días no coinciden con las de Shopify.
> El panel dice X y Shopify dice Y. Revisá el mapeo de la skill sync-dashboard.

> **Importante:** el problema se arregla en el mapeo, **nunca** tocando la vista
> `daily_metrics`. Esa vista es la que define qué significa cada métrica; si la
> retocás para que "dé bien", vas a romper el resto sin darte cuenta.

## Mantenerlo al día

De ahí en adelante, `/sync` solo trae lo que falta desde la última vez. Toma
segundos.

Cuando tengas el panel abierto y corras `/sync` en otra ventana, **los números
se van a actualizar solos**, sin recargar. Ese es el punto verde de "En vivo"
arriba a la izquierda.

## Cómo saber que funcionó

El panel muestra tus ventas reales y coinciden con Shopify.
