# 01 - Ground Truth Inventory

Scope: backend trading bot only. This inventory uses live VPS code as ground truth and treats attached digest/spec files as starter context only.

Live P0 anchor for all future comparison: `$13,213.042341608163`.

## Re-verification Commands

Run these from `/opt/ogzprime/OGZPMLV2`:

```bash
rg -n "class SessionRouter|_transitionToStocks|_transitionToCrypto|_activateCrypto|_activateStocks|getStatus" core/SessionRouter.js
rg -n "class SymbolTradingContext|ASSET_REGISTRY|priceHistory|CandleStore" core/SymbolTradingContext.js core/CandleStore.js core/CandleProcessor.js run-empire-v2.js
rg -n "EMASMACrossover|MADynamicSR|LiquiditySweep|MarketRegime|MultiTimeframe|OGZTPO|OpeningRangeBreakout|SmartMoneySweep|RSI|winnerStrategy|confluence|exitContract" core/StrategyOrchestrator.js
rg -n "getBrokerInfo|createBrokerAdapter|registerBroker|sendOrder|getAllPositions|getAllBalances" brokers core/OrderRouter.js
rg -n "activeTrades|getTradesBySymbol|openPosition|closePosition|stateFile|getInstance" core/StateManager.js
rg -n "UnifiedPatternMemory|PatternMemoryBank|TRAIPatternIntegration|PROMOTED|QUARANTINED|storagePath|pattern_memory|pattern-pack" core
rg -n "ARMS|NeuralMeshArchitecture|CorrelationAnalyzer" core brokers modules foundation
```

## Inventory Table

| Area | Live status | Evidence |
|---|---|---|
| Broker adapter abstraction | Present. Universal adapter interface plus registry/factory/router are live. | `brokers/IBrokerAdapter.js:3-8`, `brokers/BrokerRegistry.js:13-212`, `brokers/BrokerFactory.js:25-57`, `core/OrderRouter.js:44-64`, `core/OrderRouter.js:123-142` |
| Available broker registry | Registry lists crypto, stocks, options, forex, futures, plus TODO entries. Implemented files exist for Alpaca, Kraken wrapper, Binance, Coinbase, Gemini, CME, IBKR, Oanda, Schwab, Tastyworks, Uphold. | `brokers/BrokerRegistry.js:18-212`; `rg --files brokers` |
| Multi-broker routing | OrderRouter can hold multiple adapters and aggregate positions/balances, but current bot runtime usually registers one active adapter or lets SessionRouter swap active adapter. | `core/OrderRouter.js:27-34`, `core/OrderRouter.js:148-184`, `run-empire-v2.js:623-729`, `core/SessionRouter.js:129-246` |
| SessionRouter | Present but partial. It switches one active feed/broker at a time and does not yet isolate account state, risk state, pattern banks, candle warmup, or fanout contexts. | `core/SessionRouter.js:6-15`, `core/SessionRouter.js:27-54`, `core/SessionRouter.js:129-246`, `core/SessionRouter.js:248-281` |
| Crypto/stocks autonomous switching | Gated by config/env and uses stock/crypto symbol lists. Current transition to crypto force-closes stock trades; transition to stocks does not symmetrically force-close crypto trades in the same complete state machine. | `core/TradingConfig.js:724-735`, `run-empire-v2.js:623-729`, `core/SessionRouter.js:169-246` |
| Account isolation | Not complete. `StateManager` is a singleton with one state object, one default state file, and account-wide active trade map. It has symbol-aware fixes but not session/account partitioning. | `core/StateManager.js:79-162`, `core/StateManager.js:1123-1157`, `core/StateManager.js:1163-1261`, `core/StateManager.js:1430-1439` |
| USD invariant | Present and important. State and order sizing use USD size, balance, exposure, fees, and PnL accounting. | `core/StateManager.js:20-25`, `core/StateManager.js:360-390`, `core/StateManager.js:416-490`, `core/OrderExecutor.js:68-119` |
| Multi-direction | Partially present. Long and short entries/exits exist, but no-hedge/flip logic is scoped by symbol, not by `(symbol,timeframe)` context. | `core/TradingLoop.js:292-335`, `core/OrderExecutor.js:265-356`, `core/OrderExecutor.js:476-548`, `core/OrderExecutor.js:1158-1245` |
| Multi-position | Partially present. `activeTrades` Map supports multiple trades; `TradingLoop` gates by `getTradesBySymbol(symbol)` and `maxPositions`, but the gate is per symbol and trade matching still has oldest-trade fallbacks. | `core/StateManager.js:111-118`, `core/StateManager.js:376-470`, `core/StateManager.js:1031-1055`, `core/TradingLoop.js:194-196`, `core/OrderExecutor.js:671-714` |
| Global position cap | Not implemented as requested. Current config default is `MAX_POSITIONS=3`; `TradingLoop` checks active trades for the current symbol, not a global 10/15/18 tier gate. | `core/TradingConfig.js:88-91`, `foundation/ConfigLoader.js:119-122`, `core/TradingLoop.js:194-196`, `core/TradingLoop.js:376-382` |
| Multi-timeframe parallel scanning | Not complete. Timeframe histories, AdaptiveTimeframeSelector, TimeFrameManager, CandleAggregator, and MultiTimeframe strategy exist, but runtime picks one active timeframe instead of running every configured timeframe independently. | `core/TradingConfig.js:670-672`, `run-empire-v2.js:677-684`, `run-empire-v2.js:1368-1378`, `modules/MultiTimeframeAdapter.js:1-476`, `core/StrategyOrchestrator.js:482-524` |
| Multi-ticker scanning | Not complete. `SymbolTradingContext` and `CandleStore` are symbol/timeframe-aware, and SessionRouter subscribes multiple stock symbols, but live trading still dispatches `analyzeAndTrade` on one configured symbol path. | `core/SymbolTradingContext.js:78-139`, `core/CandleStore.js:24-76`, `run-empire-v2.js:793-805`, `run-empire-v2.js:1527-1649` |
| Root `priceHistory` hazard | Still present. CandleStore is intended to replace it, but live code still writes/reads root `this.priceHistory` in key paths. | `run-empire-v2.js:137-149`, `run-empire-v2.js:767`, `run-empire-v2.js:1163-1213`, `run-empire-v2.js:1407-1445`, `core/CandleProcessor.js:81-207` |
| CandleStore | Present and right direction. Stores by `symbol -> timeframe -> candles`, validates candles, supports disk load/save. | `core/CandleStore.js:24-76`, `core/CandleStore.js:101-107`, `core/CandleStore.js:193-204`, `core/CandleStore.js:274-365` |
| Volume handling | Present as OHLCV, but not uniformly guarded. ContractValidator requires numeric volume; CandleProcessor can set volume to null on live payloads, which creates a downstream contract risk. | `core/ContractValidator.js:208-230`, `core/CandleProcessor.js:405-591` |
| Strategy isolation | Present. StrategyOrchestrator runs strategies independently, filters, sorts, picks winner, applies confluence, and creates the trade-owned exit contract. | `core/StrategyOrchestrator.js:728-777`, `core/StrategyOrchestrator.js:986-1012`, `core/StrategyOrchestrator.js:1014-1073`, `core/StrategyOrchestrator.js:1099-1131` |
| GRAND-SCHEME strategy: RSI | Present inline in StrategyOrchestrator, not as a standalone module file. | `core/StrategyOrchestrator.js:369-403` |
| GRAND-SCHEME strategy: EMASMACrossover | Present via module and orchestrator registration. | `modules/EMASMACrossoverSignal.js:1-325`, `core/StrategyOrchestrator.js:191-230` |
| GRAND-SCHEME strategy: MADynamicSR | Present via module and orchestrator registration. | `modules/MADynamicSR.js:1-681`, `core/StrategyOrchestrator.js:238-282` |
| GRAND-SCHEME strategy: LiquiditySweep | Present via module and orchestrator registration. | `modules/LiquiditySweepDetector.js:1-429`, `core/StrategyOrchestrator.js:289-332` |
| GRAND-SCHEME strategy: MarketRegime | Present via detector/orchestrator registration. | `core/MarketRegimeDetector.js:1-146`, `core/StrategyOrchestrator.js:430-476` |
| GRAND-SCHEME strategy: MultiTimeframe | Present as a strategy, but not the same thing as parallel multi-timeframe fanout. | `core/StrategyOrchestrator.js:482-524`, `modules/MultiTimeframeAdapter.js:1-476` |
| GRAND-SCHEME strategy: OGZTPO | Present through OgzTpoIntegration and orchestrator registration. | `core/OgzTpoIntegration.js:1-448`, `core/StrategyOrchestrator.js:531-573` |
| GRAND-SCHEME strategy: OpeningRangeBreakout | Present via module and orchestrator registration, disabled by default in ConfigLoader. | `modules/OpeningRangeBreakout.js:1-358`, `core/StrategyOrchestrator.js:578-613`, `foundation/ConfigLoader.js:205-216` |
| GRAND-SCHEME strategy: SmartMoneySweep | Present via module and orchestrator registration. | `modules/SmartMoneySweep.js:1-1019`, `core/StrategyOrchestrator.js:619-658` |
| Extra strategies/modules | BreakRetest, CandlePattern, NoWickImbalance, and FairValueGap exist; FairValueGap is not currently one of the registered StrategyOrchestrator entries read in this pass. | `modules/BreakAndRetest.js:1-651`, `modules/NoWickImbalance.js:1-350`, `modules/FairValueGapDetector.js:1-220`, `core/StrategyOrchestrator.js:337-365`, `core/StrategyOrchestrator.js:406-427`, `core/StrategyOrchestrator.js:661-673` |
| Exit contracts | Present and trade-owned. `ExitContractManager` creates contracts and exit checking reads the trade's own contract. Some config contracts carry `_validated` metadata; no cryptographic fingerprint/validation enforcement is present. | `core/ExitContractManager.js:1-14`, `core/ExitContractManager.js:100-159`, `core/ExitContractManager.js:249-312`, `core/TradingConfig.js:268-405`, `core/ContractValidator.js:181-198` |
| Per-trade MaxProfitManager | Present as a per-trade map in OrderExecutor; this is the right direction for multi-position exits, but trade identity still needs session/timeframe keys. | `run-empire-v2.js:731-737`, `core/OrderExecutor.js:374-380`, `core/OrderExecutor.js:1141-1145`, `core/OrderExecutor.js:1411-1416` |
| DynamicPositionSizer | Built but not wired into live sizing. Runtime comments explicitly keep inline confidence sizing. | `core/DynamicPositionSizer.js:1-41`, `core/DynamicPositionSizer.js:145-265`, `run-empire-v2.js:735`, `run-empire-v2.js:999`, `core/BacktestRunner.js:311-312` |
| Risk management | Present: RiskManager composes DrawdownTracker and PnLTracker, gates drawdown/loss limits/confidence; KillSwitch is file-based. Current risk/account state is not session-isolated. | `core/RiskManager.js:1-39`, `core/RiskManager.js:86-187`, `core/RiskManager.js:193-224`, `core/DrawdownTracker.js:12-183`, `core/KillSwitch.js:1-184` |
| PositionTracker immutability | Present as a safer sole-writer wrapper, but OrderExecutor still calls StateManager directly in active paths. | `core/PositionTracker.js:1-14`, `core/PositionTracker.js:109-183`, `core/OrderExecutor.js:265-356`, `core/OrderExecutor.js:476-548` |
| Pattern memory architecture | Split across PatternMemoryBank, UnifiedPatternMemory, and TRAIPatternIntegration. It has mode/asset bucketing and promotion/quarantine, but it is not Fort-Knox: no per `(session,symbol,timeframe)` banks, no signed packs, no append-only event log, no two-key promotion checkpoint. | `core/PatternMemoryBank.js:24-29`, `core/PatternMemoryBank.js:70-76`, `core/PatternMemoryBank.js:397-429`, `core/UnifiedPatternMemory.js:147-193`, `core/UnifiedPatternMemory.js:417-443`, `core/TRAIPatternIntegration.js:37-64` |
| Pattern pack loading | Present and unsigned JSON-based. It loads `patterns` and `antiPatterns` and applies confidence multipliers. | `core/TRAIPatternIntegration.js:37-64`, `core/TRAIPatternIntegration.js:75-143` |
| TRAI pipeline role | Present as a passive/advisory decision module with pattern memory, LLM fallback, risk assessment, reasoning, telemetry, and dashboard broadcast. Current constructor default is passive. | `core/TRAIDecisionModule.js:1-18`, `core/TRAIDecisionModule.js:41-64`, `core/TRAIDecisionModule.js:154-292`, `core/TRAIDecisionModule.js:878-952` |
| TRAI responsibilities from GRAND-SCHEME | Partially present. Trading decision explanation, pattern learning, telemetry, web context, memory, backtest analysis hooks, and support/chat scaffolding exist. Product/concierge/multimodal responsibilities are mostly outside the backend trading engine scope. | `ogz-meta/GRAND-SCHEME.md:50-73`, `core/TRAIDecisionModule.js:295-337`, `core/trai_core.js:2-38`, `core/TRAIWebContext.js:1-24`, `core/BacktestRunner.js:286-298` |
| ARMS | Not present as live backend code under `core/`, `brokers/`, `modules/`, or `foundation`. Closest live equivalents are RiskManager/DrawdownTracker and MarketRegimeDetector. | `rg --files | rg -i "arms"` returns no backend module; `core/RiskManager.js:1-39`, `core/MarketRegimeDetector.js:1-146` |
| NeuralMeshArchitecture | Not present as live backend code. Mentions are in docs/dashboard history, not active trading bot modules. | `rg --files | rg -i "neural"` returns no backend module |
| CorrelationAnalyzer | Not present as a standalone live backend module. Correlation concepts exist inside MarketRegimeDetector and AssetConfigManager. | `rg --files | rg -i "correlation"` returns no backend module; `core/MarketRegimeDetector.js:57-64`, `core/MarketRegimeDetector.js:130-133`, `core/AssetConfigManager.js:250-287` |
| PerformanceAnalyzer | Present and wired into runner/OrderExecutor context, but not a replacement for Fort-Knox promotion governance. | `core/PerformanceAnalyzer.js:1-48`, `run-empire-v2.js:476`, `run-empire-v2.js:971`, `core/OrderExecutor.js:1420-1430` |
| Backtest/live path | Partially unified but still divergent. BacktestRunner feeds `handleMarketData` and `analyzeAndTrade`, but it still depends on root `priceHistory` and custom data flow. | `core/BacktestRunner.js:24-99`, `core/BacktestRunner.js:119-163`, `run-empire-v2.js:1780` |
| Dirty tree | Live workspace is dirty. This design intentionally does not modify source and should be reviewed against the current worktree before implementation. | `git diff --stat`; `git status --short` |

## Ground Truth Summary

The codebase already has a real broker abstraction, a real strategy-orchestrator winner model, real trade-owned exit contracts, symbol-aware candle/state repairs, and a serious pattern-memory foundation.

The architecture gaps are concentrated in three backend places:

1. SessionRouter still switches brokers sequentially on top of shared singleton state.
2. Trading dispatch still behaves like one active symbol/timeframe at execution time, even though symbol/timeframe storage primitives exist.
3. Pattern memory is useful but not Fort-Knox-grade: provenance, isolation, signed imports, append-only history, promotion governance, and rollback are missing.

## WHAT I DID DO

Read the V3 architecture prompt, starter digest, Fort-Knox spec, latest session docs, alignment docs, GRAND-SCHEME, and live backend code. Verified live modules with targeted `rg`, `nl`, `sed`, `find`, `wc`, and read-only git commands. Built this inventory from live code rather than the digest when they disagreed.

## WHAT I DID NOT DO

I did not modify backend source, run pipelines, commit, push, change UI code, define downstream schemas, or implement the architecture.

## WHAT I ASSUMED

The live VPS worktree is ground truth even when dirty. The correct P0 anchor is `$13,213.042341608163`. Backend trading-bot scope excludes UI and infrastructure-stack work.

## OPEN QUESTIONS FOR OPERATOR

None. No product-level WHAT decision surfaced during inventory.
