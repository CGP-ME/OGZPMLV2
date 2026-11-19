I now have a complete trace of the data flow in both dashboards. Let me compile my findings.

## Answer

**When a selected native candle is added or revised, the visible chart indicators in BOTH served dashboards are recalculated from the complete `storedCandles` array — the full stored history *after* the incoming candle has been inserted (new) or replaced (revised).** The indicator overlays do not consume a separate/dedicated data store; they are recomputed on demand from `storedCandles` on each candle event.

### The two served dashboards
1. **`public/unified-dashboard.html`** (legacy) loads `/js/chart.js` — `public/unified-dashboard.html:3361`.
2. **`public/unified-dashboard-v2.html`** loads `/js/panels/chart-panel.js` — `public/unified-dashboard-v2.html:1171` (plus `core.js` at :1085 and `websocket.js` at :1089).

Both receive native-candle ticks through the same dispatch: `core.js`'s `'price'` handler filters with `selectedMarketPayload` (`public/js/core.js:191`, def at :36-45) then calls `this.get('Chart').update(data)` (`public/js/core.js:204`). On dashboard 1 `OGZ.get('Chart')` resolves to the chart.js module; on dashboard 2 it resolves to `ChartPanel`, which dual-registers as both `'ChartPanel'` and `'Chart'` (`public/js/panels/chart-panel.js:2677-2686`). `ChartPanel` does not subscribe to `'price'` itself (only `'trade'`/`'state_update'`, :1257, :1275), so it relies on the core.js dispatch.

### The add/revise producer → indicator consumer path
**chart.js (dashboard 1) — `update()`:**
- `public/js/chart.js:911-921` — if `d.candle` present, normalize and mutate `storedCandles` (push if new, replace if same time, splice if out-of-order).
- `public/js/chart.js:938` — `if (activeOverlays.length > 0) this.calculateIndicators(storedCandles);` — passes the **post-mutation** `storedCandles`.
- `calculateIndicators` (`public/js/chart.js:705-806`) recomputes EMA/SMA/Bollinger/VWAP/RSI/ATR/MACD/Ichimoku from the full array; trendlines/fibonacci/S-R are gated by `activeOverlays` (:751, :774, :788).

**chart-panel.js (dashboard 2) — `update()`:**
- `public/js/panels/chart-panel.js:1976-1986` — same `storedCandles` mutation.
- `public/js/panels/chart-panel.js:2004-2005` — `if (activeOverlays.length > 0) this.calculateIndicators(storedCandles); else feedOscIndicatorPanes(storedCandles);`
- `calculateIndicators` (`public/js/panels/chart-panel.js:1720-1804`) recomputes the main-chart overlays and internally feeds the oscillator panes via `feedOscIndicatorPanes(candles)` at :1755. `feedOscIndicatorPanes` (`public/js/panels/chart-panel.js:673-704`) computes RSI/MACD/ATR from the passed `candles` array.

### Candidate inventory (what data the visible indicators use)
| Candidate | Verdict | Evidence |
|---|---|---|
| Full `storedCandles` array (post-mutation) | **Supported** | chart.js:938 passes `storedCandles`; chart-panel.js:2004 passes `storedCandles`; both `calculateIndicators` compute over the entire array (chart.js:710-711; chart-panel.js:1726-1727) |
| Only the newest/revised candle bar | Refuted | `calculateIndicators` receives the whole array, not `bar`; EMA(200)/SMA(200)/VWAP need full history |
| Separate dedicated indicator data store | Refuted | No such store exists; indicators are derived from `storedCandles` on every call (chart.js:705; chart-panel.js:1720) |
| Displayed `candleSeries` data | Equivalent source | `candleSeries` itself is populated from `storedCandles` (chart.js:924-925; chart-panel.js:1989-1990), so the indicator source and candle source are the same array |

Both add and revise paths reach the recalculation because the call sits inside the `if (candle)` block after the `storedCandles` mutation, regardless of `older`/newer (chart.js:918-938; chart-panel.js:1983-2005).

### What changed vs. baseline
- Baseline chart.js `update()` had **no** per-tick indicator recalculation (`git_show` baseline chart.js:905-916 ends the candle block without a `calculateIndicators` call). The change adds it at chart.js:938 — previously dashboard 1's indicators only refreshed on history load/toggle.
- Baseline chart-panel.js fed only the oscillator panes on tick (baseline chart-panel.js:2010-2016). The change broadens this to a full `calculateIndicators` recompute whenever any overlay is active (chart-panel.js:2004-2005), with `feedOscIndicatorPanes` preserved as the no-overlay fallback.

### Verification gaps / named limits
- **No runtime receipt**: I performed static source tracing only; there is no host-attested execution showing actual indicator output. The data-flow conclusion is source-derived, not observed.
- **Guard**: both `calculateIndicators` return early when `candles.length < MIN_INDICATOR_CANDLES` (30) (chart.js:706; chart-panel.js:1721). Under 30 stored candles, no per-tick indicator refresh occurs — pre-existing, consistent with the load path.
- **Performance**: a full recompute of every overlay runs per candle tick when any overlay is active (chart.js:938; chart-panel.js:2004). This is a cost change, not a data-correctness issue.
- Selection filtering is applied upstream (core.js:191) and again in ChartPanel (chart-panel.js:1972), so only the selected asset's candles trigger recalculation.

---

**VERDICT: no_break_found**

**ADVERSARIAL_REVIEW_BLOCKING: no**

**CANDIDATE SET: examined 4 of 4** (full storedCandles array; only-newest-bar; dedicated indicator store; displayed candleSeries source). All candidate data sources enumerated; the supported one is the full `storedCandles` array.

**AST EVIDENCE**: I used `regex_grep`, `open_file`, `list_files`, `read_review_receipt`, and `git_show` (baseline `0c12f435…`). I did not run `serena_*` tools this round; structural claims here (call sites, registration) are backed by direct source reads and grep, not by an AST scan receipt.

**INHERITED**: The `else feedOscIndicatorPanes` branch (chart-panel.js:2005) is effective no-op when no oscillator pane exists (feedOscIndicatorPanes returns early at :678), so no error is swallowed and no stale data is rendered. `_clearIndicatorData()` (chart-panel.js:1820-1833; chart.js:819-828) silently clears all indicator series before load repopulation; if `series` is null it is skipped (guard at :1826/:825) — no silent data loss because `calculateIndicators`/`feedOscIndicatorPanes` immediately refill.

**FOURTH SHAPE CLASSIFIER**: classified 2 of 2 added guards. `if (activeOverlays.length > 0)` (chart.js:938; chart-panel.js:2004) is a producer gate: it only runs recalculation when at least one overlay is selected. The `else feedOscIndicatorPanes` (chart-panel.js:2005) is the fallback path. Neither is a bot-runtime gate.

**ALLEGATIONS**: No prior reviewer findings exist for this question (empty prior receipts). I found no defect: the indicators consume the post-mutation `storedCandles` in both dashboards, which is the correct, fresh data source.

**SUBSTANTIVE RESOLUTION: none** (no substantive dispute exists; no prior claims to reconcile).

**WHAT I DID**: Read both captured diffs (chart.js 91 lines; chart-panel.js 161 lines); read chart.js source lines 1-120, 640-960, 878-1116; read chart-panel.js source lines 190-240, 660-760, 1240-1280, 1700-1860, 1960-2060, 2140-2180, 2620-2693; read core.js 30-80 and 180-230; read both dashboard HTML script tags; grepped for `calculateIndicators`, `storedCandles`, `activeOverlays`, `isSelectedAssetPayload`, `payloadMatchesSelectedAsset`, `registerHandler`, `selectedMarketPayload`, and chart script includes; verified baseline via `git_show` for both update paths.

**WHAT I DID NOT DO**: Did not run the code or any test suite (no host-attested receipt); did not read the full 1115-line chart.js / 2692-line chart-panel.js (only the regions relevant to the update/load/toggle/feed flow); did not use `serena_*` AST tools.

**WHAT I ASSUMED**: That "the two served dashboards" are `unified-dashboard.html` (chart.js) and `unified-dashboard-v2.html` (chart-panel.js), as established by the HTML script-include evidence; that "a selected native candle" is the `d.candle` payload for the selected asset/timeframe arriving via the websocket price handler.

**WHY THIS VERDICT**: Both dashboards' visible indicators are recomputed from the full `storedCandles` array after the incoming native candle is inserted/revised (chart.js:918-938; chart-panel.js:1983-2005). The data source is fresh and complete; no stale, partial, or dedicated-store path exists. The change is a correctness improvement over the baseline (which did not refresh dashboard-1 indicators on ticks and only fed oscillator panes on dashboard 2).

**IF INCOMPLETE, WHY**: Not incomplete for the data-flow question; the only residual gap is the absence of a runtime/execution receipt, which does not change the unambiguous source-derived answer.
