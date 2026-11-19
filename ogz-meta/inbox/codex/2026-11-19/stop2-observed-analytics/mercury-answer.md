## VERDICT: no_break_found

## Direct answer

The CVD value displayed for the selected asset is owned entirely by the Kraken market-data feed (`core/CryptoMarketFeed.js`), relayed verbatim by the SSL server as `cvd_update` frames, and rendered by the self-rendering Edge Analytics Panel (`public/js/panels/edge-analytics-panel.js`) scoped to the selected asset. No other source feeds the live dashboard's CVD display.

## Full trace (receipt of market data → dashboard rendering)

### 1. Producer — the CVD value is accumulated in `CryptoMarketFeed.js`
- Per-asset cumulative state: `const cvd = new Map(); // asset -> { value, buyVolume, sellVolume, lastEmitValue, lastEmitAt }` — `core/CryptoMarketFeed.js:73`.
- State is lazily created with `value: 0` and `windowStartedAt: Date.now()` — `core/CryptoMarketFeed.js:82-85`.
- `handleTrades(asset, rows)` (lines 163-214) parses Kraken `trade` channel rows: price/qty/side/observedAt (lines 167-171), validates finiteness (lines 172-180), then accumulates the **taker-side notional delta**: `state.value += notional` for buyer-aggressor, `state.value -= notional` for seller-aggressor (lines 182-188).
- Emission is throttled to `feedConfig.emitIntervalMs` (line 197) and the frame carries `cvdValue: state.value`, `cvdTrend`, `buyVolume`, `sellVolume`, and `windowStartedAt: state.windowStartedAt` — lines 204-212.

**Observation window:** the value is a cumulative accumulator for the life of the feed connection. It resets only on (a) reconnect open — `cvd.clear()` at `core/CryptoMarketFeed.js:264` — or (b) invalid trade data — `cvd.delete(asset)` at line 175. It is **not** bounded by `tradeWindowMs` (300,000 ms), which is used only for the internals buy/sell-ratio filter (line 145). This matches the producer's own contract comment (lines 27-29) and the panel's tooltip (see below).

### 2. Server relay — `ogzprime-ssl-server.js`
- The feed is wired with `feedConfig: dashboardRuntimeConfig.dashboard.cryptoMarketFeed` — `ogzprime-ssl-server.js:2290`; callbacks at lines 2288-2348.
- `onCvd: (frame) => broadcastCryptoFrame({ type: 'cvd_update', ...frame })` — `ogzprime-ssl-server.js:2344`.
- `broadcastCryptoFrame` sends to authenticated `dashboard` clients only — lines 2272-2286.

### 3. Config — `config/internals.json` + `ConfigLoader.js`
- `dashboard.cryptoMarketFeed` block: `emitIntervalMs: 1000`, `cvdTrendDeltaThresholdUsd: 1`, `tradeWindowMs: 300000`, `pairBySymbol` (BTC/ETH/SOL) — `config/internals.json:1130-1152`.
- Validated by `foundation/ConfigLoader.js:1505-1539` (positive integers, non-negative numbers, URL, pair mapping).

### 4. Frontend — Edge Analytics Panel renders the feed-owned value
- The panel subscribes to `cvd_update`: `subscribe(socket, 'cvd_update', onCVDUpdate)` — `public/js/panels/edge-analytics-panel.js:399`.
- WebSocket dispatch routes frames by `data.type` to registered handlers — `public/js/websocket.js:444-445`; `cvd_update` is an allowed dashboard frame type (line 40).
- Selected-asset scoping: `frameMatchesSelectedAsset` requires `data.asset === selected`, where `selected` comes from `#cp-assetSelector`/`#assetSelector` — `edge-analytics-panel.js:196-204`.
- `onCVDUpdate` (lines 206-272) only renders when `data.source === 'kraken_trade' && data.unit === 'USD' && data.status === 'ok' && Number.isFinite(data.cvdValue)` — lines 212-213. It renders `Number(data.cvdValue).toFixed(0)` into `#cvdValue` (line 234) and tracks window resets via `data.windowStartedAt` (lines 221-226). Tooltip: "resets on reconnect or invalid trade data" (line 227).
- The panel is mounted in the v2 dashboard (`public/unified-dashboard-v2.html:1004`, loaded at line 1172; registered in `public/js/run-frontend-empire-v2.js:64`) and also drives the v1 dashboard's static `#cvdValue` element (`public/unified-dashboard.html:2746`) because v1 exposes `#edgePanel` and the panel's `init()` proceeds when that exists (`edge-analytics-panel.js:391`).

## Candidate set (examined 4 of 4)

| Candidate | Evidence | Outcome |
|---|---|---|
| **A. Feed-derived TRUE taker-side CVD** (CryptoMarketFeed → server `cvd_update` → panel) | Chain above | **SUPPORTED** — this is what is displayed |
| **B. Candle-derived CVD reaching the dashboard** (DashboardBroadcaster / SmartMoneySweep / CandleProcessor) | `core/DashboardBroadcaster.js:2-6` states trade flow belongs to the feed; `broadcastEdgeAnalytics` emits only `type: 'divergence'` frames (lines 130-136). `modules/SmartMoneySweep.js:582-614` computes an internal CVD for divergence signals but never emits `cvd_update`. The only `cvd_update` emitter in the tree is `ogzprime-ssl-server.js:2344` | **REFUTED** — no candle-derived CVD reaches the display |
| **C. Legacy inline CVD** (`public/unified-dashboard-legacy.html:5195-5283`, candle proxy `cvd || (buyVolume - sellVolume)`) | Not among the current review targets; separate legacy file, not the live dashboard | **EXCLUDED** |
| **D. v1 static `#cvdValue` populated by something other than the panel** | Only writer to `#cvdValue` in the live dashboards is `onCVDUpdate`; v1 has no other CVD JS (grep of `public/unified-dashboard.html` shows only CSS + static markup) | **REFUTED** |

## Named verification gaps
- I could not execute the runtime, so there is **no host-attested receipt** showing an observed on-screen CVD value end-to-end; the trace is source-derived. The producer's `cvdValue` is the only value path to `#cvdValue`.
- The panel's `frameMatchesSelectedAsset` does a raw `asset === selected` string comparison without normalization (line 202). The feed emits `asset` via `symbolForKrakenPair` (uppercase, XBT→BTC, `/`→`-`, e.g. `BTC-USD`). If the selector ever returns a differently-formatted value (e.g. `BTC/USD`), the panel would refuse to render. I could not verify the live selector value format without runtime evidence; this is a fragility, not a demonstrated break.
- Historical note: `ogz-meta/RUNNING-TODO.md:108` ("current CVD in edgeAnalytics is derived, not true order flow") is superseded by the current tree — the panel now strictly requires `source === 'kraken_trade'` and resets on window changes (added in the captured diff, `edge-analytics-panel.js` current lines 212-226).

## ADVERSARIAL_REVIEW_BLOCKING: no

## CANDIDATE SET: examined 4 of 4 (enumerated above)

## AST EVIDENCE
I used direct source reads, `grep`, and `read_review_receipt` (captured diffs for `CryptoMarketFeed.js`, `edge-analytics-panel.js`, `ConfigLoader.js`, `internals.json`). I did **not** rely on the supplied non-authoritative AST/blast-radius scan artifacts for any structure claim; all call/consumer claims are backed by literal source lines read this run.

## INHERITED
No inherited fallback, swallowed-error, environment-bypass, or silent-default behavior is relevant to the CVD display. The feed's `onCvd` emits an honest `status: 'unavailable'` frame on disconnect (lines 281-282) and on invalid data (lines 177-178), and the panel clears to `--` on non-`ok` status — no fabricated value is shown.

## FOURTH SHAPE CLASSIFIER
Added guards in this review (from captured diffs): feed-side invalid-trade guard clearing the window (`CryptoMarketFeed.js:172-180`), reconnect `cvd.clear()` (line 264), disconnect `unavailable` broadcast (lines 281-282), and panel-side strict `kraken_trade`/`USD`/`ok` validation with window-reset tracking (`edge-analytics-panel.js:212-226`). All are producer/consumer data-integrity guards, not new bot gates.

## ALLEGATIONS
None — I found no defect in the ownership chain. The trace is coherent, internally consistent, and the only path to the displayed CVD value is the feed-owned `cvdValue`.

## SUBSTANTIVE RESOLUTION: none

## WHAT I DID
Read `core/CryptoMarketFeed.js` (1-323), `ogzprime-ssl-server.js` (2250-2360), `config/internals.json` (1130-1175), `public/js/panels/edge-analytics-panel.js` (1-458), `public/js/websocket.js` (1-300, 440-542), `public/js/core.js` (1-100), `public/js/run-frontend-empire-v2.js` (40-90), `core/DashboardBroadcaster.js` (1-197), `public/unified-dashboard.html` (2735-2765); grepped `CVD`/`cvd`/`cvd_update`/`cvdValue`/`edgeAnalyticsPanel`/`edgePanel`/`cryptoMarketFeed`/`edge-analytics-panel.js`; read captured diffs for `CryptoMarketFeed.js`, `edge-analytics-panel.js`, `ConfigLoader.js`, `internals.json`.

## WHAT I DID NOT DO
Did not read `foundation/ConfigLoader.js` in full (only the relevant 1505-1539 validation window), did not read `modules/SmartMoneySweep.js` CVD internals beyond the grep hits, did not execute the runtime or run any tests, did not verify the live selector value format against the feed's asset string.

## WHAT I ASSUMED
That the live dashboards are the v1/v2 `unified-dashboard*.html` files in the target set (the legacy `unified-dashboard-legacy.html` is treated as non-live). Assumed `dashboardRuntimeConfig` resolves from `internals.json` via ConfigLoader (consistent with `ConfigLoader.js:1505-1539` and `ogzprime-ssl-server.js:2290`).

## WHY THIS VERDICT
The displayed CVD value has a single, fully traced owner: `CryptoMarketFeed`'s cumulative taker-side notional delta, relayed as `cvd_update` and rendered by the Edge Analytics Panel scoped to the selected asset. Competing candle-derived and legacy paths are refuted or excluded by source evidence. No break in the chain was demonstrated; the only open item is a runtime-level formatting-fragility note, which is a verification gap, not a supported defect.

## IF INCOMPLETE, WHY
Not incomplete for the ownership question. Remaining gaps are runtime-format verification (selector value) and absence of a host-attested end-to-end execution receipt, neither of which changes the source-derived ownership conclusion.
