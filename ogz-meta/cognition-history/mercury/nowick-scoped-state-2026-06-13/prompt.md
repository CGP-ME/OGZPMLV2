Mercury, break my fix.

Scope: NoWickImbalance pending-level state isolation by symbol and timeframe.

Current modified files and areas:
- modules/NoWickImbalance.js:27-40 constructor now owns scopedState Map instead of module-global pendingLevels/candleCount.
- modules/NoWickImbalance.js:194-205 evaluate resolves scopeKey before state mutation.
- modules/NoWickImbalance.js:219-240 formation storage and age-out now use state.pendingLevels and state.candleCount.
- modules/NoWickImbalance.js:249-310 tap/invalidate/remove now use the scoped pendingLevels array.
- modules/NoWickImbalance.js:343-376 reset(scope), _getScopeState, _resolveScopeKey, _normalizeScopePart.
- core/TradingLoop.js:651-670 now passes symbol plus timeframe into StrategyOrchestrator extras.
- test/nowick-imbalance-scope.test.js proves symbol/timeframe isolation, fail-loud missing scope, and scoped reset.

Attack target:
Find a concrete current-code path where this fix still allows NoWick pending imbalance levels, candle age, or reset behavior to leak across symbols, timeframes, sessions, or runtime modes. Also look for a path where missing symbol/timeframe is swallowed as a harmless HOLD in a way that hides a broken runtime scope.

Required checks:
1. Trace the real StrategyOrchestrator -> NoWickImbalance call shape and identify whether extras.symbol/timeframe always reach the module in live, paper, and backtest paths.
2. Try to construct a current backtest or live path where candles lack symbol/timeframe and extras are absent, causing the new fail-loud behavior to break a valid path instead of catching a bug.
3. Try to construct a current multi-symbol or future SessionRouter path where reset(scope) is never called and scopedState still accumulates stale scopes or stale pending levels that can later fire incorrectly.
4. Check whether uppercasing both symbol and timeframe creates a collision or mismatch with existing scope keys, config values, or tests.
5. Check whether StrategyOrchestrator catches the NoWick error and returns HOLD, silently hiding scope failure from P0/live captures.
6. Check for sibling same-class state in other strategies that this slice should have addressed under the sibling rule.

Do not confirm the patch. Break it with file:line evidence. If you cannot break it, state the assumptions you tried to falsify and the exact code paths that prevented failure.
