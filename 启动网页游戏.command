#!/bin/sh
set -eu
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
port=${CHILLCAT_PORT:-18846}
if curl -fsS "http://127.0.0.1:$port/health" 2>/dev/null | grep -q '"game":"chillcat"'; then
  open "http://127.0.0.1:$port/"
  exit 0
fi
[ -d node_modules/@colyseus/core ] || npm ci --no-audit --no-fund
(sleep 2; open "http://127.0.0.1:$port/") &
exec sh tools/start_local.sh
