'use strict';

// Isolated receipt proof. It loads exported pinned candidate sources, uses the actual
// RiskManager/PnLTracker/SessionRouter/TransitionStore owners, and writes only
// beneath this packet's fixtures/generated directory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const fixtureDir = __dirname;
const repoRoot = path.resolve(fixtureDir, '../../../../../..');
const generatedDir = path.join(fixtureDir, 'generated');
fs.mkdirSync(generatedDir, { recursive: true });
const outputDir = fs.mkdtempSync(path.join(generatedDir, 'run-'));
const tree = "39ba5b7793e0bf990b507a57c836f1fac6e56b2a";

assert.match(tree || '', /^[a-f0-9]{40}$/, 'MERCURY_HARNESS_TREE must name the immutable candidate tree');
fs.mkdirSync(outputDir, { recursive: true });

// Prevent SessionRouter's construction-time singleton lookup from reading or
// writing the process state file. The router itself receives this same minimal
// in-memory state owner.
const state = { activeTrades: new Map() };
const stateManager = { state };
const stateManagerPath = path.join(repoRoot, 'core', 'StateManager.js');
const stateManagerModule = new Module(stateManagerPath);
stateManagerModule.filename = stateManagerPath;
stateManagerModule.exports = { getInstance: () => stateManager };
require.cache[stateManagerPath] = stateManagerModule;

// Compile pinned candidate sources inside the disposable helper sandbox.
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  const resolved = Module._resolveFilename(request, parent, main);
  const relative = path.relative(repoRoot, resolved);
  const pinned = path.join(__dirname, relative.split(path.sep).join('__') + '.cjs');
  if (!require.cache[resolved] && fs.existsSync(pinned)) {
    const loaded = new Module(resolved, parent);
    loaded.filename = resolved;
    loaded.paths = Module._nodeModulePaths(path.dirname(resolved));
    require.cache[resolved] = loaded;
    loaded._compile(fs.readFileSync(pinned, 'utf8'), resolved);
  }
  return originalLoad.call(this, request, parent, main);
};

const RiskManager = require(path.join(repoRoot, 'core/RiskManager'));
const SessionRouter = require(path.join(repoRoot, 'core/SessionRouter'));
const feedExit = require('./exit-feed.cjs');
const settings = require('./settings.cjs');
function riskManager({ enabled = false, dollarLimit = null } = {}) {
  const reporter = JSON.parse(JSON.stringify(settings.launchProfiles.paper.risk.reconciliationReporter));
  reporter.enabled = enabled;
  reporter.alertDeltaDollars = dollarLimit;
  return new RiskManager(reporter);
}

function adapter(brokerId, accountId, balance) {
  const isAlpaca = brokerId === 'alpaca';
  return {
    config: { mode: 'live' },
    getBrokerName: () => brokerId,
    getAccountIdentity: () => ({ brokerId, accountId, accountIdSource: 'broker:fixture' }),
    getPositions: async () => [],
    getOpenOrders: async () => [],
    getBalance: async () => isAlpaca
      ? { USD: balance }
      : { currencies: { ZUSD: String(balance) }, total: balance },
  };
}

function makeRouter(risk, journalDir) {
  const router = new SessionRouter({
    mode: 'scheduled',
    stockSymbols: ['TSLA'],
    cryptoSymbols: ['BTC-USD'],
    transitionStoreOptions: { dir: journalDir },
    clock: () => Date.parse('2026-10-13T20:30:00.000Z'),
  });
  router.stateManager = stateManager;
  router.ctx = { candleTimeframe: '15m', riskManager: risk, config: { executionMode: 'live' } };
  router.activeSession = 'crypto';
  return router;
}

async function reconcile(router, source, target, suffix) {
  const eventPromise = new Promise(resolve => router.once('broker_reconciled', resolve));
  const snapshots = await router._reconcileBrokerRestBeforeActivation(source, target, {
    transitionId: `fixture-${suffix}`,
    epoch: Number(suffix),
    from: 'crypto',
    to: 'stocks',
    at: '2026-10-13T20:30:00.000Z',
  }, { sourceBrokerId: 'kraken', targetBrokerId: 'alpaca' });
  const emitted = await eventPromise;
  const event = router.transitionStore.readEvents().at(-1);
  assert.equal(event.event, 'SESSION_BROKER_RECONCILED');
  assert.deepEqual(emitted.snapshots, snapshots);
  assert.deepEqual(event.brokerReconciliation, snapshots);
  return { snapshots, emitted, event };
}

function exitTrade({ brokerId, accountId, entryFee, entryOrderQuantity, symbol, strategy }) {
  return {
    brokerId,
    accountId,
    accountIdSource: 'broker:fixture',
    executionMode: 'live',
    entryFee,
    entryOrderQuantity,
    symbol,
    strategy,
  };
}

function reportInput(overrides = {}) {
  return {
    source: 'direct:retention', brokerId: 'alpaca', accountId: 'retention-account',
    accountIdSource: 'broker:fixture', executionMode: 'live', brokerExecutionMode: 'live',
    metric: 'USD_cash', balance: 5000, localFlat: true, brokerFlat: true,
    ...overrides,
  };
}

async function main() {
  const journalDir = path.join(outputDir, 'journal');
  const risk = riskManager();
  const router = makeRouter(risk, journalDir);
  const kraken = adapter('kraken', 'kraken-main', 1000);
  const alpaca = adapter('alpaca', 'alpaca-main', 2000);

  const baseline = await reconcile(router, kraken, alpaca, 1);
  assert.equal(baseline.snapshots.source.ledgerReport.status, 'baseline_only');
  assert.equal(baseline.snapshots.target.ledgerReport.status, 'baseline_only');

  // Actual immutable OrderExecutor close-call extraction. Net amounts include
  // close fee in netRealizedResult plus proportional entry-fee allocation.
  const long = exitTrade({ brokerId: 'kraken', accountId: 'kraken-main', entryFee: 4, entryOrderQuantity: 100, symbol: 'BTC-USD', strategy: 'long-fixture' });
  const short = exitTrade({ brokerId: 'alpaca', accountId: 'alpaca-main', entryFee: 6, entryOrderQuantity: 100, symbol: 'TSLA', strategy: 'short-fixture' });
  const fills = [
    feedExit(risk, long, { netRealizedResult: 97, filledQuantity: 50, fillId: 'k-1', tradeId: 'k-trade' }, { grossPnl: 100, percent: 1, short: false }),
    feedExit(risk, long, { netRealizedResult: 47, filledQuantity: 50, fillId: 'k-2', tradeId: 'k-trade' }, { grossPnl: 50, percent: 0.5, short: false }),
    feedExit(risk, short, { netRealizedResult: -12, filledQuantity: 40, fillId: 'a-1', tradeId: 'a-trade' }, { grossPnl: -10, percent: -0.1, short: true }),
    feedExit(risk, short, { netRealizedResult: -23, filledQuantity: 60, fillId: 'a-2', tradeId: 'a-trade' }, { grossPnl: -20, percent: -0.2, short: true }),
    feedExit(risk, exitTrade({ brokerId: 'alpaca', accountId: 'other-account', entryFee: 1, entryOrderQuantity: 10, symbol: 'TSLA', strategy: 'other-account' }), { netRealizedResult: 9, filledQuantity: 10, fillId: 'other-1', tradeId: 'other-trade' }, { grossPnl: 10, percent: 0.1, short: false }),
    feedExit(risk, long, { netRealizedResult: 9, filledQuantity: 10, fillId: 'sim-1', tradeId: 'simulated-trade' }, { grossPnl: 10, percent: 0.1, short: false, paper: true }),
  ];
  assert.deepEqual(fills.slice(0, 4).map(fill => fill.reconciliationPnl), [95, 45, -14.4, -26.6]);
  assert.equal(97 + 47 - fills[0].reconciliationPnl - fills[1].reconciliationPnl, long.entryFee);
  assert.equal(-12 - 23 - fills[2].reconciliationPnl - fills[3].reconciliationPnl, short.entryFee);

  kraken.getBalance = async () => ({ currencies: { ZUSD: '1140' }, total: 1140 });
  alpaca.getBalance = async () => ({ USD: 1959 });
  const exact = await reconcile(router, kraken, alpaca, 2);
  for (const report of [exact.snapshots.source.ledgerReport, exact.snapshots.target.ledgerReport]) {
    assert.equal(report.status, 'compared');
    assert.equal(report.deltaDollars, 0);
    assert.equal(report.alertTriggered, false);
    assert.ok(report.excludedFillCount > 0);
  }

  kraken.getBalance = async () => ({ currencies: { ZUSD: '1139' }, total: 1139 });
  alpaca.getBalance = async () => ({ USD: 1961 });
  const discrepancy = await reconcile(router, kraken, alpaca, 3);
  assert.equal(discrepancy.snapshots.source.ledgerReport.deltaDollars, -1);
  assert.equal(discrepancy.snapshots.target.ledgerReport.deltaDollars, 2);
  assert.equal(discrepancy.snapshots.source.ledgerReport.baseline.balance, 1000);
  assert.equal(discrepancy.snapshots.target.ledgerReport.baseline.balance, 2000);

  const beforeRiskState = risk.pnlTracker.getState();
  const beforePause = JSON.stringify(state);
  const disabled = risk.reportExternalLedgerDelta(reportInput({ balance: 5001 }));
  assert.equal(disabled.status, 'baseline_only');
  const disabledCompared = risk.reportExternalLedgerDelta(reportInput({ balance: 5002 }));
  assert.equal(disabledCompared.alertTriggered, false);
  assert.deepEqual(risk.pnlTracker.getState(), beforeRiskState);
  assert.equal(JSON.stringify(state), beforePause);

  const alerting = riskManager({ enabled: true, dollarLimit: 1 });
  alerting.reportExternalLedgerDelta(reportInput({ source: 'direct:alert', balance: 7000 }));
  const alertBefore = alerting.pnlTracker.getState();
  const pauseBefore = JSON.stringify(state);
  const alerted = alerting.reportExternalLedgerDelta(reportInput({ source: 'direct:alert', balance: 7002 }));
  assert.equal(alerted.status, 'compared');
  assert.equal(alerted.alertTriggered, true);
  assert.deepEqual(alerting.pnlTracker.getState(), alertBefore);
  assert.equal(JSON.stringify(state), pauseBefore);

  const missingIdentity = adapter('alpaca', 'ignored', 3000);
  missingIdentity.getAccountIdentity = () => null;
  const missing = await reconcile(router, kraken, missingIdentity, 4);
  assert.equal(missing.snapshots.target.ledgerReport.reason, 'broker_account_identity_unverified');
  const nullBalanceKraken = adapter('kraken', 'kraken-main', 0);
  nullBalanceKraken.getBalance = async () => ({ currencies: { BTC: '1' }, total: 0 });
  const nullBalance = await reconcile(router, nullBalanceKraken, alpaca, 5);
  assert.equal(nullBalance.snapshots.source.ledgerReport.reason, 'broker_usd_cash_not_supplied');

  const nonflat = adapter('alpaca', 'alpaca-main', 1961);
  nonflat.getPositions = async () => [{ symbol: 'TSLA', qty: 1 }];
  await assert.rejects(
    router._reconcileBrokerRestBeforeActivation(kraken, nonflat, { transitionId: 'fixture-6', epoch: 6, from: 'crypto', to: 'stocks', at: '2026-10-13T20:30:00.000Z' }, { sourceBrokerId: 'kraken', targetBrokerId: 'alpaca' }),
    /blocked activation/
  );
  const nonflatEvent = router.transitionStore.readEvents().at(-1);
  assert.equal(nonflatEvent.event, 'SESSION_BROKER_RECONCILE_FAILED');
  assert.equal(nonflatEvent.brokerReconciliation.target.ledgerReport.reason, 'positions_or_orders_not_flat');

  router.ctx.config.executionMode = 'paper';
  const paper = await reconcile(router, kraken, alpaca, 7);
  assert.equal(paper.snapshots.source.ledgerReport.reason, 'execution_is_not_live_broker_trading');
  assert.equal(paper.snapshots.target.ledgerReport.reason, 'execution_is_not_live_broker_trading');
  router.ctx.config.executionMode = 'live';

  const retained = riskManager();
  const firstRetention = retained.reportExternalLedgerDelta(reportInput({ source: 'direct:retention', balance: 5000 }));
  for (let index = 0; index < 100; index += 1) {
    const report = retained.reportExternalLedgerDelta(reportInput({ source: 'direct:retention', balance: 5000 }));
    assert.equal(report.status, 'compared');
    assert.equal(report.baseline.timestamp, firstRetention.baseline.timestamp);
  }
  assert.equal(retained.reconciliationReports.length, 100);
  retained.reset(5000);
  const reset = retained.reportExternalLedgerDelta(reportInput({ source: 'direct:retention', balance: 5000 }));
  assert.equal(reset.status, 'baseline_only');
  assert.notStrictEqual(reset.baseline, firstRetention.baseline);

  const unknown = riskManager();
  unknown.reportExternalLedgerDelta(reportInput());
  unknown.recordTradeResult({pnl: 1, simulated: false});
  const unknownReport = unknown.reportExternalLedgerDelta(reportInput({balance: 5001}));
  assert.equal(unknownReport.status, 'non_comparable');
  assert.equal(unknownReport.reason, 'post_baseline_fill_account_or_net_pnl_unproven');
  assert.equal(unknownReport.deltaDollars, null);

  const webhookRisk = riskManager();
  const webhookFill = feedExit(webhookRisk, long, { netRealizedResult: 9, filledQuantity: 10, fillId: 'webhook-1', tradeId: 'webhook-trade' }, { grossPnl: 10, percent: 0.1, webhook: true });
  assert.equal(webhookFill.simulated, false, 'live webhook is not simulation');

  const helperPath = path.join(repoRoot, 'scripts/session-handoff-rehearsal/executor-context.js');
  const helperModule = new Module(helperPath, module);
  helperModule.filename = helperPath;
  helperModule.paths = Module._nodeModulePaths(path.dirname(helperPath));
  helperModule._compile(fs.readFileSync(path.join(__dirname, 'final__scripts__session-handoff-rehearsal__executor-context.js.cjs'), 'utf8'), helperPath);
  const produced = helperModule.exports.makeExecutorContext({ root: repoRoot, state: stateManager });
  assert(produced.ctx.riskManager instanceof RiskManager);
  const helperRouter = makeRouter(produced.ctx.riskManager, path.join(outputDir, 'helper-journal'));
  helperRouter.ctx = produced.ctx;
  const helperReceipt = await reconcile(helperRouter, kraken, alpaca, 8);
  assert.equal(helperReceipt.snapshots.source.ledgerReport.reason, 'execution_is_not_live_broker_trading');
  assert.equal(helperReceipt.snapshots.target.ledgerReport.reason, 'execution_is_not_live_broker_trading');

  const journal = router.transitionStore.readEvents();
  assert.equal(journal.length, 7, 'isolated journal for this run only');
  const proof = {
    implementationTree: tree,
    boundary: 'post-applyFill confirmed-fill inputs; not full broker execution',
    writes: { journalDir, productionStateWritten: false, brokerCalls: 'fixture-only', pm2Calls: 0 },
    durableReadback: journal.map(entry => ({ event: entry.event, transitionId: entry.transitionId, ledgerReport: entry.brokerReconciliation && {
      source: entry.brokerReconciliation.source?.ledgerReport,
      target: entry.brokerReconciliation.target?.ledgerReport,
    } })),
    netFillEvidence: fills.map(fill => ({ fillId: fill.fillId, tradeId: fill.tradeId, brokerId: fill.brokerId, accountId: fill.accountId, simulated: fill.simulated, reconciliationPnl: fill.reconciliationPnl })),
    result: 'pass',
  };
  fs.writeFileSync(path.join(outputDir, 'reconcile-result.json'), `${JSON.stringify(proof, null, 2)}\n`);
  fs.writeFileSync(path.join(generatedDir, 'latest.json'), JSON.stringify({result: proof.result, implementationTree: tree, receipt: path.join(outputDir, 'reconcile-result.json')}, null, 2));
  process.stdout.write(`${JSON.stringify({ result: proof.result, journalEvents: journal.length, proof: path.join(outputDir, 'reconcile-result.json') })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
