const PineRuntime = require('../core/PineRuntime');

// v5 type-cast family - the divergence-prone corners only.
// Sourced: int() TRUNCATES (not rounds, not floors - toward zero, so
// int(-3.7) is -3 where floor would give -4); bool() casts 0, 0.0, and na
// to false; int()/float() propagate na. A cast on a type it cannot take is
// a TV compile-time error - loud PINE_TYPE_VIOLATION here.

const CANDLE = { timestamp: 1, open: 10, high: 11, low: 9, close: 11, volume: 100 };

function run(bodyLines) {
  const runtime = new PineRuntime(
    ['//@version=5', 'strategy("cast corpus")', ...bodyLines].join('\n')
  );
  runtime.evaluate(CANDLE);
  return runtime.state;
}

describe('type-cast builtins', () => {
  test('int() truncates toward zero - positive and negative', () => {
    const state = run([
      'var float p = 3.7',
      'var float n = -3.7',
      'a = int(p)',
      'b = int(n)',
      'plot(close)',
    ]);
    expect(state.a).toBe(3);
    expect(state.b).toBe(-3); // floor would say -4; TV truncates
  });

  test('bool() casts na and zero to false, other numbers to true', () => {
    const state = run([
      'var float naVal = na',
      'var float zero = 0.0',
      'a = bool(naVal)',
      'b = bool(zero)',
      'c = bool(2)',
      'plot(close)',
    ]);
    expect(state.a).toBe(false);
    expect(state.b).toBe(false);
    expect(state.c).toBe(true);
  });

  test('int() and float() propagate na', () => {
    const state = run([
      'var float naVal = na',
      'a = int(naVal)',
      'b = float(naVal)',
      'plot(close)',
    ]);
    expect(state.a).toBeNull();
    expect(state.b).toBeNull();
  });

  test('checked math boundary: na propagates through scalar fns instead of JS-coercing', () => {
    // The leak class this seals: raw Math members silently coerce null -
    // Math.abs(null) = 0, Math.max(null, 5) = 5, Math.pow(null, 2) = 0.
    // Pine: any na argument -> na.
    const state = run([
      'var float naVal = na',
      'a = abs(naVal)',
      'b = max(naVal, 5)',
      'c = math.pow(naVal, 2)',
      'd = math.abs(naVal)',
      'plot(close)',
    ]);
    expect(state.a).toBeNull();
    expect(state.b).toBeNull();
    expect(state.c).toBeNull();
    expect(state.d).toBeNull();
  });

  test('cast on an uncastable type throws loud, never resolves silently', () => {
    const runtime = new PineRuntime(
      ['//@version=5', 'strategy("cast corpus")', 's = "text"', 'x = int(s)', 'plot(close)'].join('\n')
    );
    let thrown;
    try {
      runtime.evaluate(CANDLE);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_TYPE_VIOLATION');
  });
});
