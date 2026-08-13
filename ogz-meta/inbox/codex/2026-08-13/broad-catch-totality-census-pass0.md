# Broad Catch Totality Census - Pass 0

Status: READ-ONLY CENSUS. No runtime fixes, no wiring, no tests, no gates.

Head inspected: `a0afdc81` (`Fixed symbol context route quarantine producer`)
Branch: `codex/multi-asset-symbol-state`
Date: 2026-08-13

## Doctrine Applied

- Fourth Shape first: every fail-close/refusal/catch site is evidence of either an upstream producer to fix, a true outside boundary to route/quarantine, or a dead-producer tripwire with proof.
- No bot-wide stop from ordinary bad cells. Hot-path fixes must preserve clean symbols/trades while routing the bad cell loudly.
- No downstream gates as the first move. Producer census precedes implementation.
- No fixes in this pass. This artifact is the master table seed and dispatch ledger for the next sequential fixes.

## Mechanical Count

Commands:

```bash
find brokers core foundation modules utils -type f -name '*.js' ! -path '*/test/*' ! -path '*/tests/*' ! -path '*/__tests__/*' ! -path '*/backup*/*' ! -path '*/archive/*' -print0 | xargs -0 rg -n "\bcatch\b" | wc -l
for f in run-empire-v2.js TierFeatureFlags.js backtest-strategies.js; do [ -f "$f" ] && printf '%s ' "$f" && rg -n "\bcatch\b" "$f" | wc -l; done
```

Current live count:

- `brokers/ core/ foundation/ modules/ utils/`: 513 catch / `.catch()` sites
- root runtime files: `run-empire-v2.js` 21, `TierFeatureFlags.js` 2, `backtest-strategies.js` 1
- total current pass-0 runtime surface: 537

Fable's stale target was 540. I am not forcing stale arithmetic onto current HEAD; the reproducible live census is 537 under the boundary above.

## File Count Manifest

| Count | File |
|---:|---|
| 26 | `core/OrderExecutor.js` |
| 25 | `core/StateManager.js` |
| 22 | `core/TradeJournalBridge.js` |
| 21 | `run-empire-v2.js` |
| 18 | `core/Supervisor.js` |
| 17 | `core/trai_core.js` |
| 17 | `core/SessionRouter.js` |
| 16 | `brokers/TastyworksAdapter.js` |
| 16 | `brokers/AlpacaAdapter.js` |
| 15 | `core/TradeIntelligenceEngine.js` |
| 15 | `brokers/OandaAdapter.js` |
| 15 | `brokers/BinanceAdapter.js` |
| 14 | `core/PipelineSnapshot.js` |
| 13 | `brokers/InteractiveBrokersAdapter.js` |
| 12 | `foundation/ResilientWebSocket.js` |
| 12 | `core/TradeNarrator.js` |
| 11 | `core/TradingLoop.js` |
| 11 | `core/StrategyOrchestrator.js` |
| 11 | `brokers/SchwabAdapter.js` |
| 11 | `brokers/GeminiAdapter.js` |
| 11 | `brokers/CoinbaseAdapter.js` |
| 10 | `core/PatternMemoryBank.js` |
| 9 | `core/WebSocketManager.js` |
| 9 | `core/TRAIDecisionModule.js` |
| 9 | `brokers/UpholdAdapter.js` |
| 8 | `core/UnifiedPatternMemory.js` |
| 8 | `core/TraceSpine.js` |
| 8 | `core/SingletonLock.js` |
| 8 | `core/KrakenAdapterV2.js` |
| 7 | `foundation/ConfigLoader.js` |
| 7 | `core/TtpCutoffEnforcer.js` |
| 7 | `core/TradeJournal.js` |
| 7 | `core/BacktestRunner.js` |
| 7 | `brokers/CMEAdapter.js` |
| 6 | `core/tradeLogger.js` |
| 6 | `core/CandleProcessor.js` |
| 5 | `core/WebhookOrderAdapter.js` |
| 5 | `core/TradeReplayCapture.js` |
| 4 | `core/TRAIWebContext.js` |
| 4 | `core/RuntimeAuditSink.js` |
| 4 | `core/PositionTracker.js` |
| 4 | `core/OrderRouter.js` |
| 4 | `core/CryptoMarketFeed.js` |
| 3 | `core/session-router/TransitionStore.js` |
| 3 | `core/persistent_llm_client.js` |
| 3 | `core/WhaleFilings.js` |
| 3 | `core/PerformanceDashboardIntegration.js` |
| 3 | `core/NtfyTraceNotifier.js` |
| 3 | `core/NewsSearchProvider.js` |
| 3 | `core/DecisionLedgerLogger.js` |
| 3 | `core/CandleStore.js` |
| 2 | `core/PerformanceAnalyzer.js` |
| 2 | `core/MultiAssetManager.js` |
| 2 | `core/ModuleAutoLoader.js` |
| 2 | `core/KillSwitch.js` |
| 2 | `core/DecisionAutopsyLogger.js` |
| 1 | `utils/telegramNotifier.js` |
| 1 | `utils/discordNotifier.js` |
| 1 | `modules/PropSafeEMAPullback.js` |
| 1 | `modules/MultiTimeframeAdapter.js` |
| 1 | `modules/EMATrendRetest.js` |
| 1 | `core/invariants.js` |
| 1 | `core/indicators/IndicatorEngine.js` |
| 1 | `core/Telemetry.js` |
| 1 | `core/TRAIPatternIntegration.js` |
| 1 | `core/RuntimeConfigProof.js` |
| 1 | `core/OptimizedIndicators.js` |
| 1 | `core/MessageQueue.js` |
| 1 | `core/MarketRegimeDetector.js` |
| 1 | `core/FibonacciDetector.js` |
| 1 | `core/FeatureFlagManager.js` |
| 1 | `core/EventLoopMonitor.js` |
| 1 | `core/EvalRuleEngine.js` |
| 1 | `core/DynamicPositionSizer.js` |
| 1 | `core/DashboardBroadcaster.js` |
| 1 | `core/BacktestRecorder.js` |
| 1 | `core/BacktestConfigOverrides.js` |
| 1 | `core/AuthFailureGuard.js` |
| 1 | `brokers/KrakenIBrokerAdapter.js` |
| 1 | `brokers/BrokerRegistry.js` |
| 1 | `brokers/BrokerFactory.js` |

## Coverage Corrections

- `core/JournalBridge.js` does not exist. The live file is `core/TradeJournalBridge.js`, with 22 catch sites. The first hot-path agent missed it by filename, so I filled that gap separately.
- `core/trai_core.js` is not orphaned. It is wired through `run-empire-v2.js` into `core/TRAIDecisionModule.js`.
- `core/Supervisor.js` is not orphaned. It is wired by `scripts/supervisor-daemon.js` and PM2 config.
- `core/TradeIntelligenceEngine.js` is constructed in `run-empire-v2.js`, but the gap pass found no runtime method calls against `this.tradeIntelligence.*`; classify as constructed-only until call-site proof says otherwise.
- `core/PatternMemoryBank.js` is gate-runner-only in this pass; active learning routes through `TRAIDecisionModule.recordTradeOutcome`.

## Bucket Summary

| Bucket | Scope | Result |
|---|---|---|
| A | Hot path: `StateManager`, `OrderExecutor`, `SessionRouter`, `TradingLoop`, runner | 98 catch sites classified by agent; `TradeJournalBridge` 22-site gap filled separately |
| B | `brokers/AlpacaAdapter.js` | 16 catch sites classified |
| C | Other broker adapters plus Kraken/Webhook adapters | 123 catch sites classified; 38 SWALLOW, 2 NEEDS-REVIEW, 27 BOUNDARY-LEGIT, 56 TRIPWIRE-RETHROW, 0 SCREAM-AND-ROUTE |
| D | foundation/utils/runtime helpers | classified separately; includes several live utility swallows and dashboard/evidence side-channel boundaries |
| E | orphan disposition | corrected: `trai_core` and `Supervisor` are wired; `TradeIntelligenceEngine` constructed-only; `PatternMemoryBank` gate-only |
| Gap | remaining core/modules not covered by A-E | 251 catch sites across 53 files classified |

## High-Signal SWALLOW / NEEDS-REVIEW Queue

These are not fixes yet. They are the first queue for producer census and adversarial attack before any code change.

| Site | Current landing | Classification | Producer/impact question |
|---|---|---|---|
| `core/OrderExecutor.js:3688` | `updateActiveTrade` failure logs only after trade success path work | SWALLOW | Can an executed trade lose state mutation evidence while the bot continues as if the cell is clean? |
| `core/StateManager.js:1703` | close-path decision ledger persistence failure logs only | SWALLOW | Does a close remain authoritative while its decision proof disappears? |
| `core/StateManager.js:3500` | fill-apply close ledger persistence failure logs only | SWALLOW | Same ledger-loss class during fill application. |
| `run-empire-v2.js:1782` | TRAI init failure continues with `this.trai = null` | SWALLOW / NEEDS-REVIEW | Is this explicit degraded mode or silent strategy-brain removal? |
| `run-empire-v2.js:2690` | data-feed pause recovery failure logs only | SWALLOW | A recurring feed recovery failure can become silent session degradation. |
| `brokers/AlpacaAdapter.js:192` | connect failure returns false with log only | SWALLOW | Live broker connectivity can be reduced to a boolean unless caller routes it. |
| `brokers/AlpacaAdapter.js:402` | market-open check returns false on error | SWALLOW | Broker/calendar error can masquerade as closed market. |
| `brokers/AlpacaAdapter.js:705` | getPositions returns `[]` on error | SWALLOW | Broker position visibility failure can masquerade as no positions. |
| `brokers/AlpacaAdapter.js:851` | initial subscription failure logs only | SWALLOW | Live market data subscription can fail without ladder routing. |
| `brokers/BinanceAdapter.js:480` | symbols fetch returns `[]` | SWALLOW | Exchange discovery failure can look like empty universe. |
| `brokers/CMEAdapter.js:169` | ticker failure returns zero object | SWALLOW | Fake-ish market data object risk. |
| `brokers/GeminiAdapter.js:311` | placeOrder returns null | SWALLOW | Order submission failure can lose typed failure contract. |
| `brokers/SchwabAdapter.js:231` | balance returns null | SWALLOW | Broker account visibility failure without typed route. |
| `core/CandleProcessor.js:845` | backfill failure returns `[]` | NEEDS-REVIEW | Missing candles can degrade active data path. |
| `core/CandleStore.js:344` | corrupt candle container falls through fresh | NEEDS-REVIEW | Corruption may be hidden as empty/fresh state. |
| `core/OptimizedIndicators.js:122` | returns RSI/MACD/volatility defaults | NEEDS-REVIEW | Indicator failure may become fabricated-looking neutral data. |
| `core/StrategyOrchestrator.js:1005,1013,1032,1048,2016,2336` | strategy/MTF errors become null/no-signal | NEEDS-REVIEW | Broken strategy can look like no setup. |
| `core/TRAIDecisionModule.js:313,534,1161` | TRAI processing/learning fallbacks | NEEDS-REVIEW | TRAI failures may be operationally invisible. |
| `core/PipelineSnapshot.js:173,192,261,274,286,297,310,352,365,380,400,434` | dashboard snapshot defaults `0/null/[]/inactive` | SWALLOW | Runtime truth can render as default state. |
| `core/UnifiedPatternMemory.js:657,899` | save/forceBackup logs only | NEEDS-REVIEW | Learned-state persistence can fail without caller route. |
| `core/PatternMemoryBank.js:328,621,762,850,1059` | logs then returns false/null | NEEDS-REVIEW | Gate-only currently, but dangerous if rewired. |
| `modules/MultiTimeframeAdapter.js:284` | increments error counter only | SWALLOW | Indicator calculation failures hidden unless stats inspected. |

## TradeJournalBridge 22-Site Gap

| Site | Current landing | Classification | Note |
|---|---|---|---|
| `core/TradeJournalBridge.js:204` | JSON clone failure returns null | BOUNDARY-LEGIT | Data projection helper; no trade action by itself. |
| `core/TradeJournalBridge.js:387` | error stringify fallback | BOUNDARY-LEGIT | Last-resort formatting only. |
| `core/TradeJournalBridge.js:563` | startup reconciliation skipped with warn only | SWALLOW | Open-journal reconciliation can be skipped while bridge continues. |
| `core/TradeJournalBridge.js:605` | configured journal bundle skipped with warn only | SWALLOW | Symbol-scoped journal bundle may be absent. |
| `core/TradeJournalBridge.js:724` | records visibility failure, marks unjournaled on journal event, increments infrastructure streak for persistence errors | SCREAM-AND-ROUTE | Matches W2 per-trade isolation shape. |
| `core/TradeJournalBridge.js:810` | wrapper catches entry-recording exceptions, records visibility failure | SCREAM-AND-ROUTE | Still needs producer census for upstream thrown state. |
| `core/TradeJournalBridge.js:910` | active-state reconciliation record failure routes through visibility failure | SCREAM-AND-ROUTE | Per-trade visibility route. |
| `core/TradeJournalBridge.js:1125` | exit-recording failure routes through visibility failure | SCREAM-AND-ROUTE | Per-trade visibility route. |
| `core/TradeJournalBridge.js:1189` | primary visibility ledger write falls back and can count journal persistence failure | SCREAM-AND-ROUTE | Routed, with fallback evidence path. |
| `core/TradeJournalBridge.js:1228` | mark-active-trade-unjournaled failure logs and returns failure object | NEEDS-REVIEW | If state mark fails, manual reconciliation trace still emitted by caller but state can remain unmarked. |
| `core/TradeJournalBridge.js:1295` | pauseTrading promise rejection logs only | NEEDS-REVIEW | Infrastructure-down route attempted but failed pause is not laddered beyond console. |
| `core/TradeJournalBridge.js:1332` | resumeTradingIfPausedBy rejection logs only | BOUNDARY-LEGIT | Recovery path failure is visible but not trading-critical by itself. |
| `core/TradeJournalBridge.js:1456` | dashboard visibility overflow primary write falls back | SCREAM-AND-ROUTE | Fallback path exists. |
| `core/TradeJournalBridge.js:1470` | overflow fallback write logs and stderr last resort | SCREAM-AND-ROUTE | Last-resort evidence path. |
| `core/TradeJournalBridge.js:1476` | stderr last resort ignored | BOUNDARY-LEGIT | Cannot route after stderr failure. |
| `core/TradeJournalBridge.js:1524` | visibility fallback write logs and stderr last resort | SCREAM-AND-ROUTE | Last-resort evidence path. |
| `core/TradeJournalBridge.js:1531` | stderr last resort ignored | BOUNDARY-LEGIT | Cannot route after stderr failure. |
| `core/TradeJournalBridge.js:1595` | dashboard journal handler warns only | SWALLOW | Dashboard/export request failures disappear into warning. |
| `core/TradeJournalBridge.js:1638` | malformed dashboard request silently ignored | BOUNDARY-LEGIT | External client garbage; no trade action. |
| `core/TradeJournalBridge.js:1669` | dashboard send failure warns, returns false | BOUNDARY-LEGIT | Dashboard side channel; pending visibility queue covers visibility errors. |
| `core/TradeJournalBridge.js:1925` | CSV export failure console.error only | BOUNDARY-LEGIT | Operator export request, not trading path. |
| `core/TradeJournalBridge.js:1937` | report export failure console.error only | BOUNDARY-LEGIT | Operator export request, not trading path. |

## First Fix Order Recommendation

No fixes landed in this pass. When fixes begin, keep them sequential and commit one bug class at a time:

1. Hot-path state/evidence loss: `OrderExecutor` and `StateManager` ledger/state swallows.
2. Journal bridge startup/configured-bundle swallows and failed state-mark route.
3. Broker live-truth masquerades: positions `[]`, market closed `false`, ticker zero/null, placeOrder null.
4. Runtime data defaulting: candle backfill empty, candle-store corrupt fresh start, indicator neutral defaults.
5. Strategy/no-signal absorption: strategy and MTF exceptions turning into null/no-signal.
6. Dashboard/reporting defaults only after trading path is clean, unless the default lies about active risk.

Each fix needs:

- producer census first,
- upstream producer repair where internal,
- boundary route/quarantine where external,
- no bot-wide stop unless existing KillSwitch is the explicit owner,
- Mercury -> Fable -> Mercury recheck if blocked -> Kimi only on unresolved disagreement,
- one commit per bug class.

## Footer

WHAT I DID DO: read the attached order, confirmed current branch/head/status, ran the live mechanical catch census, spawned read-only subagents for the buckets, filled the `TradeJournalBridge` filename miss, corrected orphan/wired dispositions, and wrote this pass-0 artifact.

WHAT I DID NOT DO: edit runtime code, add tests, run P0, run Mercury/Fable/Kimi, restart PM2, or classify this as a completed fix.

WHAT I ASSUMED: `ogz-meta/inbox/codex/2026-08-13/` is the correct routing path for this census artifact under `ogz-meta/ROUTING.md`; runtime fixes will start only after this table is accepted as the pass-0 queue.
