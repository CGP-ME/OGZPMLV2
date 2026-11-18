'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
const acorn = require('acorn');
const baseline = process.argv.includes('--baseline');
const override = process.argv.find(arg => arg.endsWith('.json'));
if (override) {
  for (const [filename, source] of Object.entries(JSON.parse(fs.readFileSync(override, 'utf8')))) {
    fs.writeFileSync(filename, source);
  }
}
const sourceHashes = {};
function readSource(filename) {
  const source = fs.readFileSync(filename, 'utf8'), nodes = [];
  sourceHashes[filename] = crypto.createHash('sha256').update(source).digest('hex');
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type) nodes.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(acorn.parse(source, { ecmaVersion: 'latest' }));
  return { nodes, text: node => source.slice(node.start, node.end) };
}
const panel = readSource('public/js/panels/chart-panel.js');
const legacy = readSource('public/js/chart.js');
const core = readSource('public/js/core.js');
const socketSource = readSource('public/js/websocket.js');
const copy = value => JSON.parse(JSON.stringify(value));
const frames = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };
const start = 1794873600000 + 5 * 3600000; // Broker-local day boundary, not UTC midnight.
class FixtureDate extends Date { static now() { return start + 100000000; } }
function install(file, names, context, type = 'FunctionDeclaration') {
  for (const name of names) {
    const matches = file.nodes.filter(node => node.type === type && node.id?.name === name);
    assert.ok(matches.length <= 1, `ambiguous declaration: ${name}`);
    if (matches.length) vm.runInContext((type === 'VariableDeclarator' ? 'const ' : '') + file.text(matches[0]) + ';', context);
  }
}
function environment(file, objectName, symbol, frame) {
  const logs = [], requests = [], sent = [], statuses = [], timers = new Map(); let timerId = 0;
  const makeElement = text => ({ textContent: text, style: {}, classList: { add() {}, remove() {} } });
  const header = makeElement('$108'), hudPrice = makeElement('$108'), hudOhlc = makeElement('--');
  hudOhlc.parentElement = { style: {} };
  const asset = { value: symbol, options: ['BTC-USD', 'TSLA', 'NVDA'].map(value => ({ value })) };
  const timeframe = { value: frame };
  const ids = { currentPrice: header, rsiCore: makeElement('64.0'), macdCore: makeElement('0.00'),
    volumeCore: makeElement('12'), atrML: makeElement('2.00'), confidenceML: makeElement('--'), statusText: makeElement('Connected') };
  ids[objectName === 'ChartPanel' ? 'cp-assetSelector' : 'assetSelector'] = asset;
  ids[objectName === 'ChartPanel' ? 'cp-timeframeSelector' : 'timeframeSelector'] = timeframe;
  const root = { querySelector: selector => ids[selector.replace(/^#/, '')] || null };
  ids['fixture-root'] = root;
  const state = { lastPrice: 108, lastPriceDelta: 0, lastPriceSymbol: symbol, lastPriceTime: start - 1 };
  function series() {
    return { rows: [], writes: [], setData(rows) { this.rows = copy(rows); this.writes.push({ method: 'setData', rows: copy(rows) }); },
      update(row) { const last = this.rows.at(-1); if (last && row.time < last.time) throw Error('chart library rejects backwards update');
        if (last?.time === row.time) this.rows[this.rows.length - 1] = copy(row); else this.rows.push(copy(row));
        this.writes.push({ method: 'update', row: copy(row) }); }, removePriceLine() {} };
  }
  const candleSeries = series(), volumeSeries = series(), volumePane = series();
  const socket = { send: message => { sent.push(copy(message)); return true; }, isConnected: () => true,
    registerHandler: (type, callback) => { const list = context.handlers.get(type) || []; list.push(callback); context.handlers.set(type, list); } };
  const context = vm.createContext({ Date: FixtureDate, Map, Set, Number, Math, Object, Array,
    console: Object.fromEntries(['log', 'warn', 'error'].map(level => [level,
      (...args) => logs.push({ level, message: args.map(value => value?.message || String(value)).join(' ') })])),
    document: { getElementById: id => ids[id] || null }, ROOT_ID: 'fixture-root',
    OGZ: { state, get: name => name === 'Socket' ? socket : chart }, state,
    _cachedPriceEl: header, _cachedHudPrice: hudPrice, _cachedHudOhlc: hudOhlc,
    _livePricePaintedFor: symbol, _loadedAsset: symbol, storedCandles: [], activeOverlays: [],
    _oscPanes: { volume: { series: { volume: volumePane } } }, candleSeries, volumeSeries,
    tvChart: null, ghostSeries: null, wallLines: [], tpoLines: [], _trackedTimers: new Set(),
    feedOscIndicatorPanes() {}, removeRsiBands() {}, updateChartTitle() {},
    lastDataAt: 0, lastPongAt: 0, authenticated: false, reconnectAttempts: 0,
    removeDashboardTokenGate() {}, removeDashboardTokenPrompt() {}, startHealthChecks() {}, settingsOnly: false,
    _wsBootstrapped: false, _wsBootstrapTimer: null, _pendingAssetHistoryTimer: null,
    clearTimeout: id => timers.delete(id), setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    trackTimer: id => id, handlers: new Map(),
    fetch: async url => { requests.push(url); return { ok: true, json: async () => ({ error: [],
      result: { XXBTZUSD: [0, 1, 2].map(i => [(start / 1000) + i * frames[frame], 999, 1002, 998, 1000, 1000, 12, 2]) } }) }; }
  });
  install(file, ['TF_SECONDS', 'DEFAULT_SYMBOL', 'DEFAULT_TIMEFRAME', 'KRAKEN_OHLC_PAIRS', 'KRAKEN_OHLC_INTERVALS',
    'PRICE_FLASH_MS', 'MIN_VOLUME_STATS_CANDLES', 'VOL_ALPHA_FLOOR', 'VOL_ALPHA_RANGE', 'VOL_LIVE_ALPHA_DEFAULT'], context, 'VariableDeclarator');
  // Two original functions repeat this styling constant locally; use its module-scope value.
  vm.runInContext('const VOL_CAP_PCTILE = 0.98;', context);
  install(file, ['normalizeDashboardSymbol', 'selectedAssetSymbol', 'payloadSymbol', 'payloadMatchesSelectedAsset',
    'cleanSelectorValue', 'selectedLegacyAsset', 'socketReady', 'toFiniteNumber', 'normalizeHistoricalCandle',
    'median', 'historicalSpacingMatchesTimeframe', 'parseDisplayedPrice', 'isPriceMismatched',
    'fetchKrakenHistoricalCandles', 'displayTimeframe', 'currentBucketSeconds'], context);
  install(core, ['isNumericValue', 'selectedMarketPayload'], context);
  const object = file.nodes.find(node => node.type === 'VariableDeclarator' && node.id.name === objectName).init;
  const chart = { _clearNoDataWatchdog() {}, _setFeedStatus: (message, error) => statuses.push({ message, error }),
    _clearGeneratedOverlayLines() {}, calculateIndicators() {}, _armNoDataWatchdog() {} };
  for (const name of ['loadHistorical', 'update', 'isSelectedAssetPayload', 'clearAll', 'switchAsset']) {
    const property = object.properties.find(node => node.key.name === name);
    if (property) chart[name] = vm.runInContext('(' + file.text(property.value) + ')', context);
  }
  context.ChartPanel = chart; context.coreOwner = { get: () => chart }; context.socketOwner = socket;
  for (const type of ['price', 'historical_candles']) {
    const node = core.nodes.find(node => node.type === 'CallExpression' && node.callee.property?.name === 'registerHandler'
      && node.arguments[0]?.value === type);
    socket.registerHandler(type, vm.runInContext('(function(){return (' + core.text(node.arguments[1]) + ');}).call(coreOwner)', context));
  }
  install(socketSource, ['DASHBOARD_DATA_FRAME_TYPES'], context, 'VariableDeclarator');
  install(socketSource, ['isDataFrame', 'selectedDashboardAsset', 'selectedDashboardTimeframe'], context);
  if (objectName === 'ChartPanel') install(socketSource, ['cleanSelectorValue'], context);
  const connection = {}; context.currentSocket = connection; context.ws = connection;
  const message = socketSource.nodes.find(node => node.type === 'AssignmentExpression' && node.left.property?.name === 'onmessage');
  const onMessage = vm.runInContext('(function(){return (' + socketSource.text(message.right) + ');}).call(socketOwner)', context);
  return { context, chart, asset, timeframe, state, ids, header, hudPrice, hudOhlc, candleSeries, volumeSeries, volumePane,
    logs, statuses, requests, sent, timers, receive: async data => { onMessage({ data: JSON.stringify(data) });
      for (let i = 0; i < 5; i++) await Promise.resolve(); } };
}
function history(symbol, timeframe) {
  return { type: 'historical_candles', symbol, timeframe,
    candles: [0, 1, 2].map(i => ({ t: start + i * frames[timeframe] * 1000,
      o: 99 + i * 10, h: 102 + i * 10, l: 98 + i * 10, c: 100 + i * 10, v: i === 0 ? 0 : 10 + i })) };
}
const expectedRows = history => history.candles.map(c => ({ time: c.t / 1000, open: c.o, high: c.h, low: c.l, close: c.c }));
function price(symbol, timeframe, timestamp, close, volume = 13) {
  const candle = { symbol, timeframe, timestamp, etime: timestamp + frames[timeframe] * 1000,
    open: close - 1, high: close + 2, low: close - 2, close, volume };
  const data = { symbol, timeframe, timestamp, price: close, close, volume, candle,
    indicators: { rsi: 52, macd: 1.25, atr: 2.5, volume: 13 } };
  return { type: 'price', ...data, data };
}
(async () => {
  const cases = [], summaries = [];
  for (const [file, name] of [[panel, 'ChartPanel'], [legacy, 'Chart']]) {
    for (const symbol of ['BTC-USD', 'TSLA']) for (const timeframe of Object.keys(frames)) {
      const e = environment(file, name, symbol, timeframe), h = history(symbol, timeframe);
      e.header.textContent = '';
      await e.receive(h);
      const historyMatches = JSON.stringify(e.candleSeries.rows) === JSON.stringify(expectedRows(h));
      const historyRequests = e.requests.length;
      const quote = { type: 'price', symbol, timeframe: null, candle: null, price: 150, timestamp: start + 100000000 };
      const beforeQuote = JSON.stringify(e.candleSeries.rows);
      await e.receive(quote);
      const quoteLeavesCandles = JSON.stringify(e.candleSeries.rows) === beforeQuote;
      const time = start + frames[timeframe] * 3000;
      await e.receive(price(symbol, timeframe, time, 130));
      await e.receive(price(symbol, timeframe, time, 131, 0));
      await e.receive(price(symbol, timeframe, start, 97, 0));
      const expected = expectedRows(h); expected[0] = { time: start / 1000, open: 96, high: 99, low: 95, close: 97 };
      expected.push({ time: time / 1000, open: 130, high: 133, low: 129, close: 131 });
      const nativeMatches = JSON.stringify(e.candleSeries.rows) === JSON.stringify(expected);
      const nativeVolume = e.volumeSeries.rows.filter(row => [start / 1000, time / 1000].includes(row.time));
      const zeroVolumesPreserved = nativeVolume.length === 2 && nativeVolume.every(row => row.value === 0);
      const correctionLeavesQuote = e.state.lastPrice === 150 && e.header.textContent === '$150';
      const latestIndicatorVolume = e.ids.volumeCore.textContent === '13';
      const beforeOther = JSON.stringify({ rows: e.candleSeries.rows, price: e.state.lastPrice, rsi: e.ids.rsiCore.textContent });
      await e.receive(price(symbol === 'TSLA' ? 'BTC-USD' : 'TSLA', timeframe, time, 777));
      await e.receive(price(symbol, timeframe === '1d' ? '1m' : '1d', time, 888));
      await e.receive(history(symbol, timeframe === '1d' ? '1m' : '1d'));
      const otherScopesIgnored = beforeOther === JSON.stringify({ rows: e.candleSeries.rows, price: e.state.lastPrice, rsi: e.ids.rsiCore.textContent });
      await e.receive({ type: 'delta', symbol, tick: { price: 1, timestamp: start + 200000000 } });
      await e.receive({ ...quote, timestamp: quote.timestamp - 1, price: 2 });
      const oldQuoteAndDeltaIgnored = e.state.lastPrice === 150;
      const row = { chart: name, symbol, timeframe, historyMatches, browserHistoryRequests: historyRequests,
        quoteLeavesCandles, nativeMatches, zeroVolumesPreserved, correctionLeavesQuote, latestIndicatorVolume,
        otherScopesIgnored, oldQuoteAndDeltaIgnored, actualFinalCandles: copy(e.candleSeries.rows), logs: e.logs };
      cases.push(row);
      if (!baseline) for (const key of ['historyMatches', 'quoteLeavesCandles', 'nativeMatches', 'zeroVolumesPreserved',
        'correctionLeavesQuote', 'latestIndicatorVolume', 'otherScopesIgnored', 'oldQuoteAndDeltaIgnored']) assert.equal(row[key], true, `${name} ${symbol} ${timeframe}: ${key}`);
      if (!baseline) assert.equal(historyRequests, 0, 'single history source');
    }
    const e = environment(file, name, 'BTC-USD', '1m');
    await e.receive({ type: 'auth_success' });
    if (name === 'ChartPanel') {
      install(file, ['bootstrapWS'], e.context);
      vm.runInContext('bootstrapWS(document.getElementById(ROOT_ID));', e.context);
    }
    const initialHistoryRequests = e.sent.filter(row => row.type === 'request_historical').length;
    e.sent.length = 0;
    const tfNode = file.nodes.find(node => node.type === 'CallExpression' && node.callee.name === 'trackListener'
      && node.arguments[0]?.name === 'tfSel' && node.arguments[1]?.value === 'change');
    e.context.owner = e.chart; e.context.root = { querySelector: selector => e.context.document.getElementById(selector.slice(1)) };
    const onTimeframe = vm.runInContext('(function(){return (' + file.text(tfNode.arguments[2]) + ');}).call(owner)', e.context);
    e.timeframe.value = '1d'; onTimeframe({ target: e.timeframe });
    const frameRequests = copy(e.sent);
    await e.receive({ type: 'historical_candles', symbol: 'BTC-USD', timeframe: '1d', candles: [], error: 'synthetic native history unavailable' });
    const errorsVisible = e.statuses.some(row => row.error && row.message.includes('synthetic'))
      || e.ids.statusText.textContent.includes('synthetic');
    const valid = history('BTC-USD', '1d'); await e.receive(valid);
    const sparse = { ...valid, candles: Array.from({ length: 10 }, (_, i) => ({ ...valid.candles[0], t: start + i * frames['1d'] * 4000 })) };
    await e.receive(sparse);
    const nativeGapsPreserved = JSON.stringify(e.candleSeries.rows) === JSON.stringify(expectedRows(sparse));
    const beforeInvalid = JSON.stringify(e.candleSeries.rows);
    await e.receive({ ...valid, candles: [{ ...valid.candles[0], v: null }] });
    const invalidNotFabricated = JSON.stringify(e.candleSeries.rows) === beforeInvalid &&
      (e.statuses.some(row => row.error && row.message.includes('Invalid')) || e.ids.statusText.textContent.includes('Invalid'));
    e.asset.value = 'TSLA'; e.chart.clearAll();
    const switchClearsOldScope = e.candleSeries.rows.length === 0 && e.header.textContent === '--'
      && e.ids.rsiCore.textContent === '--' && vm.runInContext('storedCandles.length', e.context) === 0;
    const summary = { chart: name, initialHistoryRequests, frameRequests, errorsVisible, switchClearsOldScope,
      nativeGapsPreserved, invalidNotFabricated, logs: e.logs };
    summaries.push(summary);
    if (!baseline) { assert.equal(initialHistoryRequests, 1); assert.equal(frameRequests.filter(row => row.type === 'request_historical').length, 1);
      assert.equal(frameRequests.some(row => row.type === 'timeframe_change'), false); assert.equal(errorsVisible, true);
      assert.equal(switchClearsOldScope, true); assert.equal(nativeGapsPreserved, true); assert.equal(invalidNotFabricated, true); }
  }
  console.log('NATIVE_CLIENT_RECEIPT ' + JSON.stringify({ baseline, sourceHashes, cases, summaries,
    seams: ['Actual socket onmessage, core handlers, chart history/update/clearAll and timeframe change callbacks',
      'Both served chart modules; actual native normalizers and symbol selection functions',
      'Synthetic DOM, chart-series API capture, quote/native inputs, timers and transport'],
    limits: ['No connected browser, canvas rendering or screenshot', 'No live broker, bot restart or trading operation',
      'Chart series capture enforces backwards-update rejection but is not Lightweight Charts itself',
      'Oscillator calculations and overlay rendering are not exercised'] }));
})().catch(error => { console.error(error); process.exitCode = 1; });
