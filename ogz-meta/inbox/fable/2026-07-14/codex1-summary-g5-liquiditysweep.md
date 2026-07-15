# codex1: G5 LiquiditySweep Logic Attack Summary

## SUPERSEDED

Status: SUPERSEDED by stale Mercury index check on 2026-07-14.

Reason:

- This report was produced before the approved Mercury reindex.
- The active pre-reindex Mercury index metadata reported `indexed_at=2026-07-13T00:51:45.988Z`.
- The active pre-reindex Mercury index metadata reported `head_sha=3086ff7f9f70a2c0a37868cc0df9267b3535f741`.
- Current post-reindex HEAD for G5 is `a476afbed787c79a210f427a8509afa11123f9a0`.

Disposition: do not use this verdict for Trey ruling. LiquiditySweep must be rerun post-reindex before final G5 scoring.

Date: 2026-07-14
Mission: G5 strategy logic coherence, LiquiditySweep
Report type: read-only attack summary
Runtime changes: none

## Verdict

coherent-with-flaws

## Two-tier mechanism

- First bridge run: inconclusive_toolfail. Mercury had one failed `open_file` call because it requested `modules/LiquiditySweepDetector.js:1-509`, above the tool's max range. Fable review was skipped by the bridge, so that run was not accepted.
- Second bridge run: Mercury Pass 1 verdict was incoherent. Fable review verdict was needs_more_evidence and launched one Mercury recheck.
- Mercury recheck answered the Fable challenge, but recheck telemetry still had one nonfatal range-too-large toolfail. Evidence quality is degraded.
- Local file inspection was used to adjudicate the recheck's remaining contradiction, with line evidence below.

## Fable review challenge

Fable did not accept Mercury's broad incoherent verdict:

> Mercury's "incoherent" verdict rests on findings that are internally contradictory, hedged, or missing mandated evidence.

Fable required recheck on:

- The exact path from `exitSide` assignment into pattern detection and `_generateSignal`.
- Whether `_generateSignal` can execute when `isManipCandle` is false.
- The bad `LiquiditySweepDetector.js:1437-1441` citation.
- Landed confidence weights / threshold arithmetic.

## Supported Findings

### 1. Validation does not gate the strategy, and no-validation signals can still pass

Evidence:

- `modules/LiquiditySweepDetector.js:293-311` requires finite daily ATR and `range >= atrMultiplier * dailyATR`; if not, the session ends.
- `modules/LiquiditySweepDetector.js:316-325` computes `sweepsHighs`, `sweepsLows`, `closesInsideRange`, and `validationScore`.
- `modules/LiquiditySweepDetector.js:326-330` only uses `validationsPassed > 0` for stats/logging; it does not block progression.
- `modules/LiquiditySweepDetector.js:330` enters `watching_for_exit` even when both liquidity-level validation and inside-range validation are false.
- `modules/LiquiditySweepDetector.js:423-427` starts confidence at `0.20` default manip-candle weight and adds `0.25` default pattern weight for hammer/engulfing.
- `core/StrategyOrchestrator.js:1443` gates only `conf < this.minStrategyConfidence`.
- `config/trading.config.json:5` sets `minStrategyConfidence` to `0.35`.

Arithmetic:

| Scenario | Confidence |
| --- | ---: |
| ATR manip candle + reversal pattern, no sweep validation, no inside-range validation | 0.45 |
| ATR manip candle + one validation + hammer/engulfing | 0.60 |
| ATR manip candle + two validations + hammer/engulfing | 0.75 |

Result: with the current global 0.35 strategy threshold, a generated LiquiditySweep pattern can pass even when the computed sweep validation fields did not confirm a liquidity-level sweep. That weakens the thesis-to-trigger link.

### 2. Direction mapping is coherent; Mercury's wrong-side hammer claim is rejected

Evidence:

- `modules/LiquiditySweepDetector.js:343-351` assigns `exitSide` to `above` or `below` when price closes outside the box.
- `modules/LiquiditySweepDetector.js:357-364` calls `_detectReversalPattern(bar, prevBar, this.state.exitSide)` before `_generateSignal`.
- `modules/LiquiditySweepDetector.js:378-389` only returns bullish hammer / bullish engulfing for `exitSide === 'below'`.
- `modules/LiquiditySweepDetector.js:391-402` only returns inverted hammer / bearish engulfing for `exitSide === 'above'`.
- `modules/LiquiditySweepDetector.js:412-415` maps those pattern types into bullish/bearish direction.

Result: the pattern selection is gated by `exitSide` before direction assignment. Mercury's counterexample of a regular hammer after an upside break voting buy is not supported by current code.

### 3. Warmup/drop behavior can miss thesis-valid early sessions

Evidence:

- `modules/LiquiditySweepDetector.js:293-296` ends the phase when daily ATR is not finite.
- `modules/LiquiditySweepDetector.js:454-464` computes daily ATR only after enough daily candles exist.

Result: the first ATR-warmup sessions cannot produce LiquiditySweep signals even if the market forms a textbook sweep. This is a known selectivity / warmup flaw, not a wrong-side direction bug.

### 4. Structural exit path is mixed

Evidence:

- `config/trading.config.json:1257-1268` marks LiquiditySweep `useStructuralExits: true` with stop `-2`, take profit `2.5`, trailing `0.5`, activation `0.7`, max hold `180`, invalidation `liquidity_absorbed`, and `_validated: "2026-03-20"`.
- `modules/LiquiditySweepDetector.js:412-415` computes structural stop/target levels from the pattern and box.
- `modules/LiquiditySweepDetector.js:416-421` only attaches known `overrideLevels` when entry, stop, and target are valid.
- `modules/LiquiditySweepDetector.js:439-446` emits `overrideLevels` on the signal.
- `core/StrategyOrchestrator.js:1454-1461` passes `overrideLevels` through to the candidate.

Result: Mercury's claim that structural exits are simply ignored is overstated. The producer emits structural levels when it has a concrete entry-relative geometry. However, hammer patterns use `entry = null`, so those paths do not produce `overrideLevels`; the live exit fit needs a G4 exit-path proof, not a G5-only claim.

### 5. Platform state visibility can diverge from voting state

Evidence:

- `core/CandleProcessor.js:612` can feed a root `ctx.liquiditySweep` and store `ctx.liquiditySweepSignal`.
- `core/StrategyOrchestrator.js:1422-1431` evaluates a symbol-scoped LiquiditySweep module with its own `feedCandle(latestCandle)`.
- `core/PipelineSnapshot.js:265-272` reports the root signal from `bot.liquiditySweepSignal || bot.liquiditySweep.getSignal()`.

Result: dashboard/snapshot visibility can describe a different LiquiditySweep instance than the one used for strategy voting. This is platform interaction risk, not a pure strategy-logic break, but it matters for G5 because the operator can be shown a phase/confidence that is not the traded instance.

## Rejected Or Degraded Claims

- Rejected: Mercury's wrong-side hammer counterexample. Current code gates pattern selection by `exitSide`.
- Retracted by Mercury recheck: `LiquiditySweepDetector.js:1437-1441` was an impossible citation. The null-check is actually `core/StrategyOrchestrator.js:1437-1441`.
- Rejected: "`_generateSignal` can execute when `isManipCandle` is false." Current code returns at `modules/LiquiditySweepDetector.js:308-311`.
- Degraded: recheck telemetry had one failed file-open call, so the recheck is useful but not clean authority.
- Not settled by G5: whether `useStructuralExits` and `liquidity_absorbed` are consumed correctly downstream. That belongs to a G4 exit ownership proof.

## Trey Ruling Inputs

- Decide whether `validationsPassed === 0` should be a hard no-signal condition or a confidence-only penalty.
- Decide whether the default weights should remain hidden module defaults or be explicit required config keys.
- Decide whether root `ctx.liquiditySweep` should continue to feed for snapshots once orchestrator-owned symbol-scoped instances are the voting source.
- Decide whether hammer-pattern paths with `entry = null` are allowed to rely on static contract exits or need concrete structural override levels.

## Artifacts

- Initial prompt: `ogz-meta/inbox/fable/2026-07-14/g5-liquiditysweep-logic-attack-prompt.md`
- Initial raw bridge output: `ogz-meta/inbox/fable/2026-07-14/g5-liquiditysweep-bridge-output.txt`
- Rerun prompt: `ogz-meta/inbox/fable/2026-07-14/g5-liquiditysweep-logic-attack-prompt-r2.md`
- Rerun raw bridge output: `ogz-meta/inbox/fable/2026-07-14/g5-liquiditysweep-bridge-output-r2.txt`
