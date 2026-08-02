const PineRuntime = require('../core/PineRuntime');

// GOLDEN FIXTURES - ORACLE 2026-08-02, sourced from a LIVE TradingView chart.
// The probe battery (pine-transpiler/probes/tv-semantics-probe.pine, v5
// adaptation with `float naVal = na`) rendered these 14 values in a table on
// TV's own runtime. They are not documentation, not community FAQ, not
// inference - they are what the sealed engine actually does. Oracle overrides
// canon: the TV-partnered community FAQ claimed three-valued logic for v5
// comparisons; the chart says otherwise.
//
//   1/0 -> NaN        -1/0 -> NaN       5%0 -> NaN
//   na>5 -> false     na<5 -> false     na==na -> false
//   na!=5 -> false    na>=na -> false
//   na>0 and true -> false              na>0 or true -> true
//   na?1:2 -> 2       sqrt(-1) -> NaN   log(0) -> NaN   na+5 -> NaN
//
// One engine correction came out of this: na != x is FALSE on TV (the IEEE
// model said true). Paired compile-side finding: CONSTANT division by zero
// (literal 1/0) is refused at compile time - only variable-fed division
// reaches the runtime, where it yields na. The probe itself had to feed the
// division rows through variables to get past TV's compiler.

const CANDLE = { timestamp: 1, open: 10, high: 11, low: 9, close: 11, volume: 100 };

function run(bodyLines) {
  const runtime = new PineRuntime(
    ['//@version=5', 'strategy("TV oracle fixtures")', ...bodyLines].join('\n')
  );
  runtime.evaluate(CANDLE);
  return runtime.state;
}

// TV renders na floats as "NaN"; our engine carries na as null (and treats
// any non-finite number as na - _isNa). Both spellings are the same value.
function expectNa(v) {
  const isNa = v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v));
  expect(isNa).toBe(true);
}

describe('TV oracle - division and modulo by zero (runtime half: variable-fed -> na)', () => {
  test('1/0, -1/0, 5%0 through variables all yield na', () => {
    const state = run([
      'var float one = 1.0',
      'var float zero = 0.0',
      'var float five = 5.0',
      'a = one / zero',
      'b = -one / zero',
      'c = five % zero',
      'plot(close)',
    ]);
    expectNa(state.a);
    expectNa(state.b);
    expectNa(state.c);
  });

  test('divisor that is a variable holding zero stays a RUNTIME na, not a compile refusal', () => {
    // The compile refusal is only for constant/constant forms - a zero that
    // arrives through a variable is invisible to TV's compiler and to ours.
    const state = run(['var float zero = 0.0', 'q = close / zero', 'plot(close)']);
    expectNa(state.q);
  });
});

describe('TV oracle - constant division by zero refuses at COMPILE time (paired finding)', () => {
  function loadExpectingRefusal(bodyLines) {
    let thrown;
    try {
      new PineRuntime(
        ['//@version=5', 'strategy("TV oracle fixtures")', ...bodyLines].join('\n')
      );
    } catch (e) {
      thrown = e;
    }
    return thrown;
  }

  test.each([
    ['x = 1 / 0'],
    ['x = -1 / 0'],
    ['x = 5 % 0'],
  ])('%s never runs a bar', (line) => {
    const thrown = loadExpectingRefusal([line, 'plot(close)']);
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_LOAD_REFUSED');
    expect(thrown.message).toContain('constant division by zero');
  });
});

describe('TV oracle - every comparison with an na operand is false (including !=)', () => {
  test('na>5, na<5, na==na, na!=5, na>=na all false', () => {
    const state = run([
      'var float naVal = na',
      'a = naVal > 5',
      'b = naVal < 5',
      'c = naVal == naVal',
      'd = naVal != 5',
      'e = naVal >= naVal',
      'plot(close)',
    ]);
    expect(state.a).toBe(false);
    expect(state.b).toBe(false);
    expect(state.c).toBe(false);
    // The one assumption the oracle killed: IEEE says NaN != x is true;
    // TV says false. na comparisons yield na, and na-as-bool acts as false.
    expect(state.d).toBe(false);
    expect(state.e).toBe(false);
  });
});

describe('TV oracle - na in logical and ternary positions', () => {
  test('na acts as false in and/or; ternary with na condition takes the false branch', () => {
    const state = run([
      'var float naVal = na',
      'a = naVal > 0 and true',
      'b = naVal > 0 or true',
      'c = naVal > 0 ? 1 : 2',
      'plot(close)',
    ]);
    expect(state.a).toBe(false);
    expect(state.b).toBe(true);
    expect(state.c).toBe(2);
  });
});

describe('TV oracle - math domain errors and na arithmetic propagate na', () => {
  test('sqrt(-1), log(0), na+5 all yield na', () => {
    const state = run([
      'var float naVal = na',
      'var float negOne = -1.0',
      'var float zero = 0.0',
      'a = math.sqrt(negOne)',
      'b = math.log(zero)',
      'c = naVal + 5',
      'plot(close)',
    ]);
    expectNa(state.a);
    expectNa(state.b);
    expectNa(state.c);
  });
});
