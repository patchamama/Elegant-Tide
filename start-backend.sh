#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT/servers/api"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     Elegant Tide — Backend API       ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Require .env
if [ ! -f "$API_DIR/.env" ]; then
  echo "  [SETUP] No .env found in servers/api/. Creating from example…"
  cp "$API_DIR/.env.example" "$API_DIR/.env" 2>/dev/null || {
    echo "  [ERROR] servers/api/.env.example not found."
    echo "          Create servers/api/.env with DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET"
    exit 1
  }
  echo "  [SETUP] Copied .env.example → .env. Edit it before production use."
fi

echo "  [INFO] Running Prisma db push (creates tables if needed)…"
cd "$API_DIR"
pnpm db:push --skip-generate 2>/dev/null || echo "  [WARN] db:push failed — check DATABASE_URL in servers/api/.env"

echo "  [INFO] Starting Fastify API on port \${PORT:-3001}…"
echo ""
pnpm dev
