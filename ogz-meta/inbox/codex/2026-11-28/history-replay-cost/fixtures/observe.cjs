'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();

const root = process.cwd();
const logs = [];
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push({ level, message: args.join(' ') });
const env = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(env, 'ALPACA_API_KEY=fixture\nALPACA_API_SECRET=fixture\nKRAKEN_API_KEY=fixture\nKRAKEN_API_SECRET=fixture\nWEBSOCKET_AUTH_TOKEN=fixture\n');
process.env.PROFILE = 'paper';
process.env.DOTENV_CONFIG_PATH = env;
const ConfigLoader = require(root + '/foundation/ConfigLoader');
const resolved = ConfigLoader.load({ role: 'bot', silent: true });
const IndicatorEngine = require(root + '/core/indicators/IndicatorEngine');
const config = { ...resolved.config.indicators.engine, ...resolved.config.internals.indicators.engine, symbol: 'BTC-USD', tf: '1m' };
const sourceHashes = Object.fromEntries(['core/indicators/IndicatorEngine.js', 'foundation/ConfigLoader.js', 'config/settings.json', 'config/internals.json'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));

// Count real calculations without putting instrumentation into checkpoint state.
let applications = 0;
const originalApply = IndicatorEngine.prototype._applyCandle;
IndicatorEngine.prototype._applyCandle = function (candle) { applications++; return originalApply.call(this, candle); };
const engine = new IndicatorEngine(config);
const start = Date.parse('2026-11-27T00:00:00Z');
const candles = Array.from({ length: 800 }, (_, index) => {
  const open = 60000 + Math.sin(index / 9) * 40 + index / 3;
  return { t: start + index * 60000, o: open, h: open + 5, l: open - 4, c: open + Math.cos(index / 7) * 2, v: 10 + index % 9 };
});

async function main() {
  const seedStarted = performance.now();
  for (const candle of candles) engine.updateCandle(candle);
  const seed = { candles: candles.length, applications, elapsedMs: performance.now() - seedStarted };
  const originalIndicators = engine.getSnapshot().indicators;
  const lastBefore = engine.state.lastCandle;
  const observations = [];
  for (const index of [740, 741, 742]) {
    const before = applications;
    const begun = performance.now();
    let timerRan = false;
    const timer = new Promise(resolve => setTimeout(() => { timerRan = true; resolve(performance.now() - begun); }, 0));
    engine.updateCandle({ ...candles[index] });
    const synchronousMs = performance.now() - begun;
    const timerRanBeforeReturn = timerRan;
    const timerDelayMs = await timer;
    assert.deepEqual(engine.getSnapshot().indicators, originalIndicators);
    assert.deepEqual(engine.state.lastCandle, lastBefore);
    observations.push({ index, identicalOhlcv: true, candleApplications: applications - before, synchronousMs, timerDelayMs, timerRanBeforeReturn });
  }
  const correction = { ...candles[743], c: candles[743].c + 1, v: candles[743].v + 2 };
  const beforeCorrection = applications;
  const correctionStarted = performance.now();
  engine.updateCandle(correction);
  const correctionReceipt = { candleApplications: applications - beforeCorrection, synchronousMs: performance.now() - correctionStarted, latestCandlePreserved: engine.state.lastCandle.t === lastBefore.t };
  assert.equal(correctionReceipt.latestCandlePreserved, true);
  process.stdout.write(JSON.stringify({ sourceHashes, seed, config: { maxCandles: config.maxCandles, maxSeriesPoints: config.maxSeriesPoints }, duplicateRefresh: observations, genuineCorrection: correctionReceipt, limitations: ['Isolated synthetic candles; timing is not a live CPU profile.', 'One engine only; the candle producer invokes more than one engine.', 'No production edits, network credentials, positions or broker requests.'] }, null, 2) + '\n');
}

main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
