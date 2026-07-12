'use strict';

const {
  buildBotStateFrame,
  isStockMarketOpen,
  nextStockMarketOpen,
} = require('../core/BotStateFrame');

describe('bot_state frame builder', () => {
  test('reports weekend stock runtime as idle with the next Monday open', () => {
    const frame = buildBotStateFrame({
      strategyOrchestrator: {
        strategies: [{ name: 'EMASMACrossover' }],
      },
      config: { brokerId: 'kraken' },
    }, {
      env: {
        EXECUTION_MODE: 'live',
        LIVE_TRADING: 'true',
        PAPER_TRADING: 'false',
        ALPACA_SYMBOLS: 'TSLA,NVDA',
      },
      now: new Date('2026-06-27T16:00:00.000Z'),
    });

    expect(frame).toEqual(expect.objectContaining({
      type: 'bot_state',
      timestamp: 1782576000000,
      mode: 'weekend_idle',
      reason: 'stocks_closed',
      next_active_at: '2026-06-29T13:30:00.000Z',
      active_strategies: ['EMASMACrossover'],
      active_brokers: ['KRAKEN'],
      execution_mode: 'live',
      live_trading: true,
      paper_trading: false,
    }));
  });

  test('reports market-hours paper trading as eval active', () => {
    const frame = buildBotStateFrame({
      config: {
        mode: { execution: 'paper' },
        broker: { id: 'alpaca' },
      },
    }, {
      env: {
        PAPER_TRADING: 'true',
        LIVE_TRADING: 'false',
        ALPACA_SYMBOLS: 'TSLA',
      },
      now: new Date('2026-06-29T14:00:00.000Z'),
    });

    expect(frame.mode).toBe('eval_active');
    expect(frame.reason).toBe('paper_trading_enabled');
    expect(frame.next_active_at).toBeNull();
    expect(frame.active_brokers).toEqual(['ALPACA']);
  });

  test('uses session router profile data for static broker visibility instead of router env flags', () => {
    const frame = buildBotStateFrame({
      config: {
        mode: { execution: 'paper' },
        sessionRouter: {
          mode: 'static',
          staticSession: 'crypto',
          cryptoSymbols: ['BTC-USD'],
        },
      },
    }, {
      env: {
        PAPER_TRADING: 'true',
        LIVE_TRADING: 'false',
        SESSION_ROUTER_ENABLED: 'false',
      },
      now: new Date('2026-06-29T14:00:00.000Z'),
    });

    expect(frame.active_brokers).toEqual(['KRAKEN']);
  });

  test('does not mark stock market open outside regular session', () => {
    expect(isStockMarketOpen(new Date('2026-06-29T13:00:00.000Z'))).toBe(false);
    expect(isStockMarketOpen(new Date('2026-06-29T14:00:00.000Z'))).toBe(true);
    expect(isStockMarketOpen(new Date('2026-06-29T20:30:00.000Z'))).toBe(false);
  });

  test('computes same-day next open before the opening bell', () => {
    expect(nextStockMarketOpen(new Date('2026-06-29T12:00:00.000Z'))).toBe('2026-06-29T13:30:00.000Z');
  });
});
