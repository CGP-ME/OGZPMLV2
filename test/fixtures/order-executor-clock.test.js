'use strict';

require('../helpers/require-isolation.cjs')();
const mockState = {
  normalizeSymbol: symbol => symbol,
  get: jest.fn(), getState: jest.fn(), getEquity: jest.fn(() => 10000),
  getAvailableCapital: jest.fn(() => 10000), getTradesBySymbol: jest.fn(),
  isPaused: jest.fn(() => false), isSymbolHalted: jest.fn(() => false), getSymbolHaltReason: jest.fn(),
  getSymbolHaltCode: jest.fn(), openPosition: jest.fn(), applyFill: jest.fn(),
  reserveExitSlot: jest.fn(), markExitSlotAccepted: jest.fn(), releaseExitSlot: jest.fn(),
  haltSymbol: jest.fn(), reconcileBrokerFlat: jest.fn(),
};
jest.mock('../../core/StateManager', () => ({ getInstance: () => mockState }));
jest.mock('../../ogz-meta/claudito-logger', () => ({
  TradingProofLogger: { trade: jest.fn(), explanation: jest.fn() },
}));

for (const key of ['KRAKEN_API_KEY', 'KRAKEN_API_SECRET', 'ALPACA_API_KEY', 'ALPACA_API_SECRET', 'WEBSOCKET_AUTH_TOKEN']) {
  process.env[key] = 'synthetic-clock-test';
}
process.env.PROFILE = 'paper';
const ConfigLoader = require('../../foundation/ConfigLoader');
ConfigLoader.load({ role: 'bot', loadDotenv: false, silent: true });
const OrderExecutor = require('../../core/OrderExecutor');
const { getInstance: getExitContractManager } = require('../../core/ExitContractManager');
const TradingLoop = require('../../core/TradingLoop');

const T0 = Date.parse('2026-10-29T20:00:00Z');
const features = [0.51, 0.62, 0.41, 0.53, 0.44, 0.35, 0.58, 0.49, 0.5];
let positions, now, spies;

function makeExecutor(mode) {
  const frame = {
    marketData: { symbol: 'RIOT', timeframe: '1m', timestamp: T0 },
    priceHistory: Array.from({ length: 60 }, (_, i) => ({
      timestamp: T0 - (60 - i) * 60000, open: 20 + i / 100,
      high: 21 + i / 100, low: 19 + i / 100, close: 20.5 + i / 100, volume: 100,
    })),
  };
  const ctx = {
    config: { brokerId: 'alpaca', accountId: 'clock-account', accountIdSource: 'broker',
      assetClass: 'stocks', timeframe: '1m', executionMode: mode, enableBacktestMode: mode === 'backtest' },
    backtestMode: mode === 'backtest', paperTrading: mode === 'paper', backtestFast: true,
    marketData: { symbol: 'TSLA', timeframe: '15m', timestamp: T0 - 86400000 },
    runner: { getSymbolTimeframeContext: jest.fn((symbol, timeframe) => {
      expect(symbol).toBe('RIOT'); expect(timeframe).toBe('1m'); return frame;
    }) },
    backtestRecorder: { recordTrade: jest.fn() },
    logTrade: jest.fn(), notifyTrade: jest.fn(), notifyTradeClose: jest.fn(),
    discordNotifier: { notifyTrade: jest.fn() },
    performanceAnalyzer: { processTrade: jest.fn() },
    patternChecker: { recordPatternResult: jest.fn(() => true), memory: { healthCheck: jest.fn(() => ({ healthy: true, issues: [] })) } },
  };
  return { executor: new OrderExecutor(ctx), ctx, frame };
}

beforeEach(() => {
  jest.clearAllMocks();
  positions = new Map(); now = T0 + 10000;
  spies = ['log', 'warn', 'error'].map(method => jest.spyOn(console, method).mockImplementation(() => {}));
  spies.push(jest.spyOn(Date, 'now').mockImplementation(() => now));
  mockState.get.mockImplementation(key => ({ isTrading: true, balance: 10000, activeTrades: positions })[key]);
  mockState.getState.mockImplementation(() => ({ balance: 10000, activeTrades: positions }));
  mockState.getTradesBySymbol.mockImplementation(symbol => [...positions.values()].filter(trade => trade.symbol === symbol));
  mockState.openPosition.mockImplementation(async (size, price, metadata) => {
    positions.set(metadata.orderId, { ...metadata, id: metadata.orderId, size, sizeUsd: size, entryPrice: price });
    return { success: true };
  });
  mockState.reserveExitSlot.mockResolvedValue({ success: true, reserved: true, pendingExitIntent: { intentId: 'clock-exit' } });
  mockState.markExitSlotAccepted.mockResolvedValue({ success: true, accepted: true });
  mockState.applyFill.mockResolvedValue({ success: true, applied: true, code: 'FILL_APPLIED' });
});

test.each(['paper', 'backtest'].flatMap(mode => ['exit_only', 'analysis'].map(route => [mode, route])))
('%s %s supplies the matching clock to the exit timer', async (mode, route) => {
  const { ctx, frame } = makeExecutor(mode);
  frame.timeframe = '1m'; frame.marketData.price = 20;
  ctx.getSymbolTimeframeContext = ctx.runner.getSymbolTimeframeContext;
  frame.strategyOrchestrator = { evaluate: jest.fn(() => ({ direction: 'hold', confidence: 0, allResults: [] })) };
  ctx.strategyOrchestrator = frame.strategyOrchestrator;
  ctx.broadcastPatternAnalysis = jest.fn();
  const trade = { id: 'timer-trade', symbol: 'RIOT', direction: 'long', action: 'BUY',
    timeframe: '1m', entryPrice: 20, entryTime: T0 - 60000,
    brokerId: 'alpaca', accountId: 'clock-account', accountIdSource: 'broker', assetClass: 'stocks', executionMode: mode };
  positions.set(trade.id, trade);
  const loop = new TradingLoop(ctx);
  const data = { indicators: { rsi: 50, trend: 'sideways', atr: 0.1 }, patterns: [],
    regime: { currentRegime: 'sideways' }, tpoResult: null, fibLevels: null, nearestFibLevel: null, nearestStructure: null };
  loop._gatherData = jest.fn(() => data);
  loop._runTRAI = jest.fn();
  loop._writeDecisionAutopsy = jest.fn(() => ({ success: true, persisted: true }));
  loop._getTradeExitContext = jest.fn(() => ({ ...data, exitTimeframe: '1m',
    marketData: frame.marketData, price: 20, priceSource: 'market_data', priceHistory: frame.priceHistory }));
  const checker = jest.spyOn(getExitContractManager(), 'checkExitConditions').mockReturnValue({ shouldExit: false });
  spies.push(checker);
  if (route === 'exit_only') await loop._checkExitsOnly('RIOT');
  else await loop._analyze('RIOT', 'clock-analysis', '1m');
  expect(checker).toHaveBeenCalledWith(trade, 20, expect.objectContaining({ currentTime: mode === 'paper' ? now : T0 }));
});
afterEach(() => spies.forEach(spy => spy.mockRestore()));

test.each(['paper', 'backtest'].flatMap(mode => ['BUY', 'SELL_SHORT'].map(action => [mode, action])))
('%s %s records its execution clock through entry, close and learning', async (mode, action) => {
  const { executor, ctx, frame } = makeExecutor(mode);
  const exitContract = { ...getExitContractManager().getDefaultContract('RSI', { timeframe: '1m' }), timeframe: '1m' };
  const entryResult = await executor.executeTrade(
    { action, confidence: 90 }, { totalConfidence: 90 }, 20,
    { rsi: 55, trend: 'sideways', volatility: 0.01 },
    [{ name: 'RSI', features }], null,
    { winnerStrategy: 'RSI', sizingMultiplier: 1, exitContract, marketCondition: 'ranging' }, 'RIOT', '1m'
  );
  expect(entryResult).toEqual(expect.objectContaining({ success: true, reason: null }));
  const trade = [...positions.values()][0];
  const expectedEntry = mode === 'paper' ? now : T0;
  expect(trade.entryTime).toBe(expectedEntry);
  now += 60000;
  frame.marketData = { ...frame.marketData, timestamp: mode === 'paper' ? T0 : T0 + 60000 };
  // Other streams can advance while this exit awaits reservation. The replay
  // result must retain its selected event time, not read mutable context later.
  mockState.reserveExitSlot.mockImplementation(async () => {
    now += 5000;
    frame.marketData.timestamp += 900000;
    ctx.marketData.timestamp += 86400000;
    return { success: true, reserved: true, pendingExitIntent: { intentId: 'clock-exit' } };
  });
  const result = await executor.executeTrade(
    { action: action === 'BUY' ? 'SELL' : 'COVER', confidence: 100, tradeId: trade.orderId, exitReason: 'signal' },
    { totalConfidence: 100 }, action === 'BUY' ? 21 : 19,
    { rsi: 55, trend: 'sideways', volatility: 0.01 }, [], null, null, 'RIOT', '1m'
  );
  expect(result).toEqual(expect.objectContaining({ success: true, reason: null }));
  const expectedExit = mode === 'paper' ? now : T0 + 60000;
  const duration = expectedExit - expectedEntry;
  expect(ctx.patternChecker.recordPatternResult).toHaveBeenCalledWith(features, expect.objectContaining({ holdTimeMs: duration, symbol: 'RIOT', timeframe: '1m' }));
  const closed = ctx.logTrade.mock.calls.map(call => call[0]).find(record => record.type === 'SELL' || record.type === 'COVER');
  expect(closed).toEqual(expect.objectContaining({
    entryTime: new Date(expectedEntry).toISOString(), exitTime: new Date(expectedExit).toISOString(), holdTime: duration,
  }));
});
