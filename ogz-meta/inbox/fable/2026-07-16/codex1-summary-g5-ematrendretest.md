# Codex-1 G5 Logic Attack: EMATrendRetest

Date: 2026-07-16
Mission: G5 wake-five roster attack
Strategy: EMATrendRetest
Indexed SHA: 719f7bd8e7dbfb89775bea314f91fdf614d1f0e8
Index timestamp: 2026-07-16T20:17:32.367Z
Run ledger: ogz-meta/cognition-history/mercury-runs/2026-07-16.jsonl:11
Mercury run id: 2026-07-16T20-22-33-449Z-862762cdee01

## Verdict

Mercury verdict: incoherent.

Review status: degraded. The bridge attempted `--adversarial-review`, but the Fable tier failed during `claude-fable-5` warmup. Treat this as Mercury-only evidence until Fable review is rerun.

## Mercury Findings

| Link | Finding | Evidence cited by Mercury |
| --- | --- | --- |
| Thesis to trigger | The module can accept a retest candidate while price is still far from the EMA if the ATR denominator is large enough and `extensionAtr <= maxExtensionAtr`. Mercury constructed an example with EMA 100, price 115, ATR 10, maxExtensionAtr 2. | `modules/EMATrendRetest.js:217-225`, `modules/EMATrendRetest.js:219` |
| Trigger to direction | Short retests are structurally missed when `allowShorts` is false, even if the downtrend retest thesis is valid. | `modules/EMATrendRetest.js:229-230`; Mercury also cited config default handling near line 129 |
| Confidence math | `slopeScore` saturates to 1 for every qualifying signal because the trigger already requires `abs(slopePct) >= minSlopePct`; confirmation bonus is added as a constant once the trigger passes. | `modules/EMATrendRetest.js:280-286` |
| Exit fit | Exit hints are ATR/R percentages and do not reference the EMA level that defined the retest. Mercury flagged this as exit geometry not tied to EMA dynamic support/resistance. | `modules/EMATrendRetest.js:279-281`, `modules/EMATrendRetest.js:306-311` |
| Platform interaction | RTH-only requirement, timezone conversion, single candle array assumptions, and ATR fallback can contradict broader EMA retest expectations. | `modules/EMATrendRetest.js:185-190`, `modules/EMATrendRetest.js:204-208` |

## Reliability Notes

- Mercury tool status: success, 3 tool calls, 0 failures.
- Mercury opened only `modules/EMATrendRetest.js` ranges; no run checks.
- Answer quality warning: `missing_file_line_citation`.
- Fable tier failed and did not challenge or ratify Mercury.

## Next Use

Use this as a G5 input for final-shape strategy review, not as a direct implementation order until Fable review or manual file-line verification adjudicates the claims.
