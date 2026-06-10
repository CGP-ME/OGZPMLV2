Mercury, break my fix.

Scope: pattern bank snapshot and rollback recheck after the missing-primary gap was patched.

Attack the claim that pattern-memory JSON corruption or deletion no longer silently wipes learned state.

Read these exact ranges:
- core/UnifiedPatternMemory.js:215-218
- core/UnifiedPatternMemory.js:647-745
- core/UnifiedPatternMemory.js:795-805
- core/PatternMemoryBank.js:246-297
- core/PatternMemoryBank.js:996-1034
- test/pattern-memory-scope.test.js:313-445
- test/pattern-memory-scope.test.js:520-602

Find a concrete state, write failure, load failure, missing-file path, corrupt-primary path, corrupt-backup path, corrupt-primary-before-save path, or session-switch sequence where:
- A corrupt primary pattern bank causes UnifiedPatternMemory or PatternMemoryBank to silently start with an empty learned-state bank.
- A missing primary with a valid backup fails to restore the primary file.
- A save overwrites a good backup with corrupt primary content before the new primary write lands.
- Both primary and backup are unusable but startup continues without a hard failure.
- The tests pass while one of those corruption, deletion, or rollback paths remains open.

Report only file:line evidence and a runnable reproduction path if you find one. If the attack fails, list the searched paths that block each state.
