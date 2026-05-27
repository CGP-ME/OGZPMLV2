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
        EXECUTION_MODE: 'paper',
        PAPER_TRADING: 'true',
        LIVE_TRADING: 'false',
        CONFIRM_LIVE_TRADING: 'false',
        BROKER: 'kraken',
        ASSET_CLASS: 'crypto',
        PRIMARY_ASSET: 'BTC-USD',
        TRADING_PAIR: 'BTC-USD',
        ALPACA_SYMBOLS: '',
        CANDLE_TIMEFRAME: '1m',
        JOURNAL_DATA_DIR: '/opt/ogzprime/OGZPMLV2/data/journal',
        DIRECTION_FILTER: 'both',
        ENABLE_SHORTS: 'true',
        SESSION_ROUTER_ENABLED: 'false',
        ACCOUNT_DRAWDOWN_BYPASS: 'false',
        RISK_MANAGER_BYPASS: 'false',
        BOOT_REST_HYDRATION_LIMIT: '60',
        LIVENESS_BACKFILL_LIMIT: '10',
        LIVENESS_CHECK_INTERVAL_MS: '60000',
        LIVENESS_MAX_DATA_SILENCE_MS: '120000',
        LIVENESS_ACTIVE_TIMEFRAME_MULTIPLIER: '1.5',
        LIVENESS_ACTIVE_TIMEFRAME_SLACK_MS: '60000',
        LIVENESS_MAX_BACKFILL_AGE_MULTIPLIER: '2',
        LIVENESS_MAX_BACKFILL_AGE_SLACK_MS: '60000',
        STALE_DATA_MAX_AGE_MS: '120000',
        STALE_DATA_RECOVERY_AGE_MS: '30000',
        GAP_THRESHOLD_MULTIPLIER: '1.5',
        GAP_BACKFILL_BUFFER_CANDLES: '5',
        GAP_RECOVERY_CLEAN_CANDLES_REQUIRED: '3',
        GAP_BACKFILL_RETRY_DELAY_MS: '60000',
        LIVENESS_EXPECTED_QUIET_LOG_INTERVAL_MS: '300000',
        // 2026-04-29: NoWickImbalance enabled. Strategy is disabled in code
        // default; this flip turns it on. Sweep + walk-forward to follow.
        ENABLE_NOWICK: 'true',
        // 2026-04-29: OpeningRangeBreakout enabled for production observation
        // parity with the parallel sweep campaign. Strategy is disabled in code
        // default; this flip turns it on. Sweep will validate before locking.
        ENABLE_ORB: 'true'
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
