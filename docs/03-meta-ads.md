# 3. Meta Ads

De Meta sale **una sola cosa**: cuánto gastaste en anuncios. Las ventas son de
Shopify y de Mercado Libre.

No es por pereza. Meta atribuye conversiones con su propio modelo y siempre
reporta más ventas de las que terminan en tu banco. Tomando solo el gasto, los
números del panel son conservadores y cierran con la realidad.

> **Este paso es opcional.** Si lo salteás, el panel muestra tus ventas igual.
> Lo que no vas a tener es CAC, ROAS, MER ni contribución, porque las cuatro
> necesitan saber cuánto invertiste.

## Lo bueno: no hace falta que Meta te apruebe nada

Está en la documentación oficial de Meta, textual:

> *"Si tu app solo administra tu cuenta publicitaria, el acceso estándar a los
> permisos `ads_read` y `ads_management` es suficiente. Si tu app administra
> cuentas publicitarias de otras personas, necesitarás acceso avanzado."*

Y el acceso estándar *"aprueba automáticamente todos los permisos y las
funciones disponibles"* para apps de negocios. O sea: para leer lo tuyo, no hay
trámite.

> **La letra chica que sí importa.** Tu app arranca en el nivel *Acceso
> limitado* de la Marketing API, que Meta describe como de límite de frecuencia
> restrictivo y *"solo para desarrollo"*. Para lo que hace este panel —una
> consulta por día sobre una cuenta— alcanza de sobra. Si algún día te topás
> con límites, en el panel de tu app podés pedir *Acceso completo*: te lo dan
> con 500 llamadas en 15 días y menos de 15% de errores.

## Crear la app

1. Entrá a **[developers.facebook.com/apps](https://developers.facebook.com/apps)**.
2. **Crear app** → elegí el tipo **Otro** → **Empresa**.
3. Ponele un nombre y creala. Queda en modo desarrollo, que es lo que querés.

## Sacar un token que no se venza

Acá está la parte que se hace mal seguido. Hay tres tipos de token y solo uno
sirve:

| Token | Dura | ¿Sirve? |
|---|---|---|
| El del Graph API Explorer | 1 o 2 horas | No |
| El de larga duración | ~60 días | No: se vence y el panel deja de actualizar |
| **De usuario del sistema** | No vence | **Sí** |

El token de usuario del sistema está pensado justo para esto: procesos que
corren solos, sin una persona con la sesión abierta.

1. Entrá a **[business.facebook.com/settings](https://business.facebook.com/settings)**.
2. **Usuarios → Usuarios del sistema** → **Agregar**. Ponele un nombre
   (por ejemplo *panel*) y rol **Empleado**.
3. Con el usuario creado, **Agregar activos** → pestaña **Cuentas
   publicitarias** → elegí la tuya → activá **Ver rendimiento**.
4. **Generar nuevo token** → elegí tu app → marcá el permiso **`ads_read`** →
   generar.
5. Copialo. **Se muestra una sola vez.** Se va a llamar `META_ACCESS_TOKEN`.

## Anotar el ID de tu cuenta publicitaria

En el Administrador de anuncios, arriba a la izquierda, al lado del nombre de la
cuenta hay un número largo. Ese es tu `META_AD_ACCOUNT_ID`.

Podés anotarlo con o sin el prefijo `act_`: el panel acepta las dos formas.

## Si tu cuenta de Meta factura en otra moneda

Es común: la tienda vende en pesos y la cuenta de anuncios está en dólares. El
panel lo resuelve solo, buscando el tipo de cambio **del día de cada gasto** (no
el de hoy, que daría un CAC que parece razonable y es mentira).

Si algún día no consigue la cotización, ese día **no** se convierte: el gasto
queda como "—" y el panel te avisa cuántos días le faltan. Nunca aproxima.

## Cómo saber que funcionó

Tenés dos valores anotados: el **token de usuario del sistema** y el **ID de la
cuenta publicitaria**. Se cargan en [07 — Encender el sync](07-encender-el-sync.md).
