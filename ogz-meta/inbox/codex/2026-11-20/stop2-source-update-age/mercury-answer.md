## Answer

The incoming-candle path determines and reports data age in `CandleProcessor.handleMarketData` (`core/CandleProcessor.js:902-1076`) using a per-event `sourceEventTime`/`sourceEventKind` pair attached by each broker producer, forwarded by `SessionRouter` and the runner's `ohlcHandler`, and classified against `staleDataMaxAgeMs` (120000 ms). The classification is **report-only**: it never gates or rejects the candle — `processNewCandle` runs unconditionally afterwards (`core/CandleProcessor.js:1076`).

### Producers (what each broker emits)

| Broker event | Form/complete/revision | `sourceEventTime` | `sourceEventKind` | Citation |
|---|---|---|---|---|
| Kraken `subscribeToMarketData` | forming (`candleClosed:false`) | `data.priceTimestamp` | `'kraken_candle_update'` | `brokers/KrakenIBrokerAdapter.js:398-407` |
| Kraken `subscribeToOrderBook` WS | forming (`candleClosed:false`) | `data.priceTimestamp` | `'kraken_candle_update'` | `brokers/KrakenIBrokerAdapter.js:463-472` |
| Alpaca minute bar (`T==='b'||'u'`) | completed (`candleClosed:true`); `candleRevision = (T==='u')` | `bar.etime` | `'alpaca_minute_bar'` | `brokers/AlpacaAdapter.js:1196-1200` |
| Alpaca REST refresh (`_emitRequestedClosedBar`) | completed (`candleClosed:true`); `candleRevision = !newClose` | `requestedRefresh.closedThroughMs` | `'alpaca_rest_refresh_trigger'` | `brokers/AlpacaAdapter.js:1244-1255` |

Kraken `priceTimestamp` originates at `kraken_adapter_simple.js:1165` (`priceTimestamp: msg[1][0]`), i.e. the OHLC array's field 0, which the code and changelog identify as the **last-update time** (not candle start): `kraken_adapter_simple.js:1149`, `CHANGELOG.md:1921,1963,1965`. The canonical candle start is derived separately (`kraken_adapter_simple.js:1151`).

### Routing (consumers)

- `SessionRouter._buildOhlcFence` spreads the event object, preserving `sourceEventTime`/`sourceEventKind` (`core/SessionRouter.js:1199-1207`) and calls `onOhlcCallback` → the runner's `ohlcHandler`.
- `ohlcHandler` forwards the two fields into `handleMarketData` (`run-empire-v2.js:994-995`), which delegates to `candleProcessor.handleMarketData` (`run-empire-v2.js:2402-2403`).

### Determination (`core/CandleProcessor.js:947-958`)

```
sourceEventTimeMs = toTimestampMs(wrappedInput?.sourceEventTime)   // 951
sourceEventKind    = cleanScopeValue(wrappedInput?.sourceEventKind) // 952
sourceEventAgeMs   = now - sourceEventTimeMs (or null)              // 953
candleEndAgeMs     = now - candleEndTimeMs                          // 954
sourceEventStatus = isBacktesting ? 'historical_replay'
  : sourceEventTimeMs===null || !sourceEventKind ? 'unavailable'
    : sourceEventAgeMs < 0 ? 'future_timestamp'
      : sourceEventAgeMs > staleDataMaxAgeMs ? 'delayed' : 'on_time' // 955-958
```

`staleDataMaxAgeMs` resolves from `ctx.config.dataFeed` (`_resolveDataFeedConfig`, `core/CandleProcessor.js:306-312`) → `config/internals.json:884` (`"staleDataMaxAgeMs": 120000`), assembled into the config at `foundation/ConfigLoader.js:1206` and `run-empire-v2.js:1313`.

### Reporting (`core/CandleProcessor.js:959-989`)

- Trace `CANDLE_PROCESSOR_RECEIVED` always records `sourceEventTimeMs`, `sourceEventKind`, `sourceEventAgeMs`, `sourceEventStatus`, `candleEndAgeMs`, `receivedAt` (lines 968-973).
- `'unavailable'`/`'future_timestamp'` → `console.error('[DATA UPDATE] ...')` (line 983).
- `'delayed'` → `console.error('[DATA UPDATE DELAYED] ...')` unless `_isExpectedStockMarketQuiet(...)` (lines 984-989; filter at line 657).
- `'on_time'` → no log. Nothing gates processing.

### Per-case behavior

- **Forming bar (Kraken):** `sourceEventTime` = last-update time, which is fresh while updates stream → `'on_time'`, no log. Under a 120 s threshold, multi-minute forming bars stay `on_time` because the timestamp is the latest update, not the interval start.
- **Completed bar (Alpaca minute):** `sourceEventTime = bar.etime` (interval end) ≈ now → `'on_time'`. A genuinely late delivery (>120 s after `etime`) is flagged `delayed`.
- **Revision (Alpaca `'u'`):** same `sourceEventTime = bar.etime`, `candleRevision:true` → `'on_time'` for fresh revisions.
- **REST refresh (Alpaca):** every bar in the batch shares `sourceEventTime = requestedRefresh.closedThroughMs` (the trigger minute-bar boundary), deliberately masking each bar's own age (`brokers/AlpacaAdapter.js:1250-1251`; `core/CandleProcessor.js:949-950`). The true bar age is still captured in the trace as `candleEndAgeMs`, just not used for the status.

### Compared to baseline (5ee82110…)

Baseline used `dataAge = now - candleEndTimeMs` (`core/CandleProcessor.js:44` in the diff). The change swaps the staleness basis to `sourceEventTime`:
- **Alpaca completed bars:** unchanged (both use `etime`).
- **Kraken forming bars:** baseline used the future interval-end (negative age, never stale); new uses last-update time (still `on_time`). No regression.
- **REST refresh:** baseline falsely flagged legitimate historical backfill as `STALE`; new uses the trigger time, fixing that false positive. This is the substantive improvement.

No break was found in the mechanism.

---

## VERDICT: no_break_found

## ADVERSARIAL_REVIEW_BLOCKING: no

**Evidence-to-verdict rationale:** The path is fully traced with literal citations above. The data-age determination and reporting work as designed; the change replaces a candle-end-based staleness signal with a producer-supplied event-time signal, which is more accurate for REST backfill and equivalent for live completed/forming bars. The staleness result is report-only (`core/CandleProcessor.js:1076` shows `processNewCandle` runs unconditionally), so no trading decision is gated by it. No supported defect exists.

---

## CANDIDATE SET: examined 9 of 9 relevant paths

1. `brokers/KrakenIBrokerAdapter.js:398-407` (forming bar producer) — read.
2. `brokers/KrakenIBrokerAdapter.js:463-472` (order-book WS producer) — read.
3. `brokers/AlpacaAdapter.js:1196-1200` (minute-bar producer) — read.
4. `brokers/AlpacaAdapter.js:1244-1255` (REST-refresh producer) — read.
5. `kraken_adapter_simple.js:1140-1172` (`priceTimestamp` source, field-0 semantics) — read.
6. `core/SessionRouter.js:1187-1253` (fence routing) — read.
7. `run-empire-v2.js:865-1010` (`ohlcHandler` forwarding) — read; plus `:2402-2403` delegation.
8. `core/CandleProcessor.js:902-1076` (determination + reporting) — read.
9. Config chain: `foundation/ConfigLoader.js:1206`, `run-empire-v2.js:1313`, `config/internals.json:884` — read.

## AST EVIDENCE

Used `find_references` for `handleMarketData` (callers) and `KrakenAdapterV2` (reachability), and `grep`/`open_file` for the rest. No host-provided AST scan receipts were relied on; whole-file coverage of the four target files was **not** completed (only relevant ranges read).

## INHERITED

- `run-empire-v2.js:1264-1270`: `messageQueue` is instantiated with `onProcess: (data) => this.handleMarketData(data)`, but **no `messageQueue.add(...)` call exists anywhere in current source** (grep found only the instantiation and comments). The `onProcess` path is unwired/dead; it is not a live caller of `handleMarketData`.
- `core/BacktestRunner.js:243-249`: calls `ctx.handleMarketData(...)` without `sourceEventTime`/`sourceEventKind`, but the `isBacktesting` branch (`core/CandleProcessor.js:948,955`) maps these to `'historical_replay'` before the `'unavailable'` check, so no false `unavailable`/`delayed` logs occur in backtest.
- `core/KrakenAdapterV2.js:259` handles OHLC but is **not wired** into the active pipeline (`find_references` shows only docs/specs/audit-script references; the wired Kraken adapter is `brokers/KrakenIBrokerAdapter.js` at `run-empire-v2.js:1041`).

## FOURTH SHAPE CLASSIFIER: classified 2 of 2 added branches

- Added `sourceEventStatus === 'unavailable' || 'future_timestamp'` console-error branch (`core/CandleProcessor.js:982-983`): producer evidence = all four emit sites set both fields; backtest maps to `historical_replay` first → `unavailable` is normally unreachable.
- Added `sourceEventStatus === 'delayed'` console-error branch gated by `_isExpectedStockMarketQuiet` (`core/CandleProcessor.js:984-989`): producer evidence = threshold `staleDataMaxAgeMs` 120000 ms.

## ALLEGATIONS

None asserted by prior reviewers (no prior findings exist). I independently traced the mechanism; the only flagged concern — Kraken field-0 semantics — is resolved in favor of last-update time by internal changelog evidence (`CHANGELOG.md:1921,1963,1965`).

## SUBSTANTIVE RESOLUTION: none

No substantive dispute exists; no prior reviewer conclusions to reconcile.

---

## WHAT I DID
Read all four captured diffs; read the relevant source ranges in `brokers/AlpacaAdapter.js`, `brokers/KrakenIBrokerAdapter.js`, `core/CandleProcessor.js`, `run-empire-v2.js`, `kraken_adapter_simple.js`, `core/SessionRouter.js`, `foundation/ConfigLoader.js`, `config/internals.json`, `config/settings.json`, `core/BacktestRunner.js`; ran `find_references` for `handleMarketData`/`KrakenAdapterV2`; grep for `sourceEventTime`, `sourceEventKind`, `'ohlc'`, `staleDataMaxAgeMs`, `mtfTimeframes`, `candleTimeframe`, `messageQueue`, `MessageQueue`, `priceTimestamp`, `toTimestampMs`, `cleanScopeValue`, `_buildOhlcFence`, `_resolveDataFeedConfig`, `last-update`.

## WHAT I DID NOT DO
- Did not read the four target files in full (only relevant windows); whole-file coverage incomplete.
- Did not execute any code or tests; no test-run receipt exists.
- Could not externally verify the Kraken WS OHLC field-0 contract: `web_fetch` to docs.kraken.com is not allowlisted, and `tavily_search` lacks `TAVILY_API_KEY`. Resolution relies on repo-internal changelog evidence.

## WHAT I ASSUMED
That the config chain `ctx.config.dataFeed.staleDataMaxAgeMs` resolves to 120000 ms at runtime as traced (`foundation/ConfigLoader.js:1206` → `run-empire-v2.js:1313` → `config/internals.json:884`). That backtest mode detection (`getConfigValue('mode.backtest') || this.ctx.config?.enableBacktestMode`) behaves as in baseline (unchanged by this diff).

## WHY THIS VERDICT
The question asks how the path determines/reports data age; I traced producers → routing → determination → reporting with literal citations and found the mechanism coherent and the change behavior-improving, with no supported defect. The `delayed`/`unavailable` classification is report-only and never blocks candle processing.

## IF INCOMPLETE, WHY
Not incomplete for the traced question, but the Kraken field-0 semantics rest on internal changelog testimony rather than a live external protocol check (external fetch blocked), and whole-file reads of the four target files were not performed.
