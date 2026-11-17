'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.PROFILE = 'paper';
for (const key of ['KRAKEN_API_KEY', 'KRAKEN_API_SECRET', 'ALPACA_API_KEY', 'ALPACA_API_SECRET', 'WEBSOCKET_AUTH_TOKEN']) process.env[key] = 'synthetic-stop1-fixture';
const loader = require(path.join(process.cwd(), 'foundation/ConfigLoader'));
loader.load({ role: 'bot', loadDotenv: false, silent: true });
let seq = 0;
function save(changes) {
  const { revisions } = loader.getCachedSnapshot();
  const receipt = loader.saveSettings({ requestId: `optimized-${++seq}`, expectedRevision: revisions.settings, expectedSettingsHash: revisions.settingsHash, changes });
  assert.equal(receipt.success, true, receipt.reason);
  return receipt;
}
const retained = require(path.join(process.cwd(), 'core/OptimizedIndicators'));
const candles = Array.from({ length: 160 }, (_, i) => {
  const c = 100 + i / 5 + Math.sin(i / 3) * 7;
  return { o: c - .5, c, h: c + 2, l: c - 2, v: 100 + i, t: 1700000000000 + i * 60000 };
});
for (let end = 60; end <= 120; end++) retained.calculateTechnicalIndicators(candles.slice(end - 60, end));
const input = candles.slice(60, 120);
const before = retained.calculateMACD(input);
const held = JSON.stringify(before);
const oldRsi = retained.calculateRSI(input);
const prices = retained.twoPoleOscillator.priceHistory.slice();
const sourceWindows = retained.macdInputs.map(({ candles }) => candles);
const receipt = save({
  'indicators.optimized.rsiPeriod': 7,
  'indicators.optimized.macdFastPeriod': 6,
  'indicators.optimized.macdSlowPeriod': 18,
  'indicators.optimized.macdSignalPeriod': 4,
  'indicators.optimized.volatilityPeriod': 8,
  'indicators.optimized.bollingerPeriod': 8,
  'indicators.optimized.bollingerStdDev': 1.5,
  'indicators.optimized.atrPeriod': 8,
  'indicators.optimized.trendShortPeriod': 8,
  'indicators.optimized.trendLongPeriod': 15,
  'indicators.optimized.twoPole.smaLength': 10,
  'indicators.optimized.twoPole.filterLength': 8,
  'indicators.optimized.twoPole.overbought': .7,
  'indicators.optimized.twoPole.oversold': -.7,
});
const after = retained.calculateMACD(input);
const fresh = new retained.constructor();
for (const window of sourceWindows) fresh.calculateMACD(window);
for (const price of prices) fresh.twoPoleOscillator.update(price);
assert.deepEqual(after, fresh.calculateMACD(input));
assert.deepEqual(retained.macdHistory, fresh.macdHistory);
assert.equal(retained.macdInputs.length, sourceWindows.length, 'refresh must not add an observation');
assert.notEqual(oldRsi, retained.calculateRSI(input));
for (const method of ['calculateRSI', 'calculateVolatility', 'calculateBollingerBands', 'calculateATR', 'determineTrend']) assert.deepEqual(retained[method](input), fresh[method](input));
const numericState = oscillator => ({ prices: oscillator.priceHistory, raw: oscillator.oscillatorHistory, filtered: oscillator.filteredHistory, thresholds: [oscillator.upperThreshold, oscillator.lowerThreshold], invalidation: oscillator.invalidationLevels });
assert.deepEqual(numericState(retained.twoPoleOscillator), numericState(fresh.twoPoleOscillator));
assert.equal(JSON.stringify(before), held);
const config = retained.config, oscillator = retained.twoPoleOscillator, history = retained.macdHistory;
save({ 'orchestrator.fibBoostNormal': loader.get('orchestrator.fibBoostNormal') + .001 });
assert.equal(retained.config, config);
assert.equal(retained.twoPoleOscillator, oscillator);
assert.equal(retained.macdHistory, history);
save({ 'indicators.optimized.macdSlowPeriod': 80 });
const tooShort = retained.calculateMACD(input);
assert.equal(tooShort.reason, 'insufficient_macd_candles');
assert.equal(retained.macdHistory.at(-1), null);
for (let end = 121; end <= 124; end++) {
  const result = retained.calculateMACD(candles.slice(end - 90, end));
  if (end < 124) assert.equal(result.reason, 'insufficient_macd_signal_history');
  else assert.ok(Number.isFinite(result.signal));
}
assert.equal(retained.macdInputs.length, retained.maxMacdHistory);
const growing = new retained.constructor();
save({ 'indicators.optimized.macdSlowPeriod': 18 });
let growingResult;
for (let end = 60; end <= 75; end++) growingResult = growing.calculateTechnicalIndicators(candles.slice(0, end));
assert.equal(growing.macdInputs.length, 16, 'growing source windows must have distinct identities');
assert.ok(Number.isFinite(growingResult.macdSignal));
console.log('STOP1_OPTIMIZED_RECEIPT', JSON.stringify({ configuration: receipt.configuration, before, after, retainedSourceWindows: sourceWindows.length, sameObservationNotDuplicated: true, statelessIndicatorsMatchFresh: true, oscillatorMatchesRetainedReplay: true, oldResultUnchanged: true, unrelatedSavePreservesState: true, insufficientHistoryNamedUntilReplenished: true, runtimeActivated: false }));
