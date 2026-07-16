# Codex-1 G5 Logic Attack: PropSafeEMAPullback

Date: 2026-07-16
Mission: G5 wake-five roster attack
Strategy: PropSafeEMAPullback
Indexed SHA: 719f7bd8e7dbfb89775bea314f91fdf614d1f0e8
Index timestamp: 2026-07-16T20:17:32.367Z
Run ledger: ogz-meta/cognition-history/mercury-runs/2026-07-16.jsonl:12
Mercury run id: 2026-07-16T20-32-54-750Z-b32e9a68adee

## Verdict

Mercury verdict: incoherent.

Review status: degraded. The bridge attempted `--adversarial-review`, but the Fable tier failed during `claude-fable-5` warmup. Treat this as Mercury-only evidence until Fable review is rerun.

## Mercury Findings

| Link | Finding | Evidence cited by Mercury |
| --- | --- | --- |
| Thesis to trigger | The long trigger checks `price > trend` and `fast > pullback`, but Mercury found no explicit `pullback < trend` dynamic-support check. | `modules/PropSafeEMAPullback.js:253-254` |
| Thesis to trigger | Pullback distance is called with `[latest]`, so the configured `pullbackLookbackBars` window is not used in the distance calculation. | `modules/PropSafeEMAPullback.js:256-257`, `modules/PropSafeEMAPullback.js:232-250` |
| Trigger to direction | Direction logic was not flagged as broken; Mercury said `_crossed` separates up/down crossing. | `modules/PropSafeEMAPullback.js:212-218` |
| Confidence math | Confidence bonuses are added as static terms once signal construction happens; Mercury said they do not vary by actual trend quality, pullback quality, or confirmation strength. | `modules/PropSafeEMAPullback.js:305-312` |
| Confidence math | The module does not read/check `minConfidence` internally. | Mercury grep found no `minConfidence` occurrence in `modules/PropSafeEMAPullback.js` |
| Exit fit | Mercury claimed `exitContractHint` reports ATR/R-derived percentages but the module itself does not enforce the trailing activation behavior. | `modules/PropSafeEMAPullback.js:326-330` |

## Reliability Notes

- Mercury tool status: success, 10 tool calls, 0 failures.
- Mercury opened module, orchestrator, config, and architecture spec ranges.
- No run checks.
- Fable tier failed and did not challenge or ratify Mercury.

## Next Use

This directly corroborates the earlier Team 3 pullback-window concern. Use it as G5 input for final-shape review, with file-line verification before implementation.
