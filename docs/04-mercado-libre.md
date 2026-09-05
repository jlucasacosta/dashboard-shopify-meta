# 4. Mercado Libre

Mercado Libre es el **segundo canal de venta** del panel. Sus ventas se suman a
las de Shopify, y podés verlas juntas o separadas con el selector de canal.

> **Este paso es opcional.** Si no vendés en Mercado Libre, saltealo: el panel
> funciona con Shopify solo.

## Antes de empezar: necesitás tu propia app

Con Shopify y con Meta pegás un token y listo. Mercado Libre no: exige que vos
autorices desde tu cuenta, y la app tiene que declarar **exactamente** a qué
dirección vuelve después de autorizar.

Como esa dirección es la URL de **tu** panel, y la de cada persona es distinta,
**no se puede compartir una app entre varias instalaciones**. Cada quien crea la
suya. Son cinco minutos.

Por eso este paso va **después** de publicar en Vercel: necesitás tu URL
definitiva. Si todavía no la tenés, hacé primero
[05 — GitHub](05-github.md) y [06 — Vercel](06-vercel.md), y volvé acá.

## Crear la app

1. Entrá al devcenter de Mercado Libre de tu país:
   **[developers.mercadolibre.com.uy](https://developers.mercadolibre.com.uy)**
   (cambiá `.com.uy` por `.com.ar`, `.com.br`, `.com.mx`, según corresponda).
2. **Crear aplicación**.
3. Completá nombre y descripción.

## Los tres campos que importan

**URI de redirect** — pegá exactamente esto, cambiando el dominio por el tuyo:

```
https://tu-panel.vercel.app/api/meli/callback
```

> Tiene que coincidir **carácter por carácter** con tu URL. Sin barra al final,
> sin `www` de más, y con `https`. La documentación de Mercado Libre lo dice
> así: *"the URL cannot contain variable information"*. Si no coincide, la
> conexión falla con un error que no explica cuál de los dos lados está mal.

**Scopes** — marcá:

- `read` (leer tus ventas)
- `offline_access` (poder seguir leyendo sin que vuelvas a autorizar cada rato)

**Topics / Notificaciones** — dejalos **sin marcar**.

## Por qué no usamos las notificaciones de Mercado Libre

Mercado Libre te avisa por webhook cuando hay una venta, pero exige que tu
servidor conteste en **500 milisegundos** o te desactiva las notificaciones —
y no te avisa que lo hizo.

Medio segundo no alcanza cuando el servidor viene de estar dormido, que es casi
siempre en una tienda chica. El resultado sería que un día dejan de llegar y no
te enterás.

Además, la notificación de Mercado Libre **no trae los datos**: solo avisa que
algo cambió, y hay que ir a buscarlo igual. Así que el panel va directo a
buscar: pregunta cada 5 minutos qué ventas cambiaron. Se pierden segundos de
inmediatez y se gana algo que no se rompe solo.

## Copiar las credenciales

De la pantalla de tu app, copiá:

| Valor | Se llama después |
|---|---|
| **App ID** | `MELI_APP_ID` |
| **Secret Key** | `MELI_SECRET_KEY` |

## Conectar tu cuenta

Esto va **después** de cargar las variables en Vercel (guía 07). Cuando el panel
esté online:

1. Entrá a `https://tu-panel.vercel.app/api/meli/conectar`
2. Mercado Libre te va a pedir que autorices.
3. Volvés al panel solo.

## Si alguna vez se desconecta

Mercado Libre entrega un permiso que se renueva solo, pero que **se puede
romper**: es de un solo uso y rota cada vez. Si algo lo interrumpe, la conexión
muere y hay que volver a apretar *Conectar*.

El panel guarda el motivo en la tabla `conexiones`, así que si las ventas de
Mercado Libre dejan de actualizarse, ese es el primer lugar donde mirar.

## Cómo saber que funcionó

Después de conectar, en el panel aparece el selector **Mercado Libre** con
ventas propias, y en la sección de productos ves tus publicaciones de MeLi.

El embudo va a seguir mostrando solo Shopify: Mercado Libre no informa
"agregado al carrito" ni "pago iniciado", porque su proceso de compra es de
ellos, no de tu tienda. El panel lo dice en pantalla en vez de mostrarte dos
pasos en cero.
