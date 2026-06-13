# NoWick Scoped State Mercury Adjudication - 2026-06-13

## Response 1

Mercury found two real issues:

- `NoWickImbalance` scope failures were swallowed by the NoWick wrapper in `StrategyOrchestrator`.
- `NoWickImbalance.reset()` had no runtime owner.

Resolution:

- `NoWickImbalance` now emits `[STRATEGY-SCOPE]` for missing symbol/timeframe.
- The NoWick wrapper and main orchestrator catch both rethrow `[STRATEGY-SCOPE]`.
- `StrategyOrchestrator.resetNoWickState()` owns the NoWick reset hook.
- `run-empire-v2.js` clears NoWick state on SessionRouter transition.

## Response 2

Mercury did not find a current-code break after the rethrow/reset owner patch. The response was verified against:

- `core/SessionRouter.js:975`
- `core/SessionRouter.js:1140`
- `run-empire-v2.js:945-947`
- `core/StrategyOrchestrator.js:813-819`
- `core/StrategyOrchestrator.js:946-950`
- `core/StrategyOrchestrator.js:1365-1370`

## Response 3

Mercury raised four remaining concerns.

1. Symbol/timeframe changes without session transition leave old `scopedState` entries alive.
   - Adjudication: not a cross-symbol/timeframe leak. State lookup and reset use the same normalized `${symbol}:${timeframe}` key. Old entries cannot fire for a different symbol/timeframe because evaluation calls `_getScopeState(scopeKey)` for the current key only. Added tests for cross-symbol and same-symbol/cross-timeframe isolation.

2. External callers could catch `[STRATEGY-SCOPE]` and convert it to HOLD.
   - Adjudication: not a current production route. The current production caller is `StrategyOrchestrator`, and both the NoWick wrapper and main strategy loop rethrow `[STRATEGY-SCOPE]`.

3. A harness that omits timeframe now crashes.
   - Adjudication: intended fail-loud behavior. Current runtime TradingLoop passes `timeframe`; direct harnesses must supply the strategy scope contract. Missing scope was the original bug class.

4. Other hypothetical stateful strategies may need generic scoped reset.
   - Adjudication: no same-class sibling found in current code. Sibling scan for `scopedState`, `pendingLevels`, NoWick reset, and strategy-local pending state found only `modules/NoWickImbalance.js` for this bug class.

## Local Proof

- `npm test -- --runInBand test/nowick-imbalance-scope.test.js test/strategy-orchestrator-contract-confidence.test.js test/parallel-backtest-solo-env.test.js test/matrix-sweep-surface.test.js`
- Pending final P0 gate before commit.
