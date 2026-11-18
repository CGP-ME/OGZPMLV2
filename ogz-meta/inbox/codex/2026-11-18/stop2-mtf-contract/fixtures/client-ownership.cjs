'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
const acorn = require('acorn');
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
const socket = readSource('public/js/websocket.js');
const broadcaster = readSource('core/DashboardBroadcaster.js');
for (const name of ['core/CandleProcessor.js', 'ogzprime-ssl-server.js']) {
  sourceHashes[name] = crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex');
}
const start = 1794873600000, receivedAt = start + 90000;
class FixtureDate extends Date { static now() { return receivedAt; } }
function installDeclarations(file, names, context, type) {
  for (const name of names) {
    const matches = file.nodes.filter(node => node.type === type && node.id?.name === name);
    assert.ok(matches.length <= 1, name);
    if (matches.length) vm.runInContext((type === 'VariableDeclarator' ? 'const ' : '')
      + file.text(matches[0]) + ';', context);
  }
}
function environment(file, objectName) {
  const writes = [], logs = [], requests = [], header = { textContent: '$108.00', style: {} };
  const rsi = { textContent: '64.0' }, asset = { value: 'BTC-USD', options: [{ value: 'BTC-USD' }] };
  const timeframe = { value: '1m' }, root = { querySelector: () => asset };
  const state = { lastPrice: 108, lastPriceDelta: 0 };
  const context = vm.createContext({ Date: FixtureDate, Map, Set, Number, Math,
    console: Object.fromEntries(['log', 'warn', 'error'].map(level => [level,
      (...args) => logs.push({ level, message: args.map(value => value?.message || String(value)).join(' ') })])),
    document: { getElementById: id => ({ 'fixture-root': root, 'cp-timeframeSelector': timeframe,
      timeframeSelector: timeframe, currentPrice: header, rsiCore: rsi }[id] || null) },
    ROOT_ID: 'fixture-root', OGZ: { state }, state,
    _cachedPriceEl: header, _cachedHudPrice: null, _cachedHudOhlc: null,
    _livePricePaintedFor: 'BTC-USD', storedCandles: [], activeOverlays: [], _oscPanes: {},
    candleSeries: { setData: rows => writes.push(JSON.parse(JSON.stringify(rows))),
      update: row => writes.push(JSON.parse(JSON.stringify(row))) }, volumeSeries: null, tvChart: null,
    feedOscIndicatorPanes() {}, lastDataAt: 0, lastPongAt: 0,
    fetch: async url => { requests.push(url); return { ok: true, json: async () => ({
      error: [], result: { XXBTZUSD: [0, 1, 2].map(i => [start / 1000 + i * 60,
        999 + i * 10, 1002 + i * 10, 998 + i * 10, 1000 + i * 10, 1000, 12, 2]) }
    }) }; },
  });
  installDeclarations(file, ['TF_SECONDS', 'DEFAULT_SYMBOL', 'DEFAULT_TIMEFRAME',
    'KRAKEN_OHLC_PAIRS', 'KRAKEN_OHLC_INTERVALS'], context, 'VariableDeclarator');
  installDeclarations(file, ['normalizeDashboardSymbol', 'selectedAssetSymbol', 'payloadSymbol',
    'payloadMatchesSelectedAsset', 'toFiniteNumber', 'normalizeHistoricalCandle', 'median',
    'historicalSpacingMatchesTimeframe', 'parseDisplayedPrice', 'isPriceMismatched',
    'fetchKrakenHistoricalCandles', 'displayTimeframe'], context, 'FunctionDeclaration');
  installDeclarations(core, ['isNumericValue'], context, 'FunctionDeclaration');
  const object = file.nodes.find(node => node.type === 'VariableDeclarator' && node.id.name === objectName).init;
  const chart = { _clearNoDataWatchdog() {}, _setFeedStatus() {}, clearAll() {} };
  for (const name of ['loadHistorical', 'update', 'isSelectedAssetPayload']) {
    const property = object.properties.find(node => node.key.name === name);
    if (property) chart[name] = vm.runInContext('(' + file.text(property.value) + ')', context);
  }
  context.ChartPanel = chart;
  context.coreOwner = { get: name => name === 'Chart' ? chart : null };
  function coreHandler(type) {
    const node = core.nodes.find(node => node.type === 'CallExpression'
      && node.callee.property?.name === 'registerHandler' && node.arguments[0]?.value === type);
    return vm.runInContext('(function(){return (' + core.text(node.arguments[1]) + ');}).call(coreOwner)', context);
  }
  return { context, chart, coreHandler, writes, logs, requests, state, header, rsi };
}

(async () => {
  const cases = {};
  const serverHistory = { type: 'historical_candles', symbol: 'BTC-USD', timeframe: '1m',
    candles: [0, 1, 2].map(i => ({ t: start + i * 60000, o: 99 + i * 10,
      h: 102 + i * 10, l: 98 + i * 10, c: 100 + i * 10, v: 10 })) };
  for (const unavailable of [false, true]) {
    const e = environment(panel, 'ChartPanel');
    e.header.textContent = '';
    e.context._livePricePaintedFor = null;
    if (unavailable) e.context.fetch = async url => { e.requests.push(url); throw new Error('synthetic unavailable transport'); };
    await e.chart.loadHistorical(serverHistory);
    assert.equal(e.requests.length, 1);
    assert.equal(e.writes.length, 1);
    assert.equal(e.writes[0].at(-1).close, unavailable ? 120 : 1020);
    cases[unavailable ? 'serverHistoryAfterBrowserFetchFailure' : 'browserReplacesServerHistory'] = {
      suppliedLastClose: 120, browserLastClose: unavailable ? null : 1020,
      chartLastClose: e.writes[0].at(-1).close, requests: e.requests, logs: e.logs,
    };
  }

  const oldChart = environment(legacy, 'Chart');
  oldChart.coreHandler('historical_candles')(serverHistory);
  assert.equal(oldChart.writes.length, 0);
  assert.ok(oldChart.logs.some(row => row.level === 'error' && row.message.includes('map')));
  oldChart.chart.loadHistorical(serverHistory.candles);
  assert.equal(oldChart.writes.length, 1);
  cases.legacyHistoryEnvelope = { writesViaActualDispatcher: 0,
    writesViaArrayPositiveControl: oldChart.writes.length, logs: oldChart.logs };

  const price = environment(panel, 'ChartPanel');
  price.coreHandler('price')({ type: 'price', data: { symbol: 'TSLA', price: 500,
    close: 500, timestamp: receivedAt, timeframe: '1m', indicators: { rsi: 22 } } });
  assert.equal(price.writes.length, 0);
  assert.equal(price.state.lastPrice, 500);
  assert.equal(price.rsi.textContent, '22.0');
  cases.otherAssetPrice = { selectedSymbol: 'BTC-USD', receivedSymbol: 'TSLA',
    beforeLastPrice: 108, afterLastPrice: price.state.lastPrice, chartWrites: price.writes.length,
    header: price.header.textContent, indicatorRsi: price.rsi.textContent };

  const deltaSend = broadcaster.nodes.find(node => node.type === 'CallExpression'
    && node.callee.property?.name === 'send'
    && node.arguments[0]?.arguments?.[0]?.properties?.some(property => property.key?.name === 'type'
      && property.value?.value === 'delta'));
  assert.ok(deltaSend);
  for (const symbol of ['TSLA', 'BTC-USD']) {
    const e = environment(panel, 'ChartPanel'), sent = [];
    const sender = vm.createContext({ Date: FixtureDate, price: 105, volume: 12,
      canonicalSymbol: symbol, timeframe: '1m',
      scopeFields: { symbol, asset: symbol, timeframe: '1m' },
      owner: { ctx: { dashboardWs: { send: value => sent.push(JSON.parse(value)) } } } });
    vm.runInContext('(function(){' + broadcaster.text(deltaSend) + ';}).call(owner)', sender);
    const deltaNode = panel.nodes.find(node => node.type === 'CallExpression'
      && node.callee.property?.name === 'registerHandler' && node.arguments[0]?.value === 'delta');
    const onDelta = vm.runInContext('(' + panel.text(deltaNode.arguments[1]) + ')', e.context);
    const connection = {};
    e.context.currentSocket = connection; e.context.ws = connection;
    e.context.handlers = new Map([['delta', [onDelta]]]);
    installDeclarations(socket, ['DASHBOARD_DATA_FRAME_TYPES'], e.context, 'VariableDeclarator');
    installDeclarations(socket, ['isDataFrame'], e.context, 'FunctionDeclaration');
    const onMessageNode = socket.nodes.find(node => node.type === 'AssignmentExpression'
      && node.left.property?.name === 'onmessage');
    const onMessage = vm.runInContext('(' + socket.text(onMessageNode.right) + ')', e.context);
    onMessage({ data: JSON.stringify(sent[0]) });
    assert.equal(e.state.lastPrice, 105);
    assert.equal(sent[0].tick.timestamp, receivedAt);
    assert.equal(e.header.textContent, symbol === 'TSLA' ? '$108.00' : '$105.00');
    assert.equal(e.logs.length, 0);
    cases[symbol === 'TSLA' ? 'otherAssetDelta' : 'olderCorrectionAsCurrentDelta'] = {
      selectedSymbol: 'BTC-USD', receivedSymbol: symbol, inputCandleTime: start,
      emittedPacket: sent[0], beforeLastPrice: 108, afterLastPrice: e.state.lastPrice,
      displayedHeader: e.header.textContent,
    };
  }
  console.log('CLIENT_OWNERSHIP_RECEIPT ' + JSON.stringify({ sourceHashes, cases,
    seams: ['Complete actual chart history/update functions, actual core handlers and socket onmessage',
      'Actual delta-send expression; surrounding broadcaster admission inspected separately',
      'Actual frontend normalization, selection and Kraken fetch helper with synthetic fetch responses',
      'Synthetic DOM, chart-series capture, shared state, fixed clock and transport; oscillator rendering stubbed'],
    limits: ['No live broker requests or connected browser', 'No renderer or screenshot proof',
      'No actual server relay execution; its fanout inspected in source',
      'No trading decision or order executed', 'Investigation only; no repair applied'],
  }));
})().catch(error => { console.error(error); process.exitCode = 1; });
