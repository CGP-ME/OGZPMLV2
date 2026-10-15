# Pattern-fixture isolation review

Date: 2026-10-15 UTC. Independent, read-only review of the current working-tree diff in `ogz-meta/gates/multi-runtime-gate-runner.js`.

The pattern-memory scope fixture no longer mutates `BACKTEST_MODE`, `CANDLE_DATA_FILE`, `BACKTEST_NO_PATTERN_SAVE`, or `DATA_DIR`. It creates one unique directory with `fs.mkdtempSync` at `multi-runtime-gate-runner.js:652`, passes that directory to both the scoped `UnifiedPatternMemory` construction and each applicable `PatternMemoryBank` instance, and removes exactly that directory in the surrounding `finally` at lines 932-934. The cleanup covers assertion and constructor failures after the directory is created.

The `UnifiedPatternMemory` constructor remains real production source, evaluated with only its `../foundation/ConfigLoader` dependency replaced by a local facade. That facade supplies an isolated backtest scope, a temporary data directory, and canonical `patternMemory` settings with persistence disabled (`multi-runtime-gate-runner.js:285-323`). This avoids shared ConfigLoader cache and process-environment setup while retaining the constructor and public API assertions. The fixture also proves that mutating the returned `memory.patterns` snapshot cannot inject an unscoped row (lines 687-709).

`ogz-meta/gates/runs/multi-runtime-latest.json` records `scope.pattern_memory.scope_isolation` as `PASS`, generated 2026-10-15T05:18:46.451Z, with the expected scoped key and distinct cross-scope pattern-bank hashes. `git diff --check` was clean during this review.

Limit: this is a focused fixture review. The saved run receipt records a dirty working tree rather than a source hash for this exact uncommitted diff, so it is evidence of the focused gate result, not an independently reproducible source-identity attestation. No services, backtests, or broader gate suite were run by this reviewer.

Root captured final source hashes in focused-result.json after the passing run. The independently reviewed change includes the temporary-directory cleanup. Mercury's earlier candidate selection reported no changed executable files and returned cannot_verify; no clean Mercury result or production pattern-memory clearance is claimed.
