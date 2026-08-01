const PineRuntime = require('../core/PineRuntime');

// No silent na resolution. A cosmetic value (color/PINE_NOOP) reaching any
// computational position is invalid Pine - TradingView rejects it at compile
// time - so the runtime must fail LOUD with PINE_TYPE_VIOLATION, never quietly
// resolve the sentinel to na. Guarded positions: unary operand, binary operand,
// logical operand, ternary CONDITION. Color-valued ternary BRANCHES stay legal
// (cond ? color.red : color.green feeding a visual is everyday valid Pine).

const CANDLE = { timestamp: 1, open: 10, high: 11, low: 9, close: 11, volume: 100 };

function buildScript(bodyLines) {
  return ['//@version=5', 'strategy("TypeViolation corpus")', ...bodyLines].join('\n');
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

describe('PINE_TYPE_VIOLATION - cosmetic values fail loud in computation', () => {
  test('binary arithmetic on a hex color literal throws', () => {
    const thrown = evalExpectingThrow(['x = #ff0000 + 1', 'plot(x)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_TYPE_VIOLATION');
    expect(thrown.message).toContain("binary '+'");
  });

  test('binary comparison on a named color throws', () => {
    const thrown = evalExpectingThrow(['y = color.red == color.red', 'plot(close)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_TYPE_VIOLATION');
    expect(thrown.message).toContain("binary '=='");
  });

  test('unary minus on a hex color literal throws', () => {
    const thrown = evalExpectingThrow(['z = -#00ff00', 'plot(close)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_TYPE_VIOLATION');
    expect(thrown.message).toContain("unary '-'");
  });

  test('color as logical operand throws instead of acting truthy', () => {
    const thrown = evalExpectingThrow([
      'if #ff0000 and close > 0',
      '    strategy.entry("L", strategy.long)',
    ]);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_TYPE_VIOLATION');
    expect(thrown.message).toContain("logical 'and'");
  });

  test('color as right-hand logical operand throws when reached', () => {
    const thrown = evalExpectingThrow([
      'if close > 0 and #ff0000',
      '    strategy.entry("L", strategy.long)',
    ]);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_TYPE_VIOLATION');
    expect(thrown.message).toContain("logical 'and'");
  });

  test('color as ternary condition throws instead of acting truthy', () => {
    const thrown = evalExpectingThrow(['w = #ff0000 ? 1 : 2', 'plot(w)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_TYPE_VIOLATION');
    expect(thrown.message).toContain('ternary condition');
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

  test('short-circuit still protects an unreached color operand', () => {
    // `false and <color>` never evaluates the right side in Pine; the guard
    // must not force-evaluate it just to type-check. Same for `true or <color>`.
    const runtime = new PineRuntime(
      buildScript([
        'if close < 0 and #ff0000',
        '    strategy.entry("L", strategy.long)',
        'if close > 0 or #ff0000',
        '    strategy.entry("S", strategy.short)',
        'plot(close)',
      ])
    );
    expect(() => runtime.evaluate(CANDLE)).not.toThrow();
  });
});
