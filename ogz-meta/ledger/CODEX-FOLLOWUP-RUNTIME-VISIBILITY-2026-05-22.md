# Codex Follow-up - Runtime Visibility and Eval Readiness

Date: 2026-05-22
Branch: rebuild/clean-from-baseline

## Captured During Alpaca Active-Timeframe Ingestion Fix

These are not bundled into the active-timeframe ingestion code commit unless
explicitly listed there. They need separate pipeline missions and separate
commits.

## Dashboard / Visibility

1. Global `timeframeHistories` is not symbol-scoped.
   - Current active trading aggregation uses `symbolTimeframeHistories`, but
     `CandleProcessor` dashboard broadcasts still call
     `getCandlesForTimeframe(this.ctx.dashboardTimeframe)` without a symbol.
   - Risk: dashboard can show mixed-symbol candle series when multi-symbol or
     SessionRouter mode is active.

2. `fetchAndSendHistoricalCandles()` writes broker-returned candles directly
   into global `timeframeHistories`.
   - Risk: historical fetch can overwrite live in-memory cache and may store a
     shape different from the normalized dashboard/live cache shape.
   - Needs broker-aware, symbol-aware historical fetch and merge semantics.

3. WebSocket timeframe and historical requests are not strongly validated.
   - `core/WebSocketManager.js` accepts client-provided timeframe strings and
     forwards them into `fetchAndSendHistoricalCandles()`.
   - Needs an allowed-timeframe gate and honest empty response instead of
     fallback to an unrelated bucket.

## Pipeline / Verification

4. Pipeline anchor gate still compares default full P0 against the old
   `$13213.042341608163` baseline.
   - Current repo docs state default KILL 7 behavior is
     `$13255.255799695915 / 1410 trades / 60.6% WR / PF 1.71`.
   - Old `$13213.042341608163 / 1384 trades` holds only when adaptive trail
     modifiers are disabled.
   - Do not edit anchor docs casually; fix the pipeline gate only after a
     dedicated anchor-proof pass.

5. Jest suite has unrelated failures that predate this fix.
   - `test/rsi-deterministic.test.js`: `IndicatorEngine` now requires explicit
     symbol, tests instantiate without symbol.
   - `test/opening-range-breakout.test.js`: ORB expected state transitions do
     not match current module behavior.
   - `test/pattern-memory-flood.test.js`: `UnifiedPatternMemory` requires
     `ASSET_CLASS` or `BROKER` in test env.

6. `npm run test:smoke` passes but reports an existing Bombardier warning:
   `bombardier._loadCache is not a function`.

## Trade The Pool Rules To Account For Later

7. Opening/add trades must not exceed 5% of the prior one-minute candle volume
   for that instrument. If the prior minute has no trades, use the most recent
   one-minute candle with volume. Multiple smaller orders count together.

8. Day-trading accounts auto-liquidate active and pending orders at 15:50 ET.
   Earnings-night liquidation at 15:50 ET also applies when scheduled earnings
   are that night.

9. Daily Loss Pause is fixed from start-of-day balance and does not recalculate
   intraday even if Max Loss changes.

10. Scaling rules: day trading eval scales at 6% validated profit; funded scales
    at 10% validated profit; funded FLEX also requires at least three profitable
    days of 0.5% or more.

11. Copy trading is limited to two accounts, must be directly executed by the
    trader, and third-party automated copy tools are not allowed.
