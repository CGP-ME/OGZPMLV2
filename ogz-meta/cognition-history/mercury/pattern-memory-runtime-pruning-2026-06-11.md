Mercury, break my fix.

Task: attack the pattern-memory runtime pruning fix. Find a concrete state where pattern memory still grows unbounded, persists over the configured cap, corrupts/loses valid learned state, or falsely reports success after failed pruning.

Changed code under review:
- core/PatternMemoryBank.js:583-600 wires recordTradeOutcome() to call needsPrune() and pruneOldPatterns() before saveMemory().
- core/PatternMemoryBank.js:903-969 contains pruneOldPatterns() and needsPrune().
- core/UnifiedPatternMemory.js:261-265 changes the periodic timer from save-only to pruneAndSave().
- core/UnifiedPatternMemory.js:291-382 enforces the cap after new recordObservation()/recordOutcome() patterns.
- core/UnifiedPatternMemory.js:585-645 contains prune(), _enforcePatternCapAfterMutation(), and pruneAndSave().
- core/UnifiedPatternMemory.js:1171-1177 routes cleanup through pruneAndSave().
- test/pattern-memory-eviction-boundary.test.js:287-406 is the focused regression proof.

Attack requirements:
- Do not confirm the patch. Break it.
- Look for runtime paths not covered by the tests, including persistence-enabled PatternMemoryBank, BACKTEST_NO_PATTERN_SAVE, repeated observation-only growth, save failures, pruning rollback, dead/old records, existing over-cap banks loaded from disk, and config override edge cases.
- If a finding is real, cite exact file:line and the sequence that triggers it.
- If no concrete break is found, state the strongest remaining risk and why it is not a current code failure.
