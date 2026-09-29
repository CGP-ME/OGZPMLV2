# Evidence — 2026-09-29

Production candidate bda5ffac7e06c47538a955852b27d9361d634bf9. Commands below use fixtures/observe.cjs under this packet and actual Git-index module source.

- node fixtures/observe.cjs candidate: five successful settings saves, nine actual order plans, invalid saves rejected, alias and cold reload agree. Receipt private/candidate-eUVKFv/receipt.json.
- node fixtures/observe.cjs candidate --producer-paths: constructor override cannot replace owner; frozen snapshot; six invalid map edits rejected; four complete leaf saves; later disk corruption not published. Receipt private/candidate-OWJwa8/producer-paths.json.
- node fixtures/observe.cjs candidate --missing-key: malformed startup input is named, no strategy invoked, HOLD has null sizing; trace formatter returns max priority; strong raw TPO cannot fabricate entry; actual TradingLoop and exit manager hand a stop exit to stub execution; settings repair restores same instance. Receipt private/candidate-8B6KJS/missing-key.json.
- node fixtures/observe.cjs candidate --fanout: actual NoWick producer emits two half-size legs from seeded pending levels and a synthetic trend; actual orchestrator multiplies both by saved 1.4; loop ledger and order plans each retain 0.7. Regular entry passes the same chain. Receipt private/candidate-j7TfYV/fanout.json.
- ./node_modules/.bin/jest test/ogz-tpo-integration.test.js test/strategy-orchestrator-pipeline-toggles.test.js --runInBand --modulePathIgnorePatterns=ogz-meta/inbox: 2 suites, 21 tests pass. This run uses the working tree; the separate fixtures pin runtime source to the index.
- git diff --cached --check: pass.

No broker, live process, browser, actual notification delivery, or performance validation. The execution boundary is stubbed. Test data and disposable config files remain in private fixture directories. Review outcome remains pending.

Additional null-map fixture: private/candidate-Lae0hq/missing-key.json passes the same quarantine/exit/repair chain with all four fields missing. Working-tree Serena AST scan found nine sizingMultiplier property references across 390 files; no truncation. AST.json retains references and the named unrelated parse failure.

Final adversarial ledger run: 2026-09-29T06-06-17-305Z-efdfe475989f, reported final verdict pass after Mercury recheck and Kimi adjudication. The packet preserves all prior failed/incomplete reviews. TAPES.json maps every retained tape to its original and redacted hashes; gzip only reduces storage, after redaction.

Fixture correction: the first extra regular-entry loop test omitted the runner-provided minTradeConfidence field and returned HOLD. The fixture was corrected to supply it explicitly; final regular/fanout and malformed-input receipts above use the complete context. No production change was made for that fixture error.
