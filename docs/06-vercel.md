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

## Habilitar tu correo en el proyecto de la nube

Los usuarios que creaste en tu máquina no existen en tu Supabase de la nube.
Habilitá el tuyo allá:

```bash
SUPABASE_URL=https://xxxxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... npm run usuario:crear -- vos@tutienda.com
```

Y verificá que la plantilla del correo en la nube mande el código y no un link
(ver [la guía de Supabase](01-supabase.md)). Es el paso que más se saltea.

> **Bueno saber:** como se entra con un código escrito en la misma pantalla, no
> hay ninguna URL de retorno que configurar. Si seguiste tutoriales de link
> mágico, ese paso acá no existe — y es justamente el que más problemas da al
> publicar.

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
