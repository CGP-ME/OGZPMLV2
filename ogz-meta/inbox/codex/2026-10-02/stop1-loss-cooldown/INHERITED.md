# Inherited and untouched

Shared source contains unrelated dirty changes in StateManager, OrderExecutor, settings and many other files. Snapshot/diff receipts preserve their identity; proposed hunks are only the rejected feature. During preparation another lane staged CHANGELOG.md / ConfigLoader.js and added RSI2 configuration work. It remains intact.

Existing config-loader and StateManager broad exception/default behavior, generic resetSymbolHalt concurrency semantics, broker restore quarantine, operator recovery and other Stop 1 reconciliation rows were not redesigned. The old cooldown producer could overwrite another symbol halt; this patch prevents future loss-driven overwrite but cannot recover erased history without real receipts.

Existing test suites rely in places on legacy environment/config override assumptions; no broad test migration is included. Directly retired feature expectations were updated; the missing executor mock method discovered by execution was repaired only in the candidate fixture. Separate risk-warning completeness remains unverified.

Canonical session documents lag current source (latest inspected August 20); October 1 reconciliation and current git/source bytes were used for present posture. Mercury freshness and PM2 state were not inspected or asserted. Historical TSLA/P0 evidence was not invoked.

Trey has now explicitly requested cleanup of doctrine-violating halt producers. This patch does not endorse retained halts. Follow-up must classify every triggering producer, fix internal causes, and discuss residual halt behavior before changes; blanket deletion or warning-only swallowing is not authorized.
