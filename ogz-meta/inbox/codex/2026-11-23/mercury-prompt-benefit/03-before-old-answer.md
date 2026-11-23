I have now exhaustively traced the candle-gap recovery path in `core/CandleProcessor.js`. Let me write up the findings.

## VERDICT: found_break

A candle-gap recovery job decides its originally requested interval is complete using **only one piece of evidence: that the provider returned at least one candle inside the gap bounds** (`candles.length > 0`). It never verifies that the returned candles actually cover the full `[gapStart, gapEnd]` interval. A partial provider response therefore causes the job to declare the interval complete while unfilled portions remain.

---

### The complete control flow (evidence path)

**1. Gap detection** — `handleMarketData` detects a gap on a new candle when `gapMs > gapThreshold` and calls `startBackfill(lastCandle.etime, candle.etime, gapTraceContext)` (`core/CandleProcessor.js:1046-1082`, call at `:1079`).

**2. Job creation** — `startBackfill` builds a job keyed by the scoped interval and launches `_runBackfill` (`:787-810`). `find_references` confirms `startBackfill` has no callers outside this file (only `:787` definition and `:1079` call site).

**3. Provider request** — `_runBackfill` calls `attemptBackfill(job)` (`:814`). `attemptBackfill` computes `missingCount = Math.ceil((gapEnd - gapStart) / timeframeToMs(timeframe))` (`:738`), requests `fetchCount = missingCount + gapBackfillBufferCandles` (`:739`), normalizes the response, and **filters to only the in-gap candles**: `et > gapStart && et <= gapEnd` (`:765-768`). It returns the sorted `gapCandles` (`:772-774`).

**4. Completion decision** — back in `_runBackfill`:

```
if (candles.length > 0) {
  this.handleBackfillSuccess(candles, {...});
  this._finishBackfill(job, 'completed');
  return;
}
console.error(`[GAP-RECOVERY] Backfill unavailable ... retry`);
```
(`:817-824`)

This is the **sole** gate. `handleBackfillSuccess` (`:857-918`) merely replays each returned candle through `processNewCandle`; it performs no completeness reconciliation. `_finishBackfill` deletes the job from `backfillJobs` and emits `GAP_BACKFILL_COMPLETED` (`:836-842`).

---

### Candidate inventory for "what evidence decides completeness"

| Candidate | Evidence | Verdict |
|---|---|---|
| **`candles.length > 0`** (returned ≥1 in-gap candle) | `:817` — the only gate before `'completed'` | **SELECTED** — this is the deciding evidence |
| `missingCount` comparison | Computed at `:738`, used only for `fetchCount` (`:739`) and logging (`:741`); grep shows only these 3 occurrences, never compared against returned count | REJECTED as a completeness check |
| Contiguity/coverage check across `[gapStart, gapEnd]` | `attemptBackfill` filters to in-gap candles (`:765-768`) but never verifies the candles tile the full interval | REJECTED — no such check exists |
| Retry path | `:824-833` — fires **only** when `candles.length === 0` (empty response); a partial non-empty response never retries | REJECTED as a safety net for partial responses |
| Re-detection via future gap detection | After splice, the triggering candle remains last in `priceHistory` (`:518-527`); gap detection compares only the newest boundary (`:1046-1082`), so residual mid-history sub-gaps are not re-examined | REJECTED as guaranteed recovery — depends on future new candles and does not repair the already-"completed" interval |

---

### Why a partial response is treated as complete

The gap detection at `:1079` fires *before* the triggering candle is inserted. When the backfill later completes, `processNewCandle` splices the returned candles in timestamp order *before* the triggering candle (`:518-527`), so the triggering candle remains last. A partial response (e.g., filling 1 of 3 missing candles) still yields `candles.length > 0` (`:817`), so the job emits `GAP_BACKFILL_COMPLETED` and is removed from `backfillJobs` (`:838`). The unfilled candles sit in the middle of history, and future gap detection only inspects the newest boundary (`:1046-1082`), so they are not re-requested by this mechanism.

---

### Unverified assumptions

- I did **not** execute the code or run tests; this is a source-derived control-flow analysis, not an observed runtime failure. No execution receipt was supplied.
- The claim that the triggering candle remains last depends on `processNewCandle`'s splice ordering (`:518-527`) and on the backfill completing asynchronously after the triggering candle's insertion (`:1079` → `:1085`); this ordering is consistent with the source but was not observed at runtime.
- I did not inspect `dataFeedConfig` defaults (e.g., `gapBackfillBufferCandles`, `gapThresholdMultiplier`, `gapBackfillRetryDelayMs`) in config files; those values affect *when* gaps are detected and *how many* candles are requested, not the completeness decision itself.

---

### Required fields

**CANDIDATE SET:** examined 5 of 5 (listed above); the full `core/CandleProcessor.js` (1243 lines) was read across the delivered windows (1-100, 100-330, 330-558, 558-680, 680-910, 910-1110, 1110-1243). Diff artifact is empty (baseline == review tree).

**AST EVIDENCE:** I used `find_references` (startBackfill, _runBackfill, handleBackfillSuccess), `find_definition` (processNewCandle → `:435`), and `grep` (gap, replay, missingCount) in this run. No host-provided AST scan receipts were used.

**INHERITED:** No changed paths; review tree equals baseline (`414528f`). The gap-recovery behavior described is inherited current-source behavior, not a new change. No swallowed errors or silent defaults were introduced by a diff (diff is empty).

**FOURTH SHAPE CLASSIFIER:** classified 0 of 0 added throw/guard/gate/fallback (no diff). The `candles.length > 0` gate at `:817` and the retry `setTimeout` at `:830-833` are pre-existing source, not additions.

**ALLEGATIONS:** The finding is that the completeness decision at `:817` does not verify interval coverage; a partial provider response is treated as complete. This is observed directly in current source (lines cited above), not testimony.

**SUBSTANTIVE RESOLUTION:** none (no prior reviewer testimony exists; receipt has 0 entries).

**ADVERSARIAL_REVIEW_BLOCKING:** yes — the supported defect is that a partial provider response causes the job to declare the originally requested interval complete without verifying coverage, leaving unfilled candles unrecovered.

**WHAT I DID:** Read all 1243 lines of `core/CandleProcessor.js`; traced gap detection (`:1046-1082`) → `startBackfill` (`:787-810`) → `_runBackfill` (`:812-834`) → `attemptBackfill` (`:695-780`) → `handleBackfillSuccess` (`:857-918`) → `processNewCandle` (`:435-613`); confirmed `missingCount` usage is logging/fetchCount-only via grep; confirmed no external callers via `find_references`.

**WHAT I DID NOT DO:** Did not execute the code, run tests, or inspect config defaults (`dataFeedConfig` values). No execution receipt was available.

**WHAT I ASSUMED:** That the backfill completes asynchronously after the triggering candle is inserted, so the triggering candle remains last in `priceHistory` (consistent with `:1079` → `:1085` and splice at `:518-527`).

**WHY THIS VERDICT:** The completion gate at `:817` (`candles.length > 0`) is the only evidence the job consults; `missingCount` is never compared against the returned count, and no contiguity/coverage check exists. Therefore a delayed or partial provider response that returns ≥1 in-gap candle is declared complete regardless of whether the full interval was filled.

**IF INCOMPLETE, WHY:** Not incomplete for the stated question; the full control flow was traced from current source. Runtime behavior was not executed, so the defect is source-established, not observed.
