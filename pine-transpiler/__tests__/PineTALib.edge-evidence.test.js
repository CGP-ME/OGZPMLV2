const PineTALib = require('../core/PineTALib');

// Kimi-k3 adversarial review (2026-07-31, cognition-history/mercury-runs)
// blocked the wma/rma/linreg/stoch/cross definitions pending EXECUTED edge
// evidence. These are those five cases, with expectations from TradingView's
// published definitions. Note on case 3: Kimi expected null for
// offset > length-1, but TV's documented formula is unconditionally
// linreg = intercept + slope * (length - 1 - offset) - offset extrapolates,
// it does not na out. Window [3,4,5]: intercept 3, slope 1 -> 3 + 1*(-1) = 2.
describe('PineTALib edge evidence (Kimi adversarial recheck)', () => {
  test('wma length 1 is the value itself', () => {
    expect(PineTALib.wma([5], 1)).toBe(5);
  });

  test('rma emits the SMA seed exactly at bar length, not earlier', () => {
    expect(PineTALib.rma([1, 2, 3], 3)).toBeCloseTo(2, 10);
    expect(PineTALib.rma([1, 2], 3)).toBeNull();
  });

  test('linreg offset beyond window extrapolates per the TV formula', () => {
    expect(PineTALib.linreg([1, 2, 3, 4, 5], 3, 3)).toBeCloseTo(2, 10);
  });

  test('stoch returns na when highest equals lowest', () => {
    expect(PineTALib.stoch([10, 12, 14], [15, 15, 15], [15, 15, 15], 3)).toBeNull();
  });

  test('cross fires on either direction', () => {
    expect(PineTALib.cross([1, 2, 3], [3, 2, 1])).toBe(true);
    expect(PineTALib.cross([3, 2, 1], [1, 2, 3])).toBe(true);
    expect(PineTALib.cross([1, 2, 3], [0, 0, 0])).toBe(false);
  });
});
