# Actual seeded full-chain receipts

Result: defect caught, acceptance incomplete. Exit 0 is not PASS. Semantic comparison: REVIEW.md.

## Frozen identity and isolation

Source: astra-era at f9f966470c5f81b64459d50f6ef4e707c5de0b08, including 25 preserved pre-existing dirty paths.

- 498 nonignored source paths; content SHA-256 `78fa95500b98d59ac41d0b07f98c2601bb9c77f6bb5e273aa73379a764d4a7dd`.
- 423 eligible index paths; content SHA-256 `2ec4c319b583457968a1f01dea04e220f236a08d03c51a13bbe586e6c7e2b37b`.
- Candidate database ogz_mercury_recovery_20260924_007; collections chunks_verified_source, stats_verified_source, traces_verified_source. Only these four storage fields differ from ordinary config, selected through MERCURY_CONFIG_FILE. No ignore/provider/policy change.
- Indexer: 06:44:15–06:50:15 UTC, exit 0. Exact 9,333/9,333 chunks; zero source mismatches, missing/unexpected chunks or invalid embedding identities/dimensions. Before/after-review document hashes match.
- Live ogz_knowledge unchanged including vectors: 9,283 chunk documents, nine stats documents, zero trace documents.
- Existing indexing produces no chunks for 29 eligible paths, including config/settings.json and config/internals.json. Named retrieval limit; direct source tools remain available, and Mercury actually read settings.json.

## Controlled input

fixtures/candidate.patch was never applied; git apply --check succeeded. SHA-256 `f1ee45a95f6395b178cd84d0c60c78762b952c7ee91c34aa4353f03417e2311d`.

Question: receipts/question.txt. Its sole explicit attested source is that patch, lines 1–10, appearing exactly once. The six function observations and scoring key were recorded before launch, excluded from indexing, and not supplied to reviewers. Command receipt freezes their original hashes:

- Expected results: `95fb8528e2028bc953703cc3aef0a75bcdd0129d69bc0588be0533996cf88a20`.
- Scoring key: `7d91db1eb4a19888a809bd01410243e1b24b25a1c4672f122a8c14911a0a4ee9`.

## Actual execution

Provider preflight succeeded for all three identities. Review: 06:51:07–06:55:26 UTC, exit 0. Run ID `2026-09-24T06-55-25-982Z-039aecc378a1`. CLI --attack, --max-tokens=7750, --reviewers=mercury,fable,kimi, no max-iterations. Exact arguments/question/operator command are in receipts/review-command.json and receipts/operator-review-command.txt.

29 primary + 17 recheck + one Fable + one Kimi response = 48 usage-receipted attempts. Ledger: 2,557,558 input tokens (914,822 uncached, 1,642,736 cached), 23,173 output. Calculated review cost USD 3.25456565, not an invoice or total including indexing/preflight.

Primary tools 24/24 succeeded; recheck 13/14. Tavily search failed for missing TAVILY_API_KEY; requested search is not performed search. Zero parser-backed AST calls. Candidate first filed at iteration 11, three recorded revisions, last at 28. Ledger retains exact calls, arguments, results, failures, reads and provider-input provenance.

Kimi received the exact recheck. Delivered Mercury answers differ from raw only by existing explicit-path citation formatting and redaction; all tool handles preserved. receipts/citation-and-handoff-check.json includes exact diagnostic. An initial standalone import diagnostic failed because that fresh shell did not load embedding credentials; no paid run failed. The completed diagnostic extracts only the pure formatter.

## Tapes and redaction

receipts/TAPE-MANIFEST.json records original-on-box and redacted/committed hashes and byte lengths. Original files unchanged. Existing redactSensitiveText plus lossless gzip only; transformation command in receipts/operator-export-command.txt.

- tapes/review-ledger.redacted.jsonl.gz: both ledger rows, preflight and review. Original 5,837,525 bytes; compressed 1,086,750 bytes.
- tapes/provider-outputs.redacted.jsonl.gz: all 48 provider outputs as per-file text records; compressed 16,646 bytes.
- tapes/current-change-evidence.redacted.txt.gz and manifest: actual 170,490-byte/39-section supplied artifact. Evidence of inherited dirty code, not approval to transplant it.
- tapes/review-console.redacted.log.gz: actual CLI output.
- receipts/: source inventory; index commands/completion/reconciliations; provider readiness; review command/completion/inspection; withheld controls/key; handoff diagnostic.

Export parses as two ledger JSONL rows and 48 provider records. Redaction can also alter nonsecret long identifiers. Published text is not mislabeled byte-identical to input; both hashes remain. Seven virtual excerpts differ from pre-redaction hashes; all 82 local references and all 39 section hashes matched before export.

## Verification commands

WORK.md lists capture/preflight/index commands. Existing helpers, no new production machinery:

```text
node ogz-meta/inbox/codex/2026-09-24/mercury-full-chain/verify-index.cjs ogz-meta/inbox/codex/2026-09-24/mercury-seeded-review/private/source-before-index.json ogz-meta/inbox/codex/2026-09-24/mercury-seeded-review/private/index-verification.json
node ogz-meta/inbox/codex/2026-09-24/mercury-full-chain/inspect-review.cjs ogz-meta/inbox/codex/2026-09-24/mercury-seeded-review/private/ledger/2026-09-24.jsonl ogz-meta/inbox/codex/2026-09-24/mercury-seeded-review/private/review-inspection.json
node ogz-meta/inbox/codex/2026-09-24/mercury-full-chain/verify-index.cjs ogz-meta/inbox/codex/2026-09-24/mercury-seeded-review/private/source-before-index.json ogz-meta/inbox/codex/2026-09-24/mercury-seeded-review/private/index-verification-after-review.json
```

Do not rerun paid/indexing commands merely to read this packet. Preserve prior receipts.

Named absences: complete AST/consumer coverage, correct settled adjudication, qualified panel evidence, independent cold pull, live bot/Stop 1 acceptance. No production implementation or PM2/broker operation.
