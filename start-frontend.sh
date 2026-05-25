#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     Elegant Tide — Frontend Dev      ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# --- dependency checks ---

# Node >= 20
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 20 ]; then
  echo "  ✗ Node.js >= 20 required (got: $(node -v 2>/dev/null || echo 'not found'))"
  echo "    Install: https://nodejs.org  or  nvm install 20"
  echo ""
  exit 1
fi

# pnpm >= 9
PNPM_VERSION=$(pnpm -v 2>/dev/null | cut -d. -f1)
if [ -z "$PNPM_VERSION" ] || [ "$PNPM_VERSION" -lt 9 ]; then
  echo "  ✗ pnpm >= 9 required (got: $(pnpm -v 2>/dev/null || echo 'not found'))"
  echo "    Fix: npm i -g pnpm@latest"
  echo ""
  exit 1
fi

echo "  Starting Vite dev server..."
echo "  URL: http://localhost:5173"
echo ""
echo "  Routes:"
echo "    /projects           → Project list"
echo "    /editor/<id>        → Subtitle editor"
echo "    /control/<id>       → Operator control panel"
echo "    /projector/<id>     → Projection window"
echo ""
echo "  Press Ctrl+C to stop."
echo ""

cd "$ROOT"
pnpm --filter @elegant-tide/web dev
