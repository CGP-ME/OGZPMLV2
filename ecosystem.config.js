module.exports = {
  apps: [
    {
      name: 'ogz-websocket',
      script: 'ogzprime-ssl-server.js',
      cwd: '/opt/ogzprime/OGZPMLV2',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3010
      }
    },
    {
      name: 'ogz-prime-v2',
      script: 'run-empire-v2.js',
      cwd: '/opt/ogzprime/OGZPMLV2',
      watch: false,
      env: {
        NODE_ENV: 'production',
        // 2026-04-26: SessionRouter enabled for dual-broker (Kraken crypto
        // 24/7 + Alpaca stocks RTH). Default=false in code; this env flip
        // turns it on in production. See core/SessionRouter.js +
        // ogz-meta/ledger/SESSION-ROUTER-SPEC.md. Phase 0 baseline preserved
        // byte-exact when this flag flips because backtest path doesn't
        // touch SessionRouter.
        SESSION_ROUTER_ENABLED: 'true'
      }
    },
    {
      name: 'ogz-stripe',
      script: 'public/stripe-checkout.js',
      cwd: '/opt/ogzprime/OGZPMLV2',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      // Resilience-and-supervision Phase 6 — system-wide health overseer.
      // Runs as a SEPARATE PM2 process so it survives ogz-prime-v2 crashes
      // and zombies. PM2 watches ogz-supervisor (Layer A); ogz-supervisor
      // watches ogz-prime-v2 + ogz-websocket + ssl-server (the actual
      // workloads). See ogz-meta/specs/resilience-and-supervision.md.
      //
      // Manual start (after the bot is happy):
      //   pm2 start ecosystem.config.js --only ogz-supervisor
      //
      // Watch its work:
      //   pm2 logs ogz-supervisor
      //   tail -f data/supervisor-ledger.jsonl
      name: 'ogz-supervisor',
      script: 'scripts/supervisor-daemon.js',
      cwd: '/opt/ogzprime/OGZPMLV2',
      watch: false,
      // Restart on exit code != 0; cap at 10 restarts in 10min so a
      // truly broken supervisor stops thrashing PM2.
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // Min uptime before considering the process "stable" and resetting
      // the restart counter — daemon should bind sockets + register
      // subsystems within 2s on a healthy host.
      min_uptime: 2000,
      env: {
        NODE_ENV: 'production',
        // Tighten / relax via these vars without editing this file:
        SUPERVISOR_POLL_MS: '30000',
        SUPERVISOR_DEGRADE_MS: '120000',
        SUPERVISOR_HEAL_ATTEMPTS: '3',
        SUPERVISOR_HEALTH_URL: 'https://localhost:443/api/health',
        SUPERVISOR_BOT_PROCESS: 'ogz-prime-v2',
        SUPERVISOR_RELAY_PROCESS: 'ogz-websocket',
        SUPERVISOR_LEDGER_PATH: 'data/supervisor-ledger.jsonl',
        // SUPERVISOR_DEADMAN_URL not set by default — wire to a
        // Healthchecks.io ping URL when external deadman is enabled.
      }
    }
  ]
};
