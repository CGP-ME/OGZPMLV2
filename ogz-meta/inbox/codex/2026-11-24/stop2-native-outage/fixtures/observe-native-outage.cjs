'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const root = process.cwd();
if (process.argv.includes('--candidate')) {
  const candidate = JSON.parse(fs.readFileSync(path.join(__dirname, 'candidate-sources.json'), 'utf8'));
  for (const [name, bytes] of Object.entries(candidate.files)) fs.writeFileSync(name, bytes);
}
const logs = [];
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push({ level, message: args.join(' ') });
const env = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(env, 'ALPACA_API_KEY=fixture\nALPACA_API_SECRET=fixture\nKRAKEN_API_KEY=fixture\nKRAKEN_API_SECRET=fixture\nWEBSOCKET_AUTH_TOKEN=fixture\n');
process.env.PROFILE = 'paper';
process.env.DOTENV_CONFIG_PATH = env;
const ConfigLoader = require(root + '/foundation/ConfigLoader');
const resolvedConfig = ConfigLoader.load({ role: 'bot', silent: true });
const stateManager = require(root + '/core/StateManager').getInstance();
const CandleProcessor = require(root + '/core/CandleProcessor');
const { CandleStore } = require(root + '/core/CandleStore');
const TradingLoop = require(root + '/core/TradingLoop');
const SessionRouter = require(root + '/core/SessionRouter');
const { emitTrace, createTraceId, subscribeTrace } = require(root + '/core/TraceSpine');
const { toTimestampMs } = require(root + '/foundation/ohlc-normalize');
let now = Date.parse('2026-11-24T18:04:30Z');
Date.now = () => now;
const source = fs.readFileSync('run-empire-v2.js', 'utf8');
const owner = require('acorn').parse(source, { ecmaVersion: 'latest' }).body
  .find(n => n.type === 'ClassDeclaration' && n.id.name === 'OGZPrimeV14Bot');
const names = ['_normalizeHydrationCandle', '_getRestRecoveryScopeEnvelope', '_getBootHydrationSymbols',
  '_activeTimeframeSilenceLimitMs', '_getSilentNativeFrames', '_recoverDataFeedPauseIfFresh',
  '_attemptLivenessBackfill', 'startLivenessWatchdog', '_quarantineCandleDataSymbol',
  '_resolveCandleDataHalt', 'hydrateActiveTimeframeFromRest'];
const methods = owner.body.body.filter(n => names.includes(n.key.name)).map(n => source.slice(n.start, n.end));
assert.equal(methods.length, names.length);
let tick;
const requestControllers = [];
const Runner = vm.runInNewContext('(class ObservedRunner {\n' + methods.join('\n') + '\n})', {
  Date, console, resolvedConfig, stateManager, emitTrace, createTraceId,
  AbortSignal: { timeout(ms) {
    assert.equal(ms, resolvedConfig.config.dataFeed.livenessCheckIntervalMs);
    const controller = new AbortController(); requestControllers.push(controller); return controller.signal;
  } },
  ohlcTimestampMs: toTimestampMs,
  normalizeRuntimeSymbol: s => typeof s === 'string' ? s.trim().toUpperCase() : null,
  setInterval: callback => { tick = callback; return 1; },
});
const intervals = { '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000,
  '1h': 3600000, '4h': 14400000, '1d': 86400000 };
const frames = Object.keys(intervals);
const traces = [], requests = [], gapRequests = [], observations = {};
subscribeTrace(t => traces.push(t));
let mode = 'valid', pendingRequest = null, quiet = false;
const bar = (tf, end) => ({ t: end - intervals[tf], etime: end, o: 100, h: 102, l: 99, c: 101, v: 1000 });
const broker = {
  getBrokerName: () => 'alpaca', fromBrokerSymbol: s => s,
  getAccountIdentity: () => ({ brokerId: 'alpaca', accountId: 'fixture-account', accountIdSource: 'fixture' }),
  getPositions: async () => [], getOpenOrders: async () => [], getBalance: async () => ({ USD: 100000 }),
  config: { mode: 'paper' },
  async getCandles(symbol, timeframe, limit, range, options) {
    if (range) {
      gapRequests.push({ symbol, timeframe, range });
      return { candles: [], coverage: { ...range, complete: false, reason: 'fixture_gap_not_exercised' } };
    }
    requests.push({ symbol, timeframe, limit, haltedAtRequest: stateManager.isSymbolHalted(symbol) });
    if (mode === 'hung') {
      if (options.signal.aborted) throw new Error('fixture cancelled request');
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('fixture cancelled request')), { once: true });
        queueMicrotask(() => requestControllers.at(-1).abort());
      });
    }
    if (pendingRequest) await pendingRequest;
    if (mode === 'error') throw new Error('fixture provider unavailable');
    const end = Math.floor(now / intervals[timeframe]) * intervals[timeframe];
    const candle = bar(timeframe, end + (mode === 'forming' ? intervals[timeframe] : 0));
    if (mode === 'missing_volume') delete candle.v;
    return [candle];
  },
};
const store = new CandleStore({ maxCandles: 200 });
const contexts = new Map();
const router = new SessionRouter({ mode: 'static', staticSession: 'stocks', stockSymbols: ['TSLA', 'NVDA'],
  cryptoSymbols: ['BTC-USD'], transitionStoreOptions: { dir: path.join(__dirname, 'transition'), staleLockMs: 30000 } });
Object.assign(router, { activeBroker: broker, activeSession: 'stocks', activeCallbackEpoch: 1,
  transitionInProgress: false, failedSafeMode: false });
const loop = Object.create(TradingLoop.prototype);
loop.symbolOperationQueues = new Map(); loop.analyzingSymbols = new Set();
const bot = Object.assign(new Runner(), {
  config: { ...resolvedConfig.config, executionMode: 'paper', brokerId: 'alpaca', accountId: 'fixture-account', assetClass: 'stocks' },
  sessionRouter: router, tradingLoop: loop, tradingPair: 'TSLA', candleTimeframe: resolvedConfig.config.execution.candleTimeframe, observationTimeframes: frames,
  priceHistory: [], _candleStore: store, symbolContexts: new Map(),
  candleAggregator: { getIntervalMs: tf => intervals[tf] },
  _runtimeOperations: new Map(), operations: [],
  _trackRuntimeOperation(name, operation) {
    const promise = operation(); this.operations.push(promise); this._runtimeOperations.set(promise, name);
    promise.finally(() => this._runtimeOperations.delete(promise)); return promise;
  },
  _isExpectedMarketQuiet: () => quiet,
  getSymbolTimeframeContext: (symbol, timeframe) => contexts.get(symbol + ':' + timeframe),
  getCandleScopeEnvelope: ({ timeframe, brokerId = 'alpaca' }) => ({ timeframe, brokerId, accountId: 'fixture-account',
    accountIdSource: 'fixture', assetClass: 'stocks', executionMode: 'paper', sessionRouterEpoch: router.activeCallbackEpoch }),
  strategyOrchestrator: { ingestMarketCandle() {} }, saveCandleHistory() {},
});
for (const symbol of ['TSLA', 'NVDA']) for (const timeframe of frames) {
  const ctx = { symbol, timeframe, lastNativeData: null, get priceHistory() { return store.getCandles(symbol, timeframe); },
    indicatorEngine: { updateCandle() {} } };
  contexts.set(symbol + ':' + timeframe, ctx);
  if (timeframe === bot.candleTimeframe) bot.symbolContexts.set(symbol, ctx);
}
bot.candleProcessor = new CandleProcessor(bot);
function ingress(symbol, timeframe, eventTime = now - 30000, epoch = router.activeCallbackEpoch) {
  const end = Math.floor(now / intervals[timeframe]) * intervals[timeframe];
  return bot.candleProcessor.handleMarketData({
    ...bot.getCandleScopeEnvelope({ timeframe }), symbol, sessionRouterEpoch: epoch,
    data: bar(timeframe, end), sourceEventTime: eventTime, sourceEventKind: 'fixture_native_event',
    traceId: createTraceId('fixture_native'),
  });
}
async function check() { const offset = bot.operations.length; tick(); await Promise.all(bot.operations.slice(offset)); }
function clear() {
  stateManager.initializeFreshState(100000, { source: 'isolated_native_outage' });
  for (const c of contexts.values()) c.lastNativeData = null;
  requests.length = 0; mode = 'valid'; pendingRequest = null; quiet = false;
  bot.startLivenessWatchdog();
}
async function main() {
  clear();
  for (const tf of frames) ingress('TSLA', tf);
  now += 600000;
  for (const tf of frames) ingress('TSLA', tf);
  const before = traces.length;
  await check();
  observations.secondaryMissing = { requests: requests.splice(0), nvdaHalted: stateManager.isSymbolHalted('NVDA'),
    tslaHalted: stateManager.isSymbolHalted('TSLA'), globalPause: stateManager.isPaused(), traces: traces.slice(before) };
  assert.equal(observations.secondaryMissing.nvdaHalted, true);
  assert.equal(observations.secondaryMissing.tslaHalted, false);
  assert.equal(observations.secondaryMissing.globalPause, false);
  assert.ok(observations.secondaryMissing.requests.every(r => r.symbol === 'NVDA' && r.haltedAtRequest));
  assert.equal(contexts.get('NVDA:1m').lastNativeData, null, 'REST must not create native liveness');

  const oldRoot = bot.marketData;
  const oldBase = contexts.get('NVDA:' + bot.candleTimeframe).marketData;
  const higher = await bot._attemptLivenessBackfill('NVDA', '1h');
  observations.higherHistory = { result: higher, rootPreserved: bot.marketData === oldRoot,
    basePreserved: contexts.get('NVDA:' + bot.candleTimeframe).marketData === oldBase, frame: contexts.get('NVDA:1h').marketData.timeframe };
  assert.equal(observations.higherHistory.rootPreserved, true);
  assert.equal(observations.higherHistory.basePreserved, true);
  assert.equal(observations.higherHistory.frame, '1h');

  mode = 'forming';
  const forming = await bot._attemptLivenessBackfill('NVDA', '1m');
  observations.formingOnly = forming;
  assert.equal(forming.status, 'unavailable');
  assert.equal(forming.reason, 'completed_history_not_current');
  mode = 'missing_volume';
  observations.missingVolume = await bot._attemptLivenessBackfill('NVDA', '1m');
  assert.equal(observations.missingVolume.reason, 'invalid_rest_candles');
  mode = 'error';
  observations.restFailure = await bot._attemptLivenessBackfill('NVDA', '1m');
  assert.equal(observations.restFailure.reason, 'rest_request_failed');
  mode = 'valid';

  await stateManager.haltSymbol('NVDA', 'fixture independent order uncertainty', {
    code: 'broker_order_reconciliation_required', traceId: 'fixture_other_cause', brokerId: 'alpaca', accountId: 'fixture-account' });
  for (const tf of frames) ingress('NVDA', tf);
  await check();
  const saved = JSON.parse(fs.readFileSync(ConfigLoader.get('paths.stateFile'), 'utf8'));
  observations.recovery = { dataHalted: stateManager.isSymbolHalted('NVDA', 'native_feed_unavailable'),
    unrelatedHalted: stateManager.isSymbolHalted('NVDA', 'broker_order_reconciliation_required'), savedHalt: saved.symbolEntryHalts.NVDA };
  assert.equal(observations.recovery.dataHalted, false);
  assert.equal(observations.recovery.unrelatedHalted, true);

  clear();
  for (const symbol of ['TSLA', 'NVDA']) for (const tf of frames) ingress(symbol, tf);
  now += 600000;
  for (const tf of frames) ingress('TSLA', tf);
  for (const tf of frames.filter(tf => tf !== '5m')) ingress('NVDA', tf);
  await check();
  observations.higherFrameStalled = { requests: requests.splice(0), halted: stateManager.isSymbolHalted('NVDA') };
  assert.deepEqual(observations.higherFrameStalled.requests.map(r => r.timeframe), ['5m']);
  assert.equal(observations.higherFrameStalled.halted, true);

  clear();
  const first = ingress('TSLA', '1m');
  const beforeDelayed = contexts.get('TSLA:1m').lastNativeData;
  ingress('TSLA', '1m', now - 600000);
  ingress('TSLA', '1m', now + 60000);
  observations.badEventClock = { unchanged: contexts.get('TSLA:1m').lastNativeData === beforeDelayed,
    acceptedCandle: Boolean(first.candle) };
  assert.equal(observations.badEventClock.unchanged, true);

  clear(); now += 600000;
  let release;
  pendingRequest = new Promise(resolve => { release = resolve; });
  const late = bot._attemptLivenessBackfill('NVDA', '1m');
  const beforeLate = contexts.get('NVDA:1m').marketData;
  router.activeCallbackEpoch += 1; release();
  observations.retiredRequest = { result: await late, unchanged: contexts.get('NVDA:1m').marketData === beforeLate };
  assert.equal(observations.retiredRequest.result.status, 'cancelled');
  assert.equal(observations.retiredRequest.unchanged, true);
  pendingRequest = null;
  await check();
  observations.newEpochGrace = { requests: requests.splice(0), nvdaHalted: stateManager.isSymbolHalted('NVDA') };
  assert.equal(observations.newEpochGrace.nvdaHalted, false);

  clear(); quiet = true; now += 3 * 86400000; await check(); quiet = false;
  await check();
  observations.expectedQuiet = { requests: requests.splice(0), nvdaHalted: stateManager.isSymbolHalted('NVDA') };
  assert.equal(observations.expectedQuiet.requests.length, 0);
  assert.equal(observations.expectedQuiet.nvdaHalted, false);
  now += 180000; await check();
  observations.missingAfterOpeningWindow = { halted: stateManager.isSymbolHalted('NVDA'), requests: requests.splice(0) };
  assert.equal(observations.missingAfterOpeningWindow.halted, true);
  clear();
  await stateManager.haltSymbol('NVDA', 'fixture saved data outage', {
    code: 'native_feed_unavailable', traceId: 'fixture_saved_data_cause', brokerId: 'alpaca', accountId: 'fixture-account' });
  await check();
  observations.startupIsNotRecovery = { halted: stateManager.isSymbolHalted('NVDA', 'native_feed_unavailable'),
    nativeFramesObserved: frames.filter(tf => contexts.get('NVDA:' + tf).lastNativeData !== null) };
  assert.equal(observations.startupIsNotRecovery.halted, true, 'startup grace is not evidence that native data returned');
  clear(); mode = 'hung'; now += 600000; await check();
  observations.cancelledRecovery = { halted: ['TSLA', 'NVDA'].filter(s => stateManager.isSymbolHalted(s)),
    operationsRemaining: bot._runtimeOperations.size,
    failures: traces.filter(t => t.event === 'LIVENESS_REST_RESULT' && t.fields?.error === 'fixture cancelled request').length };
  assert.deepEqual(observations.cancelledRecovery.halted, ['TSLA', 'NVDA']);
  assert.equal(observations.cancelledRecovery.operationsRemaining, 0);
  assert.ok(observations.cancelledRecovery.failures > 0);
  bot.candleProcessor.cleanup();
  process.stdout.write(JSON.stringify({ sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    isolation: true, observations, logs, gapRequests,
    limits: ['Synthetic broker responses, native event timestamps and clock; no real broker outage or orders.',
      'Actual runner methods, CandleProcessor, CandleStore, symbol operation queue, StateManager persistence and SessionRouter REST snapshot machinery.',
      'Notification transport is not exercised; trace events and independent paper-close receipt are recorded.'] }, null, 2) + '\n');
}
main().then(() => process.exit(0), error => { process.stderr.write(error.stack + '\n'); process.exit(1); });
