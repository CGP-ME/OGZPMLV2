'use strict';

const {
  validateEvalLivePosture,
} = require('../ogz-meta/gates/eval-live-posture-gate');

const OPERATOR_ENV_KEYS = Object.freeze([
  'ALPACA_MODE',
  'ALPACA_API_KEY',
  'ALPACA_API_SECRET',
  'SIGNALSTACK_WEBHOOK_URL',
  'TTP_ACCOUNT_START_OF_DAY_DATE',
  'TTP_ACCOUNT_START_OF_DAY_EQUITY',
  'TTP_DAILY_LOSS_LIMIT_DOLLARS',
  'TTP_MAX_LOSS_THRESHOLD_EQUITY',
  'TTP_EARNINGS_STATUS_JSON',
  'TTP_PROFIT_TARGET_DOLLARS',
  'INITIAL_BALANCE',
]);

const OPERATOR_ENV_VALUES = Object.freeze({
  ALPACA_MODE: 'paper',
  ALPACA_API_KEY: 'test-alpaca-key',
  ALPACA_API_SECRET: 'test-alpaca-secret',
  SIGNALSTACK_WEBHOOK_URL: 'https://signalstack.example/webhook',
  TTP_ACCOUNT_START_OF_DAY_DATE: '2026-06-08',
  TTP_ACCOUNT_START_OF_DAY_EQUITY: '50000',
  TTP_DAILY_LOSS_LIMIT_DOLLARS: '500',
  TTP_MAX_LOSS_THRESHOLD_EQUITY: '47500',
  TTP_EARNINGS_STATUS_JSON: '{"date":"2026-06-08","symbols":{"TSLA":false}}',
  TTP_PROFIT_TARGET_DOLLARS: '3000',
  INITIAL_BALANCE: '50000',
});

function loadPrimeAppWithEnv(envValues) {
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
    return ecosystem.apps.find((app) => app.name === 'ogz-prime-v2');
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
      ALPACA_SYMBOLS: 'TSLA',
      STATE_FILE: 'data/state.json',
      SESSION_ROUTER_ENABLED: 'false',
      ENABLE_TRAI: 'false',
      WEBHOOK_ORDERS_ENABLED: 'true',
      WEBHOOK_DRY_RUN: 'false',
      EVAL_RULES_ENABLED: 'true',
      TTP_RULES_ENABLED: 'true',
      RISK_MANAGER_BYPASS: 'false',
      ACCOUNT_DRAWDOWN_BYPASS: 'false',
    }));
    expect(report.checked.config['mode.execution']).toEqual({ value: 'live', source: 'env:EXECUTION_MODE' });
    expect(report.checked.config['broker.id']).toEqual({ value: 'alpaca', source: 'env:BROKER' });
    expect(JSON.stringify(report)).not.toContain(OPERATOR_ENV_VALUES.ALPACA_API_KEY);
    expect(JSON.stringify(report)).not.toContain(OPERATOR_ENV_VALUES.ALPACA_API_SECRET);
    expect(JSON.stringify(report)).not.toContain(OPERATOR_ENV_VALUES.SIGNALSTACK_WEBHOOK_URL);
  });
});
