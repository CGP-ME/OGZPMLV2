/**
 * Golden checks for pine-transpiler/core/PineTALib.js
 *
 * These lock down *this implementation* for regression safety. They are not
 * a guarantee of pixel-perfect match to TradingView:
 * - RSI here sums raw gains/losses over the last `length` deltas (SMA-style),
 *   not Wilder's smoothed averages like Pine's ta.rsi.
 */

const PineTALib = require('../core/PineTALib');

/** Mirrors PineTALib.rsi() loop so RSI goldens fail only when implementation changes. */
function manualPineTALibRsi(series, length) {
  let gain = 0;
  let loss = 0;
  for (let i = series.length - length; i < series.length; i++) {
    const delta = series[i] - series[i - 1];
    if (delta > 0) gain += delta;
    else loss -= delta;
  }
  const rs = loss === 0 ? 100 : gain / loss;
  return 100 - 100 / (1 + rs);
}

describe('PineTALib golden — SMA / highest / lowest', () => {
  test('sma last window', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(PineTALib.sma(s, 3)).toBeCloseTo(9, 10);
    expect(PineTALib.sma(s, 10)).toBeCloseTo(5.5, 10);
  });

  test('highest / lowest trailing', () => {
    const s = [3, 1, 4, 1, 5, 9, 2, 6];
    // Last 4: [5, 9, 2, 6]
    expect(PineTALib.highest(s, 4)).toBe(9);
    expect(PineTALib.lowest(s, 4)).toBe(2);
  });
});

describe('PineTALib golden — EMA', () => {
  test('ema matches manual recurrence on short series', () => {
    const series = [100, 101, 99, 102, 103];
    const len = 3;
    const k = 2 / (len + 1);
    let ema = series[0];
    for (let i = 1; i < series.length; i++) {
      ema = series[i] * k + ema * (1 - k);
    }
    expect(PineTALib.ema(series, len)).toBeCloseTo(ema, 10);
  });
});

describe('PineTALib golden — RSI (non-Wilder — locks this repo behavior)', () => {
  test('rsi matches manual loop for a short hand-checkable series', () => {
    const series = [10, 12, 11, 13];
    const length = 3;
    expect(PineTALib.rsi(series, length)).toBeCloseTo(80, 10);
    expect(PineTALib.rsi(series, length)).toBeCloseTo(manualPineTALibRsi(series, length), 10);
  });

  test('rsi all gains in window (loss branch rs=100) → 100 - 100/101', () => {
    const series = [1, 2, 3, 4, 5, 6];
    expect(PineTALib.rsi(series, 3)).toBeCloseTo(99.00990099009901, 10);
  });

  test('rsi all losses in window → ~0', () => {
    const series = [6, 5, 4, 3, 2, 1];
    expect(PineTALib.rsi(series, 3)).toBeCloseTo(0, 10);
  });
});

describe('PineTALib golden — ATR', () => {
  test('atr uses sma of true range', () => {
    const high = [10, 12, 11];
    const low = [8, 9, 9];
    const close = [9, 11, 10];
    const tr = [];
    for (let i = 1; i < high.length; i++) {
      const v1 = high[i] - low[i];
      const v2 = Math.abs(high[i] - close[i - 1]);
      const v3 = Math.abs(low[i] - close[i - 1]);
      tr.push(Math.max(v1, v2, v3));
    }
    expect(tr.length).toBe(2);
    const manual = (tr[0] + tr[1]) / 2;
    expect(PineTALib.atr(high, low, close, 2)).toBeCloseTo(manual, 10);
  });
});

describe('PineTALib golden — stdev', () => {
  test('stdev matches variance definition with sma-style mean', () => {
    const series = [2, 4, 6, 8];
    const length = 4;
    const mean = PineTALib.sma(series, length);
    const slice = series.slice(-length);
    const variance =
      slice.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / length;
    expect(mean).toBeCloseTo(5, 10);
    expect(variance).toBeCloseTo(5, 10);
    expect(PineTALib.stdev(series, length)).toBeCloseTo(Math.sqrt(5), 10);
  });
});

describe('PineTALib golden — VWAP', () => {
  test('vwap is volume-weighted typical price', () => {
    const high = [10, 12];
    const low = [8, 9];
    const close = [9, 11];
    const volume = [100, 200];
    const tp0 = (10 + 8 + 9) / 3;
    const tp1 = (12 + 9 + 11) / 3;
    const manual = (tp0 * 100 + tp1 * 200) / 300;
    expect(PineTALib.vwap(high, low, close, volume)).toBeCloseTo(manual, 10);
    expect(PineTALib.vwap(high, low, close, volume)).toBeCloseTo(10.11111111111111, 10);
  });

  test('vwap returns null when cumulative volume is zero', () => {
    expect(PineTALib.vwap([1, 2], [1, 1], [1, 1], [0, 0])).toBeNull();
  });
});

describe('PineTALib golden — crossover / crossunder (Pine: <= / >= on prior bar)', () => {
  test('crossover: classic and touch-then-cross', () => {
    expect(PineTALib.crossover([1, 2], [2, 1])).toBe(true);
    // Was already strictly above — not a cross (first leg fails <=)
    expect(PineTALib.crossover([2, 2], [1, 1])).toBe(false);
    // Equal on previous bar, then A > B — counts as cross (<= on bar [len-2])
    expect(PineTALib.crossover([2, 3], [2, 1])).toBe(true);
    // Equal on both bars — no cross
    expect(PineTALib.crossover([2, 2], [2, 2])).toBe(false);
  });

  test('crossunder: classic, touch-then-cross, and flat', () => {
    expect(PineTALib.crossunder([2, 1], [1, 2])).toBe(true);
    // Already strictly below — first leg fails >=
    expect(PineTALib.crossunder([1, 1], [2, 2])).toBe(false);
    // Equal on previous bar, then A < B
    expect(PineTALib.crossunder([2, 1], [2, 3])).toBe(true);
    expect(PineTALib.crossunder([2, 2], [2, 2])).toBe(false);
  });
});

describe('PineTALib golden — edge cases (documents current behavior; not "good" semantics)', () => {
  test('length <= 0 returns null', () => {
    expect(PineTALib.sma([1, 2, 3], 0)).toBeNull();
    expect(PineTALib.rsi([1, 2, 3], 0)).toBeNull();
    expect(PineTALib.highest([1], 0)).toBeNull();
  });

  test('sma with empty or shorter-than-length series uses divisor = length', () => {
    expect(PineTALib.sma([], 5)).toBe(0);
    expect(PineTALib.sma([1], 5)).toBeCloseTo(0.2, 10);
  });

  test('rsi when series is too short for deltas → NaN', () => {
    expect(Number.isNaN(PineTALib.rsi([10, 11], 2))).toBe(true);
  });

  test('highest/lowest on empty array (Math.max/min of no args)', () => {
    expect(PineTALib.highest([], 3)).toBe(-Infinity);
    expect(PineTALib.lowest([], 3)).toBe(Infinity);
  });

  test('crossover with len < 2 is false', () => {
    expect(PineTALib.crossover([1], [2])).toBe(false);
    expect(PineTALib.crossunder([1], [2])).toBe(false);
  });
});
