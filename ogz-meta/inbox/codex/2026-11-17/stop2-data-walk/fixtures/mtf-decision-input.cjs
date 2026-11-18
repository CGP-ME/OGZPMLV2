'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
const credentialPath = path.join(__dirname, 'mtf-fixture.env');
fs.writeFileSync(credentialPath, [
  'ALPACA_API_KEY=synthetic-mtf-key', 'ALPACA_API_SECRET=synthetic-mtf-secret',
  'KRAKEN_API_KEY=synthetic-mtf-key', 'KRAKEN_API_SECRET=synthetic-mtf-secret',
  'WEBSOCKET_AUTH_TOKEN=synthetic-mtf-token',
].join('\n') + '\n');
process.env.DOTENV_CONFIG_PATH = credentialPath;
process.env.PROFILE = 'paper';
const ConfigLoader = require(path.join(process.cwd(), 'foundation/ConfigLoader'));
ConfigLoader.load({ role: 'bot', silent: true });
const MultiTimeframeAdapter = require(path.join(process.cwd(), 'modules/MultiTimeframeAdapter'));
const { CandleAggregator } = require(path.join(process.cwd(), 'core/CandleAggregator'));
const intervals = new CandleAggregator();
const source = fs.readFileSync('core/StrategyOrchestrator.js', 'utf8');
const nodes = [];
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type) nodes.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
  }
}
visit(require('acorn').parse(source, { ecmaVersion: 'latest' }));
const frames = ConfigLoader.get('orchestrator.mtfTimeframes');
const owner = {
  mtfBaseTimeframe: [...frames].sort((a, b) => intervals.getIntervalMs(a) - intervals.getIntervalMs(b))[0],
  symbolStrategyModules: new Map(),
};
const sandbox = vm.createContext({ ConfigLoader, MultiTimeframeAdapter, Map, Set });
for (const name of ['_buildMtfAdapterConfig', '_getSymbolStrategyModule', '_getMtfConfluenceAdapter', 'ingestMarketCandle', 'captureDecisionMtf']) {
  const node = nodes.find(item => item.type === 'MethodDefinition' && item.key.name === name);
  assert.ok(node, name);
  owner[name] = vm.runInContext('({' + source.slice(node.start, node.end) + '})', sandbox)[name].bind(owner);
}

const closeTime = 1794873600000;
const scope = { brokerId: 'kraken', accountId: 'synthetic-mtf-account', accountIdSource: 'fixture', assetClass: 'crypto', executionMode: 'paper' };
const snapshots = [];
for (const [symbol, initialPrice] of [['BTC-USD', 64000], ['ETH-USD', 3000]]) {
  for (const timeframe of frames) {
    const duration = intervals.getIntervalMs(timeframe);
    for (let index = 0; index < 64; index++) {
      const start = closeTime - (64 - index) * duration;
      owner.ingestMarketCandle(symbol, { ...scope, symbol, timeframe, t: start, etime: start + duration,
        o: initialPrice + index, h: initialPrice + index + 2, l: initialPrice + index - 1,
        c: initialPrice + index + 1, v: 100 });
    }
    owner.ingestMarketCandle(symbol, { ...scope, symbol, timeframe, t: closeTime, etime: closeTime + duration,
      o: initialPrice + 500, h: initialPrice + 502, l: initialPrice + 499, c: initialPrice + 501, v: 100 });
  }
  const snapshot = owner.captureDecisionMtf(symbol, { ...scope, symbol, timeframe: '1m', etime: closeTime });
  for (const timeframe of frames) {
    assert.equal(snapshot.candles[timeframe].length, 64);
    assert.ok(snapshot.candles[timeframe].every(candle => candle.etime <= closeTime && candle.symbol === symbol));
    assert.equal(snapshot.indicators[timeframe].price, initialPrice + 64);
  }
  assert.equal(snapshot.candles['30m'], undefined);
  assert.equal(snapshot.candles['1d'], undefined);
  assert.equal(snapshot.confluence.totalTimeframes, frames.length);
  snapshots.push({ symbol, activeFrames: Object.keys(snapshot.candles),
    closedCandleCounts: Object.fromEntries(Object.entries(snapshot.candles).map(([tf, values]) => [tf, values.length])),
    latestIndicatorPrices: Object.fromEntries(Object.entries(snapshot.indicators).map(([tf, value]) => [tf, value.price])),
    formingBarsExcluded: true, confluence: snapshot.confluence });
}
assert.notEqual(owner._getMtfConfluenceAdapter('BTC-USD'), owner._getMtfConfluenceAdapter('ETH-USD'));
const directDeliveryResults = [];
for (const timeframe of ['30m', '1d']) {
  let failure = null;
  try {
    owner.ingestMarketCandle('BTC-USD', { ...scope, symbol: 'BTC-USD', timeframe,
      t: closeTime, etime: closeTime + intervals.getIntervalMs(timeframe), o: 64000, h: 64002, l: 63999, c: 64001, v: 100 });
  } catch (error) { failure = error.message; }
  assert.ok(failure && failure.includes('not configured'));
  directDeliveryResults.push({ timeframe, existingError: failure,
    scope: 'Counterfactual direct delivery bypassing current runner admission; not a reported live crash' });
}
const fileNames = ['core/StrategyOrchestrator.js', 'modules/MultiTimeframeAdapter.js', 'core/TradingLoop.js',
  'core/CandleProcessor.js', 'foundation/ConfigLoader.js', 'config/settings.json', 'config/internals.json'];
console.log('MTF_DECISION_INPUT_RECEIPT ' + JSON.stringify({
  sourceHashes: Object.fromEntries(fileNames.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex')])),
  resolvedFrames: frames, configuredWeights: ConfigLoader.get('orchestrator.mtfConfluenceService').weights,
  symbolInstancesSeparate: true, snapshots, directDeliveryResults,
  scope: 'Actual orchestrator MTF ownership methods, actual MTF module and real isolated ConfigLoader paper profile; synthetic candles.',
  limits: ['No order or strategy ranking execution', 'No real broker or browser connection', 'No assertion that other indicator modules are isolated', 'No production changes'],
}));
