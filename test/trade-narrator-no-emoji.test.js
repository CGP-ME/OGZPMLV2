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
});
