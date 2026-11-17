'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const vm = require('node:vm');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
if (!process.argv.includes('--current')) {
  const overlay = JSON.parse(fs.readFileSync(path.join(__dirname, process.argv.includes('--staged') ? 'staged-reports-source.json' : 'reports-after.json'), 'utf8'));
  for (const [file, source] of Object.entries(overlay.files)) fs.writeFileSync(file, source);
}
const env = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(env, 'ALPACA_API_KEY=synthetic\nALPACA_API_SECRET=synthetic\nKRAKEN_API_KEY=synthetic\nKRAKEN_API_SECRET=synthetic\nWEBSOCKET_AUTH_TOKEN=synthetic\n');
process.env.PROFILE = 'paper';
process.env.DOTENV_CONFIG_PATH = env;
const ConfigLoader = require(path.join(process.cwd(), 'foundation/ConfigLoader'));
const { config } = ConfigLoader.load({ role: 'bot', silent: true });
const { TradeJournalBridge, TradeJournal } = require(path.join(process.cwd(), 'core/TradeJournalBridge'));
const { normalizePatternScope } = require(path.join(process.cwd(), 'core/PatternScope'));
const owner = normalizePatternScope({ brokerId: 'alpaca', accountId: 'fixture-A__account', accountIdSource: 'fixture', executionMode: 'paper', assetClass: 'stocks', symbol: 'NVDA', timeframe: '1m' });
const tsla = normalizePatternScope({ ...owner, symbol: 'TSLA', scopeKey: undefined });
const other = normalizePatternScope({ ...owner, accountId: 'fixture-B', scopeKey: undefined });
const messages = [];
const errors = [];
const cfg = { ...config.internals.journal, journalRoot: path.join(__dirname, 'report-history'), startingBalance: 1000, maxInMemoryTrades: 2 };
const context = {
  readRuntimeScope: () => owner,
  readState: () => ({ activeTrades: new Map(), positionCount: 0 }),
  readBrokerSnapshot: async () => ({ available: false, reason: 'Offline reporting observation has no broker connection' }),
  readReplayHistory: () => ({ ok: false, reason: 'No market stream in accounting observation' }),
  readDashboardSocket: () => ({ readyState: 1, send: message => messages.push(JSON.parse(message)), on() {} }),
  emitTrace: (event, fields) => errors.push({ event, fields }),
};
let bridge = new TradeJournalBridge(context, cfg);
const clockStart = Date.now() - 600000;
let sequence = 0;
function entry(scope, id, fee = 1) {
  const timestamp = clockStart + ++sequence * 20000;
  const data = { ...scope, orderId: id, action: 'BUY', direction: 'long', entryPrice: 100, sizeUsd: 100, entryFee: fee, confidence: 80, timestamp, entryStrategy: 'fixture', traceId: id + '-trace', decisionId: id + '-decision', signalId: id + '-signal' };
  assert.equal(bridge.recordEntry(data).journalRecorded, true);
  return data;
}
function close(data, price, fee, size = 100, suffix = 'exit') {
  const exitTimestamp = data.timestamp + ++sequence * 100;
  const record = { ...data, type: 'SELL', action: 'SELL', size, sizeUsd: size, usdValue: size, pnl: (price / 100 - 1) * size, exitPrice: price, exitFee: fee, exitTimestamp, holdTime: exitTimestamp - data.timestamp, exitReason: 'fixture close', fillId: data.orderId + '-' + suffix };
  bridge.recordExit(record);
  return record;
}
async function main() {
  bridge.start();
  await bridge._startupJournalReconciliationPromise;
  close(entry(owner, 'win'), 110, 3);
  close(entry(owner, 'flat', 0), 100, 0);
  close(entry(owner, 'loss'), 90, 3);
  close(entry(tsla, 'second-symbol'), 110, 4);
  close(entry(other, 'other-account'), 200, 3);
  const partial = entry(owner, 'partial', 2);
  const leg = close(partial, 110, 1, 50, 'first');
  const journal = bridge._journalBundles.get(owner.scopeKey).journal;
  const beforeDuplicate = fs.readFileSync(journal.paths.ledger, 'utf8');
  bridge.recordExit(leg);
  assert.equal(fs.readFileSync(journal.paths.ledger, 'utf8'), beforeDuplicate);
  close(partial, 110, 1, 50, 'last');
  const before = bridge._combinedJournalSnapshot();
  assert.equal(before.status, 'available');
  assert.equal(before.totalTrades, 6);
  assert.ok(Math.abs(before.netPnl - 3) < 1e-8, JSON.stringify(before));
  assert.equal(before.wins, 4);
  assert.equal(before.losses, 1);
  assert.equal(before.breakEvens, 1);
  assert.ok(before.maxDrawdown > 0);
  assert.equal(journal.trades.length, 2);
  assert.equal(journal.stats.totalTrades, 5);
  assert.ok(Math.abs(journal.stats.netPnl + 2) < 1e-8);
  const rows = journal.readClosedTrades();
  const ledgerHash = crypto.createHash('sha256').update(fs.readFileSync(journal.paths.ledger)).digest('hex');
  bridge._sendEquityCurve();
  bridge._sendCalendar();
  bridge._sendBreakdown('pattern');
  bridge._exportCSV();
  bridge._exportReport();
  const equity = messages.findLast(row => row.type === 'journal_equity');
  const calendar = messages.findLast(row => row.type === 'journal_calendar');
  const breakdown = messages.findLast(row => row.type === 'journal_breakdown');
  assert.ok(Math.abs(equity.data.at(-1).balance - 1003) < 1e-8);
  assert.ok(Math.abs(calendar.data.reduce((sum, day) => sum + day.netPnl, 0) - 3) < 1e-8);
  assert.equal(breakdown.data.no_pattern.trades, 6);
  assert.equal(breakdown.data.no_pattern.losses, 1);
  assert.equal(breakdown.data.no_pattern.breakEvens, 1);
  const csvPath = messages.findLast(row => row.type === 'journal_export_complete' && row.format === 'csv').path;
  const csv = fs.readFileSync(csvPath, 'utf8');
  assert.equal(csv.trim().split('\n').length, 7);
  assert.ok(csv.includes('TSLA'));
  assert.equal(csv.includes('fixture-B'), false);
  const reportPath = messages.findLast(row => row.type === 'journal_export_complete' && row.format === 'json').path;
  const exported = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.ok(Math.abs(exported.stats.netPnl - 3) < 1e-8);
  bridge.destroy();
  bridge = new TradeJournalBridge(context, cfg);
  bridge.start();
  await bridge._startupJournalReconciliationPromise;
  const after = bridge._combinedJournalSnapshot();
  assert.equal(after.status, 'available', JSON.stringify(after));
  for (const key of ['totalTrades', 'wins', 'losses', 'breakEvens', 'netPnl', 'currentBalance', 'maxDrawdown', 'expectancy']) assert.equal(after[key], before[key], key);
  assert.equal(bridge._allJournalBundles().length, 3);
  const restored = bridge._journalBundles.get(owner.scopeKey).journal;
  assert.equal(restored.stats.totalTrades, 5);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(restored.paths.ledger)).digest('hex'), ledgerHash);
  const repeatedFill = restored.recordExit({ ...leg, fees: leg.exitFee });
  assert.equal(repeatedFill.fillId, leg.fillId);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(restored.paths.ledger)).digest('hex'), ledgerHash);
  const winning = new TradeJournal.JournalReport({ ...cfg, maxInMemoryTrades: 5 });
  winning.recordCompletedTrade(rows[0]);
  const transported = JSON.parse(JSON.stringify(winning.getSnapshot()));
  assert.equal(transported.profitFactor, 'unbounded');
  const html = fs.readFileSync('public/trade-journal.html', 'utf8');
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const ast = require('acorn').parse(script, { ecmaVersion: 'latest' });
  const names = ['updateHeadlineStats', 'formatMetric'];
  const functions = ast.body.filter(node => node.type === 'FunctionDeclaration' && names.includes(node.id.name)).map(node => script.slice(node.start, node.end)).join('\n');
  const rendered = {};
  vm.runInNewContext(functions + '\nupdateHeadlineStats(data);', { data: transported, setVal: (id, value) => rendered[id] = value, setText: (id, value) => rendered[id] = value, formatUSD: value => String(value) });
  assert.equal(rendered['hl-pf'], '∞');
  assert.equal(rendered['hl-wl'], '1W / 0L / 0 flat');
  const legacy = new TradeJournal.JournalReport({ ...cfg, maxInMemoryTrades: 5 });
  const oldRecordedRow = { ...rows[0] };
  delete oldRecordedRow.accountingVersion;
  delete oldRecordedRow.exitFees;
  const preservedOldRow = JSON.stringify(oldRecordedRow);
  legacy.recordCompletedTrade(oldRecordedRow);
  const legacyView = legacy.getSnapshot();
  assert.equal(legacyView.legacyAccountingFills, 1);
  assert.equal(legacyView.netPnl, Number(rows[0].netPnl.toFixed(2)));
  assert.equal(JSON.stringify(oldRecordedRow), preservedOldRow);

  console.log('JOURNAL_REPORT_RECEIPT ' + JSON.stringify({ before, after, retainedRows: restored.trades.length, lifetimeClosedFills: restored.stats.totalTrades, ledgerUnchanged: true, equityEnd: equity.data.at(-1), calendar: calendar.data, breakdown: breakdown.data.no_pattern, exportClosedFillCount: 6, otherAccountExcluded: true, allWinningTransport: transported.profitFactor, actualRenderer: rendered, duplicateFillDidNotAppend: true, legacyProvenance: { flagged: legacyView.legacyAccountingFills, originalRowUnchanged: true, accountingBasis: legacyView.accountingBasis } }));
}
main().finally(() => bridge.destroy()).catch(error => { console.error(error); process.exitCode = 1; });
