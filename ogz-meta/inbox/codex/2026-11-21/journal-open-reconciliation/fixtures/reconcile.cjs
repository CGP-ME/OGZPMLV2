'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const source = process.argv.find(arg => arg.startsWith('--source='));
if (source) for (const [name, text] of Object.entries(JSON.parse(fs.readFileSync(source.slice(9))))) fs.writeFileSync(name, text);
const baseline = process.argv.includes('--baseline');
const logs = [];
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push({ level, text: args.join(' ') });
const dotenv = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(dotenv, 'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.DOTENV_CONFIG_PATH = dotenv;
process.env.PROFILE = 'paper';
const ConfigLoader = require(process.cwd() + '/foundation/ConfigLoader');
ConfigLoader.load({ role: 'bot', silent: true });
const TradeJournal = require(process.cwd() + '/core/TradeJournal');
const { TradeJournalBridge } = require(process.cwd() + '/core/TradeJournalBridge');
const scope = { executionMode: 'paper', brokerId: 'alpaca', accountId: 'fixture-account', accountIdSource: 'fixture', assetClass: 'stocks', symbol: 'TSLA', timeframe: '1m' };
const scenarios = [
  { name: 'open_in_state_and_broker', stateIds: ['fixture-order'], positions: [{ symbol: 'TSLA' }], reconcile: false },
  { name: 'open_in_state_only', stateIds: ['fixture-order'], positions: [], reconcile: false },
  { name: 'symbol_open_at_broker_only', stateIds: [], positions: [{ symbol: 'tsla' }], reconcile: false },
  { name: 'target_flat', stateIds: [], positions: [], reconcile: true },
  { name: 'another_symbol_open', stateIds: ['other-order'], positions: [{ symbol: 'NVDA' }], reconcile: true },
  { name: 'different_account', stateIds: [], positions: [], accountId: 'other-account', reconcile: false },
  { name: 'broker_unavailable', stateIds: [], positions: [], available: false, reconcile: false },
];
async function main() {
  const results = [];
  for (const spec of scenarios) {
    const dir = path.join(__dirname, 'disposable-ledgers', spec.name);
    const journal = new TradeJournal({ dataDir: dir, scope, startingBalance: 10000, maxInMemoryTrades: 100, maxEquityPoints: 100 });
    assert.ok(journal.recordEntry({ orderId: 'fixture-order', direction: 'BUY', entryPrice: 100, size: 500, usdValue: 500, confidence: 80, fees: 0 }));
    const state = { activeTrades: new Map(spec.stateIds.map(id => [id, { orderId: id }])), positionCount: spec.stateIds.length };
    const snapshot = { available: spec.available !== false, brokerId: scope.brokerId, accountId: spec.accountId || scope.accountId, executionMode: scope.executionMode, positions: spec.positions, scope, reason: 'fixture broker unavailable', code: 'fixture_unavailable' };
    const beforeState = JSON.stringify({ state: [...state.activeTrades], count: state.positionCount, snapshot });
    const traces = [], sent = [];
    const bridge = new TradeJournalBridge({ readState: () => state, readBrokerSnapshot: async () => snapshot, readRuntimeScope: () => scope, emitTrace: (event, fields) => traces.push({ event, fields }), readDashboardSocket: () => ({ readyState: 1, send: message => sent.push(JSON.parse(message)) }) }, { journalRoot: dir, startingBalance: 10000, maxPendingVisibilityErrors: 10 });
    bridge._primaryScope = scope;
    bridge._journalBundles.set('fixture', { scope, journal, replay: null, journalGaps: new Map(), failures: {} });
    // Observe the output boundary; the real selection, proof and ledger writer run.
    let broadcasts = 0;
    bridge._sendJournalSnapshot = () => { broadcasts += 1; };
    let calls = 0;
    const record = journal.recordOpenTradeReconciliation.bind(journal);
    journal.recordOpenTradeReconciliation = proof => { calls += 1; return record(proof); };
    const logStart = logs.length;
    const outcome = await bridge._reconcileJournalOpenTradesWithAuthoritativeState();
    const ledger = fs.readFileSync(journal.paths.ledger, 'utf8').trim().split('\n').map(JSON.parse);
    const reconciled = ledger.filter(row => row.event === 'OPEN_TRADE_RECONCILED');
    assert.equal(outcome.reconciled, Number(spec.reconcile));
    assert.equal(reconciled.length, Number(spec.reconcile));
    assert.equal(journal.openTrades.has('fixture-order'), !spec.reconcile);
    assert.equal(ledger.some(row => row.event === 'EXIT'), false);
    assert.equal(beforeState, JSON.stringify({ state: [...state.activeTrades], count: state.positionCount, snapshot }));
    if (!baseline) assert.equal(calls, Number(spec.reconcile));
    results.push({ scenario: spec.name, consumerCalls: calls, outcome, openOrderRetained: journal.openTrades.has('fixture-order'), ledgerEvents: ledger.map(row => row.event), reconciliationRecords: reconciled, broadcasts, executionStateUnchanged: true, warnings: logs.slice(logStart).filter(row => row.level !== 'log'), traceEvents: traces.map(row => row.event) });
  }
  const hashes = Object.fromEntries(['core/TradeJournalBridge.js', 'core/TradeJournal.js', 'foundation/ConfigLoader.js'].map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex')]));
  process.stdout.write(JSON.stringify({ baseline, isolation: 'test-isolated.py; synthetic state and broker snapshots; real journal ledger writes', sourceHashes: hashes, results }, null, 2) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
