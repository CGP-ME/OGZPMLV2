const PineRuntime = require('../core/PineRuntime');

const candles = [
  { timestamp: 1, open: 100, high: 120, low: 90, close: 110, volume: 100 },
  { timestamp: 2, open: 101, high: 122, low: 95, close: 112, volume: 110 },
  { timestamp: 3, open: 104, high: 124, low: 96, close: 116, volume: 120 },
  { timestamp: 4, open: 108, high: 128, low: 100, close: 114, volume: 130 },
];

function run(script, sourceCandles = candles) {
  const runtime = new PineRuntime(['//@version=5', 'indicator("fabrication purge")', ...script].join('\n'));
  sourceCandles.forEach((candle) => runtime.evaluate(candle));
  return runtime;
}

describe('PineRuntime fabrication purge', () => {
  test('windowed TA uses computed source expressions instead of legacy close fallback', () => {
    const runtime = run([
      'x = ta.sma(close * 2, 2)',
      'y = ta.sma(close - open, 2)',
      'plot(x)',
      'plot(y)',
    ], candles.slice(0, 2));

    expect(runtime.state.x).toBe(222);
    expect(runtime.state.y).toBe(10.5);
    expect(runtime.state.x).not.toBe(111);
  });

  test('windowed TA preserves user-variable computed sources used by LOADS-class scripts', () => {
    const runtime = run([
      'spread = close - open',
      'smoothed = sma(spread, 3)',
      'plot(smoothed)',
    ]);

    expect(runtime.state.smoothed).toBeCloseTo((11 + 12 + 6) / 3, 10);
  });

  test('valuewhen honors condition and occurrence instead of returning latest source', () => {
    const runtime = run([
      'latestHit = ta.valuewhen(close > 112, open, 0)',
      'previousHit = ta.valuewhen(close > 112, open, 1)',
      'missingHit = ta.valuewhen(close > 112, open, 2)',
      'plot(latestHit)',
    ]);

    expect(runtime.state.latestHit).toBe(108);
    expect(runtime.state.previousHit).toBe(104);
    expect(runtime.state.missingHit).toBeNull();
  });

  test('wavetrend-style computed EMA source does not collapse back to close', () => {
    const runtime = run([
      'ap = close',
      'esa = ema(ap, 3)',
      'de = ema(abs(ap - esa), 3)',
      'plain = ema(close, 3)',
      'plot(de)',
    ], [
      { timestamp: 1, open: 100, high: 110, low: 95, close: 100, volume: 100 },
      { timestamp: 2, open: 100, high: 116, low: 98, close: 112, volume: 100 },
      { timestamp: 3, open: 100, high: 125, low: 99, close: 122, volume: 100 },
      { timestamp: 4, open: 100, high: 127, low: 99, close: 126, volume: 100 },
      { timestamp: 5, open: 100, high: 126, low: 99, close: 124, volume: 100 },
      { timestamp: 6, open: 100, high: 132, low: 99, close: 130, volume: 100 },
    ]);

    expect(runtime.state.de).toBeCloseTo(5.6111111111, 10);
    expect(runtime.state.plain).toBeCloseTo(125.6666666667, 10);
    expect(runtime.state.de).not.toBe(runtime.state.plain);
  });

  test('windowed range TA keeps missing values from becoming zero', () => {
    const runtime = run([
      'hi = ta.highest(na, 1)',
      'lo = ta.lowest(na, 1)',
      'st = ta.stdev(na, 1)',
      'plot(hi)',
    ], candles.slice(0, 1));

    expect(runtime.state.hi).toBeNull();
    expect(runtime.state.lo).toBeNull();
    expect(runtime.state.st).toBeNull();
  });

  test('missing closed-trade lookup returns na instead of fake zero profit', () => {
    const runtime = run([
      'profit = strategy.closedtrades.profit(0)',
      'plot(profit)',
    ], candles.slice(0, 1));

    expect(runtime.state.profit).toBeNull();
  });

  test('syminfo and timeframe values come from host context', () => {
    const runtime = new PineRuntime([
      '//@version=5',
      'indicator("host context")',
      'a = syminfo.ticker',
      'b = syminfo.tickerid',
      'c = syminfo.mintick',
      'd = timeframe.period',
      'e = timeframe.multiplier',
      'f = timeframe.isminutes',
      'rounded = ta.sma(close, 1)',
      'plot(rounded)',
    ].join('\n'), {
      symbol: 'NVDA',
      tickerid: 'NASDAQ:NVDA',
      timeframe: '5m',
      mintick: 0.05,
    });

    runtime.evaluate({ timestamp: 1, open: 1, high: 2, low: 1, close: 1.234, volume: 10 });

    expect(runtime.state.a).toBe('NVDA');
    expect(runtime.state.b).toBe('NASDAQ:NVDA');
    expect(runtime.state.c).toBe(0.05);
    expect(runtime.state.d).toBe('5');
    expect(runtime.state.e).toBe(5);
    expect(runtime.state.f).toBe(true);
    expect(runtime.state.rounded).toBe(1.25);
  });

  test('chart identity lookup records named absence when host context is absent', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const runtime = new PineRuntime([
        '//@version=5',
        'indicator("missing host context")',
        'a = syminfo.ticker',
        'b = timeframe.period',
        'plot(close)',
      ].join('\n'));

      const result = runtime.evaluate({ timestamp: 1, open: 1, high: 2, low: 1, close: 1.234, volume: 10 });

      expect(result).toEqual(expect.objectContaining({
        status: 'unavailable',
        code: 'strategy_unavailable',
        reason: 'pine_host_context_unavailable',
        source: 'host_context',
        errorMessage: 'missing syminfo.ticker',
      }));
      expect(runtime.state.a).toBeNull();
      expect(runtime.state.b).toBeNull();
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('STRATEGY_UNAVAILABLE source=host_context'));
    } finally {
      consoleError.mockRestore();
    }
  });

  test('literal visual value as computed TA source stays a load-time refusal', () => {
    expect(() => run([
      'x = ta.sma(color.red, 2)',
      'y = ta.sma(close, 2)',
      'plot(x)',
    ], candles.slice(0, 2))).toThrow(/Pine load refused/);
  });
});
