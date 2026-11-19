# Stop 2: browser indicator sample alignment — 2026-11-19

The production browser indicator producer returned RSI values at the wrong array indexes. The consumers pair samples with candle timestamps by index, so RSI appeared 14 candles early. Bollinger windows omitted their current candle, and VWAP invented a typical price before any observed volume.

The repair is limited to `public/js/indicators.js` and its cache versions in the two supported dashboard pages. RSI preserves full candle-array length, including null warmup; directional runs retain valid zero/100 values, and no-movement RSI remains unavailable. Bollinger includes the current candle. VWAP remains unavailable until positive cumulative volume exists. No trading indicators, entry rules, or PM2 state changed.

## Evidence

- `baseline.json` and `candidate.json`: actual browser library executed against hand-calculated Wilder RSI, rolling Bollinger windows and volume-weighted examples in isolation. Baseline demonstrates the defects; candidate matches those calculations.
- `chart-integration.json`: actual chart history/update/clear methods, core/socket routing and the candidate indicator library exercised inside the isolated launcher. Both chart implementations track native updates/revisions and clear stale series. Synthetic series boundary is explicitly separate from browser rendering.
- `served-browser.json`, `browser-summary.json`, `served-v2.png`, `served-legacy.png`: public pages loaded the versioned candidate at 15:14–15:17 UTC. TSLA native candles and rendered RSI end on identical timestamps (1795101240 for V2, 1795101360 for the other page); overlays advance with new native candles. No JavaScript page exceptions or trade/control commands. Screenshots contain only the chart.
- `source-identity.json`, `review-command.json`, `mercury-answer.md`, `review.json`: independent Mercury source review of candidate a5aecb230024e480bbdad61a0d2006fa3094aa8e against cfff7b164b80756353b7dab982a77f5664db14d6. No break found; 16 tool calls, $0.022746. Metadata warnings and unselected peers are retained. Mercury did not execute; the separate behavior receipts provide that evidence. RAG freshness is not claimed.

## Limits and verification corrections

Three HTTP 401 responses on each page came from the absent portal session; this proof covers authenticated market WebSocket/chart behavior, not all portal endpoints. The separate inline `unified-dashboard-legacy.html` implementation named by Mercury is not one of the two supported pages verified here; its zero-filter issue is not claimed repaired. The outstanding crypto-history broker ownership repair requires separate backend activation. Dashboard order-flow authenticity is a separate open repair.

An initial integration invocation omitted explicit fixture arguments for inbox files and was corrected. An initial browser screenshot selector did not exist in V2; the selector was corrected and both pages were observed again. These were verification-harness failures, not hidden runtime success. No Jest suite was added or run. No PM2 restart occurred. Fresh browser loads serve these static bytes immediately.
