# Indicators, memory, performance, and filter audit

Read-only audit of the current dirty tree at HEAD `cb566d93a46dca8673def2f76ea685f5be0b148e`. Per-key rows and source hashes are in `indicators-memory.json`; no application modules were imported and no runtime/backtest/save operation was run.

`indicators.engine` is initialized by `run-empire-v2.js:421-428` using `core/indicators/IndicatorEngine.js`, receives candles from `core/CandleProcessor.js:504-562`, and its snapshots feed the strategy path (`run-empire-v2.js:1185-1192`, `core/StrategyOrchestrator.js:2378`). Its internal max-candle and series limits therefore affect an active stateful engine.

`indicators.optimized` is an active singleton. `core/OptimizedIndicators.js:41-62` captures settings at module initialization, and `core/EnhancedPatternRecognition.js:33,191` uses that singleton when `useOptimizedIndicators` is true. This is constructor/module-load scoped; no refresh callback was found. The large `twoPole` display/color label group is consumed by the optimized implementation only where referenced; the inventory intentionally records consumer class and timing rather than claiming each visual leaf changes trading decisions.

Pattern memory is initialized through `core/UnifiedPatternMemory.js:148-209` and `core/PatternMemoryBank.js:126-148`; TRAI activates the unified memory at `core/trai_core.js:114`, with reads/records/pruning at `:789-869`. `internals.patternMemory.saveInBacktest` gates persistence at `run-empire-v2.js:1795` and `core/UnifiedPatternMemory.js:207-209`; it does not prove that every persistence tuning field has been exercised in this audit. The runtime config is captured during memory construction, so settings saves require a fresh owner instance.

`performanceAnalysis` settings and internals are passed into `PerformanceAnalyzer` at `run-empire-v2.js:731-734`. The analyzer is later updated from the execution path through `core/OrderExecutor.js:4879`; this establishes initialization and a caller, while exact per-field use remains bounded by the analyzer implementation and is represented as effect timing unresolved in the JSON.

The current `filters.atrEnabled` and `filters.atrMinPercent` values are read during strategy evaluation at `core/StrategyOrchestrator.js:2661-2662`, so these fields are per-evaluation consumers. `patternRecognition.signatureQuantizationSteps` is loaded at `core/EnhancedPatternRecognition.js:382` and used in signature construction at `:446`.

The JSON contains 161 leaves across settings and internals. It distinguishes constructor/module-load capture, per-evaluation reads, backtest persistence gates, and unresolved per-field effects. No claim of runtime activation or “all working” is made.
