#!/bin/bash
# ops-mcp pm2 snapshot loop. Runs as linuxuser (owner of the pm2 daemon).
# Fixed argv only; no interpolation of any external input anywhere.
set -u
OUT="/opt/ogzprime/ops-mcp/snapshots/pm2.json"
TMP="/opt/ogzprime/ops-mcp/snapshots/.pm2.json.tmp"
while true; do
  if /usr/local/bin/pm2 jlist > "$TMP" 2>/dev/null; then
    mv "$TMP" "$OUT"
  fi
  sleep 10
done
