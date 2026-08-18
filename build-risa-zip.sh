#!/usr/bin/env bash
# Build the v1 "nick as tag" download — the replicable actual environment.
#
# Bundles the web + bot + worker + workflows + docs (NOT the media: audios and
# images live on Cloudflare R2; the seed images and categorias are content).
#
# Usage:   ./build-risa-zip.sh [version]
# Version defaults to config.json's "version" (e.g. v1.0.0).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

VERSION="${1:-$(node -e "process.stdout.write(require('./config.json').version)")}"
VERSION="${VERSION#v}"                     # strip leading v for the filename
NAME="risa-v${VERSION}-nick-as-tag"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

STAGE="$TMP/$NAME"
mkdir -p "$STAGE/bot" "$STAGE/worker" "$STAGE/.github/workflows"

# ── Web ──────────────────────────────────────────────────────────────────
cp index.html risa.js config.json risa.json usernames.json CNAME "$STAGE/" 2>/dev/null || true
cp build-rss.mjs risa.xml atom.xml "$STAGE/" 2>/dev/null || true
# Imágenes LOCALES que index.html referencia por ruta relativa (diagramas,
# QR y fotos de réplica) — imprescindibles para ver la web offline.
cp -n *.png *.jpg "$STAGE/" 2>/dev/null || true
mkdir -p "$STAGE/media"
cp -n media/replica-*.jpg "$STAGE/media/" 2>/dev/null || true
# (media/logos · seed/ · categorias/ no entran: son contenido y viven en R2)
# ── Bot ──────────────────────────────────────────────────────────────────
cp bot/*.mjs "$STAGE/bot/" 2>/dev/null || true
cp -r bot/test "$STAGE/bot/test" 2>/dev/null || true
# ── Worker ───────────────────────────────────────────────────────────────
cp worker/* "$STAGE/worker/" 2>/dev/null || true
# ── Workflows ────────────────────────────────────────────────────────────
cp .github/workflows/*.yml "$STAGE/.github/workflows/" 2>/dev/null || true
# ── Docs ─────────────────────────────────────────────────────────────────
cp README.md CHANGELOG.md VERSIONING.md MANUAL.md .htmlvalidate.json "$STAGE/" 2>/dev/null || true
echo "v${VERSION}" > "$STAGE/VERSION"

# Feed placeholder for the download (the real feed has current content).
if [ ! -s "$STAGE/risa.json" ]; then echo '[]' > "$STAGE/risa.json"; fi

(cd "$TMP" && zip -qr "$ROOT/$NAME.zip" "$NAME")
echo "✓ $ROOT/$NAME.zip"
