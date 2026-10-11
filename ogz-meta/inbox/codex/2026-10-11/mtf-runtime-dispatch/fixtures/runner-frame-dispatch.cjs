'use strict';

// Isolated real-source probe. Usage:
//   node runner-symbol-dispatch.cjs /path/to/source-root --baseline --ref HEAD
//   node runner-symbol-dispatch.cjs /path/to/source-root
// It extracts the runner's actual OHLC handler and both actual storage methods.
// No broker is constructed and no network request is made.
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');
const walk = require('acorn-walk');

const args = process.argv.slice(2);
const sourceRoot = path.resolve(args[0] || path.resolve(__dirname, '../../../../../../'));
process.chdir(sourceRoot);
const baseline = args.includes('--baseline');
const refFlag = args.indexOf('--ref');
const sourceRef = refFlag === -1 ? null : args[refFlag + 1];
if (refFlag !== -1) assert.ok(sourceRef, '--ref requires a git revision');
Object.assign(process.env, {
  PROFILE: 'paper', WEBSOCKET_AUTH_TOKEN: 'fixture-token',
  ALPACA_API_KEY: 'fixture-key', ALPACA_API_SECRET: 'fixture-secret',
  KRAKEN_API_KEY: 'fixture-key', KRAKEN_API_SECRET: 'fixture-secret',
});
require(path.join(sourceRoot, 'foundation/ConfigLoader')).load({ force: true, silent: true, loadDotenv: false });

const source = sourceRef
  ? childProcess.execFileSync('git', ['show', `${sourceRef}:run-empire-v2.js`], { cwd: sourceRoot, encoding: 'utf8' })
  : fs.readFileSync(path.join(sourceRoot, 'run-empire-v2.js'), 'utf8');
const extracted = {};
walk.simple(acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' }), {
  FunctionDeclaration(node) {
    if (['ohlcTimestampMs', 'normalizeOhlcForProcessor'].includes(node.id.name)) {
      extracted[node.id.name] = source.slice(node.start, node.end);
    }
  },
  VariableDeclarator(node) {
    if (node.id.name === 'ohlcHandler') extracted.ohlcHandler = source.slice(node.init.start, node.init.end);
  },
  MethodDefinition(node) {
    if (['storeTimeframeCandle', 'storeSymbolTimeframeCandle'].includes(node.key.name)) {
      extracted[node.key.name] = source.slice(node.start, node.end);
    }
  },
});
assert.deepEqual(Object.keys(extracted).sort(), [
  'normalizeOhlcForProcessor', 'ohlcHandler', 'ohlcTimestampMs',
  'storeSymbolTimeframeCandle', 'storeTimeframeCandle',
]);

const { normalizeOhlc, toTimestampMs } = require(path.join(sourceRoot, 'foundation/ohlc-normalize'));
const { normalizeAssetSymbol } = require(path.join(sourceRoot, 'core/AssetRegistry'));
const inputs = [];
const cycles = [];
const operations = [];
const context = vm.createContext({
  normalizeOhlc,
  toTimestampMs,
  normalizeRuntimeSymbol: normalizeAssetSymbol,
  createTraceId: () => 'fixture-candle',
  emitTrace: () => {},
  describeSymbolContexts: () => 'fixture TSLA15m,SPY15m',
  stateManager: { updateLastPrice: () => true },
  console: { log() {}, error() {}, warn() {} },
});
vm.runInContext(`${extracted.ohlcTimestampMs}\n${extracted.normalizeOhlcForProcessor}`, context);

const runner = {
  candleTimeframe: '15m',
  timeframeSelector: { currentTimeframe: '15m', evaluate: () => ({switched:false}) },
  evaluationTimeframes: ['1m','5m','15m','1h','4h'],
  timeframeHistories: {},
  timeframeDiagnostics: { missingSessionRouterTimeframeDrops: 0, nonActiveTimeframeDrops: 0 },
  sessionRouter: { activeSession: 'stocks', activeBroker: { id: 'alpaca' } },
  symbolContexts: new Map(),
  _markActiveTimeframeData() {},
  getCandleScopeEnvelope: extra => ({ accountId: 'fixture-account', executionMode: 'paper', ...extra }),
  syncDashboardRuntimeScope() {},
  handleMarketData: payload => inputs.push(payload),
  run15mTradingCycle: async symbol => cycles.push(`${symbol}:15m`),
  runTradingCycle: async (symbol, traceId, timeframe) => cycles.push(`${symbol}:${timeframe}`),
  _trackRuntimeOperation(_label, work) { operations.push(Promise.resolve(work())); },
};
runner.storeTimeframeCandle = vm.runInContext(`({${extracted.storeTimeframeCandle}}).storeTimeframeCandle`, context);
runner.storeSymbolTimeframeCandle = vm.runInContext(`({${extracted.storeSymbolTimeframeCandle}}).storeSymbolTimeframeCandle`, context);
const handler = vm.runInContext(`(function () { return ${extracted.ohlcHandler}; })`, context).call(runner);

const start = Date.UTC(2026, 5, 12, 14, 30);
const intervals = {'1m':1,'5m':5,'15m':15,'1h':60,'4h':240};
function event(symbol, timeframe, closeIndex, close) {
  const interval = intervals[timeframe] * 60_000;
  const etime = start + closeIndex * interval;
  return {timeframe,symbol,data:{t:etime-interval,etime,o:close-1,h:close+1,l:close-2,c:close,v:10,symbol}};
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await Promise.all(operations.splice(0));
}
async function main() {
  const expected = [];
  for (const symbol of ['TSLA','SPY']) for (const timeframe of runner.evaluationTimeframes) {
    handler(event(symbol,timeframe,0,symbol==='TSLA'?101:501));
    if (!baseline || timeframe==='15m') expected.push(`${symbol}:${timeframe}`);
  }
  await settle(); assert.deepEqual(cycles,expected);
  assert.equal(inputs.length,baseline?2:10);
  for (const symbol of ['TSLA','SPY']) for (const timeframe of runner.evaluationTimeframes) handler(event(symbol,timeframe,0,symbol==='TSLA'?102:502));
  await settle(); assert.deepEqual(cycles,expected,'same close update must not retrigger');
  for (const symbol of ['TSLA','SPY']) for (const timeframe of runner.evaluationTimeframes) handler(event(symbol,timeframe,1,symbol==='TSLA'?103:503));
  await settle(); assert.deepEqual(cycles,[...expected,...expected]);
  for (const symbol of ['TSLA','SPY']) for (const timeframe of runner.evaluationTimeframes) assert.equal(runner.symbolTimeframeHistories.get(symbol).get(timeframe).length,2);
  console.log(JSON.stringify({status:'pass',sourceRef,baseline,actualHandlerDispatch:cycles,processorInputCount:inputs.length,scope:'actual handler and stores; downstream endpoints stubbed'}));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
