'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
if (!process.argv.includes('--current')) {
  const name = process.argv.includes('--staged') ? 'staged-replay-source.json' : 'replay-observation-source.json';
  const overlay = JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
  for (const [file, source] of Object.entries(overlay.files)) fs.writeFileSync(file, source);
}
const env = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(env, 'ALPACA_API_KEY=synthetic\nALPACA_API_SECRET=synthetic\nKRAKEN_API_KEY=synthetic\nKRAKEN_API_SECRET=synthetic\nWEBSOCKET_AUTH_TOKEN=synthetic\n');
process.env.PROFILE = 'paper'; process.env.DOTENV_CONFIG_PATH = env;
const { config } = require(path.join(process.cwd(), 'foundation/ConfigLoader')).load({ role: 'bot', silent: true });
const { TradeJournalBridge } = require(path.join(process.cwd(), 'core/TradeJournalBridge'));
const { normalizePatternScope } = require(path.join(process.cwd(), 'core/PatternScope'));
const scope = normalizePatternScope({ brokerId: 'alpaca', accountId: 'fixture-reporting', accountIdSource: 'fixture', executionMode: 'paper', assetClass: 'stocks', symbol: 'NVDA', timeframe: '1m' });
const time = Math.floor(Date.now() / 60000) * 60000 - 600000;
const candles = Array.from({ length: 6 }, (_, i) => ({ t: time + i * 60000, etime: time + (i + 1) * 60000, o: 100, h: 101, l: 99, c: 100, v: 0 }));
const cfg = { ...config.internals.journal, journalRoot: path.join(__dirname, 'replay-journal'), startingBalance: 1000, replayCandlesAfter: 2 };
const messages = [], failures = [];
const context = {
  readRuntimeScope: () => scope, readState: () => ({ activeTrades: new Map(), positionCount: 0 }),
  readBrokerSnapshot: async () => ({ available: false, reason: 'Offline observation; no broker call' }),
  readReplayHistory: () => ({ ok: true, priceHistory: candles, source: 'synthetic_exact_scope' }),
  readDashboardSocket: () => ({ readyState: 1, send: text => messages.push(JSON.parse(text)), on() {} }),
  emitTrace: (event, fields) => failures.push({ event, fields }),
};
let bridge;
async function start() { bridge = new TradeJournalBridge(context, cfg); bridge.start(); await bridge._startupJournalReconciliationPromise; }
async function restart() { bridge.destroy(); await start(); }
async function main() {
  await start();
  const entry = { ...scope, orderId: 'fixture-order', action: 'BUY', direction: 'long', entryPrice: 100, sizeUsd: 100, entryFee: 2, confidence: 80, timestamp: time + 360000, entryStrategy: 'fixture', traceId: 'fixture-trace', decisionId: 'fixture-decision', signalId: 'fixture-signal' };
  const recorded = bridge.recordEntry(entry);
  assert.equal(recorded.journalRecorded, true); assert.equal(recorded.replayRecorded, true);
  const dir = bridge._journalBundles.get(scope.scopeKey).replay.replayDir;
  const entryPath = path.join(dir, entry.orderId + '.entry.json');
  const entryBytes = fs.readFileSync(entryPath, 'utf8');
  assert.equal(JSON.parse(entryBytes).entry.time, entry.timestamp);
  await restart();
  const makeExit = (price, offset, fillId) => ({ ...entry, action: 'SELL', type: 'SELL', size: 50, sizeUsd: 50, usdValue: 50, exitPrice: price, pnl: (price / 100 - 1) * 50, exitFee: 1, exitTimestamp: entry.timestamp + offset, holdTime: offset, reason: 'fixture exit', fillId });
  bridge.recordExit(makeExit(110, 60000, 'first-fill'));
  let journal = bridge._journalBundles.get(scope.scopeKey).journal;
  assert.equal(journal.readClosedTrades().length, 1);
  assert.equal(fs.existsSync(path.join(dir, entry.orderId + '.json')), false);
  await restart();
  bridge.recordExit(makeExit(90, 120000, 'final-fill'));
  const result = bridge._loadReplay(entry.orderId, scope.scopeKey);
  assert.equal(result.status, 'available', JSON.stringify(result));
  const replay = result.data;
  assert.ok(Math.abs(replay.exit.pnl + 4) < 1e-8);
  assert.equal(replay.exitFills.length, 2);
  assert.equal(replay.accountingBasis, 'confirmed_net_after_fees');
  assert.equal(replay.entry.time, entry.timestamp);
  assert.equal(replay.exit.time, entry.timestamp + 120000);
  assert.equal(fs.readFileSync(entryPath, 'utf8'), entryBytes);
  const post = i => ({ ...scope, o: 100, h: 101, l: 99, c: 100, v: 0, t: replay.exit.time + i * 60000, etime: replay.exit.time + (i + 1) * 60000 });
  bridge.recordClosedCandle(post(1));
  await restart();
  bridge.recordClosedCandle(post(2));
  const complete = bridge._loadReplay(entry.orderId, scope.scopeKey).data;
  assert.equal(complete.postExit.complete, true);
  assert.equal(complete.postExit.capturedCandles, 2);
  const recorder = bridge._journalBundles.get(scope.scopeKey).replay;
  fs.writeFileSync(path.join(dir, 'aaa-new.json'), JSON.stringify({ ...complete, orderId: 'aaa-new', savedAt: complete.savedAt + 1000 }));
  fs.writeFileSync(path.join(dir, 'zzz-old.json'), JSON.stringify({ ...complete, orderId: 'zzz-old', savedAt: 1 }));
  assert.equal(recorder.listReplays(1).data[0].orderId, 'aaa-new');
  fs.writeFileSync(path.join(dir, 'broken.json'), '{preserve-this');
  assert.equal(recorder.loadReplay('broken').status, 'unavailable');
  assert.equal(recorder.listReplays(10).status, 'partial');
  assert.equal(fs.readFileSync(path.join(dir, 'broken.json'), 'utf8'), '{preserve-this');
  assert.equal(recorder.loadReplay('../outside').status, 'unavailable');
  const fullNotifications = messages.filter(message => message.type === 'trade_closed_replay');
  assert.equal(fullNotifications.length, 1);
  assert.ok(Math.abs(fullNotifications[0].data.pnl + 4) < 1e-8);
  const missingEntry = { ...entry, orderId: 'missing-fill', timestamp: time + 600000 };
  bridge.recordEntry(missingEntry);
  const failedBundle = bridge._journalBundles.get(scope.scopeKey);
  const append = fs.appendFileSync;
  fs.appendFileSync = function(file, ...args) {
    if ([failedBundle.journal.paths.ledger, failedBundle.visibilityFailurePath].includes(String(file))) {
      const error = new Error('Synthetic scoped storage permission failure'); error.code = 'EACCES'; throw error;
    }
    return append.call(fs, file, ...args);
  };
  try {
    bridge.recordExit({ ...missingEntry, action: 'SELL', type: 'SELL', size: 100, sizeUsd: 100, usdValue: 100, exitPrice: 110, pnl: 10, exitFee: 1, exitTimestamp: missingEntry.timestamp + 60000, holdTime: 60000, reason: 'fixture', fillId: 'missing-fill-exit' });
  } finally { fs.appendFileSync = append; }
  assert.equal(bridge._combinedJournalSnapshot().status, 'unavailable');
  const fallbackBytes = fs.readFileSync(bridge.visibilityFailureFallbackPath, 'utf8');
  assert.ok(fallbackBytes.includes('missing-fill-exit'));
  await restart();
  assert.equal(bridge._combinedJournalSnapshot().status, 'unavailable');
  console.log('REPLAY_PRODUCER_RECEIPT ' + JSON.stringify({ entrySavedAtEntry: true, entryBytesPreserved: true, partialFillSavedAtExit: true, completedExitFills: complete.exitFills.length, netPnl: complete.exit.pnl, entryTime: complete.entry.time, exitTime: complete.exit.time, accountingBasis: complete.accountingBasis, postExitCandles: complete.postExit.capturedCandles, postExitComplete: complete.postExit.complete, zeroVolumePreserved: complete.candles.every(c => c.v === 0), mostRecentSelectedByTimestamp: true, corruptHistoryReportedAndPreserved: true, pathEscapeRefused: true, simulatedProcessRecreation: 4, closedNotificationNetPnl: fullNotifications[0].data.pnl, partialDidNotClaimFullClose: true, savedMissingFillEvidenceRemainsUnavailable: true }));
}
main().finally(() => bridge?.destroy()).catch(error => { console.error(error); process.exitCode = 1; });
