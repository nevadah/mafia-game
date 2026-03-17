#!/usr/bin/env bash
# Starts the game server and Vite renderer dev server together.
# Run this before launching client instances with scripts/multi-client.sh
# or npm run dev:multi.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Starting server and renderer dev servers..."

(cd "$REPO_ROOT" && npm run dev:server) &
SERVER_PID=$!
echo "  Server started (PID $SERVER_PID)"

(cd "$REPO_ROOT" && npm run dev:renderer --workspace=client) &
RENDERER_PID=$!
echo "  Renderer dev server started (PID $RENDERER_PID)"

echo "Both running. Press Ctrl-C to stop."

trap 'echo "Stopping..."; kill "$SERVER_PID" "$RENDERER_PID" 2>/dev/null; exit 0' INT TERM
wait "$SERVER_PID" "$RENDERER_PID"
