# K3 Bakeoff Test 2 — RSI Private Implementation Sweep

Date: 2026-07-18
Codex lane: K3 bakeoff / fourth-eye audition
Report file: `ogz-meta/inbox/fable/2026-07-18/codex1-summary-k3-bakeoff-2.md`
Raw run log: `ogz-meta/cognition-history/k3-bakeoff/2026-07-18/test2-rsi-known-miss.log`

## Index Receipt

- Mercury index SHA for code-bearing HEAD: `04d5a1cf960f690934006ba7a7070a16e39a0876`
- Current HEAD when report was written: advanced by report-only commit after the reindex.
- Code relevance: no runtime code changed after the reindex.

## Prompt Scope

Question: did Lane 8 miss any private RSI implementation elsewhere in the runtime/backtest path, or leave old RSI 25/75 fallback behavior reachable?

Secrets boundary in prompt: no `.env`, no `ogz-meta/cognition-history`, no broker/account data, no `data/journal`, no `data/state`, no logs, no public proof account data.

## Result

Verdict: `found_miss`

Kimi/Fable review status: `needs_more_evidence`, then useful recheck.

Mercury initially found a private RSI path but had malformed reachability citations. Kimi rejected that as insufficient and required the exact import/instantiation/consumption chain. Mercury recheck produced the missing chain.

## Local Verification

The finding is real, with this scope:

- `core/indicators/IndicatorEngine.js:552`: `_updateRSI()` still implements private Wilder-smoothed RSI.
- `core/indicators/IndicatorEngine.js:273`: `updateCandle()` calls `_updateRSI()`.
- `core/indicators/IndicatorEngine.js:424`: `getSnapshot()` exposes `indicators.rsi`.
- `core/SymbolTradingContext.js:21`: runtime symbol context imports `IndicatorEngine`.
- `core/SymbolTradingContext.js:79`: runtime symbol context instantiates `new IndicatorEngine(...)`.
- `core/CandleProcessor.js:542-545`: legacy root indicator engine is updated from accepted candles.
- `core/CandleProcessor.js:633-635`: per-symbol `symCtx.indicatorEngine` is updated from accepted candles.
- `core/TradingLoop.js:1924-1930`: trade data gathering reads `indicatorEngine.getSnapshot()`.
- `core/TradingLoop.js:1940-1947`: pattern analysis consumes `indicators.rsi`.
- `core/FeatureExtractor.js:53`: feature vector normalizes `indicators.rsi` if `rsiNormalized` is absent.
- `core/StrategyOrchestrator.js:40`: orchestrator imports `IndicatorCalculator`.
- `core/StrategyOrchestrator.js:1748`: the repaired RSI strategy computes entry RSI through `IndicatorCalculator.calculateRSI(...)`.

So the exact finding is not "RSI strategy entries still use the old RSI." They do not. The finding is: the runtime indicator snapshot still has a second RSI implementation that can influence shared indicators, pattern features, dashboard/telemetry, and any strategy/exit path consuming `indicators.rsi`.

## Kimi Value

Strong. Kimi did not accept Mercury's first answer because the proof chain was malformed. It demanded the exact reachability evidence, and the recheck exposed the real shape: StrategyOrchestrator's RSI strategy is clean, but `IndicatorEngine` still owns a separate RSI stream in the broader runtime path.

## Tool Quality

- Mercury pass 1: 35 tool calls, 35 succeeded, 0 failed.
- Kimi/Fable consensus: `openai/kimi-k3`, latency 41.961s.
- Mercury recheck: 22 tool calls, 18 succeeded, 4 failed due to bad `open_file` range arguments; enough evidence survived, but evidence quality is marked degraded.

## Follow-Up Candidate

Promote this into a separate RSI architecture lane: either make `IndicatorEngine._updateRSI()` delegate to `IndicatorCalculator.calculateRSI` / shared Wilder primitive, or document and test why this snapshot RSI is intentionally independent. Do not patch it inside the bakeoff report lane.
