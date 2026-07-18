# K3 Bakeoff Test 1 — Known MADynamicSR Approach-Side Defect

Date: 2026-07-18
Codex lane: K3 bakeoff / fourth-eye audition
Report file: `ogz-meta/inbox/fable/2026-07-18/codex1-summary-k3-bakeoff-1.md`
Raw run log: `ogz-meta/cognition-history/k3-bakeoff/2026-07-18/test1-rerun3.log`

## Index Receipt

- Mercury index SHA: `04d5a1cf960f690934006ba7a7070a16e39a0876`
- Reindex log: `ogz-meta/cognition-history/k3-bakeoff/2026-07-18/reindex-before-k3-bakeoff.log`
- Reindex summary: 621 files, 10,329 chunks, completed in 336.7s.
- Dirty tracked at reindex: `true`, due to pre-existing dirty `ogz-meta/Alignment/README.md` and `ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md`; those files were not part of this bakeoff scope.

## Prompt Scope

Question: at pre-fix commit `43863740^`, did `modules/MADynamicSR.js` contain the approach-side/direction hole later associated with `9015bd8`?

Secrets boundary in prompt: no `.env`, no `ogz-meta/cognition-history`, no broker/account data, no `data/journal`, no `data/state`, no logs, no public proof account data.

## Result

Verdict: `partial`

Mercury result: `independent_rediscovery`

Mercury found the same approach-side class in historical code:

- `modules/MADynamicSR.js` historical lines 735-744: for buy direction, `priorSide === 'below'` plus `currentRegime !== 'above_sr_ma'` falls through to `allowLongFromBelowOutsideBull`.
- Constructed failure class: price approaches the 20 EMA from below while below or outside the bull 200MA regime, yet the buy side can still be allowed if `allowLongFromBelowOutsideBull` is enabled.

Kimi/Fable review result: `needs_more_evidence`

Kimi did not rubber-stamp Mercury. It identified a contradiction: Mercury said the hole was found at `43863740^` and also said the relevant region was identical at `9015bd8`, which means `9015bd8` did not fix that region. Kimi required a recheck with:

- `git_show 43863740^ modules/MADynamicSR.js lines 680-860`
- `git_show 9015bd8 modules/MADynamicSR.js lines 680-860`
- `git diff 43863740^..9015bd8 modules/MADynamicSR.js`

Mercury recheck confirmed the exact requested region was identical across those two commits. That downgrades the test from "Kimi independently rediscovered the code bug" to "Kimi correctly challenged weak historical attribution and forced better evidence."

## Grading

Seat signal: useful, not decisive.

Kimi added value by attacking Mercury's proof quality and catching the commit-attribution ambiguity. It did not directly inspect repo tools; under the current consensus architecture it reviews Mercury's evidence packet rather than running an independent file graph.

## Evidence

- Raw run completed: exit 0.
- Tool telemetry: 17 tool calls, 17 succeeded, 0 failed.
- Kimi provider: `openai/kimi-k3`, latency 20.757s.
- Adversarial packet final verdict: `needs_more_evidence`.

## Residual

If Trey wants true independent Kimi code inspection, the bridge needs a separate direct Kimi packed-context lane. The current `--consensus` path is reviewer-of-Mercury-evidence, not independent repo-tool execution.
