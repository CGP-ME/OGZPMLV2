# Lane TFE Phase 1 Scope Report

Worktree: `/opt/ogzprime/OGZPMLV2-tfe-codex2`
Branch: `codex/tfe-phase1`
Base commit: `a490f30b Fixed pipeline forensics halt fossil`

Requested context check:
- `ogz-meta/inbox/fable/` was absent in the active tree during this pass.
- Available intake lead read instead: `ogz-meta/inbox/codex/WIRING-MANIFEST-2026-07-11.md`.

## Touchpoint Inventory

- `foundation/ConfigLoader.js:729-734` reads `orchestrator.mtfTimeframes`, MTF booster, and strategy MTF config; TFE replaces this as the single configured timeframe roster for bar production while strategy MTF remains consumer config.
- `foundation/ConfigLoader.js:852` reads `broker.candleTimeframe` with env fallback; TFE Phase 2 should consume a resolved config value only, then make runtime base timeframe explicit to the engine.
- `foundation/ConfigLoader.js:3100` carries `timeframeConfig`; TFE Phase 2 should either own this table or consume it through one canonical config pipe, not private literals.
- `foundation/ConfigLoader.js:3744-3773` exposes `getTimeframeConfig(timeframe)` and refuses a 15m fallback; TFE can use the same no-fallback shape if Phase 2 keeps this API.
- `run-empire-v2.js:619-623` validates `broker.candleTimeframe`; TFE replaces this local field as the base timeframe source after resolved config is explicit.
- `run-empire-v2.js:682-686` constructs `MultiTimeframeAdapter` and `CandleAggregator`; TFE replaces both as the platform bar producer, with MTF becoming a thin consumer.
- `run-empire-v2.js:687-689` maintains aggregate dedupe/backfill tracking sets; TFE replaces this with engine-level closed-bar delivery and bounded pending state.
- `run-empire-v2.js:694-699` constructs `AdaptiveTimeframeSelector` pinned to one timeframe; TFE Phase 2 should feed selector from engine snapshots or delete runtime selection if explicit config remains pinned.
- `run-empire-v2.js:857-918` normalizes SessionRouter OHLC events, defaults missing `eventData.timeframe` to `1m`, and stores candles in local histories; TFE replaces the default and local storage with explicit base-feed ingestion.
- `run-empire-v2.js:919-946` either handles active timeframe directly or calls `_feedAggregatedActiveCandle`; TFE replaces this branch with subscription delivery from born bars.
- `run-empire-v2.js:947-952` evaluates timeframe selector only on `5m` events; TFE replaces this producer trigger with engine event/snapshot-driven evaluation if selector survives.
- `run-empire-v2.js:953-955` calls `run15mTradingCycle` on active candle close; TFE replaces the hardwired 15m naming with timeframe-neutral strategy subscription delivery.
- `run-empire-v2.js:1682-1726` REST hydrates one timeframe and stores local candles; TFE replaces store calls with explicit engine hydration/ingest for the configured source timeframe.
- `run-empire-v2.js:1990-2036` maintains `symbolTimeframeHistories`; TFE replaces this local history for runtime bars.
- `run-empire-v2.js:2038-2042` reads `symbolTimeframeHistories`; TFE replaces it with `timeframeEngine.getCandles(symbol,timeframe)` or scoped equivalent.
- `run-empire-v2.js:2044-2051` trims aggregate tracking sets; TFE replaces these sets with bounded engine pending/history structures.
- `run-empire-v2.js:2053-2134` requests aggregate source backfill for private repair; TFE Phase 2 either moves repair into the platform source-feed layer or removes this path if explicit source config makes repair invalid.
- `run-empire-v2.js:2136-2240` privately aggregates source history into the active timeframe and triggers trading; TFE replaces the whole method with engine-delivered closed bars.
- `run-empire-v2.js:2259-2278` builds runtime scope and uses `overrides.timeframe || timeframeSelector.currentTimeframe || candleTimeframe || config.timeframe || null`; TFE replaces this four-source fallback chain with a single explicit config/engine timeframe.
- `run-empire-v2.js:2399-2439` stores dashboard timeframe history and stamps identity after conversion; TFE makes identity present at bar birth and dashboard reads the engine/history consumer output.
- `run-empire-v2.js:2444-2447` falls back invalid dashboard timeframe reads to `1m` or `priceHistory`; TFE replaces this with explicit missing-timeframe refusal or honest empty state.
- `run-empire-v2.js:2450-2465` stamps historical dashboard candles after REST fetch; TFE Phase 2 removes post-hoc candle identity for runtime-produced bars, leaving only external REST adapter normalization.
- `run-empire-v2.js:2489-2594` dashboard historical fetch sends REST/cached candles by requested timeframe; TFE becomes the cached-bar source and should not fake stock/crypto timeframe data.
- `run-empire-v2.js:2696-2699` derives liveness timeframe from selector or candle timeframe; TFE replaces this with active engine/base timeframe state.
- `run-empire-v2.js:2731` asks `CandleAggregator` for timeframe milliseconds; TFE replaces interval lookup.
- `run-empire-v2.js:2798-2858` liveness REST backfill normalizes/stores one timeframe; TFE replaces the local stores with engine ingestion/hydration.
- `run-empire-v2.js:2894-2919` liveness watchdog uses derived active timeframe; TFE replaces this source with explicit engine timeframe state.
- `run-empire-v2.js:2939-2959` keeps `run15mTradingCycle` as a hardwired name for candle-close entries; TFE Phase 2 should rename or route through timeframe-neutral delivery without changing behavior in the same commit unless Trey approves.
- `run-empire-v2.js:3222-3238` backtest runner receives `storeTimeframeCandle`, `handleMarketData`, `timeframe`, and `runTradingCycle`; TFE Phase 2 moves file candle ingestion through the same engine path as live.
- `core/BacktestRunner.js:39-57` derives timeframe ms from `ctx.candleAggregator` or parser fallback; TFE replaces this interval source.
- `core/BacktestRunner.js:78-94` refuses dataset/timeframe mismatch; TFE should preserve this guard and additionally require born timeframe identity.
- `core/BacktestRunner.js:160-201` normalizes file candles, stores runtime timeframe, handles market data, then runs trading cycle; TFE replaces store/run calls with engine subscription delivery.
- `core/CandleAggregator.js:17-25` owns the supported timeframe table; TFE centralizes this table.
- `core/CandleAggregator.js:35-68` aggregates source arrays into target bars; TFE owns live incremental aggregation.
- `core/CandleAggregator.js:70-137` checks source completeness; TFE should own completeness before emitting a closed aggregate.
- `core/CandleAggregator.js:146-173` builds OHLCV bars without timeframe identity; TFE stamps identity at birth.
- `core/CandleAggregator.js:184-227` checks period completion and interval lookup; TFE centralizes this service.
- `core/CandleProcessor.js:80-88` has local timeframe parsing; TFE should replace duplicate parsing.
- `core/CandleProcessor.js:120-146` resolves candle interval at construction; TFE Phase 2 should inject engine interval/base timeframe.
- `core/CandleProcessor.js:237-240` forwards timeframe in dashboard broker status frames; TFE remains the source of this stamped field.
- `core/CandleStore.js:16-25` stores `symbol -> timeframe -> candles` but does not stamp identity; TFE feeds it born bars or replaces runtime history use.
- `core/CandleStore.js:41-76` accepts a timeframe parameter separate from the candle; TFE Phase 2 should require candle.timeframe and reject mismatches.
- `core/CandleStore.js:274-307` loads disk candles for a slot without adding timeframe to each candle; TFE should remove the disk-vs-in-flight two-shape split.
- `core/CandleStore.js:328-364` saves candles to disk by slot; TFE Phase 2 should persist stamped bars and reject unstamped slot data.
- `core/StrategyOrchestrator.js:49` imports `MultiTimeframeAdapter`; TFE Phase 2 removes this private producer import from orchestration.
- `core/StrategyOrchestrator.js:645-647` stores `mtfBaseTimeframe`; TFE Phase 2 replaces this with strategy subscription declarations.
- `core/StrategyOrchestrator.js:678` constructs a private MTF adapter; TFE Phase 2 dissolves this into a thin consumer.
- `core/StrategyOrchestrator.js:727-731` builds MTF adapter config and uses `ConfigLoader.get('orchestrator.mtfTimeframes') || [...]`; TFE removes the private default list.
- `core/StrategyOrchestrator.js:751-807` ingests latest candle into the private MTF adapter; TFE replaces this with already-delivered bars/snapshots.
- `core/StrategyOrchestrator.js:809-823` reads private adapter indicators by timeframe; TFE Phase 2 routes through a consumer snapshot API.
- `core/StrategyOrchestrator.js:1595-1622` implements MultiTimeframe strategy from private confluence; TFE Phase 2 keeps strategy semantics but changes producer source.
- `core/StrategyOrchestrator.js:1939-1943` receives `priceHistory` and `extras`; TFE Phase 2 should pass the subscribed timeframe bar/history explicitly.
- `core/StrategyOrchestrator.js:1993-2027` resolves signal timeframe from result/extras/latest candle; TFE should make strategy timeframe declaration explicit enough that this is not a fallback chain.
- `core/StrategyOrchestrator.js:2522-2529` requires `extras.timeframe`; TFE keeps this fail-closed behavior but sources it from the bar delivery envelope.
- `core/SymbolTradingContext.js:41-60` requires `config.timeframe`; TFE Phase 2 must update context creation when strategies can subscribe to multiple native timeframes.
- `core/SymbolTradingContext.js:101-103` returns one timeframe's CandleStore history as `priceHistory`; TFE Phase 2 should make this history keyed by subscription timeframe.
- `core/TradingLoop.js:641-649` and `core/TradingLoop.js:673-681` require timeframe in runtime/ledger scope; TFE should supply the bar timeframe directly.
- `core/TradingLoop.js:968-1047` analyzes a symbol against one `priceHistory`; TFE Phase 2 should thread per-timeframe histories without blending.
- `core/TradingLoop.js:1218-1236` passes `priceHistory`, MTF adapter, and `timeframe: this.ctx.candleTimeframe` to StrategyOrchestrator; TFE replaces this with the delivered bar timeframe and declared subscriptions.
- `modules/MultiTimeframeAdapter.js:36-44` defines a private timeframe table; TFE centralizes the table.
- `modules/MultiTimeframeAdapter.js:46-76` defaults base/active timeframes and min candles; TFE removes private defaults from this consumer path.
- `modules/MultiTimeframeAdapter.js:78-98` owns private candle/pending/indicator maps; TFE Phase 2 strips candle/pending production and leaves only confluence calculation over supplied bars.
- `modules/MultiTimeframeAdapter.js:109-147` ingests/stamps source candles; TFE already stamps before consumer delivery, so this should become `consumeBars`/`updateSnapshot` without birth ownership.
- `modules/MultiTimeframeAdapter.js:153-186` privately aggregates; TFE replaces this stack.
- `modules/MultiTimeframeAdapter.js:193-208` enforces private memory bounds; TFE replaces candle memory bounds, leaving indicator cache bounds if needed.
- `modules/SmartMoneySweep.js:126-141` infers timeframe from price history and uses it for bars-per-day/IVB; TFE Phase 2 should pass declared timeframe to the strategy instead of timestamp inference.
- `modules/SmartMoneySweep.js:466-498` uses inferred `tfMinutes` to lock IVB; TFE supplies native timeframe metadata.
- `modules/SmartMoneySweep.js:947-965` snaps timestamp diffs and falls back to 15; TFE should delete this inference after strategy subscription wiring.
- `modules/LiquiditySweepDetector.js:202-239` aggregates opening-range buffers internally; this is strategy-local opening-box compression, not platform timeframe production. TFE should not replace it unless Trey rules opening range is a platform bar.
- `modules/NoWickImbalance.js:387-396` scopes pending levels by `ctx.extras.timeframe || currentCandle.timeframe`; TFE Phase 2 should provide both through the delivery envelope and remove fallback ordering if redundant.
- `foundation/IBrokerAdapter.js:183-220` exposes broker `getCandles` and `subscribeToCandles` with a timeframe argument; TFE sits above adapters and consumes only explicit adapter timeframe output.
- `public/TimeframeManager.js` exists as frontend timeframe UI state; TFE should not use it as source of truth.

## Phase 1 New Module

- Added `core/TimeframeEngine.js`.
- It is inert until Phase 2 and has no imports from `run-empire-v2.js`, `StrategyOrchestrator`, `ConfigLoader`, or `trading.config.json`.
- Constructor requires `symbol`, `baseTimeframe`, `timeframes`, and `maxCandles`; no private config defaults are substituted.
- Raw base bars are stamped with `symbol` and `timeframe` at birth.
- Higher timeframe bars are born from the base stream, stamped with `timeframe`, `sourceTimeframe`, and `sourceCount`, and delivered through subscriptions.

## Verification

- `npx jest test/timeframe-engine.test.js --runInBand`
- `node --check core/TimeframeEngine.js`

## Not Done In Phase 1

- No integration edits.
- No P0 run.
- No PM2 restart.
- No changes to dirty R1/R2 files.
- No CHANGELOG update because Phase 1 was restricted to new files only.
