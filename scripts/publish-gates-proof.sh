#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/ogz-meta/gates/runs/latest.json"

# Web root is inside the repo (public/ is nginx root)
WEB_ROOT="$REPO_ROOT/public"

DEST_DIR="$WEB_ROOT/proof/gates"
DEST="$DEST_DIR/latest.json"

if [[ ! -f "$SRC" ]]; then
  echo "Missing $SRC"
  exit 1
fi

mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST"
chmod 644 "$DEST"

echo "Published gate proof: $DEST"
