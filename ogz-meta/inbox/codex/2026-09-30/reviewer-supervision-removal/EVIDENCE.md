# Evidence

Baseline c080995a94d322a61950ee606d4f667c9dfe63c0. Initial live-review candidate/harness d652cb32bc74b299fae45141058193f65f39ee1e. Final prompt sweep removes the remaining “In Phase 2” wording; revised candidate c2e2846ca1f23f89c26ecc8263fbc0d2528abceb. No default Mercury iteration ceiling added; provider output allowance 7750.

## Offline observations

- node --check for all four changed JavaScript modules: exit 0.
- jest --runInBand --runTestsByPath test/mercury-react-loop.test.js --silent: 34 passed. Covers direct raw-answer return, no schema retry, incomplete diagnostics, explicit operator limit, uncapped continuation beyond 60 calls, tool/source telemetry.
- node ingestion-proof.cjs: baseline malformed testimony consumes 7 calls then fails; candidate consumes 3 calls and returns the actual answer. Missing structure remains diagnostic; literal captured source and unparsed testimony reach the final reviewer. Provider exceptions and empty output remain failures. See INGESTION-PROOF.json.
- node panel-ingestion-proof.cjs: actual runExplicitTargetReview → ensureReviewerAnswer → runReviewerPanel → buildRunLedgerEntry, mocked providers; exact Kimi verdict preserved, missing final seat does not inherit an earlier pass. See PANEL-INGESTION-PROOF.json.
- node continuation/proof.cjs and continuation/cross-proof.cjs: raw answers, source/read diagnostics, original/discovered claims, archived testimony, and nonduplicating recheck accounting. See continuation/proof.json and cross-proof.json.
- node continuation/owner-proof.cjs: actual runReviewRechecks orchestration, three requested rechecks, four total fixture calls including initial answer, parsed actual verdict, zero quarantine, byte-exact answers and JSON-serializable receipts. Uses working ask.js with explicitly inherited temperature changes. See owner-proof.json.
- Four adjacent suites: HEAD and candidate both 75 passed/30 failed, exact same failure names. See tests/consumer-comparison.json; no additional stale schema-retry assertions found.
- Serena AST scan: 21 files parsed of 21 scanned, zero parser errors; corrected reviewer-panel.js caller census in blast-after.json. Static scan excludes repository-policy ignored paths, is not complete dynamic proof, and includes inherited working deltas.
- Follow-up active-module search for removed assess, repairFeedback, isCandidateSetResponse, candidateNeedsRevision, buildRepairMapRequest and impasse controls: no matches.
- git diff --cached --check: exit 0. node scripts/scan-secrets.js --staged: exit 0 before packet staging; final scan still required.

## Named absences

Mocked-provider probes test behavior, not reviewer reasoning. They do not establish a clean adversarial verdict. No trading runtime, deployment, index freshness, or Stop1 completion is claimed. Live run IDs/verdicts and redacted tape hashes are recorded in REVIEW.md and TAPES.json after review completion. Raw private data is excluded from staging.

## Final-source qualification

The staged supervision-only source (plus scoped changelog) is 5ca3c369188c3841c10593d8ece061f57f21886a. Review harness 509ddeedc6217e285aeb0e9728c3ad615a18f74b adds only continuation/transport.patch to that source, using a temporary Git index, not a worktree. Transport remains a separate production commit per Trey.

Exact-tree React tests against c2e2846ca1f23f89c26ecc8263fbc0d2528abceb (identical runtime blobs to the final supervision tree): 34 passed. Initial test startup lacked an embedding-key environment variable; rerun used an explicit inert fixture value and made no provider calls.

The captured live tool-result transport replay uses calibrated fixed overhead, not a full captured request. It demonstrates102716→91074bytes, all77matches reconstructed through50pages,100calls undercap, unchanged read credit, plain-text Unicode preservation, and explicit irreducible-envelope failure. See continuation/transport-proof.json. This proves transport behavior for those fixtures, not semantic reviewer correctness.

Offline proof scripts whose private inputs are not delivered are on-box reproduction tools; the portable delivery contains their observations and source identities, not a claim that those private-input scripts rerun from a fresh clone.

## Transport-delivery correction during review

The initial under-cap transport proof did not establish that the newest requested tool result reached the model. delivery-proof.json reproduces that omission: 87227-byte request lacks the latest tool message; corrected 92007-byte request includes the exact message. When that result cannot fit, a 95712-byte request exposes its receipt ID and a successful lookup. Portable transport tests cover those delivery properties. This correction belongs to the separately qualified harness eae8f9058b7d1a6f702641f3dea6e960cf9004d5, not the supervision-removal production diff. Third live run has not completed and still repeats source reads; these fixtures do not prove operational completion.

Final qualified harness 55361b324d94f1e8ae6e07a18d4780629cc793a6 adds latest-result delivery, archived bulky prior observations/claim details, and the exact prior panel receipt aliases. continuation/harness-55361b.patch contains its two-file difference from candidate5ca. Seven focused exact-harness tests pass;51prior excerpts reconstruct exactly across250pages. The actual requested tool://mercury-pass-1/8/8 alias resolves. Original target identities and claim IDs remain inline, and receipt reads do not manufacture source coverage. See harness-55361b-qualification.json and prior-panel-receipts-proof.json. An independent bounded source audit found no additional confirmed defect; it is not the provider panel verdict.

Final cleanup execution: `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath test/mercury-react-loop.test.js` produced30passed in followup/orphan-cleanup-test.log. Four tests solely exercised the removed unused helper. Runtime and test working bytes equal the staged candidate8cfb8d1 blobs; broader inherited files are not claimed clean. Repo source/test search found no remaining normalizeToolHandleCitations reference after removal.

Packet diff whitespace qualification: archived unified patches retain blank context lines (a single space) byte-for-byte to preserve their recorded hashes. `git diff --cached --check -- . \':(exclude,glob)**/*.patch\'` passes for production, tests and non-patch packet files. The all-path check reports only those patch-format context lines.

Receipt-packaging qualification: the first whole-tape redaction attempt exceeded Node’s default heap while preserving a453MiB complete follow-up JSONL. Re-running the packet-only command with `node --max-old-space-size=8192 package-tapes.cjs` completed without changing production limits or truncating evidence. The final archive is validated by original/redacted/compressed hashes and the secret scanner.

Final tape secret handling also applies the repository burned-token hash/prefix denylist before redactSensitiveText. The generic ledger redactor intentionally preserves64-hex hashes and did not remove revoked token literals in historical source excerpts. Original-on-box files remain untouched; only committed redacted copies change. All940 tapes must pass the independent scanner and three-hash validation before delivery.
