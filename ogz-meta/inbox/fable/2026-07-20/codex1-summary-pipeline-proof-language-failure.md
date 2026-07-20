# Pipeline Proof Language Failure

## Verdict

Trey's complaint is confirmed: wording and proof posture were traveling through the pipeline without guaranteeing the mechanism was actually gone.

Concrete example found during this pass:

- `test/pipeline-operator-review-contract.test.js` asserted that legacy Mercury halt vocabulary was gone.
- The scan omitted `ogz-meta/manifest-schema.js`.
- `ogz-meta/manifest-schema.js` still initialized and consumed `stop_conditions.forensics_critical`.

That means the fourth-shape pipeline cleanup could report "forensics_critical removed" while a live schema stop condition still existed.

## Root Cause

The operator-review contract tested selected surfaces:

- `ogz-meta/pipeline.js`
- `ogz-meta/slash-router.js`
- Mercury bridge/reporting files
- selected runtime isolation paths

It did not test the manifest schema that actually owns stop-condition state.

This is the same structural class as the config audit miss:

> The test checked the story around the invariant, not the complete mechanism that could violate the invariant.

## Fix Applied

Files changed:

- `ogz-meta/manifest-schema.js`
- `test/pipeline-operator-review-contract.test.js`

Change:

- removed `stop_conditions.forensics_critical`
- removed the `shouldStop()` branch that halted on `forensics_critical`
- added `ogz-meta/manifest-schema.js` to the forbidden-vocabulary scan in `test/pipeline-operator-review-contract.test.js`

## Verification

Run:

```bash
npx jest test/pipeline-operator-review-contract.test.js --runInBand
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

Red-on-parent proof:

```bash
PIPELINE_CONTRACT_REF=HEAD^ npx jest test/pipeline-operator-review-contract.test.js --runInBand
```

Result:

```text
FAIL test/pipeline-operator-review-contract.test.js
pipeline tooling cannot preserve legacy Mercury halt machinery
Expected substring: not "forensics_critical"
```

Direct vocabulary scan over the enforced source set:

```bash
rg -n "forensics_critical|commit_blocking|human_ack|mercury-ack|fail-findings|resume-after-ack" \
  ogz-meta/manifest-schema.js \
  ogz-meta/pipeline.js \
  ogz-meta/slash-router.js \
  trai_brain/mercury-bridge/run-ledger.js \
  trai_brain/mercury-bridge/substrate-digest.js \
  scripts/mercury-substrate-digest.js \
  ogz-meta/specs/mercury-deepsearch-substrate-spec.md
```

Result: no matches.

## Follow-Up Law

Proof contracts must enumerate every owner of the mechanism, not just the files touched by the last patch.

For this class, the owner set is:

- pipeline stage list
- slash-router handlers
- manifest schema
- bridge/run-ledger classifiers
- tests that claim the vocabulary is forbidden

If one owner is left out, the test is not a contract. It is a partial grep.
