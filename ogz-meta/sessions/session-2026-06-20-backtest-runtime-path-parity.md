# Session 2026-06-20 - Backtest Runtime Path Parity

## Scope

Reconciled direct file backtests with the production runtime candle path. The invariant is: production and backtest share the same runtime code path; explicit execution mode/source flags only select the candle source, broker side-effect boundary, persistence, and reporting behavior.

The issue was that `BacktestRunner` used a backtest-only candle array, synthesized `etime` as one minute after `t`, and called `analyzeAndTrade()` after a local warmup gate instead of using the runtime candle boundary and trading-cycle trigger.

## Changes

- `core/BacktestRunner.js` now requires `ctx.symbol`, `ctx.timeframe`, `ctx.storeTimeframeCandle`, `ctx.handleMarketData`, and `ctx.runTradingCycle` before processing candles.
- File candles are normalized to runtime OHLC seconds shape, then routed through `storeTimeframeCandle(timeframe, data, symbol)` and `handleMarketData({ data, symbol, timeframe, traceId })`.
- Trading analysis is triggered only when the runtime boundary store returns `isNewCandle` and `handleMarketData()` reports `acceptedAsNew`.
- `core/CandleProcessor.js` returns `{ acceptedAsNew, candle, marketData }` from `handleMarketData()` so the backtest runner can use the same acceptance signal.
- `run-empire-v2.js` binds `storeTimeframeCandle`, `handleMarketData`, and `run15mTradingCycle` into the backtest runner context.
- `BacktestRunner` now validates `CANDLE_DATA_FILE` identity against runtime symbol/timeframe using `DataFileInstrument`, preventing direct runs from silently testing a mismatched dataset.

## Proof

- `INITIAL_BALANCE=10000 npx jest test/backtest-runner-runtime-path.test.js test/single-broker-subscription-symbols.test.js test/symbol-routing.test.js --runInBand` passed: 39/39.
- `EXECUTION_MODE=backtest CANDLE_SOURCE=file BACKTEST_MODE=true INITIAL_BALANCE=10000 npx jest test/backtest-recorder-scope.test.js test/backtest-report-asset-slug.test.js test/rest-recovery-trace-contract.test.js test/order-executor-pause-gate.test.js --runInBand` passed: 62/62.
- Mercury adversarial pass used the current repo state and uncommitted diff. It did not find a remaining file-backtest/runtime-path invariant break.
- `node ogz-meta/gates/multi-runtime-gate-runner.js --p0` passed with canonical anchor: final balance `10710.667785934895`, `1692` trades, `62.8%` win rate, PF `1.15`.

## Open Notes

- This slice intentionally did not clean unrelated untracked ledger/runtime artifacts.
- Existing emoji-bearing log strings in old backtest code were not swept because that would be unrelated cosmetic churn in a trade-path parity fix.
