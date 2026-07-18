# K3 Bakeoff Test 3 — NoWickImbalance G5 Logic Attack

Date: 2026-07-18
Codex lane: K3 bakeoff / fourth-eye audition
Report file: `ogz-meta/inbox/fable/2026-07-18/codex1-summary-k3-bakeoff-3.md`
Raw run log: `ogz-meta/cognition-history/k3-bakeoff/2026-07-18/test3-nowick-g5.log`

## Index Receipt

- Mercury index SHA for code-bearing HEAD: `04d5a1cf960f690934006ba7a7070a16e39a0876`
- Current HEAD when report was written: advanced by report-only commits after the reindex.
- Code relevance: no runtime code changed after the reindex.

## Prompt Scope

Question: full G5 logic attack on rebuilt `NoWickImbalance` at HEAD.

Scoped files: `modules/NoWickImbalance.js`, NoWick registration in `core/StrategyOrchestrator.js`, and NoWick strategy/exit config in `config/trading.config.json`.

The NoWick intent spec was embedded directly in the prompt from `ogz-meta/inbox/fable/2026-07-16/session-doctrine/NOWICK-INTENT-SPEC.md`; Mercury/Kimi were not asked to read ignored inbox context.

Secrets boundary in prompt: no `.env`, no `ogz-meta/cognition-history`, no broker/account data, no `data/journal`, no `data/state`, no logs, no public proof account data.

## Result

Verdict: `incoherent`

Kimi/Fable review status: `needs_more_evidence`, then useful recheck.

Kimi challenged Mercury's first pass because it used absence claims without enough search scope, did not show confidence arithmetic, and did not calculate the exit-geometry gap. Mercury rechecked those items.

## Findings

1. R1 wickless strictness mismatch:
   - Intent: no bottom wick for long, no upper wick for short.
   - Current code allows configurable non-zero entry-side wick.
   - Evidence: `modules/NoWickImbalance.js:157-162`, `modules/NoWickImbalance.js:173-177`, `config/trading.config.json:2281`.

2. R2 trend proxy is not BOS/CHoCH:
   - Intent: BOS/CHoCH structure by candle close.
   - Current code uses two swing highs/lows from local three-candle extrema, not break-of-structure close state.
   - Evidence: `modules/NoWickImbalance.js:199-233`.

3. R3 return window exists:
   - Intent: touch within 9 candles.
   - Current config sets `maxCandleAge: 9`, and `_expireState` drops pending levels after that age.
   - Evidence: `config/trading.config.json:2278`, `modules/NoWickImbalance.js:455-467`.

4. R4 and R5 absent from this strategy path:
   - Intent: Tokyo session exclusion and red-folder news exclusion.
   - Current module comment says news/session/FVG filters are deferred, but this scoped path does not enforce NoWick-specific session/news filters.
   - Evidence: `modules/NoWickImbalance.js:17`, local search over `modules/NoWickImbalance.js`, `core/StrategyOrchestrator.js`, and `config/trading.config.json` found no `Tokyo`, `JST`, `sessionGate`, or `newsFilter` NoWick logic.

5. R6 unfilled imbalance/FVG lookback absent from this strategy path:
   - Intent: no unfilled imbalance against the trade within 40 candles, half-fill rule, stop-range exemption.
   - Current scoped search finds only comments or unrelated FVG config for other strategies; no NoWick 40-candle FVG filter is wired.
   - Evidence: `modules/NoWickImbalance.js:17`, `core/StrategyOrchestrator.js:1915`, `config/trading.config.json:2198-2199`.

6. R7 and R8 are present:
   - Swing-extreme rejection exists at `modules/NoWickImbalance.js:473-481`.
   - Near-touch invalidation exists at `modules/NoWickImbalance.js:497-506` and is consumed at `modules/NoWickImbalance.js:302-307`.

7. Confidence is static:
   - Current signal confidence is `this.cfg.confidence`; config value is `0.7`.
   - No dynamic multipliers were found in NoWick logic.
   - Orchestrator later caps ranking-derived public confidence at 1.0.
   - Evidence: `modules/NoWickImbalance.js:408-417`, `config/trading.config.json:2290`, `core/StrategyOrchestrator.js:71-83`.

8. Exit fit is only partially aligned:
   - Current strategy computes structural stop from the last `stopLookbackBars` candles plus `ATR * stopBufferAtr`, then TP at `targetRR`.
   - Config uses `stopLookbackBars: 10`, `stopBufferAtr: 0.1`, `targetRR: 1`.
   - Missing intent piece: extend to 15 candles if the stop is too close.
   - Evidence: `modules/NoWickImbalance.js:523-555`, `config/trading.config.json:2285-2287`.

## Kimi Value

Strong. Kimi forced a higher-quality G5 packet by challenging absence claims, missing confidence arithmetic, and weak exit-fit proof. The recheck answered those challenges and strengthened the final report.

## Tool Quality

- Mercury pass 1: 14 tool calls, 14 succeeded, 0 failed.
- Kimi/Fable consensus: `openai/kimi-k3`, latency 23.643s.
- Mercury recheck: 38 tool calls, 37 succeeded, 1 failed from an empty search argument; enough evidence survived, but evidence quality is marked degraded.

## Follow-Up Candidate

NoWick needs a separate intent-completion lane if Trey wants strict source-spec parity: strict wick tolerance, BOS/CHoCH trend state, session/news filters or documented stock/crypto replacements, NoWick-specific FVG filter, and the 10-to-15 candle stop-extension rule.
