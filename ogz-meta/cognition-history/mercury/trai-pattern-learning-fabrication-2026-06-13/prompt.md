Mercury, break my fix.

Attack target: TRAI and pattern-memory fabricated learning data cleanup.

Changed files and line ranges to inspect:
- `core/OrderExecutor.js:52-105` helper `_firstFiniteNumber()` and `_buildTraiLearningIndicators()`.
- `core/OrderExecutor.js:2242-2375` long close proof log plus TRAI learning payload.
- `core/OrderExecutor.js:2725-2780` short close TRAI learning payload.
- `core/TRAIDecisionModule.js:378-448` market-analysis and pattern-memory feature extraction.
- `core/TRAIDecisionModule.js:453-480` pattern-memory lookup in `calculateConfidence()`.
- `core/TRAIDecisionModule.js:670-720` `assessRisk()` volatility/position-size/stop-loss handling.
- `core/TRAIDecisionModule.js:901-908` legacy `generatePatternKey()`.
- `core/TRAIDecisionModule.js:1095-1120` `recordTradeOutcome()`.
- `core/trai_core.js:761-830` `_extractFeatures()`, `checkPatternMemory()`, and `recordTradeResult()`.
- `core/UnifiedPatternMemory.js:322-368` `recordOutcome()`.
- `core/UnifiedPatternMemory.js:1033-1055` compatibility `recordPattern()`.
- `core/PatternMemoryBank.js:444-575` `recordTradeOutcome()` metadata validation and telemetry payload.
- Tests: `test/order-executor-trai-learning-payload.test.js`, `test/pattern-memory-scope.test.js`, `test/pattern-memory-eviction-boundary.test.js`.
- Gate fixture: `ogz-meta/gates/multi-runtime-gate-runner.js:219-235`.

Attack questions:
1. Find any realistic long or short close state where `OrderExecutor` still records or logs successful TRAI learning while any required entry indicator, trend, volatility, strategy, exit reason, PnL, PnL percent, or hold time is missing, non-finite, or fabricated.
2. Find any path where `TRAIDecisionModule.calculateConfidence()` queries `UnifiedPatternMemory` with fabricated feature values instead of skipping lookup when clean inputs are absent.
3. Find any path where `TRAIDecisionModule.assessRisk()` approves a decision after missing `volatility`, missing `positionSize`, missing `stopLoss`, or a stale phantom value.
4. Find any path where `trai_core.recordTradeResult()` returns `true` or emits a successful record path when `UnifiedPatternMemory.recordOutcome()` did not actually accept and mutate the outcome.
5. Find any path where `UnifiedPatternMemory.recordOutcome()`, `UnifiedPatternMemory.recordPattern()`, or `PatternMemoryBank.recordTradeOutcome()` still mutates on NaN, missing outcome metadata, missing scope, or fabricated default metadata.
6. Sibling scan: identify any remaining production caller in `core/`, `modules/`, or `run-empire-v2.js` that writes to TRAI/pattern memory or trade proof logs with `|| 0`, `'unknown'`, `'neutral'`, or a phantom `0.01` position size in the same learning/audit path.

Return only code-grounded findings with exact file:line citations. If a hit is display-only and does not affect learning, risk approval, or proof/audit logs, label it separately as display-only with the citation.
