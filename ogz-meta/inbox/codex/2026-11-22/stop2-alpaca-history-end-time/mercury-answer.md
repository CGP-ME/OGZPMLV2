## Answer

The candle-end timestamp (`etime`) that reaches gap recovery from Alpaca native REST history is **the Alpaca REST bar‑open timestamp plus the interval of the configured timeframe**:

```
etime = new Date(bar.t).getTime() + _timeframeIntervalMs(timeframe)
```

This is produced in `AlpacaAdapter.getCandles` and flows to two distinct gap-recovery consumers: the internal requested-bar refresh inside `AlpacaAdapter` and the external `CandleProcessor.attemptBackfill` / `handleBackfillSuccess` path.

### Producer (timestamp creation)

`brokers/AlpacaAdapter.js:667` — `const intervalMs = this._timeframeIntervalMs(timeframe);`
`brokers/AlpacaAdapter.js:699-700` — `t: new Date(bar.t).getTime()` and `etime: new Date(bar.t).getTime() + intervalMs`

`_timeframeIntervalMs` maps the configured timeframe to ms:
`brokers/AlpacaAdapter.js:1001-1016` — `'1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '4h': 14400000, '1d': 86400000`, and throws on an unsupported timeframe. `_mapTimeframe` (`:993-999`) supports the identical set, so the query granularity and the etime interval use the same configured timeframe.

### Consumer 1 — internal requested-bar gap recovery (`_emitRequestedClosedBar`)

- `brokers/AlpacaAdapter.js:1222` — `this.getCandles(symbol, frameState.timeframe, fetchCount)` (frameState.timeframe = configured timeframe).
- `brokers/AlpacaAdapter.js:1233-1236` — `requestedBar = { ...candle, symbol }`. The diff removed the explicit `etime: startMs + requestedIntervalMs`; the value now arrives via the object spread from `candle.etime`.
- `brokers/AlpacaAdapter.js:1242` — `priceTimestamp: requestedBar.etime`.
- The guard `brokers/AlpacaAdapter.js:1227,1229` uses `startMs + requestedIntervalMs`, where `requestedIntervalMs = _timeframeIntervalMs(frameState.timeframe)` (`:1220`); this exactly equals `candle.etime` because `getCandles` was invoked with the same `frameState.timeframe`. So the removed line and the spread produce the identical value.

### Consumer 2 — external CandleProcessor gap recovery

- `core/CandleProcessor.js:743` — `broker.getCandles(symbol, timeframe, fetchCount)` with `timeframe = cleanScopeValue(traceContext.timeframe)` (`:710`, configured timeframe).
- `core/CandleProcessor.js:754` — `normalizeOhlc(c)` maps `etime` → array index `[1]` (`foundation/ohlc-normalize.js:101`).
- `core/CandleProcessor.js:766-767` — `const et = arr[1] != null ? arr[1] : arr[0]; return et > gapStart && et <= gapEnd;` — the gap filter uses the candle-end timestamp.
- `core/CandleProcessor.js:896` — `etime: arr[1] != null ? arr[1] : arr[0]` in `handleBackfillSuccess`, then `processNewCandle` (`:911`).

### Behavioral effect of the diff

Before the change, Alpaca `getCandles` did **not** emit `etime`, so `normalizeOhlc` fell back to the bar-open time for `arr[1]` (`foundation/ohlc-normalize.js:101`: `input.etime != null ? … : tMs`). External gap recovery therefore filtered on bar-*open* times. After the change, `etime = t + interval` is emitted, so `attemptBackfill`/`handleBackfillSuccess` now filter and dedupe on bar-*close* times. The internal `_emitRequestedClosedBar` path value is unchanged (same arithmetic, moved from consumer to producer).

### Unverified behavior

1. **External API assumption**: that Alpaca's REST `t` field is exactly the bar-open boundary, so `t + interval` equals the true bar-close instant. This is a broker-API convention, not provable from source, and no execution/test receipt was supplied to observe actual runtime output.
2. **Stale comments**: `core/CandleProcessor.js:764` and `:893` state "etime not always set (e.g., Alpaca normalized)" — now inaccurate for Alpaca (always set), but harmless because the `arr[1] != null ? arr[1] : arr[0]` fallback remains correct.
3. **`_mapTimeframe` fallback vs `_timeframeIntervalMs` throw**: for a timeframe outside the standard set, `_timeframeIntervalMs` throws (fail-fast) rather than matching `_mapTimeframe`'s `mappedTimeframeFallback`. This is consistent for the configured timeframes in the standard set; a non-standard configured timeframe would fail loudly rather than silently mis-time.

No break found in the traced path. The change is internally value-preserving and externally additive (proper close-time filtering).

---

VERDICT: no_break_found
ADVERSARIAL_REVIEW_BLOCKING: no

CANDIDATE SET: examined 6 of 6 — (1) producer `AlpacaAdapter.js:667,699-700`; (2) internal consumer `_emitRequestedClosedBar` `AlpacaAdapter.js:1222,1233-1236,1242`; (3) external consumer `CandleProcessor.attemptBackfill` `CandleProcessor.js:743,754,766-767`; (4) `handleBackfillSuccess` `CandleProcessor.js:896,911`; (5) normalizer `ohlc-normalize.js:101`; (6) diff artifact `captured-diff:5727…` (removed `etime` line). Stream path `AlpacaAdapter.js:1182` examined and excluded (real-time, not REST history).

AST EVIDENCE: used `find_definition` (both helpers), `find_references` (getCandles, 68 matches reviewed; only `AlpacaAdapter.js:1222` is the in-adapter consumer, `CandleProcessor.js:743` the external gap-recovery consumer), `serena_blast_radius` (reports "isolated / 0 callers" because the adapter is dynamically loaded as active broker — not authoritative for consumer counts), and `open_file` for exact line reads of all cited ranges.

INHERITED: `AlpacaAdapter.js` — `_timeframeIntervalMs` throws on unsupported timeframe (`:1012-1014`) rather than silently defaulting; `_mapTimeframe` has a config fallback `mappedTimeframeFallback` (`:998`) that is not mirrored in `_timeframeIntervalMs`. `CandleProcessor.js` — normalization/backfill swallows failures by returning `[]` (`:700,707,713,719,730,734,747,759,778`); gap-filter fallback to `arr[0]` when `arr[1]` is null (`:766,896`).

FOURTH SHAPE CLASSIFIER: classified 1 of 1 added guard — `_timeframeIntervalMs` validate/throw (`AlpacaAdapter.js:1012-1014`, pre-existing, not added by this diff). No new throw/guard/gate added by the diff itself.

ALLEGATIONS: none asserted by prior reviewers; this is an independent trace. The only change is moving etime computation from the requested-bar consumer into `getCandles` and adding it to the REST response shape.

SUBSTANTIVE RESOLUTION: none

WHAT I DID: read the captured diff receipt (29 lines); read `AlpacaAdapter.js` ranges 640-760, 985-1040, 1140-1205, 1180-1298; read `CandleProcessor.js` ranges 670-800, 430-530, 860-960; read `ohlc-normalize.js` 70-113; ran `find_definition`, `find_references`, `serena_blast_radius`, and `regex_grep` for `etime`/`normalizeOhlc`/`getCandles`; verified value equivalence of the removed `etime` line vs the producer's new `etime` field.

WHAT I DID NOT DO: did not execute any program or test; no trusted-path execution receipt exists to confirm runtime output. Did not read the full 1299-line `AlpacaAdapter.js` or full 1243-line `CandleProcessor.js` outside the cited ranges.

WHAT I ASSUMED: that the configured timeframe passed to `getCandles` is the same string used by `_timeframeIntervalMs` and `_mapTimeframe` (verified at `AlpacaAdapter.js:1222` and `CandleProcessor.js:710`); that Alpaca REST `t` is the bar-open timestamp (external API convention).

WHY THIS VERDICT: the etime reaching both gap-recovery consumers is fully traceable to `AlpacaAdapter.js:700` (`t + _timeframeIntervalMs(timeframe)`), the internal consumer's removed explicit `etime` is exactly reproduced by the spread (`:1233-1236`), and the external consumer now receives a proper close-time instead of the previous open-time fallback — no defect found, only an external-API assumption and stale comments flagged.

IF INCOMPLETE, WHY: not incomplete for the traced path; the only unverifiable element is the external Alpaca bar-timestamp convention (no execution receipt).
