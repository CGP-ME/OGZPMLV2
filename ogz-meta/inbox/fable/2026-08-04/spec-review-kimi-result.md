# Kimi spec review — directional-fix-spec (2026-08-04)

Model: kimi-k3
Dispatch: run-kimi-spec-review.js (max_tokens too low — see failure receipt).
Run artifact: spec-review-kimi-result.raw.json (17.6 KB, reasoning only).

## FAILURE RECEIPT (why the rendered .md was empty)

`finish_reason: "length"`. `completion_tokens: 4096`, of which
`reasoning_tokens: 4093` — Kimi spent the entire token budget inside
`reasoning_content` and never emitted `content`. The formatter renders
`content`; content was `""`, so the .md came out a 75-byte stub. The run
looked identical to a clean-but-empty result — silent truncation.

No verdict was reached: the reasoning was cut off mid-analysis of T1-14.

Same failure class as the Mercury max-tokens truncation lesson: the cap was
too low and the model burned the budget before writing the answer.

Two fixes required in `run-kimi-spec-review.js` (FLAGGED, not applied — that
script belongs to the fable/codex cognition lane):
1. Raise `max_tokens` (Mercury dispatches use 7750; Kimi's reasoning
   verbosity needs at least that).
2. Formatter fallback: when `content` is empty, render `reasoning_content`
   so a truncated run surfaces something instead of a blank file — otherwise
   a cap-truncated run is indistinguishable from an empty result.

## Partial findings harvested from reasoning_content (pre-cutoff)

Recovered from the raw JSON. INCOMPLETE — no verdict. These overlap Fable's
M6 no-disposition list; items flagged independently by both are noted.

- **T1-3 MISSING** (also flagged by Fable M6): min-share promotion
  (OE:2125-2129 with :446-455) silently turns a 25% partial close on a
  1-share position into a full close — `stateExitFraction` recomputed to 1.0,
  zero warning. Not in any batch. The audit demanded an operator-visible
  trace on promotion; the spec has none.
- **T1-10 MISSING** (also flagged by Fable M6): ECM phantom default-contract
  write-back at exit (ECM:328-331) is in no batch — regrows the class commit
  6f08c82e removed. A trade with no contract gets an invented default written
  back into its record, laundering the absence.
- **T1-4 UNDERSPECIFIED** (also flagged by Fable M6): spec says "don't absorb
  post-send over-fill errors" (:3134/:3161) but never names what catches the
  rethrown fill or how the live broker position is reconciled. Needs a named
  landing pad (halt machinery + reconcile-on-startup); otherwise the
  unrecorded-position problem just moves up one layer.
- **T1-11 / T1-13 UNDERSPECIFIED**: the ECM condition reconcile (7 configured
  conditions with no case vs 6 cases with no producer) needs a per-condition
  disposition table — implement vs delete, per condition. A literal read
  either builds duplicates or deletes the intended target. sweep_invalidated's
  `=== 'buy'` vocabulary bug (ECM:497) dies only if that path is DELETED, not
  implemented — the decision is unstated.

## Status

INCOMPLETE — no verdict (ready / ready-with-changes / not-ready). A rerun with
a raised token cap is required for the full review. The partial findings above
are still live and corroborate the Fable and Mercury reviews on T1-3, T1-10,
and T1-4.
