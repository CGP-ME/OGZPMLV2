## VERDICT: no_break_found

The numeric RSI, ATR, MACD (signal/histogram) and volume fields in the dashboard message for a revised non-primary candle all come from the **per-symbol/per-timeframe `frameCtx.indicatorEngine`** — the same engine that was just updated with the revised candle — plus (for volume only) the raw OHLC input. There is **no source-identity mismatch** in the current snapshot; in fact the diff under review is what removed a prior mismatch (the dashboard previously read the global/primary engine).

### The producer (snapshot source)

For every candle, `handleMarketData` resolves the frame-local context from the incoming candle's own symbol/timeframe:
- `core/CandleProcessor.js:1006` — `const frameCtx = this.ctx.getSymbolTimeframeContext(candle.symbol, candle.timeframe);`
- `run-empire-v2.js:3147-3149` — `getSymbolTimeframeContext(symbol, timeframe)` returns `this.symbolTimeframeContexts.get(normalizeRuntimeSymbol(symbol))?.get(timeframe)`, i.e. a per-symbol × per-timeframe context.
- `core/SymbolTradingContext.js:83` — each context instances its own `this.indicatorEngine = new IndicatorEngine({ ...config.indicatorConfig, symbol: canonicalSymbol })`.

The revision path updates that engine:
- `core/CandleProcessor.js:465-489` — on an update (same `etime`), `frameCtx.indicatorEngine.updateCandle({t,o,h,l,c,v})` is called (lines 487-489) for the non-primary frame. (`this.ctx.indicatorEngine` at lines 477/537 is guarded by `isLegacyRootMirrorCandle` = primary symbol+timeframe only, so it never runs for non-primary candles.)
- `core/indicators/IndicatorEngine.js:208-241` — `updateCandle` detects the same-t revision, restores the checkpoint, replaces the candle, and `_applyCandle(c)` recomputes all indicators; `core/indicators/IndicatorEngine.js:306-356` calls `_updateATR`, `_updateRSI`, `_updateMACD`, etc.
- The snapshot DTO assembles them: `core/indicators/IndicatorEngine.js:365-421` — `getSnapshot()` returns `.indicators` with `rsi` (376), `atr` (384), `macd`/`macdSignal`/`macdHistogram` (391-393), `volume = _v(lastCandle)` (399).

### The formatting consumer

The dashboard message is `dashboardPricePayload` built in the broadcast block `core/CandleProcessor.js:1095-1177` and sent at line 1177 (`this.ctx.dashboardWs.send(JSON.stringify(dashboardPricePayload))`).

- Line 1098: `const renderPacket = frameCtx.indicatorEngine.getRenderPacket({...})` — the render packet also comes from the same per-frame engine (`core/indicators/IndicatorEngine.js:431-493` exposes `.indicators` and `.overlays`).
- Line 1125: `const dashboardIndicators = this._buildDashboardIndicators(renderPacket, marketData, frameCtx.indicatorEngine.getSnapshot());`
- `_buildDashboardIndicators` (`core/CandleProcessor.js:177-213`) reads:
  - `rsi`: `_firstNumberOrNull(snapshot.rsi, render.rsi)` (193) — snapshot first, render fallback;
  - `atr`: `_firstNumberOrNull(snapshot.atr, render.atr)` (194);
  - `macd`: snapshot `macd.macd ?? macd.macdLine`, else render `macd.macd ?? macd.macdLine` (195-198);
  - `macdSignal` / `macdHistogram`: snapshot fields, else snapshot macd subfields, else render (199-210);
  - `volume`: `_firstNumberOrNull(snapshot.volume, render.volume, marketData?.volume)` (211).
- The `candle.volume` field of the message is **separately** taken straight from the raw OHLC input: `core/CandleProcessor.js:935` destructures `[time, etime, open, high, low, close, vwap, volume, count] = ohlcData`, and line 1133 sets `volume: parseFloat(volume)` in `dashboardCandle` (used at 1144 and 1161).

### Source-identity check

- Producer and consumer are both bound to the incoming candle's symbol/timeframe via the same `getSymbolTimeframeContext(candle.symbol, candle.timeframe)`, so there is no symbol/timeframe mismatch between where the indicators are computed and where they are read.
- The diff under review is exactly what aligned them: it replaced `this.ctx.indicatorEngine.getRenderPacket(...)` (global/primary) with `frameCtx.indicatorEngine.getRenderPacket(...)` (`core/CandleProcessor.js:1098`), and changed `_buildDashboardIndicators` to take `frameCtx.indicatorEngine.getSnapshot()` instead of internally reading `this.ctx.indicatorEngine.getSnapshot()` (diff receipt lines 9-18, 39-40). It also changed `dashboardTimeframe = this.ctx.dashboardTimeframe || candle.timeframe` → `candle.timeframe` (1122) and `dashboardCandles = this.ctx.getCandlesForTimeframe(dashboardTimeframe)` → `frameCtx.priceHistory.slice(...)` (1137). The remaining `this.ctx.indicatorEngine` reads (477/537) are primary-mirror-only and outside the dashboard path.
- Volume dual-source: `dashboardIndicators.volume` (snapshot/render/marketData) and `dashboardCandle.volume` (raw input) are computed through different paths but coincide for the current revised candle because `updateCandle` received `v: candle.v = parseFloat(volume)` and the engine's `lastCandle` is the revised bar.

### Candidate set (examined 5 of 5)
- **A — `frameCtx.indicatorEngine.getSnapshot().indicators`**: primary source for [REDACTED]. Accepted.
- **B — `frameCtx.indicatorEngine.getRenderPacket().indicators`**: fallback in `_firstNumberOrNull` for all the above. Accepted.
- **C — `marketData?.volume`**: fallback for volume only (built from `latestCandle.v` at 1073/1082). Accepted.
- **D — raw OHLC `volume`**: drives `dashboardCandle.volume` (1133). Accepted.
- **E — `this.ctx.indicatorEngine` (global/primary)**: rejected for the current dashboard path — grep shows it only survives in `processNewCandle` under `isLegacyRootMirrorCandle` (477/537), not in the broadcast; it was the pre-diff source and was eliminated by this change.

### Unread / edge gaps
- If a non-primary symbol/timeframe is **not registered** in `symbolTimeframeContexts`, `getSymbolTimeframeContext` returns `undefined` and `frameCtx.indicatorEngine` would throw at 1098/1125 (no null guard). I did not verify that every symbol/timeframe that can reach `handleMarketData` is registered at boot (`run-empire-v2.js:3112-3144` registers routable symbols × observation timeframes). This is a potential crash path, not a wrong-source issue.
- `core/DashboardBroadcaster.js:426` uses the identical `getSymbolTimeframeContext(symbol, timeframe).indicatorEngine.getSnapshot()` pattern as a sibling consumer; it is not part of CandleProcessor's dashboard message and was not the subject of this trace.
- Frontend rendering/formatting of the received fields was not traced (out of scope).

---

ADVERSARIAL_REVIEW_BLOCKING: no

CANDIDATE SET: examined 5 of 5 (A–E above). Unread: boot-time registration completeness for all routable symbol/timeframe pairs; frontend rendering; DashboardBroadcaster sibling path.

AST EVIDENCE: I used `find_definition` for `getSymbolTimeframeContext` and `SymbolTradingContext`, `grep` for `frameCtx`/`getSnapshot`/`processNewCandle`/`this.ctx.indicatorEngine`/`dashboardTimeframe`, and `open_file` for exact line reading. No host-provided AST scan was relied on; all structure claims cite the specific source lines read.

INHERITED: The changed path `core/CandleProcessor.js` inherits the per-symbol/timeframe `SymbolTradingContext` model (`core/SymbolTradingContext.js:33-114`) and the `IndicatorEngine.getSnapshot()`/`getRenderPacket()` DTO contracts (`core/indicators/IndicatorEngine.js:365-493`). No swallowed errors or silent env bypasses were found on this path; the only silent-default behavior noted is the `_firstNumberOrNull` fallback chain, which is intentional precedence, not a bypass.

FOURTH SHAPE CLASSIFIER: classified 0 of 0 added throw/guard/gate/fallback in the diff under review — the diff introduces no new guards, throws, or gates; it only rethreads the snapshot source. (The `initialBalance` throw at 1111-1113 predates this diff and is outside the question.)

ALLEGATIONS: No defect is alleged by the question; it asks for provenance. I accept the trace that the fields originate from `frameCtx.indicatorEngine` (snapshot + render packet) with the raw-OHLC volume path for `dashboardCandle.volume`. I reject any implication that the global `this.ctx.indicatorEngine` is the source in current code, since it is no longer read in the broadcast path.

SUBSTANTIVE RESOLUTION: none (no substantive dispute; provenance is fully traced from current source).

WHAT I DID: Read `core/CandleProcessor.js` lines 1-120, 160-260, 435-600, 880-1180; `run-empire-v2.js` lines 3060-3260; `core/indicators/IndicatorEngine.js` lines 200-520; `core/SymbolTradingContext.js` lines 1-120; `core/DashboardBroadcaster.js` lines 400-460; the captured diff receipt (69 lines). Ran `git_diff`, `find_definition` (`getSymbolTimeframeContext`, `SymbolTradingContext`), and `grep` for `frameCtx`, `getSnapshot`, `processNewCandle`, `this.ctx.indicatorEngine`, `dashboardTimeframe`, `getRenderPacket`.

WHAT I DID NOT DO: Did not verify boot-time registration completeness for every symbol/timeframe pair that can reach `handleMarketData` (potential undefined-`frameCtx` crash path). Did not trace frontend rendering of the received fields. Did not trace the sibling `DashboardBroadcaster` divergence path.

WHAT I ASSUMED: That the `ctx` passed to CandleProcessor is the bot instance exposing `getSymbolTimeframeContext` (confirmed at `run-empire-v2.js:3147`). That the dashboard message in question is the `type: 'price'` payload built in `handleMarketData` (lines 1095-1177).

WHY THIS VERDICT: The trace is complete and internally consistent — producer (`frameCtx.indicatorEngine.updateCandle` → `getSnapshot`) and consumer (`_buildDashboardIndicators` reading the same `frameCtx.indicatorEngine` snapshot/render packet) are bound to the same per-symbol/per-timeframe context, so no wrong-source or identity mismatch exists. The only unresolved item is a potential crash if an unregistered symbol/timeframe reaches the broadcast; that is a guard gap, not a wrong-source defect, and does not change the answer to where the fields come from.

IF INCOMPLETE, WHY: Not incomplete for the provenance question; the unregistered-symbol crash path and frontend rendering are named as out-of-scope/unread rather than affecting the traced source.
