'use strict';

const fs = require('fs');
const path = require('path');

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
  'INCEPTION_API_KEY',
  'INITIAL_BALANCE',
  'STARTING_BALANCE',
  'OGZ_ACCOUNT_ID',
  'OGZ_ACCOUNT_LABEL',
  'OGZ_ACCOUNT_STAGE',
  'OGZ_ACCOUNT_STATUS',
  'OGZ_MIN_TRADES_REQUIRED',
  'OGZ_TRACK_RECORD_START_AT',
]);

function currentNewYorkDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function operatorEnvValues() {
  const today = currentNewYorkDate();
  return {
    ALPACA_MODE: 'paper',
    ALPACA_API_KEY: 'test-alpaca-key',
    ALPACA_API_SECRET: 'test-alpaca-secret',
    SIGNALSTACK_WEBHOOK_URL: 'https://signalstack.example/webhook',
    WEBSOCKET_AUTH_TOKEN: 'test-dashboard-runtime-token',
    TTP_ACCOUNT_START_OF_DAY_DATE: today,
    TTP_ACCOUNT_START_OF_DAY_EQUITY: '5000',
    TTP_DAILY_LOSS_LIMIT_DOLLARS: '50',
    TTP_MAX_LOSS_THRESHOLD_EQUITY: '4850',
    TTP_EARNINGS_STATUS_JSON: JSON.stringify({
      date: today,
      symbols: { TSLA: false, NVDA: false, COIN: false, MARA: false, RIOT: false },
    }),
    TTP_PROFIT_TARGET_DOLLARS: '300',
    INCEPTION_API_KEY: 'test-inception-key',
    INITIAL_BALANCE: '5000',
    STARTING_BALANCE: '5000',
    OGZ_ACCOUNT_ID: 'MAX58356',
    OGZ_ACCOUNT_LABEL: 'Trade The Pool MAX5 5K',
    OGZ_ACCOUNT_STAGE: 'EVAL',
    OGZ_ACCOUNT_STATUS: 'active',
    OGZ_MIN_TRADES_REQUIRED: '20',
    OGZ_TRACK_RECORD_START_AT: '2026-06-12T00:00:00.000Z',
  };
}

const LOCKED_PROFILE_ENV_VALUES = Object.freeze({
  ENTRY_STOCK_SHARE_RANGE_ENABLED: 'true',
  ENTRY_MIN_STOCK_SHARES: '2',
  ENTRY_MAX_STOCK_SHARES: '0',
  ENTRY_MAX_STOCK_NOTIONAL: '5000',
  ENTRY_CONSISTENCY_CAP_BUFFER: '0.98',
  ENTRY_DAILY_LOSS_RISK_FRACTION: '1.0',
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
  test('eval live deploy wrapper stamps current date and owns runtime quarantine paths', () => {
    const deployTool = require('../tools/eval-live-deploy');

    expect(deployTool.evalLiveEnv({
      TTP_ACCOUNT_START_OF_DAY_DATE: '2026-06-28',
    }, '2026-06-29')).toEqual(expect.objectContaining({
      TTP_ACCOUNT_START_OF_DAY_DATE: '2026-06-29',
    }));
    expect(deployTool.parseCli(['--with-websocket'])).toEqual({ withWebsocket: true });
    expect(() => deployTool.parseCli(['--json'])).toThrow(/Unknown argument --json/);
    expect(deployTool.RUNTIME_DEPLOY_PATHS).toEqual(expect.arrayContaining([
      'ecosystem.config.js',
      'config',
      'core',
      'modules',
      'foundation',
    ]));
  });

  test('hydrates .env before freezing PM2 runtime values without overriding explicit restart env', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'ecosystem.config.js'), 'utf8');
    const hydrateIndex = source.indexOf('hydratePm2EnvFromDotenv();');
    const operatorIndex = source.indexOf('const evalOperatorEnv = Object.freeze({');
    const dotenvConfigIndex = source.indexOf("require('dotenv').config({");

    expect(dotenvConfigIndex).toBeGreaterThan(-1);
    expect(hydrateIndex).toBeGreaterThan(dotenvConfigIndex);
    expect(operatorIndex).toBeGreaterThan(hydrateIndex);
    expect(source).toContain("path: path.join(__dirname, '.env')");
    expect(source).toContain('override: false');
    expect(source).toContain("if (process.env.NODE_ENV === 'test') return;");
  });

  test('declares paper default PM2 env without committing operator secrets or placeholders', () => {
    const app = loadPrimeAppWithEnv({});

    expect(app.env_eval_live).toBeUndefined();
    expect(app.env).toEqual(expect.objectContaining({
      ALPACA_MODE: 'paper',
      PROFILE: 'paper',
      EXECUTION_MODE: 'paper',
      PAPER_TRADING: 'true',
      LIVE_TRADING: 'false',
      CONFIRM_LIVE_TRADING: 'false',
      STATE_FILE: 'data/state-paper.json',
    }));
    for (const key of OPERATOR_ENV_KEYS.filter((key) => key !== 'ALPACA_MODE')) {
      expect(app.env).toHaveProperty(key, undefined);
    }
  });

  test('default PM2 env stays paper while accepting operator-owned runtime values', () => {
    const operatorEnv = operatorEnvValues();
    const app = loadPrimeAppWithEnv(operatorEnv);
    const env = app.env;

    expect(env).toEqual(expect.objectContaining({
      EXECUTION_MODE: 'paper',
      PROFILE: 'paper',
      PAPER_TRADING: 'true',
      LIVE_TRADING: 'false',
      CONFIRM_LIVE_TRADING: 'false',
      BROKER: 'alpaca',
      ALPACA_MODE: 'paper',
      ASSET_CLASS: 'stocks',
      TRADING_PAIR: 'TSLA',
      ALPACA_SYMBOLS: 'TSLA,NVDA,COIN,MARA,RIOT',
      SYMBOL_LOSS_COOLDOWN_ENABLED: 'true',
      SYMBOL_LOSS_COOLDOWN_CONSECUTIVE_LOSSES: '2',
      SYMBOL_LOSS_COOLDOWN_MINUTES: '120',
      STATE_FILE: 'data/state.json',
      ENABLE_TRAI: 'true',
      TRAI_MODE: 'passive',
      TRAI_VETO: 'false',
      TRAI_ENABLE_BACKTEST: 'true',
      WEBHOOK_ORDERS_ENABLED: 'true',
      WEBHOOK_DRY_RUN: 'false',
      MIN_TRADE_CONFIDENCE: '0.5',
      EVAL_RULES_ENABLED: 'true',
      TTP_RULES_ENABLED: 'true',
      RISK_MANAGER_BYPASS: 'false',
      ACCOUNT_DRAWDOWN_BYPASS: 'false',
      STATE_FILE: 'data/state-paper.json',
      ...LOCKED_PROFILE_ENV_VALUES,
    }));
    expect(env.ALPACA_API_KEY).toBe('test-alpaca-key');
    expect(env.ALPACA_API_SECRET).toBe('test-alpaca-secret');
    expect(env.SIGNALSTACK_WEBHOOK_URL).toBe('https://signalstack.example/webhook');
    expect(env.WEBSOCKET_AUTH_TOKEN).toBe('test-dashboard-runtime-token');
    expect(env.INCEPTION_API_KEY).toBe('test-inception-key');
    expect(env).not.toHaveProperty('SESSION_ROUTER_ENABLED');
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
      const app = loadPrimeAppWithEnv(operatorEnvValues());

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
    const operatorEnv = operatorEnvValues();
    const websocket = loadAppWithEnv('ogz-websocket', operatorEnv);
    const prime = loadPrimeAppWithEnv(operatorEnv);

    for (const app of [websocket, prime]) {
      expect(app.env).toEqual(expect.objectContaining({
        ALPACA_STOCK_DATA_URL: 'https://data.alpaca.markets/v2/stocks',
        ALPACA_STOCK_DATA_FEED: 'iex',
        ALPACA_STOCK_DATA_ADJUSTMENT: 'split',
        DASHBOARD_STOCK_PRICE_SYMBOLS: 'TSLA,NVDA,COIN,MARA,RIOT',
        STOCK_TICKER_MAX_AGE_MS: '900000',
        ALPACA_DATA_STREAM_URL: 'wss://stream.data.alpaca.markets/v2/iex',
        ALPACA_STOCK_STREAM_FEED: 'iex',
      }));
    }

    expect(websocket.env).toEqual(expect.objectContaining({
      ALPACA_API_KEY: operatorEnv.ALPACA_API_KEY,
      ALPACA_API_SECRET: operatorEnv.ALPACA_API_SECRET,
    }));
  });

  test('dashboard websocket token is operator-owned and passed only to runtime processes', () => {
    const operatorEnv = operatorEnvValues();
    const websocket = loadAppWithEnv('ogz-websocket', operatorEnv);
    const prime = loadPrimeAppWithEnv(operatorEnv);

    expect(websocket.env.WEBSOCKET_AUTH_TOKEN).toBe(operatorEnv.WEBSOCKET_AUTH_TOKEN);
    expect(prime.env.WEBSOCKET_AUTH_TOKEN).toBe(operatorEnv.WEBSOCKET_AUTH_TOKEN);

    const defaultWebsocket = loadAppWithEnv('ogz-websocket', {});
    const defaultPrime = loadPrimeAppWithEnv({});
    expect(defaultWebsocket.env.WEBSOCKET_AUTH_TOKEN).toBeUndefined();
    expect(defaultPrime.env.WEBSOCKET_AUTH_TOKEN).toBeUndefined();
  });

  test('ogz-prime-v2 PM2 process sets max_restarts restart loop cap', () => {
    const prime = loadPrimeAppWithEnv(operatorEnvValues());

    expect(prime).toEqual(expect.objectContaining({
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    }));
  });

  test('production start surfaces route eval bot restarts through the live deploy wrapper', () => {
    const packageJson = require('../package.json');
    const deployWorkflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'deploy.yml'), 'utf8');
    const startScript = fs.readFileSync(path.join(__dirname, '..', 'start-ogzprime.sh'), 'utf8');
    const cpuSetupScript = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'cpu-vps-setup.sh'), 'utf8');
    const packageScript = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'create-package.sh'), 'utf8');
    const evalDeployTool = fs.readFileSync(path.join(__dirname, '..', 'tools', 'eval-live-deploy.js'), 'utf8');
    const websocketServer = fs.readFileSync(path.join(__dirname, '..', 'ogzprime-ssl-server.js'), 'utf8');

    expect(packageJson.scripts['start:prod']).toBe('node tools/eval-live-deploy.js --with-websocket');
    expect(packageJson.scripts['start:prod']).not.toMatch(/pm2\s+start\s+run-empire-v2\.js/);
    expect(deployWorkflow).toContain('node tools/eval-live-deploy.js --with-websocket');
    expect(deployWorkflow).not.toMatch(/pm2\s+start\s+run-empire-v2\.js/);
    expect(startScript).toContain('pm2 startOrReload ecosystem.config.js --only ogz-websocket --update-env');
    expect(startScript).toContain('pm2 startOrReload ecosystem.config.js --only ogz-stripe --update-env');
    expect(startScript).toContain('node tools/eval-live-deploy.js');
    expect(startScript).not.toMatch(/pm2\s+(start|restart)\s+(public\/stripe-checkout\.js|ogz-(websocket|prime-v2|stripe)\b)/);
    expect(cpuSetupScript).toContain('pm2 startOrReload ecosystem.config.js --only ogz-websocket --update-env');
    expect(cpuSetupScript).toContain('node tools/eval-live-deploy.js');
    expect(cpuSetupScript).not.toMatch(/pm2\s+start\s+(ogzprime-ssl-server\.js|run-empire-v2\.js)/);
    expect(packageScript).toContain('node tools/eval-live-deploy.js --with-websocket');
    expect(packageScript).not.toMatch(/pm2\s+start\s+ecosystem\.config\.js\b/);
    expect(evalDeployTool).toContain("TTP_ACCOUNT_START_OF_DAY_DATE: today");
    expect(evalDeployTool).toContain("'stash'");
    expect(evalDeployTool).toContain("['startOrReload', 'ecosystem.config.js', '--only', PM2_PROCESS, '--update-env']");
    expect(evalDeployTool).toContain("['ogz-meta/gates/eval-live-posture-gate.js', '--pm2', PM2_PROCESS]");
    expect(websocketServer).toContain('pm2 startOrReload ecosystem.config.js --only ogz-websocket --update-env');
    expect(websocketServer).not.toMatch(/pm2\s+start\s+ogzprime-ssl-server\.js/);
  });
});
