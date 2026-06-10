Mercury, break my fix.

Scope: pattern bank snapshot and rollback only.

Attack the claim that pattern-memory JSON corruption no longer silently wipes learned state.

Read these exact ranges:
- core/UnifiedPatternMemory.js:215-218
- core/UnifiedPatternMemory.js:647-730
- core/UnifiedPatternMemory.js:793-805
- core/PatternMemoryBank.js:246-294
- core/PatternMemoryBank.js:993-1030
- test/pattern-memory-scope.test.js:313-410
- test/pattern-memory-scope.test.js:490-563

Find a concrete state, write failure, load failure, missing-file path, corrupt-primary path, corrupt-backup path, or session-switch sequence where:
- A corrupt primary pattern bank causes UnifiedPatternMemory or PatternMemoryBank to silently start with an empty learned-state bank.
- A save overwrites a good backup with corrupt primary content before the new primary write lands.
- Recovery from backup loads data but fails to restore the primary file, leaving the same corruption trap for the next process start.
- Both primary and backup are unusable but startup continues without a hard failure.
- The tests pass while one of those corruption or rollback paths remains open.

Report only file:line evidence and a runnable reproduction path if you find one. If the attack fails, list the searched paths that block each state.
