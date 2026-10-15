'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const Module = require('module');
const { EventEmitter } = require('events');
const root = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const run = path.dirname(root);
assert(root.startsWith(path.resolve(__dirname, '../../ogz-meta/inbox/codex/2026-10-11/session-handoff-rehearsal/runs') + path.sep));
assert.equal(process.cwd(), root);
function inside(p) { if (typeof p === 'number') return; assert(path.resolve(String(p)).startsWith(run + path.sep), 'write outside isolated rehearsal: ' + p); }
for (const method of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'unlinkSync', 'rmSync']) {
  const original = fs[method]; fs[method] = function(p, ...args) { inside(p); return original.call(fs, p, ...args); };
}
for (const method of ['renameSync', 'copyFileSync']) {
  const original = fs[method]; fs[method] = function(a, b, ...args) { inside(a); inside(b); return original.call(fs, a, b, ...args); };
}
const noNetwork = () => assert.fail('external network attempted by isolated rehearsal');
for (const name of ['http', 'https']) { const mod = require(name); mod.request = noNetwork; mod.get = noNetwork; }
require('net').connect = noNetwork; require('net').createConnection = noNetwork; global.fetch = noNetwork;
class OfflineSocket extends EventEmitter { constructor() { super(); this.readyState = 3; } close() {} terminate() {} }
OfflineSocket.OPEN = 1; OfflineSocket.CLOSED = 3;
const load = Module._load;
Module._load = function(name, parent, main) { if (name === 'ws') return OfflineSocket; return load.call(this, name, parent, main); };
const C = require(root + '/foundation/ConfigLoader');
const config = C.load({ silent: true, loadDotenv: false }).config;
assert.equal(config.mode.execution, 'paper');
const { getInstance, StateManager } = require(root + '/core/StateManager');
const state = getInstance();
const memory = require(root + '/core/UnifiedPatternMemory').getInstance();
const Router = require(root + '/core/SessionRouter');
const OrderRouter = require(root + '/core/OrderRouter');
const OrderExecutor = require(root + '/core/OrderExecutor');
const traces = [];
const unsubscribe = require(root + '/core/TraceSpine').subscribeTrace(t => traces.push(t));
let now = Date.parse('2026-10-11T12:00:00Z');
let orderCalls = 0;
function adapter(id) {
  const a = new EventEmitter();
  Object.assign(a, { id, subscriptions: [], getBrokerName: () => id,
    getAccountIdentity: () => ({ accountId: 'fixture-' + id, accountIdSource: 'broker:fixture' }),
    getPositions: async () => id === 'kraken' ? [{ symbol: 'BTC', quantity: 0.01 }, { symbol: 'ETH', quantity: 0.1 }] : [],
    getOpenOrders: async () => [], getBalance: async () => ({ total: 10000 }),
    subscribeToCandles: async (symbol, timeframe) => a.subscriptions.push({ symbol, timeframe }),
    unsubscribeAll: async () => { a.subscriptions = []; },
    placeOrder: async () => { orderCalls++; assert.fail('paper rehearsal attempted broker order'); }
  }); return a;
}
const router = new Router({ ...config.sessionRouter, stockSymbols: config.execution.symbols, clock: () => now,
  fastCheckIntervalMs: config.internals.sessionRouter.fastCheckIntervalMs,
  transitionStoreOptions: { dir: path.join(output, 'transitions'), staleLockMs: config.internals.sessionRouter.transitionStoreStaleLockMs, clock: () => now }
});
const kraken = adapter('kraken'), alpaca = adapter('alpaca'), orderRouter = new OrderRouter();
orderRouter.sendOrder = async () => { orderCalls++; assert.fail('paper execution reached broker order routing'); };
const helper = require('./executor-context.js');
const { ctx, signal } = helper.makeExecutorContext({ root, config: { symbol: 'BTC-USD', brokerId: 'kraken', assetClass: 'crypto', entryPrice: 100, exitPrice: 110 }, state, memory });
ctx.orderRouter = orderRouter; ctx.sessionRouter = router; ctx.sessionRouterConfig = config.sessionRouter;
// The runner's context boundary consumes the actual scope published by StateManager.
// Full runner bootstrap is outside this isolated transfer/close rehearsal.
ctx.runner = { sessionRouter: router, isSessionRoutingActive: () => true,
  getCandleScopeEnvelope: () => state.getDashboardRuntimeScope() };
const executor = new OrderExecutor(ctx);
let incompleteClose = false;
router.executeTrade = (decision, ...args) => executor.executeTrade(incompleteClose ? { ...decision, exitFraction: 0.5 } : decision, ...args);
router.getExitPrice = symbol => state.getLastPrice(symbol);
router.wire(kraken, alpaca, orderRouter, () => {}, ctx);
function ledgers() {
  const dir = path.join(output, 'ledger');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  assert(!files.some(f => f.startsWith('malformed')), 'malformed decision ledger output');
  return files.filter(f => /^decisions_.*\.jsonl$/.test(f)).flatMap(f => fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').filter(Boolean).map(s => JSON.parse(s)));
}
function near(a, b, message) { assert(Math.abs(a - b) < 1e-7, `${message}: ${a} != ${b}`); }
const opened = [], checkpoints = [];
async function open(symbol, action, price) {
  ctx.marketData.timestamp = Date.now();
  const decision = { ...signal.buy, action, traceId: `fixture:${symbol}:${opened.length}`, signalId: `fixture:signal:${opened.length}`,
    ledgerData: { candleTimestamp: ctx.marketData.timestamp,
      strategySignals: [{ name: 'EMATrendRetest', direction: action === 'BUY' ? 'long' : 'short', baseConfidence: 0.75, reason: 'scripted rehearsal signal' }],
      orchestratorDecision: { winnerStrategy: 'EMATrendRetest', finalConfidence: 0.75, reason: 'scripted rehearsal selection' },
      confluence: { count: 1, sizingMultiplier: 1 }, positionSizing: { basePercent: 0.01, confidenceMultiplier: 1.5, confluenceMultiplier: 1, finalPercent: 0.015, finalSizeUsd: 150, formula: 'filled by actual executor' },
      exitContract: signal.orchResult.exitContract, riskGates: [] }
  };
  const before = new Set(state.get('activeTrades').keys());
  await executor.executeTrade(decision, signal.confidenceData, price, signal.indicators, signal.patterns, null, signal.orchResult, symbol);
  const added = [...state.get('activeTrades')].filter(([id]) => !before.has(id));
  assert.equal(added.length, 1, 'normal entry did not create paper trade');
  const [id, trade] = added[0]; assert(trade.decisionLedger, 'normal entry lacks decision ledger');
  opened.push({ ...JSON.parse(JSON.stringify(trade)), tradeId: id }); return id;
}
function verifyCompleted(label, destination) {
  assert.equal(state.get('activeTrades').size, 0, 'outgoing positions remain');
  assert.equal(state.get('positionCount'), 0); near(state.get('position'), 0, 'position'); near(state.get('inPosition'), 0, 'reserved exposure');
  const rows = ledgers(); assert.equal(rows.length, opened.length, 'completed ledger count');
  let expectedNet = 0;
  for (const trade of opened) {
    const row = rows.find(r => r.tradeId === trade.tradeId); assert(row, 'missing completed trade ledger');
    assert.equal(row.executionMode, 'paper'); assert.equal(row.symbol, trade.symbol); assert.equal(row.direction, trade.direction);
    assert.equal(row.exits.at(-1).remainingOrderQuantity, 0); assert.equal(row.outcome.rawExitReason, 'session_close');
    assert(row.outcome.holdTimeMs >= 0);
    const sign = trade.direction === 'long' ? 1 : -1;
    const gross = sign * trade.entryOrderQuantity * (row.outcome.exitPrice - trade.entryPrice);
    const exitFees = row.outcome.exitFee;
    const net = gross - exitFees - trade.entryFee;
    near(row.outcome.netPnlDollars, gross - exitFees, 'ledger net exit result'); expectedNet += net;
  }
  near(state.get('realizedPnL'), expectedNet, 'realized P&L'); near(state.getEquity(), state.get('initialBalance') + expectedNet, 'account equity');
  const scope = state.getDashboardRuntimeScope(); assert.equal(scope.assetClass, destination); assert.equal(scope.brokerId, destination === 'stocks' ? 'alpaca' : 'kraken'); assert.equal(scope.executionMode, 'paper');
  assert.equal(scope.symbol, destination === 'stocks' ? 'TSLA' : 'BTC-USD');
  assert.equal(scope.accountId, destination === 'stocks' ? 'fixture-alpaca' : 'fixture-kraken');
  assert.equal(scope.accountIdSource, 'broker:fixture'); assert.equal(scope.scopeComplete, true); assert.equal(scope.timeframe, '15m');
  assert.equal(scope.scopeKey, `paper:${scope.brokerId}:${scope.accountId}:${destination}:${scope.symbol}:15m`);
  const disk = JSON.parse(fs.readFileSync(config.paths.stateFile)); assert.equal(disk.activeTrades.length, 0); near(disk.realizedPnL, expectedNet, 'saved P&L');
  checkpoints.push({ label, scope, activePositions: 0, ledgerRows: rows.length, equity: state.getEquity(), realizedPnL: expectedNet, saved: true });
}
let expectedDestination = null;
const realResume = state.resumeTrading.bind(state);
state.resumeTrading = async (...args) => { if (expectedDestination) verifyCompleted('before resume ' + expectedDestination, expectedDestination); return realResume(...args); };
(async () => {
  try {
    const started = await router.start(); assert.equal(started.started, true, JSON.stringify(started));
    await state.resumeTrading();
    assert.equal(router.activeSession, 'crypto');
    await open('BTC-USD', 'BUY', 100);
    state.updateLastPrice('BTC-USD', 110);
    now = Date.parse('2026-10-12T13:25:00Z');
    await router._checkTransition();
    assert.equal(state.get('activeTrades').size, 0, 'five-minute wind-down did not flatten');
    assert.equal(state.isPaused(), true);
    verifyCompleted('crypto closed and persisted before transfer', 'crypto');
    expectedDestination = 'stocks';
    now = Date.parse('2026-10-12T13:30:00Z'); await router._checkTransition();
    assert.equal(router.activeSession, 'stocks', router.failedSafeReason);
    assert.equal(state.isPaused(), false); expectedDestination = null;
    await open('TSLA', 'SELL_SHORT', 50); state.updateLastPrice('TSLA', 45);
    now = Date.parse('2026-10-12T19:55:00Z'); await router._checkTransition();
    assert.equal(state.get('activeTrades').size, 0, 'stock wind-down did not flatten');
    assert.equal(state.isPaused(), true);
    verifyCompleted('stocks closed and persisted before transfer', 'stocks');
    expectedDestination = 'crypto'; now = Date.parse('2026-10-12T20:00:00Z'); await router._checkTransition();
    assert.equal(router.activeSession, 'crypto', router.failedSafeReason); assert.equal(state.isPaused(), false); expectedDestination = null;
    const reloaded = new StateManager(); assert.equal(reloaded.get('activeTrades').size, 0); near(reloaded.get('realizedPnL'), state.get('realizedPnL'), 'reloaded P&L'); near(reloaded.getEquity(), state.getEquity(), 'reloaded equity');
    const residualId = await open('BTC-USD', 'BUY', 100); state.updateLastPrice('BTC-USD', 105);
    incompleteClose = true; now = Date.parse('2026-10-13T13:25:00Z'); await router._checkTransition();
    now = Date.parse('2026-10-13T13:30:00Z'); await router._checkTransition();
    const residual = state.get('activeTrades').get(residualId); assert(residual.remainingOrderQuantity > 0);
    assert(residual.remainingOrderQuantity < residual.entryOrderQuantity, 'incomplete close must actually fill a portion');
    assert.equal(residual.decisionLedger.exits.length, 2, 'both partial close attempts must be recorded');
    near(residual.decisionLedger.exits.reduce((sum, leg) => sum + leg.exitOrderQuantity, 0) + residual.remainingOrderQuantity, residual.entryOrderQuantity, 'partial fill quantity conservation');
    assert(residual.decisionLedger.exits.every(leg => leg.exitOrderQuantity > 0 && leg.remainingOrderQuantity > 0));
    assert.equal(router.activeSession, 'crypto'); assert.equal(state.isPaused(), true); assert.equal(router.windDownFlattenComplete, false); assert.equal(router.getEntryBlockStatus().blocked, true);
    assert.equal(state.getDashboardRuntimeScope().assetClass, 'crypto'); assert.equal(ledgers().length, 2);
    const residualReload = new StateManager(); near(residualReload.get('activeTrades').get(residualId).remainingOrderQuantity, residual.remainingOrderQuantity, 'persisted incomplete close');
    assert.deepEqual(residualReload.get('activeTrades').get(residualId).decisionLedger.exits, residual.decisionLedger.exits, 'partial exit ledger must survive reload');
    assert.equal(orderCalls, 0);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'pass', checkpoints, reloadVerified: true, incompleteClose: { retainedQuantity: residual.remainingOrderQuantity, activeSession: router.activeSession, paused: state.isPaused(), failure: router.failedSafeReason }, brokerOrderCalls: orderCalls, traceEvents: traces.map(t => t.event), limitations: ['Scripted strategy signals and external broker snapshots; actual router/executor/state/ledger/memory/persistence', 'Runner context receives StateManager scope; full runner bootstrap and real broker connectivity not exercised'] }, null, 2));
    console.log('PASS paper handoff, ledger, persisted state and incomplete close');
  } finally { await router.stop(); await memory.cleanup(); unsubscribe(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
