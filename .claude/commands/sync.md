---
description: Trae los datos de Shopify y Meta Ads a Supabase para actualizar el dashboard
argument-hint: "[días hacia atrás, opcional]"
---

Sincronizá el dashboard siguiendo la skill `sync-dashboard`.

Argumento recibido: `$ARGUMENTS`

- Si viene un número, sincronizá esa cantidad de días hacia atrás.
- Si viene vacío, sincronizá desde el último día que ya está en Supabase.
  Si la base está vacía, usá `diasPrimeraCorrida` de `sync.config.json`.

Recordá la regla número uno de la skill: **copiás datos, no calculás nada**.
