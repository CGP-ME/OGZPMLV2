# Work

Actual run 2026-09-24T02-31-33-458Z-759ba9639dea completed 18 tool calls, then Mercury response 19 terminated length. ask.js called ensureReviewerAnswer before assigning mercuryResult, throwing away the returned history for downstream prompts and top-level ledger. The raw provider receipts survived only inside failed panel-seat metadata. Actual Fable replay subsequently stated Mercury never executed because its supplied receipt incorrectly said not_selected / 0 iterations.

Moved result retention before existing answer qualification. Failed-seat metadata now uses the existing error.reviewerResult and retains its failure text. Existing reviewer evidence formatting includes failed provider status/termination/error/raw-reference evidence. Failed seats remain failed with null verdict and evidenceChecksPassed=false. Explicit answer_given eligibility preserves the previous behavior of not launching a recheck after primary provider failure.

This corresponds to the demonstrated recovery-clone lead in the older 02-preserve-failed-mercury-handoff.patch, adapted to the actual current code rather than applied wholesale. That patch and clone remain untouched.

Executed the actual coordinator/prompt/ledger producers before and after, with recorded provider failure, 18 newly executed read-only source tools and intercepted provider/database/notification boundaries. Before: zero iterations/tools/primary-stage attempts. After: 18 iterations, 18 tool results, 19 provider attempts; both downstream prompts include failure text and exact raw-failure hash. UNVERIFIED preserved, one primary loop in both observations. No paid request in this observation.
