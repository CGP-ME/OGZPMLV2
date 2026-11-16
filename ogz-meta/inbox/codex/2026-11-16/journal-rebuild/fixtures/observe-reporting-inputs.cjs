'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
const before = process.argv.includes('--before');
const overlayName = before ? 'boundary-review-revision-before.json' : process.argv.includes('--staged') ? 'staged-source.json' : 'boundary-after.json';
if (!process.argv.includes('--current')) {
  const overlay = JSON.parse(fs.readFileSync(path.join(__dirname, overlayName), 'utf8'));
  for (const [file, source] of Object.entries(overlay.files)) fs.writeFileSync(file, source);
}
const env = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(env, 'ALPACA_API_KEY=synthetic\nALPACA_API_SECRET=synthetic\nKRAKEN_API_KEY=synthetic\nKRAKEN_API_SECRET=synthetic\nWEBSOCKET_AUTH_TOKEN=synthetic\n');
process.env.PROFILE = 'paper';
process.env.DOTENV_CONFIG_PATH = env;
const ConfigLoader = require(path.join(process.cwd(), 'foundation/ConfigLoader'));
const { config } = ConfigLoader.load({ role: 'bot', silent: true });
const { TradeJournalBridge } = require(path.join(process.cwd(), 'core/TradeJournalBridge'));
const events = [];
const scope = { brokerId: 'alpaca', accountId: 'fixture', accountIdSource: 'fixture', executionMode: 'paper', symbol: 'NVDA', timeframe: '1m', assetClass: 'stocks' };
const bridge = new TradeJournalBridge({ readRuntimeScope: () => null, readState: () => ({ activeTrades: new Map(), positionCount: 0 }), readBrokerSnapshot: async () => ({ available: false, scope: null, reason: 'Synthetic unavailable broker identity' }), readReplayHistory: () => ({ ok: false }), readDashboardSocket: () => null, emitTrace: (event, fields) => events.push({ event, fields }) }, { ...config.internals.journal, startingBalance: 1000, journalRoot: path.join(__dirname, 'input-journal') });
async function main() {
  const scenarios = [
    ['missing_runtime_scope', () => bridge.start()],
    ['missing_entry_snapshot', () => bridge.recordEntry(null)],
    ['incomplete_reporting_entry', () => bridge.recordEntry({ ...scope, orderId: 'fixture', action: 'BUY', entryPrice: 100, sizeUsd: 100, entryFee: 0, timestamp: 1000, entryStrategy: 'fixture', traceId: 'trace', signalId: 'signal', decisionId: 'decision' })],
    ['unknown_failure_scope', () => bridge._recordVisibilityFailure('fixture_reporting_failure', { scope: null, message: 'Explicit unknown identity' })],
  ];
  const results = [];
  for (const [scenario, operation] of scenarios) {
    let error = null;
    try { operation(); } catch (caught) { error = caught.message; }
    results.push({ scenario, error });
    assert.equal(!!error, before, scenario + ': ' + error);
  }
  await bridge._startupJournalReconciliationPromise;
  if (!before) {
    assert.ok(events.some(row => row.fields.reason === 'Synthetic unavailable broker identity'));
    assert.equal(bridge._combinedJournalSnapshot().status, 'unavailable');
  }
  const runner = fs.readFileSync('run-empire-v2.js', 'utf8');
  const ast = require('acorn').parse(runner, { ecmaVersion: 'latest', allowReturnOutsideFunction: true });
  let construction;
  function walk(node, parent) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'IfStatement' && runner.slice(node.start, node.end).includes('this.journalBridge = new TradeJournalBridge') && node.test.type === 'UnaryExpression') construction = node;
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(child => walk(child, node)); else if (value && typeof value === 'object') walk(value, node);
  }
  walk(ast, null);
  const modeObservations = [];
  if (!before) {
    assert.ok(construction);
    for (const backtest of [true, false]) {
      let constructions = 0;
      vm.runInNewContext(runner.slice(construction.start, construction.end), { resolvedConfig: { config: { mode: { backtest }, internals: { journal: {} }, paths: { journalDataDir: 'fixture' }, startingBalance: 1000 } }, stateManager: {}, TradeJournalBridge: function() { constructions++; } });
      modeObservations.push({ backtest, constructions });
      assert.equal(constructions, backtest ? 0 : 1);
    }
  }
  console.log('JOURNAL_INPUT_RECEIPT ' + JSON.stringify({ before, results, modeObservations, failureEvents: events.map(row => ({ event: row.event, reason: row.fields.reason })), noTradingAuthority: !Object.hasOwn(bridge, 'bot'), limit: 'Actual reporting functions and runner construction statement in isolation; no live process failure injection.' }));
}
main().finally(() => bridge.destroy()).catch(error => { console.error(error); process.exitCode = 1; });
