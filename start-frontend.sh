#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     Elegant Tide — Frontend Dev      ║"
echo "  ╚══════════════════════════════════════╝"
echo ""
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
