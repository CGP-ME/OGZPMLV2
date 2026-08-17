# HUNT RANK 1 - OptimizedIndicators Disposition

Date: 2026-08-16
Agent: Codex
Mandate: Rank 1 fabricated indicator defaults; Fourth Shape; null-not-zero; no silent overrides; retirement table before deleting duplicate indicator ownership.

## Current-HEAD Caller Census

Command:

```bash
rg -n "OptimizedIndicators|calculateTechnicalIndicators\\(|calculateRSI\\(|calculateMACD\\(|calculateBollingerBands\\(|calculateVolatility\\(|determineTrend\\(" core/EnhancedPatternRecognition.js backtest/OptimizedBacktestEngine.js backtest/backtest-api.js core/OgzTpoIntegration.js modules/EMASMACrossoverSignal.js run-empire-v2.js
```

Active consumers:

| Consumer | Current read | Fabricated-neutral behavior before | Explicit-unavailable behavior now | Disposition |
| --- | --- | --- | --- | --- |
| `core/EnhancedPatternRecognition.js:33,190-209,418-424` | Direct singleton import; missing `rsi`, `macd`, `macdSignal`, `trend`, Bollinger width, volatility are computed from `OptimizedIndicators`. | Empty candles returned `[0.5,0,0,0.02,0.01,0.5,0,0,0]`; missing market fields were filled with `50`, `0`, and `sideways`, then learned as a pattern. | Missing/unavailable inputs return `pattern_features_unavailable`, emit `PATTERN_FEATURES_UNAVAILABLE`, and return no patterns for that tick. | Bleed stopped; migrate/delete per Trey table below. |
| `backtest/OptimizedBacktestEngine.js:8,86-87` | Direct singleton import; calls `calculateTechnicalIndicators(currentCandles)`, then skips if `!indicators.rsi || !indicators.macd`. | `calculateTechnicalIndicators` could return `{ rsi: 50, macd: 0, volatility: 0.02 }` as if measured; this caller often skipped because `macd` was falsy, but the packet still lied. | Aggregate calculation returns `indicators_unavailable` with null fields and a named reason. Existing skip stays alive without fabricated values. | Bleed stopped; migrate/delete per Trey table below. |
| `backtest/backtest-api.js:25,201-207` | Direct singleton import; calls `calculateTechnicalIndicators(currentCandles)`, catches thrown errors, then skips if indicator fields are missing/falsy. | Same fabricated aggregate packet could exist before the caller skipped. | Aggregate calculation returns `indicators_unavailable` with null fields and a named reason. Existing skip stays alive without fabricated values. | Bleed stopped; migrate/delete per Trey table below. |

Non-consumers found by the same grep:

| File | Current evidence | Disposition |
| --- | --- | --- |
| `core/OgzTpoIntegration.js:425` | Comment only: compatibility note for `OptimizedIndicators.getAllVotes()`. | Not an active consumer. |
| `modules/EMASMACrossoverSignal.js:12` | Comment says self-contained EMA/SMA and no dependency on `OptimizedIndicators`. | Not an active consumer. |
| `run-empire-v2.js:3131` | Comment only: removed old indicator functions; dashboard volatility wrapper is not an `OptimizedIndicators` call. | Not an active consumer. |

## Producer Fix Landed

| Site | Before | After |
| --- | --- | --- |
| `core/OptimizedIndicators.js:130-204` | Insufficient data or calculation failure produced neutral-looking market values. | Returns `indicators_unavailable` with null indicator fields, reason, trace, and config question key where the missing window is tunable. |
| `core/OptimizedIndicators.js:212-302` | RSI/MACD short windows and MACD signal warmup could produce neutral/zero-looking values. | Short windows and insufficient MACD signal history return null or named unavailable packets. |
| `core/OptimizedIndicators.js:344-405,431-447,510-546` | Bollinger, trend, ATR, and volatility paths had zero/sideways/2% fallbacks. | Unmet windows return null or unavailable packets; no fabricated market numbers. |
| `core/EnhancedPatternRecognition.js:181-224,426-436` | Missing candle/indicator fields were converted into learnable feature vectors. | Missing/unavailable features route to trace and no learned pattern for the tick. |
| `core/FeatureExtractor.js:32-174` | Mercury/Kimi found the runtime extractor clamped null indicator features to `0.5`; `TradingLoop` can fill missing pattern features from this extractor before pattern observation. | Missing/invalid required indicator features return `feature_vector_unavailable`; `extractArray()` returns `null`, so `TradingLoop`'s existing `Array.isArray` observation guard skips learning for that tick. Valid flat `IndicatorEngine` fields (`bbPercentB`, `atrPercent`, numeric `macd` + `macdSignal`) still produce trusted features. |

## Retirement Question Table

Destination owner: `core/indicators/IndicatorEngine.js`.
Evidence: constructor config currently lives at `core/indicators/IndicatorEngine.js:35-90`; live snapshot exposes indicator DTO at `core/indicators/IndicatorEngine.js:326-366`; MACD uses config periods at `core/indicators/IndicatorEngine.js:1014-1020`; candle validation is explicit at `core/indicators/IndicatorEngine.js:1505-1514`.
Supplier rule: migration is only valid if each consumer receives the authoritative symbol/timeframe-scoped `IndicatorEngine` instance. A second construction path would preserve the duplicate-owner bug.

| Consumer | What it reads from `OptimizedIndicators` | What `IndicatorEngine` provides | Authoritative engine supplier question | Gap or none | Trey's word |
| --- | --- | --- | --- | --- | --- |
| `core/EnhancedPatternRecognition.js` | `calculateRSI`, `calculateMACD`, `determineTrend`, `calculateBollingerBands`, `calculateVolatility`; output consumed as a 9-value feature vector. | Snapshot provides `indicators.rsi`, `macd`, `macdSignal`, `macdHistogram`, `bbWidth`, ATR/ATR percent, price, volume, EMAs/SMAs. | Should this read the same symbol context engine supplied to `TradingLoop`/`CandleProcessor`, and by what injection path? | No direct `trend` string in snapshot; no raw volatility field matching old stddev; consumer can likely use snapshot DTO plus explicit trend/vol decision. |  |
| `backtest/OptimizedBacktestEngine.js` | Aggregate `calculateTechnicalIndicators(currentCandles)` with `rsi`, numeric `macd`, `macdSignal`, `volatility`, `twoPole`. | IndicatorEngine can ingest candles and emit snapshot indicators; periods are config-owned. | Should this construct one per-run/per-symbol engine through the same backtest context factory as live symbol contexts, or should this legacy engine be deleted? | Backtest runner would need per-run engine lifecycle and snapshot field normalization; existing MACD consumer also expects fields inconsistently (`indicators.macd?.histogram`). |  |
| `backtest/backtest-api.js` | Same aggregate packet as the optimized backtest engine. | Same as above. | Should this API receive the same per-run/per-symbol backtest engine supplier, or be classified legacy-delete before migration? | Same as above; file is a legacy API path and should be classified wire-or-delete before migration. |  |

## Config Question Keys Named In This Commit

`core/OptimizedIndicators.js` now names these question keys instead of leaving anonymous tunables in touched code:

`indicator.rsiPeriod`, `indicator.macdFast`, `indicator.macdSlow`, `indicator.macdSignal`, `indicator.volatilityPeriod`, `indicator.bbPeriod`, `indicator.bbStdDev`, `indicator.atrPeriod`, `indicator.trendShortPeriod`, `indicator.trendLongPeriod`, `indicator.cacheSize`, `indicator.macdHistorySize`, `indicator.twoPoleSmaLength`, `indicator.twoPoleFilterLength`, `indicator.twoPoleUpperThreshold`, `indicator.twoPoleLowerThreshold`.

`core/EnhancedPatternRecognition.js` now names:

`patternRecognition.useOptimizedIndicators`, `patternRecognition.flatCandleWickRatio`, `patternRecognition.defaultPatternQuality`.

`core/FeatureExtractor.js` is not yet config-owned; this commit changes its missing-data behavior only. Its neutral normalization constants are included in the separate `config-truth-census-pass0.md` artifact for the one-roof config pass.
The touched normalization constants are exposed as question keys on unavailable records: `featureExtractor.volatilityPercentCeiling`, `featureExtractor.volumeRatioCeiling`, `featureExtractor.macdDeltaRange`.

## SessionRouter Tail

`core/SessionRouter.js:1397-1424` no longer leaves failed-safe journal write failure as console-only context. `SESSION_ROUTER_FAILED_SAFE_HALT` includes `failedSafeJournalWriteFailed`, `manualReconciliationRequired`, and `reconciliationMarker: failed_safe_journal_write_failed`.

## PM2 Loop Breaker

`ecosystem.config.js:70-76` adds `autorestart: true`, `max_restarts: 10`, and `restart_delay: 5000` to the `ogz-prime-v2` process block, matching the existing supervisor restart cap shape.

## Verification

Local focused suite:

```bash
npx jest test/pattern-memory-flood.test.js test/session-router-fail-safe.test.js test/ecosystem-eval-profile.test.js test/trading-loop-trace-spine.test.js --runInBand
```

Result: 4 suites passed, 87 tests passed.

Mercury/Fable/Kimi final hot-path pass:

`ogz-meta/cognition-history/mercury-runs/2026-08-17.jsonl:2`

Final adjudication: `pass`; blocking: no. Mercury ran the four direct Jest receipts; Fable correctly challenged missing static evidence for deterministic paper env seeding; Mercury rechecked `test/trading-loop-trace-spine.test.js:3-16` before `require('../core/TradingLoop')` at line 52; Kimi adjudicated the evidence gap closed.

## Footer

WHAT I DID DO: verified the active consumer list against current HEAD; stopped fabricated neutral indicator defaults; routed pattern feature absence to trace and no learning for that tick; fixed the Mercury/Kimi-confirmed runtime `FeatureExtractor` null-to-0.5 clamp by returning unavailable/null; marked SessionRouter failed-safe journal write failures for manual reconciliation; capped the PM2 restart loop for `ogz-prime-v2`; produced this retirement question table with an explicit authoritative-engine-supplier question per consumer.

WHAT I DID NOT DO: delete or concatenate `OptimizedIndicators`; migrate consumers onto `IndicatorEngine`; decide the blank Trey columns; run Rank 2.

WHAT I ASSUMED: `OptimizedIndicators` retirement needs Trey-filled per-consumer direction before deletion because the remaining consumers do not all consume the same DTO shape.

PROVENANCE: Mandate: HUNT RANK 1; Ruled-By: Trey, 2026-08-16; Doctrine: Fourth Shape, selective routing, null-not-zero, one config owner; Config question keys cited above.
