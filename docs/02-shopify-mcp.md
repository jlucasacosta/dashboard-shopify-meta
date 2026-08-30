# 2. Shopify

## Conectar el MCP

El MCP de Shopify es lo que le permite a Claude leer tus ventas.

1. En Claude Code, escribí `/mcp` y elegí **Add server**, o usá el conector de
   Shopify desde la configuración de Claude.
2. Autorizá el acceso en el navegador cuando te lo pida.
3. Elegí tu tienda si tenés más de una.

## Verificar que quedó bien

Escribile a Claude, en español:

> ¿Qué tienda de Shopify tengo conectada?

Te tiene que responder con el nombre y el dominio de tu tienda. Si dice que no
tiene ninguna conectada, revisá el paso anterior.

Después probá que puede leer datos:

> Mostrame las ventas de los últimos 7 días

Si te devuelve una tabla, aunque esté en cero, está listo.

## Anotar tu dominio

Abrí `sync.config.json` y completá `shopDomain` con el dominio `.myshopify.com`
de tu tienda. No es el dominio que ven tus clientes, es el interno:

```json
{
  "shopDomain": "mitienda.myshopify.com"
}
```

Lo encontrás en el panel de Shopify, en **Settings → Domains**, o en la URL
cuando estás dentro del administrador.

## Shopify AI Kit

Si además querés que Claude pueda hacer cosas en tu tienda (crear productos,
armar colecciones, aplicar descuentos), instalá el **Shopify AI Kit** desde la
tienda de aplicaciones de Shopify.

Para este panel **no hace falta**: el panel solo lee, nunca escribe en Shopify.
Pero es útil para el resto de tu trabajo.

## Cómo saber que funcionó

Claude te dice el nombre de tu tienda cuando se lo preguntás, y
`sync.config.json` tiene tu dominio real.
