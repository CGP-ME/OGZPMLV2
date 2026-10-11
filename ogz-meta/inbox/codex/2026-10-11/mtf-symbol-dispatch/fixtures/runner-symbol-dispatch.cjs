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
  timeframeSelector: { currentTimeframe: '15m' },
  timeframeHistories: {},
  timeframeDiagnostics: { missingSessionRouterTimeframeDrops: 0, nonActiveTimeframeDrops: 0 },
  sessionRouter: { activeSession: 'stocks', activeBroker: { id: 'alpaca' } },
  symbolContexts: new Map(),
  _markActiveTimeframeData() {},
  getCandleScopeEnvelope: extra => ({ accountId: 'fixture-account', executionMode: 'paper', ...extra }),
  syncDashboardRuntimeScope() {},
  handleMarketData: payload => inputs.push(payload),
  run15mTradingCycle: async symbol => cycles.push(symbol),
  _trackRuntimeOperation(_label, work) { operations.push(Promise.resolve(work())); },
};
runner.storeTimeframeCandle = vm.runInContext(`({${extracted.storeTimeframeCandle}}).storeTimeframeCandle`, context);
runner.storeSymbolTimeframeCandle = vm.runInContext(`({${extracted.storeSymbolTimeframeCandle}}).storeSymbolTimeframeCandle`, context);
const handler = vm.runInContext(`(function () { return ${extracted.ohlcHandler}; })`, context).call(runner);

const start = Date.UTC(2026, 5, 12, 14, 30);
function event(symbol, offsetMinutes, close) {
  const t = start + offsetMinutes * 60_000;
  return {
    timeframe: '15m',
    symbol,
    data: { t, etime: t + 15 * 60_000, o: close - 1, h: close + 1, l: close - 2, c: close, v: 10, symbol },
  };
}
async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await Promise.all(operations.splice(0));
}
async function main() {
  // Both symbols close at the same 15m etime.
  handler(event('TSLA', 0, 101));
  handler(event('SPY', 0, 501));
  await settle();
  assert.equal(inputs.length, 2, 'both active-frame inputs reach CandleProcessor');
  assert.deepEqual(cycles, baseline ? ['TSLA'] : ['TSLA', 'SPY']);

  // Replays/updates of that close do not schedule another analysis.
  handler(event('TSLA', 0, 102));
  handler(event('SPY', 0, 502));
  await settle();
  assert.deepEqual(cycles, baseline ? ['TSLA'] : ['TSLA', 'SPY']);

  // At the next close each symbol is independently eligible again.
  handler(event('TSLA', 15, 103));
  handler(event('SPY', 15, 503));
  await settle();
  assert.deepEqual(cycles, baseline ? ['TSLA', 'TSLA'] : ['TSLA', 'SPY', 'TSLA', 'SPY']);
  assert.equal(inputs.length, 6);
  assert.equal(runner.symbolTimeframeHistories.get('TSLA').get('15m').length, 2);
  assert.equal(runner.symbolTimeframeHistories.get('SPY').get('15m').length, 2);
  console.log(`PASS ${baseline ? 'baseline' : 'candidate'}: same-etime TSLA/SPY dispatch=${cycles.join(',')}`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
