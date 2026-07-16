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
      'PROFILE=backtest-all',
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
        KRAKEN_API_KEY: 'audit-test-api-key',
        KRAKEN_API_SECRET: 'audit-test-api-secret',
        SIGNALSTACK_WEBHOOK_URL: 'https://signalstack.example/audit-secret',
        SENTRY_DSN: 'https://sentry.example/audit-secret',
      };
      delete process.env.BACKTEST_MODE;
      delete process.env.PROFILE;
      delete process.env.MIN_TRADE_CONFIDENCE;
      delete process.env.BASE_POSITION_SIZE;
      delete process.env.STOP_LOSS_PERCENT;
      delete process.env.TIER1_TARGET;
      delete process.env.MAX_WEEKLY_LOSS;
      delete process.env.MAX_MONTHLY_LOSS;
      // Canonical test baseline pins ALPACA_MODE; this test needs it absent
      // from env so the audit fixture is proven to supply it.
      delete process.env.ALPACA_MODE;

      const audit = require('../tools/config-audit');
      const context = audit.createAuditContext();
      const resolved = audit.buildResolvedConfig(context);

      const configLoaderLeaves = audit.flattenConfigLeaves(context.configSnapshot.config);
      const missingConfigLoaderLeaves = Object.keys(configLoaderLeaves)
        .filter(configPath => !Object.prototype.hasOwnProperty.call(resolved, configPath));

      expect(Object.keys(resolved).length).toBeGreaterThan(82);
      expect(context.auditFixtureKeys).toEqual(expect.arrayContaining(['ALPACA_MODE']));
      expect(context.auditFixtureKeys).not.toEqual(expect.arrayContaining([
        'RISK_MANAGER_BYPASS',
        'TTP_DAILY_LOSS_LIMIT_DOLLARS',
        'TTP_MAX_LOSS_THRESHOLD_EQUITY',
      ]));
      expect(missingConfigLoaderLeaves).toEqual([]);
      expect(resolved['broker.alpacaMode']).toMatchObject({
        value: 'paper',
        source: 'audit-fixture:ALPACA_MODE',
      });
      expect(resolved['risk.guardMode']).toMatchObject({
        value: 'off',
        source: 'config:launchProfiles.backtest-all.risk.guardMode',
      });
      expect(resolved['mode.liveTading']).toBeUndefined();
      expect(resolved['mode.liveTrading']).toMatchObject({
        value: false,
        source: 'config:launchProfiles.backtest-all.mode',
      });
      expect(resolved['mode.confirmLiveTrading']).toMatchObject({
        value: false,
        source: 'config:launchProfiles.backtest-all.confirmLive',
      });
      expect(resolved['mode.testMode']).toMatchObject({
        value: false,
        source: 'config:launchProfiles.backtest-all.mode',
      });
      expect(resolved['mode.backtest']).toMatchObject({
        value: true,
        source: 'config:launchProfiles.backtest-all.mode',
      });
      expect(resolved['confidence.minTradeConfidence']).toMatchObject({
        value: 0.5,
        source: 'config:launchProfiles.backtest-all.confidence.minTradeConfidence',
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
      expect(process.env.PROFILE).toBeUndefined();
      expect(process.env.MIN_TRADE_CONFIDENCE).toBeUndefined();
      expect(process.env.BASE_POSITION_SIZE).toBeUndefined();
      expect(process.env.STOP_LOSS_PERCENT).toBeUndefined();
      expect(process.env.TIER1_TARGET).toBeUndefined();
      expect(process.env.ALPACA_MODE).toBeUndefined();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('audit fixture does not override dotenv-backed required values', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-audit-fixture-'));
    const envPath = path.join(tempDir, '.env');
    fs.writeFileSync(envPath, [
      'PROFILE=paper',
      'ALPACA_MODE=live',
	      'ALPACA_API_KEY=audit-alpaca-key',
	      'ALPACA_API_SECRET=audit-alpaca-secret',
	      'ALPACA_SYMBOLS=TSLA',
	      'TTP_ACCOUNT_START_OF_DAY_EQUITY=5000',
      'TTP_DAILY_LOSS_LIMIT_DOLLARS=50',
      'TTP_MAX_LOSS_THRESHOLD_EQUITY=4850',
      'TTP_PROFIT_TARGET_DOLLARS=300',
      '',
    ].join('\n'));

    try {
      process.env = {
        DOTENV_CONFIG_PATH: envPath,
        BROKER: 'alpaca',
      };

      const audit = require('../tools/config-audit');
      const context = audit.createAuditContext();

      expect(context.auditFixtureKeys).toEqual([]);
      expect(context.configSnapshot.config.broker.alpacaMode).toBe('live');
      expect(context.configSnapshot.sources['broker.alpacaMode']).toBe('dotenv:ALPACA_MODE');
      expect(audit.buildResolvedConfig(context)['broker.alpacaMode']).toMatchObject({
        value: 'live',
        source: 'dotenv:ALPACA_MODE',
      });
	      expect(context.configSnapshot.config.risk.guardMode).toBe('off');
	      expect(context.configSnapshot.sources['risk.guardMode']).toBe('config:launchProfiles.paper.risk.guardMode');
	      expect(process.env.ALPACA_MODE).toBeUndefined();
	      expect(process.env.MAX_DRAWDOWN).toBeUndefined();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('audit fixture does not override sourceEnv-backed required values', () => {
    const audit = require('../tools/config-audit');
    const context = audit.createAuditContext({
      sourceEnv: {
        PROFILE: 'backtest-all',
        BACKTEST_MODE: 'true',
        // Backtest-mode audit context must not inherit live posture from the
        // repo .env via dotenv; the fixture declares its mode explicitly
        // (EXECUTION_MODE=live in the repo .env alone resurrects live mode).
        LIVE_TRADING: 'false',
        EXECUTION_MODE: 'backtest',
        ALPACA_MODE: 'live',
        MAX_WEEKLY_LOSS: '6',
        MAX_MONTHLY_LOSS: '12',
      },
    });
    const resolved = audit.buildResolvedConfig(context);

	    expect(context.auditFixtureKeys).not.toEqual(expect.arrayContaining([
	      'ALPACA_MODE',
	      'TTP_DAILY_LOSS_LIMIT_DOLLARS',
	      'TTP_MAX_LOSS_THRESHOLD_EQUITY',
	    ]));
    expect(resolved['broker.alpacaMode']).toMatchObject({
      value: 'live',
      source: 'env:ALPACA_MODE',
    });
    expect(resolved['risk.guardMode']).toMatchObject({
      value: 'off',
      source: 'config:launchProfiles.backtest-all.risk.guardMode',
    });
  });

  test('keeps every audited env key mapped to ConfigLoader and labels loader fallbacks', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'config-audit.js'), 'utf8');
    const calls = [...source.matchAll(/getSource\('([A-Z0-9_]+)'/g)].map(match => match[1]);

    const audit = require('../tools/config-audit');
    const missing = calls.filter(envKey => !audit.CONFIG_LOADER_ENV_PATHS[envKey]);

    expect(missing).toEqual([]);
	    expect(audit.sourceLabelFor('audit-fixture:TTP_DAILY_LOSS_LIMIT_DOLLARS')).toBe('AUD');
    expect(audit.sourceLabelFor('ConfigLoader:mode.liveTrading')).toBe('CFG');
    expect(audit.sourceLabelFor('ConfigLoader:pipeline.enableRSI')).toBe('CFG');
  });

  test('surfaces default-sourced risk config as audit violations', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-audit-risk-'));
    const envPath = path.join(tempDir, '.env');
    fs.writeFileSync(envPath, 'BACKTEST_MODE=true\n');

    try {
      process.env = {
        DOTENV_CONFIG_PATH: envPath,
        PROFILE: 'backtest-all',
        BACKTEST_MODE: 'true',
      };

      const audit = require('../tools/config-audit');
      const context = audit.createAuditContext({ useAuditFixture: false });

	    expect(audit.getRiskConfigViolations(context)).toEqual([]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
