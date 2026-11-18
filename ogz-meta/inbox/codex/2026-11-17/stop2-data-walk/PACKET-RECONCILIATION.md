# Supplied Stops 2-3 trace: reconciliation and bounded native evidence

November 18, 2026 UTC. Current source HEAD `caa7e9f7cb2166c125d4f05279277332f925f092` plus inherited working edits on `codex/archive-legacy-env`. The operator supplied a report containing a Stops 2-3 trace and copied agent task/skill reminders. The attachment path and hash are recorded in [verification metadata](packet-reconciliation-verification.json). Those reminders were treated as report context, not an instruction to adopt another agent's tools, resume fee edits or spawn parallel agents. Trey's latest production boundary remains “Keep investigating before editing.”

## Findings reconciled against current source

- The report's distinction between retained chart/price data and excluded evaluation input agrees with the earlier [runner receipt](frame-routing-receipt.json). Runner `run-empire-v2.js:983-986` stores the bars before the evaluation branch; 30m/1d are not discarded entirely. All 25 source hashes from the previous follow-up still match.
- Normal pattern analysis receives the captured frame-specific MACD and signal from `core/TradingLoop.js:1983-2002`. `core/EnhancedPatternRecognition.js:416-421` passes them to `FeatureExtractor`; `:193-198` invokes the optimized MACD only when the supplied values do not satisfy its numeric-input branch. `core/indicators/IndicatorEngine.js:49-56` holds its own MACD accumulators, and latest-bar revisions restore its checkpoint at `:208-221`. This is a distinct implementation from the shared optimized calculator.
- The stronger claim that all included higher-frame bars are confirmed final is not established by the earlier MTF receipt. `modules/MultiTimeframeAdapter.js:275-279` filters by scope and end time, then recalculates. It has no independent final-update check. The earlier fixture proved exclusion of future-ending bars and symbol ownership, not exchange-finality or simultaneous frame-close sequencing.

## Native reproduction: an equal-end higher frame depends on arrival order

The [isolated fixture](fixtures/htf-close-and-macd.cjs) uses the real closed-candle selector, MTF ingest/storage/snapshot methods and current paper ConfigLoader. It provides five configured frame histories, each with 64 bars. A synthetic one-hour bar ends exactly when the selected one-minute decision bar ends. Two revisions of that hourly bar have closes 101 and 140; all other fixture inputs are the same.

| Delivery/capture sequence | Hourly price in the decision snapshot |
| --- | ---: |
| One-minute boundary captured before hourly revision | 101 |
| Hourly revision delivered before the same minute boundary capture | 140 |
| Capture repeated after the first service receives the revision | 140 |
| Previously captured snapshot, inspected after revision | 101 |

The snapshot is immutable, so a later revision does not repair an earlier captured input. The observed dependency is supported by the runner's immediate capture before ingesting Kraken's next forming candle at `run-empire-v2.js:996-1009` and the MTF time-only cutoff. The fixture does not instantiate the complete runner scheduler or demonstrate that a real provider delivered this order. It establishes component behavior under a specified delivery order, **not an observed live bad decision**. Provider ordering/finality evidence remains necessary before choosing its repair. A sleep, guessed finalization delay or blanket halt is not justified by this result.

## Native reproduction: shared optimized MACD and the actual fallback consumer

Two divergent synthetic histories were calculated separately and then interleaved through the actual exported OptimizedIndicators singleton. Each stream's MACD line stayed the same, but its signal changed because the shared `macdHistory` at `core/OptimizedIndicators.js:264-291` mixed observations. The cache key at `:99-102` hashes closes and parameters without stream/history identity.

| Stream A result | Separate calculator | Shared calculator after interleaving A and B |
| --- | ---: | ---: |
| MACD line | 5.9649756433 | 5.9649756433 |
| Signal | 5.9614468205 | -0.6551916633 |
| MACD minus signal | 0.0035288228 | 6.6201673065 |

An A -> B -> cached A call returned A's earlier cached value without advancing the shared MACD history, whose last input still belonged to B. This reproduces the source-level concern; it is not evidence that every normal decision uses that implementation.

The fixture then invoked the actual `FeatureExtractor.extract` with a counting wrapper that delegates unchanged to the real MACD method. With supplied MACD 1 and signal 0.5, it made zero optimized MACD calls and produced feature delta 0.5. Omitting those inputs caused one call and produced the mixed-history delta 6.6201673065. This demonstrates a concrete fallback consumer, not merely a dormant singleton. No missing-input producer was induced in the live bot, and no affected live trade, learned record or order has been established. Missing-input provenance must be traced before deciding whether to remove that fallback, correct its producer or change calculator ownership. No numerical-equivalence claim is made between the separate IndicatorEngine, optimized and MTF MACD algorithms.

## Scope, fees and remaining work

The copied fee task remains an independent issue: current `core/FeeModel.js:113-116` maps entry to maker and exit to taker. The report's earlier failure receipt was not supplied with this attachment and was not rerun here. Product, fill-liquidity semantics, rates and profile applicability were not established by this candle/indicator investigation; no fee or profile value was changed. The research-controller/isolation and harvesting limitations in the copied task list were not revalidated or represented as completed by this work.

The next data repair must preserve symbol/frame identity and the observed working entry capture path. Seven-frame availability, dashboard identity and local chart construction remain the existing confirmed repair targets. Higher-frame finality is now a demonstrated component dependency requiring producer-order evidence, while optimized-MACD fallback is a separate reproduced calculation defect requiring missing-input tracing. Neither finding authorizes a general indicator rewrite or silent confidence-policy change.

## Verification and preservation

The [run record](htf-close-and-macd-run.json) records the exact `scripts/test-isolated.py --fixture ... -- node ...` command, exit code 0, fixture hash and log hash. The [native receipt](htf-close-and-macd-receipt.json) preserves all compared values, source hashes, seams and limits. Assertions establish current behavior, including defects; they are not repair acceptance. All trading-module imports and synthetic credentials stayed inside disposable isolation. No Jest, real broker calls, production imports on the host, bank writes or PM2 operations occurred.

Only this reconciliation, one isolated fixture, sanitized receipts, preservation metadata and a detailed changelog entry are delivered. All 25 earlier source hashes are unchanged; three additional inspected source files are fingerprinted, giving 28. Author review checked the supplied report against current source and the complete native output. No paid Mercury dispatch, external panel verdict, restart, settings edit or source repair occurred. Inherited dirty work and the original changelog suffix are preserved. Stops 2 and 3 remain open.
