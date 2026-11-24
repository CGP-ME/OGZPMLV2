'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const root = process.cwd();
const logs = [];
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push({ level, message: args.join(' ') });
const envFile = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(envFile, 'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.PROFILE = 'paper';
process.env.DOTENV_CONFIG_PATH = envFile;
const ConfigLoader = require(root + '/foundation/ConfigLoader');
const resolvedConfig = ConfigLoader.load({ role: 'bot', silent: true });
const stateManager = require(root + '/core/StateManager').getInstance();
stateManager.initializeFreshState(100000, { source: 'isolated_liveness_observation' });
const { CandleStore } = require(root + '/core/CandleStore');
const CandleProcessor = require(root + '/core/CandleProcessor');
const { emitTrace, subscribeTrace } = require(root + '/core/TraceSpine');
const { toTimestampMs } = require(root + '/foundation/ohlc-normalize');
const source = fs.readFileSync('run-empire-v2.js', 'utf8');
const ast = require('acorn').parse(source, { ecmaVersion: 'latest' });
const owner = ast.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'OGZPrimeV14Bot');
const names = ['_normalizeHydrationCandle', '_getRestRecoveryScopeEnvelope', '_getBootHydrationSymbols', '_getLivenessSymbol', '_getLivenessTimeframe', '_activeTimeframeSilenceLimitMs', '_markActiveTimeframeData', '_recoverDataFeedPauseIfFresh', '_attemptLivenessBackfill', 'startLivenessWatchdog'];
const methods = owner.body.body.filter(n => names.includes(n.key.name)).map(n => source.slice(n.start, n.end));
assert.equal(methods.length, names.length);
let now = Date.parse('2026-11-24T18:04:30Z'), tick, sequence = 0;
const FixedDate = class extends Date { static now() { return now; } };
const BotMethods = vm.runInNewContext('(class ObservedRunner {\n' + methods.join('\n') + '\n})', {
  Date: FixedDate, console, resolvedConfig, stateManager, emitTrace,
  ohlcTimestampMs: toTimestampMs,
  normalizeRuntimeSymbol: s => typeof s === 'string' ? s.trim().toUpperCase() : null,
  createTraceId: prefix => prefix + '-' + (++sequence),
  setInterval: callback => { tick = callback; return 1; },
});
const traces = [];
const unsubscribe = subscribeTrace(t => traces.push(t));
const requests = [];
let response = [], rejectRequest = false;
const broker = {
  getBrokerName: () => 'alpaca',
  async getCandles(symbol, timeframe, limit) {
    requests.push({ symbol, timeframe, limit });
    if (rejectRequest) throw new Error('fixture provider unavailable');
    return structuredClone(response);
  },
};
const store = new CandleStore({ maxCandles: 200 });
const contexts = new Map();
const bot = Object.assign(new BotMethods(), {
  config: { ...resolvedConfig.config, executionMode: 'paper', brokerId: 'alpaca', accountId: 'fixture-account', assetClass: 'stocks' },
  sessionRouter: { activeBroker: broker, activeSession: 'stocks', activeCallbackEpoch: 1, stockSymbols: ['TSLA', 'NVDA'], cryptoSymbols: ['BTC-USD'], transitionInProgress: false, failedSafeMode: false },
  tradingPair: 'TSLA', candleTimeframe: '1m', observationTimeframes: ['1m', '5m'],
  priceHistory: [], _candleStore: store, symbolContexts: new Map(),
  candleAggregator: { getIntervalMs: tf => ({ '1m': 60000, '5m': 300000 })[tf] },
  _runtimeOperations: new Map(), operations: [],
  _trackRuntimeOperation(name, operation) { const promise = operation(); this.operations.push(promise); return promise; },
  _isExpectedMarketQuiet: () => false,
  getSymbolTimeframeContext(symbol, timeframe) { return contexts.get(symbol + ':' + timeframe); },
  getCandleScopeEnvelope: ({ timeframe, brokerId }) => ({ timeframe, brokerId, accountId: 'fixture-account', accountIdSource: 'fixture', assetClass: 'stocks', executionMode: 'paper', sessionRouterEpoch: 1 }),
  strategyOrchestrator: { ingestMarketCandle() {} },
  saveCandleHistory() {},
});
for (const symbol of ['TSLA', 'NVDA']) for (const timeframe of ['1m', '5m']) {
  const ctx = { symbol, timeframe, get priceHistory() { return store.getCandles(symbol, timeframe); }, indicatorEngine: { updateCandle() {} } };
  contexts.set(symbol + ':' + timeframe, ctx);
  if (timeframe === '1m') bot.symbolContexts.set(symbol, ctx);
}
bot.candleProcessor = new CandleProcessor(bot);
const bar = end => ({ t: end - 60000, etime: end, o: 100, h: 102, l: 99, c: 101, v: 1000 });
async function watchdog() { const offset = bot.operations.length; tick(); await Promise.all(bot.operations.slice(offset)); }
async function main() {
  const observations = {};
  bot.startLivenessWatchdog();
  now += 600000;
  bot.lastBrokerDataReceived = now;
  bot.lastActiveTimeframeDataReceived = now;
  bot.lastActiveTimeframeSymbol = 'TSLA';
  bot.lastActiveTimeframe = '1m';
  await watchdog();
  observations.otherSymbolMissing = { requested: requests.splice(0), missingPairBars: contexts.get('NVDA:1m').priceHistory.length };
  const scope = bot.getCandleScopeEnvelope({ timeframe: '1m', brokerId: 'alpaca' });
  bot.candleProcessor.processNewCandle({ ...bar(now - 30000), ...scope, symbol: 'TSLA' }, { persist: false });
  bot.candleProcessor.processNewCandle({ ...bar(now - 630000), ...scope, symbol: 'NVDA' }, { persist: false });
  await watchdog();
  observations.otherSymbolStalled = { requested: requests.splice(0), primaryEndTime: contexts.get('TSLA:1m').priceHistory.at(-1).etime, stalledEndTime: contexts.get('NVDA:1m').priceHistory.at(-1).etime };
  response = [bar(now + 30000)];
  bot.lastBrokerDataReceived = now - 600000;
  bot.lastActiveTimeframeDataReceived = now - 600000;
  const beforeFuture = traces.length;
  await watchdog();
  observations.futureOnlyResponse = { requested: requests.splice(0), stored: store.getCandles('TSLA', '1m'), lastBrokerDataReceived: bot.lastBrokerDataReceived, receiptTime: now, statePrice: stateManager.getLastPrice('TSLA'), traces: traces.slice(beforeFuture) };
  response = [bar(now - 30000)];
  const beforeValid = traces.length;
  const completedApplied = await bot._attemptLivenessBackfill('TSLA', '1m');
  const duplicateApplied = await bot._attemptLivenessBackfill('TSLA', '1m');
  observations.validThenDuplicate = { completedApplied, duplicateApplied, requested: requests.splice(0), traces: traces.slice(beforeValid) };
  rejectRequest = true;
  bot.lastBrokerDataReceived = now - 600000;
  bot.lastActiveTimeframeDataReceived = now - 600000;
  const beforeFailure = traces.length;
  await watchdog();
  observations.providerUnavailable = { requested: requests.splice(0), symbolHalted: stateManager.isSymbolHalted('TSLA'), traces: traces.slice(beforeFailure) };
  assert.equal(observations.otherSymbolMissing.requested.length, 0);
  assert.equal(observations.otherSymbolStalled.requested.length, 0);
  assert.equal(observations.futureOnlyResponse.lastBrokerDataReceived, now);
  assert.equal(observations.futureOnlyResponse.statePrice, null);
  assert.equal(observations.validThenDuplicate.duplicateApplied, 1);
  assert.equal(observations.providerUnavailable.symbolHalted, false);
  unsubscribe();
  bot.candleProcessor.cleanup();
  process.stdout.write(JSON.stringify({ sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), isolation: true, externalBoundary: 'synthetic broker responses; actual runner methods, CandleProcessor and CandleStore', observations, logs }, null, 2) + '\n');
}
main().then(() => process.exit(0), error => { process.stderr.write(error.stack + '\n'); process.exit(1); });
