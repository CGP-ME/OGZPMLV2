I have traced the full path. Let me verify one more detail — the `_runBackfill` retry/complete gate and the `attemptBackfill` coverage checks are the decisive evidence. I have all I need.

---

## VERDICT: no_break_found

The candle-gap recovery job decides its originally requested interval is complete based on **the provider's `coverage` receipt, gated by two exact-match checks and one independent anchor verification**. It does **not** count expected bars or verify interior contiguity; completeness is a provider-attested claim that the CandleProcessor cross-checks only against the left anchor.

### The completion decision path (core/CandleProcessor.js)

**1. Gap detection triggers the job** — When a new candle arrives in live mode and the gap exceeds the threshold, `startBackfill(lastCandle.etime, candle.etime, gapTraceContext)` is called (`core/CandleProcessor.js:1051-1084`). The job bounds are fixed at gap start/end.

**2. `startBackfill` owns the immutable job** (`core/CandleProcessor.js:792-815`) — keyed by `[brokerId, accountId, assetClass, executionMode, symbol, timeframe, sessionRouterEpoch, gapStart, gapEnd]` (801-805). Concurrent identical requests share one pending promise (807). Each job carries a fixed `gapStart`/`gapEnd`.

**3. `attemptBackfill` builds the range and calls the provider** (`core/CandleProcessor.js:690-785`):
- `range = { start: gapStart - intervalMs, end: gapEnd - intervalMs }` (693). The range start is one interval before the gap — the last known candle (the anchor).
- Calls `broker.getCandles(symbol, timeframe, fetchCount, range)` (744). `fetchCount` is only a page-size hint (739-740); the range controls what is queried and does not slide on retry (comment 737-738).

**4. The decisive completeness evidence** (`core/CandleProcessor.js:746-749`):
- Line 746: `if (!coverage || coverage.start !== range.start || coverage.end !== range.end) return unavailable('broker_range_coverage_unavailable')` — the coverage must exist **and exactly match the requested range**.
- Line 749: `if (coverage.complete !== true) return { candles: [], coverage }` — the provider must explicitly attest completion. Otherwise the job does not complete.

**5. Independent anchor verification** (`core/CandleProcessor.js:765-767`): `if (!normalized.some(c => c[0] === range.start)) return unavailable('range_start_unavailable')` — even after the provider claims `complete: true`, the CandleProcessor requires the left anchor candle (start == `range.start`) to be present in the returned set.

**6. `_runBackfill` gates completion vs retry** (`core/CandleProcessor.js:817-840`): only `coverage.complete === true` (822) leads to `handleBackfillSuccess` + `_finishBackfill(job, 'completed')` (826). Otherwise it schedules a retry after `backfillRetryDelayMs` (836-839). Guards at 818/821 discard a late response after the job is retired (comment 820: "Handoff/stop retires the producer before a late response can be replayed").

### What `complete: true` means at the provider

- **AlpacaAdapter** (`brokers/AlpacaAdapter.js:663-736`): pages through every page (`do...while (pageToken && ...)`, 683-705), then `hasAnchor = candles.some(c => c.t === range.start)` (726) and returns `complete: hasAnchor` (729). Completion therefore requires **all pages exhausted AND the anchor present**. A pagination error or malformed page returns `complete: false` (697, 702, 720, 733).
- **Kraken simple adapter** (`kraken_adapter_simple.js:318-395`): `hasAnchor = mapped.some(c => c.t === range.start)` (381), and `reason = !hasAnchor ? 'range_start_unavailable' : cursor < range.end - intervalMs ? 'provider_cursor_before_range_end' : null` (382-384), with `complete: reason === null` (387). Completion requires **anchor present AND the provider cursor reaching at least `range.end - intervalMs`** — i.e., the provider confirms the queried interval is committed.

### How delayed/partial responses are handled

- **Delayed**: the job simply awaits the async result; the range stays fixed (Kraken comment 328: "A recovery range stays fixed even while pacing or retrying this request"). A late response arriving after shutdown/session-transition is discarded by the 818/821 guards, not replayed.
- **Partial**: Alpaca exhausts all pages before declaring complete; an interrupted/errored pagination lands in `catch` → `complete: false` (733). Kraken requires the cursor to reach past the interval end (383). So a genuinely partial response yields `complete: false` → retry, not completion.

### Unverified assumptions / named limitations

1. **Completeness is ultimately trusted from the provider.** The CandleProcessor does not count expected bars (`Math.floor(gapMs / intervalMs) - 1` is computed only for logging at 1068, never used as a completion gate) and does not verify interior contiguity. If a provider returned `complete: true` with missing interior bars, the job would accept it. The only independent check is the left anchor (765).
2. **Adapters that do not emit coverage never complete.** `SchwabAdapter.getCandles` (`brokers/SchwabAdapter.js:398-423`) returns a plain array (no `range` param, no coverage), so it would fail the line 746 check and retry indefinitely. `KrakenAdapterV2.getCandles` (core) returns `[]` (235-239). This is an inherited limitation, not part of the completion gate itself.
3. **No executed test run** confirms the behavior; this is a source-derived reading of the control flow.

### CANDIDATE SET: examined 11 of 11
`core/CandleProcessor.js` attemptBackfill (690-785), startBackfill (792-815), _runBackfill (817-840), _finishBackfill (842-848), handleBackfillSuccess (863-923), gap detection (1050-1087); `brokers/AlpacaAdapter.js` getCandles (663-736); `kraken_adapter_simple.js` getHistoricalOHLC (318-395); `core/KrakenAdapterV2.js` getCandles (235-239); `brokers/SchwabAdapter.js` getCandles (398-423); `brokers/IBrokerAdapter.js` contract doc (152-165). All read.

### AST EVIDENCE
Used `find_definition` (getCandles → 19 candidate defs), `find_references` (startBackfill → call site at line 1084), `grep`/`regex_grep` for coverage/complete producers. Structure claims are backed by these tool results plus direct `open_file` reads of the cited ranges.

### INHERITED
- `core/CandleProcessor.js`: on missing/mismatched coverage → `broker_range_coverage_unavailable` (746-748); on `complete !== true` → silent `{ candles: [], coverage }` return and retry (749, 829-839). Swallowed error: `catch` in attemptBackfill returns `backfill_request_failed` without rethrow (781-784).
- `brokers/AlpacaAdapter.js`: swallows provider errors into `complete: false` coverage (733); no rethrow in range mode.
- `kraken_adapter_simple.js`: swallows errors into `complete: false` coverage (392); rate-limit wait is honored before each request (322-326).
- `brokers/SchwabAdapter.js`: no coverage support; returns a plain array (411-418) — would never satisfy the line 746 gate.

### ALLEGATIONS
No defect is alleged by the prompt; the question is descriptive. I found the completion mechanism coherent and matching the documented contract (`brokers/IBrokerAdapter.js:160-161`: "complete requires provider coverage, never an assumed candle count"). The only caveat is the provider-trust assumption, which is named above, not a break.

### SUBSTANTIVE RESOLUTION: none
(No prior reviewer findings exist; no dispute to resolve.)

### WHAT I DID
Read `core/CandleProcessor.js` lines 1-120, 600-793, 792-1000, 1040-1100; `brokers/AlpacaAdapter.js` 600-740; `kraken_adapter_simple.js` 300-395; `brokers/IBrokerAdapter.js` 150-200; `brokers/SchwabAdapter.js` 398-460; ran `grep`/`regex_grep` for gap/backfill/coverage/complete across the tree; ran `find_definition`/`find_references` for getCandles/startBackfill.

### WHAT I DID NOT DO
Did not execute any code or test. Did not read the full 1248-line CandleProcessor.js (only the cited ranges). Did not inspect the CME/Gemini/Binance/Coinbase/etc. adapters' getCandles for coverage support (only those relevant to the active backfill path were examined).

### WHAT I ASSUMED
That the active broker for a given job is one of the range-capable adapters (Alpaca or Kraken simple); the completion path for non-coverage adapters (e.g., Schwab) is unreachable by design.

### WHY THIS VERDICT
The completion decision is fully traced: exact coverage-window match (746) + `coverage.complete === true` (749, 822) + independent left-anchor presence (765). This matches the documented contract and both provider implementations. No defect found in the decision mechanism; the provider-trust caveat is a named assumption, not a break.

### IF INCOMPLETE, WHY
Not incomplete for the stated question. Coverage of the completion gate and its two provider producers is complete; the unread CandleProcessor ranges are unrelated to the completion decision.

---

## ADVERSARIAL_REVIEW_BLOCKING: no
