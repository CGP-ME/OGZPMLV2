'use strict';

const EXPLICIT_RUNTIME_TEST_ENV = Object.freeze({
  BROKER: 'alpaca',
  ALPACA_MODE: 'paper',
  ALPACA_API_KEY: 'test-alpaca-key',
  ALPACA_API_SECRET: 'test-alpaca-secret',
  ALPACA_SYMBOLS: 'TSLA',
  ASSET_CLASS: 'stocks',
  RISK_MANAGER_BYPASS: 'false',
  ACCOUNT_DRAWDOWN_BYPASS: 'false',
  MAX_DRAWDOWN: '5',
  MAX_DAILY_LOSS: '1',
  MAX_WEEKLY_LOSS: '5',
  MAX_MONTHLY_LOSS: '5',
});

function applyExplicitRuntimeTestEnv(overrides = {}) {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    ...EXPLICIT_RUNTIME_TEST_ENV,
    ...overrides,
  };
  return () => {
    process.env = originalEnv;
  };
}

module.exports = {
  EXPLICIT_RUNTIME_TEST_ENV,
  applyExplicitRuntimeTestEnv,
};
