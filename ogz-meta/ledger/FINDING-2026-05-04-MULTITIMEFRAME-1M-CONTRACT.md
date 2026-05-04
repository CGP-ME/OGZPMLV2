# FINDING: MultiTimeframe Strategy Requires 1m Source Data — Cannot Fire on 15m-Only Backtests

**Date:** 2026-05-04
**Branch:** `rebuild/clean-from-baseline`
**Strategy:** MultiTimeframe (Wolf's strategy-resurrection spec, Fix 4)
**Verdict:** Strategy is wired correctly but architecturally incompatible with the current backtest data shape. Sweep produces 0 trades / 12 configs at $0.

---

## What Wolf's Spec Said

> "Fix 4: MultiTimeframe — fix etime in BacktestRunner.js:88 to 900s for 15m data."

The etime arithmetic at `core/BacktestRunner.js:86` is `(ohlcvCandle.t / 1000) + 60`, which adds 60 seconds. For 15m data that should be `+ 900`. Wolf flagged this as the cause of MultiTimeframe producing zero trades.

## What's Actually Wrong

The etime mismatch is real but it isn't the cause of the zero-trade behavior. The actual bug is in the adapter contract:

- `modules/MultiTimeframeAdapter.js:91-97`:
  ```js
  ingestCandle(candle) {
    if (!candle || c(candle) == null || t(candle) == null) return;
    this.stats.candlesProcessed++;
    // Store raw 1m
    this._addCandle('1m', candle);
    ...
  }
  ```
- The adapter unconditionally stores every input candle in the **1m** bucket, then aggregates UP from there. The integration docstring at line 19-21 confirms: *"In your 1m candle loop: mtf.ingestCandle(candle)."*
- The orchestrator at `core/StrategyOrchestrator.js:99-101` instantiates the adapter with `activeTimeframes: ['1m','5m','15m','1h','4h']`.
- The TSLA fixture (`tuning/tsla-15m-2y.json`) and parallel-backtest both feed **15-minute** candles to `ingestCandle`. The adapter labels each as 1m and aggregates "up" — every higher-timeframe bucket gets wrong-scale data (5m bucket = 5 × 15m = 75m of data labeled 5m, etc.).
- Confluence detection in `getConfluenceScore()` (line 310+) requires multiple timeframes to agree. Because every aggregation is wrong-scale, no confluence signal is ever produced. The strategy returns null on every tick.

The strategy is architecturally designed for 1m source data (Kraken WebSocket pattern from the live crypto bot). The Apex stocks pivot to 15m fixtures violates that contract.

## Sweep Result (2026-05-04)

```
MultiTimeframe | TSLA 15m 2-year stocks fees ($0)
12 configs tested → 0 trades, $0.00 P&L, all configs identical
JSON: backtest-results/matrix-tsla-2y-MultiTimeframe-conf-2026-05-04-1777884313318.json
```

## Architectural Fix Path

The minimum change to make MultiTimeframe work on 15m source data:

1. **Add `baseTimeframe` config option** to `MultiTimeframeAdapter` (default `'1m'` for backwards compat).
2. **`ingestCandle`** stores input in the configured base bucket, not unconditionally `'1m'`.
3. **Aggregation** only computes timeframes ≥ baseTimeframe. For 15m base, aggregate up to 1h and 4h only; skip 1m/5m.
4. **Orchestrator instantiation** at `core/StrategyOrchestrator.js:99-101` reads `baseTimeframe` from `TradingConfig.candle.interval` (or equivalent) and passes appropriate `activeTimeframes`.
5. **Confluence** at `getConfluenceScore()` should not gate on timeframes that were never ingested (`readyTimeframes` set).

Estimated scope: ~60 minutes of work touching `modules/MultiTimeframeAdapter.js` + `core/StrategyOrchestrator.js` constructor. Mercury attack required (hot-path module). Flood-style regression test for confluence on 15m base.

## Current State (as of commit `c9a6e51`)

- Strategy is registered: `core/StrategyOrchestrator.js:478-525` (closure correct, self-contained pattern matches LiquiditySweep).
- Strategy is enabled by default: `core/TradingConfig.js:805` (`enableMultiTimeframe: envBool('ENABLE_MTF', true)`).
- Strategy is in the matrix-sweep ALL_STRATEGIES list at `tools/matrix-sweep.js:140`.
- Strategy produces 0 trades on 15m TSLA fixture because the adapter contract assumes 1m source.

The wiring is intact. The strategy is unreachable for stocks/15m use cases until the adapter accepts a configurable base timeframe.

## Why This Was Caught

The pattern from Fixes 1-3 (treat Wolf's prescribed root cause with skepticism, investigate independently per **Prophylactic Bug-Class Grep** memory rule) caught it. Wolf's `etime + 60` → `+ 900` change would have been applied, sweep would still have produced zero trades, and we'd have rediscovered the adapter contract issue downstream. Investigating before implementing saved a wrong-fix loop.
