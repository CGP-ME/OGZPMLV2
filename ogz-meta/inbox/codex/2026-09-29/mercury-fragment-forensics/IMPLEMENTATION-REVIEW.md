# Completed source-delivery correction — offline review

Date: 2026-09-29. This supersedes the pre-fix result in QUALIFICATION.md; that report remains preserved as the investigation record.

## Exact candidate

Base: `6bcfad8a25f72cb9e1eb946e854695913b2133c4`.

`head-plus-repair.patch` SHA-256: `6f8031741e8a016305942917d344ae434c70beebeb66e0459b2f3e7660e8d514`.

`IMPLEMENTATION.json` records each exact base/overlay/worktree file hash. `build-implementation.cjs` reconstructs the six desired production files in memory from the pinned base and hash-verified patch, excluding inherited search-glob and temperature-only edits. `clean-loader.cjs` executes exactly these hash-verified reconstructed overrides and loads all other tracked JavaScript from the pinned base commit. The earlier local `clean-implementation/` copies are not needed and are excluded from delivery. No worktree or branch was created. `git apply --cached --check head-plus-repair.patch` succeeded; this read-only check did not stage anything.

Production changes newly authored in this pass are confined to `evidence-ingestion.js`:

1. `bindCandidateClaims` supplies all accepted source ranges for the cited target when no hash-matched containing function can be obtained. A false citation, absent AST receipt, mismatched hash, or citation outside a known function no longer leaves only a narrow use-site excerpt. It continues to honor accepted source ranges; missing coverage remains unresolved under the existing coverage owner.
2. Final adjudication explicitly receives deduplicated source nodes from the same claim-bound evidence used for candidate filing. Host-selected quotations remain in the candidate ledger, but no longer replace the surrounding captured source.

No new throw, semantic regex, automatic verdict, iteration ceiling, enlarged configured request limit, provider call, or runtime change was added. The existing retained-source producer path still rejects an evidence envelope that cannot fit without discarding source. All other edits in the clean patch are the inherited coherent claim-adjudication lane itemized in INHERITED.md. The `tool-adapter.js` directory/glob edits and all temperature-only option/telemetry hunks remain outside the patch and untouched in the worktree.

## Verification

All checks below ran against the pinned clean overlay, not ambient dirty Mercury implementation:

- `replay.cjs`: PASS. Actual recorded false-stat allegation, historical candidate bytes, real current scanner, independent AST check. Matching hash supplies function434–570 to both candidate and final at the configured98304-byte envelope. Missing/mismatched hashes supply the entire accepted file when the configured fixture envelope fits it; at98304 the oversized fallback reports explicit unresolved evidence and makes no candidate/final provider callback. Every dispatched envelope is byte-checked; no iteration limit is supplied.
- `reduction-limits.cjs`: PASS. Sixteen lossy summary reductions occur while literal source and filed claim decisions never enter the reducer. Both candidate and final retain literal source. A149542-byte literal source triggers explicit envelope failure, zero candidate dispatches, zero reductions and authorityReady=false.
- Existing `claim-protocol.cjs`: PASS for claim retention, unresolved qualification, malformed candidate quotation repair and malformed final ID repair.
- Existing `claim-reduction-source.cjs`: PASS.
- Existing `claim-reduction-fixedpoint.cjs`: PASS; non-contracting responses terminate on repeated evidence identity, preserve unresolved results, continue another target when possible, and use no iteration ceiling.
- Existing `claim-target-continuation.cjs`: PASS.
- Four existing Jest suites (`mercury-react-loop`, `mercury-consensus`, `mercury-run-ledger`, `mercury-serena-ast-tools`): baseline and clean repair each have exactly92 passed and25 failed tests; the failed test names are identical. These suites are not claimed green. They contain inherited panel-authority/contract expectations already failing at the pinned base. `verification-proof.json` preserves the counts, exact failed test names, and SHA-256 identities of both local full logs. `base-jest-tests.log` and `clean-jest-tests.log` remain local evidence and are excluded from delivery. An initial attempt used the wrong Node test runner and is preserved separately as `clean-focused-tests.log`; its failures are not behavior evidence.

## Reproduce

From the repo root:

```sh
node -r ./ogz-meta/inbox/codex/2026-09-29/mercury-fragment-forensics/clean-loader.cjs ogz-meta/inbox/codex/2026-09-29/mercury-fragment-forensics/replay.cjs
node -r ./ogz-meta/inbox/codex/2026-09-29/mercury-fragment-forensics/clean-loader.cjs ogz-meta/inbox/codex/2026-09-29/mercury-fragment-forensics/reduction-limits.cjs
```

The replay uses a sanitized exact recorded allegation in `recorded-allegation.json`; it does not require private full-review JSON. The historical source is obtained from its explicit Git tree and verified against the original receipt hash. All provider replies are deterministic in-process callbacks. These tests establish source transport and qualification, not correctness of fresh model reasoning. No Mercury provider review, staging, commit, push, or restart was performed. Parent integration still owns production review and delivery.
