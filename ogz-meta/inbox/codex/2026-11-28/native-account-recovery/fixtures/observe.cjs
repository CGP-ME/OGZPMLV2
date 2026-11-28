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
  clear();
  for (const symbol of ['TSLA', 'NVDA']) for (const tf of frames) ingress(symbol, tf);
  assert.deepEqual(Array.from(bot._getBootHydrationSymbols()), ['TSLA', 'NVDA']);
  const halted = await stateManager.haltSymbol('TSLA', 'fixture prior native outage', {
    code: 'native_feed_unavailable', source: 'native_feed_watchdog',
    traceId: 'fixture_prior_outage', brokerId: 'alpaca', accountId: 'fixture-account', timeframe: '1m',
  });
  assert.equal(halted.success, true);
  let releasePositions, snapshotEntered;
  const positionsPending = new Promise(resolve => { releasePositions = resolve; });
  const entered = new Promise(resolve => { snapshotEntered = resolve; });
  let positionRequests = 0;
  broker.getPositions = () => { positionRequests++; snapshotEntered(); return positionsPending; };
  const operationStart = bot.operations.length;
  tick();
  await entered;
  const operationCount = bot.operations.length;
  now += 180000;
  const expiredFrames = bot._getSilentNativeFrames('NVDA').map(frame => frame.timeframe);
  assert.ok(expiredFrames.includes('1m'));
  requestControllers.at(-1).abort();
  mode = 'missed';
  tick();
  await Promise.resolve();
  const blocked = {
    pendingWatchdogOperations: [...bot._runtimeOperations.values()].filter(name => name === 'liveness_check').length,
    positionRequests, firstRequestSignalAborted: requestControllers.at(-1).signal.aborted,
    secondTickStartedAnotherPass: bot.operations.length !== operationCount,
    nvdaExpiredFrames: expiredFrames, nvdaHalted: stateManager.isSymbolHalted('NVDA'),
    nvdaEvidenceCount: traces.filter(trace => trace.event === 'NATIVE_FEED_EVIDENCE' && trace.symbol === 'NVDA').length,
  };
  assert.equal(blocked.pendingWatchdogOperations, 1);
  assert.equal(blocked.firstRequestSignalAborted, true);
  assert.equal(blocked.secondTickStartedAnotherPass, false);
  assert.equal(blocked.nvdaHalted, false);
  assert.equal(blocked.nvdaEvidenceCount, 0);
  releasePositions([]);
  await Promise.all(bot.operations.slice(operationStart));
  const released = {
    nvdaHalted: stateManager.isSymbolHalted('NVDA'),
    pendingWatchdogOperations: [...bot._runtimeOperations.values()].filter(name => name === 'liveness_check').length,
    nvdaEvidenceCount: traces.filter(trace => trace.event === 'NATIVE_FEED_EVIDENCE' && trace.symbol === 'NVDA').length,
  };
  assert.equal(released.nvdaHalted, true);
  assert.equal(released.pendingWatchdogOperations, 0);
  process.stdout.write(JSON.stringify({ sourceReference,
    sourceHashes: Object.fromEntries(['run-empire-v2.js', 'core/SessionRouter.js', 'brokers/AlpacaAdapter.js'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),
    blocked, released,
    limits: ['Actual extracted watchdog/hydration/recovery methods and actual SessionRouter snapshot consumer; controlled pending getPositions promise substitutes the external broker.', 'Synthetic clock advances and explicit abort exercise ownership, not elapsed wall-clock timeout or a real broker outage.', 'This is an inherited unresolved deadline gap; no source repair or live failure frequency is established.']
  }, null, 2) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
