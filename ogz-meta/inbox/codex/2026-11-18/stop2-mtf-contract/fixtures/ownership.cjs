'use strict';

// Investigation only: execute current source fragments in the mandatory helper
// namespace with synthetic candles. No runner startup, transport, or credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
const acorn = require('acorn');
const { CandleStore } = require(path.join(process.cwd(), 'core/CandleStore'));
const sourceHashes = {};

function readSource(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  sourceHashes[filename] = crypto.createHash('sha256').update(source).digest('hex');
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
  return { nodes, text: node => source.slice(node.start, node.end) };
}

const runner = readSource('run-empire-v2.js');
const processor = readSource('core/CandleProcessor.js');
for (const name of ['core/CandleStore.js', 'core/CandleHelper.js', 'core/ContractValidator.js', 'config/internals.json']) {
  sourceHashes[name] = crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex');
}
const internals = JSON.parse(fs.readFileSync('config/internals.json', 'utf8'));
const internal = key => key.split('.').reduce((value, part) => value[part], internals);
const sandbox = vm.createContext({ console, Map, Set, Date, Number,
  ConfigLoader: { get: key => {
    assert.ok(key.startsWith('internals.'));
    return internal(key.slice('internals.'.length));
  }, getInternalsFileValue: internal },
});
vm.runInContext(runner.text(runner.nodes.find(node => node.type === 'FunctionDeclaration'
  && node.id.name === 'normalizeRuntimeSymbol')), sandbox);
function method(file, name) {
  const matches = file.nodes.filter(node => node.type === 'MethodDefinition' && node.key.name === name);
  assert.equal(matches.length, 1, name);
  return vm.runInContext('(function ' + file.text(matches[0].value) + ')', sandbox);
}
const bot = { timeframeHistories: {}, priceHistory: [] };
for (const name of ['storeTimeframeCandle', 'getCandlesForTimeframe', 'storeSymbolTimeframeCandle', 'getSymbolTimeframeCandles']) {
  bot[name] = method(runner, name);
}
const start = 1794873600000;
const raw = (offset, close, volume = 10) => [(start + offset) / 1000, (start + offset + 60000) / 1000,
  close - 1, close + 2, close - 2, close, close, volume, 1];
const store = new CandleStore({ maxCandles: internal('runner.dashboard.symbolHistoryLimit') });
function ingestStorage(symbol, offset, close, volume) {
  // Preserve the runner's global mirror -> symbol mirror -> canonical store order.
  bot.storeTimeframeCandle('1m', raw(offset, close, volume), symbol);
  bot.storeSymbolTimeframeCandle(symbol, '1m', raw(offset, close, volume));
  store.addCandle(symbol, '1m', { symbol, timeframe: '1m', t: start + offset,
    etime: start + offset + 60000, o: close - 1, h: close + 2, l: close - 2, c: close, v: volume });
}
ingestStorage('NVDA', 0, 100, 10);
ingestStorage('TSLA', 0, 200, 10);
const sharedHistory = JSON.parse(JSON.stringify(bot.getCandlesForTimeframe('1m')));
assert.equal(sharedHistory.length, 1);
assert.equal(sharedHistory[0].symbol, 'TSLA');

for (const [offset, close, volume] of [[60000, 108, 20], [0, 105, 12]]) {
  ingestStorage('NVDA', offset, close, volume);
}
const mirror = JSON.parse(JSON.stringify(bot.getSymbolTimeframeCandles('NVDA', '1m')));
const canonical = store.getCandles('NVDA', '1m');
assert.equal(mirror.length, 3);
assert.equal(mirror.at(-1).t, start);
assert.equal(canonical.length, 2);
assert.equal(canonical.at(-1).t, start + 60000);
assert.equal(canonical[0].c, 105);

const candle = canonical[0];
const latest = canonical.at(-1);
sandbox.candle = candle;
sandbox.frameCtx = { priceHistory: canonical };
sandbox.wrappedInput = {};
sandbox.open = candle.o;
sandbox.high = candle.h;
sandbox.low = candle.l;
sandbox.price = candle.c;
sandbox.volume = candle.v;
sandbox.dashboardIndicators = {};
sandbox.renderPacket = { overlays: {} };
sandbox.currentEquity = 1000;
sandbox.totalPnL = 0;
sandbox.closedTrades = [];
sandbox.winRate = 0;
sandbox.stateManager = { get: () => 0 };
sandbox.owner = { ctx: { dashboardTimeframe: '1m', getCandlesForTimeframe: bot.getCandlesForTimeframe.bind(bot) } };
const declarations = ['latestCandle', '_parsedVolume', 'marketData', 'dashboardSymbol',
  'dashboardTimeframe', 'dashboardTimestamp', 'dashboardCandle', 'dashboardCandles', 'dashboardPricePayload']
  .map(name => {
    const matches = processor.nodes.filter(node => node.type === 'VariableDeclarator' && node.id.name === name);
    assert.equal(matches.length, 1, name);
    return 'const ' + processor.text(matches[0]) + ';';
  }).join('\n');
const packet = vm.runInContext('(function(){' + declarations
  + '\nreturn { marketData, payload: dashboardPricePayload };}).call(owner)', sandbox);
assert.equal(packet.marketData.price, latest.c);
assert.equal(packet.marketData.timestamp, latest.t);
assert.equal(packet.payload.candle.close, candle.c);
assert.equal(packet.payload.candle.timestamp, latest.t);
assert.notEqual(packet.payload.candle.timestamp, candle.t);
assert.equal(packet.payload.candle.volume, 12);
assert.equal(packet.payload.volume, 20);
assert.equal(packet.payload.data.volume, 20);
assert.equal(packet.payload.symbol, 'NVDA');
assert.equal(packet.payload.candles[0].symbol, 'TSLA');

const indicatorOwner = { ctx: { indicatorEngine: { getSnapshot: () => ({ indicators: { rsi: 11 } }) } } };
for (const name of ['_numberOrNull', '_firstNumberOrNull', '_buildDashboardIndicators']) {
  indicatorOwner[name] = method(processor, name);
}
const indicators = indicatorOwner._buildDashboardIndicators({ indicators: { rsi: 77 } }, packet.marketData);
assert.equal(indicators.rsi, 11);

console.log('MTF_OWNERSHIP_RECEIPT ' + JSON.stringify({ sourceHashes,
  cases: {
    sharedHistoryReplacement: { writes: ['NVDA 1m @ 100', 'TSLA 1m @ 200'], retained: sharedHistory },
    olderRevision: { mirror, canonical },
    correctedCandleEnvelope: { incomingCorrection: candle, newestCanonical: latest, ...packet },
    indicatorSource: { rootEngineRsi: 11, suppliedRenderRsi: 77, selectedRsi: indicators.rsi },
  },
  seams: ['AST-extracted current runner storage methods and CandleProcessor declarations/helpers',
    'Actual CandleStore with synthetic candles', 'Literal internals JSON lookup instead of full ConfigLoader startup',
    'Synthetic indicator snapshots, account summary and transport surroundings'],
  limits: ['No complete runner or live broker', 'No connected dashboard or order',
    'Reproduces current source defects, does not verify a repair', 'No production changes or PM2 operations'],
}));
