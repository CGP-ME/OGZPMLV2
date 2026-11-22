I have enough evidence to answer. Let me compile the final review.

## Answer

**A candle-gap recovery job decides its originally requested interval is complete based on three pieces of evidence: (1) the provider returns a `coverage` receipt whose `start`/`end` exactly match the fixed original range, (2) `coverage.complete === true`, and (3) the returned bars actually contain the known left-anchor candle at `range.start`. The job does NOT rely on "any candles were returned"; that old heuristic was replaced by the explicit coverage contract.**

### The decision chain (core/CandleProcessor.js)

**Gap origin.** A gap is detected when a new candle arrives whose `etime` jumps past the previous candle's `etime` by more than `gapThresholdMultiplier * candleIntervalMs` (`core/CandleProcessor.js:1051-1055`). The job is started with `gapStart = lastCandle.etime`, `gapEnd = candle.etime` (`core/CandleProcessor.js:1084`).

**Fixed range.** `attemptBackfill` computes the requested native range once from the gap bounds:
- `range = { start: gapStart - intervalMs, end: gapEnd - intervalMs }` (`core/CandleProcessor.js:692-693`). `range.start` is the start time of the known left-boundary candle (whose etime is `gapStart`); `range.end` is the start time of the right-boundary candle that triggered detection.
- The range is deliberately fixed and does not slide on retry: "Limit controls page size; the fixed range controls which history is requested. It does not slide forward when a retry or pacing is delayed." (`core/CandleProcessor.js:737-740`). Both providers keep the range fixed across retries (Alpaca `AlpacaAdapter.js:672-673`, Kraken `kraken_adapter_simple.js:331-333`). So a delayed provider response does not shift the interval being evaluated.

**Completion evidence used by the job** (`core/CandleProcessor.js:744-767`):
1. `const coverage = result?.coverage;` then `if (!coverage || coverage.start !== range.start || coverage.end !== range.end) return unavailable('broker_range_coverage_unavailable');` — the provider must return a receipt covering exactly the requested range (lines 745-748).
2. `if (coverage.complete !== true) return { candles: [], coverage };` — the provider must explicitly assert completeness (line 749).
3. Independent re-verification: `if (!normalized.some(c => c[0] === range.start)) return unavailable('range_start_unavailable');` — the job does not merely trust the provider's assertion; it requires the left-anchor candle to be physically present in the returned bars (lines 765-767).
4. Only then does it filter to bars strictly inside the gap (`arr[1] > gapStart && arr[1] < gapEnd`, line 773), sort, and replay. `_runBackfill` finishes the job as `completed` whenever `coverage.complete === true`, even if zero candles fall inside the gap (a valid quiet interval), and retries otherwise (`core/CandleProcessor.js:822-839`).

### Provider-side evidence (what makes `complete` true)

Only two adapters implement the range-capable `getCandles(symbol, timeframe, limit, range)` contract: `AlpacaAdapter.js:663` and `KrakenIBrokerAdapter.js:317`. All other adapters (Schwab, CME, Oanda, Tastyworks, InteractiveBrokers, Coinbase, Gemini, Binance, Uphold, KrakenAdapterV2) accept only 3 args and return arrays, not `{candles, coverage}`. However, the active broker in the gap-recovery path is always Alpaca or Kraken: `SessionRouter` sets `this.activeBroker` only to `this.alpacaAdapter` or `this.krakenAdapter` (`core/SessionRouter.js:1660, 1788, 1866, 1891, 1937`), and `startBackfill` captures `router?.activeBroker` (`core/CandleProcessor.js:810`). So the non-range-capable adapters are not reachable as the gap-recovery broker.

- **Alpaca** (`AlpacaAdapter.js:663-736`): with a range, it pages through every page (`while (pageToken && (range || ...))`, line 705), rejects malformed page tokens (lines 695-703), and declares `complete: hasAnchor` where `hasAnchor = candles.some(c => c.t === range.start)` (lines 726-729). Completeness rests **only** on finding the left anchor.
- **Kraken** (`kraken_adapter_simple.js:318-395`): uses a `since` cursor (`floor(range.start/1000) - 1`, lines 331-333) and declares `complete` only if the left anchor is present **and** the provider's `result.last` cursor is at least `range.end - intervalMs` (`reason = ... cursor < range.end - intervalMs ? 'provider_cursor_before_range_end' : null`, lines 381-387). So Kraken additionally requires the provider to have advanced its cursor past the right boundary.

### Candidates considered and rejected
- **"Any candles returned ⇒ complete" (old heuristic):** rejected by the diff — the old `_runBackfill` used `candles.length > 0`; the new code uses `coverage.complete === true` (diff lines 156-165).
- **Provider `coverage.start/end` match:** accepted, required (lines 745-748).
- **`coverage.complete`:** accepted, required (line 749).
- **Left-anchor presence:** accepted, required and independently re-verified (lines 765-767).
- **Right-boundary candle presence in response:** not required by either provider; this is safe because the right boundary is known by construction (it is the candle that triggered gap detection, line 1051-1084) and is correctly excluded from replay (line 773).
- **Non-range-capable brokers as activeBroker:** rejected as unreachable — SessionRouter only ever assigns Alpaca/Kraken.

### Unverified assumptions / named limits
- **Interior-bar density is not verified by either provider.** Both declare `complete` based on the anchor (plus Kraken's cursor), not on confirming every interval slot between the boundaries is present. A provider that omits interior bars while still returning the anchor (and, for Kraken, a cursor past the right boundary) would be accepted as complete, and the gap would be considered filled even though some candles are still missing. This is a deliberate design choice (Alpaca: "Missing clock slots can be valid… require the known left anchor instead of inventing an expected number of bars", `AlpacaAdapter.js:723-725`), but it means "complete" guarantees the interval was fully queried, not that every missing bar was recovered.
- **Kraken's `count` parameter is unused in the range path** (not included in the request URL, `kraken_adapter_simple.js:335`). For a gap wider than the provider's single-response window (~720 bars), the cursor will stay below `range.end - intervalMs`, completeness can never be reached, and the job retries indefinitely. This is an edge limitation; I did not observe it in execution.
- I did not execute any code; these are source-derived scenarios, not observed failures.

---

VERDICT: no_break_found
ADVERSARIAL_REVIEW_BLOCKING: no

CANDIDATE SET: examined 5 of 5 candidate evidence paths (CandleProcessor.attemptBackfill completion checks; AlpacaAdapter coverage receipt; KrakenIBrokerAdapter delegation; kraken_adapter_simple coverage receipt; SessionRouter activeBroker selection). Rejected: old "any-candles" heuristic (replaced by coverage contract), non-range-capable brokers as reachable activeBroker (unreachable via SessionRouter).

AST EVIDENCE: host-provided scan receipts were not used this run; I used `find_references` for `startBackfill` (2 hits: definition at `core/CandleProcessor.js:792`, sole caller at `core/CandleProcessor.js:1084`) and `grep` for `getCandles`/`getHistoricalOHLC`/`activeBroker`/`backfillRetryDelayMs`. Caller analysis is backed by these tool results.

INHERITED: `attemptBackfill` swallows provider errors into `unavailable('backfill_request_failed', ...)` (`core/CandleProcessor.js:781-784`) and retries via `setTimeout` on `backfillRetryDelayMs` (config-sourced at line 130, used at lines 836-839). The retry schedule is "after settlement" so a slow request cannot overlap its next retry (lines 835-839). No environment bypass or silent default was found for the completion path.

FOURTH SHAPE CLASSIFIER: classified 3 of 3 added fallbacks in `attemptBackfill` (`unavailable(...)` returns for broker/API, symbol/timeframe, coverage-mismatch), each producing `{ candles: [], coverage: { ..., complete: false, reason } }` (lines 694-696, 700, 747, 753, 763, 766). No new bot gate introduced.

ALLEGATIONS: The completion decision is well-defined and coherent; no defect found in the decision logic. Named caveats (interior-density not verified; Kraken count unused/large-gap livelock) are described as source-derived scenarios, not observed breaks.

SUBSTANTIVE RESOLUTION: none (no prior reviewer findings; no dispute to resolve).

WHAT I DID: read the current `core/CandleProcessor.js` gap-detection/backfill/replay code (lines 600-990, 1030-1110), the captured diff (all 207 lines), the two range-capable provider implementations (`AlpacaAdapter.js:663-736`, `kraken_adapter_simple.js:318-395`), `KrakenIBrokerAdapter.js:317-330`, the `IBrokerAdapter` contract (`foundation/IBrokerAdapter.js:180-193`), and `SessionRouter` activeBroker assignments (lines 1640-1700, 1770-1945). Used `find_references`/`grep` for caller and provider discovery.

WHAT I DID NOT DO: did not read the full text of the other 10 broker adapters (only their `getCandles` signatures from grep); did not inspect `dataFeedConfig` config sources for `gapBackfillBufferCandles`/`gapBackfillRetryDelayMs`; did not execute any code or run tests.

WHAT I ASSUMED: that `result.last` (Kraken) and Alpaca pagination behave per their published API semantics; that the active broker is always Alpaca/Kraken based on the SessionRouter assignments I read. I did not assume any test run.

WHY THIS VERDICT: the evidence chain is internally consistent and the completion decision rests on an explicit provider coverage receipt plus an independent left-anchor re-verification; the range stays fixed across retries, so delayed/partial responses cannot silently shift or falsely complete the requested interval under the reachable (Alpaca/Kraken) broker path.

IF INCOMPLETE, WHY: not incomplete for the core question; the interior-density and Kraken large-gap caveats remain unverified because they depend on external provider behavior not exercised in this read-only investigation.
