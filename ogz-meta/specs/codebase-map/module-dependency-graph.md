# Module Dependency Graph for OGZPrime Candle and Trade Pipeline

This is the canonical module dependency graph for the OGZPrime trading bot's hot-path files. Generated 2026-05-11 from a whole-codebase DeepSearch audit keyed to commit `004af8c` on `rebuild/clean-from-baseline`. Mercury indexes this file; Serena validates it via `serena-validation-manifest.json` (SCHECK-01 through SCHECK-10).

The graph covers the 12 hot-path files and their immediate neighbors. Centrality scores reflect both import-graph degree and data-flow spine position — a file with few imports but every candle flowing through it is HIGH centrality.

## Top-level Centrality Summary

The OGZPrime module dependency graph identifies these critical centrality positions for the candle and trade pipeline:

| File | Centrality | Why |
|---|---|---|
| `foundation/ConfigLoader.js` | CRITICAL | Loaded first by `run-empire-v2.js`, supplies all config to all modules |
| `core/TradingConfig.js` | CRITICAL | Most widely imported file in hot path (6 importers). Single point of config failure |
| `core/StateManager.js` | CRITICAL | Singleton, imported by 4+ hot-path files, holds ALL trading state |
| `core/StrategyOrchestrator.js` | HIGH SPINE | Highest fan-out in hot path (11 deps), single caller (TradingLoop) |
| `core/TradingLoop.js` | HIGH SPINE | 9 imports, called once per candle, orchestrates all hot-path modules |
| `core/OrderExecutor.js` | HIGH SPINE | 7 imports, single caller, handles all trade execution including partial close |
| `core/ExitContractManager.js` | HIGH SPINE | 3 hot-path importers, singleton |
| `core/SymbolTradingContext.js` | HIGH | Fan-out to 5 modules, fan-in from 3 hot-path callers |
| `core/TradeNarrator.js` | HIGH | 4 hot-path importers, diagnostic/logging utility |
| `core/CandleStore.js` | HIGH | Only 2 outgoing deps, but EVERY candle flows through it |

## Adjacency Map (hot path + supporting files)

This section enumerates the imports/imported-by edges for each hot-path file in the OGZPrime module dependency graph. UNVERIFIED markers indicate the audit did not directly confirm the line/file but the relationship is asserted by ground truth.

```json
{
  "core/CandleStore.js": {
    "imports": ["./ContractValidator (line 13)", "./CandleHelper (line 14)"],
    "imported_by": [
      "core/CandleProcessor.js (UNVERIFIED — requires CandleStore via SymbolTradingContext)",
      "core/SymbolTradingContext.js (constructor injection, candleStore param)",
      "run-empire-v2.js (line 1186 via this._candleStore)"
    ],
    "centrality": "HIGH — only 2 outgoing deps, but EVERY candle in the system flows through it"
  },

  "core/CandleProcessor.js": {
    "imports": [
      "./StateManager (line 18)",
      "../foundation/ConfigLoader (line 19)",
      "../foundation/ohlc-normalize (line 20)",
      "../foundation/MarketCalendar (line 21)"
    ],
    "imported_by": ["run-empire-v2.js (instantiated as primary candle router)"],
    "centrality": "MEDIUM — leaf in import graph but spine in data flow (all candles route through)"
  },

  "core/SymbolTradingContext.js": {
    "imports": [
      "./indicators/IndicatorEngine (line 22)",
      "../modules/EMASMACrossoverSignal (line 23)",
      "../modules/MADynamicSR (line 24)",
      "./VolumeProfile (line 25)",
      "./FibonacciDetector (line 26)"
    ],
    "imported_by": [
      "run-empire-v2.js (instantiated per symbol)",
      "core/TradingLoop.js (receives ctx as param)",
      "core/StrategyOrchestrator.js (receives ctx as param)"
    ],
    "centrality": "HIGH — fan-out to 5 modules AND fan-in from 3 hot-path callers"
  },

  "core/StrategyOrchestrator.js": {
    "imports": [
      "./ExitContractManager (line 31)",
      "./TradeNarrator (line 32)",
      "./MAExtensionFilter (line 38)",
      "./TradingConfig (line 39)",
      "../modules/OpeningRangeBreakout (line 40)",
      "../modules/EMASMACrossoverSignal (line 44)",
      "../modules/MADynamicSR (line 45)",
      "../modules/LiquiditySweepDetector (line 46)",
      "../modules/MultiTimeframeAdapter (line 47)",
      "./OgzTpoIntegration (line 48)",
      "../modules/SmartMoneySweep (line 49)"
    ],
    "imported_by": ["core/TradingLoop.js (calls orchestrator.evaluate)"],
    "centrality": "HIGH SPINE — highest fan-out in hot path (11 deps) with single caller (TradingLoop)"
  },

  "core/TradingLoop.js": {
    "imports": [
      "./CandleHelper (line 23)",
      "./StateManager (line 24)",
      "./RegimeDetector (line 25)",
      "./FeatureExtractor (line 26)",
      "./FeatureFlagManager (line 27)",
      "./TradingConfig (line 28)",
      "./ExitContractManager (line 29)",
      "./CandlePatternDetector (line 30)",
      "./TradeNarrator (line 31)"
    ],
    "imported_by": ["run-empire-v2.js (orchestrates TradingLoop.analyzeAndTrade per candle)"],
    "centrality": "HIGH SPINE — 9 imports, called once per candle, orchestrates all hot-path modules"
  },

  "core/OrderRouter.js": {
    "imports": ["events (Node stdlib, line 21)"],
    "imported_by": [
      "run-empire-v2.js (holds all 14 adapters)",
      "core/OrderExecutor.js (UNVERIFIED — routes orders via OrderRouter)"
    ],
    "centrality": "MEDIUM — simple aggregation hub"
  },

  "core/OrderExecutor.js": {
    "imports": [
      "./StateManager (line 14)",
      "./TradingConfig (line 15)",
      "./ExitContractManager (line 16)",
      "./MaxProfitManager (line 17)",
      "../ogz-meta/claudito-logger (line 19)",
      "./UnifiedPatternMemory (line 20)",
      "./PIDController (line 21)"
    ],
    "imported_by": ["core/TradingLoop.js (calls executeTrade)"],
    "centrality": "HIGH SPINE — 7 imports, single caller, handles all trade execution including partial close"
  },

  "core/StateManager.js": {
    "imports": [
      "./TradingConfig (line 71)",
      "../foundation/ConfigLoader (line 72)",
      "./TradeNarrator (line 73)"
    ],
    "imported_by": [
      "core/CandleProcessor.js (line 18)",
      "core/TradingLoop.js (line 24)",
      "core/OrderExecutor.js (line 14)",
      "run-empire-v2.js (implicit via singleton)"
    ],
    "centrality": "CRITICAL — imported by 4+ hot-path files, singleton, holds ALL trading state"
  },

  "core/ExitContractManager.js": {
    "imports": [
      "./TradingConfig (line 20)",
      "./exit/StopLossChecker (line 23)",
      "./exit/TakeProfitChecker (line 24)",
      "./exit/DynamicTrailingStop (line 25)",
      "./exit/MaxHoldChecker (line 26)",
      "./exit/BreakEvenManager (line 28)"
    ],
    "imported_by": [
      "core/StrategyOrchestrator.js (line 31)",
      "core/TradingLoop.js (line 29)",
      "core/OrderExecutor.js (line 16)"
    ],
    "centrality": "HIGH SPINE — imported by 3 hot-path files, singleton"
  },

  "core/MaxProfitManager.js": {
    "imports": ["./TradingConfig (line 64)", "./TradeNarrator (line 65)"],
    "imported_by": ["core/OrderExecutor.js (line 17)"],
    "centrality": "MEDIUM — deep in trade lifecycle, single direct importer"
  },

  "core/TradingConfig.js": {
    "imports": ["UNVERIFIED — likely reads ConfigLoader or is self-contained"],
    "imported_by": [
      "core/StateManager.js (line 71)",
      "core/TradingLoop.js (line 28)",
      "core/OrderExecutor.js (line 15)",
      "core/ExitContractManager.js (line 20)",
      "core/MaxProfitManager.js (line 64)",
      "core/StrategyOrchestrator.js (line 39)"
    ],
    "centrality": "CRITICAL — most widely imported file in hot path (6 importers). Single point of config failure."
  },

  "modules/EMASMACrossoverSignal.js": {
    "imports": ["../core/CandleHelper (line 23)"],
    "imported_by": [
      "core/SymbolTradingContext.js (line 23)",
      "core/StrategyOrchestrator.js (line 44)"
    ],
    "centrality": "MEDIUM — minimal deps, dual importer (both STC and Orchestrator maintain separate instances)"
  },

  "core/ContractValidator.js": {
    "imports": [],
    "imported_by": ["core/CandleStore.js (line 13)"],
    "centrality": "LOW — leaf module"
  },

  "core/CandleHelper.js": {
    "imports": [],
    "imported_by": [
      "core/CandleStore.js (line 14)",
      "core/TradingLoop.js (line 23)",
      "modules/EMASMACrossoverSignal.js (line 23)"
    ],
    "centrality": "MEDIUM — utility leaf, 3 importers in hot path"
  },

  "core/TradeNarrator.js": {
    "imports": ["UNVERIFIED"],
    "imported_by": [
      "core/StateManager.js (line 73)",
      "core/TradingLoop.js (line 31)",
      "core/StrategyOrchestrator.js (line 32)",
      "core/MaxProfitManager.js (line 65)"
    ],
    "centrality": "HIGH — 4 hot-path importers, diagnostic/logging utility"
  },

  "foundation/ConfigLoader.js": {
    "imports": ["crypto (Node stdlib, line 24)"],
    "imported_by": [
      "core/CandleProcessor.js (line 19)",
      "core/StateManager.js (line 72)",
      "run-empire-v2.js (line 4 — loaded first)"
    ],
    "centrality": "CRITICAL — loaded first by run-empire-v2, supplies all config to all modules"
  },

  "run-empire-v2.js": {
    "imports": [
      "./foundation/ConfigLoader (line 4)",
      "PLUS approximately 20+ other direct requires (UNVERIFIED full list)"
    ],
    "imported_by": [],
    "centrality": "ROOT — entry point, imports everything, imported by nothing"
  }
}
```

## Provenance

Generated by DeepSearch audit (Sourcegraph instance `ogzprime.sourcegraph.app`) on 2026-05-11, response landed at `ogz-meta/ledger/weresofucked.md`. The audit performed direct `repo:` queries against rebuild/clean-from-baseline branch to confirm each `require()` statement at the cited line. UNVERIFIED markers indicate the relationship was inferred from ground truth rather than directly read.
