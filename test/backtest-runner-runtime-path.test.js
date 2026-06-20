'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('BacktestRunner runtime path parity', () => {
  let tempDir;
  let dataFile;
  let originalOutputDir;
  let exitSpy;
  let logSpy;
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    jest.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-backtest-runtime-path-'));
    dataFile = path.join(tempDir, 'tsla-15m-test.json');
    originalOutputDir = process.env.BACKTEST_OUTPUT_DIR;
    process.env.BACKTEST_OUTPUT_DIR = path.join(tempDir, 'out');

    const start = Date.parse('2026-06-15T13:30:00.000Z');
    const candles = Array.from({ length: 16 }, (_, index) => ({
      timestamp: start + index * 15 * 60 * 1000,
      open: 400 + index,
      high: 401 + index,
      low: 399 + index,
      close: 400.5 + index,
      volume: 1000 + index,
    }));
    fs.writeFileSync(dataFile, JSON.stringify(candles));

    jest.doMock('../foundation/ConfigLoader', () => ({
      get: jest.fn((key) => {
        if (key === 'backtest.candleDataFile') return dataFile;
        if (key === 'backtest.candleFile') return '';
        if (key === 'backtest.fastBacktest') return false;
        if (key === 'misc.subscriptionTier') return 'ML';
        return undefined;
      }),
    }));

    jest.doMock('../core/StateManager', () => ({
      getInstance: jest.fn(() => ({
        getAllTrades: jest.fn(() => []),
      })),
    }));

    jest.doMock('../core/DecisionLedgerLogger', () => ({
      flush: jest.fn(),
    }));

    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`PROCESS_EXIT_${code}`);
    });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalOutputDir === undefined) {
      delete process.env.BACKTEST_OUTPUT_DIR;
    } else {
      process.env.BACKTEST_OUTPUT_DIR = originalOutputDir;
    }
    exitSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    jest.resetModules();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('feeds scoped runtime-shaped candles and triggers the runtime trading cycle', async () => {
    const BacktestRunner = require('../core/BacktestRunner');
    const ctx = {
      __dirname: path.resolve(__dirname, '..'),
      symbol: 'TSLA',
      timeframe: '15m',
      priceHistory: [],
      candleAggregator: {
        getIntervalMs: jest.fn(() => 15 * 60 * 1000),
      },
      storeTimeframeCandle: jest.fn(() => ({
        isNewCandle: true,
        candle: {},
      })),
      handleMarketData: jest.fn((payload) => {
        ctx.priceHistory.push(payload);
        return { acceptedAsNew: true };
      }),
      runTradingCycle: jest.fn(),
      backtestRecorder: {
        startingBalance: 10000,
        trades: [],
        getSummary: jest.fn(() => ({})),
        printSummary: jest.fn(),
        exportCSV: jest.fn(),
      },
    };

    const runner = new BacktestRunner(ctx);

    await expect(runner.loadHistoricalDataAndBacktest()).rejects.toThrow('PROCESS_EXIT_1');
    expect(exitSpy).toHaveBeenCalledWith(0);

    expect(ctx.handleMarketData).toHaveBeenCalledTimes(16);
    const firstRuntimeOhlc = [
      Date.parse('2026-06-15T13:30:00.000Z') / 1000,
      Date.parse('2026-06-15T13:45:00.000Z') / 1000,
      400,
      401,
      399,
      400.5,
      null,
      1000,
      null,
    ];
    expect(ctx.storeTimeframeCandle).toHaveBeenCalledTimes(16);
    expect(ctx.storeTimeframeCandle).toHaveBeenNthCalledWith(1, '15m', firstRuntimeOhlc, 'TSLA');
    expect(ctx.handleMarketData).toHaveBeenNthCalledWith(1, expect.objectContaining({
      symbol: 'TSLA',
      timeframe: '15m',
      data: firstRuntimeOhlc,
    }), expect.objectContaining({
      source: 'backtest_file',
      candleIndex: 1,
    }));
    expect(ctx.runTradingCycle).toHaveBeenCalledTimes(16);
    expect(ctx.runTradingCycle).toHaveBeenNthCalledWith(1, 'TSLA', expect.any(String));
    expect(ctx.runTradingCycle).toHaveBeenNthCalledWith(16, 'TSLA', expect.any(String));
  });

  test('refuses to run when candle file identity and runtime scope disagree', () => {
    const BacktestRunner = require('../core/BacktestRunner');
    const runner = new BacktestRunner({});
    const nvdaFile = path.join(tempDir, 'nvda-15m-test.json');

    expect(() => runner._assertDataFileMatchesRuntimeScope(nvdaFile, 'TSLA', '15m'))
      .toThrow(/resolves to NVDA, but runtime symbol is TSLA/);
    expect(() => runner._assertDataFileMatchesRuntimeScope(dataFile, 'TSLA', '1m'))
      .toThrow(/resolves to timeframe 15m, but runtime timeframe is 1m/);
  });

  test('does not reintroduce a backtest-local strategy trigger', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'core', 'BacktestRunner.js'), 'utf8');

    expect(source).not.toContain('analyzeAndTrade(');
    expect(source).not.toContain('priceHistory.length >= 15');
    expect(source).toContain('runTradingCycle(symbol, traceId)');
  });
});
