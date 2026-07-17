# Codex-1 G5 Fable Rerun: LiquiditySweep

Date: 2026-07-17
Mission: G5 rerun batch, post-Fable repair
Strategy: LiquiditySweep
Runtime changes: none

## Index Contract

- Mercury index timestamp: 2026-07-17T01:58:04.507Z
- Indexed SHA: b06d474a6612b896911474980f873e033edefddc
- Active chunks: 10163
- Dirty tracked at index: false

## Run Ledger

- Reason for rerun: prior G5 LiquiditySweep report had degraded/toolfailed recheck evidence.
- Accepted rerun line: ogz-meta/cognition-history/mercury-runs/2026-07-17.jsonl:11
- Run id: 2026-07-17T02-17-48-513Z-56f2cfbb0e9e
- Mercury termination: answer_given
- Mercury iterations: 15
- Fable review: ok, effective verdict needs_more_evidence
- Recheck: completed

## Verdict For Trey

coherent-with-flaws / needs ruling.

Mercury first-pass again overreached into an incoherent verdict. Fable challenged multiple unsupported high-severity claims and forced a recheck. The crash claim was rejected, but the liquidity-sweep trigger still has real logic weaknesses.

## Supported Findings

Evidence:

- modules/LiquiditySweepDetector.js:293-300 aborts the session when daily ATR is unavailable and then marks a manipulation candle solely by `range >= atrMultiplier * dailyATR`.
- modules/LiquiditySweepDetector.js:316-324 computes sweep/inside-range validations.
- modules/LiquiditySweepDetector.js:324-330 records `validationsPassed` and logs when validations exist, but line 330 enters `watching_for_exit` regardless of `validationsPassed`.
- modules/LiquiditySweepDetector.js:343-364 waits for exit outside the box and reversal pattern.
- core/StrategyOrchestrator.js:1428-1429 applies only signal confidence vs `minStrategyConfidence` before returning a candidate.
- config/trading.config.json:5 sets `minStrategyConfidence` to 0.35.

Result: the detector has a real path where ATR-sized opening range is enough to advance into a tradable sweep setup even when validation score is zero. That weakens the failed-break thesis.

## Rejected Claims

Fable rejected these first-pass overclaims:

- The alleged `fibBoostGolden` / `fibBoostNormal` ReferenceError is false. core/StrategyOrchestrator.js:1273-1274 defines both variables before the LiquiditySweep callback closure.
- The null-entry hammer drop claim was internally inconsistent because the guard is `entry != null && !overrideLevels` at modules/LiquiditySweepDetector.js:416-421.
- The crash-order claim was backwards because the confidence check at core/StrategyOrchestrator.js:1429 runs before the fib boost at 1435.

## Reliability

Usable two-tier evidence for ruling input. Use the supported trigger/validation finding; do not use the rejected crash claim.
