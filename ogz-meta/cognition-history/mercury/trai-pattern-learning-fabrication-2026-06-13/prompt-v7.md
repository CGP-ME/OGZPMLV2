Mercury, break my fix.

Scope: one concrete bug class only. This is the immediate-health version after v6.

Relevant code:
- `core/OrderExecutor.js:480-532`
  - `_recordClosedTradePatternOutcome()` prevalidates finite pnl, positive finite holdTimeMs, non-empty exitReason, and non-empty strategy before calling `recordPatternResult()`.
  - It passes canonical `holdTimeMs`.
  - It only logs `Pattern learning:` after `recordPatternResult()` returns truthy.
- `core/OrderExecutor.js:535-568`
  - `_checkPatternOutcomeHealth()` now bypasses the every-10-exit throttle whenever `patternOutcomeRejectedSinceHealth > 0`, reports rejection count, then resets the counter only after the report is built.
- `core/UnifiedPatternMemory.js:1033-1060`
  - compatibility `recordPattern(features, result)` rejects non-canonical `holdDurationMs`, missing/zero/non-finite `holdTimeMs`, missing/blank exitReason, and missing/blank strategy before mutation.
- `test/order-executor-trai-learning-payload.test.js:166-212`
  - regression proves a rejected outcome makes the next health check unhealthy immediately.
- `test/pattern-memory-scope.test.js:123-166`
  - regression proves canonical fields record and legacy duration alias rejects before mutation.

Attack requirements:
1. Find a concrete close path where a rejected pattern outcome still logs success, passes immediate health, or mutates pattern memory with missing/fabricated metadata.
2. Find a concrete state where `patternOutcomeRejectedSinceHealth` is reset or bypassed before the rejection is reported.
3. Find a sibling production call site to `recordPatternResult()` / `recordPattern()` still using incompatible fields.
4. Find a concrete state where this hides the P0 `PATTERN SYSTEM UNHEALTHY` warning instead of restoring real in-memory outcomes.
5. Decide whether this closes the underlying mechanism or only the symptom, and list any new failure mode introduced.

Use exact file:line evidence. `_firstFiniteNumber()` uses `Number.isFinite()` and does not coerce strings. Do not claim string coercion unless you show a different code path. Break the fix.
