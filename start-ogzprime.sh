#!/usr/bin/env bash
set -euo pipefail

# Sole PM2 launcher for the four declared OGZPrime paper-runtime processes.
# Dependency installation, nginx management, and filesystem setup are separate
# operator actions and never run as a side effect of restarting the bot.

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# PM2 merges the caller's environment on reload. Supply only the canonical
# launch environment; credentials are privately read by each role's ConfigLoader.
# This cannot remove keys already cached in an older PM2 registration.
OGZ_PM2_ENV_TEXT="$(node <<'NODE'
const ConfigLoader = require('./foundation/ConfigLoader');
const environment = ConfigLoader.getInternalsFileValue('deployment.pm2.launchEnvironment');
for (const [key, value] of Object.entries(environment)) console.log(key + '=' + value);
console.log('PM2_HOME=' + ConfigLoader.getInternalsFileValue('services.supervisor.pm2Home'));
NODE
)"
mapfile -t OGZ_PM2_ENV < <(printf '%s\n' "$OGZ_PM2_ENV_TEXT")

start() {
  echo "Starting OGZPrime paper runtime..."
  env -i "${OGZ_PM2_ENV[@]}" pm2 startOrReload ecosystem.config.js --only ogz-websocket --update-env
  env -i "${OGZ_PM2_ENV[@]}" pm2 startOrReload ecosystem.config.js --only ogz-stripe --update-env
  env -i "${OGZ_PM2_ENV[@]}" pm2 startOrReload ecosystem.config.js --only ogz-prime-v2 --update-env
  env -i "${OGZ_PM2_ENV[@]}" pm2 startOrReload ecosystem.config.js --only ogz-supervisor --update-env
  env -i "${OGZ_PM2_ENV[@]}" pm2 save
  status
}

stop() {
  echo "Stopping OGZPrime runtime..."
  env -i "${OGZ_PM2_ENV[@]}" pm2 stop ogz-prime-v2 ogz-websocket ogz-stripe ogz-supervisor
}

status() {
  env -i "${OGZ_PM2_ENV[@]}" pm2 status ogz-prime-v2 ogz-websocket ogz-stripe ogz-supervisor
  echo "Dashboard: https://ogzprime.com/unified-dashboard-v2.html"
  echo "WebSocket: wss://ogzprime.com/ws"
}

case "${1:-start}" in
  start|restart) start ;;
  stop) stop ;;
  status) status ;;
  *) echo "Usage: $0 {start|restart|stop|status}"; exit 1 ;;
esac
