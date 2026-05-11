# Architecture Drift Report — OGZPrime mermaid charts vs. current code

This is the architecture drift audit for OGZPrime. It compares the legacy `ogzprime-architecture.mermaid` and `ogzprime-broker-chain.mermaid` charts (in `ogz-meta/ledger/`) against the current code on `rebuild/clean-from-baseline` (commit `004af8c`). Mercury retrieves this file when asked about architecture.

The mermaid charts were authored at an earlier version ("V14"). The hot-path coverage score is **17% (2/12 stages correctly represented)**. The mermaid is no longer load-bearing for new-engineer onboarding and actively misleads Mercury until this drift report is indexed alongside.

## Why this drift report exists

The architecture drift report exists because Mercury treats any indexed mermaid chart as ground truth. If the mermaid says `OptimizedTradingBrain` is the decision spine but the code uses `StrategyOrchestrator`, Mercury retrieves "TradingBrain" for decision queries and finds nothing — leading to hallucination or empty answers. This report exposes those broken pointers so Mercury can route queries to current names instead.

## DRIFT CLASS 1 — MERMAID-DEAD references

These references exist in the legacy mermaid but DO NOT exist in current code. Mercury must not retrieve them as authoritative.

| Mermaid node/edge | Claimed behavior | Reality in current code | Urgency |
|---|---|---|---|
| `TB_MOD` "OptimizedTradingBrain (3422 lines)" | Central decision module | DOES NOT EXIST in current hot path. `StrategyOrchestrator.js` replaced it. The mermaid has no StrategyOrchestrator node. | CRITICAL — Mercury retrieves "TradingBrain" for decision queries and finds nothing |
| `EL` "AdvancedExecutionLayer" | `executeTrade(params) → Kraken order` | Replaced by `OrderExecutor.js`. `AdvancedExecutionLayer` is absent from all core/ imports. | CRITICAL — Mercury routing "execution" queries to dead module |
| `KAS` "kraken_adapter_simple.js" | Raw Kraken connection, inner-bot WS layer | Replaced by `KrakenIBrokerAdapter.js` acting directly on WS. `kraken_adapter_simple` is not in current brokers/. | CRITICAL |
| `bot.kraken.kraken = kraken_adapter_simple` | Two-layer accessor | Only one layer now: `KrakenIBrokerAdapter` directly. | HIGH |
| `HMD` "handleMarketData" → `this.priceHistory[200max]` | Pushes to global array, max 200 | Now: `CandleProcessor.js` routes to `CandleStore`. `priceHistory` is a legacy shim (Finding 1). | HIGH |
| `AAT_STEPS` calling `tradingBrain.getDecision()` | Core decision call | Now: `TradingLoop.analyzeAndTrade()` calls `StrategyOrchestrator.evaluate()`. | CRITICAL |
| `TRAI` "TRAIDecisionModule processDecision" → `MTD` | TRAI output feeds into makeTradeDecision | Now: orchestrator outputs feed directly to OrderExecutor. TRAI integration point UNVERIFIED in current code. | HIGH |
| `RM` "RiskManager calculatePositionSize" in execution path | Called by executeTrade | `riskManagerBypass: true` by default (ConfigLoader.js:152). RiskManager is bypassed. | MEDIUM |
| `RL` "ExecutionRateLimiter" | `allow()` gate in executeTrade | UNVERIFIED whether still active in OrderExecutor hot path. | MEDIUM |
| Broker chain `bot.kraken.kraken` two-layer | Two-layer pattern | Current: `KrakenIBrokerAdapter` wraps WS directly. No intermediate `kraken_adapter_simple` layer. | CRITICAL |
| Symbol format diagram: "Bot Internal / IBroker = BTC/USD (slash)" | SLASH is the internal canonical | WRONG. Current canonical is DASH (`BTC-USD`). ASSET_REGISTRY at `SymbolTradingContext.js:34-68` is all dash. | CRITICAL — actively wrong, confuses Mercury |

## DRIFT CLASS 2 — CODE-NEW references

These modules exist in current code but are MISSING from any mermaid. New-engineer reading the mermaid has zero visibility into them.

| Code module/pattern | What it does | Missing from mermaid | Urgency |
|---|---|---|---|
| `core/CandleProcessor.js` | Routes candles from broker → CandleStore → SymbolTradingContext | Not in any mermaid | CRITICAL |
| `core/CandleStore.js` | All candle storage, persistence, schema versioning | Not in any mermaid | CRITICAL |
| `core/SymbolTradingContext.js` | Per-symbol context with ASSET_REGISTRY, priceHistory getter | Not in any mermaid | CRITICAL |
| `core/StrategyOrchestrator.js` | Replaced TradingBrain — evaluates 5+ strategies, returns winner | Not in any mermaid | CRITICAL |
| `core/OrderExecutor.js` | Replaced AdvancedExecutionLayer — all trade lifecycle | Not in any mermaid | CRITICAL |
| `core/ExitContractManager.js` | All exit logic — StopLoss, MaxHold, BreakEven | Not in any mermaid | HIGH |
| `core/MaxProfitManager.js` | Profit-side exits, tier system | Not in any mermaid (listed inside TradingBrain description in old diagram) | HIGH |
| `core/TradingConfig.js` | Central config (most imported hot-path file) | Not in any mermaid | HIGH |
| `foundation/ConfigLoader.js` | All env var reads, config freeze | Not in any mermaid | HIGH |
| `core/TradingLoop.js` | Per-candle orchestration wrapper | Not in any mermaid | HIGH |
| 13 non-Kraken broker adapters | Alpaca, Binance, Coinbase, etc. | Not in broker chain mermaid (only Kraken shown) | MEDIUM |
| `core/ContractValidator.js` | Validates candles in monitor/strict mode | Not in any mermaid | LOW |

## DRIFT CLASS 3 — DIVERGENT edges

Where the mermaid shows X→Y but code shows X→Z. These are misleading rather than absent.

| Mermaid edge | Code reality | Severity |
|---|---|---|
| `KIB → HMD: emit('ohlc')` → `handleMarketData` pushes to `priceHistory` | `KIB (or AlpacaAdapter) → emit('ohlc') → run-empire-v2 OHLC handler → CandleProcessor.addCandle() → CandleStore → SymbolTradingContext.priceHistory getter` | CRITICAL — 4-layer chain vs 1-layer in mermaid |
| `SF2 "Bot Internal = BTC/USD (slash)"` used throughout | ASSET_REGISTRY = `BTC-USD` (dash). StateManager normalizes to dash. | CRITICAL — symbol format is wrong |
| `O1 run-empire-v2 → O2 AdvancedExecutionLayer → O3 KrakenIBrokerAdapter` | `TradingLoop.analyzeAndTrade → OrderExecutor.executeTrade → (broker adapter)` | CRITICAL |
| `TB_MOD → TRAI → MTD → ET` | `StrategyOrchestrator.evaluate → TradingLoop.analyzeAndTrade → OrderExecutor.executeTrade` | CRITICAL |
| `RiskManager` in execution path | bypassed by default | MEDIUM |

## Hot-path coverage score

Of the 12 hot-path stages (S1-S12 from the e2e lifecycle audit at `ogz-meta/ledger/weresofucked.md` Deliverable 2):

- **S1 (Broker WS ingestion):** mermaid shows Kraken-only path, misses 13 adapters, misses CandleProcessor — WRONG
- **S2 (CandleProcessor routing):** NOT IN MERMAID
- **S3 (CandleStore mutation):** NOT IN MERMAID
- **S4 (ctx.priceHistory getter):** NOT IN MERMAID
- **S5 (StrategyOrchestrator evaluate):** NOT IN MERMAID (shows dead TradingBrain)
- **S6 (Position sizing):** partially (RiskManager shown but bypassed)
- **S7 (ExitContractManager):** NOT IN MERMAID
- **S8 (OrderExecutor):** NOT IN MERMAID (shows dead AdvancedExecutionLayer)
- **S9 (StateManager trade record):** partially (StateManager node exists)
- **S10 (PnL computation):** NOT IN MERMAID
- **S11 (state.json reload):** NOT IN MERMAID
- **S12 (candle-history.json snapshot):** NOT IN MERMAID

**Coverage: 2/12 = 17%.** The mermaid is not load-bearing for onboarding. It actively misleads Mercury.

## Proposed mermaid repair (minimum chart)

Replace the entire `ogzprime-architecture.mermaid` with a flowchart that has these nodes:

```
ConfigLoader (foundation)
TradingConfig (all 6 importers)
BrokerAdapter [AlpacaAdapter/KrakenIBrokerAdapter/etc] → emit('ohlc')
  → run-empire-v2 OHLC handler
  → CandleProcessor.addCandle (UPDATE/NEW paths)
  → CandleStore.store Map
  → SymbolTradingContext.priceHistory (shallow copy)
  → TradingLoop.analyzeAndTrade
  → StrategyOrchestrator.evaluate
      → EMASMACrossoverSignal.update
      → (4 other strategies)
      → ExitContractManager.checkExitConditions (if in position)
  → OrderExecutor.executeTrade
      → StateManager.openPosition / closePosition / reducePosition
      → MaxProfitManager.start / update
      → (broker adapter.placeBuyOrder / placeSellOrder)
  → StateManager.save → data/state.json
```

The broker chain mermaid needs: 14 adapters, dash-canonical as the internal form, and the symbol normalization failures at 6 adapters flagged.

## Source

Audit response at `ogz-meta/ledger/weresofucked.md` (Deliverable 9.1). Drift class counts: 11 MERMAID-DEAD, 14 CODE-NEW, 4 DIVERGENT. Each row's claim is backed by direct Sourcegraph queries against `rebuild/clean-from-baseline@004af8c`.
