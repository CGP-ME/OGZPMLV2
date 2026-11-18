I have now traced the full producer/consumer chain. Let me compile the answer.

## Investigation Summary

I traced the symbol/timeframe flow for an **older broker candle correction** (a re-sent/revised closed bar) through the three consumers named in the question: the candle store, the entry decision boundary, and the dashboard fields.

### What reaches the candle store
The live path runs `sessionRouter` OHLC handler → `handleMarketData` → `CandleProcessor.handleMarketData` → `processNewCandle`. In `processNewCandle` the candle is re-stamped and normalized (`_attachCandleScope` → `buildTradeScope`), then keyed as `candleStoreSymbol = candle.symbol` and `candleTimeframe` (CandleProcessor.js:456-457, 476-480). A correction of an existing bar is detected by matching `etime` in the frame history (`existingIndex = updateHistory.findIndex(c => c.etime === candle.etime)`, CandleProcessor.js:468-469) and routed to the update path, which calls `this.ctx._candleStore.addCandle(candleStoreSymbol, candleTimeframe, candle)` (CandleProcessor.js:476-480). `addCandle` replaces the existing bar by open-time `_t` and keeps the store sorted (CandleStore.js:58-70). So the corrected candle reaches the store under its own canonical symbol + candle timeframe. Symbol normalization across producers is consistent: `normalizeRuntimeSymbol` (run-empire-v2.js:567-574) and `normalizeCandleSymbol` (CandleProcessor.js:32-39) are functionally identical (XBT→BTC, `/`→`-`, 6-char USD split), so the entry boundary's `sym`, the store key, and the dashboard symbol converge.

### What reaches the entry decision boundary
The boundary is `confirmedClosedCandleAtBoundary` (ReplayClosedCandleBoundary.js:12-30). It returns `null` immediately when `candleRevision === true` (ReplayClosedCandleBoundary.js:15). The live handler passes `candleRevision: eventData.candleRevision` (run-empire-v2.js:973) and constructs `incomingCandle` from the OHLC timestamps + scope envelope + `sym` (run-empire-v2.js:976-984). Older corrections are additionally blocked by the etime-ordering guard (`priorCandle.etime > incomingCandle.etime → null`, line 20) and the `lastDecisionCandle.etime >= closedCandle.etime` guard (line 26-28). So corrections do not reach trading analysis; the `if (closedCandle)` gate (run-empire-v2.js:999) is not entered, and the update case falls to the `candleResult.acceptedAsNew === false` branch (run-empire-v2.js:1017) which only logs.

### What reaches the dashboard fields
In the CandleProcessor broadcast block: `dashboardSymbol = candle.symbol`, `dashboardTimeframe = candle.timeframe`, `dashboardCandle` uses the corrected candle's OHLC/t/etime, and `dashboardCandles = frameCtx.priceHistory.slice(...)` (CandleProcessor.js:1127-1143). These are internally consistent with the corrected candle's frame. DashboardBroadcaster edge analytics likewise use `candleStore.getCandles(canonicalSymbol, timeframe)` (DashboardBroadcaster.js:166) and the frame engine snapshot (DashboardBroadcaster.js:426).

### The concrete inconsistency (dashboard indicator fields)
`renderPacket` is now sourced from **the frame engine**: `frameCtx.indicatorEngine.getRenderPacket(...)` (CandleProcessor.js:1104). But `_buildDashboardIndicators` still reads its **snapshot from the global engine**: `this.ctx.indicatorEngine.getSnapshot()` (CandleProcessor.js:179-180). The global engine is a separate instance configured for the active trading pair at the active `candleTimeframe` (run-empire-v2.js:426-431), while `frameCtx.indicatorEngine` is the per-symbol-per-timeframe engine created in `SymbolTradingContext` (run-empire-v2.js:3119-3133; SymbolTradingContext.js:83). For a correction on a **non-active observation timeframe or non-primary symbol**, the displayed RSI/ATR/MACD combine the active-frame global snapshot (preferred by `_firstNumberOrNull`) with the corrected frame's render packet, while the payload's `symbol`/`timeframe` claim the corrected candle's frame. The diff changed only the render source (CandleProcessor.js:1104), leaving the snapshot source global — so the two indicator halves are from different engines.

---

VERDICT: found_break
ADVERSARIAL_REVIEW_BLOCKING: yes

CANDIDATE SET: examined 6 of 6 changed paths (config/internals.json, core/BacktestRunner.js, core/CandleProcessor.js, core/DashboardBroadcaster.js, core/WebSocketManager.js, run-empire-v2.js) plus the downstream consumers (core/CandleStore.js, core/SymbolTradingContext.js, core/ReplayClosedCandleBoundary.js, core/AssetRegistry.js).

AST EVIDENCE: I used `find_definition` (confirmedClosedCandleAtBoundary, getSymbolTimeframeContext, _buildDashboardIndicators, [REDACTED]), `grep` (candleStore, getCandles, indicatorEngine, dashboardTimeframe, [REDACTED], candleStore config), and `open_file` reads of the relevant source ranges. No host-provided AST receipts were used as coverage proof; whole-file coverage was not asserted.

INHERITED: The removed `dashboardTimeframe` state (run-empire-v2.js diff; WebSocketManager.js diff) has no dangling consumers — the only remaining `dashboardTimeframe` references are the local const in CandleProcessor.js:1128-1188. The removed config keys `symbolHistoryLimit`/`timeframeHistoryLimit`/`historicalCacheLimit` have zero remaining references. The DashboardBroadcaster `_getPriceHistory`/`_getIndicatorSnapshot` helpers were removed and replaced by `candleStore.getCandles` and `getSymbolTimeframeContext(...).indicatorEngine.getSnapshot()`.

FOURTH SHAPE CLASSIFIER: The only new fallback/guard introduced is the historical-candles empty-array + error response (run-empire-v2.js diff lines 299-322) replacing the cached-fallback path; it sends `candles: []` with an `error` field rather than falling back to cached data. No new bot-runtime gate was introduced by this review.

ALLEGATIONS: The indicator-engine mix is an observed source-level inconsistency (CandleProcessor.js:1104 vs 179-180), not testimony. The entry-boundary protection is source-derived and matches the guard code; it is not an executed observation. I have no host-attested runtime receipt for any of these paths, so the correction scenario is derived from source, not observed.

SUBSTANTIVE RESOLUTION: none (no prior reviewer findings existed in this collection round).

WHAT I DID: Read all six captured diff receipts (internals.json, BacktestRunner.js, CandleProcessor.js, DashboardBroadcaster.js, WebSocketManager.js, run-empire-v2.js); read current source for CandleProcessor.[REDACTED]_buildDashboardIndicators, CandleStore, SymbolTradingContext, ReplayClosedCandleBoundary, DashboardBroadcaster, run-empire-v2.js sessionRouter OHLC handler + getSymbolTimeframeContext + indicatorEngine init; grep-verified removal of dashboardTimeframe and the three dashboard limit config keys; verified the symbol normalization functions and candleStore config.

WHAT I DID NOT DO: Did not read the full DashboardBroadcaster funding/fear-greed sections (lines 300-400); did not inspect frontend consumers (server/dashboard-ticker-frame.js); did not execute any runtime path — the correction scenario is source-derived, not an observed run. No test/build receipt was consulted.

WHAT I ASSUMED: That `stateManager.buildTradeScope` returns the same canonical symbol as `normalizeRuntimeSymbol`/`normalizeCandleSymbol` for registered assets (both normalize to the same dash-form); that the dashboard frontend treats each broadcast's `timeframe` field as authoritative.

WHY THIS VERDICT: For the primary active frame the correction path is clean (store updated, entry blocked, dashboard symbol/timeframe/history coherent). The break is the dashboard indicator fields for non-active-frame/non-primary corrections: render packet comes from the per-frame engine while the snapshot comes from the global active-frame engine, so the displayed indicators are not attributable to the corrected candle's frame. This is a concrete, reachable inconsistency in the exact field the question asks about.

IF INCOMPLETE, WHY: The indicator-field finding is conclusive from source. The practical severity for non-active frames depends on whether observation/multi-symbol frames are actively subscribed, which I could not confirm from config in this pass; that does not change the code-level inconsistency.
