# seed/ — datos demo para D1

Archivos de seed para la base `risa-d1`. Separados de las migraciones de esquema
para que sea seguro re-aplicar sin romper datos.

## Aplicar

```bash
# 1. Crear la base (solo una vez)
npx wrangler d1 create risa-d1

# 2. Pegar el database_id en worker/wrangler.toml

# 3. Aplicar esquema (tablas + índices)
npx wrangler d1 execute risa-d1 --remote --file=worker/migrations/0001_schema.sql
npx wrangler d1 execute risa-d1 --remote --file=worker/migrations/0007_community.sql

# 4. Cargar seeds (datos demo) — SOLO en desarrollo
npx wrangler d1 execute risa-d1 --remote --file=worker/seed/dev/0001_core.sql
npx wrangler d1 execute risa-d1 --remote --file=worker/seed/dev/0002_aliases.sql
npx wrangler d1 execute risa-d1 --remote --file=worker/seed/dev/0003_real_users.sql
```

## Estructura

```
seed/
├── README.md
└── dev/              ← datos demo para desarrollo
    ├── 0001_core.sql
    ├── 0002_aliases.sql
    └── 0003_real_users.sql
```

## Archivos dev/

| Archivo | Contenido |
|---------|-----------|
| `0001_core.sql` | marcflove (advanced), maria (advanced), maria-adv (PoC) + actividad + hilos + FTS |
| `0002_aliases.sql` | Aliases públicos/privados de marcflove, maria, maria-adv |
| `0003_real_users.sql` | 5 usuarios demo (ana, carlos, laura, pedro, sofia) + clips de Wikimedia + cadenas |

## Notas

- Los seeds usan `INSERT OR IGNORE` — son idempotentes, safe para re-ejecutar
- `0003_real_users.sql` reemplaza los usuarios toy de la versión anterior (contagiosa, carcajada, mundo)
- Para resetear la base: borrar y re-aplicar esquema + seeds desde cero
- Los seeds en `dev/` son para desarrollo — no ejecutar en producción
- En producción, los usuarios se crean via el bot (Telegram auth → D1)
