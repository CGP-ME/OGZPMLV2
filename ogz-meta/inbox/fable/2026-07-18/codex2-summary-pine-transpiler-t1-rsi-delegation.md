# Codex-2 Pine Transpiler T1 RSI Delegation Follow-Up

Date: 2026-07-18
Lane: T1 follow-up after Phase C Lane 8
Territory: pine-transpiler/ plus this inbox report

## Result

Lane 8 landed `IndicatorCalculator.calculateWilderRSIFromCloses`, so the held Pine RSI item is now wired.

## Changes

- `pine-transpiler/core/PineTALib.js` now delegates `rsi(series, length)` to `IndicatorCalculator.calculateWilderRSIFromCloses(series, length)`.
- `pine-transpiler/__tests__/PineTALib.golden.test.js` now runs the RSI Wilder/RMA golden as an active passing test.
- ATR has an active named-gap test instead of a skipped future assertion because Lane 8 provided shared RSI truth, not a shared ATR/Wilder true-range module.

## Verification

- `node --check pine-transpiler/core/PineTALib.js`
- `node --check pine-transpiler/__tests__/PineTALib.golden.test.js`
- `npx jest pine-transpiler/__tests__/PineTALib.golden.test.js pine-transpiler/__tests__/PineParityHarness.test.js pine-transpiler/__tests__/PineFeatureScanner.refusal.test.js --runInBand`
