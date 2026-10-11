'use strict';

/*
 * Fixture-only context for an isolated, paper-only OrderExecutor rehearsal.
 *
 * The caller must load its isolated StateManager singleton before loading
 * OrderExecutor: OrderExecutor captures getStateManager() at module load.
 * `state` is retained here as an explicit fixture dependency and a useful
 * assertion surface; it is not substituted for that singleton.
 */

const SYMBOLS = Object.freeze({
  crypto: 'BTC-USD',
  stocks: 'TSLA',
});

const STRATEGIES = new Set(['EMATrendRetest', 'DonchianBreakout']);

function noop() {}

function paperRouter(router) {
  if (router) return router;
  return {
    // Paper OrderExecutor must never call this. A call means its simulation
    // boundary was bypassed, so fail the isolated rehearsal immediately.
    async sendOrder() {
      throw new Error('fixture paper OrderExecutor attempted broker routing');
    },
    getBrokerTruthEntryBlock() {
      return null;
    },
  };
}

function strategyContract(strategyName) {
  return {
    strategyName,
    stopLossPercent: -0.5,
    takeProfitPercent: 1,
    trailingStopPercent: 0.6,
    trailingActivation: 0.8,
    maxHoldTimeMinutes: 240,
    minConfidence: 0.6,
    useStructuralExits: false,
    maxConcurrentEntries: 1,
    scaleIn: {
      enabled: false,
      maxAdds: 0,
      addTriggerClass: 'none',
      requireProfitConfirmation: true,
      aggregateRiskCap: 1,
      addSizingLadder: [],
    },
    invalidationConditions: [],
  };
}

/**
 * Builds the small injected context consumed by the real OrderExecutor paper
 * path. The caller owns isolated module loading, ConfigLoader setup, actual
 * StateManager lifecycle, DecisionLedgerLogger flushing, and assertions.
 *
 * Stub boundaries are notifications, performance/risk telemetry, dashboard,
 * and optional pattern recording. They are not order, state, ledger, policy,
 * or exit-contract substitutes.
 */
function makeExecutorContext({ root, config = {}, state, router, memory } = {}) {
  if (!root) throw new Error('fixture executor context requires isolated root');
  if (!state) throw new Error('fixture executor context requires actual StateManager');

  const symbol = config.symbol || (config.assetClass === 'crypto' ? SYMBOLS.crypto : SYMBOLS.stocks);
  const assetClass = config.assetClass || (symbol === SYMBOLS.crypto ? 'crypto' : 'stocks');
  const brokerId = config.brokerId || (assetClass === 'crypto' ? 'kraken' : 'alpaca');
  const accountId = config.accountId || `fixture-${brokerId}-paper`;
  const timeframe = config.timeframe || '15m';
  const strategyName = config.strategyName || 'EMATrendRetest';
  if (!STRATEGIES.has(strategyName)) {
    throw new Error(`fixture strategy must be one of ${Array.from(STRATEGIES).join(', ')}`);
  }
  if (config.executionMode && config.executionMode !== 'paper') {
    throw new Error(`fixture is paper-only; got executionMode=${config.executionMode}`);
  }

  const route = paperRouter(router);
  const noOpAsync = async () => {};
  const ctx = {
    // Real OrderExecutor ownership inputs.
    config: {
      brokerId,
      accountId,
      accountIdSource: 'fixture',
      assetClass,
      executionMode: 'paper',
      enableBacktestMode: false,
      timeframe,
      tradingPair: symbol,
      ...config,
      executionMode: 'paper',
    },
    tradingPair: symbol,
    candleTimeframe: timeframe,
    executionMode: 'paper',
    paperTrading: true,
    backtestMode: false,
    backtestFast: true,
    testMode: false,
    marketData: { timestamp: config.timestamp || Date.parse('2026-10-11T14:30:00.000Z') },
    orderRouter: route,

    // Stubbed non-execution telemetry boundaries.
    notifyTrade: noOpAsync,
    notifyTradeClose: noOpAsync,
    discordNotifier: { notifyTrade: noop },
    performanceAnalyzer: { processTrade: noop, getWinRate: () => null },
    riskManager: { recordTradeResult: noop },
    safetyNet: { updateTradeResult: noop },
    strategyOrchestrator: { recordTradeResult: noop },
    logTrade: noop,
    dashboardWs: null,
    dashboardWsConnected: false,
    runner: { isSessionRoutingActive: () => false },
    patternChecker: memory ? {
      memory,
      recordPatternResult: noop,
    } : null,
    patternExitModel: null,
    patternExitShadowMode: false,
    webhookAdapter: { enabled: false, dryRun: true },
  };

  const confidence = Number.isFinite(config.confidence) ? config.confidence : 75;
  const entryPrice = Number.isFinite(config.entryPrice)
    ? config.entryPrice
    : (assetClass === 'crypto' ? 60000 : 200);
  const exitPrice = Number.isFinite(config.exitPrice)
    ? config.exitPrice
    : entryPrice * 1.01;
  if (entryPrice <= 0 || exitPrice <= 0 || confidence <= 0 || confidence > 100) {
    throw new Error('fixture requires positive entry/exit prices and confidence in (0, 100]');
  }

  const exitContract = strategyContract(strategyName);
  const signal = {
    symbol,
    entryPrice,
    exitPrice,
    confidenceData: { totalConfidence: confidence },
    indicators: { volatility: 0.01, rsi: 55, macd: {}, trend: 'up' },
    patterns: [],
    orchResult: { winnerStrategy: strategyName, sizingMultiplier: 1, exitContract },
    buy: { action: 'BUY', confidence, traceId: `fixture:${symbol}:buy`, signalId: `fixture:${symbol}:buy:signal` },
    sellShort: { action: 'SELL_SHORT', confidence, traceId: `fixture:${symbol}:short`, signalId: `fixture:${symbol}:short:signal` },
    // Set tradeId from the successful entry's returned orderId before invoking.
    sell: (tradeId) => ({ action: 'SELL', confidence: 100, tradeId, exitReason: 'session_close', traceId: `fixture:${symbol}:sell`, signalId: `fixture:${symbol}:sell:signal` }),
    cover: (tradeId) => ({ action: 'COVER', confidence: 100, tradeId, exitReason: 'session_close', traceId: `fixture:${symbol}:cover`, signalId: `fixture:${symbol}:cover:signal` }),
    // OrderExecutor derives close quantity from active trade remainingOrderQuantity.
    // This intentionally leaves a simulated residual for the handoff refusal.
    sellPartial: (tradeId) => ({ action: 'SELL', confidence: 100, tradeId, exitReason: 'fixture_partial_close', exitFraction: 0.5, traceId: `fixture:${symbol}:sell:partial`, signalId: `fixture:${symbol}:sell:partial:signal` }),
    coverPartial: (tradeId) => ({ action: 'COVER', confidence: 100, tradeId, exitReason: 'fixture_partial_close', exitFraction: 0.5, traceId: `fixture:${symbol}:cover:partial`, signalId: `fixture:${symbol}:cover:partial:signal` }),
  };

  return { ctx, signal, state, symbols: SYMBOLS };
}

module.exports = { makeExecutorContext, SYMBOLS };
