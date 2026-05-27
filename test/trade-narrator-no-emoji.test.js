'use strict';

const { TradeNarrator } = require('../core/TradeNarrator');

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe('TradeNarrator dashboard prose', () => {
  let originalEnv;
  let logSpy;

  beforeEach(() => {
    originalEnv = {
      USER_NARRATOR: process.env.USER_NARRATOR,
      ARCHITECT_NARRATOR: process.env.ARCHITECT_NARRATOR,
      NARRATOR_LABEL_SEED: process.env.NARRATOR_LABEL_SEED,
    };
    process.env.USER_NARRATOR = 'true';
    process.env.ARCHITECT_NARRATOR = 'true';
    process.env.NARRATOR_LABEL_SEED = 'test-seed';
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalEnv.USER_NARRATOR === undefined) delete process.env.USER_NARRATOR;
    else process.env.USER_NARRATOR = originalEnv.USER_NARRATOR;

    if (originalEnv.ARCHITECT_NARRATOR === undefined) delete process.env.ARCHITECT_NARRATOR;
    else process.env.ARCHITECT_NARRATOR = originalEnv.ARCHITECT_NARRATOR;

    if (originalEnv.NARRATOR_LABEL_SEED === undefined) delete process.env.NARRATOR_LABEL_SEED;
    else process.env.NARRATOR_LABEL_SEED = originalEnv.NARRATOR_LABEL_SEED;

    logSpy.mockRestore();
  });

  test('does not emit emojis in user or architect narrator output', () => {
    const sends = [];
    const ws = {
      readyState: 1,
      bufferedAmount: 0,
      send: jest.fn((raw) => sends.push(JSON.parse(raw))),
    };
    const narrator = new TradeNarrator();
    narrator.setWebSocketClient(ws);

    narrator.patternSpotted([{ name: 'Wedge', confidence: 0.81, samples: 1 }]);
    narrator.strategyEval(
      [
        { strategyName: 'MADynamicSR', direction: 'buy', confidence: 1, reason: 'test reason' },
        { strategyName: 'RSI', direction: 'hold', confidence: 0.4, reason: 'test reason' },
      ],
      { strategyName: 'MADynamicSR', direction: 'buy', confidence: 1 }
    );
    narrator.sizing({
      sizeUSD: 10,
      sizePercent: 0.001,
      multipliers: { confidence: 1, volatility: 1, pattern: 1, confluence: 1, combined: 1 },
      patternStatus: 'Learning',
      patternWinRate: null,
      capped: true,
      reason: 'test',
    });
    narrator.entered({
      tradeId: 'trade-1',
      strategy: 'MADynamicSR',
      direction: 'long',
      price: 100,
      sizeUsd: 10,
      confidence: 1,
      exitContract: { stopLossPercent: 0.5, takeProfitPercent: 1 },
      timestamp: Date.now(),
    });
    narrator.tierExit({
      tradeId: 'trade-1',
      tier: 1,
      exitPrice: 101,
      exitSize: 5,
      remainingSize: 5,
      profitPercent: 0.01,
      partialPnl: 1,
    });
    narrator.closed({
      tradeId: 'trade-1',
      strategy: 'MADynamicSR',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 102,
      pnl: 2,
      pnlPercent: 2,
      reason: 'take_profit',
      holdMs: 1000,
    });

    const userTexts = sends
      .filter((payload) => payload.type === 'narrator_event')
      .map((payload) => payload.text)
      .filter(Boolean);
    const consoleLines = logSpy.mock.calls.map((call) => call.join(' '));

    for (const text of [...userTexts, ...consoleLines]) {
      expect(text).not.toMatch(EMOJI_RE);
    }
  });

  test('labels break-even closes as break-even instead of wins or losses', () => {
    const sends = [];
    const ws = {
      readyState: 1,
      bufferedAmount: 0,
      send: jest.fn((raw) => sends.push(JSON.parse(raw))),
    };
    const narrator = new TradeNarrator();
    narrator.setWebSocketClient(ws);

    narrator.closed({
      tradeId: 'flat-trade',
      strategy: 'MADynamicSR',
      direction: 'short',
      entryPrice: 100,
      exitPrice: 100,
      pnl: 0,
      pnlPercent: 0,
      reason: 'manual',
      holdMs: 1000,
    });

    const userClose = sends.find((payload) => payload.type === 'narrator_event' && payload.event === 'closed');
    const consoleLines = logSpy.mock.calls.map((call) => call.join(' '));

    expect(userClose).toBeTruthy();
    expect(userClose.result).toBe('flat');
    expect(userClose.text).toContain('BREAK-EVEN 0.00%');
    expect(userClose.text).not.toContain('WIN 0.00%');
    expect(userClose.text).not.toContain('LOSS 0.00%');
    expect(consoleLines.some((line) => line.includes('TRADE CLOSED (BREAK-EVEN)'))).toBe(true);
    expect(consoleLines.some((line) => line.includes('TRADE CLOSED (WIN)'))).toBe(false);
    expect(consoleLines.some((line) => line.includes('TRADE CLOSED (LOSS)'))).toBe(false);
  });

  test('does not label rounded-zero or malformed PnL as a visible win', () => {
    const sends = [];
    const ws = {
      readyState: 1,
      bufferedAmount: 0,
      send: jest.fn((raw) => sends.push(JSON.parse(raw))),
    };
    const narrator = new TradeNarrator();
    narrator.setWebSocketClient(ws);

    narrator.closed({
      tradeId: 'sub-cent-trade',
      strategy: 'MADynamicSR',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 100,
      pnl: 0.004,
      pnlPercent: 0.004,
      reason: 'manual',
      holdMs: 1000,
    });

    narrator.closed({
      tradeId: 'malformed-trade',
      strategy: 'MADynamicSR',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 100,
      pnl: 'not-a-number',
      pnlPercent: null,
      reason: 'manual',
      holdMs: 1000,
    });

    narrator.closed({
      tradeId: 'conflicting-trade',
      strategy: 'MADynamicSR',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 100,
      pnl: 0,
      pnlPercent: 0.01,
      reason: 'manual',
      holdMs: 1000,
    });

    const closes = sends.filter((payload) => payload.type === 'narrator_event' && payload.event === 'closed');
    expect(closes).toHaveLength(3);
    expect(closes[0].result).toBe('flat');
    expect(closes[0].text).toContain('BREAK-EVEN 0.00%');
    expect(closes[1].result).toBeNull();
    expect(closes[1].text).toContain('UNVERIFIED');
    expect(closes[2].result).toBeNull();
    expect(closes[2].text).toContain('UNVERIFIED 0.01%');
    for (const close of closes) {
      expect(close.text).not.toContain('WIN 0.00%');
      expect(close.text).not.toContain('LOSS 0.00%');
    }
  });
});
