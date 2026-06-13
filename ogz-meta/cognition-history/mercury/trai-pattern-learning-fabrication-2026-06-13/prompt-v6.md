Mercury, break my fix.

Scope: one concrete bug class only. This is the tightened version after your v5 finding.

Relevant code:
- `core/OrderExecutor.js:480-532`
  - `_recordClosedTradePatternOutcome()` now prevalidates finite pnl, positive finite holdTimeMs, non-empty exitReason, and non-empty strategy before calling `recordPatternResult()`.
  - It passes canonical `holdTimeMs`, not `holdDurationMs`.
  - It only logs `Pattern learning:` after `recordPatternResult()` returns truthy; rejected or missing metadata paths return false with warning/error only.
- `core/OrderExecutor.js:535-568`
  - `_checkPatternOutcomeHealth()` now combines memory health with `patternOutcomeRejectedSinceHealth`; any rejection since the last health check makes the health result false and logs the rejection count.
- `core/UnifiedPatternMemory.js:1033-1060`
  - compatibility `recordPattern(features, result)` now requires canonical `holdTimeMs`, positive finite hold time, canonical `exitReason`, non-empty strategy, and immutable scope through `recordOutcome()`.
  - It no longer accepts `holdDurationMs` or `reason` aliases.
- `test/pattern-memory-scope.test.js:123-166`
  - regression proves canonical fields record an outcome and legacy duration alias is rejected before mutation.

Attack requirements:
1. Find a concrete close path where a rejected pattern outcome still logs success, passes health, or mutates pattern memory with missing/fabricated metadata.
2. Find a concrete state where positive `holdTimeMs`, exitReason, or strategy are still fabricated by this fix rather than carried from the real trade close.
3. Find any sibling production call site to `recordPatternResult()` / `recordPattern()` that still sends incompatible fields and is not covered by the rejection accounting.
4. Find a concrete state where `patternOutcomeRejectedSinceHealth` can be reset or bypassed before health reports the rejection.
5. Decide whether this closes the underlying mechanism or only hides the symptom, and list any new failure mode introduced.

Use exact file:line evidence. Do not verify softly. Break the fix.
