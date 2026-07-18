# Codex-2 Pine Transpiler T1 TA-LIB Truth Audit

Date: 2026-07-18
Lane: T1 TA-LIB truth audit
Territory: pine-transpiler/ plus this inbox report

## Scope

Audited every function in `pine-transpiler/core/PineTALib.js`:

- `sma`
- `ema`
- `rsi`
- `atr`
- `highest`
- `lowest`
- `stdev`
- `vwap`
- `crossover`
- `crossunder`

## Changes

- Added TradingView-reference golden tests for every PineTALib function in `pine-transpiler/__tests__/PineTALib.golden.test.js`.
- Fixed pure-math semantics directly:
  - `sma` returns `null` before a full window exists.
  - `ema` now seeds from `SMA(length)` before applying the EMA recurrence.
  - `highest` and `lowest` return `null` before a full lookback window exists.
  - `stdev` returns `null` before a full window exists and keeps the TradingView default biased variance.
  - `vwap` now computes cumulative volume-weighted source instead of hardcoded HLC3.
- Updated `PineRuntime` `ta.vwap(src)` dispatch so the Pine source argument is honored; no-arg `ta.vwap()` still defaults to HLC3.
- Left `rsi` and `atr` unwired by design. Tests document the TradingView Wilder/RMA vectors and confirm the current mismatch; the future match assertions are skipped pending Lane 8's shared Wilder module.
- Amended SMS-v4 parity fixture law:
  - Fixture now expects TradingView candle CSV at `pine-transpiler/fixtures/parity/tradingview/sms-v4-candles.csv`.
  - Fixture now expects TradingView trade-list CSV at `pine-transpiler/fixtures/parity/tradingview/sms-v4-trades.csv`.
  - Alpaca JSON is no longer treated as the SMS-v4 parity candle source.
- Extended the parity harness to parse CSV candle/trade exports and to block cleanly until the TradingView exports exist.

## Certification Status

Pure math functions covered by active TV-reference tests now pass. RSI and ATR remain delegation holds until Lane 8 lands the shared Wilder/RMA module.

## Verification

- `node --check pine-transpiler/core/PineTALib.js`
- `node --check pine-transpiler/core/PineRuntime.js`
- `node --check pine-transpiler/core/PineParityHarness.js`
- `node --check pine-transpiler/__tests__/PineTALib.golden.test.js`
- `node --check pine-transpiler/__tests__/PineParityHarness.test.js`
- `npx jest pine-transpiler/__tests__/PineTALib.golden.test.js pine-transpiler/__tests__/PineParityHarness.test.js pine-transpiler/__tests__/PineFeatureScanner.refusal.test.js --runInBand`
