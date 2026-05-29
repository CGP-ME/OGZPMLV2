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

  test('does not claim pattern maturity without sample evidence', () => {
    const sends = [];
    const ws = {
      readyState: 1,
      bufferedAmount: 0,
      send: jest.fn((raw) => sends.push(JSON.parse(raw))),
    };
    const narrator = new TradeNarrator();
    narrator.setWebSocketClient(ws);

    narrator.patternSpotted([{ name: 'Learning Pattern', confidence: 0.81 }]);

    const patternEvent = sends.find((payload) => payload.type === 'narrator_event' && payload.event === 'pattern_spotted');
    expect(patternEvent).toBeTruthy();
    expect(patternEvent.maturity).toBeUndefined();
    expect(patternEvent.sampleCount).toBeUndefined();
    expect(patternEvent.text).toBe('Spotted Learning Pattern - conviction Peak.');
  });

  test('uses observed sample evidence for pattern maturity narration', () => {
    const sends = [];
    const ws = {
      readyState: 1,
      bufferedAmount: 0,
      send: jest.fn((raw) => sends.push(JSON.parse(raw))),
    };
    const narrator = new TradeNarrator();
    narrator.setWebSocketClient(ws);

    narrator.patternSpotted([{ name: 'Learning Pattern', confidence: 0.81, samples: 3, lastSeen: Date.now() }]);

    const patternEvent = sends.find((payload) => payload.type === 'narrator_event' && payload.event === 'pattern_spotted');
    expect(patternEvent).toBeTruthy();
    expect(patternEvent.maturity).toBe('Forming');
    expect(patternEvent.sampleCount).toBe(3);
    expect(patternEvent.text).toBe('Spotted Learning Pattern - conviction Peak, maturity Forming.');
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

  test('narrates gate and broker frames through the existing narrator_event contract', () => {
    const sends = [];
    const ws = {
      readyState: 1,
      bufferedAmount: 0,
      send: jest.fn((raw) => sends.push(JSON.parse(raw))),
    };
    const narrator = new TradeNarrator();
    narrator.setWebSocketClient(ws);

    narrator.gateDecision({
      type: 'gate_event',
      kind: 'risk_block',
      symbol: 'BTC-USD',
      strategy: 'MADynamicSR',
      passed: false,
      traceId: 'trace-1',
      timestamp: 1000,
    });
    narrator.brokerResult({
      type: 'broker_ack',
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      action: 'BUY',
      orderId: 'order-1',
      ok: true,
      timestamp: 1001,
    });

    const gate = sends.find((payload) => payload.type === 'narrator_event' && payload.event === 'risk_block');
    const broker = sends.find((payload) => payload.type === 'narrator_event' && payload.event === 'broker_ack');

    expect(gate).toMatchObject({
      scope: 'USER',
      symbol: 'BTC-USD',
      gate_kind: 'risk_block',
      passed: false,
      traceId: 'trace-1',
    });
    expect(gate.strategy_label).toMatch(/^Strategy-/);
    expect(gate.strategy_label).not.toBe('MADynamicSR');
    expect(JSON.stringify(gate)).not.toContain('MADynamicSR');
    expect(gate.category).toBeUndefined();
    expect(gate.code).toBeUndefined();

    expect(broker).toMatchObject({
      scope: 'USER',
      symbol: 'BTC-USD',
      broker: 'kraken',
      action: 'BUY',
      orderId: 'order-1',
      ok: true,
    });
    expect(broker.category).toBeUndefined();
    expect(broker.code).toBeUndefined();
  });

  test('uses market-maker charity flavor only for qualifying fast losses without suppressing closes', () => {
    const sends = [];
    const ws = {
      readyState: 1,
      bufferedAmount: 0,
      send: jest.fn((raw) => sends.push(JSON.parse(raw))),
    };
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(100000);
    const narrator = new TradeNarrator();
    narrator.setWebSocketClient(ws);

    narrator.closed({
      tradeId: 'loss-1',
      strategy: 'MADynamicSR',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 99.5,
      pnl: -5,
      pnlPercent: -0.5,
      reason: 'stop_loss',
      holdMs: 20000,
    });
    nowSpy.mockReturnValue(101000);
    narrator.closed({
      tradeId: 'loss-2',
      strategy: 'MADynamicSR',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 99.5,
      pnl: -5,
      pnlPercent: -0.5,
      reason: 'stop_loss',
      holdMs: 20000,
    });
    nowSpy.mockRestore();

    const closes = sends.filter((payload) => payload.type === 'narrator_event' && payload.event === 'closed');
    expect(closes).toHaveLength(2);
    expect(closes[0].event).toBe('closed');
    expect(closes[0].result).toBe('loss');
    expect(closes[0].text).toContain('charity work for the market makers');
    expect(closes[1].event).toBe('closed');
    expect(closes[1].result).toBe('loss');
    expect(closes[1].text).toContain('LOSS -0.50%');
    expect(closes[1].text).not.toContain('charity work for the market makers');
  });
});
