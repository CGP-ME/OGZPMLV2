'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('TradeReplayCapture truth contract', () => {
  let tempDir;
  let consoleSpies;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers().setSystemTime(new Date('2026-05-29T12:00:00.000Z'));
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-trade-replay-'));
    consoleSpies = [
      jest.spyOn(console, 'log').mockImplementation(() => {}),
      jest.spyOn(console, 'warn').mockImplementation(() => {}),
    ];
  });

  afterEach(() => {
    jest.useRealTimers();
    for (const spy of consoleSpies) spy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function candles() {
    return [
      { open: 99, high: 101, low: 98, close: 100, volume: 10, timestamp: Date.parse('2026-05-29T11:58:00.000Z') },
      { open: 100, high: 102, low: 99, close: 101, volume: 12, timestamp: Date.parse('2026-05-29T11:59:00.000Z') },
    ];
  }

  function makeCapture() {
    const TradeReplayCapture = require('../core/TradeReplayCapture');
    return new TradeReplayCapture({ replayDir: tempDir });
  }

  test('requires explicit replayDir instead of defaulting to unscoped journal storage', () => {
    const TradeReplayCapture = require('../core/TradeReplayCapture');

    expect(() => new TradeReplayCapture())
      .toThrow(/replayDir is required/);
  });

  test('refuses incomplete entry captures instead of defaulting direction or price', () => {
    const capture = makeCapture();

    expect(capture.captureEntry('ORDER-1', { price: 100 }, candles())).toBeNull();
    expect(capture.captureEntry('ORDER-2', { direction: 'BUY' }, candles())).toBeNull();
    expect(capture.pendingEntries.size).toBe(0);
  });

  test('refuses exit replay without a pending entry capture', () => {
    const capture = makeCapture();

    const result = capture.captureExit('ORDER-1', {
      price: 100,
      reason: 'manual',
      pnl: 0,
      holdTime: 0,
    }, candles());

    expect(result).toBeNull();
    expect(consoleSpies[1]).toHaveBeenCalledWith(expect.stringContaining('missing entry capture'));
  });

  test('writes and lists a complete flat replay without fabricating values', () => {
    const capture = makeCapture();
    const entry = capture.captureEntry('ORDER-1', {
      direction: 'BUY',
      price: 100,
      confidence: 0,
      regime: '',
      patterns: [{ type: 'pattern-a', confidence: 0 }],
      indicators: { rsi: 0, macd: 0, trend: '', volatility: 0 },
    }, candles());

    const filepath = capture.captureExit('ORDER-1', {
      price: 100,
      reason: 'manual',
      pnl: 0,
      pnlPercent: 0,
      holdTime: 0,
    }, candles());

    const list = capture.listReplays();

    expect(entry).toEqual(expect.objectContaining({
      orderId: 'ORDER-1',
      direction: 'BUY',
    }));
    expect(filepath).toBe(path.join(tempDir, 'ORDER-1.json'));
    expect(list).toEqual([{
      orderId: 'ORDER-1',
      direction: 'BUY',
      pnl: 0,
      entryPrice: 100,
      exitPrice: 100,
      reason: 'manual',
      savedAt: Date.parse('2026-05-29T12:00:00.000Z'),
    }]);
  });

  test('listReplays exposes missing replay fields as null instead of zero or empty string', () => {
    const capture = makeCapture();
    fs.writeFileSync(
      path.join(tempDir, 'partial.json'),
      JSON.stringify({
        orderId: 'PARTIAL-1',
        direction: '',
        entry: {},
        exit: {},
      }),
      'utf8'
    );

    expect(capture.listReplays()).toEqual([{
      orderId: 'PARTIAL-1',
      direction: null,
      pnl: null,
      entryPrice: null,
      exitPrice: null,
      reason: null,
      savedAt: null,
    }]);
  });
});
