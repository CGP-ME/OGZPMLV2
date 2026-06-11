Mercury, break my fix.

Recheck target: the first attack found that PatternMemoryBank could be over cap, require pruning, fail saveMemory(), roll back to the over-cap memory, return false, and then continue accepting later trade outcomes if callers ignored the false return.

New code under review:
- core/PatternMemoryBank.js:213 initializes pruneFailureReason.
- core/PatternMemoryBank.js:443-604 now refuses recordTradeOutcome() while pruneFailureReason is set, sets pruneFailureReason when required pruning does not complete, and clears it only after successful save.
- core/PatternMemoryBank.js:903-972 still contains pruneOldPatterns() and needsPrune().
- test/pattern-memory-eviction-boundary.test.js:271-306 covers the failed-prune latch.

Attack requirements:
- Break the latch. Find a concrete path where PatternMemoryBank still keeps accepting new records after a required prune fails, or where a recoverable successful prune/save cannot clear the failure state.
- Also check whether UnifiedPatternMemory still has a comparable failure path for over-cap runtime growth.
- Cite exact file:line evidence and the triggering sequence.
- If no concrete break remains, state the strongest residual risk and why it is not a current code failure.
