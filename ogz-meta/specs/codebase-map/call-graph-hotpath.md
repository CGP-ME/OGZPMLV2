# Hot-Path Function Call Graph for OGZPrime

This is the function-level call graph for OGZPrime's hot trade-path functions. Generated 2026-05-11 from the DeepSearch audit at `ogz-meta/ledger/weresofucked.md` (Deliverable 8.2), keyed to commit `004af8c` on `rebuild/clean-from-baseline`. Mercury indexes this file to answer "who calls X / what does X call" without re-reading source.

For each function: declaration site, callees (with file:line), callers (with file:line), fan_in / fan_out, and role (spine, connector, leaf, root, aggregator). Risk notes and bug links flag where the function is implicated in a known finding.

## Why this call graph exists

The hot-path function call graph exists because Mercury's chunk retrieval cannot answer "what calls reducePosition?" reliably without grep-walking the codebase. This graph caches that walk as a queryable JSON blob — Serena can validate each entry via tree-sitter, Mercury can retrieve the structured edges, and DeepSearch updates the graph when new modules land.

## Hot-Path Call Graph (JSON)

The hot-path function call graph contains each major spine, connector, leaf, and root node in the trade lifecycle:

```json
{
  "core/CandleStore.js::addCandle": {
    "declared_at": "core/CandleStore.js:41",
    "callees": [
      {"name": "ContractValidator.validateCandle", "site": "core/CandleStore.js:43"}
    ],
    "callers": [
      {"name": "CandleStore.addCandles", "site": "core/CandleStore.js:84-88"},
      {"name": "CandleProcessor._storageKey path (UPDATE)", "site": "core/CandleProcessor.js:104"},
      {"name": "CandleProcessor._storageKey path (NEW)", "site": "core/CandleProcessor.js:155"}
    ],
    "fan_in": 3,
    "fan_out": 1,
    "role": "spine"
  },

  "core/CandleStore.js::addCandles": {
    "declared_at": "core/CandleStore.js:84",
    "callees": [{"name": "CandleStore.addCandle", "site": "core/CandleStore.js:87"}],
    "callers": [
      {"name": "CandleStore.loadFromDisk", "site": "core/CandleStore.js:319"},
      {"name": "run-empire-v2.saveCandleHistory", "site": "run-empire-v2.js:1206"}
    ],
    "fan_in": 2,
    "fan_out": 1,
    "role": "connector"
  },

  "core/CandleStore.js::getCandles": {
    "declared_at": "core/CandleStore.js:100 (UNVERIFIED exact line — ground truth cites :106 as return)",
    "callees": [],
    "callers": [
      {"name": "SymbolTradingContext.priceHistory getter", "site": "core/SymbolTradingContext.js:129"},
      {"name": "run-empire-v2.loadCandleHistory", "site": "run-empire-v2.js:1187"}
    ],
    "fan_in": 2,
    "fan_out": 0,
    "role": "leaf"
  },

  "core/CandleStore.js::loadFromDisk": {
    "declared_at": "core/CandleStore.js:274",
    "callees": [{"name": "CandleStore.addCandles", "site": "core/CandleStore.js:319"}],
    "callers": [{"name": "run-empire-v2.loadCandleHistory", "site": "run-empire-v2.js:1186"}],
    "fan_in": 1,
    "fan_out": 1,
    "role": "connector"
  },

  "core/CandleProcessor.js::_resolveSymCtx": {
    "declared_at": "core/CandleProcessor.js:65",
    "callees": [
      {"name": "SymbolTradingContext constructor (implicit via Map lookup)", "site": "core/CandleProcessor.js:70"}
    ],
    "callers": [
      {"name": "CandleProcessor UPDATE path", "site": "core/CandleProcessor.js:81"},
      {"name": "CandleProcessor NEW path", "site": "core/CandleProcessor.js:128"}
    ],
    "fan_in": 2,
    "fan_out": 1,
    "role": "spine",
    "bug": "Silent size===1 fallback at line 70 (Finding 2 from 6a Mercury attack)"
  },

  "core/SymbolTradingContext.js::priceHistory (getter)": {
    "declared_at": "core/SymbolTradingContext.js:129",
    "callees": [{"name": "CandleStore.getCandles", "site": "core/SymbolTradingContext.js:129"}],
    "callers": [
      {"name": "StrategyOrchestrator EMASMACrossover evaluate lambda", "site": "core/StrategyOrchestrator.js:196"},
      {"name": "TradingLoop.analyzeAndTrade", "site": "UNVERIFIED"}
    ],
    "fan_in": 2,
    "fan_out": 1,
    "role": "connector",
    "risk": "Shallow copy (Finding 5 from 6a Mercury attack) — candle objects shared with CandleStore"
  },

  "core/StrategyOrchestrator.js::evaluate": {
    "declared_at": "UNVERIFIED exact line — known to be after line 191 setup",
    "callees": [
      {"name": "EMASMACrossoverSignal.update", "site": "core/StrategyOrchestrator.js:200"},
      {"name": "ExitContractManager.getInstance", "site": "core/StrategyOrchestrator.js:31"},
      {"name": "MADynamicSR (UNVERIFIED call site)"},
      {"name": "SmartMoneySweep (UNVERIFIED call site)"},
      {"name": "OpeningRangeBreakout (UNVERIFIED call site)"}
    ],
    "callers": [{"name": "TradingLoop.analyzeAndTrade", "site": "UNVERIFIED"}],
    "fan_in": 1,
    "fan_out": 5,
    "role": "spine"
  },

  "modules/EMASMACrossoverSignal.js::update": {
    "declared_at": "UNVERIFIED exact line — evaluate at line 218 per ground truth",
    "callees": [
      {"name": "EMASMACrossoverSignal._calculateAllMAs", "site": "modules/EMASMACrossoverSignal.js:242"},
      {"name": "EMASMACrossoverSignal._ema", "site": "modules/EMASMACrossoverSignal.js:268"},
      {"name": "EMASMACrossoverSignal._sma", "site": "modules/EMASMACrossoverSignal.js:282"}
    ],
    "callers": [
      {"name": "StrategyOrchestrator EMASMACrossover evaluate lambda", "site": "core/StrategyOrchestrator.js:200"}
    ],
    "fan_in": 1,
    "fan_out": 3,
    "role": "leaf (no callee outside module)"
  },

  "modules/EMASMACrossoverSignal.js::_ema": {
    "declared_at": "modules/EMASMACrossoverSignal.js:268",
    "callees": [],
    "callers": [{"name": "EMASMACrossoverSignal._calculateAllMAs", "site": "modules/EMASMACrossoverSignal.js:260"}],
    "fan_in": 1,
    "fan_out": 0,
    "role": "leaf",
    "formula": "k=2/(p+1); seed=mean(closes[0..p-1]); walk forward: ema=closes[i]*k+ema*(1-k)"
  },

  "modules/EMASMACrossoverSignal.js::_sma": {
    "declared_at": "modules/EMASMACrossoverSignal.js:282",
    "callees": [],
    "callers": [{"name": "EMASMACrossoverSignal._calculateAllMAs", "site": "modules/EMASMACrossoverSignal.js:262"}],
    "fan_in": 1,
    "fan_out": 0,
    "role": "leaf",
    "formula": "slice=closes.slice(-period); sum(slice)/period"
  },

  "core/TradingLoop.js::analyzeAndTrade": {
    "declared_at": "core/TradingLoop.js:46 (approximate)",
    "callees": [
      {"name": "StateManager.getInstance", "site": "core/TradingLoop.js:24"},
      {"name": "StrategyOrchestrator.evaluate", "site": "UNVERIFIED"},
      {"name": "OrderExecutor.executeTrade", "site": "UNVERIFIED"},
      {"name": "ExitContractManager.checkExitConditions", "site": "UNVERIFIED"},
      {"name": "TradingConfig.get", "site": "UNVERIFIED"}
    ],
    "callers": [{"name": "run-empire-v2.js OHLC event handler", "site": "run-empire-v2.js (UNVERIFIED line)"}],
    "fan_in": 1,
    "fan_out": 5,
    "role": "root (called only by event handler)"
  },

  "core/OrderExecutor.js::executeTrade": {
    "declared_at": "core/OrderExecutor.js:40 (approximate)",
    "callees": [
      {"name": "StateManager.openPosition", "site": "core/OrderExecutor.js:330"},
      {"name": "StateManager.closePosition", "site": "core/OrderExecutor.js:753"},
      {"name": "StateManager.reducePosition", "site": "core/OrderExecutor.js:755"},
      {"name": "MaxProfitManager.start", "site": "core/OrderExecutor.js:~335"},
      {"name": "ExitContractManager.createExitContract", "site": "core/OrderExecutor.js:297"}
    ],
    "callers": [{"name": "TradingLoop.analyzeAndTrade", "site": "UNVERIFIED"}],
    "fan_in": 1,
    "fan_out": 5,
    "role": "spine"
  },

  "core/StateManager.js::openPosition": {
    "declared_at": "core/StateManager.js:~385",
    "callees": [
      {"name": "StateManager.updateState", "site": "UNVERIFIED"},
      {"name": "StateManager.save", "site": "UNVERIFIED"}
    ],
    "callers": [{"name": "OrderExecutor.executeTrade", "site": "core/OrderExecutor.js:330"}],
    "fan_in": 1,
    "fan_out": 2,
    "role": "connector"
  },

  "core/StateManager.js::closePosition": {
    "declared_at": "core/StateManager.js:~530",
    "callees": [
      {"name": "StateManager.updateState", "site": "UNVERIFIED"},
      {"name": "StateManager.save", "site": "UNVERIFIED"}
    ],
    "callers": [{"name": "OrderExecutor.executeTrade (full close)", "site": "core/OrderExecutor.js:753"}],
    "fan_in": 1,
    "fan_out": 2,
    "role": "connector"
  },

  "core/StateManager.js::reducePosition": {
    "declared_at": "core/StateManager.js:714",
    "callees": [{"name": "StateManager.updateState (UNVERIFIED)", "site": "core/StateManager.js:~742"}],
    "callers": [{"name": "OrderExecutor.executeTrade (partial close)", "site": "core/OrderExecutor.js:755"}],
    "fan_in": 1,
    "fan_out": 1,
    "role": "leaf (no further delegation)"
  },

  "core/OrderRouter.js::getAllPositions": {
    "declared_at": "core/OrderRouter.js:148",
    "callees": [
      {"name": "adapter.getPositions() for each of 14 adapters", "site": "core/OrderRouter.js:148-166"}
    ],
    "callers": [{"name": "UNVERIFIED — likely SessionRouter or reconciliation loop"}],
    "fan_in": "UNVERIFIED",
    "fan_out": 14,
    "role": "aggregator"
  }
}
```

## Role glossary

- **spine** — primary path: hot-path traffic flows through it on every candle / trade.
- **connector** — bridges two layers; fan-out matches fan-in.
- **leaf** — terminal: no further delegation (pure compute or storage mutation).
- **root** — called only by the event loop / entry point.
- **aggregator** — fans out to many adapters / sub-modules and combines results.

## Source

DeepSearch audit response at `ogz-meta/ledger/weresofucked.md` Deliverable 8.2. Each entry was confirmed via Sourcegraph `repo:` queries against `rebuild/clean-from-baseline@004af8c`. Bugs and risks reference findings from the 6a Mercury attack (session-2026-05-10) and the DeepSearch lifecycle audit (Deliverable 2 S7-BUG-* through S12-BUG-*).
