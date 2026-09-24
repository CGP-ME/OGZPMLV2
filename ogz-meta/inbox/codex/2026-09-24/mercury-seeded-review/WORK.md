# Work checkpoint

2026-09-24. Parent/source HEAD: `f9f966470c5f81b64459d50f6ef4e707c5de0b08`, branch `astra-era`.

No production edits or commits in this mission. The 25 pre-existing tracked dirty paths remain preserved, not approved by this exercise. Index was empty before the run.

Completed:

- Created `fixtures/candidate.patch`: one hypothetical serializer regression. `git apply --check` succeeded; patch NOT applied.
- Created `private/mercury.isolated.json`, identical to root Mercury config except database, chunks/stats/trace collection names. Candidate database `ogz_mercury_recovery_20260924_007` was empty; live `ogz_knowledge` separately hashed.
- Ran existing `capture-state.cjs`: 498 nonignored source paths, 423 eligible index paths. Captured tracked and dirty bytes, modes, HEAD, index, config, ignore and embedding/storage identity.
- Ran existing `dispatch.cjs preflight`: Mercury, Claude Fable and Kimi all ready and identity matched. Full receipt is `private/provider-readiness.json`.
- Started actual indexer using existing `dispatch.cjs index private/mercury.isolated.json`; exact command/output in `private/index-command.json`, `private/index.private.log`, and completion receipt when finished.
- Executed the real canonical hash functions in an isolated VM, with the single candidate replacement applied only in memory, over six synthetic input pairs. All six match the predeclared expected results. This is a bounded scoring-key observation, NOT full ConfigLoader or bot execution. Exact command, input pairs and output hashes are in `private/withheld-expected.json`.
- Prepared `private/question.txt`, explicitly scoped to the hypothetical patch. The expected result file is excluded by the existing inbox/fixture retrieval policy and is not in the question.

Index completed 06:50:15 UTC, exit 0. Exact reconciliation passed: 9,333 expected/stored chunks, zero source mismatches, missing/unexpected chunks or invalid embedding identities. All live-index documents/vectors unchanged. Of 423 eligible paths, 29 produce zero chunks under the existing parser/index policy; these include both config JSON files. This is not concealed as complete JSON retrieval coverage; direct read-only source tools remain available.

Actual review launched 06:51:07 UTC, PID 594762. The exact existing CLI invocation and question are in `private/review-command.json`; the operator shell command is `private/operator-review-command.txt`. One run, 7,750 tokens per configured turn, no arbitrary iteration ceiling. No new helper or pipeline architecture is introduced. The expected-key and scoring-key hashes were recorded in the command receipt before launching the child.

Completed 06:55:26 UTC. Full chain caught the seed through Fable but retained UNVERIFIED/evidence failure/reviewer disagreement. Semantic review: REVIEW.md. Post-run source/index reconciliation passed. Exact Kimi recheck delivery verified; lost-handoff hypothesis disproved. All 48 provider outputs and both ledger rows exported with redaction and original/committed hashes. No production source changed.

Commit boundary: this mission's six Markdown packet files, unapplied fixture, explicit receipts and tapes only. Existing dirty code, private originals/configuration and other missions remain unstaged. This evidence packet follows the standing instruction to land completed work and accountability-packet ruling; no bot source commit is authorized by this test. Commit/push receipts follow staged-diff review.

Staged diff reviewed: 28 mission-only files. `git diff --cached --check` reports the intentional single-space blank context line inside the exact unified patch/question and trailing blank lines in captured question/expected JSON. These captured artifacts are deliberately not reformatted after hashing. All 18 standalone exported artifact hashes and gzip round trips rechecked; two ledger rows and 48 provider records parse. Selected common credential-signature scan returned zero matches (not a universal secret guarantee).

## Commands already completed / running

```text
git apply --check ogz-meta/inbox/codex/2026-09-24/mercury-seeded-review/fixtures/candidate.patch
node ogz-meta/inbox/codex/2026-09-24/mercury-full-chain/capture-state.cjs ogz-meta/inbox/codex/2026-09-24/mercury-seeded-review/private/mercury.isolated.json ogz-meta/inbox/codex/2026-09-24/mercury-seeded-review/private/source-before-index.json
node ogz-meta/inbox/codex/2026-09-24/mercury-full-chain/dispatch.cjs preflight ogz-meta/inbox/codex/2026-09-24/mercury-seeded-review/private/mercury.isolated.json
node ogz-meta/inbox/codex/2026-09-24/mercury-full-chain/dispatch.cjs index ogz-meta/inbox/codex/2026-09-24/mercury-seeded-review/private/mercury.isolated.json
```
