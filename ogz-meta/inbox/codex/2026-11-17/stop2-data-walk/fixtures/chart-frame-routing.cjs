'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
const acorn = require('acorn');

function readSource(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type) nodes.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(acorn.parse(source, { ecmaVersion: 'latest' }));
  return { source, nodes, text: node => source.slice(node.start, node.end),
    sha256: crypto.createHash('sha256').update(source).digest('hex') };
}

const core = readSource('public/js/core.js');
const priceHandlerNode = core.nodes.find(node => node.type === 'CallExpression'
  && node.callee.property?.name === 'registerHandler' && node.arguments[0]?.value === 'price');
assert.ok(priceHandlerNode);
const rows = [];
const sourceHashes = { 'public/js/core.js': core.sha256 };
const timestamp = 1794873600000;
const processor = readSource('core/CandleProcessor.js');
sourceHashes['core/CandleProcessor.js'] = processor.sha256;
const producerDeclarations = ['dashboardSymbol', 'dashboardTimeframe', 'dashboardTimestamp',
  'dashboardCandle', 'dashboardCandles', 'dashboardPricePayload'].map(name => {
  const matches = processor.nodes.filter(node => node.type === 'VariableDeclarator' && node.id.name === name);
  assert.equal(matches.length, 1, name);
  return 'const ' + processor.text(matches[0]) + ';';
}).join('\n');

function producePriceEnvelope(candle) {
  const sandbox = vm.createContext({
    candle, marketData: { timestamp: candle.timestamp, volume: candle.volume },
    price: candle.close, open: candle.open, high: candle.high, low: candle.low, volume: candle.volume,
    ConfigLoader: { getInternalsFileValue: name => {
      assert.equal(name, 'indicators.candleProcessorPolicy.dashboardCandleSliceStart');
      return -200;
    } },
    dashboardIndicators: {}, renderPacket: { overlays: {} },
    currentEquity: 1000, totalPnL: 0, closedTrades: [], winRate: 0,
    stateManager: { get: () => 0 },
    owner: { ctx: { dashboardTimeframe: '1d', getCandlesForTimeframe: () => [] } },
  });
  return vm.runInContext('(function(){' + producerDeclarations + '\nreturn dashboardPricePayload;}).call(owner)', sandbox);
}

for (const [filename, owner] of [
  ['public/js/chart.js', 'Chart'],
  ['public/js/panels/chart-panel.js', 'ChartPanel'],
]) {
  const file = readSource(filename);
  sourceHashes[filename] = file.sha256;
  const object = file.nodes.find(node => node.type === 'VariableDeclarator' && node.id.name === owner).init;
  const property = name => object.properties.find(node => node.key.name === name);
  for (const scenario of ['matching_native_bar', 'one_minute_bar_on_daily_chart', 'price_without_ohlc']) {
    const drawn = [], stored = [], volumes = [];
    const selector = { value: 'BTC-USD', options: [{ value: 'BTC-USD' }] };
    const timeframeSelector = { value: '1d' };
    const root = { querySelector: id => id.includes('assetSelector') ? selector : timeframeSelector };
    const sandbox = vm.createContext({
      console, Date, Math, Set, Map, Number,
      document: { getElementById: id => id === 'timeframeSelector' ? timeframeSelector
        : id === 'fixture-chart' ? root : null },
      ROOT_ID: 'fixture-chart', DEFAULT_SYMBOL: 'BTC-USD', DEFAULT_TIMEFRAME: '15m',
      storedCandles: stored, candleSeries: { update: row => drawn.push({ ...row }) },
      volumeSeries: { update: row => volumes.push({ ...row }) },
      _oscPanes: {}, _cachedPriceEl: null, _cachedHudPrice: null, _cachedHudOhlc: null,
      _livePricePaintedFor: null, VOL_LIVE_ALPHA_DEFAULT: 0.5,
      MIN_VOLUME_STATS_CANDLES: 20, MIN_INDICATOR_CANDLES: 30,
      OGZ: { state: { lastPrice: 100 } }, state: { lastPrice: 100 },
    });
    const tf = file.nodes.find(node => node.type === 'VariableDeclarator' && node.id.name === 'TF_SECONDS');
    vm.runInContext('const ' + file.text(tf) + ';', sandbox);
    vm.runInContext(core.text(core.nodes.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'isNumericValue')), sandbox);
    for (const name of ['currentBucketSeconds', 'normalizeDashboardSymbol', 'selectedAssetSymbol', 'payloadSymbol', 'payloadMatchesSelectedAsset']) {
      const declaration = file.nodes.find(node => node.type === 'FunctionDeclaration' && node.id.name === name);
      if (declaration) vm.runInContext(file.text(declaration), sandbox);
    }
    const chart = { update: vm.runInContext('(' + file.text(property('update').value) + ')', sandbox) };
    if (property('isSelectedAssetPayload')) {
      chart.isSelectedAssetPayload = vm.runInContext('(' + file.text(property('isSelectedAssetPayload').value) + ')', sandbox);
    }
    sandbox.coreThis = { get: name => name === 'Chart' ? chart : null };
    const onPrice = vm.runInContext('(function(){return (' + core.text(priceHandlerNode.arguments[1]) + ');}).call(coreThis)', sandbox);
    const sourceTimeframe = scenario === 'matching_native_bar' ? '1d' : '1m';
    const candle = scenario === 'price_without_ohlc'
      ? { symbol: 'BTC-USD', close: 105, timestamp: timestamp + 60000 }
      : { symbol: 'BTC-USD', timeframe: sourceTimeframe, open: 100, high: 110, low: 90,
        close: 105, volume: 12, timestamp: timestamp + (sourceTimeframe === '1m' ? 60000 : 0) };
    const payload = scenario === 'price_without_ohlc'
      ? { type: 'price', symbol: 'BTC-USD', price: 105, timeframe: '1d', candle }
      : producePriceEnvelope(candle);
    onPrice(payload);
    assert.equal(drawn.length, 1);
    assert.equal(stored.length, 1);
    assert.equal(drawn[0].time, timestamp / 1000);
    if (scenario === 'price_without_ohlc') {
      assert.equal(drawn[0].open, 105);
      assert.equal(drawn[0].high, 105);
      assert.equal(drawn[0].low, 105);
    }
    rows.push({ filename, scenario, selectedTimeframe: '1d', sourceCandle: candle,
      producerEnvelopeTimeframe: payload.timeframe, producerCandleTimeframe: payload.candle.timeframe || null,
      chartSeriesWrite: drawn[0], storedCandle: stored[0] });
  }
}
console.log('CHART_FRAME_RECEIPT ' + JSON.stringify({
  sourceHashes, rows,
  scope: 'Actual CandleProcessor price-payload declarations, price dispatcher and complete chart update functions, actual timeframe and asset helpers; synthetic input candles.',
  seams: ['CandleProcessor surrounding account/indicator state and cache', 'DOM selectors and absent HUD elements', 'chart-library series capture', 'separate synthetic price-only envelope'],
  limits: ['No connected browser render', 'No live packet capture', 'No production changes'],
}));
