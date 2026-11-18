'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
const credentialPath = path.join(__dirname, 'boundary-fixture.env');
fs.writeFileSync(credentialPath, [
  'ALPACA_API_KEY=synthetic-boundary-key', 'ALPACA_API_SECRET=synthetic-boundary-secret',
  'KRAKEN_API_KEY=synthetic-boundary-key', 'KRAKEN_API_SECRET=synthetic-boundary-secret',
  'WEBSOCKET_AUTH_TOKEN=synthetic-boundary-token',
].join('\n') + '\n');
process.env.DOTENV_CONFIG_PATH = credentialPath;
process.env.PROFILE = 'paper';
const ConfigLoader = require(path.join(process.cwd(), 'foundation/ConfigLoader'));
ConfigLoader.load({ role: 'bot', silent: true });
const MultiTimeframeAdapter = require(path.join(process.cwd(), 'modules/MultiTimeframeAdapter'));
const { confirmedClosedCandleAtBoundary } = require(path.join(process.cwd(), 'core/ReplayClosedCandleBoundary'));
const { CandleAggregator } = require(path.join(process.cwd(), 'core/CandleAggregator'));
const intervals = new CandleAggregator();
const frames = ConfigLoader.get('orchestrator.mtfTimeframes');
const service = ConfigLoader.get('orchestrator.mtfConfluenceService');
const config = {
  baseTimeframe: '1m', activeTimeframes: frames,
  minReadyTimeframes: service.minReadyTimeframes, weights: service.weights,
  maxCandlesByTimeframe: ConfigLoader.get('internals.multiTimeframe.maxCandlesByTimeframe'),
};
const end = Date.UTC(2026, 10, 17, 12);
const scope = { brokerId: 'kraken', accountId: 'synthetic-boundary-account', accountIdSource: 'fixture', assetClass: 'crypto', executionMode: 'paper' };
const symbol = 'BTC-USD';
function bar(timeframe, start, price) {
  return { ...scope, symbol, timeframe, t: start, etime: start + intervals.getIntervalMs(timeframe),
    o: price - 0.5, h: price + 1, l: price - 1, c: price, v: 100 };
}
const earlyHour = { ...bar('1h', end - 3600000, 101), o: 100, l: 99 };
const finalHour = { ...earlyHour, h: 141, c: 140, v: 200 };
function seededService() {
  const adapter = new MultiTimeframeAdapter(config);
  for (const timeframe of frames) {
    const duration = intervals.getIntervalMs(timeframe);
    for (let index = 0; index < 64; index++) {
      const candle = timeframe === '1h' && index === 63
        ? earlyHour : bar(timeframe, end - (64 - index) * duration, 100 + index * 0.5);
      adapter.ingestCandle(candle, timeframe);
    }
  }
  return adapter;
}
const priorMinute = bar('1m', end - 60000, 131.5);
const incomingMinute = bar('1m', end, 132);
const confirmedMinute = confirmedClosedCandleAtBoundary({
  candleClosed: false, priorCandle: priorMinute, lastDecisionCandle: null,
  incomingCandle: incomingMinute, incomingScope: { ...scope, timeframe: '1m' }, symbol,
});
assert.equal(confirmedMinute.etime, end);
const minuteFirst = seededService();
const capturedBeforeHourRevision = minuteFirst.captureDecisionSnapshot(confirmedMinute);
minuteFirst.ingestCandle(finalHour, '1h');
const recapturedAfterHourRevision = minuteFirst.captureDecisionSnapshot(confirmedMinute);
const hourFirst = seededService();
hourFirst.ingestCandle(finalHour, '1h');
const capturedAfterHourRevision = hourFirst.captureDecisionSnapshot(confirmedMinute);
assert.equal(capturedBeforeHourRevision.candles['1h'].at(-1).etime, end);
assert.equal(capturedBeforeHourRevision.indicators['1h'].price, 101);
assert.equal(capturedAfterHourRevision.indicators['1h'].price, 140);
assert.equal(recapturedAfterHourRevision.indicators['1h'].price, 140);
assert.equal(capturedBeforeHourRevision.indicators['1h'].price, 101);

const shared = require(path.join(process.cwd(), 'core/OptimizedIndicators'));
const Calculator = shared.constructor;
const isolatedA = new Calculator();
const isolatedB = new Calculator();
const sampleCount = shared.config.macdSlowPeriod + shared.config.macdSignalPeriod + 20;
function series(name, startPrice, step) {
  return Array.from({ length: sampleCount }, (_, index) => ({
    ...bar('1m', end + index * 60000, startPrice + index * step + (index % 4) * 0.08), symbol: name,
  }));
}
const seriesA = series('BTC-USD', 100, 0.75);
const seriesB = series('ETH-USD', 400, -1.5);
let ownA, ownB, mixedA, mixedB;
for (let length = shared.config.macdSlowPeriod; length <= sampleCount; length++) {
  const a = seriesA.slice(0, length), b = seriesB.slice(0, length);
  ownA = isolatedA.calculateMACD(a);
  ownB = isolatedB.calculateMACD(b);
  mixedA = shared.calculateMACD(a);
  mixedB = shared.calculateMACD(b);
}
for (const value of [ownA, ownB, mixedA, mixedB]) assert.ok(Number.isFinite(value.signalLine));
assert.equal(ownA.macdLine, mixedA.macdLine);
assert.equal(ownB.macdLine, mixedB.macdLine);
assert.ok(Math.abs(ownA.signalLine - mixedA.signalLine) > 0.01);
assert.ok(Math.abs(ownB.signalLine - mixedB.signalLine) > 0.01);
const historyCountBeforeCachedA = shared.macdHistory.length;
const lastKeyBeforeCachedA = shared.macdInputs.at(-1).key;
const cachedA = shared.calculateMACD(seriesA);
assert.strictEqual(cachedA, mixedA);
assert.equal(shared.macdHistory.length, historyCountBeforeCachedA);
assert.equal(shared.macdInputs.at(-1).key, lastKeyBeforeCachedA);
assert.equal(lastKeyBeforeCachedA, shared.getScalperCacheKey('MACD', seriesB));

const { FeatureExtractor } = require(path.join(process.cwd(), 'core/EnhancedPatternRecognition'));
assert.equal(ConfigLoader.get('patternRecognition.useOptimizedIndicators'), true);
const originalCalculateMACD = shared.calculateMACD;
let calls = 0;
shared.calculateMACD = function (...args) { calls++; return originalCalculateMACD.apply(this, args); };
let providedFeatures, missingFeatures, providedCalls, missingCalls;
try {
  providedFeatures = FeatureExtractor.extract({ candles: seriesA, trend: 'up', rsi: 55, macd: 1, signal: 0.5 });
  providedCalls = calls;
  calls = 0;
  missingFeatures = FeatureExtractor.extract({ candles: seriesA, trend: 'up', rsi: 55 });
  missingCalls = calls;
} finally {
  shared.calculateMACD = originalCalculateMACD;
}
assert.ok(Array.isArray(providedFeatures));
assert.equal(providedCalls, 0);
assert.equal(providedFeatures[1], 0.5);
assert.ok(Array.isArray(missingFeatures));
assert.equal(missingCalls, 1);
assert.equal(missingFeatures[1], mixedA.macdLine - mixedA.signalLine);
assert.ok(Math.abs(missingFeatures[1] - (ownA.macdLine - ownA.signalLine)) > 0.01);

const sources = ['modules/MultiTimeframeAdapter.js', 'core/ReplayClosedCandleBoundary.js',
  'core/OptimizedIndicators.js', 'core/EnhancedPatternRecognition.js', 'core/TradingLoop.js',
  'core/indicators/IndicatorEngine.js', 'core/SymbolTradingContext.js', 'run-empire-v2.js',
  'foundation/ConfigLoader.js', 'config/settings.json', 'config/internals.json'];
console.log('BOUNDARY_MACD_RECEIPT ' + JSON.stringify({
  sourceHashes: Object.fromEntries(sources.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex')])),
  closeOrdering: {
    decisionEnd: end, higherFrameEnd: capturedBeforeHourRevision.candles['1h'].at(-1).etime,
    minuteBoundaryBeforeHourRevision: capturedBeforeHourRevision.indicators['1h'].price,
    hourRevisionBeforeMinuteBoundary: capturedAfterHourRevision.indicators['1h'].price,
    laterRecapture: recapturedAfterHourRevision.indicators['1h'].price,
    earlierSnapshotRemainsUnchanged: capturedBeforeHourRevision.indicators['1h'].price,
    conclusion: 'Equal end times allow the currently stored higher-frame revision into the captured input; no independent final-update confirmation is checked.',
  },
  optimizedMacd: {
    isolatedA: ownA, interleavedA: mixedA, isolatedB: ownB, interleavedB: mixedB,
    cachedAReturnsEarlierValueWithoutAdvancingHistory: true,
    normalProvidedFeatureMacdCalls: providedCalls, normalProvidedFeatureDelta: providedFeatures[1],
    missingInputFeatureMacdCalls: missingCalls, missingInputFeatureDelta: missingFeatures[1],
    isolatedADelta: ownA.macdLine - ownA.signalLine,
  },
  seams: ['Actual closure selector and MTF ingest/capture methods; full runner scheduling not instantiated',
    'Actual optimized calculators and feature extractor; method wrapper only counts calls and delegates unchanged'],
  limits: ['Synthetic delivery order and prices, not an observed broker incident',
    'No live decision or order corruption established', 'No numerical-parity claim across distinct MACD algorithms',
    'No production changes, provider calls or real learned-state access'],
}));
