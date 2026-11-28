'use strict';
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

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
const files = ['core/indicators/IndicatorEngine.js', 'core/CandleHelper.js', 'foundation/ConfigLoader.js', 'config/settings.json', 'config/internals.json'];
const sourceHashes = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));

// Instrument the actual calculations, outside engine checkpoint state.
let applications = 0;
const originalApply = IndicatorEngine.prototype._applyCandle;
IndicatorEngine.prototype._applyCandle = function (candle) { applications++; return originalApply.call(this, candle); };
const start = Date.parse('2026-11-27T00:00:00Z');
const candles = Array.from({ length: 800 }, (_, index) => {
  const open = 60000 + Math.sin(index / 9) * 40 + index / 3;
  return { t: start + index * 60000, o: open, h: open + 5, l: open - 4, c: open + Math.cos(index / 7) * 2, v: 10 + index % 9 };
});
function values(engine) {
  const raw = engine.getRawState();
  delete raw.updatedAt;
  const render = engine.getRenderPacket({ maxPoints: 400 });
  delete render.timestamp;
  return { indicators: engine.getSnapshot().indicators, raw, render };
}
function fresh(history, settings = config) {
  const engine = new IndicatorEngine(settings);
  engine.computeBatch(history.map(candle => ({ ...candle })));
  return engine;
}

async function main() {
  const engine = fresh(candles);
  const original = values(engine);
  const duplicateRefresh = [];
  for (const index of [740, 741, 742]) {
    const before = applications;
    const begun = performance.now();
    const timer = new Promise(resolve => setTimeout(() => resolve(performance.now() - begun), 0));
    engine.updateCandle({ ...candles[index] });
    const synchronousMs = performance.now() - begun;
    const candleApplications = applications - before;
    assert.equal(candleApplications, 0);
    assert.deepEqual(values(engine), original);
    duplicateRefresh.push({ index, candleApplications, synchronousMs, timerDelayMs: await timer, allValuesPreserved: true });
  }

  const corrected = candles.map(candle => ({ ...candle }));
  corrected[743] = { ...corrected[743], c: corrected[743].c + 1, v: corrected[743].v + 2 };
  let before = applications;
  engine.updateCandle({ ...corrected[743] });
  const genuineCorrectionApplications = applications - before;
  assert.notDeepEqual(engine.getSnapshot().indicators, original.indicators);
  assert.deepEqual(values(engine), values(fresh(corrected)));

  // Volume-only corrections affect cumulative indicators even when prices match.
  corrected[744].v += 5;
  before = applications;
  engine.updateCandle({ ...corrected[744] });
  const volumeCorrectionApplications = applications - before;
  assert.deepEqual(values(engine), values(fresh(corrected)));

  const gapEngine = fresh(corrected.filter((_, index) => index !== 745));
  gapEngine.updateCandle({ ...corrected[745] });
  assert.deepEqual(values(gapEngine), values(engine));

  const latest = corrected[corrected.length - 1];
  corrected.push({ ...latest, t: latest.t + 60000, c: latest.c + 1 });
  engine.updateCandle({ ...corrected[corrected.length - 1] });
  corrected[corrected.length - 1].v += 3;
  before = applications;
  engine.updateCandle({ ...corrected[corrected.length - 1] });
  const latestRevisionApplications = applications - before;
  assert.equal(latestRevisionApplications, 1);
  assert.deepEqual(values(engine), values(fresh(corrected)));

  // Exercise the existing settings refresh before an otherwise identical update.
  const get = ConfigLoader.get;
  const nextSettings = { ...resolved.config.indicators.engine, rsiPeriod: config.rsiPeriod + 1 };
  assert.ok(Number.isFinite(nextSettings.rsiPeriod));
  ConfigLoader.get = function (name, ...args) { return name === 'indicators.engine' ? nextSettings : get.call(this, name, ...args); };
  engine.updateCandle({ ...corrected[740] });
  assert.equal(engine.config.rsiPeriod, nextSettings.rsiPeriod);
  assert.deepEqual(values(engine), values(fresh(corrected, { ...config, ...nextSettings })));
  ConfigLoader.get = get;

  process.stdout.write(JSON.stringify({
    sourceHashes,
    fixtureSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    seedCandles: candles.length,
    duplicateRefresh,
    genuineCorrection: { candleApplications: genuineCorrectionApplications, matchesFreshCalculation: true, indicatorsChanged: true },
    volumeOnlyCorrection: { candleApplications: volumeCorrectionApplications, matchesFreshCalculation: true },
    missingCandleInsertionMatchesFreshCalculation: true,
    forwardAndLatestRevision: { candleApplicationsForRevision: latestRevisionApplications, matchesFreshCalculation: true },
    settingsChange: { before: config.rsiPeriod, after: nextSettings.rsiPeriod, matchesFreshCalculation: true },
    limitations: ['Isolated synthetic candles; timing is descriptive, not a live CPU profile or a pass threshold.', 'Actual indicator computations, raw state and render values compared with chronological full calculation; wall-clock timestamps excluded.', 'No live broker calls, credentials, positions or runtime mutations.']
  }, null, 2) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
