# Delivery manifest

Source/date: 2026-09-29 authorized Mercury false-finding investigation and source-delivery completion. Production was changed during the explicitly authorized implementation phase; packet finalization changed only inbox artifacts. No worker staging, commit, push, provider call or runtime operation occurred.

The exact minimal packet stage list is `STAGE-ALLOWLIST.txt`. It includes mission/work/evidence/review/inherited accountability, the exact patch/hash identity, an in-memory reconstruction builder, portable offline replay/limit fixtures, and compact proof receipts. Production staging remains the parent's responsibility and must match the six-file candidate patch rather than whole dirty files.

Why retained:

- Accountability markdown records scope, inherited work, actual verification and pending Mercury approval.
- IMPLEMENTATION.json + head-plus-repair.patch + builder/loader preserve exact reviewed source without committing six full duplicate modules.
- recorded-allegation.json + replay.cjs + replay-result.json preserve the real false finding and reproducible source-delivery proof.
- reduction-limits.cjs + verification-proof.json preserve source/reduction/request-bound checks and honest inherited-test failures.
- build-proof.json proves reconstructed source hashes; Jest transform/config permit exact base-versus-overlay reruns.

Do not stage: `clean-implementation/`, `fixtures/`, any `*.log`, the obsolete absolute-path `jest.config.json`, or initial QUALIFICATION.md. They remain locally preserved as investigation evidence but are not required to reproduce delivered checks. Do not stage private/source-ledger/provider/raw evidence or loose neighboring packets. The separate independent review packet is parent-owned and is not implicitly included by this allowlist.

Reconstruction is in memory from the pinned Git base and exact patch. The replay regenerates its scanner fixture inside this inbox packet; no source duplicates are required in the commit. No artifact is promoted to canonical specs by this delivery.

- `review.cjs`: prepared parent-only provider runner; included in the stage allowlist. Its future private result/ledger directories are excluded. Provider approval remains pending until an actual qualified review receipt is recorded.

- `package-tapes.cjs`: syntax-checked only; parent invokes after result.json exists. Packages invocation/result, ledgers, referenced raw tapes and source manifests using pinned6bc redaction, three SHA-256 identities, unique-sibling hash recovery and an explicit missing list. Outputs go to a per-invocation tapes directory; package only the resulting redacted artifacts after review. No tape packaging has run in this preparation phase.
- `source-reachability.json`: proves the replay's source is reachable from the pushed branch and byte-identical to the historical candidate source.

Root delivery additions: CANDIDATE.json, ROOT-CANDIDATE-PROOF.json, REVIEW-STATUS.json, tapes/review-2026-09-29T13-08-04-446Z/TAPES.json, TAPE-SCAN.json and tapes/. Full provider evidence is redacted and compressed with original/redacted/compressed hashes. No private raw files or generated source copies are staged.
