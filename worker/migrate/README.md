# Migración DNS: IONOS → Cloudflare (subdominios automáticos)

Estos dos scripts mueven `liberada.net` a Cloudflare con **un solo cambio manual en
cada panel**. El resto lo hacen por API.

| Script | Qué hace | Cuándo |
|---|---|---|
| `migrate-export-ionos.mjs` | Backup (solo lectura) de los registros DNS de IONOS → JSON | Antes de tocar nada |
| `migrate-cloudflare-apply.mjs` | Crea la zona en Cloudflare, importa registros (grey) y añade el wildcard `*` (orange) | Antes de cambiar los NS |

Requiere **Node ≥ 18** (usa `fetch` nativo). No instala nada.

---

## 0 · Preparar dos tokens (en los dos paneles, una sola vez)

**Panel IONOS** → crea una **API key** (busca "API" en tu panel o entra en
developer.hosting.ionos.com → API keys). Te da algo como `prefijo.clave`. Guárdala.
Este token es de solo lectura para el script de export.

**Panel Cloudflare** → Mi perfil → **API Tokens → Create Token** → plantilla
**"Edit zone DNS"**, con permisos:
- `Zone → Zone → Edit`  (necesario para *crear* la zona, que aún no existe)
- `Zone → DNS → Edit`
- `Account → Account Settings → Read`

Ámbito: **All zones** (si lo limitas a una zona que aún no existe, no podrá crearla).

---

## 1 · Backup IONOS (solo lectura, no cambia nada)

```bash
cd risa/worker/migrate
IONOS_API_KEY='prefijo.clave' node migrate-export-ionos.mjs
```

Genera `ionos-backup-liberada.net.json`. Revisa la tabla impresa:
**MX, SPF, DKIM, DMARC y CAA** deben salir ahí. Guárdalo (es tu red de seguridad).

> Si el script no encuentra la zona o la API devuelve 403, el token de IONOS no
> tiene acceso a DNS — créalo con permiso de DNS.

---

## 2 · Plan + aplicar en Cloudflare (todo por API)

```bash
# 0) Ver el plan SIN token ni llamadas a Cloudflare (usa solo el backup IONOS):
node migrate-cloudflare-apply.mjs --plan-local

# 1) Ver el plan real (necesita token, no toca nada):
CLOUDFLARE_API_TOKEN='<token>' node migrate-cloudflare-apply.mjs

# 2) Aplicar (crea la zona, importa registros grey, añade el wildcard orange):
CLOUDFLARE_API_TOKEN='<token>' node migrate-cloudflare-apply.mjs --apply
```

El script:
- crea la zona `liberada.net` (estado **pending**),
- importa MX/TXT/CAA/subdominios en **grey (DNS-only)** para no romper correo ni
  nada existente,
- omite los subdominios de perfil (`maria`, `ana`, …) — los sirve el Worker vía el wildcard,
- añade el **wildcard `*` → floveorg.github.io (proxied/orange)**,
- configura SSL **Full** + Always Use HTTPS,
- te imprime **los dos nameservers de Cloudflare** que tocarás en IONOS.

Idempotente: si lo repites, no duplica registros.

---

## 3 · El único cambio en el panel IONOS

**Domains → liberada.net → DNS → Nameservers** → "Use other nameservers" →
pega los **dos** NS de Cloudflare que imprimió el paso 2. Guardar.
(DNS del correo, catch-all y redirects de mail viven en el panel de correo de
IONOS, no en DNS: **siguen funcionando** porque MX sigue apuntando a IONOS.)

Propagación: minutos–24h.

---

## 4 · El único cambio en el panel Cloudflare

Cuando el estado de la zona pase a **Active** (Cloudflare lo detecta solo):
1. **(Opcional) DNS → Records**: verifica que MX/TXT importados están. Si a un
   subdominio concreto quieres quitarle el grey, solo edítalo.
2. **Workers & Pages → tu Worker `liberada-subdomains`** → Triggers → ruta
   `*.liberada.net/*`. (Si lo despliegas con `npx wrangler deploy` desde
   `risa/worker/`, la ruta ya viene en `wrangler.toml`; también puedes añadirla a mano aquí.)
3. Prueba:
   ```bash
   curl -I https://maria.liberada.net
   dig MX liberada.net          # debe responder mxXX.ionos…
   ```

---

## Resumen: cuándo tocas cada panel

| Panel | Qué haces | Cuándo |
|---|---|---|
| **IONOS** | 1) Crear API key | Paso 0 (una vez) |
| **IONOS** | 2) Cambiar nameservers a los 2 NS de Cloudflare | Paso 3 — **el único cambio real de DNS en IONOS** |
| **Cloudflare** | 1) Crear API token | Paso 0 (una vez) |
| **Cloudflare** | 2) Confirmar zona Active + revisar records + ruta del Worker | Paso 4 |
| **Correo IONOS** | Nada (catch-all/redirects siguen en el panel de correo) | — |

No edites registros sueltos en el panel DNS de IONOS: tras el cambio de NS,
Cloudflare es la autoridad.
