# codex1: G5 SmartMoneySweep logic attack post-reindex

## Index Contract

- Index timestamp: 2026-07-14T21:29:42.731Z
- Indexed SHA: a476afbed787c79a210f427a8509afa11123f9a0
- HEAD attacked: a476afbed787c79a210f427a8509afa11123f9a0
- Chunk count: 10155
- Freshness ruling: PASS. The index matches HEAD, so this report is not stale against lane-relevant code.

## Verdict

coherent-with-flaws

SmartMoneySweep is not incoherent: it has a recognizable sweep/reversal chain using VP/IVB levels, wick-beyond/close-back sweep detection, scoring, and structural exit levels. The flaws are still material: equal dual-sweep cases tie toward long, raw confidence progress is compressed into only three position-sizing tiers, the strategy-level `maxLossPct` and static exit contract can tell different risk stories, and regime ownership is documented in the spec but not enforced in the visible registration snippet.

## Two-Tier Result

- Mercury Pass 1: `coherent-with-flaws`.
- Mercury Pass 1 telemetry: tool_calls=14, succeeded=14, failed=0; tools=grep:2/2/0, open_file:12/12/0.
- Fable Review: `needs_more_evidence`.
- Fable challenge: Mercury had not checked landed exit/config values, had overclaimed the confidence dead-zone against an assumed threshold, and had mislabeled `minCandlesSweep` as a session mismatch.
- Mercury Recheck: completed the requested landed-config check.
- Mercury Recheck telemetry: tool_calls=16, succeeded=16, failed=0; tools=git_show:10/10/0, search:6/6/0.

## Tier Disagreements

Fable narrowed these claims:

- Confidence is not dropped by the current 0.35 strategy floor. Recheck confirmed 0.625, 0.775, and 0.975 all pass the landed floor.
- `minCandlesSweep` is a data-sufficiency value, not a session filter.
- The exit-fit critique must use landed values: exit contract is -0.3 percent stop, 1.5 percent target, 0.5 percent trail, 900 minute max hold; strategy config also carries `maxLossPct: 0.3`.

## Findings

### 1. Thesis to Trigger

The trigger logic is broadly aligned with the failed-break thesis:

- `modules/SmartMoneySweep.js:665-672` marks long sweeps when price wicks below VAL, IVB low, or a below-POC LVN and closes back above the level.
- `modules/SmartMoneySweep.js:674-681` marks short sweeps when price wicks above VAH, IVB high, or an above-POC LVN and closes back below the level.
- `modules/SmartMoneySweep.js:183-199` scores long and short candidates only after sweep detection and session/daily-loss checks.

Flaw: this is a strict wick-beyond/close-back model. It can miss thesis-valid failures that break and re-enter range without closing back beyond the exact tested level by the module's definition. That is selectivity risk, not wrong-thesis execution.

### 2. Trigger to Direction

The normal direction assignment is coherent:

- Long sweep candidates become `buy` at `modules/SmartMoneySweep.js:234-235`.
- Short sweep candidates become `sell` at `modules/SmartMoneySweep.js:234-235`.

Supported flaw: if both long and short candidates are valid, equal scoring ties to long:

- `modules/SmartMoneySweep.js:221-225` computes `conditionsMet * 100 + rawConfidence` for both sides, then selects `long` on `>=`.

Constructed counterexample: a wide bar can wick through both a below-POC level and an above-POC level and close back across both tested references in a way that produces valid long and short sweep flags. If both scoring chains produce the same condition count and raw confidence, line 225 forces `long` without a neutral/tie/no-trade state. That is a wrong-side class in dual-sweep ambiguity.

### 3. Confidence Math

Mercury's first "dead-zone" claim was overbroad, but the scoring flaw remains:

- `modules/SmartMoneySweep.js:697-771` accumulates long-side `conditionsMet` plus raw confidence progress.
- `modules/SmartMoneySweep.js:780-854` mirrors that for short-side scoring.
- `modules/SmartMoneySweep.js:257-264` then collapses final confidence to only three outputs: 0.625, 0.775, or 0.975 based on condition count.
- `config/trading.config.json:5` sets `confidence.minStrategyConfidence` to 0.35, and `core/StrategyOrchestrator.js:1773-1775` gates SmartMoneySweep with that floor.

Arithmetic:

- 0.625, 0.775, and 0.975 all exceed 0.35 and pass the current strategy gate.
- Raw confidence progress affects tie-breaking at `modules/SmartMoneySweep.js:221-225`, but it does not affect the final emitted confidence except through coarse condition-count buckets.

Supported flaw: nuanced progress values are mostly discarded at trade birth. A 2-condition setup with strong progress and a barely-qualified 2-condition setup both emit 0.625; a 3-condition setup emits 0.775 even if raw progress is weak.

### 4. Exit Fit

SmartMoneySweep's exit geometry is partly aligned and partly inconsistent:

- `modules/SmartMoneySweep.js:861-908` computes long stops from sweep lows plus a `maxLossPct` cap, then computes ATR/VP targets based on conviction.
- `modules/SmartMoneySweep.js:911-940` mirrors this for shorts.
- `modules/SmartMoneySweep.js:29-35` validates that stop and take-profit are on the correct side of entry.
- `config/trading.config.json:1686-1715` gives strategy `maxLossPct: 0.3`, ATR multipliers, `slBufferPct`, `maxHoldBars`, and `maxDailyLosses`.
- `config/trading.config.json:1354-1363` gives the exit contract a -0.3 percent stop, 1.5 percent take profit, 0.5 percent trail, 0.5 activation, 900 minute max hold, and `useStructuralExits: true`.

Supported flaw: the strategy-level exit math and static contract are close in loss percentage but not identical in semantic ownership. The strategy computes structural levels; the static contract still carries percentage values and a much longer 900 minute max hold than `maxHoldBars: 60` implies in strategy config. This needs tournament/rule review for "which number owns the close" rather than being assumed correct.

### 5. Platform Interactions

Two interactions matter:

1. Regime ownership is specified but not visibly enforced here.
   - `ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md:143-146` says range regime is LiquiditySweep/SmartMoneySweep home turf and nobody trades outside home regime.
   - `core/StrategyOrchestrator.js:1906-1918` shows enable toggles, not a local regime check for SmartMoneySweep.

2. Daily-loss state is local module state.
   - `modules/SmartMoneySweep.js:293-297` increments `dailyLosses` when notified of losing trades.
   - `modules/SmartMoneySweep.js:475-485` resets daily losses on new cash session.
   - `core/StrategyOrchestrator.js:2679-2694` and executor hooks are expected to feed this state, so missed attribution would directly affect strategy availability.

This is a platform coupling risk, not a pure logic contradiction.

## Reliability Note

Evidence quality is usable:

- Active Mercury index matched HEAD.
- Mercury Pass 1 and recheck had zero tool failures.
- Fable materially corrected overclaims before final disposition.
- No code was changed in this mission.

## Artifacts

- Prompt: `ogz-meta/inbox/fable/2026-07-14/g5-smartmoneysweep-logic-attack-prompt-post-reindex.md`
- Raw bridge output: `ogz-meta/inbox/fable/2026-07-14/g5-smartmoneysweep-bridge-output-post-reindex.txt`
- Summary: `ogz-meta/inbox/fable/2026-07-14/codex1-summary-g5-smartmoneysweep-post-reindex.md`
