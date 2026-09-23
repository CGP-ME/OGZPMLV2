# Evidence

Run `node ogz-meta/inbox/codex/2026-09-23/atomic-01-journal-helper/verify.cjs` before committing. receipt.json records exact source hashes, parent failures, synthetic inputs, expected and observed outputs from the actual `_stateOpenTradeProof` method. The script checks that deleting only the restored helper yields the parent bytes, and the helper equals its f1df161e predecessor. This is bounded method evidence, NOT successful bot startup or broker reconciliation.
