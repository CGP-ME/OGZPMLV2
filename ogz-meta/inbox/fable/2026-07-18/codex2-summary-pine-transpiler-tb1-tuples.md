# Codex-2 Pine Transpiler T-B1 Tuple Assignment Report

Date: 2026-07-18
Lane: T-B1 tuple assignment
Territory: pine-transpiler/ plus this inbox report

## Result

Tuple assignment is no longer a refusal boundary. The transpiler now parses and executes bracket destructuring for tuple-returning expressions such as `ta.macd`.

## Changes

- Added parser support for `[a, b, c] = expr` as `TupleAssignment`.
- Fixed the existing no-newline token stream edge where `strategy(...)\n[tuple] = ...` was interpreted as bracket access on the strategy call.
- Added runtime destructuring into state variables, including `_` ignored slots.
- Added `PineTALib.macd(source, fast, slow, signal)` returning `[macd, signal, histogram]`.
- Added `ta.macd(...)` dispatch in `PineRuntime`.
- Removed `tuples` from the import refusal list while keeping tuple detection visible in scanner output.
- Added golden tuple/macd tests with hand-computed TradingView-style EMA-seeded MACD vectors.

## Refusal List After T-B1

Still refused pending later lanes or Trey ruling:

- `request.security()` with lookahead
- `calc_on_every_tick=true`
- `varip`
- `array.from`
- recursive functions
- `switch`

Tuple assignment is deleted from the refusal list in this commit.

## Verification

- `node --check pine-transpiler/core/PineParser.js`
- `node --check pine-transpiler/core/PineRuntime.js`
- `node --check pine-transpiler/core/PineTALib.js`
- `node --check pine-transpiler/core/PineFeatureScanner.js`
- `node --check pine-transpiler/__tests__/PineTupleAssignment.test.js`
- `node --check pine-transpiler/__tests__/PineFeatureScanner.refusal.test.js`
- `npx jest pine-transpiler/__tests__/PineTupleAssignment.test.js pine-transpiler/__tests__/PineFeatureScanner.refusal.test.js pine-transpiler/__tests__/PineTALib.golden.test.js --runInBand`
