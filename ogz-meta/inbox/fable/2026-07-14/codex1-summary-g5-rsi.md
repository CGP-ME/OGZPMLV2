# Codex1 Summary: G5 RSI Logic Attack

## SUPERSEDED

Status: SUPERSEDED by stale Mercury index check on 2026-07-14.

Reason:

- This report was produced before the approved Mercury reindex.
- The active pre-reindex Mercury index metadata reported `indexed_at=2026-07-13T00:51:45.988Z`.
- The active pre-reindex Mercury index metadata reported `head_sha=3086ff7f9f70a2c0a37868cc0df9267b3535f741`.
- Current post-reindex HEAD for G5 is `a476afbed787c79a210f427a8509afa11123f9a0`.

Disposition: do not use this verdict for Trey ruling. Use `codex1-summary-g5-rsi-post-reindex.md`.

Date: 2026-07-14
Branch: codex/multi-asset-symbol-state
Mission: G5-ROSTER, strategy 2 of 8
Strategy: RSI
Code changes: none

## Verdict

**coherent-with-flaws**

RSI direction assignment is coherent for a mean-reversion extreme strategy: oversold -> buy, overbought -> sell. The flaws are that the trigger is pure RSI level with no exhaustion/reversal confirmation, and the visible thresholds `30/70` are not the true tradeable thresholds once the RSI exit-contract `minConfidence: 0.6` is applied.

## Artifacts

- Prompt: `ogz-meta/inbox/fable/2026-07-14/g5-rsi-logic-attack-prompt.md`
- Raw two-tier bridge output: `ogz-meta/inbox/fable/2026-07-14/g5-rsi-bridge-output.txt`
- Mercury run ledger: `ogz-meta/cognition-history/mercury-runs/2026-07-14.jsonl` latest RSI entry

## Mechanism Compliance

- Mercury pass 1 ran with repo tools.
- Fable adversarial review ran and marked the first pass `needs_more_evidence`.
- Mercury recheck ran from Fable's exact challenge.
- Toolfail status: degraded evidence. Recheck had one failed tool call opening removed legacy path `core/TradingConfig.js`.
- Reliability note: initial Mercury overclaimed; Fable caught threshold/math/exit-contract defects in Mercury's answer. Local line checks were used to separate supported findings from unsupported claims.

## Supported Findings

### 1. Thesis -> Trigger: Pure RSI Threshold Does Not Prove Exhaustion/Reversal

Current code:

- `core/StrategyOrchestrator.js:1508-1510` reads `ctx.indicators.rsi` and returns null only if absent.
- `core/StrategyOrchestrator.js:1512-1514` reads `strategies.RSI` thresholds with fallback values.
- `core/StrategyOrchestrator.js:1520-1527` emits `buy` when `rsi < oversold`.
- `core/StrategyOrchestrator.js:1529-1536` emits `sell` when `rsi > overbought`.
- `config/trading.config.json:1672-1676` sets landed thresholds: period 14, oversold 30, overbought 70.

Counterexample:

- Strong downtrend continues making lower lows.
- RSI prints 28.
- Code emits a long candidate because `28 < 30`, even if price action has not shown exhaustion or reversal.

Disposition:

- This is a real logic flaw, but not a direction-assignment bug. It is a thesis/trigger weakness: RSI extreme alone is not exhaustion proof.

### 2. Confidence Math: Effective Entry Threshold Is Not The Visible 30/70

Current code:

- `core/StrategyOrchestrator.js:1521-1524` computes oversold confidence as `0.5 + (Math.min(1, (oversold - rsi) / 15) * 0.4)`.
- `core/StrategyOrchestrator.js:1530-1533` computes overbought confidence the same way.
- `core/StrategyOrchestrator.js:2013-2040` applies the exit-contract min-confidence gate before accepting the candidate.
- `foundation/ConfigLoader.js:2397-2408` gives RSI `minConfidence: 0.60`.
- `config/trading.config.json:1283-1291` also shows RSI `minConfidence: 0.6`.

Arithmetic using landed config:

- Oversold threshold is 30.
- To clear `0.60`: `0.5 + (((30 - rsi) / 15) * 0.4) >= 0.60`.
- Therefore `rsi <= 26.25`.
- Overbought threshold is 70.
- To clear `0.60`: `0.5 + (((rsi - 70) / 15) * 0.4) >= 0.60`.
- Therefore `rsi >= 73.75`.

Disposition:

- Signals from `26.25 < RSI < 30` and `70 < RSI < 73.75` are created by the strategy, then filtered by exit-contract confidence.
- The strategy is not dead-zoned; deep extremes still pass. But the effective tradable threshold is narrower than the config labels imply.

### 3. Exit Fit Exists, But It Is Static Percent Geometry

Current code:

- `foundation/ConfigLoader.js:2397-2408` defines the locked RSI contract: `stopLossPercent -0.8`, `takeProfitPercent 1.0`, `trailingStopPercent 0.6`, `trailingActivation 0.8`, `maxHoldTimeMinutes 240`, `minConfidence 0.60`.
- `core/StrategyOrchestrator.js:521-556` reads per-strategy exit contract values through `ConfigLoader.get('exitContracts.${strategyName}...')`.
- `config/trading.config.json:1283-1291` has the same RSI contract values.
- `ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md:22-33` says exits should be strategy-owned and mean-reversion strategies get targets.

Disposition:

- Mercury's claim that RSI exit geometry is missing is false.
- The contract is strategy-specific and target-oriented, which broadly fits mean reversion.
- Remaining flaw: exits are static percent geometry, not tied to actual reversal structure or RSI exhaustion level.

### 4. Platform Interaction: MTF Adjusts Ranking Score After Contract Gate

Current code:

- `core/StrategyOrchestrator.js:1127-1155` applies RSI MTF logic.
- `core/StrategyOrchestrator.js:1130-1137` applies `rsi_mtf_4h_trend_conflict_penalty`.
- `core/StrategyOrchestrator.js:991-1003` `applyPenalty` mutates `result.rankingScore`, not raw `confidence`.
- `core/StrategyOrchestrator.js:2013-2040` applies the exit-contract min-confidence gate before the later ranking-stage qualification.
- `core/StrategyOrchestrator.js:2446-2464` filters by `rankingScore >= this.minStrategyConfidence`.
- `config/trading.config.json:5` sets `minStrategyConfidence: 0.35`.
- `config/trading.config.json:1772-1778` sets RSI MTF values: conflict multiplier `0.95`, hourly RSI boost `0.1`, buy max `40`, sell min `60`.

Disposition:

- Mercury's first-pass claim that the MTF penalty directly makes the RSI vote fail the `0.6` min-confidence gate is false.
- The MTF layer can still change winner selection by ranking score. That is a platform interaction to monitor, not a proven contradiction.

## Unsupported Or Rejected Mercury Claims

- `RSI=78 (>75)` was based on the wrong landed overbought threshold. Current config is `70`, not `75`.
- "The vote can never clear minConfidence" is false. Deep enough RSI extremes clear: `RSI <= 26.25` for long, `RSI >= 73.75` for short.
- "ExitContract field is never used for RSI" is false. ConfigLoader has an RSI exit contract and StrategyOrchestrator reads per-strategy contracts.
- "Fee model/session gates undermine RSI" was asserted without file evidence and is not accepted.

## Fable Disagreement, Verbatim

> "a signal with rsi = 28... can never clear the minimum-confidence gate" — false by Mercury's own cited formula for deeper breaches; and "the exitContract field is never used for RSI" — unsupported absence claim contradicting the FEAT-2026-04-22-PER-STRATEGY-ATR ledger entry showing an RSI exit contract in core/TradingConfig.js.

## Required Trey Ruling Input

RSI can proceed as `coherent-with-flaws` if Trey accepts pure RSI extremes as sufficient trigger input. If not, the repair lane should add an exhaustion/reversal confirmation condition or regime filter before tournament use. Any repair should also make the effective thresholds visible: `30/70` are trigger thresholds, while `26.25/73.75` are the current tradeable thresholds under `minConfidence: 0.6`.

## Not Done

- No code changes.
- No tests.
- No P0 run.
- No commit/push.
- No PM2 restart.
