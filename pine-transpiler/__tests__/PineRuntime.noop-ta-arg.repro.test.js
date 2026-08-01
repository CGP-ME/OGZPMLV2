const PineRuntime = require('../core/PineRuntime');

// Regression for the Mercury finding (2026-08-01, re-dispatch of run
// b6vgqft41): a color as a TA-call argument used to bypass every
// PINE_TYPE_VIOLATION guard and ride resolveSeriesArg's legacy fallback,
// silently computing ta.sma(close, 5) - confident numbers fabricated from
// data the script never named. Execution proof at the time: x === y === 11.2.
// Now: direct syntax refuses at LOAD (TV compile-time parity); the laundered
// form throws at evaluate time. Silent close-substitution is dead both ways.

const CANDLES = [
  { timestamp: 1, open: 10, high: 11, low: 9, close: 11, volume: 100 },
  { timestamp: 2, open: 11, high: 12, low: 10, close: 12, volume: 110 },
  { timestamp: 3, open: 12, high: 13, low: 11, close: 13, volume: 120 },
  { timestamp: 4, open: 13, high: 13, low: 10, close: 11, volume: 130 },
  { timestamp: 5, open: 11, high: 11, low: 8, close: 9, volume: 140 },
];

test('direct color as TA series argument refuses at load - never reaches a candle', () => {
  const script = [
    '//@version=5',
    'strategy("Leak test")',
    'x = ta.sma(color.red, 5)',
    'plot(x)',
  ].join('\n');

  let thrown;
  try {
    new PineRuntime(script);
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeDefined();
  expect(thrown.code).toBe('PINE_LOAD_REFUSED');
  expect(thrown.message).toContain("argument to 'ta.sma()'");
});

test('laundered color as TA series argument fails loud instead of substituting close', () => {
  const script = [
    '//@version=5',
    'strategy("Leak test")',
    'c = color.red',
    'x = ta.sma(c, 5)',
    'plot(x)',
  ].join('\n');

  const runtime = new PineRuntime(script);
  let thrown;
  try {
    for (const candle of CANDLES) runtime.evaluate(candle);
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeDefined();
  expect(thrown.code).toBe('PINE_TYPE_VIOLATION');
  expect(thrown.message).toContain('ta.sma');
});
