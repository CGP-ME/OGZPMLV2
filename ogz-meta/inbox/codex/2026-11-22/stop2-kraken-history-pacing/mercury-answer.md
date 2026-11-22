## VERDICT: no_break_found

**Question:** How are public OHLC requests dispatched when callers request different timeframes of the same Kraken pair concurrently through multiple adapter instances?

### Direct answer

Public OHLC REST requests are dispatched through a single, module-level, per-pair throttle in `kraken_adapter_simple.js`. All `getHistoricalOHLC(pair, interval, count)` calls for the **same pair share one throttle slot regardless of interval**, and that slot is coordinated across **all `KrakenAdapterSimple` instances** because the limiter state lives at module scope, not instance scope. Concurrent requests for different timeframes of the same pair are therefore serialized to roughly one REST request per `requestWindow` (1000 ms) per pair, each carrying its own interval in the URL and being processed independently (no data mixing, no deduplication).

### How the dispatch works (current source, ref `052bea81`)

1. **Module-level shared state** — `const ohlcNextRequestAt = new Map();` at `kraken_adapter_simple.js:45`. Because this is declared at module top-level (not inside the class), every `KrakenAdapterSimple` instance constructed from this module shares the same Map. This is the cross-instance coordination mechanism (comment at line 44: "Public OHLC limits belong to the IP/pair, across frames and adapter instances.").
2. **Consumer chain** — `run-empire-v2.js:1852` and `:2938` call `broker.getCandles(symbol, timeframe, limit)`; `brokers/KrakenIBrokerAdapter.js:317-329` maps the timeframe to a Kraken interval and calls `this.kraken.getHistoricalOHLC(krakenPair, interval, limit)`.
3. **Wait loop** — `kraken_adapter_simple.js:320-324`:
   ```js
   while (ohlcNextRequestAt.has(pair)) {
     const waitMs = ohlcNextRequestAt.get(pair) - Date.now();
     if (waitMs <= 0) break;
     await new Promise(resolve => setTimeout(resolve, waitMs));
   }
   ```
4. **Slot reservation** — line 333: `ohlcNextRequestAt.set(pair, Date.now() + this.requestWindow);` — **keyed by `pair` only**, not `pair:interval`. Then the HTTP request fires at line 334 with `pair`, `interval`, and `since` in the URL (line 330).
5. **Window** — `requestWindowMs: 1000` (`config/internals.json:911`); read into `this.requestWindow` at `kraken_adapter_simple.js:109`.

### Behavior for the exact scenario asked

- **Different timeframes, same pair, concurrent, multiple instances:** All requests for e.g. `XBTUSD` at 5m and 15m contend on the single `XBTUSD` slot. Whichever caller acquires the slot first fires its request; the other waits until the slot refreshes (~1 s) and then fires. Because the key ignores interval, the two different-interval requests are serialized to one per second per pair rather than proceeding in parallel. This is a documented design choice (line 44), not an accidental collision.
- **Cross-instance correctness:** The module-level Map means instance A's request sets the slot that instance B's request will observe; no per-instance throttle can double-fire for the same pair.
- **No data mixing:** each request's `interval` is embedded in its own URL and each response is mapped independently (lines 330, 349-360), so a 5m fetch never returns 15m data and vice versa.
- **No deduplication:** the throttle limits *rate*; it does not cache or collapse identical requests. Two callers asking for the same pair+interval still each issue their own HTTP request (one waits ~1 s).

### Candidate inventory (examined 6 of 6)

| Candidate | Evidence | Verdict |
|---|---|---|
| A: Per-pair (interval-agnostic) keying serializes different timeframes | keys at `kraken_adapter_simple.js:320,333` are `pair` only; comment line 44 explicitly says "across frames" | **Supported** — intentional; cost is latency, not incorrectness |
| B: Cross-instance coordination via module-level Map | `kraken_adapter_simple.js:45` module scope; no instance-level copy exists (grep: only lines 45/320/321/333 touch `ohlcNextRequestAt`) | **Supported** — works as intended |
| C: Burst race — multiple waiters waking at same expired window all fire | comment line 319 claims "must not wake into a burst" | **Refuted** — the set at line 333 is synchronous with the break; each waiter's continuation runs to completion before the next waiter rechecks, so the second waiter sees the refreshed timestamp and waits again. No same-window double-fire for the same pair |
| D: First-call TOCTOU double-fire | check (line 320) vs set (line 333) | **Refuted** — when the map is empty there is no `await` between check and set (the only `await` is inside the while-wait), so the first caller sets the slot before the second caller's check runs |
| E: No deduplication (each caller fires its own request) | no cache/response-sharing; each call reaches `axios.get` at line 334 | **Supported** — behavior, not a defect |
| F: Interval data mixing | per-request URL (line 330) + independent mapping (lines 349-360) | **Refuted** — responses are independent |

### Regression comparison (baseline `4f3b48c`)

The baseline `getHistoricalOHLC` (`git_show` baseline, lines 333-342) had **no throttle at all** — every call immediately fired `axios.get(url)`. The change under review introduces the module-level per-pair limiter, so the current behavior is strictly more conservative than baseline for concurrent same-pair requests.

### Limitations / unverified behavior (named)

- **No execution receipt** exists in this review for an actual concurrent multi-instance run; the serialization and burst-absence conclusions are derived from single-threaded event-loop semantics of the source, not from an observed run. If a caller invoked `getHistoricalOHLC` from a worker thread or a different module instance with a distinct `requestWindow`, the shared-key assumption could differ — no such path was found.
- The throttle is keyed per-pair, not per-IP; aggregate traffic across many *different* pairs is not bounded by this mechanism. This is outside the question's same-pair scope but is a real limitation of the design.
- The `ohlcNextRequestAt` entries are never deleted (line 333 only sets); this is harmless because stale entries are handled by the `waitMs <= 0` break, and the map size is bounded by the number of distinct pairs ever requested.

### Why not found_break

For the specific question — same pair, different timeframes, concurrent, multiple adapter instances — the mechanism does what it is documented to do: it serializes all calls for a pair into one request per 1000 ms window, coordinated across instances. I found no supported functional break (no burst, no double-fire, no data mixing, no lost requests). The one notable property — different timeframes of the same pair are throttled together — is explicitly intentional per the line 44 comment, so it is a design choice rather than a defect.

---

**ADVERSARIAL_REVIEW_BLOCKING: no**

**CANDIDATE SET:** examined 6 of 6 (per-pair keying; cross-instance map scope; burst race; first-call TOCTOU; deduplication absence; interval data mixing). Unread paths: no runtime execution receipt for concurrent multi-instance dispatch; per-IP aggregate behavior across different pairs not evaluated.

**AST EVIDENCE:** I used `find_references` (getHistoricalOHLC, getCandles) and `grep`/`regex_grep` for `ohlcNextRequestAt`, `requestWindowMs`, `enforceRateLimit`, `public/OHLC`; `open_file` for exact line citations; `git_show` for the baseline. No host-provided AST scan receipt was relied upon.

**INHERITED:** The throttle is new in this change (baseline had none). The module-level Map is the sole coordination mechanism; there is no fallback, swallowed error, or env bypass in the dispatch path. `this.requestWindow` inherits `requestWindowMs: 1000` from `config/internals.json`. `core/KrakenAdapterV2.js:235-239` `getCandles` is a stub returning `[]` and does not participate in REST OHLC dispatch; `scripts/fetch-historical-candles.js` and `tools/fetch-candles.py` are offline utilities not on the runtime path.

**FOURTH SHAPE CLASSIFIER:** classified 2 of 2 added controls — the while-wait gate (`kraken_adapter_simple.js:320-324`) and the slot reservation at line 333; both are rate-limit guards, not bot-runtime gates.

**ALLEGATIONS:** none asserted by prior reviewers (this is the independent collection round; prior receipt entries = 0).

**SUBSTANTIVE RESOLUTION:** none (no substantive dispute; independent collection).

**WHAT I DID:** read `kraken_adapter_simple.js` lines 1-120 and 280-360; read the captured diff receipt (baseline `4f3b48c`→`052bea81`); read `brokers/KrakenIBrokerAdapter.js:300-360`, `config/internals.json:895-925`, `run-empire-v2.js:1835-1865` and `2920-2950`, `modules/MultiTimeframeAdapter.js:470-510`, `core/KrakenAdapterV2.js:230-280`; ran `find_references` on `getHistoricalOHLC`/`getCandles`; grepped `ohlcNextRequestAt`, `requestWindowMs`, `enforceRateLimit`, `public/OHLC`; `git_show` baseline `getHistoricalOHLC`.

**WHAT I DID NOT DO:** did not execute any repository program or observe a live concurrent multi-instance dispatch; did not read the full 1355-line target file (only the dispatch-relevant ranges); did not enumerate every `getCandles` consumer's call timing across the full codebase.

**WHAT I ASSUMED:** single-threaded Node event-loop semantics (no worker-thread execution of `getHistoricalOHLC`); all instances read the same `requestWindowMs` config value; the runtime path is the broker-wrapper chain (`getCandles` → `getHistoricalOHLC`).

**WHY THIS VERDICT:** the dispatch mechanism is fully explained by the module-level per-pair Map and the synchronous check-set-refresh loop; the two plausible race candidates (burst, TOCTOU) are ruled out by source control flow, and the interval-agnostic keying is explicitly documented as intended.

**IF INCOMPLETE, WHY:** not incomplete for the asked question; the only gap is the absence of a host-attested execution receipt for an actual concurrent multi-instance run, which affects empirical confirmation but not the source-derived conclusion.
