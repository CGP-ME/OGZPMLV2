Mercury, break my fix.

Attack the current dirty diff for the TRAI/pattern-learning fabricated-data cleanup. The bug class is: missing trade-close indicators, exit metadata, P&L metadata, trend, volatility, strategy, or size being silently converted into zero, neutral, signal, unknown, or another plausible value, then recorded as learned memory, proof/audit data, risk/performance input, or adaptive-controller input.

Your prior pass missed the success guard around OrderExecutor's `traiRecorded` branch and also claimed no fallback literals remained while direct grep still found active close/logging defaults. Treat that as a prompt-quality failure and attack the current code mechanically.

Primary attack target:
- Find a concrete state where successful TRAI learning, PatternMemoryBank/UnifiedPatternMemory mutation, TradeLogger persistence, TradingProofLogger close proof, RiskManager/StrategyOrchestrator/PID trade-close update, or BacktestRecorder close row still records fabricated data instead of null/skip/fail-closed.
- Find a concrete state where missing `exitReason`, `strategy`, `pnl`, `pnlPercent`, `holdDuration`, `sizeUsd`, `macdSignal`, `bbWidth`, `trend`, or `volatility` still reaches a persisted/mutating sink as a plausible fake value.
- Find a concrete state where this fix blocks legitimate zero values, especially zero P&L, zero fee, zero confidence, or zero MACD histogram.
- Find a concrete state where the new null/skip behavior breaks live close execution rather than only skipping learning/reporting.

Current file ranges to inspect:
- `core/OrderExecutor.js:52-123` helpers for finite numbers, non-empty strings, exit size, and TRAI indicator extraction.
- `core/OrderExecutor.js:480-504` pattern outcome recording.
- `core/OrderExecutor.js:1959-2075` BUY close result, BacktestRecorder close row, exit reason, and state close handoff.
- `core/OrderExecutor.js:2175-2388` SELL proof logging, risk/performance/PID updates, TradeLogger payload, and TRAI learning payload.
- `core/OrderExecutor.js:2477-2828` COVER close result, BacktestRecorder close row, state close handoff, TradeLogger/proof payload, risk/performance/PID updates, and TRAI learning payload.
- `core/TRAIDecisionModule.js:378-480` market analysis and learned-pattern feature extraction.
- `core/TRAIDecisionModule.js:670-720` risk assessment position/stop/volatility handling.
- `core/TRAIDecisionModule.js:901-908` pattern key generation.
- `core/TRAIDecisionModule.js:1095-1115` recordTradeOutcome success/skip logging.
- `core/trai_core.js:761-830` shared feature extraction and trade result mapping to UnifiedPatternMemory.
- `core/UnifiedPatternMemory.js:322-370` recordOutcome validation and mutation.
- `core/UnifiedPatternMemory.js:1033-1058` compatibility recordPattern outcome path.
- `core/PatternMemoryBank.js:444-575` recordTradeOutcome validation, mutation, and telemetry.
- `core/tradeLogger.js:64-90` finite/null helpers.
- `core/tradeLogger.js:212-330` persisted trade record normalization.
- `core/tradeLogger.js:418-500` aggregate stats.

Sibling-scan leftovers to classify with file:line evidence:
- `core/StateManager.js:827-854` trade journal exitReason/strategy/hold-time fallback.
- `core/TradeJournal.js:995-1000,1289` hold-time aggregation fallback.
- `core/BacktestRecorder.js:175-177` strategy/exit reason fallback.
- `core/PIDController.js:232-247` optional PID metric fallbacks.
- `core/EnhancedPatternRecognition.js:225,358-359` MACD fallbacks.
- `core/OptimizedIndicators.js:419` MACD histogram fallback.
- `core/TRAIDecisionModule.js:836` display reasoning trend fallback.
- `core/tradeLogger.js:221,470,494-495` remaining display/report defaults.

For every claimed issue, provide:
- Exact file:line.
- A concrete input/state sequence.
- Which sink is corrupted or whether it is display/report-only.
- Whether it is inside this commit's required closure or a separate sibling issue.

Do not answer with "looks good." Break the fix or prove why each attack path cannot mutate or persist fake data.
