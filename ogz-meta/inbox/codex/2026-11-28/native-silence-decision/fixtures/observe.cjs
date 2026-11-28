'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const root = process.cwd();
const sourceCapsuleArgument = process.argv.find(arg => arg.startsWith('--source-capsule='));
let sourceReference = 'working-snapshot';
if (sourceCapsuleArgument) {
  const capsule = JSON.parse(fs.readFileSync(path.resolve(root, sourceCapsuleArgument.slice('--source-capsule='.length)), 'utf8'));
  sourceReference = capsule.sourceRef;
  for (const [file, item] of Object.entries(capsule.files)) {
    assert.ok(!path.isAbsolute(file) && !file.split('/').includes('..'));
    assert.equal(crypto.createHash('sha256').update(item.content).digest('hex'), item.sha256);
    fs.writeFileSync(path.join(root, file), item.content);
  }
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
  '_attemptLivenessBackfill', '_inspectNativeSilence', 'startLivenessWatchdog', '_quarantineCandleDataSymbol',
  '_resolveCandleDataHalt', 'hydrateActiveTimeframeFromRest'];
const methods = owner.body.body.filter(n => names.includes(n.key.name)).map(n => source.slice(n.start, n.end));
assert.ok(methods.length === names.length || methods.length === names.length - 1);
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
let mode = 'valid', pendingRequest = null, quiet = false, healthStatus = 'HEALTHY', recovering = null;
const anchors = new Map();
const bar = (tf, end) => ({ t: end - intervals[tf], etime: end, o: 100, h: 102, l: 99, c: 101, v: 1000 });
const broker = {
  getBrokerName: () => 'alpaca', fromBrokerSymbol: s => s,
  getHealth: () => ({ status: healthStatus, timestamp: now, failureReason: healthStatus === 'HEALTHY' ? null : 'fixture disconnected socket' }),
  getAccountIdentity: () => ({ brokerId: 'alpaca', accountId: 'fixture-account', accountIdSource: 'fixture' }),
  getPositions: async () => [], getOpenOrders: async () => [], getBalance: async () => ({ USD: 100000 }),
  config: { mode: 'paper' },
  async getCandles(symbol, timeframe, limit, range, options) {
    if (range) {
      gapRequests.push({ symbol, timeframe, range });
      if (mode === 'range_throw') throw new Error('fixture REST unavailable');
      if (mode === 'resume_then_throw') {
        if (recovering) { const action = recovering; recovering = null; action(); }
        throw new Error('fixture REST failed after native resumed');
      }
      if (mode === 'range_cancel') {
        requestControllers.at(-1).abort();
        throw new Error('fixture REST cancelled at the existing deadline');
      }
      if (mode === 'error') return { candles: [], coverage: { ...range, complete: false, reason: 'provider_request_failed' } };
      const anchor = bar(timeframe, range.start + intervals[timeframe]);
      const rows = [anchor];
      if (mode === 'missed') rows.push(bar(timeframe, Math.floor(range.end / intervals[timeframe]) * intervals[timeframe]));
      if (recovering && (!recovering.frame || recovering.frame === timeframe)) { const action = recovering; recovering = null; action(); }
      return { candles: rows, coverage: { ...range, complete: true, reason: null, source: 'fixture_native_range', pagesExhausted: true } };
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
    const candle = mode === 'sparse' && anchors.has(symbol + ':' + timeframe) ? anchors.get(symbol + ':' + timeframe) : bar(timeframe, end + (mode === 'forming' ? intervals[timeframe] : 0));
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
  requests.length = 0; gapRequests.length = 0; traces.length = 0; anchors.clear(); mode = 'valid'; pendingRequest = null; quiet = false; healthStatus = 'HEALTHY'; recovering = null;
  bot.startLivenessWatchdog();
}

function seed() {
  clear();
  for (const symbol of ['TSLA', 'NVDA']) for (const tf of frames) {
    ingress(symbol, tf);
    anchors.set(symbol + ':' + tf, { ...contexts.get(symbol + ':' + tf).priceHistory.at(-1) });
  }
  now += 180000;
  for (const tf of frames) ingress('TSLA', tf);
  for (const tf of frames.filter(tf => tf !== '1m')) ingress('NVDA', tf);
}
function result() {
  return { nvdaHalted: stateManager.isSymbolHalted('NVDA'), tslaHalted: stateManager.isSymbolHalted('TSLA'),
    globalPause: stateManager.isPaused(), rangeRequests: gapRequests.slice(),
    native: contexts.get('NVDA:1m').lastNativeData,
    alarms: traces.filter(t => t.event === 'NATIVE_FEED_SYMBOL_ALARM'),
    evidence: traces.filter(t => t.event === 'NATIVE_FEED_EVIDENCE') };
}
async function main() {
  seed(); mode = 'sparse'; const nativeBefore = JSON.stringify(contexts.get('NVDA:1m').lastNativeData);
  await check(); observations.quiet = result();
  observations.quiet.nativeUnchanged = nativeBefore === JSON.stringify(contexts.get('NVDA:1m').lastNativeData);
  if (!process.argv.includes('--expect-repair')) {
    assert.equal(observations.quiet.nvdaHalted, true, 'baseline must reproduce the false halt');
  } else {
    assert.equal(observations.quiet.nvdaHalted, false, 'no provider bar is not data loss');
    assert.equal(observations.quiet.nativeUnchanged, true, 'REST must not renew native health');
    seed();
    ingress('NVDA', '1m'); mode = 'range_throw';
    const beforeFreshCheck = gapRequests.length;
    await check(); observations.freshWhileRestUnavailable = result();
    observations.freshWhileRestUnavailable.watchdogRangeRequests = gapRequests.slice(beforeFreshCheck);
    assert.equal(observations.freshWhileRestUnavailable.nvdaHalted, false);
    assert.equal(observations.freshWhileRestUnavailable.tslaHalted, false);
    assert.equal(observations.freshWhileRestUnavailable.watchdogRangeRequests.length, 0,
      'fresh native frames do not request silence verification');
    seed(); mode = 'range_throw';
    await check(); observations.expiredRestThrow = result();
    assert.equal(observations.expiredRestThrow.nvdaHalted, true);
    assert.equal(observations.expiredRestThrow.tslaHalted, false);
    assert.equal(observations.expiredRestThrow.globalPause, false);
    assert.ok(observations.expiredRestThrow.evidence.some(t => t.fields.reason === 'history_request_failed'
      && t.fields.confirmed === false && t.fields.status === 'unverified'));
    seed(); mode = 'range_cancel';
    await check(); observations.expiredRestCancelled = result();
    assert.equal(observations.expiredRestCancelled.nvdaHalted, true);
    assert.equal(observations.expiredRestCancelled.tslaHalted, false);
    assert.equal(observations.expiredRestCancelled.globalPause, false);
    seed(); mode = 'resume_then_throw'; recovering = () => ingress('NVDA', '1m');
    await check(); observations.resumedWhileRestFails = result();
    assert.equal(observations.resumedWhileRestFails.nvdaHalted, false);
    assert.equal(observations.resumedWhileRestFails.tslaHalted, false);
    assert.ok(observations.resumedWhileRestFails.evidence.some(t => t.fields.status === 'unverified'),
      'the late REST failure remains visible even though the retired native suspicion does not halt');
    seed(); mode = 'missed'; await check(); observations.missed = result();
    assert.equal(observations.missed.nvdaHalted, true);
    assert.equal(observations.missed.tslaHalted, false);
    assert.equal(observations.missed.globalPause, false);
    seed(); mode = 'missed';
    const oldClock = contexts.get('NVDA:1m').lastNativeData.eventTimeMs;
    const delayedEnd = Math.floor((now - bot.config.dataFeed.staleDataMaxAgeMs - 1) / intervals['1m']) * intervals['1m'];
    bot.candleProcessor.handleMarketData({ ...bot.getCandleScopeEnvelope({ timeframe: '1m' }), symbol: 'NVDA',
      sessionRouterEpoch: router.activeCallbackEpoch, data: bar('1m', delayedEnd), sourceEventTime: delayedEnd,
      sourceEventKind: 'alpaca_minute_bar', traceId: createTraceId('fixture_delayed') });
    await check(); observations.delayedOnly = { ...result(), oldClock,
      received: traces.filter(t => t.event === 'CANDLE_PROCESSOR_RECEIVED').map(t => ({ symbol: t.symbol, timeframe: t.timeframe, sourceEventStatus: t.fields.sourceEventStatus, sourceEventAgeMs: t.fields.sourceEventAgeMs })).filter(t => t.symbol === 'NVDA' && t.timeframe === '1m') };
    assert.equal(observations.delayedOnly.nvdaHalted, true);
    assert.equal(observations.delayedOnly.native.eventTimeMs, oldClock);
    seed(); mode = 'error'; await check(); observations.unknown = result();
    assert.equal(observations.unknown.nvdaHalted, true, 'expired native input plus failed verification must invoke symbol protection');
    assert.equal(observations.unknown.tslaHalted, false);
    assert.equal(observations.unknown.globalPause, false);
    assert.equal(observations.unknown.evidence.some(t => t.fields.status === 'unverified' && t.fields.confirmed === false), true, 'unknown history must remain explicitly unverified');
    seed(); mode = 'sparse'; healthStatus = 'UNHEALTHY'; await check(); observations.blip = result();
    assert.equal(observations.blip.nvdaHalted, false);
    now += bot.config.dataFeed.maxDataSilenceMs + 1;
    await check(); observations.disconnected = result();
    assert.equal(observations.disconnected.nvdaHalted, true);
    assert.equal(observations.disconnected.tslaHalted, true);
    assert.equal(observations.disconnected.globalPause, false);
    seed(); mode = 'missed'; recovering = () => ingress('NVDA', '1m'); await check(); observations.resumedDuringRequest = result();
    assert.equal(observations.resumedDuringRequest.nvdaHalted, false);
    seed();
    now += 600000;
    for (const tf of frames) ingress('TSLA', tf);
    for (const tf of frames.filter(tf => !['1m', '5m'].includes(tf))) ingress('NVDA', tf);
    mode = 'missed';
    recovering = () => { ingress('NVDA', '1m'); ingress('NVDA', '5m'); };
    recovering.frame = '5m';
    await check(); observations.resumedDuringOtherFrame = result();
    assert.equal(observations.resumedDuringOtherFrame.nvdaHalted, false);
    seed(); mode = 'missed'; recovering = () => { router.activeCallbackEpoch++; }; await check(); observations.retiredDuringRequest = result();
    assert.equal(observations.retiredDuringRequest.nvdaHalted, false);
    clear();
    const eventTime = now - 1000, tf = '5m', newestEnd = Math.floor(now / intervals[tf]) * intervals[tf];
    for (const end of [newestEnd - intervals[tf], newestEnd, newestEnd - intervals[tf]]) {
      bot.candleProcessor.handleMarketData({ ...bot.getCandleScopeEnvelope({ timeframe: tf }), symbol: 'NVDA',
        sessionRouterEpoch: router.activeCallbackEpoch, data: bar(tf, end), sourceEventTime: eventTime,
        sourceEventKind: 'alpaca_rest_refresh_trigger', traceId: createTraceId('fixture_native_batch') });
    }
    observations.sameClockBatch = { native: contexts.get('NVDA:5m').lastNativeData, expectedStart: newestEnd - intervals[tf] };
    assert.equal(observations.sameClockBatch.native.candleStartTimeMs, observations.sameClockBatch.expectedStart);
    assert.equal(observations.sameClockBatch.native.eventTimeMs, eventTime);

  }
  process.stdout.write(JSON.stringify({ sourceReference, sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), observations,
    limits: ['Actual runner methods, native ingress, symbol state, recovery and queue execute in isolation. Provider replies and clock are synthetic.',
      'No real broker disconnection or orders; separate live MARA trace establishes the false financial action.'] }, null, 2) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
