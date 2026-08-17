// test/pattern-memory-flood.test.js
//
// Regression test for the 2026-03-20 pattern-memory flood incident (ceb0ffb).
// Original bug: pattern_performance was keyed by JSON.stringify(features).substring(0, 50)
// where features included continuous indicators (RSI/MACD/trend). Each candle produced
// a unique signature, so the map grew unbounded — 2000+ entries on a single backtest.
//
// Fix: EnhancedPatternChecker._signatureFromFeatures quantizes feature values
// to 0.05 buckets before stringifying, collapsing similar market states to
// the same key and bounding map size to a few hundred regardless of candle count.

const originalEnv = { ...process.env };
process.env.ASSET_CLASS = 'stocks';
process.env.BROKER = 'alpaca';
process.env.BACKTEST_MODE = 'true';
process.env.CANDLE_DATA_FILE = 'tuning/tsla-15m-18mo.json';
process.env.BACKTEST_NO_PATTERN_SAVE = 'true';

const optimizedIndicators = require('../core/OptimizedIndicators');
const RuntimeFeatureExtractor = require('../core/FeatureExtractor');
const { EnhancedPatternChecker, FeatureExtractor } = require('../core/EnhancedPatternRecognition');

beforeAll(() => {
  process.env.ASSET_CLASS = 'stocks';
  process.env.BROKER = 'alpaca';
  process.env.BACKTEST_MODE = 'true';
  process.env.CANDLE_DATA_FILE = 'tuning/tsla-15m-18mo.json';
  process.env.BACKTEST_NO_PATTERN_SAVE = 'true';
});

afterAll(() => {
  process.env = originalEnv;
});

function makeCandle(close, ts) {
  return {
    open: close,
    high: close * 1.001,
    low: close * 0.999,
    close,
    o: close,
    h: close * 1.001,
    l: close * 0.999,
    c: close,
    volume: 1000,
    v: 1000,
    timestamp: ts,
    t: ts,
  };
}

test('Pattern signature does not flood across realistic 500-candle progression', () => {
  const checker = new EnhancedPatternChecker();
  const signatures = new Set();

  // Generate 500 realistic candles — small per-candle drift like real 15m data.
  // Price walks in a 0.05% per-candle band with cyclical noise (sine + small random).
  const allCandles = [];
  let price = 100;
  for (let i = 0; i < 500; i++) {
    price += Math.sin(i / 25) * 0.04 + (Math.random() - 0.5) * 0.05;
    allCandles.push(makeCandle(price, i * 900_000));
  }

  // Walk a 20-candle window across the full series, calling analyzePatterns
  // on each window — this simulates how the bot processes a backtest tick-by-tick.
  for (let i = 20; i < 500; i++) {
    const window = allCandles.slice(i - 20, i + 1); // 21-candle window
    // RSI/MACD/trend smoothly drift across the run, like a real backtest
    const rsi = 30 + (i / 500) * 40;        // 30 → 70 over the run
    const macd = Math.sin(i / 30) * 0.3;     // oscillates ±0.3
    const trends = ['uptrend', 'sideways', 'downtrend'];
    const trend = trends[Math.floor((i / 500) * 3)];

    const patterns = checker.analyzePatterns({
      candles: window,
      rsi,
      macd,
      macdSignal: macd * 0.9,
      trend,
      volume: 1000000,
    });

    patterns.forEach(p => {
      if (p.signature) signatures.add(p.signature);
    });
  }

  // With 0.05-bucket quantization on a realistic 480-candle progression,
  // unique signatures should collapse well below 300. A pre-fix run (no
  // quantization, JSON.stringify(features).substring(0,50)) would hit ~480
  // unique keys because every candle has a slightly different priceChange/volume.
  expect(signatures.size).toBeLessThanOrEqual(300);
});

test('Pattern signature is deterministic — identical inputs produce identical signatures', () => {
  const checker = new EnhancedPatternChecker();
  const candles = [];
  for (let i = 0; i < 20; i++) {
    candles.push(makeCandle(100 + i * 0.05, i * 900_000));
  }

  const input = {
    candles,
    rsi: 55,
    macd: 0.1,
    macdSignal: 0.09,
    trend: 'sideways',
    volume: 1000000,
  };

  const p1 = checker.analyzePatterns(input);
  const p2 = checker.analyzePatterns(input);

  expect(p1[0].signature).toBe(p2[0].signature);
});

test('OptimizedIndicators reports named unavailable instead of fabricated neutral defaults', () => {
  const result = optimizedIndicators.calculateTechnicalIndicators([
    makeCandle(100, 0),
    makeCandle(101, 900_000),
  ]);

  expect(result).toEqual(expect.objectContaining({
    available: false,
    status: 'unavailable',
    code: 'indicators_unavailable',
    reason: 'insufficient_indicator_candles',
    rsi: null,
    macd: null,
    volatility: null,
  }));
  expect(result).not.toEqual(expect.objectContaining({
    rsi: 50,
    macd: 0,
    volatility: 0.02,
  }));
});

test('Pattern feature extraction returns unavailable instead of learning fabricated features', () => {
  const features = FeatureExtractor.extract({
    candles: [],
    rsi: 50,
    macd: 0,
    signal: 0,
    trend: 'sideways',
  });

  expect(features).toEqual(expect.objectContaining({
    available: false,
    status: 'unavailable',
    code: 'pattern_features_unavailable',
    reason: 'missing_pattern_candles',
  }));
});

test('Pattern checker emits no learning pattern when indicator features are unavailable', () => {
  const checker = new EnhancedPatternChecker();
  const candles = [];
  for (let i = 0; i < 30; i++) {
    candles.push(makeCandle(100 + i * 0.05, i * 900_000));
  }

  const patterns = checker.analyzePatterns({
    candles,
    volume: 1000000,
  });

  expect(patterns).toEqual([]);
});

test('Runtime FeatureExtractor returns unavailable instead of clamping null indicators to neutral features', () => {
  const candles = [];
  for (let i = 0; i < 10; i++) {
    candles.push(makeCandle(100 + i * 0.05, i * 900_000));
  }

  const result = RuntimeFeatureExtractor.extract({
    indicators: {
      rsi: null,
      trend: 'sideways',
      atrNormalized: null,
      bb: { percentB: null },
      macd: null,
    },
    candles,
  });

  expect(result).toEqual(expect.objectContaining({
    available: false,
    status: 'unavailable',
    code: 'feature_vector_unavailable',
    reason: 'feature_input_unavailable',
    features: null,
    unavailableFields: expect.arrayContaining([
      'rsiNormalized',
      'volatilityLevel',
      'bbPosition',
      'momentumScore',
    ]),
  }));
  expect(RuntimeFeatureExtractor.extractArray({
    indicators: {
      rsi: null,
      trend: 'sideways',
      atrNormalized: null,
      bb: { percentB: null },
      macd: null,
    },
    candles,
  })).toBeNull();
});

test('Runtime FeatureExtractor accepts flat IndicatorEngine snapshot fields', () => {
  const candles = [];
  for (let i = 0; i < 10; i++) {
    candles.push(makeCandle(100 + i * 0.05, i * 900_000));
  }

  const result = RuntimeFeatureExtractor.extract({
    indicators: {
      rsi: 55,
      superTrendDirection: 'sideways',
      atrPercent: 1.25,
      bbPercentB: 0.52,
      macd: 0.14,
      macdSignal: 0.08,
    },
    candles,
  });

  expect(result).toEqual(expect.objectContaining({
    available: true,
    status: 'trusted',
    features: expect.any(Array),
  }));
  expect(result.features).toHaveLength(9);
  expect(result.features.every((feature) => typeof feature === 'number' && feature >= 0 && feature <= 1)).toBe(true);
});

test('Quantization collapses near-identical features to same signature', () => {
  const checker = new EnhancedPatternChecker();
  const candles = [];
  for (let i = 0; i < 20; i++) {
    candles.push(makeCandle(100 + i * 0.05, i * 900_000));
  }

  // Two inputs differing only in RSI sub-bucket precision should collapse
  // RSI 55.0 vs 55.4 both round to the same 0.05 bucket in normalized space
  const sigA = checker.analyzePatterns({
    candles, rsi: 55.0, macd: 0.1, macdSignal: 0.09, trend: 'sideways', volume: 1000000
  })[0].signature;

  const sigB = checker.analyzePatterns({
    candles, rsi: 55.4, macd: 0.1, macdSignal: 0.09, trend: 'sideways', volume: 1000000
  })[0].signature;

  expect(sigA).toBe(sigB);
});
