#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT/servers/api"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     Elegant Tide — Backend API       ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Create .env from inline template on first run
if [ ! -f "$API_DIR/.env" ]; then
  echo "  [SETUP] No .env found in servers/api/. Creating from template…"
  cat > "$API_DIR/.env" <<'ENVEOF'
# ─── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL="postgresql://elegant_tide:password@localhost:5432/elegant_tide"

# ─── JWT secrets ───────────────────────────────────────────────────────────────
# Generate with:  openssl rand -base64 48
# Both MUST be at least 32 characters and different from each other
JWT_SECRET="change-me-min-32-chars-long-secret-1234567890ab"
JWT_REFRESH_SECRET="change-me-too-min-32-chars-long-secret-67890cdef"

# ─── Server ────────────────────────────────────────────────────────────────────
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# ─── Translation providers (optional) ──────────────────────────────────────────
# Leave empty to disable. Keys never reach the browser — the backend proxies
# all translation calls through /translate/deepl|google.
DEEPL_API_KEY=
GOOGLE_TRANSLATE_API_KEY=
ENVEOF
  echo "  [SETUP] Created servers/api/.env — review and edit before production use."
  echo ""
fi

echo "  [INFO] Running Prisma db push (creates tables if needed)…"
cd "$API_DIR"
pnpm db:push --skip-generate 2>/dev/null || echo "  [WARN] db:push failed — check DATABASE_URL in servers/api/.env"

echo "  [INFO] Starting Fastify API on port \${PORT:-3001}…"
echo ""
pnpm dev
