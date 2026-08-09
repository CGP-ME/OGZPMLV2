'use strict';

const path = require('path');

function hydratePm2EnvFromDotenv() {
  if (process.env.NODE_ENV === 'test') return;
  require('dotenv').config({
    path: path.join(__dirname, '.env'),
    override: false,
  });
}

hydratePm2EnvFromDotenv();

const evalOperatorEnv = Object.freeze({
  ALPACA_MODE: process.env.ALPACA_MODE,
  ALPACA_API_KEY: process.env.ALPACA_API_KEY,
  ALPACA_API_SECRET: process.env.ALPACA_API_SECRET,
  SIGNALSTACK_WEBHOOK_URL: process.env.SIGNALSTACK_WEBHOOK_URL,
  WEBSOCKET_AUTH_TOKEN: process.env.WEBSOCKET_AUTH_TOKEN,
  TTP_ACCOUNT_START_OF_DAY_DATE: process.env.TTP_ACCOUNT_START_OF_DAY_DATE,
  TTP_ACCOUNT_START_OF_DAY_EQUITY: process.env.TTP_ACCOUNT_START_OF_DAY_EQUITY,
  TTP_DAILY_LOSS_LIMIT_DOLLARS: process.env.TTP_DAILY_LOSS_LIMIT_DOLLARS,
  TTP_MAX_LOSS_THRESHOLD_EQUITY: process.env.TTP_MAX_LOSS_THRESHOLD_EQUITY,
  TTP_EARNINGS_STATUS_JSON: process.env.TTP_EARNINGS_STATUS_JSON,
  TTP_PROFIT_TARGET_DOLLARS: process.env.TTP_PROFIT_TARGET_DOLLARS,
  INCEPTION_API_KEY: process.env.INCEPTION_API_KEY,
  INITIAL_BALANCE: process.env.INITIAL_BALANCE,
  STARTING_BALANCE: process.env.STARTING_BALANCE,
  OGZ_ACCOUNT_ID: process.env.OGZ_ACCOUNT_ID,
  OGZ_ACCOUNT_LABEL: process.env.OGZ_ACCOUNT_LABEL,
  OGZ_ACCOUNT_STAGE: process.env.OGZ_ACCOUNT_STAGE,
  OGZ_ACCOUNT_STATUS: process.env.OGZ_ACCOUNT_STATUS,
  OGZ_MIN_TRADES_REQUIRED: process.env.OGZ_MIN_TRADES_REQUIRED,
  OGZ_TRACK_RECORD_START_AT: process.env.OGZ_TRACK_RECORD_START_AT,
});

const alpacaCredentialEnv = Object.freeze({
  ALPACA_API_KEY: process.env.ALPACA_API_KEY,
  ALPACA_API_SECRET: process.env.ALPACA_API_SECRET,
});

const dashboardStockRuntimeEnv = Object.freeze({
  ALPACA_STOCK_DATA_URL: 'https://data.alpaca.markets/v2/stocks',
  ALPACA_STOCK_DATA_FEED: 'iex',
  ALPACA_STOCK_DATA_ADJUSTMENT: 'split',
  DASHBOARD_STOCK_PRICE_SYMBOLS: 'TSLA,NVDA,COIN,MARA,RIOT',
  STOCK_TICKER_MAX_AGE_MS: '900000',
  ALPACA_DATA_STREAM_URL: 'wss://stream.data.alpaca.markets/v2/iex',
  ALPACA_STOCK_STREAM_FEED: 'iex',
  DASHBOARD_STOCK_STREAM_ENABLED: process.env.DASHBOARD_STOCK_STREAM_ENABLED,
});

module.exports = {
  apps: [
    {
      name: 'ogz-websocket',
      script: 'ogzprime-ssl-server.js',
      cwd: '/opt/ogzprime/OGZPMLV2',
      watch: false,
      env: {
        ...alpacaCredentialEnv,
        WEBSOCKET_AUTH_TOKEN: process.env.WEBSOCKET_AUTH_TOKEN,
        ...dashboardStockRuntimeEnv,
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
        ...evalOperatorEnv,
        ...dashboardStockRuntimeEnv,
        NODE_ENV: 'production',
        PROFILE: 'production',
        EXECUTION_MODE: 'live',
        BACKTEST_MODE: 'false',
        PAPER_TRADING: 'false',
        LIVE_TRADING: 'true',
        CONFIRM_LIVE_TRADING: 'true',
        CANDLE_SOURCE: 'live',
        BROKER: 'alpaca',
        ASSET_CLASS: 'stocks',
        PRIMARY_ASSET: 'TSLA',
        TRADING_PAIR: 'TSLA',
        ALPACA_SYMBOLS: 'TSLA,NVDA,COIN,MARA,RIOT',
        CANDLE_TIMEFRAME: '15m',
        STATE_FILE: 'data/state.json',
        JOURNAL_DATA_DIR: '/opt/ogzprime/OGZPMLV2/data/journal',
        DIRECTION_FILTER: 'both',
        SYMBOL_LOSS_COOLDOWN_ENABLED: 'true',
        SYMBOL_LOSS_COOLDOWN_CONSECUTIVE_LOSSES: '2',
        SYMBOL_LOSS_COOLDOWN_MINUTES: '120',
        ENABLE_TRAI: 'true',
        TRAI_MODE: 'passive',
        TRAI_WEIGHT: '0.2',
        TRAI_VETO: 'false',
        TRAI_ENABLE_BACKTEST: 'true',
        ENABLE_DASHBOARD: 'true',
        ACCOUNT_DRAWDOWN_BYPASS: 'false',
        RISK_MANAGER_BYPASS: 'false',
        MAX_DRAWDOWN: '3',
        MAX_DAILY_LOSS: '1',
        MAX_WEEKLY_LOSS: '3',
        MAX_MONTHLY_LOSS: '3',
        ACCOUNT_DRAWDOWN_PCT: '-3.0',
        ENABLE_DYNAMIC_SIZING: 'true',
        MIN_TRADE_CONFIDENCE: '0.5',
        ATR_FILTER_ENABLED: 'true',
        ATR_MIN_PERCENT: '0.40',
        BASE_POSITION_SIZE: '0.01',
        MAX_POSITION_SIZE_PCT: '0.05',
        BASE_POSITION_PCT: '0.01',
        MAX_POSITION_PCT: '0.05',
        ABSOLUTE_POSITION_CAP: '0.15',
        ENTRY_STOCK_SHARE_RANGE_ENABLED: 'true',
        ENTRY_MIN_STOCK_SHARES: '2',
        ENTRY_MAX_STOCK_SHARES: '0',
        ENTRY_MAX_STOCK_NOTIONAL: '5000',
        ENTRY_CONSISTENCY_CAP_BUFFER: '0.98',
        ENTRY_DAILY_LOSS_RISK_FRACTION: '1.0',
        TIER1_TARGET: '0.007',
        TIER2_TARGET: '0.010',
        TIER3_TARGET: '0.015',
        FINAL_TARGET: '0.025',
        TIER1_EXIT_FRACTION: '0.30',
        TIER2_EXIT_FRACTION: '0.30',
        TIER3_EXIT_FRACTION: '0.20',
        EXIT_SYSTEM: 'legacy',
        FEE_MODEL: 'per_share_minimum',
        FEE_PER_SHARE: '0.005',
        FEE_MIN_ORDER: '0.75',
        FEE_MAKER: '0',
        FEE_TAKER: '0',
        FEE_SLIPPAGE: '0.0005',
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
        WEBHOOK_ORDERS_ENABLED: 'true',
        WEBHOOK_DRY_RUN: 'false',
        WEBHOOK_TIMEOUT_MS: '5000',
        WEBHOOK_ORDER_LOG_CAP: '500',
        EVAL_RULES_ENABLED: 'true',
        TTP_RULES_ENABLED: 'true',
        TTP_VOLUME_CAP_ENABLED: 'true',
        TTP_VOLUME_CAP_PERCENT: '0.05',
        TTP_VOLUME_CAP_TIMEFRAME: '1m',
        TTP_VOLUME_CAP_FALLBACK_TO_RECENT: 'false',
        TTP_VOLUME_CAP_MAX_REFERENCE_AGE_MS: '180000',
        TTP_MARKET_TIME_ENABLED: 'true',
        TTP_BLOCK_ENTRIES_AFTER_CUTOFF: 'true',
        TTP_LIQUIDATION_ENABLED: 'true',
        TTP_LIQUIDATION_MINUTES_BEFORE_CLOSE: '10',
        TTP_ENTRY_BUFFER_MINUTES_BEFORE_CUTOFF: '30',
        TTP_ACCOUNT_LIMITS_ENABLED: 'true',
        TTP_DAILY_LOSS_PAUSE_ENABLED: 'true',
        TTP_MAX_LOSS_ENABLED: 'true',
        TTP_EARNINGS_RESTRICTION_ENABLED: 'true',
        TTP_EARNINGS_BLOCK_ENTRIES: 'true',
        TTP_CONSISTENCY_ENABLED: 'true',
        TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO: '0.30',
        TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO: '0.06',
        ENABLE_MTF: 'true',
        ENABLE_MTF_CONFLUENCE_BOOSTER: 'true',
        ENABLE_STRATEGY_MTF_CONFLUENCE: 'true',
        MTF_BOOSTER_MIN_SCORE: '0.30',
        MTF_BOOSTER_MIN_CONFIDENCE: '0.45',
        MTF_BOOSTER_STRENGTH_MULT: '0.20',
        MTF_BOOSTER_MAX_MULT: '1.15',
        MTF_BOOSTER_CONFLICT_MULT: '0.88',
        MTF_BOOSTER_PENALIZE_CONFLICTS: 'true',
        MTF_BOOSTER_BOOST_MTF_CANDIDATE: 'false',
        MASR_MTF_1H_TREND_CONFLICT_MULT: '0.95',
        RSI_MTF_4H_TREND_CONFLICT_MULT: '0.95',
        MTF_MISSING_HIGHER_TF_MULT: '1.00',
        ENABLE_BREAKRETEST: 'true',
        ENABLE_SMS: 'true',
        ENABLE_NOWICK: 'true',
        ENABLE_ORB: 'true',
        ENABLE_DONCHIAN: 'true',
        ENABLE_PROPSAFE_EMA: 'true',
        ENABLE_EMA_TREND_RETEST: 'true',
        ENABLE_RSI2_MR: 'true',
        ENABLE_TSMOM: 'true'
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
      //   pm2 startOrReload ecosystem.config.js --only ogz-supervisor --update-env
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
