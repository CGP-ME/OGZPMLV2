Mercury, break my fix.

Final diff attack for NoWick scoped pending-level state. This pass is after the follow-up fix and after the production log cleanup in StrategyOrchestrator.

Final relevant code:
- core/TradingLoop.js passes `symbol` and `timeframe` into StrategyOrchestrator extras.
- modules/NoWickImbalance.js stores pending levels and candle count in a scoped Map keyed by normalized symbol/timeframe.
- modules/NoWickImbalance.js throws `[STRATEGY-SCOPE]` when symbol or timeframe is missing.
- core/StrategyOrchestrator.js NoWick wrapper rethrows `[STRATEGY-SCOPE]`.
- core/StrategyOrchestrator.js main strategy loop rethrows `[STRATEGY-SCOPE]`.
- core/StrategyOrchestrator.js exposes resetNoWickState().
- run-empire-v2.js calls resetNoWickState() on SessionRouter transition.
- test/nowick-imbalance-scope.test.js covers isolation, fail-loud scope, scoped reset, orchestrator rethrow, and orchestrator reset.

Attack:
Find any current-code route where this final diff still:
1. Lets NoWick pending levels or candle age leak across symbol/timeframe/session/runtime mode.
2. Converts missing symbol/timeframe into HOLD instead of a loud failure.
3. Breaks a valid single-symbol TSLA backtest/live path by requiring scope that is not actually supplied.
4. Leaves an equivalent same-class mutable strategy-state leak that belongs to this same slice.

Use file:line evidence. Do not verify or approve the patch; break it.
