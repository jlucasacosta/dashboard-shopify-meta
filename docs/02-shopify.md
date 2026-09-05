# 2. Shopify

Acá creás una app en Shopify y sacás dos valores que va a usar el panel. Son
cuatro pantallas y no hay que programar nada.

## Por qué no alcanza con el admin de tu tienda

Antes esto se hacía desde **Ajustes → Apps → Desarrollar apps**. Shopify cerró
ese camino: hoy dice, textual, *"You can no longer create new admin-created
custom apps. For new apps, use Dev Dashboard or Shopify CLI"*.

El reemplazo es el **Dev Dashboard**, y sirve igual para dueños de tienda: la
documentación aclara que es el lugar *"whether you're a merchant creating custom
apps or a partner developing public apps"*. No necesitás cuenta de Partner
aparte, ni instalar nada.

## Crear la app

1. Entrá a **[shopify.dev/dashboard](https://shopify.dev/dashboard)** con la
   misma cuenta con la que entrás a tu tienda.
2. **Create app** → **Start from Dev Dashboard**.
3. Ponele un nombre (por ejemplo *Panel de métricas*) y **Create**.

## Elegir los permisos

En la pestaña **Versions** de tu app:

1. En **Webhooks API version**, elegí la más nueva.
2. En **Access scopes**, pegá exactamente esto:

```
read_reports,read_orders
```

3. **Release**.

Dos permisos, ninguno protegido:

| Permiso | Para qué |
|---|---|
| `read_reports` | Leer tus ventas y tu tráfico (es lo que usa el panel) |
| `read_orders` | Que Shopify pueda avisarte cuando entra un pedido |

> **No pidas `read_all_orders`.** Suena necesario porque Shopify limita los
> pedidos a los últimos 60 días, pero ese límite es del objeto `Order`, y este
> panel no lo usa: lee por ShopifyQL, que te da el histórico completo. Pedirlo
> te obliga a un trámite de aprobación manual con Shopify que no necesitás.

## Instalarla en tu tienda

1. En **Home**, bajá hasta **Install app**.
2. Elegí tu tienda y **Install**.

## Copiar los dos valores

En **API credentials** de tu app vas a ver:

| Valor | Se llama después |
|---|---|
| **Admin API access token** | `SHOPIFY_ADMIN_TOKEN` |
| **Client secret** | `SHOPIFY_API_SECRET` |

Copiá los dos ahora y guardalos en un lugar seguro.

> El token se muestra **una sola vez**. Si lo perdés no pasa nada grave: se
> genera otro desde la misma pantalla. Lo que no podés es recuperar el viejo.

Anotá también el dominio de tu tienda, el que termina en `.myshopify.com` (lo
ves en la barra del navegador cuando estás en el admin). Se va a llamar
`SHOPIFY_SHOP_DOMAIN`.

> **Si alguna vez regenerás el client secret**, los webhooks pueden fallar hasta
> **una hora**: Shopify sigue firmando un rato con el secreto viejo. No es un
> error tuyo, se arregla solo.

## Cómo saber que funcionó

Tenés anotados tres valores: el dominio `.myshopify.com`, el **Admin API access
token** y el **client secret**. Con eso alcanza; los vas a cargar en la
guía [07 — Encender el sync](07-encender-el-sync.md).
