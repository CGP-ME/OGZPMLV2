'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  assertEvalLivePosture,
  extractPm2RuntimeEnv,
  validateEvalLivePosture,
} = require('../ogz-meta/gates/eval-live-posture-gate');
const ConfigLoader = require('../foundation/ConfigLoader');

const MISSING_ENV_FILE = path.join(__dirname, 'fixtures', 'missing-eval-live-posture.env');

function validEvalLiveEnv(overrides = {}) {
  return {
    DOTENV_CONFIG_PATH: MISSING_ENV_FILE,
    EXECUTION_MODE: 'live',
    BACKTEST_MODE: 'false',
    PAPER_TRADING: 'false',
    LIVE_TRADING: 'true',
    CONFIRM_LIVE_TRADING: 'true',
    BROKER: 'alpaca',
    ASSET_CLASS: 'stocks',
    TRADING_PAIR: 'TSLA',
    ALPACA_SYMBOLS: 'TSLA',
    CANDLE_TIMEFRAME: '15m',
    SESSION_ROUTER_ENABLED: 'false',
    ENABLE_TRAI: 'false',
    RISK_MANAGER_BYPASS: 'false',
    ACCOUNT_DRAWDOWN_BYPASS: 'false',
    WEBHOOK_ORDERS_ENABLED: 'true',
    WEBHOOK_DRY_RUN: 'false',
    SIGNALSTACK_WEBHOOK_URL: 'https://signalstack.example/webhook',
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
    TTP_ACCOUNT_LIMITS_ENABLED: 'true',
    TTP_DAILY_LOSS_PAUSE_ENABLED: 'true',
    TTP_MAX_LOSS_ENABLED: 'true',
    TTP_ACCOUNT_START_OF_DAY_DATE: '2026-06-08',
    TTP_ACCOUNT_START_OF_DAY_EQUITY: '50000',
    TTP_DAILY_LOSS_LIMIT_DOLLARS: '500',
    TTP_MAX_LOSS_THRESHOLD_EQUITY: '47500',
    TTP_EARNINGS_RESTRICTION_ENABLED: 'true',
    TTP_EARNINGS_BLOCK_ENTRIES: 'true',
    TTP_EARNINGS_REQUIRE_KNOWN_STATUS: 'true',
    TTP_EARNINGS_STATUS_JSON: '{"date":"2026-06-08","symbols":{"TSLA":false}}',
    TTP_CONSISTENCY_ENABLED: 'true',
    TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO: '0.30',
    TTP_PROFIT_TARGET_DOLLARS: '3000',
    TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO: '0.10',
    INITIAL_BALANCE: '50000',
    ...overrides,
  };
}

describe('eval live posture gate', () => {
  test('passes only with explicit Alpaca TSLA live posture and redacts webhook URL', () => {
    const report = validateEvalLivePosture(validEvalLiveEnv());

    expect(report.status).toBe('PASS');
    expect(report.errors).toEqual([]);
    expect(report.checked.config['mode.execution']).toEqual({ value: 'live', source: 'env:EXECUTION_MODE' });
    expect(report.checked.config['risk.riskManagerBypass']).toEqual({ value: false, source: 'env:RISK_MANAGER_BYPASS' });
    expect(report.checked.webhook).toEqual({
      present: true,
      protocol: 'https:',
      source: 'env:SIGNALSTACK_WEBHOOK_URL',
    });
    expect(JSON.stringify(report)).not.toContain('signalstack.example');
  });

  test('does not mutate process.env while validating supplied env', () => {
    const before = {
      EXECUTION_MODE: process.env.EXECUTION_MODE,
      LIVE_TRADING: process.env.LIVE_TRADING,
      SIGNALSTACK_WEBHOOK_URL: process.env.SIGNALSTACK_WEBHOOK_URL,
    };

    const report = validateEvalLivePosture(validEvalLiveEnv());

    expect(report.status).toBe('PASS');
    expect({
      EXECUTION_MODE: process.env.EXECUTION_MODE,
      LIVE_TRADING: process.env.LIVE_TRADING,
      SIGNALSTACK_WEBHOOK_URL: process.env.SIGNALSTACK_WEBHOOK_URL,
    }).toEqual(before);
  });

  test('runtime-source validation does not backfill missing PM2 env from dotenv', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-eval-posture-'));
    const envPath = path.join(tempDir, '.env');
    fs.writeFileSync(envPath, 'WEBHOOK_DRY_RUN=false\n', 'utf8');

    try {
      const sourceEnv = validEvalLiveEnv({ DOTENV_CONFIG_PATH: envPath });
      delete sourceEnv.WEBHOOK_DRY_RUN;

      const dotenvBackfilledReport = validateEvalLivePosture(sourceEnv);
      const runtimeOnlyReport = validateEvalLivePosture(sourceEnv, { loadDotenv: false });

      expect(dotenvBackfilledReport.status).toBe('PASS');
      expect(runtimeOnlyReport.status).toBe('FAIL');
      expect(runtimeOnlyReport.errors.join('\n')).toMatch(/WEBHOOK_DRY_RUN must be explicitly set to false, got missing/);
      expect(runtimeOnlyReport.checked.env.WEBHOOK_DRY_RUN).toEqual({ value: null, source: 'missing' });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('does not replace the ConfigLoader cached runtime config while validating supplied env', () => {
    const originalEnv = process.env;
    process.env = validEvalLiveEnv({
      EXECUTION_MODE: 'paper',
      PAPER_TRADING: 'false',
      LIVE_TRADING: 'false',
      CONFIRM_LIVE_TRADING: 'false',
      WEBHOOK_ORDERS_ENABLED: 'false',
      WEBHOOK_DRY_RUN: 'true',
      EVAL_RULES_ENABLED: 'false',
      TTP_RULES_ENABLED: 'false',
    });

    try {
      const cachedBefore = ConfigLoader.load({ force: true, silent: true });
      const report = validateEvalLivePosture(validEvalLiveEnv());
      const cachedAfter = ConfigLoader.load({ silent: true });

      expect(report.status).toBe('PASS');
      expect(cachedAfter.fingerprint).toBe(cachedBefore.fingerprint);
      expect(cachedAfter.config.mode.execution).toBe('paper');
    } finally {
      process.env = originalEnv;
      ConfigLoader.load({ force: true, silent: true });
    }
  });

  test('fails current paper or dry-run posture instead of treating bot health as eval-ready', () => {
    const report = validateEvalLivePosture(validEvalLiveEnv({
      EXECUTION_MODE: 'paper',
      PAPER_TRADING: 'true',
      LIVE_TRADING: 'false',
      CONFIRM_LIVE_TRADING: 'false',
      WEBHOOK_DRY_RUN: 'true',
      EVAL_RULES_ENABLED: 'false',
      TTP_RULES_ENABLED: 'false',
    }));

    expect(report.status).toBe('FAIL');
    expect(report.errors.join('\n')).toMatch(/mode\.execution must be live/);
    expect(report.errors.join('\n')).toMatch(/mode\.paperTrading must be false/);
    expect(report.errors.join('\n')).toMatch(/mode\.liveTrading must be true/);
    expect(report.errors.join('\n')).toMatch(/WEBHOOK_DRY_RUN must be false/);
    expect(report.errors.join('\n')).toMatch(/EVAL_RULES_ENABLED must be true/);
  });

  test('fails if a critical live flag only passes by ConfigLoader default', () => {
    const env = validEvalLiveEnv();
    delete env.ENABLE_TRAI;

    const report = validateEvalLivePosture(env);

    expect(report.status).toBe('FAIL');
    expect(report.errors.join('\n')).toMatch(/trai\.enabled must be explicitly sourced/);
  });

  test('rejects backtest tuning profile bleed and unsafe runtime tuning profiles', () => {
    const backtestProfileReport = validateEvalLivePosture(validEvalLiveEnv({
      BACKTEST_TUNING_PROFILE: 'current-eval',
    }));
    expect(backtestProfileReport.status).toBe('FAIL');
    expect(backtestProfileReport.errors.join('\n')).toMatch(/BACKTEST_TUNING_PROFILE must not be set/);

    const runtimeProfileReport = validateEvalLivePosture(validEvalLiveEnv({
      TUNING_PROFILE: 'current-eval',
    }));
    expect(runtimeProfileReport.status).toBe('FAIL');
    expect(runtimeProfileReport.errors.join('\n')).toMatch(/startup-snapshot key\(s\).*RISK_MANAGER_BYPASS/);
    expect(runtimeProfileReport.errors.join('\n')).toMatch(/RISK_MANAGER_BYPASS=true/);
    expect(runtimeProfileReport.errors.join('\n')).toMatch(/ACCOUNT_DRAWDOWN_BYPASS=true/);
  });

  test('requires current TSLA earnings status to match the start-of-day date', () => {
    const report = validateEvalLivePosture(validEvalLiveEnv({
      TTP_EARNINGS_STATUS_JSON: '{"date":"2026-06-07","symbols":{"TSLA":false}}',
    }));

    expect(report.status).toBe('FAIL');
    expect(report.errors.join('\n')).toMatch(/earnings status date must match account start date 2026-06-08/);
  });

  test('requires TSLA earnings status to be an explicit boolean', () => {
    const report = validateEvalLivePosture(validEvalLiveEnv({
      TTP_EARNINGS_STATUS_JSON: '{"date":"2026-06-08","symbols":{"TSLA":"false"}}',
    }));

    expect(report.status).toBe('FAIL');
    expect(report.errors.join('\n')).toMatch(/symbols\.TSLA must be boolean/);
  });

  test('assert helper throws with a useful gate error', () => {
    expect(() => assertEvalLivePosture(validEvalLiveEnv({
      RISK_MANAGER_BYPASS: 'true',
    }))).toThrow(/eval-live posture gate failed: .*RISK_MANAGER_BYPASS=true/);
  });

  test('PM2 env extraction fails closed instead of returning PM2 metadata', () => {
    expect(() => extractPm2RuntimeEnv({
      name: 'ogz-prime-v2',
      pm2_env: { EXECUTION_MODE: 'live' },
    })).toThrow(/did not expose nested runtime env/);

    const runtimeEnv = { EXECUTION_MODE: 'paper' };
    expect(extractPm2RuntimeEnv({
      name: 'ogz-prime-v2',
      pm2_env: {
        EXECUTION_MODE: 'metadata-value',
        env: runtimeEnv,
      },
    })).toBe(runtimeEnv);
  });

  test('runtime-source posture report does not emit unrelated PM2 secret env values', () => {
    const report = validateEvalLivePosture(validEvalLiveEnv({
      WEBSOCKET_AUTH_TOKEN: 'secret-runtime-token',
      OLLAMA_API_KEY: 'secret-ollama-key',
    }), { loadDotenv: false });

    expect(report.status).toBe('PASS');
    expect(JSON.stringify(report)).not.toContain('secret-runtime-token');
    expect(JSON.stringify(report)).not.toContain('secret-ollama-key');
  });
});
