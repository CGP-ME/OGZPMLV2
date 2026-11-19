I now have a complete trace. Let me compile the findings.

## Answer

The pinned browser indicator module (`public/js/indicators.js`) contains only pure, stateless math functions. None of them plot anything; they return **arrays of values that are index-aligned to the input candle array**. The timestamp and observation-availability retention happens in the three browser consumers, each of which pairs every sample with its input candle's timestamp *strictly by array index* and drops `null` samples.

### The producer-to-series mapping

**Producers (indicators.js) return index-aligned arrays.** Every per-candle indicator returns an array whose length equals the candle count and whose position `i` corresponds to candle `i`:
- `calculateEMA` — `indicators.js:9-16` (seeds `[data[0]]`, then pushes one per candle)
- `calculateSMA` — `indicators.js:18-26` (pushes `null` for `i < period-1`)
- `calculateBollinger` — `indicators.js:28-43` (pushes `null` for `i < period-1`)
- `calculateRSI` — `indicators.js:45-64` (now `Array(data.length).fill(null)`, sets a value only where `movement > 0`)
- `calculateVWAP` — `indicators.js:66-74` (`candles.map(...)`, returns `null` when `cumVol === 0`)
- `calculateATR` — `indicators.js:76-87` (`[tr[0]]` + one push per remaining candle)
- `calculateMACD` — `indicators.js:89-101` (`emaFast.map(...)`, same length)
- `calculateIchimoku` — `indicators.js:103-126` (one push per candle per band)

**Consumers pair each sample with its candle's timestamp by index.** All three plotting paths use the identical helper:
- `public/js/chart.js:710-712`: `const times = candles.map(c => c.time); const mapSeries = (values) => values.map((v, i) => v != null ? { time: times[i], value: v } : null).filter(Boolean);`
- `public/js/panels/chart-panel.js:1726-1728`: identical
- `feedOscIndicatorPanes` (`chart-panel.js:682-686`): identical

So sample `i` is plotted at `times[i]` = `candles[i].time`. **The timestamp is retained by positional index alignment** — a sample's plotted time is exactly the time of the input candle at the same index. This is used for every series: EMA (`chart.js:717-722`), SMA (`725-730`), Bollinger (`733-736`), VWAP (`739-740`), RSI (`743-744`), ATR (`747-748`), MACD (`762-764`), Ichimoku (`767-771`); mirrored in `chart-panel.js:1733-1771` and the oscillator panes (`chart-panel.js:690,693,696-698`).

**Observation availability is retained by null-filtering.** `mapSeries` emits `null` for unavailable samples and drops them via `.filter(Boolean)`. Indicators signal "no observation" with `null` during warmup (SMA/Bollinger before `period-1`, RSI before `period`/flat market, Ichimoku before its lookbacks) and for zero-volume candles (VWAP). Those samples are omitted from the plotted series (gaps). Indicators that never emit `null` (EMA, ATR, MACD) plot a sample at every candle index, including during warmup.

**Non-time-series overlays** are separate: `calculateFibonacci` (`indicators.js:128-142`) and `calculateSupportResistance` (`172-201`) return price-level lists plotted as horizontal `createPriceLine` overlays (`chart.js:774-799`), so they carry no per-sample timestamp by design. `calculateTrendLines` (`indicators.js:144-170`) returns points with explicit `time` read from candles (`indicators.js:151,155,162,167`) and is fed directly (`chart.js:754-758`).

### Baseline comparison — the RSI fix is what makes this sound

The baseline (`7ad023918270f8010cc4878ae4d0d7451bccd1de`) already used the identical index-pairing `mapSeries` (`chart.js:710-712`), but the baseline `calculateRSI` returned an array of length **`data.length - period`** (`[null]` plus pushes for `i = period+1 … data.length-1`, `indicators.js:52-59`). Under index-pairing, baseline RSI samples were therefore shifted left by `period` positions — the first real RSI value (computed from candle `period+1`) was plotted at `times[1]` instead of `times[period+1]`. The current fix (`Array(data.length).fill(null)`, `indicators.js:46`) restores full-length alignment, so every RSI sample now retains its true input-candle timestamp. The diff also changed VWAP to return `null` instead of a fabricated typical price on zero volume (`indicators.js:72`), and corrected the Bollinger warmup window (`indicators.js:31,35`). All three changes move the code toward correctly reporting observation availability rather than inventing values.

### Verification gaps
- **No execution.** This is a read-only source trace; I did not run the browser code. The alignment conclusion is structurally determined by the code (all producers return same-length arrays; consumers pair by index).
- **Candle `time` contract not verified.** The mapping assumes each candle carries a truthy `.time`. If a data source ever omitted it, `times[i]` would be `undefined` and `mapSeries` would emit `{time: undefined, value: v}`. I did not trace the upstream candle data source to confirm `.time` is always present.
- **Legacy dashboard out of scope.** `public/unified-dashboard-legacy.html` has its own inline copies (`calculateRSIOverlay`, `calculateATR`, `calculateMACDOverlay`) using the same index-pairing pattern (`unified-dashboard-legacy.html:3656-3666`), but note its map uses `v ? … : null` (line 3640-3641, 3651-3653), which would drop a literal `0` value — unlike the pinned module's `v != null`. This is a separate implementation, not the pinned module.

---

VERDICT: no_break_found
ADVERSARIAL_REVIEW_BLOCKING: no
CANDIDATE SET: examined 6 of 6. (1) indicators.js producers — all 11 indicators read (EMA/SMA/BB/RSI/VWAP/ATR/MACD/Ichimoku/Fib/TrendLines/S-R); (2) chart.js `calculateIndicators` (705-806); (3) chart-panel.js `calculateIndicators` (1720-1804); (4) `feedOscIndicatorPanes` (673-704); (5) legacy dashboard inline mapping (3640-3680, out of scope); (6) baseline `7ad023…` indicators.js + chart.js via git_show.
AST EVIDENCE: I used grep, find_definition, open_file, and git_show directly; no host AST scan receipts were used. No structure claim here relies on a tool I did not run.
INHERITED: The pinned module inherits its index-alignment contract from the consumers — `mapSeries` assumes every producer returns a same-length array. All 8 per-candle producers satisfy this in current source. The baseline failure of that assumption (RSI shorter array) was repaired in this diff.
FOURTH SHAPE CLASSIFIER: classified 0 of 0 — no new throw/guard/gate/fallback was added by this diff that constitutes a bot-runtime gate; the added `if (initialMovement > 0)` / `if (movement > 0)` guards and `cumVol > 0 ? … : null` fallback are indicator-math correctness guards, not runtime gates.
ALLEGATIONS: The only substantive observation is the baseline RSI index misalignment, which is *fixed* in current source; it is not a current defect. This is established by comparing baseline `indicators.js:52-59` (length `data.length - period`) against current `indicators.js:46` (length `data.length`) under the unchanged index-pairing consumer (`chart.js:712`).
SUBSTANTIVE RESOLUTION: none (no substantive dispute; descriptive question answered).
WHAT I DID: Read full current `public/js/indicators.js` (1-205); read `chart.js:680-820`; read `chart-panel.js:640-820` and `1700-1850`; read `unified-dashboard-legacy.html:3640-3680`; read the captured diff receipt (all 53 lines); read baseline `7ad023…` indicators.js (40-80) and chart.js (700-760) via git_show; grep'd all browser consumers of `calculateRSI/calculateATR/calculateMACD/calculateVWAP/calculateEMA/Indicators.`.
WHAT I DID NOT DO: Did not execute the code (read-only); did not trace upstream candle data source to confirm `.time` is always present; did not read the full chart.js/chart-panel.js files outside the cited windows; did not run tests.
WHAT I ASSUMED: That candles fed to the chart carry a truthy `.time` (the mapping's data-source contract); that TradingView series accept `{time, value}` points with gaps.
WHY THIS VERDICT: The producer-to-series mapping is fully traceable in current source and correctly retains each sample's input-candle timestamp by index alignment and reports observation availability via null-filtering. No current defect found; the diff is a repair of the baseline RSI misalignment and VWAP/RSI availability reporting.
IF INCOMPLETE, WHY: Not incomplete for the structural mapping question; execution and upstream candle-`time` verification remain unperformed and are named above.
