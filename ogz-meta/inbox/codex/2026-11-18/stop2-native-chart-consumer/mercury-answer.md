## Direct answer

An older broker candle correction (e.g. Alpaca `updatedBars`/`T: u` revisions) is **correctly applied** to the selected dashboard's OHLCV series in both served chart consumers in this snapshot. The corrected candle replaces the matching historical bar (matched by its own native timestamp) and the full candle+volume series is re-rendered via `setData`. Concurrent messages for non-selected symbols/timeframes are filtered out **before** reaching either consumer by the producer-side scope guard in `core.js`, so they cannot contaminate the selected series. VERDICT: **no_break_found** for the OHLCV series handling, with named fragilities/gaps below.

---

## Producer trace (backend → frontend)

The backend producer is `core/CandleProcessor.js`. For every native candle tick (including late corrections), it builds a dashboard candle and broadcasts a `price` message:

- `core/CandleProcessor.js:1126-1136` — `dashboardCandle` carries the *incoming corrected candle's own* `symbol`, `timeframe`, `open/high/low/close`, `volume`, and `timestamp` (= `candle.t`, line 1124). This is the fix documented in `CHANGELOG.md:29` ("an older correction retained its OHLC but borrowed the newest candle's timestamp and envelope volume" → producer now sets `dashboardTimestamp` from the incoming normalized `candle.t`).
- `core/CandleProcessor.js:1138-1177` — the `price` payload includes `symbol`, `asset`, `price`, `close`, `volume`, `timestamp`, `timeframe`, `candle`, and also nests the same object under `data` (lines 1156-1175). Sent at line 1177.
- The `historical_candles` response is a separate top-level envelope `{ type, symbol, timeframe, candles }` (`run-empire-v2.js:2474-2479, 2501-2506`).

## Routing / scope guard (`public/js/core.js`)

- `core.js:36-45` — `selectedMarketPayload(payload, requireTimeframe)`: normalizes symbol (XBT→BTC, `/`→`-`) and requires the payload symbol to equal the selected DOM symbol; when `requireTimeframe` is set, additionally requires `payload.timeframe === selectedFrame` **and** (when a candle is present) `candle.symbol` and `candle.timeframe` to match.
- `core.js:188-204` — the `price` handler unwraps `const data = d.data || d;`, guards with `selectedMarketPayload(data, Boolean(data.candle))` (so any candle-carrying message must match the selected symbol *and* timeframe), then routes only matching messages to `this.get('Chart').update(data)` (line 204). This is the **only** caller of `get('Chart').update` in the repo (grep confirmed).
- `core.js:318-321` — the `historical_candles` handler guards with `selectedMarketPayload(d, true)` before routing to `loadHistorical`.

## Consumer 1 — `public/js/chart.js` (serves `unified-dashboard.html`, v1)

`unified-dashboard.html:3356-3361` loads `core.js`, `websocket.js`, `chart.js`; it does **not** load `chart-panel.js`. `chart.js:1090` registers `'Chart'`, so chart.js is the active consumer in v1.

- `chart.js:885-916` (`update`): `candle = d.candle`; `price = candle ? null : Number(d.price ?? d.close)`. For a candle, `normalizeHistoricalCandle` (lines 143-152) validates geometry and converts ms→s. Then:
  - `chart.js:896-899` — `findIndex(row => row.time >= bar.time)`; if no row → push; if same time → **replace**; else splice into sorted position.
  - `chart.js:900-903` — `older = bar.time < storedCandles[last].time`; when true (an older correction) → `candleSeries.setData(full array)`; else `candleSeries.update(chartBar)`.
  - `chart.js:904-913` — volume series recomputed from the updated `storedCandles`; older correction → `volumeSeries.setData(values)`.
- `chart.js:1021-1064` (`loadHistorical`): maps `message.candles` through `normalizeHistoricalCandle`, rejects nulls, `setData`, sets `storedCandles = formatted`.

## Consumer 2 — `public/js/panels/chart-panel.js` (serves `unified-dashboard-v2.html`, v2)

`unified-dashboard-v2.html:1179` loads `run-frontend-empire-v2.js`, whose module list loads `ChartPanel` (`run-frontend-empire-v2.js:63`); v2 explicitly deletes legacy `chart.js` (`unified-dashboard-v2.html:1091`). `chart-panel.js:2690/2696` registers `'Chart'` → ChartPanel is the active consumer in v2.

- `chart-panel.js:1975-2008` (`update`): identical correction logic (findIndex/replace/splice + `older` → `setData`), preceded by its own `isSelectedAssetPayload(d)` guard (line 1976 → `payloadMatchesSelectedAsset`, lines 198-202, which checks **symbol only**). Also mirrors volume into the osc pane (lines 2005-2006) and recomputes RSI/MACD/ATR panes (lines 2013-2016).
- `chart-panel.js:2125-2168` (`loadHistorical`): double-checks symbol (`isSelectedAssetPayload`) and `requestedTimeframe === cp-timeframeSelector` (line 2130), then sets candle+volume data.

---

## Scope / timestamp / value findings and unread gaps

1. **Scope — correct in the live path.** The candle scope filter is enforced at the producer (`core.js:191`) before either consumer runs. Because it requires the *candle's own* `symbol` and `timeframe` to equal the current selection, an older correction for a non-selected symbol or timeframe is dropped, so concurrent multi-symbol/timeframe traffic cannot write into the selected `storedCandles`.
2. **Scope fragility — chart.js has no internal guard.** `chart.js` `update()`/`loadHistorical()` rely entirely on the `core.js` guard; the only caller is guarded (`core.js:204`), so this is safe today but fragile to future call sites.
3. **Scope asymmetry — ChartPanel checks symbol only.** `chart-panel.js:198-202` (`payloadMatchesSelectedAsset`) matches symbol only; it relies on `core.js`'s timeframe filter. If that upstream filter were bypassed, a same-symbol/different-timeframe candle would be spliced into `storedCandles`. Not an active break in the current flow.
4. **Timestamp — correct.** The producer sends the corrected candle's own `timestamp`/`t` (`CandleProcessor.js:1124, 1134`), and `normalizeHistoricalCandle` uses `candle?.timestamp ?? candle?.t ?? candle?.time`, then converts ms→s. The correction matches the existing bar by this native time; no rebucketing remains (the old `TF_SECONDS`/`currentBucketSeconds` rebucketing was removed in this diff).
5. **Value — OHLCV uses the corrected candle; the *volumeCore indicator text* does not.** The candle and volume series consume `data.candle` (`chart.js:887, 890`; `chart-panel.js:1978, 1981`), i.e. the corrected candle's own volume. Separately, `core.js:213` renders the `volumeCore` readout from `ind.volume` (the indicator packet), which per `CHANGELOG.md:9` reports the *newest retained* candle's volume — a known producer-side distinction, not an OHLCV-series defect.
6. **Indicator inconsistency between consumers.** `chart.js` does not recalc indicator overlays when an older correction arrives (`update()` never calls `calculateIndicators`; only `loadHistorical` does, `chart.js:1064`). `ChartPanel` does recalc (`chart-panel.js:2013-2016`). This affects indicators, not the OHLCV series.
7. **Unread gaps.** I did not read the full 2704-line `chart-panel.js` / 1092-line `chart.js` / 369-line `core.js`; I read the routing, `update`, `loadHistorical`, normalization, registration, and producer/consumer producer sections. I did not read the `historical_candles` consumer path end-to-end in `run-empire-v2.js` beyond the response envelope (lines 2432-2520), nor the full `CandleProcessor.js`/`DashboardBroadcaster.js`. No test-run artifacts were available; all conclusions are static source trace.

---

VERDICT: no_break_found
ADVERSARIAL_REVIEW_BLOCKING: no
CANDIDATE SET: examined 8 of 8 — `public/js/chart.js`, `public/js/core.js`, `public/js/panels/chart-panel.js`, `public/js/run-frontend-empire-v2.js`, `public/js/websocket.js`, `public/unified-dashboard.html`, `public/unified-dashboard-v2.html`, `core/CandleProcessor.js`, `core/WebSocketManager.js`, `run-empire-v2.js`, `CHANGELOG.md`.
AST EVIDENCE: I used `grep`/`regex_grep`/`open_file`/`read_review_receipt`; no AST/serena tool run was performed for structure claims — the caller/registration claims above rest on literal grep hits (`get('Chart').update` → only `core.js:204`; `register('Chart'` → `chart.js:1090` and `chart-panel.js:2690/2696`) plus the HTML load lists.
INHERITED: `chart.js` inherits its scope safety entirely from `core.js`'s guard; `ChartPanel` inherits timeframe filtering from `core.js` (its own check is symbol-only). No silent-default or swallowed-error path was found in the traced scope guards.
FOURTH SHAPE CLASSIFIER: classified 0 of 0 added throws/guards/gates (the traced guards are pre-existing routing filters, not new bot gates).
ALLEGATIONS: none asserted; I traced the correction path and found correct OHLCV handling.
SUBSTANTIVE RESOLUTION: none
WHAT I DID: read the captured diffs for `chart.js`/`core.js`/`chart-panel.js`; read current source of `core.js` (1-368), `chart.js` (880-1091), `chart-panel.js` (170-260, 1975-2200, 2620-2704), `websocket.js` (440-540), `run-frontend-empire-v2.js` (1-330), `CandleProcessor.js` (1080-1200), `DashboardBroadcaster.js` (1-200), `WebSocketManager.js` (300-360), `run-empire-v2.js` (2432-2520), `CHANGELOG.md` (1-40); grepped for producer/consumer/registration wiring.
WHAT I DID NOT DO: did not read the full bodies of the large files; did not run or execute any code; no test receipts existed; did not trace the `historical_candles` fetch internals beyond the response envelope.
WHAT I ASSUMED: that the DOM selectors (`cp-assetSelector`/`assetSelector`, `cp-timeframeSelector`/`timeframeSelector`) are populated with values matching the producer's normalized symbol/timeframe strings at message time; that lightweight-charts `setData`/`update` semantics are standard.
WHY THIS VERDICT: both consumers replace/insert the older corrected candle by its native time and re-render via `setData`, and the `core.js` guard (symbol+timeframe, including candle-level fields) prevents multi-symbol/timeframe contamination, so the OHLCV series is not corrupted by the correction scenario.
IF INCOMPLETE, WHY: whole-file coverage is not complete (read ranges named above), and no runtime/execution receipt was available to observe the behavior live.
