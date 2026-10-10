#!/usr/bin/env bash
set -euo pipefail
packet_dir=$(cd "$(dirname "$0")/.." && pwd)
export NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules
export PLAYWRIGHT_BROWSERS_PATH="$packet_dir/browser-tools"
export TMPDIR="$packet_dir/browser-downloads"
export LD_LIBRARY_PATH="$packet_dir/browser-libs/usr/lib/x86_64-linux-gnu"
node "$packet_dir/fixtures/browser.cjs"
