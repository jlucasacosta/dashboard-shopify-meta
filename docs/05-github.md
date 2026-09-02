# 5. GitHub

Guardar el código en GitHub sirve para dos cosas: no perderlo, y que Vercel
pueda publicarlo.

## Crear el repositorio

1. Entrá a [github.com](https://github.com) y creá una cuenta si no tenés.
2. **New repository**.
3. Ponele un nombre, por ejemplo `dashboard-mitienda`.
4. Elegí **Private**. Tu panel muestra tus ventas: no tiene por qué ser público.
5. **No** marques ninguna de las opciones de inicializar con README o .gitignore.
6. **Create repository**.

## Subir el código

Desde la carpeta del proyecto:

```bash
git remote add origin https://github.com/TU-USUARIO/dashboard-mitienda.git
```

```bash
git branch -M main
```

```bash
git push -u origin main
```

Si te pide usuario y contraseña, usá la [CLI de GitHub](https://cli.github.com)
(`gh auth login`), que es más simple que andar generando tokens.

## Qué NO se sube

El proyecto ya está configurado para dejar afuera:

- `.env.local` — tus claves
- `.mcp.json` — la configuración de tus conectores
- `node_modules/` — se reinstala solo
- `.sync-cache/` — archivos temporales de las sincronizaciones

Verificalo antes de subir:

```bash
git status
```

Si ves `.env.local` en la lista, **pará**. Algo está mal configurado y estarías
publicando tus claves.

> `.mcp.json` tampoco se sube: lleva el identificador de **tu** proyecto de
> Supabase. Lo que va al repo es `.mcp.json.example`, con un `TU_PROJECT_REF`
> de mentira que cada uno reemplaza por el suyo.

## Cómo saber que funcionó

Entrás a tu repositorio en GitHub y ves los archivos. Buscá `.env.local`: no
tiene que estar.
