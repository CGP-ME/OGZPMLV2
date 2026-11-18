# Mercury answers — Alpaca correction repair

Each dispatch asked one recorded question against its pinned source. These are reviewer answers, not additional author claims. The changelog records the resolution and limits.


## mercury

Source tree: `bfbb856530da10438308dec115ee52e16ce3f852`. Question: How is an Alpaca late bar correction propagated from its stream message through candle-dependent state and entry dispatch in this candidate? Establish any material correctness defect or unresolved gap from current producer/consumer file:line evidence.

(Mercury call failed: Provider response terminated before completion)

[iterations: 9 | termination: error | latency: 28532ms]


## mercury-entry

Source tree: `bfbb856530da10438308dec115ee52e16ce3f852`. Question: Under what conditions can an Alpaca bar correction cause a new entry decision in this candidate? Cite the producing adapter event and the live consumer, and identify any concrete defect or uncertainty. The live OHLC consumer is wired in run-empire-v2.js.

The evidence is complete. Here is my verdict.

---

## VERDICT: found_break

## ADVERSARIAL_REVIEW_BLOCKING: yes

---

### CANDIDATE SET: examined 6 of 6

| # | Candidate path | Examined | Outcome |
|---|---|---|---|
| 1 | Direct stream-timeframe emission (`AlpacaAdapter.js:1196`) | `:1166-1202` | Guarded — `'u'` always emits `candleRevision:true`; consumer returns null |
| 2 | Pure requested-frame revision fetch (`AlpacaAdapter.js:1232`) | `:1205-1268` | Guarded — `requestedRefresh.candleRevision` true flags every candle |
| 3 | Corrected/old bar re-emission (`AlpacaAdapter.js:1235` clause 2) | `:1234-1235` | Guarded — always flagged revision, never a decision bar |
| 4 | **AND-coalescing downgrade** (`AlpacaAdapter.js:1211`) | `:1209-1215` | **BREAK** — mixed batch loses revision flag |
| 5 | Live consumer wiring (`run-empire-v2.js:882`, `SessionRouter.js:1240`) | `:850-1038`, `:1190-1260`, `:1669`, `:1942` | Confirmed live for stocks sessions |
| 6 | Revision guard (`core/ReplayClosedCandleBoundary.js:15`) | `:12-30` | Confirmed as the only gate on the trading cycle |

### The break: AND-coalescing downgrade

At `AlpacaAdapter.js:1209-1212`, when a `'u'` correction and a regular `'b'` close arrive during a single in-flight REST fetch, they coalesce into one pending refresh whose revision flag is the **logical AND** of both: `frameState.pendingRefresh.candleRevision && refresh.candleRevision`. A correction (`true`) merged with a regular close (`false`) yields `false`.

That downgraded batch then drives a fetch (`:1219`). Any candle with `startMs > frameState.lastRequestedBarStartMs` (a bar new to the requested frame) is emitted with `candleRevision: false` (`:1234-1235`). This passes the consumer guard (`ReplayClosedCandleBoundary.js:15` returns null only for `candleRevision === true`), so `closedCandle` is truthy and a trading cycle runs (`run-empire-v2.js:1012-1021`) → `runTradingCycle` → `analyzeAndTrade` → entry decision.

This is reachable: two WebSocket messages arriving within the window of one `getCandles` REST call. The design intent — "A broker correction updates history; it is not a newly closed entry bar" (`ReplayClosedCandleBoundary.js:13-14`) — is defeated for the whole coalesced batch.

### What is NOT a break (rejected candidates)
- **Direct stream corrections** (candidate 1) and **pure revision fetches** (candidate 2) are correctly blocked: `'u'` propagates `candleRevision:true`, and the consumer returns null.
- **Corrected/old bars** (candidate 3) are always flagged revision by the second clause `(lastRequestedBarStartMs !== null && startMs <= lastRequestedBarStartMs)` (`:1235`), so a correction of an already-emitted bar never becomes a decision bar. The leak is confined to bars *new to the requested frame*.

### Uncertainty / additional note
- The entry-triggering bar in the downgrade path is typically a *genuinely new* bar; the corrected old bars remain suppressed. So the correction's role is that of a trigger-sequence participant whose revision signal is silently dropped, not a direct re-emission of corrected data.
- **Reverse edge case:** a pure correction fetch advances `lastRequestedBarStartMs` even though its candles are suppressed (`:1241-1244`), which can cause a *later legitimate close* of the same bar to be misclassified as a revision and suppressed — an entry-*suppression* effect, opposite in direction, also stemming from the same revision bookkeeping.

### ALLEGATIONS
- **Correction can participate in a new entry** — supported by `AlpacaAdapter.js:1211` (AND downgrade) → `:1234-1235` (false revision on new bar) → `run-empire-v2.js:989-1021` (cycle runs). Source-derived control flow; not executed.
- **Guard is sound for corrected/old bars** — supported by `AlpacaAdapter.js:1235` clause 2 + `ReplayClosedCandleBoundary.js:15`.

### INHERITED
- `brokers/AlpacaAdapter.js`: new `emittedBars` Map and `pendingRefresh` state (`:746`, `:748`); `'u'` handling (`:1166`, `:1195-1198`); `_emitRequestedClosedBar` rewrite (`:1205-1268`). The `pendingRefresh` coalescing is the inherited fallback behavior that swallows the correction's revision flag when a regular close is present.
- `core/ReplayClosedCandleBoundary.js`: revision guard inherited unchanged; it is the sole gate and is correct, but is bypassed by the adapter's downgrade.

### FOURTH SHAPE CLASSIFIER: classified 2 of 2 added guards
- `pendingRefresh` coalescing (`:1209-1212`) — intended as a gate/coalescer; defect found in its AND semantics.
- `candleRevision` propagation (`:1195`, `:1234-1235`) — intended guard; correct for old bars, bypassed for new bars on downgrade.

### SUBSTANTIVE RESOLUTION: none (no prior reviewer findings exist; independent collection)

---

### WHAT I DID
Read the captured diff (`AlpacaAdapter.js`, all 136 lines), the current source `:735-966` and `:1100-1292`, `run-empire-v2.js:850-1038` and `:3351-3420`, `core/ReplayClosedCandleBoundary.js:1-33`, `core/SessionRouter.js:1190-1260`; ran `find_references` on `candleRevision`, `grep` for `ohlcHandler`/`on('ohlc'`/`wire(`/`_attachActiveOhlcCallback`, `find_definition` for `handleMarketData`/`runTradingCycle`, and `list_files` for `run-empire-v2`.

### WHAT I DID NOT DO
Did not read `getCandles` REST implementation or `_timeframeIntervalMs` internals; did not read the full `handleMarketData` / `tradingLoop.analyzeAndTrade` entry logic; did not execute any code or tests (no host-attested execution receipt exists).

### WHAT I ASSUMED
That a `'u'` message maps to `candleRevision:true` as coded (`:1195`); that Alpaca sends `'u'` only for previously-sent bars; that two WS messages can arrive within one in-flight REST fetch (network timing).

### WHY THIS VERDICT
The guard `ReplayClosedCandleBoundary.js:15` is correct, but the adapter's AND-coalescing at `AlpacaAdapter.js:1211` can clear the revision flag when a correction coalesces with a regular close, allowing a bar new to the requested frame to be emitted with `candleRevision:false` (`:1234-1235`) and run a trading cycle — a concrete, reachable path by which a correction can participate in a new entry decision.

### IF INCOMPLETE, WHY
Not incomplete for the revision-guard question; the only unread internals (`getCandles`, full `analyzeAndTrade`) do not affect whether the revision flag reaches the consumer gate.

[iterations: 12 | termination: answer_given | latency: 51013ms]


## mercury-entry-final

Source tree: `53d1cf5857cf7b30a6c9e8a33be4b4b228c63934`. Question: Under what conditions can an Alpaca bar correction cause a new entry decision in this candidate? Cite the producing adapter event and the live consumer, and identify any concrete defect or uncertainty. The live OHLC consumer is wired in run-empire-v2.js.

(Mercury call failed: Provider response terminated before completion)

[iterations: 7 | termination: error | latency: 19964ms]


## mercury-close-order

Source tree: `53d1cf5857cf7b30a6c9e8a33be4b4b228c63934`. Question: How is a requested-timeframe Alpaca candle handled when a native revision arrives before its first regular close? Follow the emitted event from brokers/AlpacaAdapter.js through the live consumer in run-empire-v2.js, citing current file:line evidence and any concrete defect or uncertainty.

I now have the complete trace. Let me compile the final answer.

## VERDICT: no_break_found

## ADVERSARIAL_REVIEW_BLOCKING: no

---

### How the requested-timeframe candle is handled (the traced path)

**Producer — brokers/AlpacaAdapter.js.** The stream subscription registers both `bars` and `updatedBars` (`AlpacaAdapter.js:754`). On each message, `candleRevision = msg.T === 'u'` (`AlpacaAdapter.js:1195`), and the native bar is emitted with `candleClosed: true` and that revision flag (`AlpacaAdapter.js:1196`). For every requested frame the adapter then calls `_emitRequestedClosedBar`, passing `{ closedThroughMs: bar.etime, newCloseThroughMs: candleRevision ? null : bar.etime }` (`AlpacaAdapter.js:1197-1202`). So a native revision (`u`) produces a **null** `newCloseThroughMs`, while a regular close (`b`) produces a real new-close boundary.

In `_emitRequestedClosedBar` (`AlpacaAdapter.js:1208`), a requested-frame candle is emitted with `candleRevision: !newClose` (`AlpacaAdapter.js:1242`), where `newClose` requires a non-null `newCloseThroughMs` AND the candle within that window AND not already closed (`AlpacaAdapter.js:1230-1232`). Therefore, when the triggering message is a native revision, every requested-frame candle in the window is emitted as a revision. The merge of concurrent refreshes deliberately keeps the new-close boundary separate from the revision's data window (`AlpacaAdapter.js:1212-1217`), and `lastCloseEventStartMs` is advanced only on a true new close, not a revision (`AlpacaAdapter.js:1250`).

**Routing — core/SessionRouter.js.** The adapter's `ohlc` events are fenced and forwarded to the runner's handler: `adapter.on('ohlc', fencedCallback)` (`SessionRouter.js:1240`), where `fencedCallback` calls `this.onOhlcCallback(event)` (`SessionRouter.js:1207`) — the runner's `ohlcHandler`.

**Consumer — run-empire-v2.js.** `ohlcHandler` (run-empire-v2.js:882) computes the scope envelope, stores the candle, then for evaluation frames calls `confirmedClosedCandleAtBoundary` with the raw `eventData.candleRevision` (run-empire-v2.js:989-997). The boundary returns `null` whenever `candleRevision === true` (`ReplayClosedCandleBoundary.js:15`), so a native-revision-driven requested candle never produces a `closedCandle`, never reaches `captureDecisionInput`, and never fires `runTradingCycle` (run-empire-v2.js:1000-1019). `handleMarketData` still runs for all evaluation-frame events (run-empire-v2.js:1005), so the revision still updates the CandleStore/indicators via `CandleProcessor.processNewCandle` (`CandleProcessor.js:441,476,536`) — but the trading decision is gated by the boundary.

**The fix.** The diff under review adds the `candleRevision` parameter and the early return (`ReplayClosedCandleBoundary.js:12,15`). The baseline `git_show 6fd67e5` had no such check, so a revision (emitted with `candleClosed: true`) passed through the boundary and could trigger a spurious decision; the fix closes that path.

### Candidate set (examined 9 of 9)

1. `core/ReplayClosedCandleBoundary.js` — changed target; fix verified.
2. `brokers/AlpacaAdapter.js` — producer; revision flag + new-close boundary verified.
3. `run-empire-v2.js` — consumer; boundary call + decision gating verified.
4. `core/SessionRouter.js` — event fence/routing verified.
5. `core/SymbolTradingContext.js` — `priceHistory` getter onto CandleStore (lines 111-114), `lastDecisionCandle` cursor (line 103).
6. `core/CandleProcessor.js` — `handleMarketData`/`addCandle`/scope attachment (lines 368-411, 476, 536).
7. `core/TradingLoop.js` — `captureDecisionInput` (lines 1017-1043).
8. `core/CandleStore.js` — symbol+timeframe-keyed storage.
9. Baseline `6fd67e5` of `ReplayClosedCandleBoundary.js` — pre-fix behavior.

### Concrete defect? None proven. Named uncertainties (external, unverifiable from repo)

- **Belated-decision edge case (protocol-dependent).** If Alpaca delivers *only* a native revision for the final bar of a requested candle and the corresponding regular close (`b`) event is missed (e.g., lost during a reconnect gap), the requested candle is emitted only as a revision → no decision. Because `lastCloseEventStartMs` stays `null` (`AlpacaAdapter.js:1250`), the *next* requested-candle fetch re-emits the previous candle as a new close (`AlpacaAdapter.js:1230-1232`), triggering a decision up to one requested-interval late. This is not reachable in normal operation (both `bars` and `updatedBars` are subscribed, `AlpacaAdapter.js:754`), and I cannot verify from the repo whether Alpaca ever omits the `b` for a bar that had a `u`.
- **REST forming-bar behavior.** Whether `getCandles` returns forming/partial bars (which could let a still-forming requested candle be emitted as a revision) is an external API behavior not established by repo evidence.

### Baseline comparison

Pre-fix, a native revision passed through `confirmedClosedCandleAtBoundary` with `candleClosed: true` and could trigger a decision (baseline `git_show 6fd67e5` lines 12-27). Post-fix, line 15 blocks all revisions. The first regular close still passes and triggers the decision, so the fix correctly handles "revision arrives before first regular close."

---

**AST EVIDENCE:** Tools actually used this run: `find_definition`, `find_references` (both regex-backed), `grep`, `regex_grep`, `open_file`, `git_show`, `read_review_receipt`, `list_files`. Caller claims (`confirmedClosedCandleAtBoundary` at run-empire-v2.js:989; `ohlc` consumers via SessionRouter.js:1240) are backed by `find_references` + literal grep hits. I did not run the serena AST tools this run.

**INHERITED:** Changed path `core/ReplayClosedCandleBoundary.js`. Inherited/silent behaviors: revision ⇒ silent `null` return (swallowed, intended); adapter fetch failures are caught and recorded as `ALPACA_REQUESTED_BAR_UNAVAILABLE` truth-unavailable, not thrown (`AlpacaAdapter.js:1257-1265`); runner drops events with missing timeframe/symbol (run-empire-v2.js:884-927); `lastDecisionCandle` is in-memory only and not persisted (SymbolTradingContext.js:103).

**FOURTH SHAPE CLASSIFIER:** classified 1 of 1 added gate — the `if (candleRevision === true) return null;` guard (`ReplayClosedCandleBoundary.js:15`). It is a decision-boundary guard, not a bot-runtime gate; no new bot gates introduced.

**ALLEGATIONS:** No prior reviewer findings existed (independent collection round). My finding: the revision-blocking fix is correct and complete for the posed scenario; the only gaps are external protocol uncertainties above.

**SUBSTANTIVE RESOLUTION:** none (no substantive dispute; independent round).

**WHAT I DID:** Traced the event path AlpacaAdapter.js:1195-1254 → SessionRouter.js:1187-1240 → run-empire-v2.js:882-1019 → ReplayClosedCandleBoundary.js:12-30; read the captured diff receipt; read the baseline via `git_show 6fd67e5`; verified CandleStore scope fields (CandleProcessor.js:368-411), `priceHistory` getter (SymbolTradingContext.js:111-114), and `captureDecisionInput` (TradingLoop.js:1017-1043); checked for other `ohlc` consumers.

**WHAT I DID NOT DO:** Did not execute the repo or any tests; did not verify Alpaca's external stream/REST protocol behavior (whether a `u` can replace a `b`, whether REST returns forming bars); did not read the full 4,123-line run-empire-v2.js (only the relevant windows).

**WHAT I ASSUMED:** That Alpaca's stream sends a `b` (regular close) per completed bar in normal operation, as implied by subscribing to both `bars` and `updatedBars` (AlpacaAdapter.js:754); that `getCandles` returns completed bars (standard REST semantics).

**WHY THIS VERDICT:** The code-level handling of a native revision arriving before the requested candle's first regular close is correct and fully traced: the revision is flagged `candleRevision: true`, blocked at ReplayClosedCandleBoundary.js:15 (no decision), and the first regular close is emitted with `candleRevision: false` and passes through to trigger the decision. No concrete code defect found; remaining concerns are external protocol behaviors I cannot verify from the repo.

**IF INCOMPLETE, WHY:** Not incomplete for the code path; the two named uncertainties (belated decision if a `b` is missed; REST forming-bar behavior) require external Alpaca protocol evidence not present in the repo.

[iterations: 22 | termination: answer_given | latency: 222865ms]


## mercury-storage

Source tree: `53d1cf5857cf7b30a6c9e8a33be4b4b228c63934`. Question: When an Alpaca minute-bar revision updates an already stored candle, what values subsequently reach the canonical candle history, frame indicators and latest market-data snapshot? Trace the producer and consumers with current file:line evidence and identify any material defect or uncertainty.

I have completed my trace of the producer and consumers. Let me compile the final verdict.

## Summary of the trace

**Producer** — `handleMarketData` (`core/CandleProcessor.js:908`) builds the candle from the raw OHLC message (990–1000), runs gap detection (1019–1068), then unconditionally calls `processNewCandle(candle, …)` (1071). After that it reads the latest bar from the canonical store and builds the market-data snapshot (1073–1097).

**The change** (`git_diff` current): the market-data snapshot is now sourced from `frameCtx.priceHistory.at(-1)` (1075) instead of the raw incoming message fields. That is the only change in the diff.

**Canonical candle history** — for a revision (same `etime`), `processNewCandle` takes the update path: `this.ctx.priceHistory[existingIndex] = candle` (474, legacy root mirror) and `this.ctx._candleStore.addCandle(...)` (476). `CandleStore.addCandle` replaces the matching entry in place (`candles[index-1] = candle`, `core/CandleStore.js:63-64`), keeping the array time-ordered so the last element is the newest bar. The revised candle object is therefore what reaches the canonical history.

**Frame indicators** — the update path feeds the revised candle to `this.ctx.indicatorEngine.updateCandle(...)` (484) and `frameCtx.indicatorEngine.updateCandle(...)` (493), plus `strategyOrchestrator.ingestMarketCandle(symbol, candle)` (496) and `volumeProfile.update(candle, priceHistory)` (497–498). `IndicatorEngine.updateCandle` (`core/indicators/IndicatorEngine.js:208`) handles a latest-bar revision on a fast path (216–222) and a historical-bar revision by replacing the retained bar and replaying (`_replayRetainedCandles`, 225–230). So the revised values do reach the frame indicators, and the engine recomputes for historical corrections.

**Latest market-data snapshot** — `latestCandle = frameCtx.priceHistory.at(-1)` (1075); `frameCtx.priceHistory` is a getter onto the shared candleStore (`core/SymbolTradingContext.js:111-114`), which is the same `CandleStore` instance used by `ctx._candleStore` (`run-empire-v2.js:811,3279`). Because `processNewCandle` ran before line 1075 and `addCandle` is synchronous, `at(-1)` reflects the post-revision store. For a revision to the latest bar, the snapshot shows the revised OHLCV. For a revision to a historical bar, `at(-1)` returns the unchanged latest bar, so the snapshot does not move backward — exactly the stated intent (1073–1074).

---

VERDICT: no_break_found

ADVERSARIAL_REVIEW_BLOCKING: no

CANDIDATE SET: examined 8 of 8. (1) CandleStore.addCandle replace-in-place — `core/CandleStore.js:63-64`; (2) legacy-root array update — `core/CandleProcessor.js:474`; (3) global indicatorEngine.updateCandle — `core/CandleProcessor.js:484-487`; (4) per-symbol indicatorEngine.updateCandle — `core/CandleProcessor.js:493-495`; (5) strategyOrchestrator.ingestMarketCandle — `core/CandleProcessor.js:496`; (6) volumeProfile.update — `core/CandleProcessor.js:497-498`; (7) marketData snapshot build — `core/CandleProcessor.js:1073-1097`; (8) snapshot consumers `ctx.marketData`/`frameCtx.marketData` — `core/CandleProcessor.js:1095,1097`. All paths for the revision scenario (latest-bar and historical-bar) were traced.

AST EVIDENCE: I used the repo tools directly in this run: `git_diff` (current), `find_definition` (processNewCandle, getSymbolTimeframeContext, addCandle, updateCandle, _stampRuntimeScopeFields), `regex_grep` (class/priceHistory definitions, updateCandle call sites, `new SymbolTradingContext`, `_candleStore`), `grep`, and `open_file` on the relevant windows. No host-provided scan receipts were relied on as primary evidence.

INHERITED: The revision handling is pre-existing (`processNewCandle` update path). Inherited behaviors that matter here: (a) `frameCtx.priceHistory` is a getter returning a shallow copy from `getCandles` (`core/CandleStore.js:101`); the comment at `core/SymbolTradingContext.js:106-114` claims it returns the live mutating array, which is inaccurate but functionally harmless for reading `at(-1)` (each read is a fresh snapshot). (b) `handleMarketData` returns early if the close is non-finite (987), so the stored candle's `c` is always finite. (c) MED-07 null-volume handling is preserved (1088).

FOURTH SHAPE CLASSIFIER: classified 0 of 0 added throws/guards/gates. The diff adds no new guards; it only changes the data source for the marketData object.

ALLEGATIONS: I did not find a material defect in the changed path. The change correctly routes the snapshot to the canonical store's newest bar, and for a latest-bar revision all three consumers (history, indicators, snapshot) receive the revised values. The one pre-existing inconsistency I noted outside the diff's scope: the dashboard broadcast still uses the raw message fields (`price`, `open/high/low`, `volume`) for `dashboardCandle` and `data.price` (`core/CandleProcessor.js:1135-1139,1147-1148`), so for a historical revision the dashboard would display the revision's values as if current. This is not part of the changed path, but it means the "latest market-data" fix does not extend to the dashboard consumer.

SUBSTANTIVE RESOLUTION: none (no substantive dispute; the change is consistent with its stated intent).

WHAT I DID: Read the captured diff (`git_diff` current, `core/CandleProcessor.js`), read `handleMarketData` (850–1228), read `processNewCandle` (441–619) and `_stampRuntimeScopeFields` (413–423), read `CandleStore.addCandle`/`getCandles`/`_getCandles` (1–364), read `SymbolTradingContext` priceHistory getter (30–133), read `IndicatorEngine.updateCandle` (208–300), and confirmed the SymbolTradingContext instances share `ctx._candleStore` (`run-empire-v2.js:811,3279`). I also read the dashboard consumer (1101–1216) as a side check.

WHAT I DID NOT DO: I did not execute the code (no host-attested runtime receipt); conclusions are source-derived. I did not exhaustively verify `IndicatorEngine._replayRetainedCandles` arithmetic (269–300), only that the historical-revision replay path exists and is invoked. I did not trace the persistence round-trip (`saveToDisk`/`loadFromDisk`) beyond confirming `getCandles` is used for saving.

WHAT I ASSUMED: That `ctx._candleStore` and each `SymbolTradingContext.candleStore` are the same instance (supported by `run-empire-v2.js:811,3279`). That `processNewCandle` is synchronous and completes before line 1075 reads the store (it is a synchronous method). That the stored candle's `o/h/l/c/v` equal the scoped candle's values (supported by `_stampRuntimeScopeFields` only adding scope fields, 413–423).

WHY THIS VERDICT: Every consumer in the trace receives the post-revision canonical values when the revision targets the latest bar, and the snapshot correctly stays on the latest bar for historical revisions. The change is consistent with its stated intent and introduces no reachable regression. The only discrepancies found (priceHistory getter copy-vs-live comment; dashboard using raw fields) are documentation inaccuracy and an out-of-scope pre-existing inconsistency, not a defect in the changed path.

IF INCOMPLETE, WHY: Not incomplete for the traced producer/consumer question. Runtime execution evidence is absent, so the conclusion is source-derived rather than observed-execution-derived; and the indicator replay internals were not exhaustively audited, but the replay path's existence and invocation are confirmed.

[iterations: 22 | termination: answer_given | latency: 63710ms]
