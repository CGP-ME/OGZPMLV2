'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
const overlay = process.argv.includes('--current') ? { files: {} }
  : JSON.parse(fs.readFileSync(path.join(__dirname, process.argv.includes('--staged') ? 'staged-source.json' : 'boundary-after.json'), 'utf8'));
for (const [name, source] of Object.entries(overlay.files)) fs.writeFileSync(name, source);
const settings = JSON.parse(fs.readFileSync('config/settings.json', 'utf8'));
settings.launchProfiles.paper.strategies.soloFilter = ['CandlePattern'];
settings.fees.makerFee = .001;
settings.fees.takerFee = .002;
settings.fees.totalRoundTrip = .004;
fs.writeFileSync('config/settings.json', JSON.stringify(settings));
const env = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(env, 'ALPACA_API_KEY=synthetic\nALPACA_API_SECRET=synthetic\nKRAKEN_API_KEY=synthetic\nKRAKEN_API_SECRET=synthetic\nWEBSOCKET_AUTH_TOKEN=synthetic\n');
process.env.PROFILE = 'paper';
process.env.DOTENV_CONFIG_PATH = env;
const root = process.cwd();
const ConfigLoader = require(path.join(root, 'foundation/ConfigLoader'));
const resolved = ConfigLoader.load({ role: 'bot', silent: true }).config;
const stateManager = require(path.join(root, 'core/StateManager')).getInstance();
stateManager.initializeFreshState(100000, { source: 'isolated_journal_rebuild' });
const { StrategyOrchestrator } = require(path.join(root, 'core/StrategyOrchestrator'));
const OrderExecutor = require(path.join(root, 'core/OrderExecutor'));
const TradingLoop = require(path.join(root, 'core/TradingLoop'));
const { TradeJournalBridge, resolveJournalDataDir } = require(path.join(root, 'core/TradeJournalBridge'));
const { normalizePatternScope } = require(path.join(root, 'core/PatternScope'));
const { notificationForTrace } = require(path.join(root, 'core/NtfyTraceNotifier'));
const start = Date.now() - 240 * 60000;
const candles = Array.from({ length: 240 }, (_, i) => ({ t: start + i * 60000, etime: start + (i + 1) * 60000, o: 100 + i * .01, h: 100.1 + i * .01, l: 99.9 + i * .01, c: 100.02 + i * .01, v: 1000, timeframe: '1m' }));
const price = candles.at(-1).c;
const indicators = { atr: 1, volatility: .01, ema9: price - .02, ema20: price - .1, ema50: price - .2, ema200: price - .8, rsi: 50, rsi2: 50, trend: 'uptrend' };
const long = process.argv.includes('--long');
const partial = process.argv.includes('--partial');
const writeFailure = process.argv.includes('--fail-write');
const patterns = [{ name: long ? 'fixture-bullish-pattern' : 'fixture-bearish-pattern', type: long ? 'hammer' : 'shooting_star', direction: long ? 'bullish' : 'bearish', confidence: .99 }];
const orchestrator = new StrategyOrchestrator({ mtfBaseTimeframe: '1m' });
const scope = { brokerId: 'alpaca', accountId: 'fixture-alpaca', accountIdSource: 'fixture', assetClass: 'stocks', executionMode: 'paper', timeframe: '1m' };
const events = [];
const messages = [];
const logRecords = [];
const socket = { readyState: 1, send: payload => messages.push(JSON.parse(payload)), on() {} };
const config = { ...resolved.internals.journal, journalRoot: path.join(__dirname, 'journal'), startingBalance: 100000 };
const ctx = {
  config: scope, executionMode: 'paper', paperTrading: true, backtestMode: false,
  backtestFast: true, tradingPair: 'NVDA', stateManager,
  runner: { getSymbolTimeframeContext: () => ({ priceHistory: candles, marketData: ctx.marketData }) },
  marketData: { price, timestamp: candles.at(-1).t },
  orderRouter: { sendOrder: async () => { assert.fail('Paper observation attempted a broker order'); } },
  notifyTrade: async () => {}, discordNotifier: { notifyTrade() {} },
  performanceAnalyzer: { processTrade() {} },
  logTrade: trade => logRecords.push(trade),
};
const executor = new OrderExecutor(ctx);
const originalExecute = executor.executeTrade;
const originalLog = ctx.logTrade;
const bridge = new TradeJournalBridge({
  readRuntimeScope: () => ({ ...scope, symbol: 'NVDA' }),
  readState: () => stateManager.getState(),
  readReplayHistory: (symbol, timeframe) => ({ ok: true, source: 'fixture_broker_bars', symbol, timeframe, priceHistory: candles }),
  readBrokerSnapshot: async () => ({ available: true, ...scope, positions: [] }),
  readDashboardSocket: () => socket,
  emitTrace: (event, fields) => events.push({ event, fields }),
}, config);
ctx.runner.journalBridge = bridge;
const corrupt = process.argv.includes('--corrupt');
const normalizedScope = normalizePatternScope({ ...scope, symbol: 'NVDA' });
assert.equal(normalizedScope.ok, true);
const nvdaDir = resolveJournalDataDir(null, config, normalizedScope);
const corruptBytes = '{external malformed journal input\n';
if (corrupt) {
  fs.mkdirSync(nvdaDir, { recursive: true });
  fs.writeFileSync(path.join(nvdaDir, 'trade-ledger.jsonl'), corruptBytes);
}
bridge.start();
const appendFile = fs.appendFileSync;
if (writeFailure) fs.appendFileSync = function(filename, ...args) {
  if (filename === path.join(nvdaDir, 'trade-ledger.jsonl')) {
    const error = new Error('Synthetic reporting storage ENOSPC');
    error.code = 'ENOSPC';
    throw error;
  }
  return appendFile.call(this, filename, ...args);
};
assert.equal(executor.executeTrade, originalExecute);
assert.equal(ctx.logTrade, originalLog);
assert.equal(Object.hasOwn(bridge, 'bot'), false);
const loopSource = fs.readFileSync('core/TradingLoop.js', 'utf8');
const from = loopSource.indexOf('        const allResults = this._ledgerAllResults(orchResult);');
const to = loopSource.indexOf('\n      }', from);
assert.ok(from >= 0 && to > from);
const makeLedger = vm.runInThisContext('(function(ConfigLoader,positionEffectFromAction,decision,orchResult,marketData,symbol,analysisTimeframe,indicators,confidence,riskGates){' + loopSource.slice(from, to) + '})');
const loop = Object.create(TradingLoop.prototype);
loop._patternScope = symbol => ({ ...scope, symbol });
async function enter(symbol) {
  const scopedCandles = candles.map(c => ({ ...c, ...scope, symbol }));
  for (const candle of scopedCandles) orchestrator.ingestMarketCandle(symbol, candle);
  const mtf = orchestrator.captureDecisionMtf(symbol, scopedCandles.at(-1));
  const orch = orchestrator.evaluate(indicators, patterns, { currentRegime: 'uptrend', confidence: .8 }, scopedCandles, { symbol, timeframe: '1m', price, mtf });
  assert.equal(orch.winnerStrategy, 'CandlePattern');
  const decision = { action: long ? 'BUY' : 'SELL_SHORT', confidence: orch.confidence, traceId: 'fixture-' + symbol, signalId: 'signal-' + symbol, decisionId: 'decision-' + symbol };
  makeLedger.call(loop, ConfigLoader, require(path.join(root, 'core/PositionEffect')).positionEffectFromAction, decision, orch, ctx.marketData, symbol, '1m', indicators, orch.confidence / 100, []);
  const result = await executor.executeTrade(decision, { totalConfidence: orch.confidence }, price, indicators, patterns, null, orch, symbol, '1m', { priceHistory: scopedCandles, marketData: ctx.marketData });
  assert.equal(result.success, true, JSON.stringify(result));
  stateManager.updateLastPrice(symbol, price, ctx.marketData.timestamp);
  return result;
}
async function close(symbol, orderId, exitFraction = 1) {
  ctx.marketData = { price: price * .99, timestamp: Date.now() };
  stateManager.updateLastPrice(symbol, ctx.marketData.price, ctx.marketData.timestamp);
  const result = await executor.executeTrade({ action: long ? 'SELL' : 'COVER', tradeId: orderId, exitFraction, exitReason: 'stop_loss', confidence: 100 }, { totalConfidence: 100 }, ctx.marketData.price, indicators, [], null, null, symbol, '1m');
  assert.equal(result.success, true, JSON.stringify(result));
  return result;
}
async function main() {
  await bridge._startupJournalReconciliationPromise;
  const nvda = await enter('NVDA');
  const tsla = await enter('TSLA');
  if (partial) await close('NVDA', nvda.orderId, .5);
  await close('NVDA', nvda.orderId);
  await close('TSLA', tsla.orderId);
  assert.equal(stateManager.isPaused(), false);
  assert.equal(stateManager.get('activeTrades').size, 0);
  const savedState = JSON.parse(fs.readFileSync(ConfigLoader.get('paths.stateFile'), 'utf8'));
  assert.equal(savedState.activeTrades.length, 0);
  const reports = [];
  for (const bundle of bridge._allJournalBundles()) {
    if (!bundle.journal) continue;
    if (writeFailure && bundle.scope.symbol === 'NVDA') {
      assert.equal(bundle.journal.trades.length, 0);
      continue;
    }
    const rows = fs.readFileSync(bundle.journal.paths.ledger, 'utf8').trim().split('\n').map(JSON.parse);
    const entries = rows.filter(row => row.event === 'ENTRY');
    const exits = rows.filter(row => row.event === 'EXIT');
    assert.equal(entries.length, 1, JSON.stringify(rows));
    assert.equal(exits.length, partial && bundle.scope.symbol === 'NVDA' ? 2 : 1, JSON.stringify(rows));
    assert.equal(exits.at(-1).partialExit, false);
    if (exits.length === 2) assert.equal(exits[0].partialExit, true);
    assert.ok(Math.abs(exits.reduce((sum, row) => sum + row.size, 0) - entries[0].size) < 1e-8);
    const closedLogs = logRecords.filter(row => row.orderId === entries[0].orderId);
    for (let index = 0; index < exits.length; index++) {
      assert.equal(exits[index].timestamp, Date.parse(closedLogs[index].exitTime));
      assert.ok(exits[index].fees > exits[index].entryFeesAllocated);
      assert.equal(exits[index].netPnl, exits[index].grossPnl - exits[index].fees);
    }
    assert.equal(exits.at(-1).balanceAfter, bundle.journal.stats.currentBalance);
    assert.equal(bundle.journal.equityCurve.at(-1).balance, bundle.journal.stats.currentBalance);
    reports.push({ scope: bundle.scope, entry: entries[0], exits, equity: bundle.journal.equityCurve.at(-1) });
  }
  if (corrupt) {
    assert.equal(reports.length, 1);
    assert.equal(reports[0].scope.symbol, 'TSLA');
    assert.equal(fs.readFileSync(path.join(nvdaDir, 'trade-ledger.jsonl'), 'utf8'), corruptBytes);
    assert.ok(events.some(row => row.event === 'TRADE_JOURNAL_RECONCILIATION_REQUIRED'));
    assert.ok(events.some(row => notificationForTrace(row)?.priority === 'max'));
  } else if (writeFailure) {
    assert.equal(reports.length, 1);
    assert.equal(reports[0].scope.symbol, 'TSLA');
    assert.ok(events.some(row => row.event === 'TRADE_JOURNAL_PERSISTENCE_FAILED'));
  } else assert.equal(reports.length, 2);
  const availabilityBeforeRestart = bridge._combinedJournalSnapshot().status;
  fs.appendFileSync = appendFile;
  const restarted = new TradeJournalBridge(bridge.context, config);
  restarted.start();
  await restarted._startupJournalReconciliationPromise;
  const availabilityAfterRestart = restarted._combinedJournalSnapshot().status;
  restarted.destroy();
  assert.equal(availabilityBeforeRestart, corrupt || writeFailure ? 'unavailable' : 'available');
  assert.equal(availabilityAfterRestart, corrupt || writeFailure ? 'unavailable' : 'available');
  console.log('JOURNAL_BOUNDARY_RECEIPT ' + JSON.stringify({
    corrupt, writeFailure, long, partial, reportingScopes: reports, visibleFailures: events,
    savedClosedTrades: savedState.closedTrades, savedOpenPositions: savedState.activeTrades.length,
    tradingPaused: stateManager.isPaused(), wrappersInstalled: false,
    availabilityBeforeRestart, availabilityAfterRestart,
    actualStrategyExecutorStateManagerAndJournal: true,
    limits: ['Synthetic prices/accounts and paper fills inside test-isolated.py.', 'No live process restart, actual broker order or live browser acceptance.'],
  }));
}
main().finally(() => {
  fs.appendFileSync = appendFile;
  bridge.destroy();
  orchestrator.mtfAdapter.destroy();
  for (const bySymbol of orchestrator.symbolStrategyModules.values()) for (const byFrame of bySymbol.values()) for (const module of byFrame.values()) module.destroy?.();
}).catch(error => { console.error(error); process.exitCode = 1; });
