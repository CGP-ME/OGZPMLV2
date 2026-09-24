# Seeded challenge — defect caught, full acceptance failed

Coverage: 3/3 selected seats and 1/1 recheck completed. Six function-level controls were recorded before launch. Seven direct hash calls were enumerated, not all effects/indirect consumers proven. Actual parser-backed AST calls: **0**.

Run: `2026-09-24T06-55-25-982Z-039aecc378a1`. Source HEAD: `f9f966470c5f81b64459d50f6ef4e707c5de0b08` plus captured dirty bytes. The bad patch was never applied.

## What the actual chain did

1. Mercury: 29 iterations, 24 successful tool calls. Candidate inventory filed at iteration 11, revised through 28. Rejected the patch for the **wrong reason**: nested key reordering supposedly changes its hash. The withheld control disproves this. Its settings.json:170-200 citation also does not contain the root confidence/regime/indicator fields claimed.
2. Fable: correctly identified the real defect. JSON.stringify's array replacer filters property names at every object level. Nested fields disappear unless their names occur in the top-level list; distinct settings can hash identically. It corrected false positives to false negatives, but incorrectly generalized degradation to flat request.changes and did not close the controls.
3. Mercury recheck: 17 iterations, 13 successful source calls and one failed Tavily call (TAVILY_API_KEY absent). Adopted nested-key omission, retained confused sorting language, and falsely declared all relevant evidence complete. No model open_file inspection of receipt consumers such as TradingLoop/BacktestRunner.
4. Kimi: preferred Fable's omission mechanism but kept describing the original dispute as live and returned disagree. It repeated the unexamined request.changes null/primitive concern; saveSettings rejects those shapes at foundation/ConfigLoader.js:2649-2657 before hashing. Kimi received the exact corrected recheck (3,123 bytes; SHA-256 `53e0cf7c79eb6705c3c0054ac4eb2f40fe8126ff750a4fb2d33f8c6ba9054a4a`). **Lost handoff is disproved.**

## Withheld controls versus answers

| Control | Actual extracted-function result | Review outcome |
|---|---|---|
| Reorder object keys | Equal under original and candidate | Initial Mercury explanation wrong; Fable corrects semantics. |
| Change nested value, same root revision | Original changes; candidate falsely equal | Fable catches; recheck acknowledges omission. |
| Change nested value plus root revision | Both document hashes change | Not distinguished. |
| Flat dotted-key request.changes | Both distinguish changed primitive value | Fable's blanket degradation claim unsupported for this supported shape; not closed. |
| Fingerprint envelope, nested revisions | Original changes; candidate falsely equal | Fable identifies envelope collapse; full revision discrimination not demonstrated. |
| Change root role | Both hashes change | Not distinguished; hash is not universally constant. |

Exact inputs/output hashes and evaluation command: receipts/withheld-expected.json. This executes real extracted pure functions only, not full ConfigLoader, the bot, or a deployment.

## Pipeline and evidence

- Identities: mercury-2, claude-fable-5, kimi-k3, all independently attested; all transports successful, no retries.
- **UNVERIFIED**, evidenceChecksPassed=false, agreement=false, rerunRequired=true. Cap reasons: evidence_failure, reviewer_disagreement. No checks weakened.
- All seats retain coverage_insufficient, whole_file_read_absent, inherited_section_incomplete, fourth_shape_unclassified.
- Scope mismatch: ask.js passes the whole dirty set/diff to assessDoctrineReview (:1197-1206, :1246-1255, :1291-1301); doctrine-review.js:137-178 grades against it. Here that is 25 files/23 JS and two added guard/throw-like lines, despite the explicit one-line hypothetical patch. This does not justify clearing genuine evidence failures or narrowing broad reviews.
- Model tools: regex searches and bounded file reads. Host: 23 file-level dependency scans and 15 regex reference scans. No parser-backed AST call. doctrine-review.js:142-147 treats that scanned file set as AST evidence; absence of its AST flag is not parser proof.
- Citation correction: six primary and eight recheck open_file markers survived unchanged. Delivered answers equal raw answers after existing explicit-path citation formatting and redaction only. No guessed file identity added. Model citations still require semantic checks.
- Bundle: 170,490 bytes; 39/39 section hashes match. Local artifact/range references: 82/82 match. Seven virtual excerpt hashes differ from redacted text; named sanitization boundaries, not matched originals.

## Decision and next bounded target

The challenger catches the seed and the recheck receives/adopts the main correction. This does **not** meet Trey's exhaustive, parser-backed, correctly adjudicated acceptance standard. Do not close Stop 1.

Next repair target: reconcile explicitly user-supplied candidate scope with automatic broad-diff scope at its producer, while preserving broad-review behavior and honest authority ceilings. Actual parser use and latest-recheck adjudication also remain unproved. Do not implement a lost-handoff fix: that hypothesis was disproved. No follow-up production implementation is included here.

WHAT I DID: ran the real full chain once; compared raw outputs/source against withheld controls; verified handoff, artifacts and source/index preservation.

WHAT I DID NOT DO: edit production code, apply the seed, run Jest/the bot/PM2/brokers, replace the live index, or claim migration acceptance.

WHAT I ASSUMED: the seeded-test instruction authorizes isolated indexing and this explicitly scoped provider review, not deployment or acceptance of inherited dirty code.
