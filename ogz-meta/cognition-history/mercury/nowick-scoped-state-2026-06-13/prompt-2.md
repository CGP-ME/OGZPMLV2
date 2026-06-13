Mercury, break my fix.

This is the follow-up pass after your first response found that NoWick scope errors were swallowed by StrategyOrchestrator and that reset(scope) was dead.

Current corrected shape:
- modules/NoWickImbalance.js:194-205 resolves a scoped state key before mutating pending levels.
- modules/NoWickImbalance.js:343-376 provides reset(scope), _getScopeState, _resolveScopeKey, and _normalizeScopePart.
- modules/NoWickImbalance.js:372-375 now throws `[STRATEGY-SCOPE] NoWickImbalance ... is required for scoped pending levels`.
- core/StrategyOrchestrator.js:806-819 NoWick wrapper rethrows `[STRATEGY-SCOPE]` instead of converting it to null.
- core/StrategyOrchestrator.js:942-948 main strategy catch rethrows `[STRATEGY-SCOPE]` instead of converting it to a warning.
- core/StrategyOrchestrator.js now exposes resetNoWickState(scope = null), which calls the NoWick module reset hook.
- run-empire-v2.js:945-986 session transition listener calls this.strategyOrchestrator.resetNoWickState() before syncing the new dashboard/runtime scope.
- test/nowick-imbalance-scope.test.js covers symbol/timeframe isolation, missing-scope fail-loud, scoped reset, orchestrator rethrow, and orchestrator reset hook.

Attack target:
Find a concrete current-code path where NoWick pending levels can still leak across symbols, timeframes, sessions, or runtime modes, or where a missing symbol/timeframe still becomes a harmless HOLD instead of a loud failure.

Required attacks:
1. Trace the real NoWick call from TradingLoop through StrategyOrchestrator and show whether `[STRATEGY-SCOPE]` can still be caught and swallowed.
2. Check whether run-empire-v2.js session transition reset can fail or be bypassed in an enabled SessionRouter transition.
3. Check whether initial activation, single-broker mode, or backtest mode has a valid path where missing candle/extras scope now crashes incorrectly.
4. Check whether scoped reset uppercasing can miss an existing scope because runtime symbol/timeframe casing differs.
5. Check for same-class sibling stateful strategy leaks in this slice that are directly analogous and should be fixed before acceptance.

Do not confirm the patch. Break it with file:line evidence. If you cannot break it, state the assumptions you tried to falsify and the exact code paths that prevented failure.
