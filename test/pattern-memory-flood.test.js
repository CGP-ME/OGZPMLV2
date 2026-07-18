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

const { EnhancedPatternChecker } = require('../core/EnhancedPatternRecognition');

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
