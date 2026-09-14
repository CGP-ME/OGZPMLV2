# Astra-era STOP 1 J1 manifest

- Source branch: `astra-era`
- Source revision investigated: `0c3760240272653a446ef1e4e3772c3ad8104209`
- Date: 2026-09-13
- Mission: establish one final configuration owner and early failure reporting without a temporary ambient compatibility layer.
- Status: both cold-pull HOLDs and Astra's front-loaded handoff were checked; Trey rejected temporary `process.env` projection on 2026-09-13. Production implementation remains unauthorized pending another cold pull and Trey's approval.
- Why retained: the front-loaded census proves the credential cut cannot safely land before the complete J7/J8 settings/internals migration. This packet joins those ownership changes while keeping lifecycle, readiness, trading, notification, and provider behavior separate.

## Files

- `MISSION.md`: authority, corrected boundary, scope, and authorization state.
- `WORK.md`: current behavior, preservation census, dispositions, and deferred defects.
- `CREDENTIAL-CENSUS.tsv`: credential/capability consumers plus the nonsecret startup inputs implicated by the cutover.
- `PROPOSED-IMPLEMENTATION.md`: atomic ownership contract, minimum proven boundary, and direct receipts.
- `EVIDENCE.md`: source receipts, complete static candidate list, independent Astra check, and proof limits.
- `REVIEW.md`: cold-pull history, Astra verification, count discrepancies, and next review questions.
- `INHERITED.md`: joined J1/J7/J8 ownership and deliberately separate work.

No `.env` file, credential value, provider call, broker call, notification, PM2 operation, restart, source-code change, or test result is included.

## Footer

WHAT I DID: removed the rejected compatibility projection and joined the credential cut to the final settings/internals ownership migration.

WHAT I DID NOT DO: authorize or implement the proposal, operate a runtime process, or reproduce credential values.

WHAT I ASSUMED: the live source did not change between the packet-only revisions beginning at `21dd3443` and the investigated revision above; Astra's untracked handoff is not part of this packet unless separately authorized.
