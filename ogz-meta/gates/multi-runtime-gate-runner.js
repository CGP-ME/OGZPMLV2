#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REPORT_PATH = path.join(REPO_ROOT, 'ogz-meta', 'gates', 'runs', 'multi-runtime-latest.json');
const {
  assertEvalLiveReadiness,
  readPm2ProcessEnv,
} = require('./eval-live-posture-gate');

const EXPECTED_P0 = Object.freeze({
  finalBalance: 8338.146639366509,
  totalTrades: 1551,
  winRate: 52.2,
  profitFactor: 0.64
});

const P0_GATE_ID = 'p0.single_lane.tsla_ema_anchor';
const REPORT_SCHEMA_VERSION = 2;

const P0_TIER_FRACTION_CAPS = Object.freeze({
  profit_tier_1: 0.30,
  profit_tier_2: 0.30,
  profit_tier_3: 0.20,
  profit_tier_4: 0.20
});

let runtime = null;

function loadRuntime() {
  if (!runtime) {
    const { runP0 } = require('../anchor-runner');
    runtime = {
      runP0,
      get stateManager() {
        if (!this._stateManager) {
          const { getInstance: getStateManager } = require('../../core/StateManager');
          this._stateManager = getStateManager();
        }
        return this._stateManager;
      },
      get PositionTracker() {
        if (!this._PositionTracker) {
          this._PositionTracker = require('../../core/PositionTracker');
        }
        return this._PositionTracker;
      },
      get OrderExecutor() {
        if (!this._OrderExecutor) {
          this._OrderExecutor = require('../../core/OrderExecutor');
        }
        return this._OrderExecutor;
      }
    };
  }
  return runtime;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sha256FileIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function splitLines(value) {
  return String(value || '').split('\n').map((line) => line.trim()).filter(Boolean);
}

function readGitText(args, deps = {}) {
  const runner = deps.execFileSync || execFileSync;
  try {
    return String(runner('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })).trim();
  } catch (err) {
    return null;
  }
}

function buildGitProvenance(deps = {}) {
  const statusPorcelain = readGitText(['status', '--porcelain', '--untracked-files=no'], deps) || '';
  const stagedPaths = splitLines(readGitText(['diff', '--cached', '--name-only'], deps));
  const unstagedTrackedPaths = splitLines(readGitText(['diff', '--name-only'], deps));
  const branch = readGitText(['branch', '--show-current'], deps);
  const commit = readGitText(['rev-parse', 'HEAD'], deps);

  return {
    branch,
    commit,
    shortCommit: commit ? commit.slice(0, 8) : null,
    trackedDirty: statusPorcelain.length > 0,
    trackedDirtyHash: sha256Text(statusPorcelain),
    stagedPaths,
    unstagedTrackedPaths,
    statusPorcelain
  };
}

function buildP0BaselineProvenance(gates, deps = {}) {
  const p0Gate = gates.find((gate) => gate.id === P0_GATE_ID);
  if (!p0Gate) {
    return null;
  }
  const detail = p0Gate.detail || {};
  const hashFile = deps.hashFile || sha256FileIfPresent;

  return {
    gateId: P0_GATE_ID,
    classification: 'canonical',
    expected: { ...EXPECTED_P0 },
    actual: detail.summary || null,
    reportPath: detail.report || null,
    reportMtimeMs: detail.reportMtimeMs || null,
    reportSha256: hashFile(detail.report),
    logPath: detail.log || null,
    logSha256: hashFile(detail.log),
    runSpec: detail.runSpec || null,
    tuningProfile: detail.tuningProfile || null,
    workerEnvHash: detail.workerEnv ? sha256Text(stableStringify(detail.workerEnv)) : null,
    historicalAnchors: [
      {
        finalBalance: 10061.215823687478,
        reason: 'historical ATR-off profile drift anchor before current-eval owned canonical ATR filter'
      },
      {
        finalBalance: 13255.255799695915,
        reason: 'historical contaminated partial-exit over-credit anchor'
      },
      {
        finalBalance: 13213.042341608163,
        reason: 'historical modifiers-off anchor unless explicitly rebaselined'
      },
      {
        finalBalance: 10663.30975684895,
        reason: 'historical requested-notional recorder anchor before executed closed quantity owned stock PnL'
      },
      {
        finalBalance: 10663.639172063286,
        totalTrades: 1596,
        winRate: 70.1,
        profitFactor: 1.16,
        reason: 'historical zero-fee stock P0 before TTP venue fee parity became canonical'
      }
    ]
  };
}

function buildReportProvenance(gates, deps = {}) {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedBy: 'ogz-meta/gates/multi-runtime-gate-runner.js',
    git: buildGitProvenance(deps),
    p0Baseline: buildP0BaselineProvenance(gates, deps)
  };
}

function stateManager() {
  return loadRuntime().stateManager;
}

async function withQuietConsole(fn) {
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };
  let suppressedLogCount = 0;
  console.log = () => { suppressedLogCount += 1; };
  console.warn = () => { suppressedLogCount += 1; };
  console.error = () => { suppressedLogCount += 1; };

  try {
    const detail = await fn();
    return {
      ...(detail || {}),
      suppressedLogCount
    };
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }
}

function resetStateManager() {
  const sm = stateManager();
  sm.save = () => {};
  sm.notifyListeners = () => {};
  sm.dashboardWs = null;
  sm.state = {
    position: 0,
    positionCount: 0,
    entryPrice: 0,
    entryTime: null,
    balance: 10000,
    totalBalance: 10000,
    initialBalance: 10000,
    inPosition: 0,
    activeTrades: new Map(),
    symbolEntryHalts: {},
    lastPrices: new Map(),
    lastTradeTime: null,
    tradeCount: 0,
    dailyTradeCount: 0,
    realizedPnL: 0,
    unrealizedPnL: 0,
    totalPnL: 0,
    closedTrades: [],
    isTrading: false,
    lastError: null,
    lastUpdate: Date.now()
  };
}

function scopeInput(overrides = {}) {
  return {
    orderId: 'gate-scoped-open',
    action: 'BUY',
    direction: 'long',
    entryStrategy: 'GateStrategy',
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'acct-main',
    accountIdSource: 'config',
    assetClass: 'stocks',
    executionMode: 'paper',
    timeframe: '15m',
    ...overrides
  };
}

function makeTrade(overrides = {}) {
  const sm = stateManager();
  const input = scopeInput(overrides);
  const scope = sm.buildTradeScope(input, input.symbol, 'multi-runtime-gate trade scope');
  const action = overrides.action || 'BUY';
  const side = overrides.side || (action === 'SELL_SHORT' ? 'short' : 'long');
  const orderId = overrides.orderId || `${scope.symbol}-${action}-${scope.accountId}`;
  const sizeUsd = overrides.sizeUsd ?? 1000;
  const entryPrice = overrides.entryPrice ?? 200;

  return {
    orderId,
    id: orderId,
    signalId: overrides.signalId || `sig-${orderId}`,
    symbol: scope.symbol,
    brokerId: scope.brokerId,
    broker: scope.brokerId,
    accountId: scope.accountId,
    accountIdSource: scope.accountIdSource,
    assetClass: scope.assetClass,
    executionMode: scope.executionMode,
    timeframe: scope.timeframe,
    scopeKey: scope.key,
    entryStrategy: overrides.entryStrategy || 'GateStrategy',
    strategyName: overrides.strategyName || overrides.entryStrategy || 'GateStrategy',
    exitReason: overrides.exitReason || null,
    entryTime: overrides.entryTime ?? Date.parse('2026-05-26T00:00:00.000Z'),
    entryPrice,
    price: entryPrice,
    side,
    direction: side,
    action,
    sizeUsd,
    size: sizeUsd,
    status: 'open',
    exitContract: overrides.exitContract || { stopLossPercent: 1, takeProfitPercent: 2 }
  };
}

function makeBacktestTrade(overrides = {}) {
  return {
    entryTime: '2026-05-26T13:30:00.000Z',
    exitTime: '2026-05-26T13:45:00.000Z',
    direction: 'long',
    entryPrice: 100,
    exitPrice: 105,
    size: 500,
    strategyName: 'GateStrategy',
    confidence: 0.72,
    exitReason: 'take_profit',
    holdTimeMinutes: 15,
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'acct-main',
    accountIdSource: 'config',
    assetClass: 'stocks',
    executionMode: 'backtest',
    timeframe: '15m',
    scopeKey: 'backtest:alpaca:acct-main:stocks:TSLA:15m',
    scopeKeyVersion: 2,
    ...overrides
  };
}

function patternFeatures() {
  return [0.51, 0.02, 1, 0.03, 0.01, 0.5, 0.01, 0.02, 0];
}

function patternScope(overrides = {}) {
  return {
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'acct-main',
    accountIdSource: 'config',
    assetClass: 'stocks',
    executionMode: 'backtest',
    timeframe: '15m',
    scopeKey: 'backtest:alpaca:acct-main:stocks:TSLA:15m',
    ...overrides
  };
}

function patternBankTrade(overrides = {}) {
  return {
    ...patternScope(),
    id: 'gate-pattern-trade',
    profitLoss: 25,
    profitLossPercent: 2.5,
    holdDuration: 900000,
    exitReason: 'take_profit',
    indicators: {
      rsi: 55,
      macd: 0.2,
      macdHistogram: 0.03,
      primaryPattern: 'breakout'
    },
    trend: 'uptrend',
    timestamp: 1779802200000,
    volatility: 0.02,
    ...overrides
  };
}

function addTrades(...trades) {
  const sm = stateManager();
  for (const trade of trades) {
    sm.buildTradeScope(trade, trade?.symbol, 'multi-runtime-gate addTrades');
    sm.state.activeTrades.set(trade.orderId, trade);
  }
}

function assertNumberClose(actual, expected, label) {
  assert.strictEqual(Number(actual).toFixed(12), Number(expected).toFixed(12), label);
}

function assertP0Summary(summary) {
  assertNumberClose(summary.finalBalance, EXPECTED_P0.finalBalance, 'P0 finalBalance drifted');
  assert.strictEqual(summary.totalTrades, EXPECTED_P0.totalTrades, 'P0 totalTrades drifted');
  assert.strictEqual(Number(summary.winRate).toFixed(1), EXPECTED_P0.winRate.toFixed(1), 'P0 winRate drifted');
  assert.strictEqual(Number(summary.profitFactor).toFixed(2), EXPECTED_P0.profitFactor.toFixed(2), 'P0 profitFactor drifted');
}

function tradeGroupKey(trade) {
  return [
    trade.entryTime,
    trade.entryPrice,
    trade.strategyName,
    trade.direction,
    trade.symbol,
    trade.brokerId,
    trade.accountId,
    trade.assetClass,
    trade.executionMode,
    trade.timeframe
  ].join('|');
}

function tradeEntryIdentityKey(trade) {
  return [
    trade.entryTime,
    trade.entryPrice,
    trade.strategyName,
    trade.direction,
    trade.symbol
  ].join('|');
}

function tradeRuntimeScopeKey(trade) {
  return [
    trade.brokerId,
    trade.accountId,
    trade.assetClass,
    trade.executionMode,
    trade.timeframe
  ].join('|');
}

function normalizedExitReason(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function requireFiniteNumber(value, label) {
  const numberValue = Number(value);
  assert(Number.isFinite(numberValue), `${label} must be finite, got ${value}`);
  return numberValue;
}

function assertClose(actual, expected, label, tolerance = 1e-8) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${label}: actual=${actual}, expected=${expected}, diff=${actual - expected}`
  );
}

function assertP0LedgerConservation(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const trades = Array.isArray(report.trades) ? report.trades : [];
  assert(trades.length > 0, 'P0 report must contain trades for ledger conservation validation');

  const groups = new Map();
  for (const trade of trades) {
    const key = tradeGroupKey(trade);
    const group = groups.get(key) || [];
    group.push(trade);
    groups.set(key, group);
  }

  for (const [key, group] of groups.entries()) {
    group.sort((a, b) => {
      const exitA = Date.parse(a.exitTime || '');
      const exitB = Date.parse(b.exitTime || '');
      if (Number.isFinite(exitA) && Number.isFinite(exitB) && exitA !== exitB) {
        return exitA - exitB;
      }
      return Number(a.tradeNumber || 0) - Number(b.tradeNumber || 0);
    });

    const first = group[0];
    const entryPrice = requireFiniteNumber(first.entryPrice, `P0 ${key} entryPrice`);
    assert(entryPrice > 0, `P0 ${key} entryPrice must be positive`);
    const originalQuantity = requireFiniteNumber(first.entryOrderQuantity, `P0 ${key} entryOrderQuantity`);
    assert(originalQuantity > 0, `P0 ${key} entryOrderQuantity must be positive`);
    const direction = normalizedExitReason(first.direction);
    assert(['long', 'buy', 'short', 'sell'].includes(direction), `P0 ${key} has unsupported direction ${first.direction}`);

    let remainingQuantity = originalQuantity;
    for (const trade of group) {
      const rowEntryQuantity = requireFiniteNumber(trade.entryOrderQuantity, `P0 ${key} row ${trade.tradeNumber} entryOrderQuantity`);
      assertClose(rowEntryQuantity, originalQuantity, `P0 ${key} row ${trade.tradeNumber} entry quantity drift`);

      const beforeExit = requireFiniteNumber(trade.remainingOrderQuantityBeforeExit, `P0 ${key} row ${trade.tradeNumber} remainingOrderQuantityBeforeExit`);
      assertClose(beforeExit, remainingQuantity, `P0 ${key} row ${trade.tradeNumber} remaining quantity before exit`);

      const closedQuantity = requireFiniteNumber(
        trade.closedOrderQuantity ?? trade.exitOrderQuantity,
        `P0 ${key} row ${trade.tradeNumber} closedOrderQuantity`
      );
      assert(closedQuantity > 0, `P0 ${key} row ${trade.tradeNumber} closedOrderQuantity must be positive`);
      assert(
        closedQuantity <= remainingQuantity + 1e-8,
        `P0 ${key} row ${trade.tradeNumber} closes more quantity than remains: closed=${closedQuantity}, remaining=${remainingQuantity}`
      );

      const exitQuantity = requireFiniteNumber(trade.exitOrderQuantity, `P0 ${key} row ${trade.tradeNumber} exitOrderQuantity`);
      assertClose(exitQuantity, closedQuantity, `P0 ${key} row ${trade.tradeNumber} exit quantity mismatch`);

      const size = requireFiniteNumber(trade.size, `P0 ${key} row ${trade.tradeNumber} size`);
      assert(size > 0, `P0 ${key} row ${trade.tradeNumber} size must be positive`);
      assertClose(size, entryPrice * closedQuantity, `P0 ${key} row ${trade.tradeNumber} closed notional`, 1e-6);

      const exitPrice = requireFiniteNumber(trade.exitPrice, `P0 ${key} row ${trade.tradeNumber} exitPrice`);
      assert(exitPrice > 0, `P0 ${key} row ${trade.tradeNumber} exitPrice must be positive`);
      const expectedRawPnl = (direction === 'long' || direction === 'buy')
        ? (exitPrice - entryPrice) * closedQuantity
        : (entryPrice - exitPrice) * closedQuantity;
      const rawPnl = requireFiniteNumber(trade.rawPnlDollars, `P0 ${key} row ${trade.tradeNumber} rawPnlDollars`);
      assertClose(rawPnl, expectedRawPnl, `P0 ${key} row ${trade.tradeNumber} raw PnL`, 1e-6);

      const fees = requireFiniteNumber(trade.feesDollars, `P0 ${key} row ${trade.tradeNumber} feesDollars`);
      assert(fees >= 0, `P0 ${key} row ${trade.tradeNumber} feesDollars must be non-negative`);
      const netPnl = requireFiniteNumber(trade.netPnlDollars, `P0 ${key} row ${trade.tradeNumber} netPnlDollars`);
      assertClose(netPnl, rawPnl - fees, `P0 ${key} row ${trade.tradeNumber} net PnL`, 1e-6);

      const pnlPerShare = requireFiniteNumber(trade.pnlPerShare, `P0 ${key} row ${trade.tradeNumber} pnlPerShare`);
      assertClose(pnlPerShare, netPnl / closedQuantity, `P0 ${key} row ${trade.tradeNumber} PnL per share`, 1e-6);

      const balanceBefore = requireFiniteNumber(trade.balanceBefore, `P0 ${key} row ${trade.tradeNumber} balanceBefore`);
      const balanceAfter = requireFiniteNumber(trade.balanceAfter, `P0 ${key} row ${trade.tradeNumber} balanceAfter`);
      assertClose(balanceAfter - balanceBefore, netPnl, `P0 ${key} row ${trade.tradeNumber} balance delta`, 1e-6);

      remainingQuantity -= closedQuantity;
      if (Math.abs(remainingQuantity) <= 1e-8) {
        remainingQuantity = 0;
      }
    }

    assertClose(remainingQuantity, 0, `P0 ${key} final remaining quantity`, 1e-8);
  }
}

function assertP0TieredExitAccounting(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const trades = Array.isArray(report.trades) ? report.trades : [];
  assert(trades.length > 0, 'P0 report must contain trades for accounting validation');

  const groups = new Map();
  const entryScopes = new Map();
  for (const trade of trades) {
    const key = tradeGroupKey(trade);
    const group = groups.get(key) || { size: 0, tiers: new Map() };
    const size = Number(trade.size);
    assert(Number.isFinite(size) && size > 0, `P0 report trade has invalid size ${trade.size}`);
    group.size += size;

    const exitReason = normalizedExitReason(trade.exitReason);
    assert(exitReason, `P0 report trade missing exitReason for ${key}`);
    if (exitReason.includes('tier') && !Object.prototype.hasOwnProperty.call(P0_TIER_FRACTION_CAPS, exitReason)) {
      throw new Error(`P0 report trade has unrecognized tier exitReason ${JSON.stringify(trade.exitReason)} for ${key}`);
    }
    if (Object.prototype.hasOwnProperty.call(P0_TIER_FRACTION_CAPS, exitReason)) {
      group.tiers.set(exitReason, (group.tiers.get(exitReason) || 0) + size);
    }
    groups.set(key, group);

    const entryIdentityKey = tradeEntryIdentityKey(trade);
    const scopes = entryScopes.get(entryIdentityKey) || new Set();
    scopes.add(tradeRuntimeScopeKey(trade));
    entryScopes.set(entryIdentityKey, scopes);
  }

  for (const [entryIdentityKey, scopes] of entryScopes.entries()) {
    assert.strictEqual(
      scopes.size,
      1,
      `P0 report entry identity split across runtime scopes for ${entryIdentityKey}: ${Array.from(scopes).join(', ')}`
    );
  }

  for (const [key, group] of groups.entries()) {
    if (group.tiers.size === 0) continue;
    for (const [tier, tierSize] of group.tiers.entries()) {
      const cap = P0_TIER_FRACTION_CAPS[tier];
      const fraction = tierSize / group.size;
      assert(
        fraction <= cap + 1e-10,
        `P0 tiered exit over-credited ${tier} for ${key}: tierSize=${tierSize}, groupSize=${group.size}, fraction=${fraction}, cap=${cap}`
      );
    }
  }
}

function assertP0LongOnlyNoShortArtifacts(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const trades = Array.isArray(report.trades) ? report.trades : [];
  assert(trades.length > 0, 'P0 report must contain trades for direction validation');

  const nonLongTrades = trades.filter((trade) => {
    const direction = String(trade.direction || '').trim().toLowerCase();
    return direction !== 'long';
  });
  assert.strictEqual(
    nonLongTrades.length,
    0,
    `P0 long_only/ENABLE_SHORTS=false report contained ${nonLongTrades.length} non-long trade direction(s)`
  );

  const shortActions = trades.filter((trade) => {
    const action = String(trade.action || trade.entryAction || '').trim().toUpperCase();
    const side = String(trade.side || trade.entrySide || '').trim().toLowerCase();
    return action === 'SELL_SHORT' || side === 'short';
  });
  assert.strictEqual(
    shortActions.length,
    0,
    `P0 long_only/ENABLE_SHORTS=false report contained ${shortActions.length} short action/side marker(s)`
  );

  const flipExits = trades.filter((trade) => normalizedExitReason(trade.exitReason || trade.reason).includes('flip'));
  assert.strictEqual(
    flipExits.length,
    0,
    `P0 long_only/ENABLE_SHORTS=false report contained ${flipExits.length} flip exit(s)`
  );
}

const GATES = [
  {
    id: 'eval.live.posture_config',
    layer: 'eval',
    description: 'Eval-live posture requires explicit Alpaca stock live config, TTP enforcement, flat persisted state, and flat broker exposure.',
    run: (context = {}) => assertEvalLiveReadiness(
      context.evalSourceEnv || process.env,
      context.evalOptions || {}
    )
  },
  {
    id: P0_GATE_ID,
    layer: 'p0',
    description: 'Canonical TSLA 2-year EMASMACrossover single-lane regression anchor.',
    run: async () => {
      const { runP0 } = loadRuntime();
      const result = runP0('full', 'multi-runtime-gate');
      assertP0LedgerConservation(result.report);
      assertP0TieredExitAccounting(result.report);
      assertP0LongOnlyNoShortArtifacts(result.report);
      assertP0Summary(result.summary);
      return {
        summary: result.summary,
        log: result.log,
        report: result.report,
        reportMtimeMs: result.reportMtimeMs,
        runSpec: result.runSpec,
        tuningProfile: result.tuningProfile,
        workerEnv: result.workerEnv
      };
    }
  },
  {
    id: 'scope.state_manager.dashboard_positions',
    layer: 'scope',
    description: 'StateManager projects every active trade as a scoped dashboard position without selected-chart inference.',
    run: () => withQuietConsole(async () => {
      resetStateManager();
      const sm = stateManager();
      const tslaLong = makeTrade({
        orderId: 'tsla-long',
        symbol: 'TSLA',
        accountId: 'acct-main',
        action: 'BUY',
        side: 'long',
        entryPrice: 200,
        sizeUsd: 1000
      });
      const btcDefaultAccount = makeTrade({
        orderId: 'btc-default',
        symbol: 'BTC-USD',
        brokerId: 'kraken',
        accountId: 'default',
        accountIdSource: 'default',
        assetClass: 'crypto',
        executionMode: 'paper',
        timeframe: '15m',
        action: 'BUY',
        side: 'long',
        entryPrice: 50000,
        sizeUsd: 500
      });

      addTrades(tslaLong, btcDefaultAccount);
      sm.state.lastPrices.set('TSLA', 210);
      sm.state.lastPrices.set('BTC-USD', 51000);

      const positions = sm._buildScopedDashboardPositions(sm.state);
      const tsla = positions.find((p) => p.tradeId === 'tsla-long');
      const btc = positions.find((p) => p.tradeId === 'btc-default');

      assert.strictEqual(positions.length, 2, 'dashboard projection must expose both scoped trades');
      assert(tsla, 'TSLA position missing from dashboard projection');
      assert(btc, 'BTC default-account position missing from dashboard projection');
      assert.strictEqual(tsla.scopeComplete, true, 'explicit TSLA account scope should be complete');
      assert.strictEqual(tsla.symbol, 'TSLA', 'TSLA symbol should stay TSLA');
      assert.strictEqual(tsla.brokerId, 'alpaca', 'TSLA broker should stay alpaca');
      assert.strictEqual(tsla.accountId, 'acct-main', 'TSLA account should stay acct-main');
      assert.strictEqual(tsla.side, 'long', 'TSLA long side should stay long');
      assert.strictEqual(btc.scopeComplete, false, 'default account must not be promoted to complete scope');
      assert.strictEqual(btc.accountIdSource, 'default', 'default account source must stay visible');

      return { projectedPositions: positions.length };
    })
  },
  {
    id: 'scope.candle_ingress.scope_contract',
    layer: 'scope',
    description: 'CandleProcessor accepts only scoped candles and rejects missing symbol/timeframe before storage or strategy ingestion.',
    run: () => withQuietConsole(async () => {
      const CandleProcessor = require('../../core/CandleProcessor');

      function makeSymCtx(symbol) {
        return {
          symbol,
          indicatorEngine: { updateCandle: () => {} },
          emaCrossover: null,
          maDynamicSR: null,
          volumeProfile: null,
          priceHistory: [],
          marketData: null
        };
      }

      function makeCtx() {
        const calls = [];
        return {
          calls,
          symbolContexts: new Map([['BTC-USD', makeSymCtx('BTC-USD')]]),
          tradingPair: 'BTC-USD',
          candleTimeframe: '1m',
          _candleStore: {
            addCandle: (...args) => calls.push(args)
          },
          priceHistory: [],
          indicatorEngine: { updateCandle: () => {} },
          mtfAdapter: null,
          emaCrossover: null,
          maDynamicSR: null,
          liquiditySweep: null,
          volumeProfile: null,
          candleSaveCounter: 0,
          saveCandleHistory: () => {},
          config: {
            enableBacktestMode: true,
            brokerId: 'kraken',
            accountId: 'acct-1',
            assetClass: 'crypto',
            executionMode: 'backtest',
            timeframe: '1m',
            evalTraceEnabled: true,
            evalTraceBacktest: true
          },
          dashboardWsConnected: false,
          dashboardWs: null,
          getCandlesForTimeframe: () => [],
          broadcastEdgeAnalytics: () => {}
        };
      }

      function candle(overrides = {}) {
        return {
          symbol: 'BTC-USD',
          timeframe: '1m',
          t: 1779440400000,
          etime: 1779440460000,
          o: 100,
          h: 101,
          l: 99,
          c: 100.5,
          v: 42,
          ...overrides
        };
      }

      const scopedCtx = makeCtx();
      const scopedProcessor = new CandleProcessor(scopedCtx);
      scopedProcessor.processNewCandle(candle({ symbol: 'XBT/USD' }), {
        traceId: 'gate_candle_scoped',
        source: 'gate'
      });
      assert.strictEqual(scopedCtx.calls.length, 1, 'scoped candle should be stored exactly once');
      const stored = scopedCtx.calls[0][2];
      assert.strictEqual(scopedCtx.calls[0][0], 'BTC-USD', 'candleStore symbol should be normalized');
      assert.strictEqual(stored.symbol, 'BTC-USD', 'accepted candle must carry normalized symbol');
      assert.strictEqual(stored.brokerId, 'kraken', 'accepted candle must carry brokerId');
      assert.strictEqual(stored.accountId, 'acct-1', 'accepted candle must carry accountId');
      assert.strictEqual(stored.assetClass, 'crypto', 'accepted candle must carry assetClass');
      assert.strictEqual(stored.executionMode, 'backtest', 'accepted candle must carry executionMode');
      assert.strictEqual(stored.timeframe, '1m', 'accepted candle must carry timeframe');
      assert.strictEqual(stored.scopeKey, 'backtest:kraken:acct-1:crypto:BTC-USD:1m', 'accepted candle must carry scopeKey');

      const missingSymbolCtx = makeCtx();
      assert.throws(
        () => new CandleProcessor(missingSymbolCtx).processNewCandle(candle({ symbol: undefined }), {
          traceId: 'gate_candle_missing_symbol',
          source: 'gate'
        }),
        /missing immutable candle scope field\(s\): symbol/,
        'missing symbol must reject before storage'
      );
      assert.strictEqual(missingSymbolCtx.calls.length, 0, 'missing-symbol candle must not reach candleStore');

      const missingTimeframeCtx = makeCtx();
      assert.throws(
        () => new CandleProcessor(missingTimeframeCtx).processNewCandle(candle({ timeframe: undefined }), {
          traceId: 'gate_candle_missing_timeframe',
          source: 'gate'
        }),
        /missing immutable candle scope field\(s\): timeframe/,
        'missing timeframe must reject before storage'
      );
      assert.strictEqual(missingTimeframeCtx.calls.length, 0, 'missing-timeframe candle must not reach candleStore');

      const legacyArrayCtx = makeCtx();
      new CandleProcessor(legacyArrayCtx).handleMarketData(
        [1779440400, 1779440460, 100, 101, 99, 100.5, 100.5, 42, 1],
        { traceId: 'gate_candle_legacy_array' }
      );
      const legacyStored = legacyArrayCtx.calls[0][2];
      assert.strictEqual(legacyStored.symbolSource, 'ctx.tradingPair', 'legacy array path must name runtime symbol source');
      assert.strictEqual(legacyStored.scopeKey, 'backtest:kraken:acct-1:crypto:BTC-USD:1m', 'legacy array path must carry scopeKey');

      const backfillCtx = makeCtx();
      const backfillProcessor = new CandleProcessor(backfillCtx);
      assert.throws(
        () => backfillProcessor.handleBackfillSuccess(
          [[1779440400000, 1779440460000, 100, 101, 99, 100.5, 100.5, 42, 1]],
          { traceId: 'gate_backfill_missing_scope', symbol: 'BTC-USD', timeframe: '1m' }
        ),
        /missing immutable candle scope field\(s\): brokerId, accountId, assetClass, executionMode/,
        'gap backfill replay must reject missing broker/account/asset/mode scope'
      );
      assert.strictEqual(backfillCtx.calls.length, 0, 'missing replay scope must not reach candleStore');

      return {
        scopedKey: stored.scopeKey,
        rejectionPaths: 3,
        legacyArrayKey: legacyStored.scopeKey
      };
    })
  },
  {
    id: 'scope.state_manager.open_position_scope_contract',
    layer: 'scope',
    description: 'StateManager openPosition rejects incomplete or stale scope before active trade mutation.',
    run: () => withQuietConsole(async () => {
      resetStateManager();
      const sm = stateManager();
      const requiredFields = ['symbol', 'brokerId', 'assetClass', 'executionMode', 'timeframe'];
      let rejectionCount = 0;

      for (const field of requiredFields) {
        const beforePositions = sm._buildScopedDashboardPositions(sm.state);
        const result = await sm.openPosition(500, 100, scopeInput({
          orderId: `gate-missing-${field}`,
          [field]: null
        }));

        assert.strictEqual(result.success, false, `missing ${field} must reject`);
        assert.strictEqual(result.scopeRejected, true, `missing ${field} must be marked scopeRejected`);
        assert(result.missingFields.includes(field), `missing ${field} must be named in missingFields`);
        assert.strictEqual(sm.state.activeTrades.size, 0, `missing ${field} must not add activeTrades`);
        assert.strictEqual(sm.state.position, 0, `missing ${field} must not mutate scalar position`);
        assert.deepStrictEqual(
          sm._buildScopedDashboardPositions(sm.state),
          beforePositions,
          `missing ${field} must not mutate dashboard projection`
        );
        rejectionCount += 1;
      }

      const staleScopeResult = await sm.openPosition(500, 100, scopeInput({
        orderId: 'gate-stale-scope',
        scopeKey: 'paper:alpaca:acct-main:stocks:SPY:15m'
      }));
      assert.strictEqual(staleScopeResult.success, false, 'stale supplied scopeKey must reject');
      assert.strictEqual(staleScopeResult.scopeRejected, true, 'stale supplied scopeKey must be marked scopeRejected');
      assert.strictEqual(
        staleScopeResult.expectedScopeKey,
        'paper:alpaca:acct-main:stocks:TSLA:15m',
        'stale supplied scopeKey rejection must expose derived expected scope'
      );
      assert.strictEqual(sm.state.activeTrades.size, 0, 'stale supplied scopeKey must not add activeTrades');
      rejectionCount += 1;

      const accepted = await sm.openPosition(500, 100, scopeInput({
        orderId: 'gate-scoped-open',
        scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m'
      }));
      assert.strictEqual(accepted.success, true, 'fully scoped openPosition should accept');
      const trade = sm.state.activeTrades.get('gate-scoped-open');
      assert(trade, 'accepted scoped trade must be stored');
      assert.strictEqual(trade.scopeKey, 'paper:alpaca:acct-main:stocks:TSLA:15m', 'accepted trade must store derived scopeKey');
      assert.strictEqual(trade.scopeKeyVersion, 2, 'accepted trade must store scopeKeyVersion 2');

      return {
        rejections: rejectionCount,
        acceptedScopeKey: trade.scopeKey
      };
    })
  },
  {
    id: 'scope.backtest_report.scope_contract',
    layer: 'scope',
    description: 'BacktestRecorder and BacktestRunner reject unscoped report rows before recorder or report mutation.',
    run: () => withQuietConsole(async () => {
      const BacktestRecorder = require('../../core/BacktestRecorder');
      const BacktestRunner = require('../../core/BacktestRunner');
      const recorder = new BacktestRecorder({ startingBalance: 10000, feePerSide: 0 });

      const accepted = recorder.recordTrade(makeBacktestTrade());
      assert.strictEqual(accepted.symbol, 'TSLA', 'recorded trade must carry symbol');
      assert.strictEqual(accepted.brokerId, 'alpaca', 'recorded trade must carry brokerId');
      assert.strictEqual(accepted.accountId, 'acct-main', 'recorded trade must carry accountId');
      assert.strictEqual(accepted.assetClass, 'stocks', 'recorded trade must carry assetClass');
      assert.strictEqual(accepted.executionMode, 'backtest', 'recorded trade must carry executionMode');
      assert.strictEqual(accepted.timeframe, '15m', 'recorded trade must carry timeframe');
      assert.strictEqual(
        accepted.scopeKey,
        'backtest:alpaca:acct-main:stocks:TSLA:15m',
        'recorded trade must carry derived scopeKey'
      );
      assert.strictEqual(accepted.scopeKeyVersion, 2, 'recorded trade must carry scopeKeyVersion 2');
      assert.strictEqual(accepted.scopeComplete, true, 'explicit account backtest row must be scope complete');
      assert.strictEqual(recorder.trades.length, 1, 'accepted scoped row must mutate recorder exactly once');

      const missingRecorder = new BacktestRecorder({ startingBalance: 10000, feePerSide: 0 });
      assert.throws(
        () => missingRecorder.recordTrade(makeBacktestTrade({ brokerId: null })),
        /missing immutable backtest trade scope field\(s\): brokerId/,
        'missing brokerId must reject before recorder mutation'
      );
      assert.strictEqual(missingRecorder.trades.length, 0, 'missing brokerId must not append a trade row');
      assert.strictEqual(missingRecorder.balance, 10000, 'missing brokerId must not mutate balance');

      const staleScopeRecorder = new BacktestRecorder({ startingBalance: 10000, feePerSide: 0 });
      assert.throws(
        () => staleScopeRecorder.recordTrade(makeBacktestTrade({
          scopeKey: 'backtest:alpaca:acct-main:stocks:SPY:15m'
        })),
        /scopeKey mismatch/,
        'stale supplied scopeKey must reject before recorder mutation'
      );
      assert.strictEqual(staleScopeRecorder.trades.length, 0, 'stale supplied scopeKey must not append a trade row');
      assert.strictEqual(staleScopeRecorder.balance, 10000, 'stale supplied scopeKey must not mutate balance');

      const runner = new BacktestRunner({});
      assert.throws(
        () => runner.assertScopedReportTrades([
          makeBacktestTrade(),
          makeBacktestTrade({ timeframe: null })
        ]),
        /BacktestRunner\.report trades\[1\] missing immutable backtest trade scope field\(s\): timeframe/,
        'BacktestRunner must reject unscoped rows before report write'
      );

      return {
        acceptedScopeKey: accepted.scopeKey,
        rejectedRows: 3
      };
    })
  },
  {
    id: 'scope.pattern_memory.scope_isolation',
    layer: 'scope',
    description: 'Pattern memory public APIs require compatible immutable scope and reject unscoped learned-state paths.',
    run: () => withQuietConsole(async () => {
      const { UnifiedPatternMemory, computeSignature } = require('../../core/UnifiedPatternMemory');
      const PatternMemoryBank = require('../../core/PatternMemoryBank');
      const previousEnv = {
        BACKTEST_MODE: process.env.BACKTEST_MODE,
        CANDLE_DATA_FILE: process.env.CANDLE_DATA_FILE,
        BACKTEST_NO_PATTERN_SAVE: process.env.BACKTEST_NO_PATTERN_SAVE,
        DATA_DIR: process.env.DATA_DIR
      };
      process.env.BACKTEST_MODE = 'true';
      process.env.CANDLE_DATA_FILE = 'tuning/tsla-15m-18mo.json';
      process.env.BACKTEST_NO_PATTERN_SAVE = 'true';
      process.env.DATA_DIR = path.join(os.tmpdir(), `pattern-bank-gate-root-${Date.now()}`);

      try {
        const features = patternFeatures();
        const memory = new UnifiedPatternMemory({
          persistToDisk: false,
          minSamples: 1,
          successThreshold: 0.6
        });

        assert.strictEqual(memory.recordOutcome(features, {
          ...patternScope(),
          pnl: 12,
          pnlPercent: 2.4,
          holdTimeMs: 900000,
          exitReason: 'take_profit',
          strategy: 'GateStrategy'
        }), true, 'scoped UnifiedPatternMemory outcome should record');

        const sameScope = memory.getConfidence(features, patternScope());
        assert(sameScope, 'same-scope pattern read must return learned result');
        assert.strictEqual(sameScope.source, 'learned_success', 'same-scope read should preserve learned success');
        assert.strictEqual(
          sameScope.stats.scopeKey,
          'backtest:alpaca:acct-main:stocks:TSLA:15m',
          'same-scope read must return the scoped row'
        );
        assert.strictEqual(memory.getConfidence(features), null, 'missing-scope read must not fall back to global memory');
        assert.strictEqual(memory.recordObservation(features, patternScope({ timeframe: null })), null, 'missing-scope observation must reject');
        assert.strictEqual(Object.keys(memory.patterns).length, 1, 'missing-scope observation must not mutate patterns');
        assert.strictEqual(memory.recordObservation(features, patternScope({
          scopeKey: 'backtest:alpaca:acct-main:stocks:SPY:15m'
        })), null, 'mismatched-scopeKey observation must reject');
        assert.strictEqual(Object.keys(memory.patterns).length, 1, 'mismatched-scopeKey observation must not mutate patterns');
        assert.strictEqual(memory.getConfidence(features, patternScope({
          scopeKey: 'backtest:alpaca:acct-main:stocks:SPY:15m'
        })), null, 'mismatched-scopeKey read must reject');

        memory.patterns[computeSignature(features)] = {
          signature: computeSignature(features),
          features: [...features],
          status: 'promoted',
          timesSeen: 1,
          wins: 10,
          losses: 0,
          totalPnL: 10,
          winRate: 1,
          avgPnL: 1,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          lastOutcome: Date.now(),
          outcomes: [{ timestamp: Date.now(), pnl: 1, isWin: true }]
        };
        assert.strictEqual(
          memory.getConfidence(features, patternScope()).stats.scopeKey,
          'backtest:alpaca:acct-main:stocks:TSLA:15m',
          'legacy unscoped exact key must not satisfy scoped reads'
        );

        assert.strictEqual(memory.getConfidence(features, patternScope({
          symbol: 'BTC-USD',
          brokerId: 'kraken',
          assetClass: 'crypto',
          timeframe: '1m',
          scopeKey: 'backtest:kraken:acct-main:crypto:BTC-USD:1m'
        })), null, 'cross-asset/timeframe read must return null');

        assert.throws(
          () => new PatternMemoryBank({
            featureFlags: {
              PATTERN_MEMORY_PARTITION: {
                settings: { backtestPersist: false }
              }
            }
          }),
          /PatternMemoryBank\.constructor missing immutable pattern scope field\(s\)/,
          'PatternMemoryBank must refuse unscoped learned-state path'
        );

        assert.throws(
          () => new PatternMemoryBank({
            ...patternScope(),
            dbPath: path.join(os.tmpdir(), `pattern-bank-gate-outside-${Date.now()}.json`),
            featureFlags: {
              PATTERN_MEMORY_PARTITION: {
                settings: { backtestPersist: false }
              }
            }
          }),
          /PatternMemoryBank\.dbPath resolves outside learned-state root/,
          'PatternMemoryBank must refuse caller paths outside learned-state root'
        );

        assert.throws(
          () => new PatternMemoryBank({
            ...patternScope(),
            dbPath: path.join(process.env.DATA_DIR, '..', `pattern-bank-gate-escaped-${Date.now()}.json`),
            featureFlags: {
              PATTERN_MEMORY_PARTITION: {
                settings: { backtestPersist: false }
              }
            }
          }),
          /PatternMemoryBank\.dbPath resolves outside learned-state root/,
          'PatternMemoryBank must refuse dbPath traversal through learned-state root'
        );

        assert.throws(
          () => new PatternMemoryBank({
            ...patternScope(),
            featureFlags: {
              PATTERN_MEMORY_PARTITION: {
                settings: {
                  backtest: '../escaped-patterns.json',
                  backtestPersist: false
                }
              }
            }
          }),
          /PatternMemoryBank\.memoryFile resolves outside learned-state root/,
          'PatternMemoryBank must refuse partition filenames outside learned-state root'
        );

        const bank = new PatternMemoryBank({
          ...patternScope(),
          dbPath: path.join(process.env.DATA_DIR, `pattern-bank-gate-${Date.now()}.json`),
          featureFlags: {
            PATTERN_MEMORY_PARTITION: {
              settings: { backtestPersist: false }
            }
          }
        });
        assert(
          bank.dbPath.endsWith('.backtest.alpaca.acct-main.stocks.TSLA.15m.json'),
          'PatternMemoryBank dbPath must retain immutable scope suffix'
        );
        const tslaPattern = bank.extractPattern(patternBankTrade());
        const btcPattern = bank.extractPattern(patternBankTrade(patternScope({
          symbol: 'BTC-USD',
          brokerId: 'kraken',
          assetClass: 'crypto',
          timeframe: '1m',
          scopeKey: 'backtest:kraken:acct-main:crypto:BTC-USD:1m'
        })));
        assert.notStrictEqual(tslaPattern.hash, btcPattern.hash, 'PatternMemoryBank hashes must differ across scope');

        assert.strictEqual(
          bank.recordTradeOutcome(patternBankTrade()),
          true,
          'scoped PatternMemoryBank trade should return true after recording'
        );
        const records = Object.values(bank.exportMemory().patterns);
        assert.strictEqual(records.length, 1, 'scoped PatternMemoryBank trade should record exactly one row');
        assert.strictEqual(records[0].scopeKey, 'backtest:alpaca:acct-main:stocks:TSLA:15m', 'PatternMemoryBank row must carry scopeKey');
        const publicSnapshot = bank.memory;
        const publicPatternHash = Object.keys(publicSnapshot.patterns)[0];
        publicSnapshot.patterns[publicPatternHash].scopeKey = 'corrupted';
        publicSnapshot.patterns.injected = { scopeKey: 'unscoped' };
        assert.strictEqual(
          Object.values(bank.exportMemory().patterns)[0].scopeKey,
          'backtest:alpaca:acct-main:stocks:TSLA:15m',
          'PatternMemoryBank public memory snapshot must not mutate stored scope'
        );
        assert.strictEqual(
          bank.exportMemory().patterns.injected,
          undefined,
          'PatternMemoryBank public memory snapshot must not inject rows'
        );
        assert.throws(
          () => bank.importMemory(publicSnapshot),
          /PatternMemoryBank\.validateMemoryStructure pattern .* immutable scope field/,
          'PatternMemoryBank import must reject corrupted public snapshots'
        );
        assert.strictEqual(
          Object.values(bank.exportMemory().patterns)[0].scopeKey,
          'backtest:alpaca:acct-main:stocks:TSLA:15m',
          'rejected PatternMemoryBank import must not mutate stored scope'
        );
        assert.strictEqual(
          bank.exportMemory().patterns.injected,
          undefined,
          'rejected PatternMemoryBank import must not inject rows'
        );
        const forgedMemory = bank.exportMemory();
        forgedMemory.patterns[publicPatternHash].sampleCount = 99;
        assert.throws(
          () => bank.importMemory(forgedMemory),
          /PatternMemoryBank\.validateMemoryStructure pattern .* inconsistent outcome counters/,
          'PatternMemoryBank import must reject fake-but-scope-valid counters'
        );
        assert.strictEqual(
          Object.values(bank.exportMemory().patterns)[0].sampleCount,
          1,
          'rejected PatternMemoryBank counter import must not mutate stored counters'
        );
        assert.throws(
          () => {
            bank.memory = bank.createEmptyMemory();
          },
          /PatternMemoryBank\.memory is read-only/,
          'PatternMemoryBank memory assignment must be rejected'
        );
        bank.writeOutcomeTelemetry = () => false;
        assert.strictEqual(
          bank.recordTradeOutcome(patternBankTrade({
            id: 'trade-telemetry-fail',
            timestamp: 1779802800000
          })),
          true,
          'PatternMemoryBank telemetry failure should not redefine memory durability success'
        );
        assert.strictEqual(Object.values(bank.exportMemory().patterns).length, 1, 'telemetry failure must not create extra PatternMemoryBank rows');
        assert.strictEqual(
          bank.recordTradeOutcome(patternBankTrade({ brokerId: null })),
          false,
          'missing-scope PatternMemoryBank trade should return false'
        );
        assert.strictEqual(Object.values(bank.exportMemory().patterns).length, 1, 'missing-scope PatternMemoryBank trade must not mutate');
        assert.strictEqual(
          bank.recordTradeOutcome(patternBankTrade({
            scopeKey: 'backtest:alpaca:acct-main:stocks:SPY:15m'
          })),
          false,
          'mismatched-scopeKey PatternMemoryBank trade should return false'
        );
        assert.strictEqual(Object.values(bank.exportMemory().patterns).length, 1, 'mismatched-scopeKey PatternMemoryBank trade must not mutate');
        assert.strictEqual(
          bank.recordTradeOutcome(patternBankTrade({ indicators: null })),
          false,
          'invalid PatternMemoryBank trade should return false'
        );
        assert.strictEqual(Object.values(bank.exportMemory().patterns).length, 1, 'invalid PatternMemoryBank trade must not mutate');
        const beforeDurabilityFailure = Object.values(bank.exportMemory().patterns)[0];
        bank.persistenceEnabled = true;
        bank.saveMemory = () => false;
        assert.strictEqual(
          bank.recordTradeOutcome(patternBankTrade({
            id: 'trade-save-fail',
            profitLoss: 50,
            profitLossPercent: 5,
            timestamp: 1779803100000
          })),
          false,
          'non-durable PatternMemoryBank trade should return false'
        );
        const afterDurabilityFailure = Object.values(bank.exportMemory().patterns)[0];
        assert.strictEqual(Object.values(bank.exportMemory().patterns).length, 1, 'non-durable PatternMemoryBank trade must not add rows');
        assert.strictEqual(
          afterDurabilityFailure.sampleCount,
          beforeDurabilityFailure.sampleCount,
          'non-durable PatternMemoryBank trade must roll back in-memory counters'
        );
        const beforeImportFailure = bank.exportMemory();
        const importedMemory = bank.createEmptyMemory();
        importedMemory.patterns.imported = {
          ...beforeDurabilityFailure,
          name: 'imported-pattern'
        };
        assert.strictEqual(bank.importMemory(importedMemory), false, 'non-durable PatternMemoryBank import should return false');
        assert.deepStrictEqual(bank.exportMemory(), beforeImportFailure, 'non-durable PatternMemoryBank import must roll back memory');
        const patternHash = Object.keys(bank.exportMemory().patterns)[0];
        bank.saveMemory = () => true;
        const pruneSetup = bank.exportMemory();
        pruneSetup.patterns[patternHash].status = 'DEAD';
        assert.strictEqual(bank.importMemory(pruneSetup), true, 'PatternMemoryBank prune setup should import');
        bank.saveMemory = () => false;
        const beforePruneFailure = bank.exportMemory();
        assert.strictEqual(bank.pruneOldPatterns(), 0, 'non-durable PatternMemoryBank prune should return zero');
        assert.deepStrictEqual(bank.exportMemory(), beforePruneFailure, 'non-durable PatternMemoryBank prune must roll back memory');
        assert.strictEqual(bank.reset(), false, 'non-durable PatternMemoryBank reset should return false');
        assert.deepStrictEqual(bank.exportMemory(), beforePruneFailure, 'non-durable PatternMemoryBank reset must roll back memory');

        return {
          unifiedScopeKey: sameScope.stats.scopeKey,
          patternBankHashDiff: true
        };
      } finally {
        for (const [key, value] of Object.entries(previousEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    })
  },
  {
    id: 'scope.order_executor.dashboard_trade_payload',
    layer: 'scope',
    description: 'OrderExecutor trade broadcasts carry scoped trade identity and cannot be spoofed by loose payload fields.',
    run: () => withQuietConsole(async () => {
      resetStateManager();
      const { OrderExecutor } = loadRuntime();
      const trade = makeTrade({
        orderId: 'tsla-long',
        symbol: 'TSLA',
        accountId: 'acct-main',
        action: 'BUY',
        side: 'long',
        entryStrategy: 'Strategy-G',
        exitReason: 'target_hit'
      });
      const otherBrokerTrade = makeTrade({
        orderId: 'tsla-ibkr',
        symbol: 'TSLA',
        brokerId: 'ibkr',
        accountId: 'acct-alt',
        action: 'BUY',
        side: 'long'
      });
      const defaultAccountTrade = makeTrade({
        orderId: 'tsla-default',
        symbol: 'TSLA',
        accountId: 'default',
        accountIdSource: 'default',
        action: 'BUY',
        side: 'long'
      });

      addTrades(trade, otherBrokerTrade, defaultAccountTrade);
      const executor = new OrderExecutor({
        config: {
          brokerId: 'alpaca',
          accountId: 'acct-main',
          assetClass: 'stocks',
          executionMode: 'paper',
          timeframe: '15m'
        }
      });

      const payload = executor._dashboardTradePayload({
        type: 'price',
        action: 'SELL',
        direction: 'long',
        symbol: 'SPY',
        orderId: 'fake-order',
        price: 200,
        strategy: 'SpoofedStrategy',
        exitReason: 'spoofed_reason'
      }, trade);

      assert.strictEqual(payload.type, 'trade', 'dashboard helper must own payload type');
      assert.strictEqual(payload.tradeId, 'tsla-long', 'payload tradeId must come from trade record');
      assert.strictEqual(payload.orderId, 'tsla-long', 'payload orderId must come from trade record');
      assert.strictEqual(payload.symbol, 'TSLA', 'trade symbol must override loose payload symbol');
      assert.strictEqual(payload.brokerId, 'alpaca', 'brokerId must be carried');
      assert.strictEqual(payload.accountId, 'acct-main', 'accountId must be carried');
      assert.strictEqual(payload.scopeComplete, true, 'explicit account trade payload must be complete');
      assert.strictEqual(payload.exitReason, 'target_hit', 'exitReason must be carried from trade record, not loose payload');
      assert.strictEqual(payload.strategy, 'Strategy-G', 'strategy must be carried from trade record, not loose payload');
      assert.strictEqual(payload.strategyName, 'Strategy-G', 'strategyName must mirror strategy for dashboard consumers');

      const otherBrokerPayload = executor._dashboardTradePayload({
        action: 'BUY',
        symbol: 'TSLA'
      }, otherBrokerTrade);
      assert.strictEqual(otherBrokerPayload.brokerId, 'ibkr', 'trade broker must override ctx broker for same-symbol trades');
      assert.strictEqual(otherBrokerPayload.accountId, 'acct-alt', 'trade account must override ctx account for same-symbol trades');
      assert.strictEqual(otherBrokerPayload.scopeComplete, true, 'other broker/account trade payload must still be complete');

      const defaultPayload = executor._dashboardTradePayload({
        action: 'BUY',
        symbol: 'TSLA'
      }, defaultAccountTrade);
      assert.strictEqual(defaultPayload.scopeComplete, false, 'default account trade must not become complete through ctx fallback');
      assert.strictEqual(defaultPayload.accountIdSource, 'default', 'default account source must remain default');

      return {
        tradeId: payload.tradeId,
        exitReason: payload.exitReason,
        strategy: payload.strategy,
        defaultScopeComplete: defaultPayload.scopeComplete
      };
    })
  },
  {
    id: 'scope.position_tracker.close_selection',
    layer: 'scope',
    description: 'PositionTracker close selection requires tradeId or exact full scope, rejects scopeKey-only and ambiguous closes.',
    run: () => withQuietConsole(async () => {
      resetStateManager();
      const { PositionTracker } = loadRuntime();
      const tracker = new PositionTracker();
      resetStateManager();
      const sm = stateManager();

      const tslaLong = makeTrade({
        orderId: 'tsla-long',
        symbol: 'TSLA',
        action: 'BUY',
        side: 'long',
        entryTime: 1
      });
      const spyLong = makeTrade({
        orderId: 'spy-long',
        symbol: 'SPY',
        action: 'BUY',
        side: 'long',
        entryTime: 2
      });
      const tslaShort = makeTrade({
        orderId: 'tsla-short',
        symbol: 'TSLA',
        action: 'SELL_SHORT',
        side: 'short',
        entryTime: 3
      });
      const tslaOtherBrokerLong = makeTrade({
        orderId: 'tsla-ibkr-long',
        symbol: 'TSLA',
        brokerId: 'ibkr',
        accountId: 'acct-alt',
        action: 'BUY',
        side: 'long',
        entryTime: 4
      });

      addTrades(tslaLong, spyLong, tslaShort, tslaOtherBrokerLong);

      assert.strictEqual(
        tracker._selectTradeForClose({ tradeId: 'spy-long' }).trade.orderId,
        'spy-long',
        'tradeId must select the exact trade across symbols'
      );
      assert.strictEqual(
        tracker._selectTradeForClose(scopeInput({ symbol: 'TSLA', direction: 'long' })).trade.orderId,
        'tsla-long',
        'exact TSLA long scope should select TSLA long'
      );
      assert.strictEqual(
        tracker._selectTradeForClose(scopeInput({ symbol: 'TSLA', direction: 'short' })).trade.orderId,
        'tsla-short',
        'exact TSLA short scope should select TSLA short'
      );
      assert.strictEqual(
        tracker._selectTradeForClose(scopeInput({
          symbol: 'TSLA',
          brokerId: 'ibkr',
          accountId: 'acct-alt',
          direction: 'long'
        })).trade.orderId,
        'tsla-ibkr-long',
        'same-symbol other-broker scope should select the other-broker trade'
      );
      assert.match(
        tracker._selectTradeForClose({ scopeKey: tslaLong.scopeKey }).error,
        /tradeId or exact scope required/,
        'scopeKey-only close must be rejected'
      );
      assert.match(
        tracker._selectTradeForClose({ ...scopeInput({ symbol: 'TSLA' }), scopeKey: spyLong.scopeKey }).error,
        /scopeKey (does not match|mismatch)/,
        'mismatched supplied scopeKey must be rejected'
      );

      const tslaLong2 = makeTrade({
        orderId: 'tsla-long-2',
        symbol: 'TSLA',
        action: 'BUY',
        side: 'long',
        entryTime: 5
      });
      addTrades(tslaLong2);
      assert.match(
        tracker._selectTradeForClose(scopeInput({ symbol: 'TSLA', direction: 'long' })).error,
        /Ambiguous close/,
        'duplicate same-scope longs must require tradeId'
      );

      return { activeTrades: sm.state.activeTrades.size };
    })
  },
  {
    id: 'scope.position_tracker.scoped_snapshots',
    layer: 'scope',
    description: 'PositionTracker scoped reads return the requested trade and do not invent a global first position.',
    run: () => withQuietConsole(async () => {
      resetStateManager();
      const { PositionTracker } = loadRuntime();
      const tracker = new PositionTracker();
      resetStateManager();

      const tslaLong = makeTrade({
        orderId: 'tsla-long',
        symbol: 'TSLA',
        action: 'BUY',
        side: 'long',
        entryTime: 1
      });
      const spyLong = makeTrade({
        orderId: 'spy-long',
        symbol: 'SPY',
        action: 'BUY',
        side: 'long',
        entryTime: 2
      });
      addTrades(tslaLong, spyLong);

      const missing = tracker.getPositionInfo();
      assert.strictEqual(missing.hasPosition, false, 'missing scope must not return first global position');
      assert.match(missing.error, /tradeId or exact scope required/, 'missing scope should explain why no position was returned');

      const tslaInfo = tracker.getPositionInfo(scopeInput({ symbol: 'TSLA', direction: 'long' }));
      assert.strictEqual(tslaInfo.hasPosition, true, 'exact TSLA scope should return a position');
      assert.strictEqual(tslaInfo.symbol, 'TSLA', 'exact TSLA scope should return TSLA');
      assert.strictEqual(tslaInfo.scopeKey, tslaLong.scopeKey, 'exact TSLA scope should return TSLA scope key');

      const spySnapshot = tracker.getActiveTradeSnapshot(scopeInput({ symbol: 'SPY', direction: 'long' }));
      assert(spySnapshot, 'exact SPY scope should return a snapshot');
      assert.strictEqual(spySnapshot.orderId, 'spy-long', 'exact SPY scope should return SPY trade');
      assert.strictEqual(Object.isFrozen(spySnapshot), true, 'snapshot must be frozen');

      return { tslaScopeKey: tslaInfo.scopeKey, spyOrderId: spySnapshot.orderId };
    })
  },
  {
    id: 'session_router.transition_journal.state_machine',
    layer: 'session_router',
    description: 'SessionRouter writes ordered durable transition phase events and projects restart status from the journal.',
    run: () => withQuietConsole(async () => {
      const SessionRouter = require('../../core/SessionRouter');
      const tempDirs = [];
      const now = new Date('2026-05-26T14:30:00.000Z');

      function makeRouter(overrides = {}) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-router-journal-gate-'));
        tempDirs.push(dir);
        const router = new SessionRouter({
          enabled: true,
          clock: () => now.getTime(),
          stockSymbols: ['TSLA'],
          cryptoSymbols: ['BTC-USD'],
          forceCloseOnSessionEnd: false,
          transitionStoreOptions: { dir },
          ...overrides
        });
        router.stateManager = {
          state: { activeTrades: new Map(), isTrading: true },
          pauseTrading: async (reason) => {
            router.stateManager.state.isTrading = false;
            router.stateManager.state.pauseReason = reason;
            return { success: true };
          },
          resumeTrading: async () => {
            router.stateManager.state.isTrading = true;
            return { success: true };
          }
        };
        router.onOhlcCallback = () => {};
        router.krakenAdapter = {
          unsubscribeAll: () => {},
          removeAllListeners: () => {},
          subscribeToCandles: () => {},
          on: () => {}
        };
        router.alpacaAdapter = {
          unsubscribeAll: () => {},
          removeAllListeners: () => {},
          subscribeToCandles: () => {},
          on: () => {}
        };
        return router;
      }

      try {
        const successOps = [];
        const successRouter = makeRouter();
        successRouter.activeSession = 'crypto';
        const originalRecord = successRouter.transitionStore.recordTransitionEvent.bind(successRouter.transitionStore);
        successRouter.transitionStore.recordTransitionEvent = (eventName, details) => {
          successOps.push(`event:${eventName}`);
          return originalRecord(eventName, details);
        };
        successRouter.orderRouter = {
          registerBroker: () => {
            successOps.push('registerBroker');
          }
        };

        await successRouter._transitionToStocks(now);

        const successEvents = successRouter.transitionStore.readEvents();
        const successStatus = successRouter.transitionStore.readStatus();
        assert.deepStrictEqual(successEvents.map((event) => event.event), [
          'SESSION_TRANSITION_PLANNED',
          'SESSION_FREEZE_SOURCE',
          'SESSION_ORDER_INTENT_RECORDED',
          'SESSION_TARGET_ACTIVATED'
        ], 'success transition must append the ordered phase journal');
        assert(successEvents.every((event) => event.brokerId === 'alpaca'), 'every success phase must carry brokerId');
        assert(successEvents.every((event) => Array.isArray(event.symbols) && event.symbols.includes('TSLA')), 'every success phase must carry symbols');
        assert(successEvents.every((event) => event.timeframe === '15m'), 'every success phase must carry timeframe');
        assert(successOps.indexOf('event:SESSION_ORDER_INTENT_RECORDED') < successOps.indexOf('registerBroker'), 'order intent must be durable before registerBroker mutates routing');
        assert.strictEqual(successStatus.state, 'TARGET_ACTIVATED', 'success status should project target activation');
        assert.strictEqual(successStatus.activeSession, 'stocks', 'success status should project target active session');

        const failureRouter = makeRouter();
        failureRouter.activeSession = 'crypto';
        failureRouter.orderRouter = { registerBroker: () => {} };
        failureRouter.krakenAdapter.unsubscribeAll = () => {
          throw new Error('kraken unsubscribe failed');
        };

        await failureRouter._transitionToStocks(now);

        const failureEvents = failureRouter.transitionStore.readEvents();
        const failureStatus = failureRouter.transitionStore.readStatus();
        assert.deepStrictEqual(failureEvents.map((event) => event.event), [
          'SESSION_TRANSITION_PLANNED',
          'SESSION_FREEZE_SOURCE',
          'SESSION_FAILED_SAFE'
        ], 'failed transition must append failed-safe journal phase');
        assert.strictEqual(failureStatus.state, 'RECOVERY_REQUIRED', 'failed transition must project recovery required');
        assert.strictEqual(failureStatus.safeModeReason, 'kraken unsubscribe failed', 'failed status should carry failure reason');
        assert.strictEqual(failureRouter.stateManager.state.isTrading, false, 'failed transition must leave trading paused');

        const crashDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-router-journal-gate-'));
        tempDirs.push(crashDir);
        const TransitionStore = require('../../core/session-router/TransitionStore');
        const crashStore = new TransitionStore({ dir: crashDir, clock: () => now.getTime() });
        crashStore.appendEvent({
          transitionId: 'journal-only',
          epoch: 17,
          event: 'SESSION_FREEZE_SOURCE',
          from: 'crypto',
          to: 'stocks',
          brokerId: 'alpaca',
          symbols: ['TSLA'],
          timeframe: '15m',
          activeSession: 'crypto'
        });
        assert.strictEqual(crashStore.nextEpoch(), 18, 'journal-only epoch must advance nextEpoch after append-before-state crash');
        assert.strictEqual(crashStore.readStatus().state, 'FREEZING_SOURCE', 'missing state file should reconstruct latest journal phase');

        return {
          successEvents: successEvents.length,
          failureEvents: failureEvents.length,
          journalOnlyNextEpoch: crashStore.nextEpoch()
        };
      } finally {
        for (const dir of tempDirs) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
    })
  }
];

function selectedGates(argv) {
  const ids = [];
  let runEval = false;
  let runScope = false;
  let runP0Gate = false;
  let runAll = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--gate') {
      const id = argv[i + 1];
      if (!id) throw new Error('--gate requires a gate id');
      ids.push(id);
      i += 1;
    } else if (arg === '--eval') {
      runEval = true;
    } else if (arg === '--scope') {
      runScope = true;
    } else if (arg === '--p0') {
      runP0Gate = true;
    } else if (arg === '--all') {
      runAll = true;
    } else if (arg === '--pm2') {
      if (!argv[i + 1]) throw new Error('--pm2 requires a process name or id');
      i += 1;
    } else if (arg === '--list' || arg === '--write-report') {
      continue;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }

  if (runAll) return GATES;

  const selected = new Set(ids);
  if (runEval) {
    for (const gate of GATES.filter((g) => g.layer === 'eval')) selected.add(gate.id);
  }
  if (runScope) {
    for (const gate of GATES.filter((g) => g.layer === 'scope')) selected.add(gate.id);
  }
  if (runP0Gate) selected.add(P0_GATE_ID);

  if (selected.size === 0) return [];

  return Array.from(selected).map((id) => {
    const gate = GATES.find((candidate) => candidate.id === id);
    if (!gate) throw new Error(`Unknown gate id ${id}`);
    return gate;
  });
}

function pm2ProcessName(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--pm2') {
      const processName = argv[i + 1];
      if (!processName) throw new Error('--pm2 requires a process name or id');
      return processName;
    }
  }
  return null;
}

function buildGateContext(argv, gates, deps = { readPm2ProcessEnv }) {
  const processName = pm2ProcessName(argv);
  if (!processName) return {};

  if (!gates.some((gate) => gate.layer === 'eval')) {
    throw new Error('--pm2 requires --eval, --all, or --gate eval.live.posture_config');
  }

  return {
    evalSource: `pm2:${processName}`,
    evalSourceEnv: deps.readPm2ProcessEnv(processName),
    evalOptions: { loadDotenv: false }
  };
}

async function runGate(gate, context = {}) {
  const startedAt = new Date().toISOString();
  try {
    const detail = await gate.run(context);
    const resultDetail = detail || {};
    if (context.evalSource && gate.layer === 'eval') {
      resultDetail.source = context.evalSource;
    }
    return {
      id: gate.id,
      layer: gate.layer,
      status: 'PASS',
      startedAt,
      finishedAt: new Date().toISOString(),
      detail: resultDetail
    };
  } catch (err) {
    return {
      id: gate.id,
      layer: gate.layer,
      status: 'FAIL',
      startedAt,
      finishedAt: new Date().toISOString(),
      error: err && err.stack ? err.stack : String(err)
    };
  }
}

function printList() {
  for (const gate of GATES) {
    console.log(`${gate.id} [${gate.layer}] - ${gate.description}`);
  }
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function maybeWriteReport(report, deps = {}) {
  if (!report || !Array.isArray(report.gates) || report.gates.length === 0) {
    return false;
  }

  const writer = deps.writeReport || writeReport;
  const logger = deps.logger || console.log;
  writer(report);
  logger(`Report written: ${REPORT_PATH}`);
  return true;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--list') || argv.length === 0) {
    printList();
    if (argv.length === 0) {
      console.log('\nRun --eval for eval-live posture, --scope for focused multi-runtime scope gates, or --p0 for the full canonical anchor.');
    }
    return;
  }

  const gates = selectedGates(argv);
  if (gates.length === 0) {
    printList();
    return;
  }
  const context = buildGateContext(argv, gates);

  const results = [];
  for (const gate of gates) {
    process.stdout.write(`Running ${gate.id}... `);
    const result = await runGate(gate, context);
    results.push(result);
    console.log(result.status);
    if (result.status === 'FAIL') {
      console.error(result.error);
      break;
    }
  }

  const provenance = buildReportProvenance(results);
  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    branch: provenance.git.branch,
    commit: provenance.git.commit,
    provenance,
    gates: results
  };

  maybeWriteReport(report);

  if (results.some((result) => result.status !== 'PASS')) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
  });
}

module.exports = {
  assertP0LedgerConservation,
  assertP0TieredExitAccounting,
  assertP0LongOnlyNoShortArtifacts,
  buildReportProvenance,
  buildGateContext,
  maybeWriteReport,
  P0_GATE_ID,
  pm2ProcessName,
  runGate,
  selectedGates,
  P0_TIER_FRACTION_CAPS
};
