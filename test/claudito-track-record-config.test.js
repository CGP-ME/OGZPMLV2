'use strict';

jest.mock('../core/AtomicWrite', () => ({
  writeJsonAtomic: jest.fn(),
}));

const fs = require('fs');
const { writeJsonAtomic } = require('../core/AtomicWrite');
const { TradingProofLogger } = require('../ogz-meta/claudito-logger');

const ORIGINAL_ENV = process.env;
const ORIGINAL_EXISTS_SYNC = fs.existsSync;
const ORIGINAL_READ_FILE_SYNC = fs.readFileSync;
const TRADING_PROOF_LOG_SUFFIX = 'ogz-meta/logs/trading-proof.jsonl';
const TRACK_RECORD_INDEX_SUFFIX = 'public/proof/track-record/data/index.json';
let proofLogRaw = null;
let existingIndexRaw = null;

function validEnv(overrides = {}) {
  return {
    OGZ_ACCOUNT_ID: 'MAX58356',
    OGZ_ACCOUNT_LABEL: 'Trade The Pool MAX5',
    OGZ_ACCOUNT_STAGE: 'EVAL',
    OGZ_ACCOUNT_STATUS: 'active',
    BROKER: 'alpaca',
    STARTING_BALANCE: '5000',
    TTP_PROFIT_TARGET_DOLLARS: '300',
    TTP_MAX_LOSS_THRESHOLD_EQUITY: '4850',
    OGZ_MIN_TRADES_REQUIRED: '20',
    OGZ_TRACK_RECORD_START_AT: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

function writeTrackRecordWithEnv(env) {
  process.env = { ...ORIGINAL_ENV, ...env };
  TradingProofLogger.publishTrackRecord();
  jest.runOnlyPendingTimers();
}

describe('Claudito track record proof config', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    proofLogRaw = null;
    existingIndexRaw = null;
    jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
      if (String(filePath).endsWith(TRADING_PROOF_LOG_SUFFIX)) {
        return proofLogRaw !== null;
      }
      if (String(filePath).endsWith(TRACK_RECORD_INDEX_SUFFIX)) {
        return existingIndexRaw !== null;
      }
      return ORIGINAL_EXISTS_SYNC.call(fs, filePath);
    });
    jest.spyOn(fs, 'readFileSync').mockImplementation((filePath, ...args) => {
      if (String(filePath).endsWith(TRADING_PROOF_LOG_SUFFIX)) {
        return proofLogRaw;
      }
      if (String(filePath).endsWith(TRACK_RECORD_INDEX_SUFFIX)) {
        return existingIndexRaw;
      }
      return ORIGINAL_READ_FILE_SYNC.call(fs, filePath, ...args);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('writes TTP eval target and max drawdown without zero fallbacks', () => {
    writeTrackRecordWithEnv(validEnv());

    expect(writeJsonAtomic).toHaveBeenCalledTimes(2);
    const accountJson = writeJsonAtomic.mock.calls[0][1];
    expect(accountJson).toEqual(expect.objectContaining({
      id: 'MAX58356',
      label: 'Trade The Pool MAX5',
      stage: 'EVAL',
      status: 'active',
      broker: 'alpaca',
      starting_balance: 5000,
      current_balance: 5000,
      profit_target: 300,
      max_drawdown: 150,
      days_traded: 0,
      trades_recorded: 0,
      min_trades_required: 20,
      proof_summary: expect.objectContaining({
        trades_recorded: 0,
        min_trades_required: 20,
        symbols_traded: [],
        exit_reasons: {},
      }),
    }));
    expect(writeJsonAtomic.mock.calls[0][2]).toEqual({ mode: 0o644 });
    expect(writeJsonAtomic.mock.calls[1][2]).toEqual({ mode: 0o644 });
  });

  test('uses explicit OGZ proof values when provided', () => {
    writeTrackRecordWithEnv(validEnv({
      OGZ_PROFIT_TARGET: '325',
      OGZ_MAX_DRAWDOWN: '175',
    }));

    const accountJson = writeJsonAtomic.mock.calls[0][1];
    expect(accountJson.profit_target).toBe(325);
    expect(accountJson.max_drawdown).toBe(175);
  });

  test('rebuilds track record from the durable proof log after process memory is empty', () => {
    proofLogRaw = [
      JSON.stringify({
        type: 'TRADE',
        timestamp: '2026-06-21T17:45:00.000Z',
        action: 'BUY',
        symbol: 'BTC-USD',
        price: 100000,
        size: 1,
        value_usd: 100000,
        confidence: 50,
        tradeId: 'old-trade',
        orderId: 'old-entry',
      }),
      JSON.stringify({
        type: 'TRADE',
        timestamp: '2026-06-21T18:00:00.000Z',
        action: 'SELL',
        symbol: 'BTC-USD',
        price: 100100,
        size: 1,
        value_usd: 100100,
        confidence: 50,
        tradeId: 'old-trade',
        orderId: 'old-exit',
        entryPrice: 100000,
        pnl: 100,
        pnlPercent: 0.1,
        exitReason: 'take_profit',
      }),
      JSON.stringify({
        type: 'TRADE',
        timestamp: '2026-06-22T17:45:00.000Z',
        action: 'BUY',
        symbol: 'MARA',
        price: 14.9,
        size: 44,
        value_usd: 655.6,
        confidence: 87,
        tradeId: 'trade-1',
        orderId: 'entry-1',
      }),
      JSON.stringify({
        type: 'TRADE',
        timestamp: '2026-06-22T18:00:00.000Z',
        action: 'SELL',
        symbol: 'MARA',
        price: 15.03,
        size: 22,
        value_usd: 330.66,
        confidence: 100,
        tradeId: 'trade-1',
        orderId: 'exit-1',
        entryPrice: 14.9,
        pnl: 3.69,
        pnlPercent: 0.56,
        exitReason: 'take_profit',
      }),
    ].join('\n');

    writeTrackRecordWithEnv(validEnv());

    const accountJson = writeJsonAtomic.mock.calls[0][1];
    expect(accountJson.current_balance).toBeCloseTo(5003.69);
    expect(accountJson.days_traded).toBe(1);
    expect(accountJson.trades_recorded).toBe(1);
    expect(accountJson.proof_summary).toEqual(expect.objectContaining({
      trades_recorded: 1,
      min_trades_required: 20,
      winning_trades: 1,
      losing_trades: 0,
      symbols_traded: ['MARA'],
      exit_reasons: { take_profit: 1 },
    }));
    expect(accountJson._meta.track_record_start_at).toBe('2026-06-22T00:00:00.000Z');
    expect(accountJson.daily_pnl).toEqual([
      { date: '2026-06-22', pnl: 3.69, trades: 1 },
    ]);
    expect(accountJson.recent_trades).toEqual([
      expect.objectContaining({
        symbol: 'MARA',
        side: 'SELL_TAKE_PROFIT',
        entry: 14.9,
        exit: 15.03,
        pnl: 3.69,
        trade_id: 'trade-1',
      }),
    ]);
  });

  test('fails loud when track record start boundary is missing', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    writeTrackRecordWithEnv(validEnv({
      OGZ_TRACK_RECORD_START_AT: '',
    }));

    expect(writeJsonAtomic).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/requires OGZ_TRACK_RECORD_START_AT/));
  });

  test('never preserves stale account cards in the public index', () => {
    existingIndexRaw = JSON.stringify({
      updated: '2026-06-01T00:00:00.000Z',
      mode: 'live',
      accounts: [
        { id: 'preview-001', label: 'Preview', stage: 'EVAL', status: 'preview' },
        { id: 'default', label: 'Default Account', stage: 'EVAL', status: 'active' },
      ],
    });

    writeTrackRecordWithEnv(validEnv({
      OGZ_TRACK_RECORD_PRESERVE_EXISTING_ACCOUNTS: 'true',
    }));

    const indexJson = writeJsonAtomic.mock.calls[1][1];
    expect(indexJson.accounts).toEqual([
      {
        id: 'MAX58356',
        label: 'Trade The Pool MAX5',
        stage: 'EVAL',
        status: 'active',
      },
    ]);
  });

  test('fails loud instead of publishing fake zero target or drawdown', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    writeTrackRecordWithEnv(validEnv({
      OGZ_PROFIT_TARGET: '',
      TTP_PROFIT_TARGET_DOLLARS: '',
    }));
    expect(writeJsonAtomic).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/requires one of OGZ_PROFIT_TARGET, TTP_PROFIT_TARGET_DOLLARS/));

    writeTrackRecordWithEnv(validEnv({
      TTP_MAX_LOSS_THRESHOLD_EQUITY: '',
    }));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/requires OGZ_MAX_DRAWDOWN, TTP_MAX_LOSS_DOLLARS, or TTP_MAX_LOSS_THRESHOLD_EQUITY/));
  });

  test('rejects invalid account identity and non-positive numeric values', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    writeTrackRecordWithEnv(validEnv({
      OGZ_ACCOUNT_ID: '',
    }));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/requires OGZ_ACCOUNT_ID/));

    writeTrackRecordWithEnv(validEnv({
      STARTING_BALANCE: '0',
    }));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/requires positive numeric STARTING_BALANCE/));

    writeTrackRecordWithEnv(validEnv({
      TTP_MAX_LOSS_THRESHOLD_EQUITY: '5000',
    }));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/cannot derive positive max drawdown/));
    expect(writeJsonAtomic).not.toHaveBeenCalled();
  });
});
