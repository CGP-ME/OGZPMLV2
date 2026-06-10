Mercury, break my fix.

Scope: pattern-memory config ownership only.

Attack the claim that pattern-memory runtime tunables are now owned by TradingConfig and cannot be silently mutated by PATTERN_* env vars, local default chains, stale hardcoded constants, or invalid override values.

Read these exact ranges:
- core/UnifiedPatternMemory.js:120-178
- core/UnifiedPatternMemory.js:222-227
- core/PatternMemoryBank.js:90-157
- core/PatternMemoryBank.js:217-222
- core/PatternMemoryBank.js:586-610
- core/PatternMemoryBank.js:848-879
- core/TradingConfig.js:203-235
- config/trading.config.schema.json:81-143
- test/pattern-memory-scope.test.js:133-169
- test/pattern-memory-scope.test.js:352-377

Find a concrete state, constructor path, config shape, env shape, or sibling code path where:
- UnifiedPatternMemory still accepts a PATTERN_* env var as a runtime threshold.
- PatternMemoryBank still uses a stale local threshold or cap instead of TradingConfig.patternMemory.bank.
- Invalid local overrides fall through to a TradingConfig value instead of failing loud.
- A config/schema mismatch lets runtime read a field the JSON profile does not require, or requires a field runtime never reads.
- The tests can pass while one of those mutation paths remains open.

Report only file:line evidence and a runnable reproduction path if you find one. If the attack fails, say which searched paths failed and why.
