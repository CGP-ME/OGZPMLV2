# WRITE PROPOSAL: MISSION-1779470782185
Generated: 2026-05-22T17:26:22.352Z

## ⚠️ ADVISORY MODE — NO CHANGES MADE
This proposal is a deterministic application of spec block(s). Nothing has
been modified. Re-run with --execute to apply.

## Source
- Spec: `ogz-meta/review-artifacts/pipeline-multifile-write-smoke-spec.md`
- Fix: 999 — Smoke multi-file write proposal
- Files: `ogz-meta/spec-parser.js`, `ogz-meta/slash-router.js`
- Line hints: ogz-meta/spec-parser.js: ~70; ogz-meta/slash-router.js: ~2181
- Edit count: 2

## ogz-meta/spec-parser.js - Edit 1 of 1

### str_replace target (verbatim from spec)
```
function parseFix(specPath, fixId) {
```

### str_replace replacement (verbatim from spec)
```
function parseFix(specPath, fixId) {
```


## ogz-meta/slash-router.js - Edit 1 of 1

### str_replace target (verbatim from spec)
```
async function architectVerify(manifest, params) {
```

### str_replace replacement (verbatim from spec)
```
async function architectVerify(manifest, params) {
```


## Pre-flight verification (from architect-verify)
- Total target occurrences across all edits: 2
- All edits verified: true
- Per-edit verifications: [{"file":"ogz-meta/spec-parser.js","edit":0,"occ":1},{"file":"ogz-meta/slash-router.js","edit":0,"occ":1}]

## Approve
```
node ogz-meta/approve.js MISSION-1779470782185
node ogz-meta/pipeline.js --write --spec ogz-meta/review-artifacts/pipeline-multifile-write-smoke-spec.md --fix-id 999 --execute
```

## Reject
```
node ogz-meta/reject.js MISSION-1779470782185 "<reason>"
```
