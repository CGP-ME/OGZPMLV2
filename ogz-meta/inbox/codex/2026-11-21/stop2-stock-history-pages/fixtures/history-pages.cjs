'use strict';
// Real readers and native Alpaca responses; transport replay stays isolated.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const source = process.argv.find(arg => arg.startsWith('--source='));
if (source) for (const [file, text] of Object.entries(JSON.parse(fs.readFileSync(source.slice(9))))) fs.writeFileSync(file, text);
const laneArg = process.argv.find(arg => arg.startsWith('--lane='));
if (!laneArg) {
  const lanes = ['dashboard', 'bot'].map(lane => JSON.parse(execFileSync(process.execPath, [__filename, ...process.argv.slice(2), `--lane=${lane}`], { encoding: 'utf8' })));
  process.stdout.write(JSON.stringify({ isolation: 'test-isolated.py', source: 'Actual Alpaca pages; simulated transport faults explicitly labeled', lanes }, null, 2) + '\n');
  process.exit(0);
}
const lane = laneArg.slice(7);
const baseline = process.argv.includes('--baseline');
const capture = JSON.parse(fs.readFileSync(path.join(__dirname, 'native-pages.json')));
const observation = capture.observations[0];
const native = observation.pages.flatMap(page => page.response.bars);
const RealDate = Date;
let clockTick = RealDate.parse(capture.capturedAt);
global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clockTick++])); }
  static now() { return clockTick++; }
};
const logs = [];
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push({ level, text: args.join(' ') });
const dotenv = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(dotenv, 'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.DOTENV_CONFIG_PATH = dotenv;
process.env.PROFILE = 'paper';
const ConfigLoader = require(process.cwd() + '/foundation/ConfigLoader');
const loaded = ConfigLoader.load({ role: lane, silent: true });
const internals = JSON.parse(fs.readFileSync('config/internals.json'));
let scenario, requests, retrieve;
function provider(url, params) {
  assert.equal(new URL(url).pathname, '/v2/stocks/TSLA/bars');
  assert.equal(params.timeframe, '1Hour');
  assert.equal(params.feed, 'iex');
  assert.equal(params.sort, 'desc');
  assert.equal(params.adjustment, lane === 'dashboard' ? 'split' : 'raw');
  assert.equal(params.start, internals.broker.alpacaHistorical.historyStart);
  requests.push({ parameters: { ...params } });
  if (requests.length > 1) assert.equal(params.end, requests[0].parameters.end, 'end must stay fixed across pages');
  const pageIndex = params.page_token == null ? 0 : observation.pages.findIndex(page => page.parameters.page_token === params.page_token);
  assert.ok(pageIndex >= 0, 'page token must be the native next-page token');
  if (scenario === 'later_page_http_failure' && pageIndex === 1) return { status: 503 };
  if (scenario === 'empty_history') return { status: 200, data: { bars: [], next_page_token: null } };
  if (scenario === 'terminal_short_history') return { status: 200, data: { bars: native.slice(0, 3), next_page_token: null } };
  const saved = observation.pages[pageIndex];
  assert.ok(saved, 'reader must stop once the requested count is available');
  return { status: 200, data: { ...saved.response, bars: saved.response.bars.slice(0, Number(params.limit)) } };
}
if (lane === 'dashboard') {
  const { resolveDashboardStockConfigFromRuntime } = require(process.cwd() + '/server/dashboard-stock-stream-config');
  const config = resolveDashboardStockConfigFromRuntime(loaded.config).data;
  global.fetch = async (url, options) => {
    assert.equal(options.headers['APCA-API-KEY-ID'], 'fixture-key');
    const result = provider(url, Object.fromEntries(new URL(url).searchParams));
    return { ok: result.status === 200, status: result.status, json: async () => result.data, text: async () => 'fixture provider unavailable' };
  };
  retrieve = limit => require(process.cwd() + '/server/stock-data-adapter').fetchStockCandles('TSLA', '1h', limit, { config });
} else {
  const axios = require('axios');
  axios.get = async (url, options) => {
    assert.equal(options.headers['APCA-API-KEY-ID'], 'fixture-key');
    const result = provider(url, options.params);
    if (result.status !== 200) throw Object.assign(new Error('fixture provider unavailable'), { response: { status: result.status } });
    return { data: result.data };
  };
  const AlpacaAdapter = require(process.cwd() + '/brokers/AlpacaAdapter');
  const adapter = new AlpacaAdapter({ apiKey: 'fixture-key', apiSecret: 'fixture-secret', mode: 'paper' });
  retrieve = limit => adapter.getCandles('TSLA', '1h', limit);
}
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const canonical = rows => (rows || []).map(bar => lane === 'dashboard' ? [bar.time * 1000, bar.open, bar.high, bar.low, bar.close, bar.volume] : [bar.t, bar.o, bar.h, bar.l, bar.c, bar.v]);
async function main() {
  const receipts = [];
  for (scenario of ['native_three_pages', 'sixty_bar_hydration', 'two_bar_refresh', 'terminal_short_history', 'empty_history', 'later_page_http_failure']) {
    requests = [];
    const limit = scenario === 'sixty_bar_hydration' ? 60 : scenario === 'two_bar_refresh' ? 2 : 500;
    let output, error = null;
    try { output = await retrieve(limit); } catch (failure) { error = failure.message; }
    const count = scenario === 'terminal_short_history' ? 3 : scenario === 'empty_history' ? 0 : limit;
    const expected = native.slice(0, count).map(bar => [RealDate.parse(bar.t), bar.o, bar.h, bar.l, bar.c, bar.v]).sort((a, b) => a[0] - b[0]);
    const actual = canonical(output);
    const exact = JSON.stringify(actual) === JSON.stringify(expected);
    if (!baseline) {
      if (scenario === 'later_page_http_failure') {
        assert.equal(actual.length, 0, 'failed continuation must not publish a successful partial history');
        if (lane === 'dashboard') assert.equal(output, null);
        else assert.match(error, /fixture provider unavailable/);
      } else { assert.equal(error, null); assert.deepEqual(actual, expected); }
      assert.equal(requests.length, scenario === 'native_three_pages' ? 3 : scenario === 'later_page_http_failure' ? 2 : 1);
      if (scenario === 'native_three_pages') assert.deepEqual(requests.map(r => Number(r.parameters.limit)), [500, 284, 81]);
    }
    receipts.push({ scenario, requested: limit, received: actual.length, exactNativeValues: exact, outputHash: hash(actual), expectedHash: hash(expected), error, requests });
  }
  const sourceHashes = Object.fromEntries(['brokers/AlpacaAdapter.js', 'server/stock-data-adapter.js', 'foundation/ConfigLoader.js'].map(file => [file, hash(fs.readFileSync(file, 'utf8'))]));
  process.stdout.write(JSON.stringify({ lane, baseline, sourceHashes, receipts, warnings: logs.filter(row => row.level !== 'log'), note: 'Market was closed. Captured native split/raw values match over this TSLA window; the bot request is still checked to preserve raw adjustment.' }) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
