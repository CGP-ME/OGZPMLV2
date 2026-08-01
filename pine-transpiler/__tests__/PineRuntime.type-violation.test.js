const PineRuntime = require('../core/PineRuntime');

// No silent na resolution - two-layer enforcement mirroring TradingView.
// Layer 1 (load gate): TV's compiler is statically typed, so a color/visual
// value in a computational position is a COMPILE-time error - the script
// refuses to load (PINE_LOAD_REFUSED) before any candle, exactly like TV.
// Layer 2 (runtime backstop): a cosmetic value laundered through a variable
// is invisible to the static walk; when it reaches an operator or a
// computational call argument at evaluate time it throws PINE_TYPE_VIOLATION.
// Either way: loud, named, never a quiet na / close-substitution / NaN.

const CANDLE = { timestamp: 1, open: 10, high: 11, low: 9, close: 11, volume: 100 };

function buildScript(bodyLines) {
  return ['//@version=5', 'strategy("TypeViolation corpus")', ...bodyLines].join('\n');
}

function loadExpectingRefusal(bodyLines) {
  let thrown;
  try {
    new PineRuntime(buildScript(bodyLines));
  } catch (e) {
    thrown = e;
  }
  return thrown;
}

function evalExpectingThrow(bodyLines) {
  const runtime = new PineRuntime(buildScript(bodyLines));
  let thrown;
  try {
    runtime.evaluate(CANDLE);
  } catch (e) {
    thrown = e;
  }
  return thrown;
}

describe('load gate - direct cosmetic values in computation refuse at compile time (TV parity)', () => {
  test('binary arithmetic on a hex color literal refuses to load', () => {
    const thrown = loadExpectingRefusal(['x = #ff0000 + 1', 'plot(x)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_LOAD_REFUSED');
    expect(thrown.message).toContain("binary '+'");
  });

  test('binary comparison on a named color refuses to load', () => {
    const thrown = loadExpectingRefusal(['y = color.red == color.red', 'plot(close)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_LOAD_REFUSED');
    expect(thrown.message).toContain("binary '=='");
  });

  test('unary minus on a hex color literal refuses to load', () => {
    const thrown = loadExpectingRefusal(['z = -#00ff00', 'plot(close)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_LOAD_REFUSED');
    expect(thrown.message).toContain("unary '-'");
  });

  test('color as logical operand refuses to load even behind short-circuit', () => {
    // TV type-checks statically: close < 0 and color.red never compiles,
    // short-circuit or not.
    const thrown = loadExpectingRefusal([
      'if close < 0 and #ff0000',
      '    strategy.entry("L", strategy.long)',
    ]);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_LOAD_REFUSED');
    expect(thrown.message).toContain("logical 'and'");
  });

  test('color as ternary condition refuses to load', () => {
    const thrown = loadExpectingRefusal(['w = #ff0000 ? 1 : 2', 'plot(w)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_LOAD_REFUSED');
    expect(thrown.message).toContain('ternary condition');
  });

  test('color as ta.* series argument refuses to load (Mercury finding)', () => {
    const thrown = loadExpectingRefusal(['x = ta.sma(color.red, 5)', 'plot(x)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_LOAD_REFUSED');
    expect(thrown.message).toContain("argument to 'ta.sma()'");
  });

  test('bare visual identifier as v2 TA argument refuses to load', () => {
    const thrown = loadExpectingRefusal(['x = sma(red, 5)', 'plot(x)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_LOAD_REFUSED');
    expect(thrown.message).toContain("argument to 'sma()'");
  });

  test('color as if-condition refuses to load', () => {
    const thrown = loadExpectingRefusal([
      'if color.red',
      '    strategy.entry("L", strategy.long)',
    ]);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_LOAD_REFUSED');
    expect(thrown.message).toContain("'if' condition");
  });
});

describe('runtime backstop - laundered cosmetic values fail loud at evaluate time', () => {
  test('laundered color in binary arithmetic throws PINE_TYPE_VIOLATION', () => {
    const thrown = evalExpectingThrow(['c = color.red', 'x = c + 1', 'plot(x)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_TYPE_VIOLATION');
    expect(thrown.message).toContain("binary '+'");
  });

  test('laundered color as TA series argument throws instead of substituting close', () => {
    const thrown = evalExpectingThrow(['c = color.red', 'x = ta.sma(c, 5)', 'plot(x)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_TYPE_VIOLATION');
    expect(thrown.message).toContain('ta.sma');
  });

  test('laundered color as TA length argument throws instead of silent NaN', () => {
    const thrown = evalExpectingThrow(['c = color.red', 'x = ta.sma(close, c)', 'plot(x)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_TYPE_VIOLATION');
    expect(thrown.message).toContain('ta.sma');
  });

  test('laundered color into nz() throws instead of returning the sentinel', () => {
    const thrown = evalExpectingThrow(['c = color.red', 'x = nz(c)', 'plot(x)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_TYPE_VIOLATION');
    expect(thrown.message).toContain("argument to 'nz()'");
  });

  test('laundered color into math.max throws instead of silent NaN', () => {
    const thrown = evalExpectingThrow(['c = color.red', 'x = math.max(c, 5)', 'plot(x)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_TYPE_VIOLATION');
    expect(thrown.message).toContain('math.max');
  });

  test('color.new() result is the sentinel, not null - laundering it still fails loud', () => {
    const thrown = evalExpectingThrow(['c = color.new(color.red, 50)', 'x = c + 1', 'plot(x)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_TYPE_VIOLATION');
    expect(thrown.message).toContain("binary '+'");
  });
});

describe('valid cosmetic positions stay legal - no over-blocking', () => {
  test('color-valued ternary branches feeding a visual run clean', () => {
    const runtime = new PineRuntime(
      buildScript([
        'barColor = close > open ? color.green : color.red',
        'bgcolor(barColor)',
        'plot(close, "px", #2962FF)',
      ])
    );
    expect(() => runtime.evaluate(CANDLE)).not.toThrow();
  });

  test('v2 iff color branches feeding a plot stay legal', () => {
    const runtime = new PineRuntime(
      buildScript(['plot(close, color=iff(close > open, green, red))'])
    );
    expect(() => runtime.evaluate(CANDLE)).not.toThrow();
  });

  test('laundered color into a visual sink runs clean', () => {
    const runtime = new PineRuntime(
      buildScript(['c = color.red', 'bgcolor(c)', 'plot(close)'])
    );
    expect(() => runtime.evaluate(CANDLE)).not.toThrow();
  });

  test('runtime short-circuit still protects an unreached laundered color', () => {
    // Static walk cannot see through `c`, and the runtime must not
    // force-evaluate an unreached operand just to type-check it.
    const runtime = new PineRuntime(
      buildScript([
        'c = color.red',
        'if close < 0 and c',
        '    strategy.entry("L", strategy.long)',
        'plot(close)',
      ])
    );
    expect(() => runtime.evaluate(CANDLE)).not.toThrow();
  });
});
