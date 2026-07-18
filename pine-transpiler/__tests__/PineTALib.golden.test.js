const PineTALib = require('../core/PineTALib');
const { IndicatorCalculator } = require('../../core/IndicatorCalculator');

function tvSma(series, length) {
  if (series.length < length) return null;
  const window = series.slice(-length);
  return window.reduce((sum, value) => sum + value, 0) / length;
}

function tvEmaSmaSeed(series, length) {
  if (series.length < length) return null;
  const alpha = 2 / (length + 1);
  let ema = tvSma(series.slice(0, length), length);
  for (let i = length; i < series.length; i++) {
    ema = series[i] * alpha + ema * (1 - alpha);
  }
  return ema;
}

function tvRma(values, length) {
  if (values.length < length) return null;
  let rma = tvSma(values.slice(0, length), length);
  for (let i = length; i < values.length; i++) {
    rma = (rma * (length - 1) + values[i]) / length;
  }
  return rma;
}

function tvRsi(series, length) {
  const gains = [];
  const losses = [];
  for (let i = 1; i < series.length; i++) {
    const delta = series[i] - series[i - 1];
    gains.push(Math.max(delta, 0));
    losses.push(Math.max(-delta, 0));
  }
  const avgGain = tvRma(gains, length);
  const avgLoss = tvRma(losses, length);
  if (avgGain === null || avgLoss === null) return null;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function tvAtr(high, low, close, length) {
  const trueRanges = [];
  for (let i = 0; i < high.length; i++) {
    if (i === 0) {
      trueRanges.push(high[i] - low[i]);
    } else {
      trueRanges.push(Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1])
      ));
    }
  }
  return tvRma(trueRanges, length);
}

describe('PineTALib TradingView goldens — SMA / highest / lowest', () => {
  test('sma returns the average of the last full length window', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // TV reference: ta.sma(source, 3) at the last bar = (8 + 9 + 10) / 3 = 9.
    expect(PineTALib.sma(s, 3)).toBeCloseTo(9, 10);
    // TV reference: the full 10-bar window average is 55 / 10 = 5.5.
    expect(PineTALib.sma(s, 10)).toBeCloseTo(5.5, 10);
  });

  test('sma returns null until the first full window exists', () => {
    // TV returns na before `length` source values exist; this runtime represents na as null.
    expect(PineTALib.sma([1, 2], 3)).toBeNull();
  });

  test('highest / lowest use the trailing full window', () => {
    const s = [3, 1, 4, 1, 5, 9, 2, 6];
    // TV reference: last 4 bars are [5, 9, 2, 6], so highest=9 and lowest=2.
    expect(PineTALib.highest(s, 4)).toBe(9);
    expect(PineTALib.lowest(s, 4)).toBe(2);
    // TV returns na before a full lookback window exists.
    expect(PineTALib.highest([3, 1], 3)).toBeNull();
    expect(PineTALib.lowest([3, 1], 3)).toBeNull();
  });
});

describe('PineTALib TradingView goldens — EMA', () => {
  test('ema seeds from SMA(length), then applies alpha recurrence', () => {
    const series = [10, 20, 30, 40, 50];
    const len = 3;
    // TV reference per lane spec:
    // seed = SMA(first 3) = (10 + 20 + 30) / 3 = 20
    // alpha = 2 / (3 + 1) = 0.5
    // bar 3 EMA = 40 * 0.5 + 20 * 0.5 = 30
    // bar 4 EMA = 50 * 0.5 + 30 * 0.5 = 40
    expect(tvEmaSmaSeed(series, len)).toBeCloseTo(40, 10);
    expect(PineTALib.ema(series, len)).toBeCloseTo(40, 10);
  });

  test('ema returns null until the seed SMA window exists', () => {
    // TV reference: ta.ema is na before the length-bar seed exists.
    expect(PineTALib.ema([10, 20], 3)).toBeNull();
  });
});

describe('PineTALib TradingView goldens — RSI', () => {
  test('rsi delegates to the shared Wilder/RMA reference', () => {
    const series = [10, 12, 11, 13, 14, 13, 15];
    const length = 3;
    // TV ta.rsi = 100 - 100 / (1 + RMA(gains, length) / RMA(losses, length)).
    // Deltas are +2, -1, +2, +1, -1, +2.
    // Seed gain RMA=(2+0+2)/3=1.3333333333; loss RMA=(0+1+0)/3=0.3333333333.
    // After +1, -1, +2 updates: gain RMA=1.2098765432; loss RMA=0.3209876543.
    // RSI = 100 - 100 / (1 + 1.2098765432 / 0.3209876543) = 79.0322580645.
    const tvReference = tvRsi(series, length);
    expect(tvReference).toBeCloseTo(79.0322580645, 10);
    expect(PineTALib.rsi(series, length)).toBeCloseTo(tvReference, 10);
  });

  test('rsi preserves the shared neutral warmup contract', () => {
    // Lane 8's shared module deliberately returns neutral 50 until period+1 closes exist.
    expect(PineTALib.rsi([10, 11, 12], 3)).toBe(50);
  });
});

describe('PineTALib TradingView goldens — ATR delegation hold', () => {
  test('documents current ATR defect against TV true-range RMA reference', () => {
    const high = [10, 12, 11, 14, 13];
    const low = [8, 9, 9, 10, 11];
    const close = [9, 11, 10, 12, 12];
    const length = 3;
    // TV ta.atr = RMA(ta.tr(true), length).
    // TR values are 2, 3, 2, 4, 2.
    // Seed ATR=(2+3+2)/3=2.3333333333.
    // After TR 4: ATR=(2.3333333333*2+4)/3=2.8888888889.
    // After TR 2: ATR=(2.8888888889*2+2)/3=2.5925925926.
    const tvReference = tvAtr(high, low, close, length);
    expect(tvReference).toBeCloseTo(2.5925925926, 10);
    expect(PineTALib.atr(high, low, close, length)).not.toBeCloseTo(tvReference, 10);
  });

  test('keeps ATR delegation as a named gap until a shared Wilder ATR export exists', () => {
    const high = [10, 12, 11, 14, 13];
    const low = [8, 9, 9, 10, 11];
    const close = [9, 11, 10, 12, 12];
    expect(IndicatorCalculator.calculateWilderATR).toBeUndefined();
    expect(IndicatorCalculator.calculateWilderATRFromOHLC).toBeUndefined();
    expect(PineTALib.atr(high, low, close, 3)).not.toBeCloseTo(tvAtr(high, low, close, 3), 10);
  });
});

describe('PineTALib TradingView goldens — stdev', () => {
  test('stdev uses biased population variance by default', () => {
    const series = [2, 4, 6, 8];
    const length = 4;
    // TV ta.stdev(source, length) default biased=true:
    // mean=(2+4+6+8)/4=5; squared deviations are 9,1,1,9; variance=20/4=5.
    const mean = tvSma(series, length);
    const slice = series.slice(-length);
    const variance =
      slice.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / length;
    expect(mean).toBeCloseTo(5, 10);
    expect(variance).toBeCloseTo(5, 10);
    expect(PineTALib.stdev(series, length)).toBeCloseTo(Math.sqrt(5), 10);
  });

  test('stdev returns null until a full window exists', () => {
    // TV returns na before `length` source values exist.
    expect(PineTALib.stdev([2, 4, 6], 4)).toBeNull();
  });
});

describe('PineTALib TradingView goldens — VWAP', () => {
  test('vwap is cumulative volume-weighted source', () => {
    const source = [9, 11];
    const volume = [100, 200];
    // TV ta.vwap(source) reference for one anchor window:
    // (9 * 100 + 11 * 200) / (100 + 200) = 31 / 3 = 10.3333333333.
    const manual = (9 * 100 + 11 * 200) / 300;
    expect(PineTALib.vwap(source, volume)).toBeCloseTo(manual, 10);
  });

  test('vwap returns null when cumulative volume is zero', () => {
    // TV cannot produce a finite weighted average when total volume is zero.
    expect(PineTALib.vwap([1, 2], [0, 0])).toBeNull();
  });
});

describe('PineTALib TradingView goldens — crossover / crossunder', () => {
  test('crossover: classic and touch-then-cross', () => {
    // TV ta.crossover(a,b): a > b on current bar and a[1] <= b[1] on prior bar.
    expect(PineTALib.crossover([1, 2], [2, 1])).toBe(true);
    expect(PineTALib.crossover([2, 2], [1, 1])).toBe(false);
    expect(PineTALib.crossover([2, 3], [2, 1])).toBe(true);
    expect(PineTALib.crossover([2, 2], [2, 2])).toBe(false);
  });

  test('crossunder: classic, touch-then-cross, and flat', () => {
    // TV ta.crossunder(a,b): a < b on current bar and a[1] >= b[1] on prior bar.
    expect(PineTALib.crossunder([2, 1], [1, 2])).toBe(true);
    expect(PineTALib.crossunder([1, 1], [2, 2])).toBe(false);
    expect(PineTALib.crossunder([2, 1], [2, 3])).toBe(true);
    expect(PineTALib.crossunder([2, 2], [2, 2])).toBe(false);
  });
});

describe('PineTALib TradingView goldens — edge cases', () => {
  test('length <= 0 returns null', () => {
    expect(PineTALib.sma([1, 2, 3], 0)).toBeNull();
    expect(PineTALib.ema([1, 2, 3], 0)).toBeNull();
    expect(PineTALib.rsi([1, 2, 3], 0)).toBeNull();
    expect(PineTALib.atr([1], [1], [1], 0)).toBeNull();
    expect(PineTALib.highest([1], 0)).toBeNull();
    expect(PineTALib.lowest([1], 0)).toBeNull();
    expect(PineTALib.stdev([1, 2, 3], 0)).toBeNull();
  });

  test('crossover/crossunder with len < 2 is false', () => {
    // TV needs a current and prior bar to detect a crossing event.
    expect(PineTALib.crossover([1], [2])).toBe(false);
    expect(PineTALib.crossunder([1], [2])).toBe(false);
  });
});
