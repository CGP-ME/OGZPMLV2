'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
const overlay = process.argv.includes('--current') ? { files: {} }
  : JSON.parse(fs.readFileSync(path.join(__dirname, process.argv.includes('--staged') ? 'staged-source.json' : 'boundary-after.json'), 'utf8'));
for (const [name, source] of Object.entries(overlay.files)) fs.writeFileSync(name, source);
const env = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(env, 'ALPACA_API_KEY=synthetic\nALPACA_API_SECRET=synthetic\nKRAKEN_API_KEY=synthetic\nKRAKEN_API_SECRET=synthetic\nWEBSOCKET_AUTH_TOKEN=synthetic\n');
process.env.PROFILE = 'paper';
process.env.DOTENV_CONFIG_PATH = env;
const root = process.cwd();
const ConfigLoader = require(path.join(root, 'foundation/ConfigLoader'));
const config = ConfigLoader.load({ role: 'bot', silent: true }).config;
const { TradeJournalBridge, resolveJournalDataDir } = require(path.join(root, 'core/TradeJournalBridge'));
const { normalizePatternScope } = require(path.join(root, 'core/PatternScope'));
const { notificationForTrace } = require(path.join(root, 'core/NtfyTraceNotifier'));
const scope = normalizePatternScope({ symbol: 'NVDA', brokerId: 'alpaca', accountId: 'fixture-A', accountIdSource: 'fixture', assetClass: 'stocks', executionMode: 'paper', timeframe: '1m' });
const otherScope = normalizePatternScope({ ...scope, scopeKey: undefined, accountId: 'fixture-B' });
const foreignScope = normalizePatternScope({ ...scope, scopeKey: undefined, brokerId: 'kraken', symbol: 'BTC-USD', assetClass: 'crypto', accountId: 'fixture-K' });
const errors = [];
let brokerSnapshot = { available: true, ...scope, positions: [] };
const bridgeConfig = { ...config.internals.journal, journalRoot: path.join(__dirname, 'reporting-journal'), startingBalance: 1000 };
const bridge = new TradeJournalBridge({
  readRuntimeScope: () => scope,
  readState: () => ({ activeTrades: new Map(), positionCount: 0 }),
  readBrokerSnapshot: async () => brokerSnapshot,
  readReplayHistory: () => ({ ok: false, reason: 'Synthetic observation has no market stream' }),
  readDashboardSocket: () => null,
  emitTrace: (event, fields) => errors.push({ event, fields }),
}, bridgeConfig);
function entry(owner, orderId) {
  return { ...owner, orderId, action: 'BUY', direction: 'long', entryPrice: 100, sizeUsd: 100, confidence: 90, entryFee: 1, timestamp: 1000, entryStrategy: 'fixture', traceId: orderId + '-trace', decisionId: orderId + '-decision', signalId: orderId + '-signal' };
}
async function main() {
  bridge.start();
  await bridge._startupJournalReconciliationPromise;
  const accountB = entry(otherScope, 'fixture-B-order');
  const kraken = entry(foreignScope, 'fixture-K-order');
  bridge.recordEntry(accountB);
  bridge.recordEntry(kraken);
  await bridge._reconcileJournalOpenTradesWithAuthoritativeState();
  assert.ok(bridge._journalBundles.get(otherScope.scopeKey).journal.openTrades.has(accountB.orderId));
  assert.ok(bridge._journalBundles.get(foreignScope.scopeKey).journal.openTrades.has(kraken.orderId));
  const accountA = entry(scope, 'fixture-A-order');
  bridge.recordEntry(accountA);
  brokerSnapshot = { available: false, scope, reason: 'Synthetic account A broker read failed', code: 'ECONNRESET' };
  await bridge._reconcileJournalOpenTradesWithAuthoritativeState();
  const accountARows = fs.readFileSync(bridge.journal.paths.ledger, 'utf8');
  assert.ok(accountARows.includes('BROKER_UNVERIFIED'));
  for (const owner of [otherScope, foreignScope]) {
    assert.equal(fs.readFileSync(bridge._journalBundles.get(owner.scopeKey).journal.paths.ledger, 'utf8').includes('BROKER_UNVERIFIED'), false);
  }
  const badScope = normalizePatternScope({ ...scope, scopeKey: undefined, symbol: 'TSLA' });
  const badDir = resolveJournalDataDir(null, bridgeConfig, badScope);
  const bytes = '{malformed persisted reporting row\n';
  fs.mkdirSync(badDir, { recursive: true });
  fs.writeFileSync(path.join(badDir, 'trade-ledger.jsonl'), bytes);
  bridge._getJournalBundleForEntry(badScope);
  const unavailable = JSON.parse(JSON.stringify(bridge._combinedJournalSnapshot()));
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(Object.hasOwn(unavailable, 'netPnl'), false);
  assert.equal(fs.readFileSync(path.join(badDir, 'trade-ledger.jsonl'), 'utf8'), bytes);
  const page = fs.readFileSync('public/trade-journal.html', 'utf8');
  const script = page.slice(page.lastIndexOf('<script>') + '<script>'.length, page.lastIndexOf('</script>'));
  const ast = require('acorn').parse(script, { ecmaVersion: 'latest' });
  const handler = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'handleMessage');
  const nodes = new Map();
  const document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); } };
  const handleMessage = vm.runInNewContext('(' + script.slice(handler.start, handler.end) + ')', { document, journalData: {} });
  handleMessage({ type: 'journal_snapshot', data: unavailable });
  assert.equal(nodes.get('journal-content').hidden, true);
  assert.equal(nodes.get('journal-availability').hidden, false);
  assert.equal(nodes.get('ws-label').textContent, 'Journal unavailable');
  fs.writeFileSync(path.join(badDir, 'trade-ledger.jsonl'), '');
  const recovered = bridge._getJournalBundleForEntry(badScope);
  assert.ok(recovered.journal);
  assert.equal(bridge._combinedJournalSnapshot().status, 'available');
  assert.ok(errors.some(payload => notificationForTrace(payload)?.priority === 'max'));
  console.log('JOURNAL_REPORTING_RECEIPT ' + JSON.stringify({
    wrongAccountEmptySnapshotPreservedEntry: accountB.orderId,
    wrongBrokerEmptySnapshotPreservedEntry: kraken.orderId,
    failedBrokerReadMarkedOnlyQueriedAccount: accountA.orderId,
    unavailableSnapshot: unavailable,
    actualPageHandler: { contentHidden: nodes.get('journal-content').hidden, message: nodes.get('journal-availability').textContent },
    storageRecoveryObserved: !!recovered.journal,
    maxPriorityAlarmSelected: true,
    limits: ['Actual reporting classes and page handler in isolated synthetic filesystem/DOM.', 'No live browser, network alert or process restart.'],
  }));
}
main().finally(() => bridge.destroy()).catch(error => { console.error(error); process.exitCode = 1; });
