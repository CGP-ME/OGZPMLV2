# Codex-1 G5 Logic Attack: NoWickImbalance

Date: 2026-07-16
Mission: G5 wake-five roster attack
Strategy: NoWickImbalance
Indexed SHA: 719f7bd8e7dbfb89775bea314f91fdf614d1f0e8
Index timestamp: 2026-07-16T20:17:32.367Z
Run ledger: ogz-meta/cognition-history/mercury-runs/2026-07-16.jsonl:15
Mercury run id: 2026-07-16T20-49-18-872Z-16beb075a07e

## Verdict

Mercury output verdict: incoherent.

Run-ledger verdict: inconclusive_toolfail.

Review status: degraded. Mercury hit a tool failure opening the intent spec under `ogz-meta/inbox/fable/...` because that path is blocked by `mercury.ignore`; the Fable tier was skipped because Mercury had a tool failure. Treat this report as a useful lead, not a completed G5 two-tier attack.

## Mercury Findings

| Link | Finding | Evidence cited by Mercury |
| --- | --- | --- |
| Thesis to trigger | Wickless detection uses `NOWICK_EPS=0.001`, so tiny wicks below tolerance can be classified as no-wick. | `modules/NoWickImbalance.js:116-128`, `modules/NoWickImbalance.js:130-140` |
| Thesis to trigger | `minBodyPercent` rejects small-body wickless candles even though the intent spec does not require minimum body size. | `modules/NoWickImbalance.js:106-109`, `config/trading.config.json:1939-1944` |
| Trigger to direction | Mercury claimed swing/trend classification can mislabel structure because swing detection does not enforce true higher-low/lower-high trend quality. | `modules/NoWickImbalance.js:155-190`, `modules/NoWickImbalance.js:260-263` |
| Confidence math | Confidence is static from config and does not vary by candle age, level proximity, trend quality, or setup degradation. | `modules/NoWickImbalance.js:381-383` |
| Exit fit | Structural stop selection uses recent swing search but may not guarantee the required recent higher-low/lower-high quality. | `modules/NoWickImbalance.js:199-223`, `modules/NoWickImbalance.js:329-342`, `modules/NoWickImbalance.js:349-357` |
| Platform interaction | Mercury flagged mismatch between configured percent exits and module structural exits, plus global min-confidence interaction with static confidence. | `config/trading.config.json:1522-1529`, `core/StrategyOrchestrator.js:1761-1762` |

## Reliability Notes

- Mercury tool status: 10 tool calls, 1 failure.
- Failed call: `open_file` on `ogz-meta/inbox/fable/2026-07-16/session-doctrine/NOWICK-INTENT-SPEC.md`, blocked by `mercury.ignore`.
- Fable review status: skipped due Mercury tool failure, effective `inconclusive_toolfail`.
- Because the prompt embedded the core NoWick intent text, some findings may still be useful, but this should be rerun after giving Mercury an eligible/canonical intent source or embedding the full intent in a shorter prompt.

## Next Use

Do not code from this as a clean verdict. First rerun NoWick G5 with the intent source available to Mercury or accept this as a degraded lead for Trey/Fable manual review.
