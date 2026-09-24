# Evidence

## Current completed run (supersedes the historical checkpoints below)

Frozen HEAD: 392ef406053e4c17cf2af731244e5338681828e0. Actual broad question: `Mercury, break my fix.`; reviewers mercury,fable,kimi; max tokens 7750; no max-iterations. Isolated database ogz_mercury_recovery_20260924_005. Storage selection uses MERCURY_CONFIG_FILE, changing only four existing storage fields. No live index replacement or bot activation.

Run 2026-09-24T03-02-27-549Z-07996716eba8 completed 03:02:28 UTC. Mercury primary: 24 iterations, 21 tools. Recheck: 9 iterations, 7 tools. Fable and Kimi succeeded with matched actual identities and their own answers. 35 provider attempts; aggregate recorded input 2,023,970 and output 24,889 tokens. Reported cost $3.474140325 is a provider-receipt calculation, not an independently reconciled invoice.

reviewer-role/index-verification.json and post-review-verification.json passed: all 9,332 expected/stored chunks, no source/missing/unexpected/embedding mismatches; full live collection digests unchanged. 498 nonignored source files, 423 eligible paths. Source digest abfb4db38b6fcc62ff92292ce8c59b2c084a01b46bc86e1864fbf0176707f5f6; indexed-file digest 37d0df3ba618cdc9d5c112705180454acd866494d58d212f2cd946ed90821c51.

Actual host artifact: 168,189 bytes, 39 sections, all section hashes matched. Fable received 248,880 prompt bytes including 32 host excerpts and 21 tool results. Kimi received 305,495 prompt bytes including 32 host excerpts and 28 tool results. One sanitized virtual tool excerpt differs from the original bytes by redaction; it is not a corrupt or missing local artifact. Raw receipts remain local in the paths recorded by review-inspection.json; do not publish complete provider metadata or private prompts.

False finding checked directly: config/settings.json:1860-1866 contains the canonical beScaleOut block with triggerType at 1863. The primary's cited 1179-1182 range is a different profile setting. Recheck search delivered all three beScaleOut matches; recheck opened 1190-1240 (profile overrides), not the base block. ProfitExitPlanner.js:152-176 has earlier null/disabled, zero-fraction, state and contract-partial branches; the primary's unconditional failure claim is unsupported. No bot execution was used to establish this source counterexample.

Kimi handoff checked directly: its supplied source tool://mercury-pass-2/3/3 contains PolicyBuilder.js:250-340, 4,611 bytes, delivery.truncated=false, including the normalizer at 280-287. Kimi's assertion that this file was unopened is contradicted by its input, not evidence of a handoff omission.

No model-directed AST calls occurred in this run. Host scanning of 23 changed JavaScript files is separately recorded and does not establish exhaustive dynamic reachability. Literal search is not fuzzy search. Final UNVERIFIED is retained; no full-coverage, Stop 1 completion, deployed correctness or cold-pull acceptance claimed.

## Historical checkpoints (not current execution state)

- source-before-index.json: exact 498 nonignored code/config files and 423 index paths, modes, hashes, diffs, policy/config and storage identities. Credentials excluded.
- provider-readiness.json and ledger/2026-09-24.jsonl: actual matched Mercury-2, Claude Fable-5 and Kimi-K3 responses. Readiness only.
- index-command.json, index.private.log, eventual index-completion.json: actual CLI execution, not a simulated boot.
- verify-index.cjs: read-only multiset comparison of all expected and stored chunks plus full live-storage preservation comparison. Not yet executed at this checkpoint.

Initial source digest: 0553f6be74dbe938af8ac45722e1f7a6a8622f8cad4aa58c8cc506a7a514e047. Initial indexed-file digest: 18a7323e6bfa7d13e3db823142f3a08c6d69b71fe247db7ef050537db973ac4e.

First index: actual CLI exit 0, 365.3 seconds, 9,331 stored chunks. index-verification-corrected.json: every stored chunk matches re-derived source; zero missing/unexpected chunks or invalid embedding identities; full live collection digests unchanged. Initial verifier false negative came from its wrong metadata key (`errors` vs `embed_errors`), not the index; both receipts retained.

Counted limit: 29 of 423 walked eligible files produce zero chunks under the existing indexer rules, including config/settings.json, config/internals.json and mercury.config.json (large JSON is skipped). Full list and per-file counts are in the verification receipt. Successful indexing does not prove retrieval or consumer coverage of those files; direct file tools remain available. No index policy was silently widened.

Landed tool repair: ee7ab7177f83e07bfa4789c64d881f589453d3a8, remote origin/astra-era SHA independently read back equal. Its fresh config in readonly-source/ differs from current root config only at mongo.dbName, mongo.chunksCollection, mongo.statsCollection and traceMemory.collection. No provider/scope/iteration override. Readiness receipt above remains for the same configured providers; it is not a reviewer verdict.
