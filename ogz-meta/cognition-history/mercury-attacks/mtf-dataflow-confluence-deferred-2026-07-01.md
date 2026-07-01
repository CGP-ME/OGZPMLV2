Mercury, break my fix.

Attack the MTF dataflow changes only.

Intended contract:
- MultiTimeframeAdapter stores source candles in their real source timeframe and only aggregates upward.
- StrategyOrchestrator may expose MTF snapshots, contributors, and bounded score adjustments.
- StrategyOrchestrator must not hard-reject entries from strategy-specific MTF confluence.
- StrategyOrchestrator must not mutate signalData from strategy-specific MTF confluence.
- StrategyOrchestrator must not mutate overrideLevels from strategy-specific MTF confluence.
- Missing higher timeframe data must be attribution only and must not reduce confidence.

Files to inspect:
- modules/MultiTimeframeAdapter.js
- core/StrategyOrchestrator.js
- core/TradingConfig.js
- config/trading.config.json
- ecosystem.config.js
- test/multi-timeframe-adapter-source-timeframe.test.js
- test/strategy-orchestrator-mtf-source-timeframe.test.js
- test/strategy-orchestrator-mtf-strategy-confluence.test.js

Find a concrete input sequence or runtime state where:
1. a source candle still falls into the wrong timeframe bucket,
2. MTF confluence creates a hidden entry block,
3. missing 1h/4h data reduces confidence,
4. OGZTPO or EMA MTF logic mutates exit geometry or signal state,
5. a config/env default silently disables or overpowers the intended dataflow behavior.

Use current file:line evidence. Say whether this closes the underlying mechanism or only the symptom, and name any new failure modes it introduces.

Mercury dispatch attempted on 2026-07-01 and failed before review with:
HTTP 402 free_tier_quota_exceeded
