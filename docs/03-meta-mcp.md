# 3. Meta Ads

Esta es la guía más probable de darte un dolor de cabeza, y **no es culpa tuya**.
Meta está habilitando su conector de a poco, cuenta por cuenta.

## Conectar el MCP

1. En Claude Code, agregá el conector de **Meta Ads**.
2. Autorizá con la cuenta de Facebook que administra tus anuncios.
3. Aceptá los permisos que pide.

## Verificar si tu cuenta está habilitada

Preguntale a Claude:

> ¿Qué cuentas publicitarias tengo?

En la respuesta, buscá tu cuenta y fijate en `is_ads_mcp_enabled`:

- **`true`** → todo bien, seguí.
- **`false`** → tu cuenta todavía no está habilitada. Vas a ver un mensaje que
  dice algo como *"Ads MCP is gradually being rolled out. Please check back at a
  later date."*

## Si te dio `false`

**No estás haciendo nada mal y no hay nada que puedas configurar.** Meta lo está
liberando de a poco.

El panel funciona igual:

- Las ventas, los pedidos, los clientes y el tráfico se traen de Shopify normal.
- La inversión la cargás a mano desde la pantalla **Gasto manual**, un número
  por día. Son treinta segundos por semana.
- Con eso, el **CAC**, el **ROAS** y el **MER** funcionan exactamente igual.

Probá de nuevo cada un par de semanas. Cuando Meta lo habilite, `/sync` va a
empezar a traer la inversión solo, y lo que cargaste a mano no se pierde ni se
pisa.

## Anotar tu ID de cuenta

En la misma respuesta de Claude está el `ad_account_id`: un número largo, sin
el prefijo `act_`. Copialo a `sync.config.json`:

```json
{
  "adAccountId": "123456789012345"
}
```

## Si tu cuenta de Meta está en otra moneda

Es muy común: la tienda factura en pesos y la cuenta de anuncios está en
dólares. El panel lo resuelve solo — busca el tipo de cambio de cada día y
convierte.

Lo único que tenés que hacer es que `storeCurrency` en `sync.config.json` sea
la moneda **de tu tienda**, no la de Meta:

```json
{
  "storeCurrency": "UYU"
}
```

> **Por qué importa tanto:** si esto queda mal, el ROAS te va a dar cuarenta
> veces más de lo real. Y no va a fallar nada: el panel va a mostrar un número
> perfectamente creíble y completamente equivocado.

## Cómo saber que funcionó

Claude te lista tus cuentas publicitarias, y `sync.config.json` tiene tu
`adAccountId` y tu moneda. Si te dio `false`, saber eso también cuenta como
funcionó: ya sabés que vas por el camino de la carga manual.
