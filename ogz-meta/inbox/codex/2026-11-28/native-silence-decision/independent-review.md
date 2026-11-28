# Independent native-silence decision review

Reviewer: `/root/mercury_budget_review`. The parent verified its complete retained alignment and full refresh of changed doctrine, Mercury instructions and current context before releasing this task. This is a collaboration review, not an impersonation of a provider-attested Mercury or Astra API seat.

**VERDICT: `no_break_found`** for candidate tree `aade4a6abca84e98d95a0c3262668c80685658c3`, compared with baseline commit `7d6da528199c9b9a005150ea2aba977a277a8041` (baseline tree `78a8a73079f6164d461cb6f6f2da9076a56ce402`).

The reviewer found no supported candidate defect within the native-feed watchdog quarantine question. It read the neutral question, independently inspected both production diff hunks and relevant ranges in eleven dependency files from the pinned Git tree, and then read the complete host behavior receipt and added fixture. It did not read current or prior Mercury answers, run helpers or paid calls, edit files or operate PM2.

## Findings and counterevidence

- `run-empire-v2.js:3128-3135`: silent frames are computed before verification. Fresh native input does not trigger a verification request. The host fixture observed zero watchdog range requests with fresh input and a REST implementation that would fail.
- `run-empire-v2.js:2883-2913`: matching complete coverage, valid candles and the known anchor are required. Only newer mature provider bars establish missed delivery. A complete quiet interval returns `verified_quiet`. The inspected Alpaca path exhausts pages and requires the anchor (`brokers/AlpacaAdapter.js:663-735`); Kraken checks the anchor and provider cursor (`kraken_adapter_simple.js:318-392`).
- `run-empire-v2.js:3140-3161`: failed verification retains `confirmed:false`, `status:unverified`. Protection follows only after native input is overdue. This is the supplied operator policy; it does not fabricate proof of a missing bar.
- `run-empire-v2.js:2898,3121-3125,3143,3150-3153`: resumed native delivery and retired broker/epoch scope discard the suspicion. The final marker check covers failures and delivery during another frame's query.
- `run-empire-v2.js:3108-3142`: only sustained `UNHEALTHY`/`DEAD` transport status confirms disconnection; an overdue frame remains necessary. Inspected health producers label message-age staleness `DEGRADED`.
- `core/CandleProcessor.js:1089-1104`: native ingress preserves maximum event time and candle start within one owner, including same-clock batches and older revisions. A new broker/account/epoch replaces ownership.
- `run-empire-v2.js:1701-1764`: the protection consumer acts on the affected symbol, serialized queue and trades, requires a current price, and records failed closes and remaining positions. Entry consumers check that symbol's halt (`core/TradingLoop.js:1599-1614`, `core/OrderExecutor.js:2903-2911`); the close route checks removal from active state (`core/SessionRouter.js:184-213`).
- REST verification does not ingest candles. Recovery calls `processNewCandle` for history/indicators; the native handler owns the inspected trading-cycle dispatch. No second entry stream was found in the diff.

## Remaining limits

This is bounded source review, not whole-file or repository certification. The host fixture uses synthetic broker replies, time, timer delivery and surrounding services, and starts flat. It does not prove live order fills, executable prices during a real outage, complete recovery or Stop 2 runtime acceptance. The reviewer did not independently rerun that fixture or execute a parsed AST tool.

An inherited diagnostic mismatch remains: `brokers/KrakenIBrokerAdapter.js:81` reads `inner.lastDataAt`, whereas `kraken_adapter_simple.js:1150` writes `lastDataReceived`. It was not repaired here. The candidate uses native frame markers and does not classify `DEGRADED` as confirmed disconnection; this mismatch did not establish a false quarantine in the reviewed decision.

Source SHA-256 values matched the pinned tree and working files at the reviewer's final check:

- Runner: `6251492908394648a82b650deea9678c427114af9e4e8a08bc364a6f0c52fb35`
- CandleProcessor: `e6e85b18f3ea2346de4670f1ccf284a465a2b935db550dc664f497f756173253`
- Fixture: `d347704bd7637214888c155158ca4208ab0b6bf27a72feadfd476b5e884af826`

The parent retains the complete original review in the collaboration conversation. This document records its result and evidence; it does not supply the missing Mercury vote or authorize production delivery.
