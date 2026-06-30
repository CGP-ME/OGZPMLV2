'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  assertEvalLivePosture,
  assertEvalLiveReadiness,
  extractPm2RuntimeEnv,
  readPersistedStateExposure,
  validateEvalLiveReadiness,
  validateEvalLivePosture,
} = require('../ogz-meta/gates/eval-live-posture-gate');
const ConfigLoader = require('../foundation/ConfigLoader');

const MISSING_ENV_FILE = path.join(__dirname, 'fixtures', 'missing-eval-live-posture.env');
const EVAL_ALPACA_SYMBOLS = 'TSLA,NVDA,SPY,QQQ,COIN,MARA';

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

function earningsStatusJson(date = currentNewYorkDate(), symbolOverrides = {}) {
  return JSON.stringify({
    date,
    symbols: {
      TSLA: false,
      NVDA: false,
      SPY: false,
      QQQ: false,
      COIN: false,
      MARA: false,
      ...symbolOverrides,
    },
  });
}

function validEvalLiveEnv(overrides = {}) {
  const today = currentNewYorkDate();
  return {
    DOTENV_CONFIG_PATH: MISSING_ENV_FILE,
    EXECUTION_MODE: 'live',
    BACKTEST_MODE: 'false',
    PAPER_TRADING: 'false',
    LIVE_TRADING: 'true',
    CONFIRM_LIVE_TRADING: 'true',
    BROKER: 'alpaca',
    ALPACA_MODE: 'paper',
    ALPACA_API_KEY: 'test-alpaca-key',
    ALPACA_API_SECRET: 'test-alpaca-secret',
    ASSET_CLASS: 'stocks',
    TRADING_PAIR: 'TSLA',
    ALPACA_SYMBOLS: EVAL_ALPACA_SYMBOLS,
    CANDLE_TIMEFRAME: '15m',
    STATE_FILE: 'data/state.json',
    SESSION_ROUTER_ENABLED: 'false',
    ENABLE_TRAI: 'true',
    TRAI_MODE: 'passive',
    TRAI_VETO: 'false',
    RISK_MANAGER_BYPASS: 'false',
    ACCOUNT_DRAWDOWN_BYPASS: 'false',
    MAX_DRAWDOWN: '5',
    MAX_DAILY_LOSS: '1',
    MAX_WEEKLY_LOSS: '5',
    MAX_MONTHLY_LOSS: '5',
    WEBHOOK_ORDERS_ENABLED: 'true',
    WEBHOOK_DRY_RUN: 'false',
    SIGNALSTACK_WEBHOOK_URL: 'https://signalstack.example/webhook',
    WEBHOOK_TIMEOUT_MS: '5000',
    WEBHOOK_ORDER_LOG_CAP: '500',
    MIN_TRADE_CONFIDENCE: '0.5',
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
    TTP_ACCOUNT_START_OF_DAY_DATE: today,
    TTP_ACCOUNT_START_OF_DAY_EQUITY: '50000',
    TTP_DAILY_LOSS_LIMIT_DOLLARS: '500',
    TTP_MAX_LOSS_THRESHOLD_EQUITY: '47500',
    TTP_EARNINGS_RESTRICTION_ENABLED: 'true',
    TTP_EARNINGS_BLOCK_ENTRIES: 'true',
    TTP_EARNINGS_STATUS_JSON: earningsStatusJson(today),
    TTP_CONSISTENCY_ENABLED: 'true',
    TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO: '0.30',
    TTP_PROFIT_TARGET_DOLLARS: '3000',
    TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO: '0.10',
    ENTRY_STOCK_SHARE_RANGE_ENABLED: 'true',
    ENTRY_MIN_STOCK_SHARES: '2',
    ENTRY_MAX_STOCK_SHARES: '0',
    ENTRY_MAX_STOCK_NOTIONAL: '5000',
    ENTRY_CONSISTENCY_CAP_BUFFER: '0.98',
    ENTRY_DAILY_LOSS_RISK_FRACTION: '1.0',
    INITIAL_BALANCE: '50000',
    ...overrides,
  };
}

function writeStateFile(filePath, overrides = {}) {
  const state = {
    position: 0,
    inPosition: 0,
    activeTrades: [],
    ...overrides,
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
  return filePath;
}

describe('eval live posture gate', () => {
  test('passes only with explicit Alpaca multi-symbol live posture and redacts webhook URL', () => {
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
    expect(report.checked.symbol.alpacaSymbols).toEqual(['TSLA', 'NVDA', 'SPY', 'QQQ', 'COIN', 'MARA']);
    expect(JSON.stringify(report)).not.toContain('signalstack.example');
  });

  test('rejects eval posture without explicit ConfigLoader-owned Alpaca symbols', () => {
    const env = validEvalLiveEnv();
    delete env.ALPACA_SYMBOLS;

    const report = validateEvalLivePosture(env);

    expect(report.status).toBe('FAIL');
    expect(report.errors.join('\n')).toMatch(/broker\.alpacaSymbols must be explicitly sourced/);
    expect(report.checked.symbol.alpacaSymbolsSource).toBe('default');
  });

  test('requires Alpaca symbols to include TSLA as deterministic primary symbol', () => {
    const missingPrimaryReport = validateEvalLivePosture(validEvalLiveEnv({
      ALPACA_SYMBOLS: 'NVDA,SPY',
    }));
    expect(missingPrimaryReport.status).toBe('FAIL');
    expect(missingPrimaryReport.errors.join('\n')).toMatch(/must include broker\.tradingPair TSLA/);

    const wrongOrderReport = validateEvalLivePosture(validEvalLiveEnv({
      ALPACA_SYMBOLS: 'NVDA,TSLA,SPY',
    }));
    expect(wrongOrderReport.status).toBe('FAIL');
    expect(wrongOrderReport.errors.join('\n')).toMatch(/must list broker\.tradingPair TSLA first/);
  });

  test('readiness passes with explicit flat state and flat Alpaca positions', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-eval-ready-'));
    const stateFile = writeStateFile(path.join(tempDir, 'state.json'));

    try {
      const report = await validateEvalLiveReadiness(validEvalLiveEnv({
        STATE_FILE: stateFile,
      }), {
        allowInjectedBrokerPositions: true,
        readBrokerPositions: async () => [],
      });

      expect(report.status).toBe('PASS');
      expect(report.errors).toEqual([]);
      expect(report.checked.runtimeExposure).toEqual(expect.objectContaining({
        localStateExists: true,
        localActiveTrades: [],
        localSourceLessExposure: false,
        brokerPositions: [],
      }));
      expect(report.checked.runtimeExposure.stateFile).toEqual({
        path: stateFile,
        source: 'env:STATE_FILE',
      });
      expect(JSON.stringify(report)).not.toContain('test-alpaca-key');
      expect(JSON.stringify(report)).not.toContain('test-alpaca-secret');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('readiness rejects persisted local active trades before eval flip', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-eval-local-exposure-'));
    const stateFile = writeStateFile(path.join(tempDir, 'state.json'), {
      position: -957.53,
      inPosition: 957.53,
      activeTrades: [[
        'SIM_1780927200191_c8cg9l',
        {
          orderId: 'SIM_1780927200191_c8cg9l',
          symbol: 'TSLA',
          brokerId: 'alpaca',
          side: 'short',
        },
      ]],
    });

    try {
      const report = await validateEvalLiveReadiness(validEvalLiveEnv({
        STATE_FILE: stateFile,
      }), {
        allowInjectedBrokerPositions: true,
        readBrokerPositions: async () => [],
      });

      expect(report.status).toBe('FAIL');
      expect(report.errors.join('\n')).toMatch(/Persisted StateManager activeTrades must be flat/);
      expect(report.errors.join('\n')).toMatch(/SIM_1780927200191_c8cg9l:TSLA:alpaca:short/);
      expect(report.checked.runtimeExposure.localActiveTrades).toEqual([
        'SIM_1780927200191_c8cg9l:TSLA:alpaca:short',
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('readiness rejects source-less persisted exposure without active trade evidence', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-eval-sourceless-'));
    const stateFile = writeStateFile(path.join(tempDir, 'state.json'), {
      position: 500,
      inPosition: 0,
      activeTrades: [],
    });

    try {
      const report = await validateEvalLiveReadiness(validEvalLiveEnv({
        STATE_FILE: stateFile,
      }), {
        allowInjectedBrokerPositions: true,
        readBrokerPositions: async () => [],
      });

      expect(report.status).toBe('FAIL');
      expect(report.errors.join('\n')).toMatch(/source-less exposure must be flat/);
      expect(report.checked.runtimeExposure.localSourceLessExposure).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('readiness rejects malformed activeTrades instead of treating them as flat', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-eval-malformed-'));
    const stateFile = writeStateFile(path.join(tempDir, 'state.json'), {
      activeTrades: ['not-a-trade'],
    });

    try {
      const report = await validateEvalLiveReadiness(validEvalLiveEnv({
        STATE_FILE: stateFile,
      }), {
        allowInjectedBrokerPositions: true,
        readBrokerPositions: async () => [],
      });

      expect(report.status).toBe('FAIL');
      expect(report.errors.join('\n')).toMatch(/persisted activeTrades contains malformed entries/);
      expect(report.checked.runtimeExposure.localActiveTrades).toEqual([]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('readiness rejects open Alpaca broker positions before eval flip', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-eval-broker-exposure-'));
    const stateFile = writeStateFile(path.join(tempDir, 'state.json'));

    try {
      const report = await validateEvalLiveReadiness(validEvalLiveEnv({
        STATE_FILE: stateFile,
      }), {
        allowInjectedBrokerPositions: true,
        readBrokerPositions: async () => [{ symbol: 'TSLA', qty: '3', side: 'long' }],
      });

      expect(report.status).toBe('FAIL');
      expect(report.errors.join('\n')).toMatch(/Alpaca broker positions must be flat/);
      expect(report.checked.runtimeExposure.brokerPositions).toEqual([
        { symbol: 'TSLA', size: 3, side: 'long' },
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('readiness fails loudly when broker position reader cannot verify exposure', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-eval-broker-failure-'));
    const stateFile = writeStateFile(path.join(tempDir, 'state.json'));

    try {
      const report = await validateEvalLiveReadiness(validEvalLiveEnv({
        STATE_FILE: stateFile,
      }), {
        allowInjectedBrokerPositions: true,
        readBrokerPositions: async () => {
          throw new Error('Alpaca REST unavailable');
        },
      });

      expect(report.status).toBe('FAIL');
      expect(report.errors.join('\n')).toMatch(/Broker exposure reconciliation failed: Alpaca REST unavailable/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('readiness still inspects state when config snapshot is already invalid', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-eval-config-red-'));
    const stateFile = writeStateFile(path.join(tempDir, 'state.json'), {
      activeTrades: [['ORDER_RED', { orderId: 'ORDER_RED', symbol: 'TSLA', brokerId: 'alpaca', side: 'long' }]],
    });
    const env = validEvalLiveEnv({ STATE_FILE: stateFile });
    delete env.MAX_DRAWDOWN;

    try {
      const report = await validateEvalLiveReadiness(env, {
        allowInjectedBrokerPositions: true,
        readBrokerPositions: async () => [],
      });

      expect(report.status).toBe('FAIL');
      expect(report.errors.join('\n')).toMatch(/Runtime exposure reconciliation continuing without config snapshot/);
      expect(report.errors.join('\n')).toMatch(/Persisted StateManager activeTrades must be flat/);
      expect(report.checked.runtimeExposure.configSnapshotLoaded).toBe(false);
      expect(report.checked.runtimeExposure.localActiveTrades).toEqual([
        'ORDER_RED:TSLA:alpaca:long',
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('readiness rejects implicit StateManager state path even while inspecting runtime default', async () => {
    const report = await validateEvalLiveReadiness(validEvalLiveEnv({
      STATE_FILE: '',
    }), {
      allowInjectedBrokerPositions: true,
      readBrokerPositions: async () => [],
    });

    expect(report.status).toBe('FAIL');
    expect(report.errors.join('\n')).toMatch(/paths\.stateFile must be explicitly sourced/);
    expect(report.checked.runtimeExposure.stateFile.path).toBe(path.join(process.cwd(), 'data', 'state.json'));
  });

  test('readiness rejects missing explicit state file as unverifiable exposure', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-eval-missing-state-'));
    const stateFile = path.join(tempDir, 'missing-state.json');

    try {
      const report = await validateEvalLiveReadiness(validEvalLiveEnv({
        STATE_FILE: stateFile,
      }), {
        allowInjectedBrokerPositions: true,
        readBrokerPositions: async () => [],
      });

      expect(report.status).toBe('FAIL');
      expect(report.errors.join('\n')).toMatch(/persisted state file missing/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
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

  test('fails eval-live posture when MIN_TRADE_CONFIDENCE only comes from dotenv', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-eval-confidence-source-'));
    const envPath = path.join(tempDir, '.env');
    fs.writeFileSync(envPath, 'MIN_TRADE_CONFIDENCE=0.5\n', 'utf8');

    try {
      const sourceEnv = validEvalLiveEnv({ DOTENV_CONFIG_PATH: envPath });
      delete sourceEnv.MIN_TRADE_CONFIDENCE;

      const report = validateEvalLivePosture(sourceEnv);

      expect(report.status).toBe('FAIL');
      expect(report.checked.env.MIN_TRADE_CONFIDENCE).toEqual({
        value: '0.5',
        source: 'dotenv:MIN_TRADE_CONFIDENCE',
      });
      expect(report.errors.join('\n')).toMatch(/MIN_TRADE_CONFIDENCE must come from process env/);
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
      ConfigLoader._resetForTest();
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

  test('fails eval-live posture when confidence gate is missing or below eval floor', () => {
    const missingEnv = validEvalLiveEnv();
    delete missingEnv.MIN_TRADE_CONFIDENCE;

    const missingReport = validateEvalLivePosture(missingEnv);

    expect(missingReport.status).toBe('FAIL');
    expect(missingReport.errors.join('\n')).toMatch(/MIN_TRADE_CONFIDENCE must be explicitly set to 0\.5/);
    expect(missingReport.errors.join('\n')).toMatch(/MIN_TRADE_CONFIDENCE from process env/);

    const lowReport = validateEvalLivePosture(validEvalLiveEnv({
      MIN_TRADE_CONFIDENCE: '0.49',
    }));

    expect(lowReport.status).toBe('FAIL');
    expect(lowReport.errors.join('\n')).toMatch(/MIN_TRADE_CONFIDENCE must be 0\.5, got 0\.49/);
    expect(lowReport.errors.join('\n')).toMatch(/MIN_TRADE_CONFIDENCE >= 0\.5/);
  });

  test('fails eval-live posture when stock share range contract is missing or reintroduces universal share cap', () => {
    const missingEnv = validEvalLiveEnv();
    delete missingEnv.ENTRY_MAX_STOCK_SHARES;

    const missingReport = validateEvalLivePosture(missingEnv);

    expect(missingReport.status).toBe('FAIL');
    expect(missingReport.errors.join('\n')).toMatch(/ENTRY_MAX_STOCK_SHARES must be explicitly set to 0/);

    const looseReport = validateEvalLivePosture(validEvalLiveEnv({
      ENTRY_STOCK_SHARE_RANGE_ENABLED: 'false',
      ENTRY_MAX_STOCK_SHARES: '8',
    }));

    expect(looseReport.status).toBe('FAIL');
    expect(looseReport.errors.join('\n')).toMatch(/ENTRY_STOCK_SHARE_RANGE_ENABLED must be true/);
    expect(looseReport.errors.join('\n')).toMatch(/ENTRY_MAX_STOCK_SHARES must be 0, got 8/);
  });

  test('fails if a critical live flag only passes by ConfigLoader default', () => {
    const env = validEvalLiveEnv();
    delete env.ENABLE_TRAI;

    const report = validateEvalLivePosture(env);

    expect(report.status).toBe('FAIL');
    expect(report.errors.join('\n')).toMatch(/trai\.enabled must be explicitly sourced/);
  });

  test('warns eval-live posture when TTP start-of-day date is stale without failing posture', () => {
    const report = validateEvalLivePosture(validEvalLiveEnv({
      TTP_ACCOUNT_START_OF_DAY_DATE: '2026-01-01',
    }));

    expect(report.status).toBe('PASS');
    expect(report.warnings.join('\n')).toMatch(/TTP_ACCOUNT_START_OF_DAY_DATE 2026-01-01 does not match current New York date/);
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

  test('quarantines stale eval earnings status without failing posture', () => {
    const report = validateEvalLivePosture(validEvalLiveEnv({
      TTP_EARNINGS_STATUS_JSON: earningsStatusJson('2026-06-07'),
    }));

    expect(report.status).toBe('PASS');
    expect(report.errors).toEqual([]);
    expect(report.warnings.join('\n')).toMatch(/earnings status date .* earnings calendar lane is quarantined/);
  });

  test('quarantines non-boolean eval earnings symbols without failing posture', () => {
    const report = validateEvalLivePosture(validEvalLiveEnv({
      TTP_EARNINGS_STATUS_JSON: earningsStatusJson(currentNewYorkDate(), { NVDA: 'false' }),
    }));

    expect(report.status).toBe('PASS');
    expect(report.errors).toEqual([]);
    expect(report.warnings.join('\n')).toMatch(/symbols\.NVDA must be boolean/);
  });

  test('quarantines missing earnings status for configured Alpaca symbols without failing posture', () => {
    const symbols = {
      TSLA: false,
      NVDA: false,
      SPY: false,
      QQQ: false,
      COIN: false,
    };
    const report = validateEvalLivePosture(validEvalLiveEnv({
      TTP_EARNINGS_STATUS_JSON: JSON.stringify({ date: currentNewYorkDate(), symbols }),
    }));

    expect(report.status).toBe('PASS');
    expect(report.errors).toEqual([]);
    expect(report.warnings.join('\n')).toMatch(/symbols\.MARA must be boolean/);
  });

  test('assert helper throws with a useful gate error', () => {
    expect(() => assertEvalLivePosture(validEvalLiveEnv({
      RISK_MANAGER_BYPASS: 'true',
    }))).toThrow(/eval-live posture gate failed: .*RISK_MANAGER_BYPASS=true/);
  });

  test('readiness assert helper throws with broker and state errors', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-eval-assert-'));
    const stateFile = writeStateFile(path.join(tempDir, 'state.json'), {
      activeTrades: [['ORDER_1', { orderId: 'ORDER_1', symbol: 'TSLA', brokerId: 'alpaca', side: 'long' }]],
    });

    try {
      await expect(assertEvalLiveReadiness(validEvalLiveEnv({
        STATE_FILE: stateFile,
      }), {
        allowInjectedBrokerPositions: true,
        readBrokerPositions: async () => [{ symbol: 'TSLA', qty: '1', side: 'long' }],
      })).rejects.toThrow(/eval-live readiness gate failed: .*Persisted StateManager activeTrades.*Alpaca broker positions/s);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('readiness rejects injected broker readers unless the test option explicitly allows them', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-eval-injected-reader-'));
    const stateFile = writeStateFile(path.join(tempDir, 'state.json'));

    try {
      const report = await validateEvalLiveReadiness(validEvalLiveEnv({
        STATE_FILE: stateFile,
      }), {
        readBrokerPositions: async () => [],
      });

      expect(report.status).toBe('FAIL');
      expect(report.errors.join('\n')).toMatch(/injected broker position readers are only allowed/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
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

  test('PM2 env extraction prefers actual process env over stale PM2 metadata when pid is available', () => {
    const actualEnv = extractPm2RuntimeEnv({
      name: 'ogz-prime-v2',
      pm_id: 4,
      pid: 12345,
      pm2_env: {
        pm_exec_path: '/opt/ogzprime/OGZPMLV2/run-empire-v2.js',
        env: {
          EXECUTION_MODE: 'metadata-value',
          WEBHOOK_DRY_RUN: 'true',
        },
      },
    }, {
      fs: {
        readFileSync: (filePath, encoding) => {
          expect(encoding).toBe('utf8');
          if (filePath === '/proc/12345/environ') {
            return 'pm_id=4\0name=ogz-prime-v2\0pm_exec_path=/opt/ogzprime/OGZPMLV2/run-empire-v2.js\0EXECUTION_MODE=live\0WEBHOOK_DRY_RUN=false\0SIGNALSTACK_WEBHOOK_URL=https://signalstack.example/webhook\0';
          }
          if (filePath === '/proc/12345/cmdline') {
            return 'node /opt/ogzprime/OGZPMLV2/run-empire-v2.js\0';
          }
          throw new Error(`unexpected path ${filePath}`);
        },
      },
    });

    expect(actualEnv).toEqual(expect.objectContaining({
      pm_id: '4',
      name: 'ogz-prime-v2',
      pm_exec_path: '/opt/ogzprime/OGZPMLV2/run-empire-v2.js',
      EXECUTION_MODE: 'live',
      WEBHOOK_DRY_RUN: 'false',
      SIGNALSTACK_WEBHOOK_URL: 'https://signalstack.example/webhook',
    }));
  });

  test('PM2 env extraction rejects actual process env when pid belongs to a different process', () => {
    expect(() => extractPm2RuntimeEnv({
      name: 'ogz-prime-v2',
      pm_id: 4,
      pid: 12345,
      pm2_env: {
        pm_exec_path: '/opt/ogzprime/OGZPMLV2/run-empire-v2.js',
        env: { EXECUTION_MODE: 'metadata-value' },
      },
    }, {
      fs: {
        readFileSync: (filePath) => {
          if (filePath === '/proc/12345/environ') {
            return 'pm_id=7\0name=wrong-process\0pm_exec_path=/tmp/not-ogz.js\0EXECUTION_MODE=live\0';
          }
          if (filePath === '/proc/12345/cmdline') {
            return 'node /tmp/not-ogz.js\0';
          }
          throw new Error(`unexpected path ${filePath}`);
        },
      },
    })).toThrow(/pm_id mismatch/);
  });

  test('PM2 runtime-source report does not leak unrelated proc env secrets and still fails missing webhook URL', () => {
    const runtimeEnv = validEvalLiveEnv({
      WEBSOCKET_AUTH_TOKEN: 'secret-runtime-token',
      OLLAMA_API_KEY: 'secret-ollama-key',
    });
    delete runtimeEnv.SIGNALSTACK_WEBHOOK_URL;

    const report = validateEvalLivePosture(runtimeEnv, { loadDotenv: false });

    expect(report.status).toBe('FAIL');
    expect(report.errors.join('\n')).toMatch(/missing SIGNALSTACK_WEBHOOK_URL/);
    expect(JSON.stringify(report)).not.toContain('secret-runtime-token');
    expect(JSON.stringify(report)).not.toContain('secret-ollama-key');
  });

  test('PM2 env extraction fails loud when actual process env is unavailable', () => {
    expect(() => extractPm2RuntimeEnv({
      name: 'ogz-prime-v2',
      pid: 12345,
      pm2_env: { env: { EXECUTION_MODE: 'metadata-value' } },
    }, {
      fs: {
        readFileSync: () => {
          const error = new Error('permission denied');
          error.code = 'EACCES';
          throw error;
        },
      },
    })).toThrow(/actual runtime env unavailable.*permission denied/);
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

  test('state exposure reader normalizes StateManager serialized map entries', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-eval-reader-'));
    const stateFile = writeStateFile(path.join(tempDir, 'state.json'), {
      activeTrades: [['ORDER_2', { orderId: 'ORDER_2', symbol: 'TSLA', brokerId: 'alpaca', side: 'short' }]],
    });

    try {
      expect(readPersistedStateExposure(stateFile)).toEqual(expect.objectContaining({
        exists: true,
        activeTrades: ['ORDER_2:TSLA:alpaca:short'],
        sourceLessExposure: false,
      }));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
