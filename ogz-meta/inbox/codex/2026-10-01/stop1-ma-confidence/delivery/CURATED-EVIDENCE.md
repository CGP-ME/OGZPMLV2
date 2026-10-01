# Curated MA evidence delivery list

Complete artifacts, not substitutes for their contents:

- MISSION.md: original migration task and authorization, including actual cap producer correction.
- READINESS.json and WORKING-INTEGRATION.json: locked four-patch identities, five expected candidate hashes, nine owned working changes, preserved inherited deltas.
- BLAST-BEFORE.json: complete static caller census with its dynamic-reachability limitation.
- ../2026-09-29/ma-sr-confidence/CAP-BOUNDARY.md: actual first-candidate defect and full producer/consumer trace; preserves why the earlier positive-cap assumption was wrong.
- ../2026-09-29/ma-sr-confidence/module.patch, producers-after-ema.patch, loader-dependent.patch, cap-boundary.patch: exact unchanged migration patches.
- ../2026-09-29/ma-sr-confidence/integration-cap-qualified.cjs and cap-boundary.cjs: unchanged portable fixtures. Today's exact-fixture.cjs selects the immutable tree and only routes output; it does not overlay source corrections.
- private/integration-cap-review-<candidate-tree>.json: complete four-owner save/reload/state/source/tape receipt, including explicit limits.
- private/cap-boundary-corrected-<candidate-tree>.json: complete actual orchestrator cap/save/force-replacement receipt.
- delivery/integration-cap-qualified.cjs.exact-identity.json and delivery/cap-boundary.cjs.exact-identity.json: original fixture hash, candidate identity and no-overlay declaration.
- CANDIDATE.json: immutable source/base/harness identities supplied by root after staging.

Preparation commands:

1. node ogz-meta/inbox/codex/2026-10-01/stop1-ma-confidence/exact-fixture.cjs integration
2. node ogz-meta/inbox/codex/2026-10-01/stop1-ma-confidence/exact-fixture.cjs cap
3. node ogz-meta/inbox/codex/2026-10-01/stop1-ma-confidence/review.cjs

The last command is prepare-only: it verifies exact-source proof identity, saves complete proof document bytes into private/review-evidence-documents.json and records the intended existing runAgentic request. It has no provider-dispatch code. Root must inspect the existing receipt/evidence input path and deliver those complete documents without truncating them or repeating roughly 47KB inline every model turn. REVIEW-PREPARED.json explicitly labels the evidence as not yet provider-delivered.

Upcoming final evidence: actual adversarial panel raw answers/rechecks, redacted tapes and both hashes, staged source hashes, atomic commit and confirmed remote SHA. None is currently claimed.

Private fixture trees and arbitrary raw output are excluded from publication. Root should inspect/redact the two proof JSON documents before promoting them; retain their original hashes.
