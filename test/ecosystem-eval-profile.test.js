'use strict';

const fs = require('fs');
const path = require('path');

const {
  validateEvalLivePosture,
} = require('../ogz-meta/gates/eval-live-posture-gate');

const OPERATOR_ENV_KEYS = Object.freeze([
  'ALPACA_MODE',
  'ALPACA_API_KEY',
  'ALPACA_API_SECRET',
  'SIGNALSTACK_WEBHOOK_URL',
  'WEBSOCKET_AUTH_TOKEN',
  'TTP_ACCOUNT_START_OF_DAY_DATE',
  'TTP_ACCOUNT_START_OF_DAY_EQUITY',
  'TTP_DAILY_LOSS_LIMIT_DOLLARS',
  'TTP_MAX_LOSS_THRESHOLD_EQUITY',
  'TTP_EARNINGS_STATUS_JSON',
  'TTP_PROFIT_TARGET_DOLLARS',
  'INITIAL_BALANCE',
  'STARTING_BALANCE',
]);

const OPERATOR_ENV_VALUES = Object.freeze({
  ALPACA_MODE: 'paper',
  ALPACA_API_KEY: 'test-alpaca-key',
  ALPACA_API_SECRET: 'test-alpaca-secret',
  SIGNALSTACK_WEBHOOK_URL: 'https://signalstack.example/webhook',
  WEBSOCKET_AUTH_TOKEN: 'test-dashboard-runtime-token',
  TTP_ACCOUNT_START_OF_DAY_DATE: '2026-06-08',
  TTP_ACCOUNT_START_OF_DAY_EQUITY: '5000',
  TTP_DAILY_LOSS_LIMIT_DOLLARS: '50',
  TTP_MAX_LOSS_THRESHOLD_EQUITY: '4850',
  TTP_EARNINGS_STATUS_JSON: '{"date":"2026-06-08","symbols":{"TSLA":false,"NVDA":false,"SPY":false,"QQQ":false,"COIN":false,"MARA":false,"RIOT":false}}',
  TTP_PROFIT_TARGET_DOLLARS: '300',
  INITIAL_BALANCE: '5000',
  STARTING_BALANCE: '5000',
});

const LOCKED_PROFILE_ENV_VALUES = Object.freeze({
  MAX_DRAWDOWN: '3',
  MAX_DAILY_LOSS: '1',
  MAX_WEEKLY_LOSS: '3',
  MAX_MONTHLY_LOSS: '3',
  ACCOUNT_DRAWDOWN_PCT: '-3.0',
  ATR_FILTER_ENABLED: 'true',
  ATR_MIN_PERCENT: '0.40',
  FEE_MODEL: 'per_share_minimum',
  FEE_PER_SHARE: '0.005',
  FEE_MIN_ORDER: '0.75',
  TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO: '0.30',
  TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO: '0.06',
});

function loadAppWithEnv(appName, envValues) {
  const originalValues = {};
  for (const key of OPERATOR_ENV_KEYS) {
    originalValues[key] = process.env[key];
    if (Object.prototype.hasOwnProperty.call(envValues, key)) {
      process.env[key] = envValues[key];
    } else {
      delete process.env[key];
    }
  }

  try {
    jest.resetModules();
    const ecosystem = require('../ecosystem.config');
    return ecosystem.apps.find((app) => app.name === appName);
  } finally {
    for (const key of OPERATOR_ENV_KEYS) {
      if (originalValues[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValues[key];
      }
    }
    jest.resetModules();
  }
}

function loadPrimeAppWithEnv(envValues) {
  return loadAppWithEnv('ogz-prime-v2', envValues);
}

describe('ecosystem eval live profile', () => {
  test('declares operator-owned eval values in default PM2 env without committing defaults or placeholders', () => {
    const app = loadPrimeAppWithEnv({});

    expect(app.env_eval_live).toBeUndefined();
    for (const key of OPERATOR_ENV_KEYS) {
      expect(app.env).toHaveProperty(key, undefined);
    }
  });

  test('default PM2 env passes the eval posture gate when operator-owned values are present', () => {
    const app = loadPrimeAppWithEnv(OPERATOR_ENV_VALUES);
    const env = app.env;
    const report = validateEvalLivePosture(env, { loadDotenv: false });

    expect(report.status).toBe('PASS');
    expect(report.errors).toEqual([]);
    expect(env).toEqual(expect.objectContaining({
      EXECUTION_MODE: 'live',
      PAPER_TRADING: 'false',
      LIVE_TRADING: 'true',
      CONFIRM_LIVE_TRADING: 'true',
      BROKER: 'alpaca',
      ASSET_CLASS: 'stocks',
      TRADING_PAIR: 'TSLA',
      ALPACA_SYMBOLS: 'TSLA,NVDA,SPY,QQQ,COIN,MARA,RIOT',
      STATE_FILE: 'data/state.json',
      SESSION_ROUTER_ENABLED: 'false',
      ENABLE_TRAI: 'false',
      WEBHOOK_ORDERS_ENABLED: 'true',
      WEBHOOK_DRY_RUN: 'false',
      MIN_TRADE_CONFIDENCE: '0.5',
      EVAL_RULES_ENABLED: 'true',
      TTP_RULES_ENABLED: 'true',
      RISK_MANAGER_BYPASS: 'false',
      ACCOUNT_DRAWDOWN_BYPASS: 'false',
      ...LOCKED_PROFILE_ENV_VALUES,
    }));
    expect(report.checked.config['mode.execution']).toEqual({ value: 'live', source: 'env:EXECUTION_MODE' });
    expect(report.checked.config['broker.id']).toEqual({ value: 'alpaca', source: 'env:BROKER' });
    expect(JSON.stringify(report)).not.toContain(OPERATOR_ENV_VALUES.ALPACA_API_KEY);
    expect(JSON.stringify(report)).not.toContain(OPERATOR_ENV_VALUES.ALPACA_API_SECRET);
    expect(JSON.stringify(report)).not.toContain(OPERATOR_ENV_VALUES.SIGNALSTACK_WEBHOOK_URL);
    expect(JSON.stringify(report)).not.toContain(OPERATOR_ENV_VALUES.WEBSOCKET_AUTH_TOKEN);
  });

  test('locked 5k MAX profile values beat ambient shell env leftovers', () => {
    const ambientProfileValues = {
      MAX_DRAWDOWN: '9',
      MAX_DAILY_LOSS: '9',
      MAX_WEEKLY_LOSS: '9',
      MAX_MONTHLY_LOSS: '9',
      ACCOUNT_DRAWDOWN_PCT: '-9.0',
      ATR_FILTER_ENABLED: 'false',
      ATR_MIN_PERCENT: '0.01',
      FEE_MODEL: 'percent',
      FEE_PER_SHARE: '0',
      FEE_MIN_ORDER: '0',
      TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO: '0.99',
      TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO: '0.50',
    };
    const originalValues = {};
    for (const [key, value] of Object.entries(ambientProfileValues)) {
      originalValues[key] = process.env[key];
      process.env[key] = value;
    }

    try {
      const app = loadPrimeAppWithEnv(OPERATOR_ENV_VALUES);

      expect(app.env).toEqual(expect.objectContaining(LOCKED_PROFILE_ENV_VALUES));
    } finally {
      for (const key of Object.keys(ambientProfileValues)) {
        if (originalValues[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = originalValues[key];
        }
      }
    }
  });

  test('dashboard stock data config is explicit on websocket and bot PM2 processes', () => {
    const websocket = loadAppWithEnv('ogz-websocket', OPERATOR_ENV_VALUES);
    const prime = loadPrimeAppWithEnv(OPERATOR_ENV_VALUES);

    for (const app of [websocket, prime]) {
      expect(app.env).toEqual(expect.objectContaining({
        ALPACA_STOCK_DATA_URL: 'https://data.alpaca.markets/v2/stocks',
        ALPACA_STOCK_DATA_FEED: 'iex',
        ALPACA_STOCK_DATA_ADJUSTMENT: 'split',
        DASHBOARD_STOCK_PRICE_SYMBOLS: 'TSLA,NVDA,SPY,QQQ,COIN,MARA,RIOT',
        STOCK_TICKER_MAX_AGE_MS: '900000',
        ALPACA_DATA_STREAM_URL: 'wss://stream.data.alpaca.markets/v2/iex',
        ALPACA_STOCK_STREAM_FEED: 'iex',
      }));
    }

    expect(websocket.env).toEqual(expect.objectContaining({
      ALPACA_API_KEY: OPERATOR_ENV_VALUES.ALPACA_API_KEY,
      ALPACA_API_SECRET: OPERATOR_ENV_VALUES.ALPACA_API_SECRET,
    }));
  });

  test('dashboard websocket token is operator-owned and passed only to runtime processes', () => {
    const websocket = loadAppWithEnv('ogz-websocket', OPERATOR_ENV_VALUES);
    const prime = loadPrimeAppWithEnv(OPERATOR_ENV_VALUES);

    expect(websocket.env.WEBSOCKET_AUTH_TOKEN).toBe(OPERATOR_ENV_VALUES.WEBSOCKET_AUTH_TOKEN);
    expect(prime.env.WEBSOCKET_AUTH_TOKEN).toBe(OPERATOR_ENV_VALUES.WEBSOCKET_AUTH_TOKEN);

    const defaultWebsocket = loadAppWithEnv('ogz-websocket', {});
    const defaultPrime = loadPrimeAppWithEnv({});
    expect(defaultWebsocket.env.WEBSOCKET_AUTH_TOKEN).toBeUndefined();
    expect(defaultPrime.env.WEBSOCKET_AUTH_TOKEN).toBeUndefined();
  });

  test('production start surfaces use the PM2 ecosystem profile for live processes', () => {
    const packageJson = require('../package.json');
    const deployWorkflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'deploy.yml'), 'utf8');
    const startScript = fs.readFileSync(path.join(__dirname, '..', 'start-ogzprime.sh'), 'utf8');
    const cpuSetupScript = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'cpu-vps-setup.sh'), 'utf8');
    const packageScript = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'create-package.sh'), 'utf8');
    const websocketServer = fs.readFileSync(path.join(__dirname, '..', 'ogzprime-ssl-server.js'), 'utf8');

    expect(packageJson.scripts['start:prod']).toContain('pm2 startOrReload ecosystem.config.js --only ogz-websocket --update-env');
    expect(packageJson.scripts['start:prod']).toContain('pm2 startOrReload ecosystem.config.js --only ogz-prime-v2 --update-env');
    expect(packageJson.scripts['start:prod']).not.toMatch(/pm2\s+start\s+run-empire-v2\.js/);
    expect(deployWorkflow).toContain('pm2 startOrReload ecosystem.config.js --only ogz-websocket --update-env');
    expect(deployWorkflow).toContain('pm2 startOrReload ecosystem.config.js --only ogz-prime-v2 --update-env');
    expect(deployWorkflow).not.toMatch(/pm2\s+start\s+run-empire-v2\.js/);
    expect(startScript).toContain('pm2 startOrReload ecosystem.config.js --only ogz-websocket --update-env');
    expect(startScript).toContain('pm2 startOrReload ecosystem.config.js --only ogz-stripe --update-env');
    expect(startScript).toContain('pm2 startOrReload ecosystem.config.js --only ogz-prime-v2 --update-env');
    expect(startScript).not.toMatch(/pm2\s+(start|restart)\s+(public\/stripe-checkout\.js|ogz-(websocket|prime-v2|stripe)\b)/);
    expect(cpuSetupScript).toContain('pm2 startOrReload ecosystem.config.js --only ogz-websocket --update-env');
    expect(cpuSetupScript).toContain('pm2 startOrReload ecosystem.config.js --only ogz-prime-v2 --update-env');
    expect(cpuSetupScript).not.toMatch(/pm2\s+start\s+(ogzprime-ssl-server\.js|run-empire-v2\.js)/);
    expect(packageScript).toContain('pm2 startOrReload ecosystem.config.js --only ogz-websocket --update-env');
    expect(packageScript).toContain('pm2 startOrReload ecosystem.config.js --only ogz-prime-v2 --update-env');
    expect(packageScript).not.toMatch(/pm2\s+start\s+ecosystem\.config\.js\b/);
    expect(websocketServer).toContain('pm2 startOrReload ecosystem.config.js --only ogz-websocket --update-env');
    expect(websocketServer).not.toMatch(/pm2\s+start\s+ogzprime-ssl-server\.js/);
  });
});
