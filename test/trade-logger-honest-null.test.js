'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { TradeLogger } = require('../core/tradeLogger');

describe('TradeLogger honest missing-data handling', () => {
  let tmpDir;
  let originalBacktestMode;
  let originalProfile;
  let logSpy;
  let errorSpy;
  let warnSpy;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-logger-honest-null-'));
    originalBacktestMode = process.env.BACKTEST_MODE;
    originalProfile = process.env.PROFILE;
    delete process.env.BACKTEST_MODE;
    process.env.PROFILE = 'paper';
    require('../foundation/ConfigLoader')._resetForTest();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalBacktestMode === undefined) {
      delete process.env.BACKTEST_MODE;
    } else {
      process.env.BACKTEST_MODE = originalBacktestMode;
    }
    if (originalProfile === undefined) {
      delete process.env.PROFILE;
    } else {
      process.env.PROFILE = originalProfile;
    }
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('preserves missing audit fields as null instead of fabricating zeros or labels', () => {
    const logger = new TradeLogger();
    logger.logDir = tmpDir;

    expect(logger.logTrade({
      type: 'SELL',
      entryPrice: 100,
      exitPrice: 101,
      currentPrice: 101,
      size: 25,
      pnl: 0,
      pnlPercent: 0,
      fees: 0,
      entryTime: '2026-06-13T10:00:00.000Z',
      exitTime: '2026-06-13T10:15:00.000Z',
      holdTime: 900000,
      balanceBefore: 5000,
      balanceAfter: 5000,
      rsi: null,
      macd: null,
      macdSignal: null,
      trend: null,
      volatility: null,
      exitReason: 'signal',
      entryReason: null,
      confidence: 0,
    })).toBe(true);

    const files = fs.readdirSync(tmpDir).filter(file => file.startsWith('trades_'));
    expect(files).toHaveLength(1);
    const [trade] = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf8'));

    expect(trade.pnl).toBe(0);
    expect(trade.pnlPercent).toBe(0);
    expect(trade.fees).toBe(0);
    expect(trade.netPnl).toBe(0);
    expect(trade.indicators.rsi).toBeNull();
    expect(trade.indicators.macd).toBeNull();
    expect(trade.indicators.macdSignal).toBeNull();
    expect(trade.analysis.trend).toBeNull();
    expect(trade.analysis.volatility).toBeNull();
    expect(trade.analysis.confidence).toBe(0);
    expect(trade.entrySignal.primaryReason).toBeNull();
    expect(trade.exitSignal.exitReason).toBe('signal');
    expect(trade.exitSignal.exitType).toBeNull();
  });

  test('skips disk writes from ConfigLoader backtest profile without BACKTEST_MODE env', () => {
    process.env.PROFILE = 'backtest-all';
    delete process.env.BACKTEST_MODE;
    require('../foundation/ConfigLoader')._resetForTest();

    const logger = new TradeLogger();
    logger.logDir = tmpDir;

    expect(logger.logTrade({
      type: 'SELL',
      entryPrice: 100,
      exitPrice: 101,
      currentPrice: 101,
      size: 1,
      pnl: 1,
      pnlPercent: 1,
      fees: 0,
      entryTime: '2026-06-13T10:00:00.000Z',
      exitTime: '2026-06-13T10:15:00.000Z',
    })).toBe(true);
    expect(fs.readdirSync(tmpDir).filter(file => file.startsWith('trades_'))).toHaveLength(0);
  });

  test('does not average missing report fields as zero', () => {
    const logger = new TradeLogger();
    logger.logDir = tmpDir;

    expect(logger.logTrade({
      type: 'SELL',
      entryPrice: 100,
      exitPrice: 101,
      currentPrice: 101,
      size: 25,
      pnl: 5,
      pnlPercent: 5,
      fees: 0,
      entryTime: '2026-06-13T10:00:00.000Z',
      exitTime: '2026-06-13T10:15:00.000Z',
      holdTime: null,
      balanceBefore: 5000,
      balanceAfter: 5005,
      rsi: null,
      trend: null,
      volatility: null,
      exitReason: null,
      confidence: null,
    })).toBe(true);

    const stats = logger.getTodayStats();

    expect(stats.avgHoldTime).toBeNull();
    expect(stats.avgHoldTimeFormatted).toBeNull();
    expect(stats.shortestTrade).toBeNull();
    expect(stats.longestTrade).toBeNull();
    expect(stats.avgRSI).toBeNull();
    expect(stats.avgConfidence).toBeNull();
    expect(stats.avgVolatility).toBeNull();
    expect(stats.avgRiskPercent).toBeNull();
    expect(stats.avgRewardRisk).toBeNull();
    expect(stats.maxDrawdown).toBeNull();
    expect(stats.trendBreakdown).toEqual({ missing: 1 });
    expect(stats.exitReasonBreakdown).toEqual({ missing: 1 });
  });

  test('preserves missing trade type as null', () => {
    const logger = new TradeLogger();
    logger.logDir = tmpDir;

    expect(logger.logTrade({
      entryPrice: 100,
      exitPrice: 101,
      currentPrice: 101,
      size: 25,
      pnl: 1,
      pnlPercent: 1,
      fees: 0,
      entryTime: '2026-06-13T10:00:00.000Z',
      exitTime: '2026-06-13T10:15:00.000Z',
      holdTime: 900000,
      balanceBefore: 5000,
      balanceAfter: 5001,
    })).toBe(true);

    const files = fs.readdirSync(tmpDir).filter(file => file.startsWith('trades_'));
    const [trade] = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf8'));

    expect(trade.type).toBeNull();
  });
});
