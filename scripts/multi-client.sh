#!/usr/bin/env bash
# Usage: scripts/multi-client.sh [N]
# Builds the Electron main process once, then launches N independent client
# instances with MAFIA_MULTI_INSTANCE=1 so the single-instance lock is skipped.
# Defaults to 2 instances if N is not provided.
set -euo pipefail

N=${1:-2}
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT_DIR="$REPO_ROOT/client"

if ! [[ "$N" =~ ^[1-9][0-9]*$ ]]; then
  echo "Usage: $0 [N]  (N must be a positive integer)" >&2
  exit 1
fi

echo "Building Electron main process..."
(cd "$CLIENT_DIR" && npm run build:main)

echo "Launching $N client instance(s)..."
PIDS=()
for i in $(seq 1 "$N"); do
  (cd "$CLIENT_DIR" && MAFIA_MULTI_INSTANCE=1 ELECTRON_RENDERER_URL=http://localhost:5173 electron . ) &
  PIDS+=($!)
  echo "  Started instance $i (PID $!)"
done

echo "All $N instance(s) running. Close the windows or press Ctrl-C to stop."

# Wait for all instances; exit cleanly on Ctrl-C
trap 'echo "Stopping..."; kill "${PIDS[@]}" 2>/dev/null; exit 0' INT TERM
wait "${PIDS[@]}"
