---
description: Conecta el panel con cada servicio, de a uno por vez, después del deploy a Vercel
---

Invocá la skill `vincular` y seguila al pie de la letra.

Antes de escribir el primer mensaje, tené presente lo que la hace funcionar:

- **Un servicio por vez.** No adelantes el siguiente hasta verificar el anterior.
- **Nunca pidas un token ni una contraseña en el chat.** Los tokens van del
  navegador a Vercel. La contraseña del panel la genera `npm run usuario:crear`
  y queda en el HTML de credenciales, no en la conversación. Vos verificás
  disparando `disparar_sync()` por el MCP de Supabase, que lee el secreto de la
  base: no necesitás ver ninguna credencial.
- **Verificá vos.** "¿Te anduvo?" no es una verificación. Corré la prueba y mirá
  la salida. Pedí captura solo cuando la comprobación está dentro del panel de
  otra empresa y no hay forma de consultarla.
- **Una cosa por mensaje.** Pantalla, botón, valor.

Arrancá pidiendo la URL de producción del panel en Vercel. Nada más. El correo
con el que va a entrar se lo pedís después, en el paso 0.3.
