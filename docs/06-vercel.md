# 6. Vercel

Vercel publica tu panel en internet, con una dirección que podés abrir desde
el celular. Es gratis para este uso.

## Publicar

1. Entrá a [vercel.com](https://vercel.com) y creá una cuenta **con GitHub**.
   Así ya quedan conectados.
2. **Add New → Project**.
3. Elegí tu repositorio de la lista.
4. **No toques nada** de la configuración: Vercel detecta Next.js solo.
5. Antes de darle Deploy, abrí **Environment Variables** y agregá las dos:

   | Nombre | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | El mismo de tu `.env.local` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | El mismo de tu `.env.local` |

6. **Deploy**. Tarda un par de minutos.

> Si te olvidás las variables, el deploy va a funcionar pero la página te va a
> mostrar un error diciendo cuál falta. Las agregás en **Settings → Environment
> Variables** y después **Deployments → ⋯ → Redeploy**. Sin el redeploy no toma
> los cambios.

## Volver a Supabase — este paso es obligatorio

Ahora que tenés tu dirección de Vercel (algo como
`https://dashboard-mitienda.vercel.app`), volvé a Supabase:

**Authentication → URL Configuration → Redirect URLs**, y agregá:

```
https://dashboard-mitienda.vercel.app/**
```

**Si no hacés esto, no vas a poder entrar a tu panel publicado.** El link del
correo te va a mandar a `localhost`, que en tu celular no existe. Y no vas a ver
ningún mensaje de error que te explique por qué.

Aprovechá y cambiá también la **Site URL** a tu dirección de Vercel.

## Entrar desde el celular

Abrí la dirección de Vercel, poné tu correo, y abrí el link que te llega.
Ahí sí es tu correo de verdad, no la casilla falsa de tu compu.

## Cada vez que cambies algo

```bash
git push
```

Vercel republica solo. No hay más que hacer.

## Cómo saber que funcionó

Abrís tu dirección de Vercel desde el celular, entrás con tu correo, y ves tus
ventas.
