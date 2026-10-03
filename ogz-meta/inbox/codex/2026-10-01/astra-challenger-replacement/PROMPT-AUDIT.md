# Mercury prompting and receipt inspection — 2026-10-02

Requested by Trey: "check its prompting" and "yeah check the receipts too".

Coverage: one complete broad Astra-seat review, its caller recheck, and the readiness-correction review. This is not a fresh audit of every migration review. The broad run is `2026-10-02T11-59-49-420Z-e8018e774167`, candidate `cba73b4dd836d0f50c4773cdf00fe2fc34cc9dc3`, base `4c22efe839a5a408b46840352943def280412784`. Machine evidence: `private/prompt-audit.json`; complete reviews: `private/final-review.json`, `private/recheck-result.json`, `private/correction-review.json`.

## Verified findings

1. The broad call starts from `Mercury, break my fix.` but the provider workflow contains several contracts: mapping, reduction, candidate assessment, final decision, and tool continuation. Sources: `evidence-ingestion.js:18-97`, `:1924-1962`, `ask.js:1264-1273`, `explicit-continuation.js:132-139`. The receipt records 14 map records, 20 reductions, 11 candidate records and 24 continuation requests. These are stage counts, not a billed-call estimate. Seventy-three recorded raw provider response hashes were independently recomputed; all matched.

2. Candidate-stage instructions call structured records optional (`evidence-ingestion.js:75`), while receipt parsing labels the ten returned prose candidate answers malformed. The answers remain preserved. This creates confusing diagnostics, not proof that source was unavailable or findings wrong. The final contract also demands numerous exact fields, per-path inherited-pattern classifications, claim IDs and adjudications. This is substantial formatting work mixed with code reasoning. Its causal effect on accuracy is unproven.

3. The host rejected a prepared candidate envelope of 122,522 bytes and final envelope of 337,643 bytes against the configured 98,304-byte bound. Both have zero provider attempts. These were local request-construction limits, not provider size rejections. Continuation then made 24 requests, all recorded as response_received, between 59,644 and 98,171 bytes. This run therefore does contain transport pressure; older statements about completed migration runs having no observed size rejection must not be extended to this later broad reviewer-repair run.

4. The continuation made 23 tool calls before its final answer. Five calls returned range/receipt-ID errors and were followed by corrected reads. One initial request for llm-client.js:450-800 delivered only 450-691. Later, iteration 22 delivered llm-client.js:800-870 in full, including the actual `createAstraChallengerClient` factory constructing `CodexChallengerClient`. That exact range remains in the final request's literal_evidence list. Thus the final false alias-matcher allegation cannot be explained by that factory being absent from the final context.

5. Mercury explicitly assumed Astra's requested model was `astra` and that it passed through the old Claude matcher. It then claimed all critical evidence had been examined. The actual configured model is `gpt-6-astra`; the factory is different. The agentic system prompt already requires actual caller evidence, contradictory-evidence inspection and full reachable control flow. The final answer also called a diff and source excerpt AST evidence, despite zero AST tool calls in the continuation. Host-captured AST evidence existed earlier; that does not turn the cited diff into AST output. A same-source recheck withdrew the caller allegation.

6. The readiness recheck reached the correct completion-flag conclusion but still misstated storage and trust behavior: it claimed an inline answer/full metadata receipt and said a version mismatch makes execution fail. Actual preflight receipts carry selected metadata and pointers to raw answer/error tapes; the trust mismatch is recorded without refusing dispatch under Trey's explicit ruling. These prose errors are retained and corrected, not relabeled as complete review accuracy.

## What this establishes

The problem is not simply a missing instruction to verify callers. Those instructions already exist, and decisive contradictory source was delivered. Prompt complexity, fragmented stages and archive navigation are plausible contributors; the receipts do not establish them as the sole cause. Adding more instructions or forced retries is not an evidenced cure. No automatic rerun, answer-suppression gate, new throw, or production prompt change was introduced by this inspection.

The four relevant prompt-producing files were hash-checked against the broad run's before/after harness manifest and match: mercury.config.json, evidence-ingestion.js, explicit-continuation.js and react-loop.js. Full serialized provider request bodies are not persisted in this packet; hashes, byte counts, prompt source and literal-delivery records are. That limits byte-for-byte request reconstruction claims.

Next bounded investigation, if pursuing first-pass accuracy: compare a direct tool investigation against the existing staged workflow on the same immutable question/source, retain every response and citation, and measure unsupported claims rather than pass rate. No such A/B experiment has been run or claimed here. Existing inherited transport edits remain separate from the Astra-seat commit.
