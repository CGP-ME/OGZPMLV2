'use strict';

jest.mock('../core/AtomicWrite', () => ({
  writeJsonAtomic: jest.fn(),
}));

const { writeJsonAtomic } = require('../core/AtomicWrite');
const { TradingProofLogger } = require('../ogz-meta/claudito-logger');

const ORIGINAL_ENV = process.env;

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
    OGZ_MIN_DAYS_REQUIRED: '5',
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
      min_days_required: 5,
    }));
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
