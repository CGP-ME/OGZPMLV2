'use strict';

// Native read-only behavior probe. The isolation launcher owns all fixture writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));

const credentialPath = path.join(__dirname, 'fixture.env');
fs.writeFileSync(credentialPath, [
  'ALPACA_API_KEY=synthetic-routing-key',
  'ALPACA_API_SECRET=synthetic-routing-secret',
  'KRAKEN_API_KEY=synthetic-routing-key',
  'KRAKEN_API_SECRET=synthetic-routing-secret',
  'WEBSOCKET_AUTH_TOKEN=synthetic-routing-token',
].join('\n') + '\n');
process.env.DOTENV_CONFIG_PATH = credentialPath;
process.env.PROFILE = 'paper';
const ConfigLoader = require(path.join(process.cwd(), 'foundation/ConfigLoader'));
ConfigLoader.load({ role: 'bot', silent: true });
const source = fs.readFileSync('run-empire-v2.js', 'utf8');
const ast = require('acorn').parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
const nodes = [];
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type) nodes.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
  }
}
visit(ast);

const traces = [], output = [], marks = [], admissions = [];
const evaluationFrames = ConfigLoader.get('orchestrator.mtfTimeframes');
const scope = {
  brokerId: 'kraken', accountId: 'synthetic-routing-account', accountIdSource: 'fixture',
  assetClass: 'crypto', executionMode: 'paper',
};
const contexts = new Map();
for (const symbol of ['BTC-USD', 'ETH-USD']) {
  contexts.set(symbol, new Map(evaluationFrames.map(timeframe => [timeframe, { priceHistory: [] }])));
}
const bot = {
  sessionRouter: { activeSession: 'crypto', activeBroker: { id: 'kraken' }, cryptoSymbols: ['BTC-USD', 'ETH-USD'] },
  candleTimeframe: ConfigLoader.get('execution.candleTimeframe'),
  evaluationTimeframes: evaluationFrames,
  symbolContexts: new Map([...contexts].map(([symbol, frames]) => [symbol, frames.get(evaluationFrames[0])])),
  timeframeHistories: {},
  getSymbolTimeframeContext: (symbol, timeframe) => contexts.get(symbol)?.get(timeframe),
  getCandleScopeEnvelope: ({ timeframe }) => ({ ...scope, timeframe }),
  _markActiveTimeframeData() {},
  syncDashboardRuntimeScope() {},
  handleMarketData: packet => admissions.push({ symbol: packet.symbol, timeframe: packet.timeframe }),
};
let traceCounter = 0;
const sandbox = vm.createContext({
  bot, ConfigLoader, Date, Set, Map,
  console: Object.fromEntries(['log', 'warn', 'error'].map(level => [level, (...parts) => output.push({ level, text: parts.join(' ') })])),
  stateManager: { updateLastPrice: (...args) => { marks.push(args); return true; } },
  createTraceId: () => `synthetic-routing-${++traceCounter}`,
  emitTrace: (_ctx, type, fields) => traces.push({ type, ...fields }),
  ...require(path.join(process.cwd(), 'foundation/ohlc-normalize')),
  ...require(path.join(process.cwd(), 'core/ReplayClosedCandleBoundary')),
});
for (const name of ['normalizeRuntimeSymbol', 'describeSymbolContexts', 'ohlcTimestampMs', 'normalizeOhlcForProcessor']) {
  const node = nodes.find(item => item.type === 'FunctionDeclaration' && item.id.name === name);
  assert.ok(node, name);
  vm.runInContext(source.slice(node.start, node.end), sandbox);
}
for (const name of ['storeTimeframeCandle', 'storeSymbolTimeframeCandle', 'getSymbolTimeframeCandles']) {
  const node = nodes.find(item => item.type === 'MethodDefinition' && item.key.name === name);
  assert.ok(node, name);
  bot[name] = vm.runInContext('({' + source.slice(node.start, node.end) + '})', sandbox)[name].bind(bot);
}
const diagnostics = nodes.find(item => item.type === 'AssignmentExpression'
  && item.left.type === 'MemberExpression' && item.left.property.name === 'timeframeDiagnostics');
assert.ok(diagnostics);
bot.timeframeDiagnostics = vm.runInContext('(' + source.slice(diagnostics.right.start, diagnostics.right.end) + ')', sandbox);
const handler = nodes.find(item => item.type === 'VariableDeclarator' && item.id.name === 'ohlcHandler');
assert.ok(handler);
const onCandle = vm.runInContext('(function(){ return (' + source.slice(handler.init.start, handler.init.end) + '); }).call(bot)', sandbox);

const intervals = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
const rows = [];
const timestamp = 1794873600000;
for (const [symbol, price] of [['BTC-USD', 64000], ['ETH-USD', 3000]]) {
  for (const [timeframe, minutes] of Object.entries(intervals)) {
    const observedBefore = { marks: marks.length, admissions: admissions.length, traces: traces.length, output: output.length };
    const packet = {
      symbol, timeframe, candleClosed: false, priceTimestamp: timestamp + 1000,
      data: [timestamp / 1000, timestamp / 1000 + minutes * 60, price, price + 2, price - 1, price + 1, price, 12, 3],
    };
    const inputBefore = JSON.stringify(packet);
    onCandle(packet);
    const stored = bot.getSymbolTimeframeCandles(symbol, timeframe);
    const mirror = bot.timeframeHistories[timeframe];
    assert.equal(stored.length, 1);
    assert.equal(stored[0].c, price + 1);
    assert.equal(stored[0].t, timestamp);
    assert.equal(stored[0].etime, timestamp + minutes * 60000);
    assert.deepEqual([stored[0].o, stored[0].h, stored[0].l, stored[0].c, stored[0].v],
      [price, price + 2, price - 1, price + 1, 12]);
    assert.equal(JSON.stringify(packet), inputBefore);
    assert.equal(mirror.at(-1).symbol, symbol);
    assert.equal(marks.length - observedBefore.marks, 1);
    assert.equal(admissions.length - observedBefore.admissions, evaluationFrames.includes(timeframe) ? 1 : 0);
    rows.push({
      symbol, timeframe, storedInSymbolHistory: true, storedInSharedDashboardMirror: true,
      markAttempted: true, evaluationAdmitted: evaluationFrames.includes(timeframe),
      inputUnchanged: JSON.stringify(packet) === inputBefore,
      emitted: traces.slice(observedBefore.traces).map(row => ({ type: row.type, reason: row.reason || null })),
      messages: output.slice(observedBefore.output).filter(row => /TIMEFRAME/.test(row.text)),
    });
  }
}
for (const timeframe of Object.keys(intervals)) {
  assert.equal(bot.getSymbolTimeframeCandles('BTC-USD', timeframe)[0].c, 64001);
  assert.equal(bot.getSymbolTimeframeCandles('ETH-USD', timeframe)[0].c, 3001);
}
console.log('FRAME_ROUTING_RECEIPT ' + JSON.stringify({
  runnerSha256: crypto.createHash('sha256').update(source).digest('hex'),
  evaluatedTimeframes: evaluationFrames, rows,
  diagnostics: bot.timeframeDiagnostics,
  scope: 'Actual runner admission handler and storage methods, actual normalizer and closed-candle selector; synthetic market packets in isolation.',
  seams: ['state-manager price update', 'CandleProcessor admission', 'runtime scope identity', 'log/trace sinks'],
  limits: ['No strategy execution or numerical indicator certification', 'No real broker calls or production writes', 'No full Stop 2 verdict'],
}));
