I have now read the complete gap-recovery path and its context. Let me compile my findings.

## Investigation Summary

The question asks how a candle-gap recovery job can fail to complete its **originally requested interval** after a **delayed or partial** provider response, and how that costs money in production. I traced the full producer→request→replay path in `core/CandleProcessor.js`.

### Candidate inventory

**Candidate A — Partial provider response accepted as full completion (no coverage verification).**
- The completion gate is purely `if (candles.length > 0)` — `core/CandleProcessor.js:817-822`. Any non-empty backfill result is treated as success, then `_finishBackfill(job, 'completed')` deletes the job (`:838`).
- `attemptBackfill` computes `missingCount = Math.ceil((gapEnd - gapStart) / timeframeToMs(timeframe))` (`:738`) but only uses it to derive `fetchCount` (`:739`) and a log line (`:741`). It is **never** compared against the number of candles actually recovered. The filter (`:765-768`) and sort (`:772`) return whatever falls inside the gap bounds, with no completeness assertion.
- Therefore, if the provider returns fewer candles than `missingCount` (rate-limit truncation, a partial page, or candles dropped by `normalizeOhlc` at `:753-755`), the job still completes and the remaining gap is never retried.
- The unfilled portion is never re-detected: gap detection only runs inside `handleMarketData` on a *new* candle (`:1046`), and the inserted backfill candles become the new tail of `priceHistory`, so the next live candle's gap is a single interval. The old historical hole is permanently silent.
- The CHANGELOG for this exact repair explicitly confirms this is an open, unverified area: "Native backfill coverage/completeness and Alpaca end-time handling remain explicit separate checks." (`CHANGELOG.md:49`).
- **Supported break.** Cost: permanently incomplete historical price series → indicators (SMA/EMA/ATR/Bollinger) computed over a gapped series → potentially wrong signals, missed entries/exits, or a strategy acting on fabricated continuity. This is the direct answer to the question.

**Candidate B — Delayed response after cleanup/replay.**
- Guarded. `_runBackfill` re-checks job identity after `await attemptBackfill` (`:813`, `:816`), and `_finishBackfill` clears the retry timer (`:837`). A retired job cannot publish its late response. The CHANGELOG confirms this was the intended fix and is present (`CHANGELOG.md:43,45`). Not a break.

**Candidate C — `handleBackfillSuccess` throwing on incomplete scope leaves a stuck job.**
- `handleBackfillSuccess` throws if any of symbol/brokerId/accountId/assetClass/executionMode/timeframe is absent from the replay scope (`:872-878`). That throw propagates out of `_runBackfill` before both the success path and the retry scheduling, so the job is neither completed nor retried — it remains in `backfillJobs` forever, and `job.pending` rejects unhandled. Reachability depends on whether scope fields are guaranteed present in live feeds; gap detection runs *before* `processNewCandle`'s scope validation (`:1079` vs `:1085`), so a missing field would not be caught before job creation. This is a secondary risk, not the focus of the question, and I could not fully trace broker adapter guarantees to confirm reachability. **Unresolved.**

### Verdict

The central, directly-responsive finding is Candidate A: a partial provider response completes the job for its originally requested interval without verifying coverage, permanently leaving the gap unfilled. This is a source-derived scenario — I have no host-attested receipt of an actual partial response being mishandled, and the triggering external condition (provider returning partial data) is unverified in this environment. The code defect (no completeness gate) is nonetheless fully supported by the current source and by the CHANGELOG's own acknowledgment that coverage/completeness remains an unverified separate check.

---

CANDIDATE SET: examined 3 of 3 candidates (partial-response completion; delayed-response-after-cleanup; missing-scope throw). All changed-path logic in `core/CandleProcessor.js` gap-recovery region read (lines 600-845, 857-918, 1040-1082, 1234-1239) plus `_resolveTraceContext`/`_resolveCandleScopeContext`/`_stampRuntimeScopeFields` (331-343, 407-424) and supporting CHANGELOG/callgraph context.

AST EVIDENCE: I used grep for structure/caller tracing (`startBackfill` → single caller at `:1079`; `handleBackfillSuccess` → single caller at `:818`). No AST-only claims made.

INHERITED: The repair captures the broker once per job (`:805`), keys jobs by broker/account/assetClass/mode/symbol/frame/epoch/gap-bounds (`:796-800`), and guards late replay (`:813,816`). The unverified inherited area is backfill coverage/completeness, which the CHANGELOG explicitly defers.

FOURTH SHAPE CLASSIFIER: classified 0 of 0 added throw/guard/gate/fallback (diff is empty at this ref; no additions under review).

ALLEGATIONS: Partial-response-as-success is supported by source logic (`:817-822` gate, `:738-741` missingCount unused for verification) and CHANGELOG `:49`. Delayed-response replay is refuted by identity guards `:813,816` and `clearTimeout` `:837`. Missing-scope throw is source-supported (`:872-878`) but reachability unresolved.

SUBSTANTIVE RESOLUTION: convergence (Candidate A supported; Candidate B refuted; Candidate C unresolved and named).

VERDICT: found_break

ADVERSARIAL_REVIEW_BLOCKING: yes

WHY THIS VERDICT: A partial provider response completes the gap-recovery job because `_runBackfill` treats any non-empty result as success (`core/CandleProcessor.js:817-822`), deletes the job (`:838`), and never verifies that the recovered candles cover the full originally requested interval — `missingCount` (`:738`) is never compared to recovered count. The unfilled portion is not re-detected because gap detection only fires on new candles (`:1046`). This leaves permanently incomplete history that feeds indicators and strategy signals, a direct production money cost. CHANGELOG.md:49 confirms coverage/completeness is an unverified separate check.

MISSING EVIDENCE: No host-attested receipt showing an actual partial provider response being mishandled in this environment; the external trigger (provider returning fewer candles than requested) is unverified. Reachability of the missing-scope throw path (Candidate C) is untraced to broker adapter guarantees.

WHAT I DID: Read gap-recovery producer/consumer code in `core/CandleProcessor.js` (600-845, 857-918, 1040-1082, 1234-1239), scope/trace resolution (331-343, 407-424), grep-traced callers of `startBackfill`/`handleBackfillSuccess`, and read CHANGELOG.md:40-68 + callgraph context.

WHAT I DID NOT DO: Did not trace broker adapter `getCandles` implementations to confirm whether partial responses can occur, and did not verify scope-field guarantees from the session router/broker adapters (Candidate C reachability).

WHAT I ASSUMED: That a provider can return fewer candles than `missingCount` (partial response) — this is the unverified external condition; the code's lack of defense against it is what is established.

IF INCOMPLETE, WHY: Not incomplete for the central question; Candidate C reachability is the only named open sub-path.
