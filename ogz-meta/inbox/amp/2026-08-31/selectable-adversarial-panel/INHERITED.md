# Inherited Doctrine Violations

Every touched implementation/test file was inspected. Findings below describe
pre-existing inherited conditions only; they were not widened or repaired by
this mission unless explicitly stated.

- `trai_brain/mercury-bridge/ask.js`: inherited broad command/orchestration
  ownership, extensive direct console output, and multiple legacy error catches
  remain. They predate this diff. No inherited violation was changed outside
  selectable-panel dispatch/provenance territory.
- `trai_brain/mercury-bridge/adversarial-review.js`: inherited provider,
  fallback, prompt, raw-receipt, and identity responsibilities remain combined
  in one large module. No unrelated split/refactor was authorized.
- `trai_brain/mercury-bridge/run-ledger.js`: inherited schema-v2 ledger and
  redaction responsibilities remain combined. Historical receipt hashes were
  not backfilled or rewritten.
- `trai_brain/mercury-bridge/reviewer-panel.js`: new file; no inherited content
  or inherited violation.
- `test/mercury-consensus.test.js`: inherited large multi-contract test file
  remains. Only reviewer-argument parsing coverage was added. The repository
  secret scanner flags the inherited fixture at line 185; it is outside the
  changed range.
- `test/mercury-run-ledger.test.js`: inherited large schema/redaction test file
  remains. Only additive reviewer-panel receipt coverage was added. The
  repository secret scanner flags inherited redaction fixtures at lines 64-65
  and 109-110; all are outside the changed range.
- `test/mercury-reviewer-panel.test.js`: new file; no inherited content or
  inherited violation.

Packet files and redacted tape files are new mission evidence and contain no
inherited implementation. The packet deliberately records the unresolved
adversarial absence rather than converting it into a PASS.

Part C's separate 22-file diff is inherited concurrent work in another checkout
and was neither read as mission evidence nor touched, staged, or included.
