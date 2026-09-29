# Final selected artifacts

## Production overlays

- fixtures/module.patch
- fixtures/loader-final-head.patch
- fixtures/producers.patch
- fixtures/role-ownership.patch

These four patches are the reproducible clean authority. Root already has the live module edit and applied loader-final-working.patch; do not duplicate them. Use fixtures/producers-working.patch for serial integration amid sibling MA edits.

## Deliverable fixture code and metadata

- fixtures/build.cjs
- fixtures/baseline-sha.txt
- fixtures/observe.cjs
- fixtures/integrated-save.cjs
- fixtures/producer-integration.cjs
- fixtures/reload-policy-probe.cjs
- fixtures/role-ownership-probe.cjs
- role-ownership-result.json
- build-receipt.json
- source-manifest.json
- constructor-evidence.json
- behavior.json
- integrated-save.log
- producer-integration.log
- reload-policy-probe.log
- MISSION.md, WORK.md, EVIDENCE.md, REVIEW.md, INHERITED.md, MANIFEST.md, PUBLICATION-QUALIFICATION.md, FINAL-ARTIFACTS.md

Do not deliver fixtures/baseline/ or fixtures/candidate/: build.cjs reproduces them. Earlier loader.patch, loader-working-context.patch and loader-save-only-* patches are superseded historical proposals, not selected implementation.
