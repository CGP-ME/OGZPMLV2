'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto'), acorn = require('acorn');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const overlay = process.argv.find(v => v.startsWith('--source='));
if (overlay) for (const [f, s] of Object.entries(JSON.parse(fs.readFileSync(overlay.slice(9))))) fs.writeFileSync(f, s);
const baseline = process.argv.includes('--baseline'), logs = [], traces = [], rawIngress = [], results = [];
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push({ level, text: args.join(' ') });
const dotenv = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(dotenv, 'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.DOTENV_CONFIG_PATH = dotenv; process.env.PROFILE = 'paper';
const ConfigLoader = require(process.cwd() + '/foundation/ConfigLoader');
const resolvedConfig = ConfigLoader.load({ role: 'bot', silent: true });
const Kraken = require(process.cwd() + '/brokers/KrakenIBrokerAdapter');
const Alpaca = require(process.cwd() + '/brokers/AlpacaAdapter');
const SessionRouter = require(process.cwd() + '/core/SessionRouter');
const CandleProcessor = require(process.cwd() + '/core/CandleProcessor');
const { CandleStore } = require(process.cwd() + '/core/CandleStore');
const trace = require(process.cwd() + '/core/TraceSpine');
const stop = trace.subscribeTrace(e => traces.push(e));
const source = fs.readFileSync('run-empire-v2.js', 'utf8'), nodes = [];
function walk(n) { if (!n || typeof n !== 'object') return; if (n.type) nodes.push(n); for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
walk(acorn.parse(source, { ecmaVersion: 'latest' }));
const runnerClass = nodes.find(n => n.type === 'ClassDeclaration' && n.id.name === 'OGZPrimeV14Bot');
const frames = { '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '4h': 14400000, '1d': 86400000 };
const krakenCapture = JSON.parse(fs.readFileSync('ogz-meta/inbox/codex/2026-11-22/stop2-kraken-history-pacing/fixtures/native-ohlc.json'));
const alpacaCapture = JSON.parse(fs.readFileSync('ogz-meta/inbox/codex/2026-11-21/stop2-stock-history-window/fixtures/alpaca-native.json'));
function run(kind) {
  const adapter = kind === 'kraken' ? new Kraken({ apiKey: 'fixture-key', apiSecret: 'fixture-secret' }) : new Alpaca({ apiKey: 'fixture-key', apiSecret: 'fixture-secret', mode: 'paper' });
  assert.equal(adapter.id, undefined);
  const session = kind === 'kraken' ? 'crypto' : 'stocks', symbol = kind === 'kraken' ? 'BTC-USD' : 'TSLA';
  const store = new CandleStore({ maxCandles: 2000 }), contexts = new Map();
  const router = new SessionRouter({ mode: 'static', staticSession: session, stockSymbols: ['TSLA'], cryptoSymbols: ['BTC-USD'], transitionStoreOptions: { dir: path.join(__dirname, 'router-' + kind) } });
  const bot = { config: { ...resolvedConfig.config, brokerId: kind, assetClass: session, executionMode: 'paper' }, tradingPair: symbol, candleTimeframe: '1m',
    observationTimeframes: Object.keys(frames), evaluationTimeframes: [], sessionRouter: router, sessionRouterConfig: { mode: 'static', staticSession: session },
    brokerAccountIdentities: new Map([[kind, { accountId: 'fixture-' + kind, accountIdSource: 'broker:fixture' }]]),
    symbolContexts: new Map(), timeframeDiagnostics: {}, _candleStore: store, priceHistory: [], candleSaveCounter: 0, saveCandleHistory() {},
    strategyOrchestrator: { ingestMarketCandle() {} },
    getSymbolTimeframeContext(s, tf) { if (!contexts.has(tf)) contexts.set(tf, { symbol: s, timeframe: tf, get priceHistory() { return store.getCandles(s, tf); }, indicatorEngine: { updateCandle() {} } }); return contexts.get(tf); },
    _markActiveTimeframeData() {}, syncDashboardRuntimeScope() {},
  };
  const sandbox = vm.createContext({ bot, Date, console, Set, Map, ConfigLoader, resolvedConfig, stateManager: null,
    createTraceId: trace.createTraceId,
    emitTrace(ctx, event, fields) { if (event === 'CANDLE_INGRESS') rawIngress.push({ ...fields }); trace.emitTrace(ctx, event, fields); },
    ...require(process.cwd() + '/foundation/ohlc-normalize'), ...require(process.cwd() + '/core/ReplayClosedCandleBoundary'),
  });
  for (const name of ['normalizeRuntimeSymbol', 'describeSymbolContexts', 'ohlcTimestampMs', 'normalizeOhlcForProcessor']) {
    const n = nodes.find(n => n.type === 'FunctionDeclaration' && n.id.name === name); assert.ok(n, name);
    vm.runInContext(source.slice(n.start, n.end), sandbox);
  }
  for (const name of ['isSessionRoutingActive', '_brokerIdForSession', '_assetClassForSession', 'getCandleScopeEnvelope', 'cleanRuntimeAccountId', 'normalizeBrokerId', 'resolveBrokerAccountScope', 'brokerIdFromAdapter', 'handleMarketData', '_isExpectedMarketQuiet']) {
    const n = runnerClass.body.body.find(n => n.key.name === name); assert.ok(n, name);
    bot[name] = vm.runInContext('({' + source.slice(n.start, n.end) + '})[' + JSON.stringify(name) + ']', sandbox);
  }
  bot.candleProcessor = new CandleProcessor(bot);
  bot.marketCalendar = bot.candleProcessor.marketCalendar;
  const handler = nodes.find(n => n.type === 'VariableDeclarator' && n.id.name === 'ohlcHandler');
  router.wire(kind === 'kraken' ? adapter : null, kind === 'alpaca' ? adapter : null, null,
    vm.runInContext('(function(){ return (' + source.slice(handler.init.start, handler.init.end) + '); }).call(bot)', sandbox), bot);
  router.activeBroker = adapter; router.activeSession = session; router.transitionInProgress = false;
  router._attachActiveOhlcCallback(session, adapter, { transitionId: 'fixture-transition-' + kind, epoch: 1 });
  for (const [frame, ms] of Object.entries(frames)) {
    let candle;
    if (kind === 'kraken') {
      const row = krakenCapture.observations.find(o => o.interval === ms / 60000).response.result.XXBTZUSD.at(-2);
      candle = { t: Number(row[0]) * 1000, etime: Number(row[0]) * 1000 + ms, o: Number(row[1]), h: Number(row[2]), l: Number(row[3]), c: Number(row[4]), v: Number(row[6]) };
    } else {
      const row = alpacaCapture.lanes.bot[frame].response.bars[0];
      candle = { t: Date.parse(row.t), etime: Date.parse(row.t) + ms, o: Number(row.o), h: Number(row.h), l: Number(row.l), c: Number(row.c), v: Number(row.v) };
    }
    const traceId = kind + '-' + frame;
    adapter.emit('ohlc', { data: candle, symbol, timeframe: frame, traceId, priceTimestamp: Date.now(), sourceEventTime: Date.now(), sourceEventKind: 'captured_native_fixture' });
    const emitted = rawIngress.at(-1), scoped = traces.find(t => t.traceId === traceId && t.event === 'CANDLE_NORMALIZED'), intake = traces.find(t => t.traceId === traceId && t.event === 'CANDLE_PROCESSOR_RECEIVED');
    assert.equal(emitted.brokerId, baseline ? null : kind);
    assert.equal(scoped.brokerId, kind); assert.equal(scoped.accountId, 'fixture-' + kind);
    assert.ok(intake); assert.equal(intake.brokerId, kind);
    assert.equal(store.getCandles(symbol, frame).length, 1);
    assert.equal(store.getCandles(symbol, frame)[0].c, candle.c);
    results.push({ broker: kind, timeframe: frame, adapterHasId: Object.hasOwn(adapter, 'id'), ingressProducerBrokerId: emitted.brokerId, normalizedBrokerId: scoped.brokerId, processorBrokerId: intake.brokerId, originalClose: candle.c, storedClose: store.getCandles(symbol, frame)[0].c, sessionEpoch: scoped.fields.sessionRouterEpoch });
  }
  const start = logs.length; const expectedQuiet = bot._isExpectedMarketQuiet();
  const quietLogs = logs.slice(start).filter(l => l.text.includes('[WATCHDOG] market data quiet expected'));
  if (kind === 'alpaca' && expectedQuiet) assert.ok(quietLogs.every(l => l.text.includes('broker=' + (baseline ? 'null' : 'alpaca'))));
  results.push({ broker: kind, adapterIdentityMethod: bot.brokerIdFromAdapter(adapter), expectedQuiet, quietLogs });
  bot.candleProcessor.cleanup();
}
run('kraken'); run('alpaca'); stop();
const files = ['run-empire-v2.js', 'core/SessionRouter.js', 'core/TraceSpine.js', 'core/CandleProcessor.js', 'brokers/KrakenIBrokerAdapter.js', 'brokers/AlpacaAdapter.js'];
process.stdout.write(JSON.stringify({ baseline, isolation: 'test-isolated.py', results, sourceHashes: Object.fromEntries(files.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])), limitations: ['Real adapter identity methods and SessionRouter callback attachment/fence execute. The runner handler and scope methods are extracted by AST from the exact source and execute unchanged, feeding real CandleProcessor and CandleStore.', 'Captured native OHLCV is emitted locally; no external connections, broker orders, full bot boot or PM2 activation occur. Indicators, strategy ingestion and dashboard dispatch are observation seams.', 'Before repair the raw ingress producer omits the broker; TraceSpine/session lookup still repairs downstream scope. This is a producer provenance correction, not evidence of previously observed misrouted trades.'] }, null, 2) + '\n');
