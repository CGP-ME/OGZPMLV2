'use strict';

const mockStateManager = {
  get: jest.fn(),
  getEquity: jest.fn(),
  getAvailableCapital: jest.fn(),
  isHalted: jest.fn(() => false),
  getHaltReason: jest.fn(() => null),
  isSymbolHalted: jest.fn(() => false),
  getSymbolHaltReason: jest.fn(() => null),
  getState: jest.fn(),
  openPosition: jest.fn(),
  closePosition: jest.fn(),
  reducePosition: jest.fn(),
  getTradesBySymbol: jest.fn(),
  haltSymbol: jest.fn(),
  removeActiveTrade: jest.fn(),
};

jest.mock('../core/StateManager', () => ({
  getInstance: () => mockStateManager,
}));

jest.mock('../core/MaxProfitManager', () => {
  const { createMockMaxProfitManager } = require('./fixtures/mock-max-profit-manager');
  const ActualMaxProfitManager = jest.requireActual('../core/MaxProfitManager');
  return createMockMaxProfitManager(jest, ActualMaxProfitManager);
});

jest.mock('../ogz-meta/claudito-logger', () => ({
  TradingProofLogger: {
    trade: jest.fn(),
  },
}));

const TradingLoop = require('../core/TradingLoop');
const OrderExecutor = require('../core/OrderExecutor');
const OrderRouter = require('../core/OrderRouter');

function candles(count = 20, price = 100) {
  return Array.from({ length: count }, (_, i) => ({
    time: 1700000000000 + i * 60000,
    open: price,
    high: price * 1.01,
    low: price * 0.99,
    close: price,
    volume: 1000,
  }));
}

function buildAdapter(brokerId, orderId, price) {
  return {
    getBrokerName: () => brokerId,
    placeBuyOrder: jest.fn(async () => ({ orderId, price })),
    placeSellOrder: jest.fn(async () => ({ orderId, price })),
  };
}

function buildOrchResult() {
  return {
    direction: 'buy',
    confidence: 80,
    winnerStrategy: 'RSI',
    allResults: [{ strategyName: 'RSI', direction: 'buy', confidence: 0.8, reason: 'proof signal' }],
    exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
    confluence: { count: 1, strategies: ['RSI'] },
    sizingMultiplier: 1,
    signalBreakdown: { signals: [{ direction: 'buy', confidence: 0.8, reason: 'proof signal' }] },
  };
}

function buildProofContext({ brokerId, symbol, assetClass, price }) {
  const dashboardWs = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
  const orderRouter = new OrderRouter();
  const adapter = buildAdapter(brokerId, `${brokerId.toUpperCase()}_PROOF_1`, price);
  orderRouter.registerBroker(adapter, [symbol]);

  const ctx = {
    priceHistory: candles(20, price),
    marketData: {
      symbol,
      price,
      timestamp: 1700000000000,
      volume: 1000,
    },
    candleTimeframe: '1m',
    config: {
      minTradeConfidence: 0.5,
      brokerId,
      accountId: 'default',
      accountIdSource: 'default',
      assetClass,
      timeframe: '1m',
      executionMode: 'live',
      enableBacktestMode: false,
      evalTraceEnabled: true,
      traceEventMaxBufferedBytes: 1048576,
    },
    strategyOrchestrator: {
      strategies: [{ name: 'RSI' }],
      evaluate: jest.fn(() => buildOrchResult()),
    },
    broadcastPatternAnalysis: jest.fn(),
    dashboardWs,
    orderRouter,
    preOrderEntryGate: jest.fn(async () => ({ allowed: true, passedRules: ['proof_gate'] })),
    maxProfitManagers: new Map(),
    notifyTrade: jest.fn(() => Promise.resolve()),
    discordNotifier: { notifyTrade: jest.fn() },
    performanceAnalyzer: { processTrade: jest.fn() },
    backtestMode: false,
    paperTrading: false,
    backtestFast: true,
  };

  const executor = new OrderExecutor(ctx);
  ctx.executeTrade = executor.executeTrade.bind(executor);

  return { ctx, adapter };
}

function stubGatherData(loop) {
  loop._gatherData = jest.fn(() => ({
    indicators: {
      rsi: 55,
      macd: {},
      trend: 'sideways',
      atr: 1,
      ema20: 100,
      ema50: 100,
      volatility: 1,
    },
    patterns: [],
    regime: { currentRegime: 'sideways' },
    tpoResult: null,
    fibLevels: null,
    nearestFibLevel: null,
    nearestStructure: null,
  }));
  loop._runTRAI = jest.fn();
}

function dashboardFrames(ctx) {
  return ctx.dashboardWs.send.mock.calls.map(call => JSON.parse(call[0]));
}

function traceEvents(ctx) {
  return dashboardFrames(ctx).filter(frame => frame.type === 'trace_event');
}

describe('eval signal path proof', () => {
  let logSpy;
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      if (key === 'position') return 0;
      if (key === 'balance') return 10000;
      if (key === 'initialBalance') return 10000;
      return null;
    });
    mockStateManager.getEquity.mockReturnValue(10000);
    mockStateManager.getAvailableCapital.mockReturnValue(10000);
    mockStateManager.getState.mockReturnValue({ position: 0, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([]);
    mockStateManager.openPosition.mockResolvedValue({ success: true });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test.each([
    { brokerId: 'kraken', symbol: 'BTC-USD', assetClass: 'crypto', price: 50000 },
    { brokerId: 'alpaca', symbol: 'TSLA', assetClass: 'stocks', price: 100 },
  ])('signals through TradingLoop, OrderExecutor, OrderRouter, and dashboard trace for $brokerId', async ({ brokerId, symbol, assetClass, price }) => {
    const { ctx, adapter } = buildProofContext({ brokerId, symbol, assetClass, price });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await loop._analyze(symbol, `trace_${brokerId}_proof`);

    expect(adapter.placeBuyOrder).toHaveBeenCalledTimes(1);
    expect(adapter.placeBuyOrder).toHaveBeenCalledWith(
      symbol,
      expect.any(Number),
      null,
      expect.objectContaining({ sizeUsd: expect.any(Number), quantityUnit: assetClass === 'stocks' ? 'shares' : 'base' })
    );
    expect(mockStateManager.openPosition).toHaveBeenCalledWith(
      expect.any(Number),
      price,
      expect.objectContaining({
        traceId: `trace_${brokerId}_proof`,
        signalId: `trace_${brokerId}_proof:signal`,
        brokerId,
        assetClass,
        executionMode: 'live',
        symbol,
      })
    );

    const events = traceEvents(ctx);
    const eventNames = events.map(event => event.event);
    expect(eventNames).toEqual(expect.arrayContaining([
      'STRATEGY_DECISION',
      'EXECUTE_HANDOFF',
      'ORDER_EXECUTE_START',
      'ORDER_PLAN',
      'EVAL_RULE_CHECK',
      'BROKER_ORDER_REQUEST',
      'BROKER_ORDER_RESULT',
      'STATE_MUTATION',
      'EXECUTE_RETURN',
    ]));

    for (const event of events.filter(frame => [
      'EXECUTE_HANDOFF',
      'ORDER_EXECUTE_START',
      'ORDER_PLAN',
      'BROKER_ORDER_REQUEST',
      'BROKER_ORDER_RESULT',
      'STATE_MUTATION',
      'EXECUTE_RETURN',
    ].includes(frame.event))) {
      expect(event).toEqual(expect.objectContaining({
        traceId: `trace_${brokerId}_proof`,
        signalId: `trace_${brokerId}_proof:signal`,
        symbol,
        brokerId,
        assetClass,
        executionMode: 'live',
      }));
    }

    expect(events.find(event => event.event === 'BROKER_ORDER_RESULT')).toEqual(expect.objectContaining({
      event: 'BROKER_ORDER_RESULT',
      fields: expect.objectContaining({
        success: true,
        orderId: `${brokerId.toUpperCase()}_PROOF_1`,
        orderAccepted: true,
        stateMutationSucceeded: null,
      }),
    }));
    expect(events.find(event => event.event === 'EXECUTE_RETURN')).toEqual(expect.objectContaining({
      event: 'EXECUTE_RETURN',
      fields: expect.objectContaining({
        success: true,
        orderId: `${brokerId.toUpperCase()}_PROOF_1`,
        orderAccepted: true,
        stateMutationSucceeded: true,
      }),
    }));
  });

  test('uses symbol-scoped market data instead of global last-tick data during multi-asset analysis', async () => {
    const { ctx } = buildProofContext({ brokerId: 'alpaca', symbol: 'TSLA', assetClass: 'stocks', price: 208 });
    const tslaHistory = candles(20, 406);
    const tslaMarketData = {
      symbol: 'TSLA',
      price: 406,
      timestamp: 1700000060000,
      volume: 1234,
    };
    ctx.marketData = {
      symbol: 'NVDA',
      price: 208,
      timestamp: 1700000000000,
      volume: 9999,
    };
    ctx.symbolContexts = new Map([
      ['TSLA', {
        priceHistory: tslaHistory,
        marketData: tslaMarketData,
      }]
    ]);
    ctx.strategyOrchestrator.evaluate = jest.fn(() => ({
      ...buildOrchResult(),
      direction: 'hold',
      confidence: 80,
    }));
    ctx.executeTrade = jest.fn();
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await loop._analyze('TSLA', 'trace_symbol_scope_price');

    expect(loop._gatherData).toHaveBeenCalledWith(406, ctx.symbolContexts.get('TSLA'), 'TSLA', tslaMarketData);
    expect(ctx.strategyOrchestrator.evaluate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      expect.any(Object),
      tslaHistory,
      expect.objectContaining({
        price: 406,
        symbol: 'TSLA',
      })
    );
    expect(ctx.executeTrade).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('[MARKET-SCOPE][FALLBACK] analyze symbol=TSLA'));
  });

  test('warns and falls back only to matching global market data when scoped market data has the wrong symbol', async () => {
    const { ctx } = buildProofContext({ brokerId: 'alpaca', symbol: 'TSLA', assetClass: 'stocks', price: 406 });
    const tslaHistory = candles(20, 406);
    const globalTslaMarketData = {
      symbol: 'TSLA',
      price: 406,
      timestamp: 1700000060000,
      volume: 1234,
    };
    ctx.marketData = globalTslaMarketData;
    ctx.symbolContexts = new Map([
      ['TSLA', {
        priceHistory: tslaHistory,
        marketData: {
          symbol: 'NVDA',
          price: 208,
          timestamp: 1700000000000,
          volume: 9999,
        },
      }]
    ]);
    ctx.strategyOrchestrator.evaluate = jest.fn(() => ({
      ...buildOrchResult(),
      direction: 'hold',
      confidence: 80,
    }));
    ctx.executeTrade = jest.fn();
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await loop._analyze('TSLA', 'trace_symbol_scope_mismatch');

    expect(loop._gatherData).toHaveBeenCalledWith(406, ctx.symbolContexts.get('TSLA'), 'TSLA', globalTslaMarketData);
    expect(ctx.strategyOrchestrator.evaluate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      expect.any(Object),
      tslaHistory,
      expect.objectContaining({
        price: 406,
        symbol: 'TSLA',
      })
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('reason=symbol_context_market_data_symbol_mismatch'));
    expect(ctx.executeTrade).not.toHaveBeenCalled();
  });

  test.each([
    { brokerId: 'kraken', symbol: 'BTC-USD', assetClass: 'crypto', price: 50000 },
    { brokerId: 'alpaca', symbol: 'TSLA', assetClass: 'stocks', price: 100 },
  ])('preserves broker acceptance when state open fails for $brokerId', async ({ brokerId, symbol, assetClass, price }) => {
    mockStateManager.openPosition.mockResolvedValueOnce({ success: false, error: 'state write failed' });
    const { ctx, adapter } = buildProofContext({ brokerId, symbol, assetClass, price });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await loop._analyze(symbol, `trace_${brokerId}_state_fail`);

    expect(adapter.placeBuyOrder).toHaveBeenCalledTimes(1);
    expect(mockStateManager.removeActiveTrade).toHaveBeenCalledWith(`${brokerId.toUpperCase()}_PROOF_1`);

    const events = traceEvents(ctx);
    expect(events.find(event => event.event === 'BROKER_ORDER_RESULT')).toEqual(expect.objectContaining({
      event: 'BROKER_ORDER_RESULT',
      fields: expect.objectContaining({
        success: true,
        orderId: `${brokerId.toUpperCase()}_PROOF_1`,
        orderAccepted: true,
        stateMutationSucceeded: null,
      }),
    }));
    expect(events.find(event => event.event === 'STATE_MUTATION')).toEqual(expect.objectContaining({
      event: 'STATE_MUTATION',
      fields: expect.objectContaining({
        success: false,
        operation: 'openPosition',
        error: 'state write failed',
      }),
    }));
    expect(events.find(event => event.event === 'EXECUTE_RETURN')).toEqual(expect.objectContaining({
      event: 'EXECUTE_RETURN',
      fields: expect.objectContaining({
        success: false,
        reason: 'state_open_failed',
        orderId: `${brokerId.toUpperCase()}_PROOF_1`,
        orderAccepted: true,
        stateMutationSucceeded: false,
      }),
    }));
  });
});
