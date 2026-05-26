#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REPORT_PATH = path.join(REPO_ROOT, 'ogz-meta', 'gates', 'runs', 'multi-runtime-latest.json');

const EXPECTED_P0 = Object.freeze({
  finalBalance: 13255.255799695915,
  totalTrades: 1410,
  winRate: 60.6,
  profitFactor: 1.71
});

let runtime = null;

function loadRuntime() {
  if (!runtime) {
    const { runP0 } = require('../anchor-runner');
    const { getInstance: getStateManager } = require('../../core/StateManager');
    runtime = {
      runP0,
      stateManager: getStateManager(),
      PositionTracker: require('../../core/PositionTracker'),
      OrderExecutor: require('../../core/OrderExecutor')
    };
  }
  return runtime;
}

function stateManager() {
  return loadRuntime().stateManager;
}

async function withQuietConsole(fn) {
  const original = {
    log: console.log,
    warn: console.warn
  };
  let suppressedLogCount = 0;
  console.log = () => { suppressedLogCount += 1; };
  console.warn = () => { suppressedLogCount += 1; };

  try {
    const detail = await fn();
    return {
      ...(detail || {}),
      suppressedLogCount
    };
  } finally {
    console.log = original.log;
    console.warn = original.warn;
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
    recoveryMode: false,
    lastError: null,
    lastUpdate: Date.now()
  };
}

function scopeInput(overrides = {}) {
  return {
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

function addTrades(...trades) {
  const sm = stateManager();
  for (const trade of trades) {
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

const GATES = [
  {
    id: 'p0.single_lane.tsla_ema_anchor',
    layer: 'p0',
    description: 'Canonical TSLA 2-year EMASMACrossover single-lane regression anchor.',
    run: async () => {
      const { runP0 } = loadRuntime();
      const result = runP0('full', 'multi-runtime-gate');
      assertP0Summary(result.summary);
      return {
        summary: result.summary,
        log: result.log,
        report: result.report
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
        side: 'long'
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
        action: 'BUY',
        direction: 'short',
        symbol: 'SPY',
        orderId: 'fake-order',
        price: 200
      }, trade);

      assert.strictEqual(payload.type, 'trade', 'dashboard helper must own payload type');
      assert.strictEqual(payload.tradeId, 'tsla-long', 'payload tradeId must come from trade record');
      assert.strictEqual(payload.orderId, 'tsla-long', 'payload orderId must come from trade record');
      assert.strictEqual(payload.symbol, 'TSLA', 'trade symbol must override loose payload symbol');
      assert.strictEqual(payload.brokerId, 'alpaca', 'brokerId must be carried');
      assert.strictEqual(payload.accountId, 'acct-main', 'accountId must be carried');
      assert.strictEqual(payload.scopeComplete, true, 'explicit account trade payload must be complete');

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
        /scopeKey does not match/,
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
  }
];

function selectedGates(argv) {
  const ids = [];
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
    } else if (arg === '--scope') {
      runScope = true;
    } else if (arg === '--p0') {
      runP0Gate = true;
    } else if (arg === '--all') {
      runAll = true;
    } else if (arg === '--list' || arg === '--write-report') {
      continue;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }

  if (runAll) return GATES;

  const selected = new Set(ids);
  if (runScope) {
    for (const gate of GATES.filter((g) => g.layer === 'scope')) selected.add(gate.id);
  }
  if (runP0Gate) selected.add('p0.single_lane.tsla_ema_anchor');

  if (selected.size === 0) return [];

  return Array.from(selected).map((id) => {
    const gate = GATES.find((candidate) => candidate.id === id);
    if (!gate) throw new Error(`Unknown gate id ${id}`);
    return gate;
  });
}

async function runGate(gate) {
  const startedAt = new Date().toISOString();
  try {
    const detail = await gate.run();
    return {
      id: gate.id,
      layer: gate.layer,
      status: 'PASS',
      startedAt,
      finishedAt: new Date().toISOString(),
      detail: detail || {}
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

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--list') || argv.length === 0) {
    printList();
    if (argv.length === 0) {
      console.log('\nRun --scope for focused multi-runtime scope gates or --p0 for the full canonical anchor.');
    }
    return;
  }

  const gates = selectedGates(argv);
  if (gates.length === 0) {
    printList();
    return;
  }

  const results = [];
  for (const gate of gates) {
    process.stdout.write(`Running ${gate.id}... `);
    const result = await runGate(gate);
    results.push(result);
    console.log(result.status);
    if (result.status === 'FAIL') {
      console.error(result.error);
      break;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    branch: process.env.GIT_BRANCH || null,
    gates: results
  };

  if (argv.includes('--write-report')) {
    writeReport(report);
    console.log(`Report written: ${REPORT_PATH}`);
  }

  if (results.some((result) => result.status !== 'PASS')) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
