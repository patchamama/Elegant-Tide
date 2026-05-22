#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT/servers/api"

# ANSI colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     Elegant Tide — Backend API       ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ── Detect PostgreSQL ──────────────────────────────────────────────────────────
detect_postgres() {
  local reachable=false
  if command -v pg_isready &>/dev/null; then
    pg_isready -h localhost -p 5432 -q 2>/dev/null && reachable=true || true
  elif command -v nc &>/dev/null; then
    nc -z -w1 localhost 5432 2>/dev/null && reachable=true || true
  fi
  if $reachable; then
    if docker ps --format '{{.Ports}}' 2>/dev/null | grep -q ':5432->'; then
      echo "docker"
    else
      echo "local"
    fi
  else
    echo "none"
  fi
}

PG_STATUS=$(detect_postgres)

# ── Create .env from template on first run ─────────────────────────────────────
if [ ! -f "$API_DIR/.env" ]; then
  echo "  [SETUP] No .env found — creating from template…"
  cat > "$API_DIR/.env" <<'ENVEOF'
# ─── Database ──────────────────────────────────────────────────────────────────
# In dev, DATABASE_URL defaults to SQLite — leave unset or uncomment for PostgreSQL:
# DATABASE_URL="postgresql://elegant_tide:password@localhost:5432/elegant_tide"

# ─── JWT secrets (required) ────────────────────────────────────────────────────
# Generate with: openssl rand -base64 48
JWT_SECRET="change-me-min-32-chars-long-secret-1234567890ab"
JWT_REFRESH_SECRET="change-me-too-min-32-chars-long-secret-67890cdef"

# ─── Server ────────────────────────────────────────────────────────────────────
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# ─── Translation providers (optional) ──────────────────────────────────────────
DEEPL_API_KEY=
GOOGLE_TRANSLATE_API_KEY=
ENVEOF
  echo "  [SETUP] Created servers/api/.env"
  echo ""
fi

# ── Load .env ─────────────────────────────────────────────────────────────────
set -o allexport
# shellcheck source=servers/api/.env
source "$API_DIR/.env"
set +o allexport

# ── Determine active DB and select Prisma schema ───────────────────────────────
if [[ "${DATABASE_URL:-}" == postgresql://* || "${DATABASE_URL:-}" == postgres://* ]]; then
  ACTIVE_DB="postgresql"
  ACTIVE_SCHEMA="$API_DIR/prisma/schema.postgresql.prisma"
  PG_CONN="${DATABASE_URL#*@}"
else
  ACTIVE_DB="sqlite"
  export DATABASE_URL="file:$API_DIR/prisma/dev.db"
  ACTIVE_SCHEMA="$API_DIR/prisma/schema.sqlite.prisma"
fi

# ── DB status block ────────────────────────────────────────────────────────────
echo "  ┌─ Database ──────────────────────────────────────────────────┐"

# PostgreSQL detection line
case "$PG_STATUS" in
  docker)
    printf "  │  ${DIM}Detected   PostgreSQL  ·  Docker  (localhost:5432)${RESET}%-14s│\n" ""
    ;;
  local)
    printf "  │  ${DIM}Detected   PostgreSQL  ·  local   (localhost:5432)${RESET}%-14s│\n" ""
    ;;
  none)
    printf "  │  ${DIM}Detected   PostgreSQL  ·  not found${RESET}%-26s│\n" ""
    ;;
esac

# Active DB line
if [ "$ACTIVE_DB" = "sqlite" ]; then
  SQLITE_PATH="${DATABASE_URL#file:}"
  SQLITE_REL="${SQLITE_PATH##*/prisma/}"
  printf "  │  ${GREEN}${BOLD}Active     SQLite      ·  ./prisma/$SQLITE_REL${RESET}%-18s│\n" ""
else
  printf "  │  ${GREEN}${BOLD}Active     PostgreSQL  ·  $PG_CONN${RESET}%-$((36 - ${#PG_CONN}))s│\n" ""
fi

echo "  └─────────────────────────────────────────────────────────────┘"

# Tip when PostgreSQL is available but SQLite is active
if [ "$ACTIVE_DB" = "sqlite" ] && [ "$PG_STATUS" != "none" ]; then
  printf "  ${YELLOW}tip: set DATABASE_URL=postgresql://... in servers/api/.env to use PostgreSQL${RESET}\n"
fi

echo ""

# ── Copy selected schema and regenerate Prisma client ─────────────────────────
cp "$ACTIVE_SCHEMA" "$API_DIR/prisma/schema.prisma"
cd "$API_DIR"

# Skip generate if schema hash matches the last run (avoids ~45s WSL2 cold start)
SCHEMA_HASH=$(md5sum "$API_DIR/prisma/schema.prisma" 2>/dev/null | cut -d' ' -f1)
HASH_CACHE="$API_DIR/.prisma-schema-hash"
CACHED_HASH=$(cat "$HASH_CACHE" 2>/dev/null || echo "")

if [ "$SCHEMA_HASH" != "$CACHED_HASH" ]; then
  printf "  ${CYAN}Generating Prisma client…${RESET}\n"
  pnpm exec prisma generate && printf "%s" "$SCHEMA_HASH" > "$HASH_CACHE"
else
  printf "  ${DIM}Prisma client up to date${RESET}\n"
fi

printf "  ${CYAN}Syncing schema to database…${RESET}\n"
pnpm exec prisma db push --skip-generate --accept-data-loss \
  2>&1 | grep -v "^$\|Running generate\|Prisma schema loaded\|Environment variables" \
  || printf "  ${YELLOW}[WARN] db:push failed — check DATABASE_URL or DB connectivity${RESET}\n"

# ── Start API server ───────────────────────────────────────────────────────────
echo ""
printf "  ${BOLD}Starting Fastify API on port ${PORT:-3001}…${RESET}\n"
echo ""
pnpm dev
