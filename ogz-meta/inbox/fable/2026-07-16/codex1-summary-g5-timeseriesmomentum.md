# Codex-1 G5 Logic Attack: TimeSeriesMomentum

Date: 2026-07-16
Mission: G5 wake-five roster attack
Strategy: TimeSeriesMomentum
Indexed SHA: 719f7bd8e7dbfb89775bea314f91fdf614d1f0e8
Index timestamp: 2026-07-16T20:17:32.367Z
Run ledger: ogz-meta/cognition-history/mercury-runs/2026-07-16.jsonl:14
Mercury run id: 2026-07-16T20-48-21-096Z-92d5d404ef8e

## Verdict

Mercury verdict: coherent-with-flaws.

Review status: degraded. The bridge attempted `--adversarial-review`, but the Fable tier failed during review execution. Treat this as Mercury-only evidence until Fable review is rerun.

## Mercury Findings

| Link | Finding | Evidence cited by Mercury |
| --- | --- | --- |
| Thesis to trigger | The trigger can fire in a flat market because `minReturn=0` and `price > trendSMA` can be an SMA-lag artifact, not a true momentum regime. | `modules/TimeSeriesMomentum.js:107-112`, `config/trading.config.json:2025-2026` |
| Trigger to direction | Mercury found no direct wrong-side counterexample under the current branch logic: long requires positive return and price above SMA; short requires negative return and price below SMA. | `modules/TimeSeriesMomentum.js:107-112` |
| Confidence math | Contract `minConfidence=0.6` plus `confidenceBase=0.5` and multiplier `4` creates a 2.5 percent return threshold before signals clear confidence: `0.5 + 4 * absReturn >= 0.6`. | `modules/TimeSeriesMomentum.js:119-122`, `config/trading.config.json:1514-1515`, `config/trading.config.json:2032-2034` |
| Exit fit | Fixed `maxHoldTimeMinutes=240` can contradict a momentum runner thesis by cutting or holding independent of momentum decay/reversal. | `modules/TimeSeriesMomentum.js:138-142`, `config/trading.config.json:1512-1513` |
| Platform interaction | Mercury claimed regime boosts affect sizing, not the confidence used by min-confidence gates, so regime quality may not down-weight weak momentum signals. | Mercury cited `core/StrategyOrchestrator.js:2260-2262` |

## Reliability Notes

- Mercury tool status: success, 18 tool calls, 0 failures.
- No run checks.
- Fable tier failed and did not challenge or ratify Mercury.
- The strategy verdict is less severe than the others: Mercury called the internal structure coherent but flawed.

## Next Use

Use this to seed final-shape review around return threshold, confidence floor, and exit geometry. Do not treat the regime-boost interaction claim as verified until its orchestrator citations are checked.
