# Unused sizing initialization

The runner constructed a PositionSizer that has no reader or calculation caller in the tracked production path. This performed a second startup configuration read/validation and logged initialization without contributing to an order. Remove only its runner import and constructor assignment. Preserve the legacy class and the actual OrderExecutor sizing implementation.

[Exact patch](change.patch), [source/review identity](receipt.json), [isolated verification](verification.txt), [original Mercury answer](final-delivery-review-answer.txt), and [Astra adjudication](ASTRA-REVIEW.md).

Mercury/Serena reported an isolated one-file blast radius with zero callers. Mercury's answer reports found_break for unchanged throws; its ledger says no_claim. Astra independently checked the removed import side effects, all production references, unchanged real sizing, and exact fixture identities and gave GO under the existing adjudication authorization. This is not described as a clean Mercury pass.

Verification: the isolated fixture parses both runner versions, verifies exactly two removed statements, checks the extracted initialization block, and executes the unchanged native executor sizing block against synthetic canonical edits. Results are 0.05, 0.02, 0.03, 0.01. Initial fixture execution redeclared a VM lexical variable; wrapping each invocation corrected the fixture, after which it passed. The production candidate did not change. This is bounded source/consumer evidence, not full bot startup or broker acceptance.

Reproduce by generating the three source fixture copies with git show from the refs in receipt.json (baseline/candidate run-empire-v2.js, baseline core/OrderExecutor.js), then passing those files and fixtures/verify.cjs individually through scripts/test-isolated.py --fixture before executing that probe. No credentials or real state are needed.

No configuration values, gates, defaults, fallbacks, or execution behavior were added. No PM2 operation occurred. Full Stop 1 runtime acceptance remains held.
