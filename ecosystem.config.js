'use strict';

const { getInternalsFileValue } = require('./foundation/ConfigLoader');

const PROJECT_ROOT = __dirname;
const PM2 = getInternalsFileValue('deployment.pm2');

module.exports = {
  apps: [
    {
      name: 'ogz-websocket',
      script: 'ogzprime-ssl-server.js',
      cwd: PROJECT_ROOT,
      watch: false,
      autorestart: PM2.websocket.autorestart,
      max_restarts: PM2.websocket.maxRestarts,
      restart_delay: PM2.websocket.restartDelayMs,
      min_uptime: PM2.websocket.minUptimeMs,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'ogz-stripe',
      script: 'public/stripe-checkout.js',
      cwd: PROJECT_ROOT,
      watch: false,
      autorestart: PM2.checkout.autorestart,
      max_restarts: PM2.checkout.maxRestarts,
      restart_delay: PM2.checkout.restartDelayMs,
      min_uptime: PM2.checkout.minUptimeMs,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'ogz-prime-v2',
      script: 'run-empire-v2.js',
      cwd: PROJECT_ROOT,
      watch: false,
      autorestart: PM2.bot.autorestart,
      max_restarts: PM2.bot.maxRestarts,
      restart_delay: PM2.bot.restartDelayMs,
      min_uptime: PM2.bot.minUptimeMs,
      env: {
        NODE_ENV: 'production',
        PROFILE: 'paper'
      }
    },
    {
      // Resilience-and-supervision Phase 6 — system-wide health overseer.
      // Runs as a SEPARATE PM2 process so it survives ogz-prime-v2 crashes
      // and zombies. PM2 watches ogz-supervisor (Layer A); ogz-supervisor
      // watches ogz-prime-v2 + ogz-websocket + ssl-server (the actual
      // workloads). See ogz-meta/specs/resilience-and-supervision.md.
      //
      // The unified startup script starts this process after the bot process.
      // Manual start remains available:
      //   pm2 startOrReload ecosystem.config.js --only ogz-supervisor --update-env
      //
      // Watch its work:
      //   pm2 logs ogz-supervisor
      //   tail -f data/supervisor-ledger.jsonl
      name: 'ogz-supervisor',
      script: 'scripts/supervisor-daemon.js',
      cwd: PROJECT_ROOT,
      watch: false,
      // PM2 owns this process's outer autorestart behavior. These values are
      // separate from the daemon's configured target-recovery window.
      autorestart: PM2.supervisor.autorestart,
      max_restarts: PM2.supervisor.maxRestarts,
      restart_delay: PM2.supervisor.restartDelayMs,
      // Min uptime before considering the process "stable" and resetting
      // the restart counter — daemon should bind sockets + register
      // subsystems within 2s on a healthy host.
      min_uptime: PM2.supervisor.minUptimeMs,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
