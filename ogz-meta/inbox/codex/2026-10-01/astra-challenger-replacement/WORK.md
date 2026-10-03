# Work

This atomic change replaces the active Fable challenger with Astra through the installed Codex CLI and ChatGPT subscription. Mercury and Kimi keep their existing roles. Historical Claude identity parsing remains available for historical receipts; no active challenger factory or fallback invokes Claude.

Production scope (11 files): mercury.config.json; trai_brain/mercury-bridge/{codex-challenger,llm-client,config,adversarial-review,provider-preflight,reviewer-panel,ask,run-ledger,consensus,doctrine-review}.js.

Test scope (5 files): test/mercury-{astra-challenger,consensus,llm-config-contract,provider-preflight,reviewer-panel}.test.js. Retired fallback-specific tests are replaced by the Astra no-fallback and receipt-preservation cases; unrelated inherited authority-test failures are explicitly retained.

Codex receives prompts over stdin, uses read-only tools, and records provider SSE response models rather than claiming the requested CLI model is proof. Its tool working directory comes from the existing exact-source review snapshot. The answer is preserved even when the tape reports an identity conflict, parse error, timeout or incomplete response. Existing stage/panel handling remains responsible for routing. No new response rejection throws or host verdict caps remain.

Delivery uses a private Git index based on current HEAD, applying only the own-versus-baseline patch. The shared index is not used to assemble the commit. Candidate identity and patch are recorded in delivery/. The commit message identifies this packet; the containing commit is the code-and-packet delivery unit. Final commit and confirmed remote SHA are reported to Trey.

No Stop 1 migration, inherited transport repair, process restart, or deployment is included.

As of 2026-10-03, the reviewed source candidate is `a9808f2f6216788eb0dcb67ae5a4791aeba6e2c1` on base `e9faed6357b999774e3bfaae85ac43eff18c9262`. TradingLoop released its window after pushing `925415e72e925900294ecfa2627ea441669fb16a`. Qualification candidate `e75c38b5d9e16d93db2473758847be7ba52c2a27` is based on that commit. All production blobs match the independently reviewed candidate. Only dummy fixture names/values in three already-touched tests changed afterward to satisfy the existing secret scanner, without weakening it; exact-candidate tests were rerun. The final rebase identity is in `delivery/candidate.json`; rebasing must preserve every qualified mission blob. The containing code-and-packet commit is the delivery identity. Remote SHA confirmation and indexing are reported separately after delivery; neither implies runtime activation.
