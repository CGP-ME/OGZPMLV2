# Astra historical replay adjudication

Date: 2026-10-13
Candidate: `37053c0e2143ac00be01a5c18956d721e6590207`
Base: `23b199486aa7d5a77da3ddc340417a0bad4f9696`
Scope: `core/CandleStore.js` and `core/indicators/IndicatorEngine.js` only.

Verdict: no reachable introduced break found in the bounded retained-history review and isolated behavior checks.

Mercury's predecessor answer explicitly says `found_break`; a ledger `no_claim` label must not replace that answer. Its two allegations do not establish a regression in this change:

- `CandleStore.saveToDisk` retains the previous persisted slot when the in-memory slot is empty (`core/CandleStore.js:323-359`). This method is unchanged against the base, so that allegation is inherited and not evidence against the chronology diff. Disk persistence was not exercised here.
- `_blankState` constructs the public state object; it is not the complete reset producer (`core/indicators/IndicatorEngine.js:149-177`). `computeBatch` calls `_resetAll` at `341-344`; `_resetAll` explicitly clears the latest checkpoint and both retained chunks/checkpoints at `1525-1529`. The claimed stale checkpoint after reset is contradicted by the actual producer and by the reset behavior check below.

The final candidate differs from predecessor `ebba782` only by removing the silent `if (!checkpoint) return` in retained replay. Forward append initializes the current prefix checkpoint before retaining its first candle; rotation transfers it to the previous chunk; replay rebuilds both prefixes. The retained-match and missing-retained-candle branches therefore have an owned checkpoint (`IndicatorEngine.js:192-285`). No new throw or fallback was introduced.

Actual verification: loaded the candidate's immutable source through the existing `fixtures/candidate-proof.cjs` loader and ran its assertions. PASS: retained historical replacement, missing insertion, store/engine chronological agreement, bounded 32-candle windows, and canonical 2000-candle retention with a 301-candle correction. Also executed one bounded in-memory extension at sequence lengths 63, 64, 65, 95, 96, and 97: two missing insertions, latest and historical corrections, then `computeBatch` reset and another correction. Every state, indicator, and render comparison matched a fresh chronological computation. No test source or production source was edited.

Limits: fixture candles and isolated modules only; no broker calls, persistent-state writes, service execution, or runtime activation. No disk-save integration or complete trading/backtest run. Older-than-checkpoint timestamps remain outside the repaired retention boundary and retain the original append behavior; this is not a claim of arbitrary-history repair. This adjudication records the Mercury disagreement rather than relabeling its answer or repairing the review harness.
