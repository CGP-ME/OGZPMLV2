Mercury, break my fix.

Scope: one concrete bug class only. I fixed the P0 pattern outcome rejection that returned after tightening TRAI/pattern learning validation.

Relevant code:
- `core/OrderExecutor.js:480-515`
  - `_recordClosedTradePatternOutcome()` now calls `this.ctx.patternChecker.recordPatternResult(pattern.features, { pnl, holdDurationMs, exitReason, strategy, timestamp, symbol, brokerId, accountId, accountIdSource, assetClass, executionMode, timeframe, scopeKey })`.
- `core/UnifiedPatternMemory.js:1033-1059`
  - compatibility `recordPattern(features, result)` now accepts `holdTimeMs ?? holdDurationMs` and `exitReason ?? reason`, requires finite pnl, finite hold time, exit reason, and strategy before mutating.
- `test/pattern-memory-scope.test.js:123-145`
  - regression proves the live-close field names record an outcome and preserve the scoped pattern.

What to attack:
1. Find a concrete live or backtest close path where `OrderExecutor` still calls `recordPatternResult()` without real strategy, exit reason, finite pnl, or finite hold time, and the caller falsely logs success or the health check passes while no outcome recorded.
2. Find a concrete state where accepting `holdDurationMs` or `exitReason` reintroduces fabricated defaults, records malformed metadata, or mutates a pattern with missing immutable scope.
3. Find a concrete state where this fix hides the P0 `PATTERN SYSTEM UNHEALTHY` warning instead of restoring real in-memory outcomes.
4. Find sibling call sites to `UnifiedPatternMemory.recordPattern()` or `EnhancedPatternRecognition.recordPatternResult()` that still use incompatible outcome field names and would fail after this validation.
5. Decide whether this closes the underlying mechanism or only the symptom, and list any new failure mode introduced.

Use exact file:line evidence. Do not verify softly. Break the fix.
