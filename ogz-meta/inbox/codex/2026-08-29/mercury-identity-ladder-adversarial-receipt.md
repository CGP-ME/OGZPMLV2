# Mercury identity-ladder adversarial receipt

Date: 2026-08-29

Review base: `3b812427e33e5cca4f76ff7a00e18c898a4b1bfc`

This receipt covers Trey's ruling that provider model identity is stamped rather
than fatal. A documented transition retains full authority. An undocumented or
missing identity is stamped `identity_conflict`, caps the review at
`UNVERIFIED`, emits a max-priority ntfy quarantine, and lets the run continue.
An unattested Claude executable remains the sole identity-boundary hard stop.

## Implementation scope

Production:

- `trai_brain/mercury-bridge/llm-client.js`
- `trai_brain/mercury-bridge/adversarial-review.js`
- `trai_brain/mercury-bridge/ask.js`
- `trai_brain/mercury-bridge/provider-preflight.js`
- `trai_brain/mercury-bridge/run-ledger.js`

Tests:

- `test/mercury-consensus.test.js`
- `test/mercury-llm-config-contract.test.js`
- `test/mercury-provider-preflight.test.js`
- `test/mercury-run-ledger.test.js`

The parser records ordered primary-model observations, verdict-bearing models,
auxiliary model usage, and explicit transition frames. A Fable invocation that
contains a provider-documented Fable-to-Opus transition remains one
`fable_challenger` attempt; it is not relabeled as the repository pipeline's
separate Opus fallback. Receipts and the schema-v2 ledger add identity posture
without changing the schema version or removing legacy fields.

## Forced trace matrix

The focused tests mechanically force all three ruled postures:

1. `provider-documented Fable transition retains full authority and frame facts`
   and `documented provider transition keeps the Fable seat at full authority
   without pipeline fallback` prove ordered transition/identity facts, full
   authority, and no pipeline Opus-client invocation.
2. `undocumented identity mismatch is stamped, screamed, capped UNVERIFIED, and
   continues` proves the answer returns, the load-bearing `identity_conflict`
   quarantine remains attached, max-priority ntfy receives a successful
   transport receipt, and packet/ledger authority is `UNVERIFIED`.
3. `genuinely untrusted Claude executable remains a hard stop and cannot invoke
   Opus` plus the executable-contract test prove an unattested executable is
   rejected before execution and cannot route to another model.

The four focused suites passed 90/90. Syntax checks passed for all nine files,
and `git diff --check` passed.

## Historical guard-tape parse

The exact secured guard challenger tape is:

`ogz-meta/cognition-history/mercury-runs/raw/2026-08-28/2026-08-28t22-20-18-961z-1263649-62c534752244/fable_challenger-1.raw`

- SHA-256: `2883b98b2595ac9acdfdaaf0477ab269f852b23d012d00ce7df6cacfbdc5fa3c`
- Bytes: 21,673
- Mode: `0600`
- Frames: 23
- Applied models: `claude-fable-5`, `claude-opus-4-8`
- Verdict-bearing model: `claude-opus-4-8`
- Auxiliary models: `claude-haiku-4-5-20251001`, `claude-opus-5`
- Explicit transition frames: sequences 3 and 22
- Parsed posture: `documented_transition`, authority `full`

This is a documented provider-internal transition inside the Fable attempt. It
does not assert that the repository pipeline's explicit Opus fallback ran.

## Live adversarial run

Command frame:

`Mercury, break my fix.` with `--agentic --show-history
--adversarial-review --max-iterations=60 --max-tokens=7750` against the exact
uncommitted nine-file diff.

- Run ID: `2026-08-29T03-23-25-972Z-6b9ba7102d6b`
- Ledger: `ogz-meta/cognition-history/mercury-runs/2026-08-29.jsonl:1`
- Raw directory:
  `ogz-meta/cognition-history/mercury-runs/raw/2026-08-29/2026-08-29t03-21-44-343z-1285651-1047ee9b6cde/`
- Raw files: 30, all mode `0600`
- SHA-256 of the sorted `sha256  basename\n` manifest:
  `219e189ec247892d5c50838211ca93270220da5cae560e8e266ecf0c2a361ba0`
- Mercury: `mercury-2`, `answer_given`, 10 iterations
- Fable: requested Fable, applied `claude-fable-5`, auxiliary
  `claude-haiku-4-5-20251001`, posture `matched/full`, tools available `[]`,
  calls `[]`, mechanically opened files `[]`
- Fable raw: `fable_challenger-1.raw`, SHA-256
  `13608bcaafdafe3c80adcb8958de0ef159094ce94425e63aae917c75053002ad`,
  17,049 bytes
- Fable stderr: `fable_challenger-stderr-1.raw`, SHA-256
  `e705bbf8982385da2b1a03725921d0a6c6730bbaadd22c8f9168522573d067e0`,
  157 bytes
- Bounded Mercury recheck: 17 iterations, final raw
  `mercury_recheck_1-17.raw`, SHA-256
  `003d5b9f2a574a6a65d18c1c64bb87cccca2eaf336c422eacd2ad04dcaac3974`
- Kimi: applied `kimi-k3`, posture `matched/full`, tools available `[]`, calls
  `[]`, mechanically opened files `[]`
- Kimi raw: `kimi_tie_breaker-1.raw`, SHA-256
  `7563811ac3f7b114111d7258e39033d9d18bade833fe03f3fd14a433b7fd00a6`,
  1,928 bytes
- Final ledger verdict: `no_break_found`; no quarantines

## Allegation and mechanical adjudication

Mercury alleged that the pre-existing `parseAdversarialReviewAnswer` behavior
which treats a missing `CONSENSUS_BLOCKING` field as blocking was a defect.
Fable challenged the unstated premise and required a bounded recheck. Mechanical
comparison of `HEAD` and the working diff confirmed the relevant parser logic
was byte-for-byte outside this identity change and already failed closed on the
review base. The recheck retracted the break claim as unsupported; Kimi's final
verdict was `pass`. No identity-ladder defect remained.

Mercury's sandbox `npm test` checks failed with exit 127 because that sandbox
did not contain `jest`. The immutable artifacts are:

- `ogz-meta/cognition-history/mercury-execution/2026-08-29T03-22-02-720Z-test-run.log:1-18`
- `ogz-meta/cognition-history/mercury-execution/2026-08-29T03-23-06-902Z-npm.log:1-18`

This environment limitation is not represented as a passing test. The same
focused suites were rerun in the review clone using the repository's installed
dependencies and passed 90/90.

## Broader regression result and named limitations

The full `test/mercury-*.test.js` sweep passed 196 tests and failed two assertions
in `test/mercury-index-scope.test.js`. A fresh `git archive HEAD` reproduction at
the review base produced the same failures: expected Alignment README indexing
and the absent `index_scope.ogz_meta_eligible_dirs` field. These inherited index
failures are outside the nine touched files and were not changed or hidden.

The live run itself observed a matched Fable identity. The documented-transition
path is proven against the exact historical guard tape and offline forced tests;
the undocumented-conflict and unattested-executable paths are forced offline.
Raw provider text remains secured and ignored; this tracked receipt records only
its immutable paths, hashes, identities, isolation, and adjudicated outcome.
