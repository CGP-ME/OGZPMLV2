#!/usr/bin/env bash
set -euo pipefail

# Sole PM2 launcher for the four declared OGZPrime paper-runtime processes.
# Dependency installation, nginx management, and filesystem setup are separate
# operator actions and never run as a side effect of restarting the bot.

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

start() {
  echo "Starting OGZPrime paper runtime..."
  pm2 startOrReload ecosystem.config.js --only ogz-websocket --update-env
  pm2 startOrReload ecosystem.config.js --only ogz-stripe --update-env
  pm2 startOrReload ecosystem.config.js --only ogz-prime-v2 --update-env
  pm2 startOrReload ecosystem.config.js --only ogz-supervisor --update-env
  pm2 save
  status
}

stop() {
  echo "Stopping OGZPrime runtime..."
  pm2 stop ogz-prime-v2 ogz-websocket ogz-stripe ogz-supervisor
}

status() {
  pm2 status ogz-prime-v2 ogz-websocket ogz-stripe ogz-supervisor
  echo "Dashboard: https://ogzprime.com/unified-dashboard-v2.html"
  echo "WebSocket: wss://ogzprime.com/ws"
}

case "${1:-start}" in
  start|restart) start ;;
  stop) stop ;;
  status) status ;;
  *) echo "Usage: $0 {start|restart|stop|status}"; exit 1 ;;
esac
