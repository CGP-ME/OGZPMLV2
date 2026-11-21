'use strict';
// Execute the real request producers with captured Alpaca bars in isolation.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const source = process.argv.find(arg => arg.startsWith('--source='));
if (source) for (const [name, text] of Object.entries(JSON.parse(fs.readFileSync(source.slice(9))))) fs.writeFileSync(name, text);
const laneArg = process.argv.find(arg => arg.startsWith('--lane='));
if (!laneArg) {
  const lanes = ['dashboard', 'bot'].map(lane => JSON.parse(execFileSync(process.execPath, [__filename, ...process.argv.slice(2), `--lane=${lane}`], { encoding: 'utf8' })));
  process.stdout.write(JSON.stringify({ isolation: 'test-isolated.py', transport: 'offline replay of real Alpaca bars; simulated request filtering', lanes }, null, 2) + '\n');
  process.exit(0);
}
const lane = laneArg.slice(7);
const baseline = process.argv.includes('--baseline');
const capture = JSON.parse(fs.readFileSync(path.join(__dirname, 'alpaca-native.json')));
const logs = [];
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push({ level, text: args.join(' ') });
const RealDate = Date;
let now = RealDate.parse(capture.capturedAt);
global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};
const dotenv = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(dotenv, 'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.DOTENV_CONFIG_PATH = dotenv;
process.env.PROFILE = 'paper';
const ConfigLoader = require(process.cwd() + '/foundation/ConfigLoader');
const loaded = ConfigLoader.load({ role: lane, silent: true });
const internals = JSON.parse(fs.readFileSync('config/internals.json'));
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const sourceHashes = Object.fromEntries(['brokers/AlpacaAdapter.js', 'server/stock-data-adapter.js', 'config/internals.json', 'foundation/ConfigLoader.js'].map(name => [name, hash(fs.readFileSync(name, 'utf8'))]));
let providerMode = 'normal', activeFrame, requests = [];
function provider(url, params) {
  const saved = capture.lanes[lane][activeFrame];
  assert.equal(new URL(url).pathname, '/v2/stocks/TSLA/bars');
  for (const key of ['timeframe', 'feed', 'adjustment', 'sort']) assert.equal(params[key], saved.parameters[key], key);
  requests.push({ endpoint: new URL(url).origin + new URL(url).pathname, parameters: { ...params } });
  let bars = providerMode === 'empty' ? [] : saved.response.bars;
  if (providerMode === 'short_history') bars = bars.slice(0, 3);
  bars = bars.filter(bar => RealDate.parse(bar.t) >= RealDate.parse(params.start) && RealDate.parse(bar.t) <= RealDate.parse(params.end));
  bars = [...bars].sort((a, b) => RealDate.parse(b.t) - RealDate.parse(a.t)).slice(0, Number(params.limit));
  return { bars, next_page_token: null, symbol: 'TSLA' };
}
let retrieve;
if (lane === 'dashboard') {
  const { resolveDashboardStockConfigFromRuntime } = require(process.cwd() + '/server/dashboard-stock-stream-config');
  const config = resolveDashboardStockConfigFromRuntime(loaded.config).data;
  assert.equal(config.ready, true);
  global.fetch = async (url, options) => {
    assert.equal(options.headers['APCA-API-KEY-ID'], 'fixture-key');
    if (providerMode === 'http_failure') return { ok: false, status: 503, text: async () => 'fixture provider unavailable' };
    return { ok: true, json: async () => provider(url, Object.fromEntries(new URL(url).searchParams)) };
  };
  const { fetchStockCandles } = require(process.cwd() + '/server/stock-data-adapter');
  retrieve = (frame, limit) => fetchStockCandles('TSLA', frame, limit, { config });
} else {
  const axios = require('axios');
  axios.get = async (url, options) => {
    assert.equal(options.headers['APCA-API-KEY-ID'], 'fixture-key');
    if (providerMode === 'http_failure') throw Object.assign(new Error('fixture provider unavailable'), { response: { status: 503 } });
    return { data: provider(url, options.params) };
  };
  const AlpacaAdapter = require(process.cwd() + '/brokers/AlpacaAdapter');
  const adapter = new AlpacaAdapter({ apiKey: 'fixture-key', apiSecret: 'fixture-secret', mode: 'paper' });
  retrieve = (frame, limit) => adapter.getCandles('TSLA', frame, limit);
}
function canonical(rows) {
  return (rows || []).map(bar => lane === 'dashboard'
    ? [bar.time * 1000, bar.open, bar.high, bar.low, bar.close, bar.volume]
    : [bar.t, bar.o, bar.h, bar.l, bar.c, bar.v]);
}
async function main() {
  const receipts = [];
  for (const scenario of ['captured_weekend', 'simulated_fourteen_day_gap', 'two_bar_refresh', 'short_history']) {
    now = RealDate.parse(capture.capturedAt) + (scenario === 'simulated_fourteen_day_gap' ? 14 * 86400000 : 0);
    providerMode = scenario === 'short_history' ? 'short_history' : 'normal';
    for (const frame of Object.keys(capture.lanes[lane])) {
      activeFrame = frame; requests = [];
      const limit = scenario === 'two_bar_refresh' ? 2 : 60;
      const raw = capture.lanes[lane][frame].response.bars.slice(0, scenario === 'short_history' ? 3 : limit);
      const expected = raw.map(bar => [RealDate.parse(bar.t), bar.o, bar.h, bar.l, bar.c, bar.v]).sort((a, b) => a[0] - b[0]);
      const actual = canonical(await retrieve(frame, limit));
      const exact = JSON.stringify(actual) === JSON.stringify(expected);
      if (!baseline) assert.deepEqual(actual, expected, `${lane} ${scenario} ${frame}`);
      receipts.push({ scenario, frame, requested: limit, received: actual.length, availableCaptured: expected.length, exactNativeValues: exact, outputHash: hash(actual), expectedHash: hash(expected), requests });
    }
  }
  activeFrame = '1m'; providerMode = 'empty';
  assert.equal(canonical(await retrieve('1m', 60)).length, 0);
  providerMode = 'http_failure';
  let outcome;
  try { outcome = await retrieve('1m', 60); } catch (error) { outcome = error.message; }
  if (lane === 'dashboard') assert.equal(outcome, null);
  else assert.match(outcome, /fixture provider unavailable/);
  process.stdout.write(JSON.stringify({ lane, baseline, sourceHashes, internalsRevision: internals.revision, historyStart: internals.broker.alpacaHistorical.historyStart ?? null, receipts, emptyResultNotFabricated: true, providerFailureNotFabricated: true, failureOutcome: outcome, warnings: logs.filter(row => row.level !== 'log') }) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
