# Astra feed-recovery-control retirement adjudication

**GO** for exact candidate tree `fabe26e7407217cdef38b310284fb06bed6c1370` against `595d981f8a67662ed0dd57741b583c91948539d0`. No introduced defect was established in the retired controls or their callers. This was read-only source/evidence review; no tests, native trading imports, production edits, or runtime operations were performed.

## Actual removal and reachability

The exact diff removes two internals leaves (`staleDataRecoveryAgeMs`, `gapRecoveryCleanCandlesRequired`), increments internals revision 5→6, removes their unreachable processor recovery branches/helper and unused state, and simplifies the watchdog's always-false pause-field check. Three test fixtures lose only the same obsolete leaves. Actual stale-candle logging, gap detection, backfill, retry handling, and runner recovery from legacy persisted pauses remain.

In the base, `run-empire-v2.js:1217` initializes `staleFeedPaused=false`. The only other production writes found are resets to false (`run-empire-v2.js:2819`, `core/CandleProcessor.js:333`); no true producer exists. The deleted processor branches require that field to be true (base `CandleProcessor.js:1004`, `:1102`). `feedRecoveryCandles` likewise has zero initialization/reset only; `cleanCandleCount` cannot reach its deleted increment/threshold branch without the absent true producer. The deleted `_resumeDataFeedPause` has only those guarded callers. This is ordinary runtime reachability, not a claim that a caller deliberately mutating an object cannot force a legacy branch.

Candidate `CandleProcessor.js:973-980` still reports stale data without pausing, `:1048-1062` still backfills gaps and schedules retries, and `:793-822` still replays successful retries and clears their timer. Cleanup still calls `stopBackfillRetry` (`:1216`). Candidate runner watchdog (`run-empire-v2.js:2963-2992`) preserves REST attempts and successful recovery. The separate `_recoverDataFeedPauseIfFresh` still consults StateManager, checks freshness, and resumes only the matching data-feed pause owner (`:2792-2817`); its call from `_markActiveTimeframeData` remains (`:2787`). Removing the processor helper does not remove this surviving recovery path.

## Mercury adjudication

Preserve Mercury's **found_break**, blocking answer. Its four claims do not establish regressions introduced by this diff:

- The price parse/zero/NaN return at candidate `core/CandleProcessor.js:983-984` is unchanged baseline code, not an added guard.
- The pre-runtime shutdown `process.exit`/`resolve` order at candidate `run-empire-v2.js:73-88` is unchanged. This retirement adds no caller or changed exit condition there.
- The alleged missing WeakSet registration is false: candidate `run-empire-v2.js:2008` explicitly calls `this._dashboardDepthAdapters.add(adapter)` after listener registration. That method is unchanged.
- The synchronous countdown sleep at candidate `run-empire-v2.js:1527-1529` is unchanged and unrelated to the removed recovery state.

The answer's claim to have inspected only three changed files also does not account for the three test-fixture edits in the exact tree. Those fixture edits contain no replacement behavior. No unrelated shutdown, price-validation, listener, or startup rewrite is justified by this review.

## Evidence and limits

All six baseline/candidate processor, runner, and internals fixture files exactly match their pinned git blobs. `verification.txt` records equal baseline/candidate effects, traces, logs, and timers for fresh/stale candles, failed/successful gap backfill, and unsuccessful/successful watchdog REST recovery. The fixture executes the actual processor source with explicit collaborator replacements and extracts the actual watchdog method. It sets the baseline field false, matching the real producer, and stubs the runner's legacy recovery callback; therefore it proves retained callback invocation, not StateManager's complete resume transaction. The latter's continued source call is established separately above.

`provenance-results.json` identifies this candidate and records six role/profile source checks without missing sources, plus unchanged snapshots under 184 archived-name sentinels for all six recorded role/profile combinations. These are Loader/provenance receipts, not trading-behavior acceptance. No full bot startup, broker operation, deployment, pause transaction, or whole-configuration closure is claimed.
