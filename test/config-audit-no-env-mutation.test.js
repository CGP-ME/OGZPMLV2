'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('config-audit env boundary', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  test('reads dotenv-backed ConfigLoader values without mutating process.env', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-audit-env-'));
    const envPath = path.join(tempDir, '.env');
    fs.writeFileSync(envPath, [
      'BACKTEST_MODE=true',
      'MIN_TRADE_CONFIDENCE=0.61',
      'BASE_POSITION_SIZE=0.04',
      'STOP_LOSS_PERCENT=2.25',
      'TIER1_TARGET=0.012',
      '',
    ].join('\n'));

    try {
      process.env = {
        ...originalEnv,
        DOTENV_CONFIG_PATH: envPath,
        LIVE_TRADING: 'false',
        RISK_MANAGER_BYPASS: 'true',
        ACCOUNT_DRAWDOWN_BYPASS: 'true',
        MAX_DRAWDOWN: '5',
        MAX_DAILY_LOSS: '1',
        MAX_WEEKLY_LOSS: '5',
        MAX_MONTHLY_LOSS: '5',
        KRAKEN_API_KEY: 'audit-test-api-key',
        KRAKEN_API_SECRET: 'audit-test-api-secret',
        SIGNALSTACK_WEBHOOK_URL: 'https://signalstack.example/audit-secret',
        SENTRY_DSN: 'https://sentry.example/audit-secret',
      };
      delete process.env.BACKTEST_MODE;
      delete process.env.MIN_TRADE_CONFIDENCE;
      delete process.env.BASE_POSITION_SIZE;
      delete process.env.STOP_LOSS_PERCENT;
      delete process.env.TIER1_TARGET;

      const audit = require('../tools/config-audit');
      const context = audit.createAuditContext();
      const resolved = audit.buildResolvedConfig(context);

      const configLoaderLeaves = audit.flattenConfigLeaves(context.configSnapshot.config);
      const missingConfigLoaderLeaves = Object.keys(configLoaderLeaves)
        .filter(configPath => !Object.prototype.hasOwnProperty.call(resolved, configPath));

      expect(Object.keys(resolved).length).toBeGreaterThan(82);
      expect(missingConfigLoaderLeaves).toEqual([]);
      expect(resolved['mode.liveTading']).toBeUndefined();
      expect(resolved['mode.liveTrading']).toMatchObject({
        value: false,
        source: 'env:LIVE_TRADING',
      });
      expect(resolved['mode.confirmLiveTrading']).toMatchObject({
        value: false,
        source: 'default',
      });
      expect(resolved['mode.testMode']).toMatchObject({
        value: false,
        source: 'default',
      });
      expect(resolved['mode.backtest']).toMatchObject({
        value: true,
        source: 'dotenv:BACKTEST_MODE',
      });
      expect(resolved['confidence.minTradeConfidence']).toMatchObject({
        value: 0.61,
        source: 'dotenv:MIN_TRADE_CONFIDENCE',
      });
      expect(resolved['sizing.basePositionSize']).toMatchObject({
        value: 0.04,
        source: 'dotenv:BASE_POSITION_SIZE',
      });
      expect(resolved['exits.stopLossPercent']).toMatchObject({
        value: 2.25,
        source: 'dotenv:STOP_LOSS_PERCENT',
      });
      expect(resolved['tiers.tier1']).toMatchObject({
        value: 0.012,
        source: 'dotenv:TIER1_TARGET',
      });
      expect(resolved['broker.apiKey']).toMatchObject({
        value: audit.REDACTED_VALUE,
        source: 'env:KRAKEN_API_KEY',
        redacted: true,
      });
      expect(resolved['broker.apiSecret']).toMatchObject({
        value: audit.REDACTED_VALUE,
        source: 'env:KRAKEN_API_SECRET',
        redacted: true,
      });
      expect(resolved['webhookOrders.webhookUrl']).toMatchObject({
        value: audit.REDACTED_VALUE,
        source: 'env:SIGNALSTACK_WEBHOOK_URL',
        redacted: true,
      });
      expect(resolved['monitoring.sentryDsn']).toMatchObject({
        value: audit.REDACTED_VALUE,
        source: 'env:SENTRY_DSN',
        redacted: true,
      });
      expect(JSON.stringify(resolved)).not.toContain('audit-test-api-key');
      expect(JSON.stringify(resolved)).not.toContain('audit-test-api-secret');
      expect(JSON.stringify(resolved)).not.toContain('signalstack.example/audit-secret');
      expect(JSON.stringify(resolved)).not.toContain('sentry.example/audit-secret');

      expect(process.env.BACKTEST_MODE).toBeUndefined();
      expect(process.env.MIN_TRADE_CONFIDENCE).toBeUndefined();
      expect(process.env.BASE_POSITION_SIZE).toBeUndefined();
      expect(process.env.STOP_LOSS_PERCENT).toBeUndefined();
      expect(process.env.TIER1_TARGET).toBeUndefined();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('keeps every audited env key mapped to ConfigLoader and labels loader fallbacks', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'config-audit.js'), 'utf8');
    const calls = [...source.matchAll(/getSource\('([A-Z0-9_]+)'/g)].map(match => match[1]);

    const audit = require('../tools/config-audit');
    const missing = calls.filter(envKey => !audit.CONFIG_LOADER_ENV_PATHS[envKey]);

    expect(missing).toEqual([]);
    expect(audit.sourceLabelFor('ConfigLoader:mode.liveTrading')).toBe('CFG');
    expect(audit.sourceLabelFor('TradingConfig:pipeline.enableRSI')).toBe('TC');
  });

  test('surfaces default-sourced risk config as audit violations', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-audit-risk-'));
    const envPath = path.join(tempDir, '.env');
    fs.writeFileSync(envPath, 'BACKTEST_MODE=true\n');

    try {
      process.env = {
        DOTENV_CONFIG_PATH: envPath,
        BACKTEST_MODE: 'true',
      };

      const audit = require('../tools/config-audit');
      const context = audit.createAuditContext();

      expect(audit.getRiskConfigViolations(context)).toEqual([
        'risk.riskManagerBypass requires explicit env/profile source',
        'risk.maxDrawdown requires explicit env/profile source',
        'risk.maxDailyLoss requires explicit env/profile source',
        'risk.maxWeeklyLoss requires explicit env/profile source',
        'risk.maxMonthlyLoss requires explicit env/profile source',
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
