# 2. Shopify

Acá creás una app en Shopify y sacás dos valores que va a usar el panel. Son
cinco pantallas y no hay que programar nada.

> Hay una versión de esta guía **con capturas de cada pantalla**:
> [docs/guia-visual.html](guia-visual.html). Abrila en el navegador.

## Por qué no alcanza con el admin de tu tienda

Antes esto se hacía desde **Configuración → Apps → Desarrollar apps**. Shopify
cerró ese camino: si entrás hoy, esa pantalla solo dice *"Crea y gestiona apps
en tu Dev Dashboard"* y te manda para allá.

El **Dev Dashboard** sirve igual para dueños de tienda: no necesitás cuenta de
Partner aparte, ni instalar nada. Es la misma cuenta con la que entrás a tu
tienda.

## Crear la app

1. Entrá a **[dev.shopify.com/dashboard](https://dev.shopify.com/dashboard)**
   con la misma cuenta con la que entrás a tu tienda.

   > Ojo: es `dev.shopify.com`, no `shopify.dev`. La segunda es la
   > documentación y `/dashboard` ahí da *Page not found*.

2. Arriba a la derecha fijate qué **organización** está activa. Tiene que ser la
   misma a la que pertenece tu tienda; si tenés más de una, elegí bien acá, porque
   más adelante Shopify se niega a darle token a una app que está en otra
   organización que la tienda.
3. Abajo, **Obtener credenciales de API → Crear app**.
4. En la tarjeta **Empezar desde el Dev Dashboard** (la de la derecha, no la de
   la CLI), poné un nombre, por ejemplo *Panel de metricas*, y **Crear app**.

## Elegir los permisos

Al crear la app, Shopify te lleva directo a **Crear versión**. Es una sola
pantalla larga:

1. **URL de la app**: dejala como está (`https://example.com`). El panel no es
   una app embebida; esa URL no se usa para nada.
2. **Versión de la API de webhooks**: la más nueva que ofrezca.
3. En **Acceso a la API → Alcances**, pegá exactamente esto:

```
read_reports,read_orders
```

4. **Lanzar**, y en el cuadro de confirmación, **Lanzar** otra vez. Nombre y
   mensaje de la versión son opcionales.

Dos permisos, ninguno protegido:

| Permiso | Para qué |
|---|---|
| `read_reports` | Leer tus ventas y tu tráfico (es lo que usa el panel) |
| `read_orders` | Que Shopify pueda avisarte cuando entra un pedido |

> **No pidas `read_all_orders`.** Suena necesario porque Shopify limita los
> pedidos a los últimos 60 días, pero ese límite es del objeto `Order`, y este
> panel no lo usa: lee por ShopifyQL, que te da el histórico completo. Pedirlo
> te obliga a un trámite de aprobación manual con Shopify que no necesitás.

Cuando termina, en **Versiones** ves dos filas: la 1 (la vacía que se creó con
la app) y la 2 con la etiqueta **Activa**. Esa es la tuya.

## Instalarla en tu tienda

1. Volvé al **Panel general** de la app (el nombre de la app en el menú de la
   izquierda).
2. En la tarjeta **Instalaciones**, botón **Instalar app**.
3. Se abre el admin de Shopify. Si te pregunta, elegí tu tienda.
4. Aparece un cartel amarillo *"Esta app aún no se ha revisado"*. Es normal: la
   app es tuya, nadie la revisa. Abajo dice qué va a poder ver (pedidos e
   informes). **Instalar**.
5. El admin abre la app y muestra *"Example Domain"*. También es normal: es la
   URL de mentira del paso anterior. Cerrá esa pestaña.

De vuelta en el Dev Dashboard, **Instalaciones** ahora dice **1**.

## Copiar los dos valores

En el menú de la izquierda, **Configuración de la app**. Arriba de todo está
**Credenciales**:

| Valor | Se llama después |
|---|---|
| **ID de cliente** | `SHOPIFY_CLIENT_ID` |
| **Secreto** (el ojo lo muestra, el botón lo copia) | `SHOPIFY_API_SECRET` |

Anotá también el dominio de tu tienda, el que termina en `.myshopify.com` (lo
ves en la barra del navegador cuando estás en el admin). Se va a llamar
`SHOPIFY_SHOP_DOMAIN`.

> **¿Y el token?** No hay. Las apps del Dev Dashboard no muestran ningún
> *Admin API access token*: eso era de las apps viejas. El panel se lo pide a
> Shopify solo, con el ID y el secreto, y lo renueva cada 24 horas sin que
> hagas nada. Si leés una guía que te manda a buscar el token, es vieja.

> **Si alguna vez rotás el secreto**, el panel deja de poder pedir tokens hasta
> que cargues el nuevo, y los webhooks pueden fallar hasta **una hora** más:
> Shopify sigue firmando un rato con el secreto viejo. No es un error tuyo.

## Cómo saber que funcionó

Cargá los tres valores en `.env.local` (guía 07 explica dónde va cada cosa) y
corré:

```bash
npm run shopify:probar
```

Tiene que decir que consiguió el token, listar los scopes con `read_reports` y
`read_orders`, y responder una consulta de los últimos 7 días. Si dice
`shop_not_permitted`, la app y la tienda están en organizaciones distintas del
Dev Dashboard: volvé al paso 2 de *Crear la app*.

Con eso, seguís en [07 — Encender el sync](07-encender-el-sync.md).
