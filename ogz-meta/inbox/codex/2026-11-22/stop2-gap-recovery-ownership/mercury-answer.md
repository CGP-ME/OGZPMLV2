I now have a complete picture of the ownership mechanism. Let me compile the findings.

## Summary of the Mechanism

The question asks how broker and symbol/timeframe ownership of a pending candle-gap backfill is maintained from initial dispatch through retry and session retirement. The change in the reviewed tree replaces a single instance-wide retry interval with a per-job `Map` keyed by full scope, and captures the owning broker at dispatch rather than re-reading the "active" broker on each attempt.

### Initial dispatch (producer)
- Gap detection in `handleMarketData` builds `gapTraceContext` from the candle's own scope fields — `symbol`, `timeframe`, `brokerId`, `accountId`, `accountIdSource`, `assetClass`, `executionMode`, and `sessionRouterEpoch` from `wrappedInput` — then calls `startBackfill(lastCandle.etime, candle.etime, gapTraceContext)` (`core/CandleProcessor.js:1066-1079`).
- `startBackfill` (`core/CandleProcessor.js:787-810`):
  - Guards against `_shutdownRequested`, `router?.stopping`, and `router?.transitionInProgress`; if any is set, it emits `GAP_BACKFILL_CANCELLED` and returns without dispatching (lines 789-795).
  - Builds the dedup key as `JSON.stringify([brokerId, accountId, assetClass, executionMode, symbol, timeframe, sessionRouterEpoch, gapStart, gapEnd])` (lines 796-800).
  - If a job for that key exists, returns its `pending` promise (dedup, lines 801-802).
  - Otherwise creates a `job` whose `broker` is **captured once** as `router?.activeBroker` (line 805) and stores it in `backfillJobs`, then starts `_runBackfill(job)` (lines 803-809).

### Broker ownership across retries
- `attemptBackfill(job)` now reads the broker from the job: `const { gapStart, gapEnd, traceContext, broker } = job;` and uses `broker.getCandles(...)` with `broker.id` for identity (`core/CandleProcessor.js:695-696, 716, 743`). It never re-reads `sessionRouter.activeBroker`.
- Retries reuse the exact same `job` object (same captured `broker`, same trace scope). `_runBackfill` schedules a `setTimeout` only after the prior attempt settles (`core/CandleProcessor.js:812-834`), so a slow request cannot overlap its own retry and the owner never changes.

### Symbol/timeframe ownership
- Encoded in the job key (lines 796-800) and carried in `job.traceContext`; validated in `attemptBackfill` (`symbol`/`timeframe` normalization, lines 703-714) and required by `handleBackfillSuccess`'s replay-scope check (lines 862-878).

### Session retirement
- Every live-session broker change goes through `_beginTransitionContext`, which now calls `this.ctx.candleProcessor?.cleanup('session_transition')` as its first action (`core/SessionRouter.js:679-680`). `stop()` calls `cleanup('session_router_stop')` (`core/SessionRouter.js:1956`).
- `cleanup(reason)` iterates all `backfillJobs` and calls `_finishBackfill(job, reason)`, which clears the retry timer and deletes the job (`core/CandleProcessor.js:1237-1239, 836-842`).
- `_runBackfill` re-checks `this.backfillJobs.get(job.key) !== job` both before and after the `await attemptBackfill` (lines 813, 816), so a late response arriving after cleanup is discarded and never replayed.
- `transitionInProgress` is set to `true` *before* `_beginTransitionContext` runs in both transitions (`core/SessionRouter.js:1578`, `1703`), so the `startBackfill` guard and the cleanup sweep are consistently ordered; new dispatches during a transition are refused.

## Candidate inventory

| # | Candidate | Evidence | Decision |
|---|-----------|----------|----------|
| 1 | Broker ownership captured at dispatch and held immutable across retries | `CandleProcessor.js:805, 696, 716, 743, 814` | Supported — directly fixes the old dynamic-`activeBroker` read |
| 2 | Per-job keying by full scope prevents symbol/frame cross-talk | `CandleProcessor.js:796-800, 801-802` | Supported — replaces the single instance-wide interval |
| 3 | Session transition/stop cancels all pending jobs | `SessionRouter.js:680, 1956`; `CandleProcessor.js:1237-1239` | Supported |
| 4 | Late in-flight response cannot be replayed after retirement | `CandleProcessor.js:813, 816` | Supported |
| 5 | New dispatch blocked during transition/shutdown | `CandleProcessor.js:789-795` | Supported |
| 6 | Orphaned job if `handleBackfillSuccess` throws | `CandleProcessor.js:817-822, 877` | Unresolved edge (pre-existing), not part of ownership mechanism |
| 7 | `backfillJobs` map has no size cap | `CandleProcessor.js:129` | Non-blocking observation |

Old API (`startBackfillRetry`, `stopBackfillRetry`, `backfillRetryInterval`) has no remaining live references — `find_references` returned only `CHANGELOG.md` and a stale `callgraph-processNewCandle.mmd` artifact, not source.

---

VERDICT: no_break_found
ADVERSARIAL_REVIEW_BLOCKING: no

CANDIDATE SET: examined 7 of 7 candidates (producer, keying, broker capture, retry reuse, transition/stop cleanup, late-replay guard, edge cases). Verified all live `activeBroker` assignment sites (SessionRouter.js:1660, 1788, 1866, 1891, 1937) route through `_beginTransitionContext` cleanup except `_activateStaticBacktestSession`, which is backtest-only where gap detection is disabled (`CandleProcessor.js:1046`). Unread: `TraceSpine.emitTrace` internals and the transition-store lock implementation (not needed for the ownership question).

AST EVIDENCE: I used `find_references` (startBackfillRetry, attemptBackfill, startBackfill) and `grep`/`regex_grep` (epoch, activeBroker, transitionInProgress, emitTrace, _resolveTraceContext) directly in this run; no host-provided AST scan receipts were relied upon for structure claims.

INHERITED: The `cleanup('session_transition')` call is added at `SessionRouter.js:680` inside `_beginTransitionContext`, which is invoked by both live transitions and both activation paths; `stop()` adds `cleanup('session_router_stop')` at `SessionRouter.js:1956`. The `sessionRouterEpoch` field flows from `SessionRouter.js:1203` (OHLC fence stamping) into `wrappedInput?.sessionRouterEpoch` and hence into the gap key, making the key epoch-scoped across transitions.

ALLEGATIONS: The CHANGELOG (lines 13-21) documents the two old defects being fixed — single instance-wide retry timer and dynamic `activeBroker` read disagreeing with the trace's `brokerId`. The current source confirms both are structurally removed. No observed runtime execution was performed; all conclusions are source-derived.

SUBSTANTIVE RESOLUTION: none (no substantive dispute; ownership mechanism is implemented as intended).

WHAT I DID: Read the full CandleProcessor diff (191 lines) and SessionRouter diff (21 lines); read current CandleProcessor.js lines 100-180, 680-880, 990-1100, 1220-1243; read current SessionRouter.js lines 655-800, 1140-1260, 1568-1640, 1640-1740, 1740-1940, 1946-1990; grepped for `sessionRouterEpoch`, `activeBroker`, `epoch`, `transitionInProgress = true`, `emitTrace`, `_resolveTraceContext`; ran `find_references` on `startBackfillRetry`, `attemptBackfill`, `startBackfill`; read CHANGELOG.md lines 1-30.

WHAT I DID NOT DO: Did not execute any code, tests, or the transition/retry scenario (no host-attested execution receipt exists). Did not read `TraceSpine.js` internals or the transition-store lock implementation. Did not inspect every one of the 1,242/2,033 lines of the two files — only the ranges relevant to the backfill ownership path.

WHAT I ASSUMED: That the captured `router?.activeBroker` adapter object remains a valid callable REST client for the duration of a job within a single session (transitions cancel jobs before the adapter is torn down). That `wrappedInput` carries correct scope fields in live operation, as it does in the OHLC fence path.

WHY THIS VERDICT: The ownership mechanism is complete and correctly ordered — immutable broker capture at dispatch, full-scope keying, same-job retry reuse, and cleanup at both transition and stop with post-await guards preventing late replay. The known old defects (single timer, dynamic broker read) are demonstrably removed from current source. No reachable defect in the ownership path was found. The orphaned-job-on-throw edge (candidate 6) is conditional on missing scope data, pre-existing relative to this change, and outside the ownership question, so it does not block or constitute a break here.

IF INCOMPLETE, WHY: Not incomplete for the ownership question. Missing evidence: runtime execution receipt proving a live transition cancels an in-flight backfill before its response replays (the source guard is present but not host-attested), and confirmation that `TraceSpine.emitTrace` accepts the emitted trace shapes.
