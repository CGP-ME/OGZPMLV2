'use strict';
// Actual readers, real captured candles, isolated transport and explicit faults.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const source = process.argv.find(arg => arg.startsWith('--source='));
if (source) for (const [file, contents] of Object.entries(JSON.parse(fs.readFileSync(source.slice(9))))) fs.writeFileSync(file, contents);
const laneArg = process.argv.find(arg => arg.startsWith('--lane='));
if (!laneArg) {
  const lanes = ['concurrent_frames_and_instances', 'provider_failure_then_success', 'delayed_event_loop'].map(lane =>
    JSON.parse(execFileSync(process.execPath, [__filename, ...process.argv.slice(2), `--lane=${lane}`], { encoding: 'utf8' })));
  process.stdout.write(JSON.stringify({ isolation: 'test-isolated.py', lanes }, null, 2) + '\n');
  process.exit(0);
}
const lane = laneArg.slice(7);
const baseline = process.argv.includes('--baseline');
const capture = JSON.parse(fs.readFileSync(path.join(__dirname, 'native-ohlc.json')));
const logs = [];
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push({level, text: args.join(' ')});
const dotenv = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(dotenv, 'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.DOTENV_CONFIG_PATH = dotenv;
process.env.PROFILE = 'paper';
const ConfigLoader = require(process.cwd() + '/foundation/ConfigLoader');
ConfigLoader.load({ role: 'bot', silent: true });
const windowMs = ConfigLoader.getInternalsFileValue('broker.krakenTransport.requestWindowMs');
const axios = require('axios');
const requests = [];
let failFirst = lane === 'provider_failure_then_success';
axios.get = async input => {
  const dispatchedAt = Date.now();
  const url = new URL(input);
  assert.equal(url.pathname, '/0/public/OHLC');
  const pair = url.searchParams.get('pair');
  const interval = Number(url.searchParams.get('interval'));
  const saved = capture.observations.find(row => Object.hasOwn(row.response.result, pair) && row.interval === interval);
  assert.ok(saved, 'Request must use a captured native pair and interval');
  requests.push({pair, interval, dispatchedAt, observerParsingMs: Date.now() - dispatchedAt, since: Number(url.searchParams.get('since'))});
  if (failFirst) {
    failFirst = false;
    throw Object.assign(new Error('fixture HTTP 503'), {response: {status: 503}});
  }
  return {data: structuredClone(saved.response)};
};
axios.post = async () => { throw new Error('Private API request is outside this fixture'); };
const KrakenIBrokerAdapter = require(process.cwd() + '/brokers/KrakenIBrokerAdapter');
const adapters = [new KrakenIBrokerAdapter(), new KrakenIBrokerAdapter()];
const frames = [['1m',1],['5m',5],['15m',15],['30m',30],['1h',60],['4h',240],['1d',1440]];
const outputs = [];
async function retrieve(index, symbol, frame, interval) {
  const bars = await adapters[index].getCandles(symbol, frame, 60);
  const pair = adapters[index].toKrakenRestPair(symbol);
  const saved = capture.observations.find(row => Object.hasOwn(row.response.result, pair) && row.interval === interval);
  const key = Object.keys(saved.response.result).find(key => key !== 'last');
  const expected = saved.response.result[key].map(c => ({t:Number(c[0])*1000, etime:(Number(c[0])+interval*60)*1000, o:Number(c[1]),h:Number(c[2]),l:Number(c[3]),c:Number(c[4]),v:Number(c[6])}));
  const exact = JSON.stringify(bars) === JSON.stringify(expected);
  if (bars.length) assert.deepEqual(bars, expected);
  outputs.push({symbol, timeframe:frame, interval, received:bars.length, exactNativeValues:exact});
  return bars;
}
async function main() {
  if (lane === 'concurrent_frames_and_instances') {
    await Promise.all([
      ...frames.map(([frame,interval], index) => retrieve(index % 2, 'BTC-USD', frame, interval)),
      retrieve(1, 'ETH-USD', '1m', 1)
    ]);
  } else if (lane === 'provider_failure_then_success') {
    assert.deepEqual(await retrieve(0, 'BTC-USD', '1m', 1), []);
    assert.ok((await retrieve(1, 'BTC-USD', '1m', 1)).length > 0);
    assert.ok(logs.some(row => row.level === 'error' && row.text.includes('fixture HTTP 503')));
  } else {
    const pending = frames.slice(0,3).map(([frame,interval], index) => retrieve(index % 2, 'BTC-USD', frame, interval));
    // Deliberately delay pending timers; simultaneous wakeups must recheck.
    const stall = new Promise(resolve => setTimeout(() => {
      const until = Date.now() + 1300;
      while (Date.now() < until) { /* isolated event-loop stall */ }
      resolve();
    }, 500));
    await Promise.all([...pending, stall]);
  }
  const byPair = {};
  for (const row of requests) (byPair[row.pair] ||= []).push(row);
  const spacing = Object.entries(byPair).map(([pair, rows]) => ({pair, requestCount:rows.length,
    gapsMs:rows.slice(1).map((row,index) => row.dispatchedAt-rows[index].dispatchedAt)}));
  const violations = spacing.flatMap(row => row.gapsMs.filter(gap => gap < windowMs).map(gap => ({pair:row.pair,gapMs:gap})));
  if (!baseline) assert.equal(violations.length,0,'Public requests for one pair must be spaced across frames and instances: '+JSON.stringify({spacing,requests}));
  if (!baseline && lane === 'concurrent_frames_and_instances') {
    assert.ok(Math.abs(byPair.XXBTZUSD[0].dispatchedAt-byPair.XETHZUSD[0].dispatchedAt)<windowMs,'Another pair must not wait for the BTC history queue');
  }
  const sourceHashes = Object.fromEntries(['kraken_adapter_simple.js','brokers/KrakenIBrokerAdapter.js','foundation/ConfigLoader.js','config/internals.json'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  process.stdout.write(JSON.stringify({lane,baseline,windowMs,spacing,violations,requests,outputs,sourceHashes,
    warnings:logs.filter(row=>row.level!=='log'),limitations:['HTTP responses are native captured candles; HTTP 503 and delayed event-loop behavior are explicitly simulated inside isolation.','This verifies process-local transport pacing; unrelated OS processes sharing the public IP are outside this module.']})+'\n');
}
main().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
