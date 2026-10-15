# Astra adversarial decision: GO

Date: 2026-10-15. Candidate tree: `8c917c88b7171d1c15f855904c94ed5ab5ab0181`. Base: `9f9becacd8efe8c0cc4112bbd94b0bb219db3478`.

GO for this atomic removal of the independent `isTrading` enable authority. No candidate-introduced blocking defect was found. This is Astra's independently authorized adversarial decision; Mercury's recorded `found_break` remains intact and is not represented as a clean Mercury result.

Reviewed all seven changed files using the pinned Git objects, plus pinned manual-pause and StateManager producers. Did not review or modify unrelated working-tree authentication, journal, risk, or other pending work. All line references below refer to the candidate tree unless explicitly labeled base.

## Behavioral evidence

- `core/StateManager.js:2536-2537` derives pause status solely from a nonempty explicit `pauseReason`. Fresh state no longer initializes an independent enable flag. `:2557-2566` persists the reason, source, recoverability and scope on pause; `:2585-2595` clears them on explicit resume. The changed writes are scalar pause-state replacements, not mutations of trade Maps.
- The actual manual producer, `core/WebSocketManager.js:70-78`, guarantees a nonempty reason and records `dashboard_manual` with `recoverable: false`. SessionRouter's wind-down producer supplies a nonempty reason and scoped recovery metadata (`core/SessionRouter.js:471-478`); transition reasons are explicit strings (`:1526,1627`), and failed-safe pause has a nonempty prefix (`:1465-1469`). No reachable blank-reason producer was found on these paths.
- Scoped automatic recovery retains source matching, recoverability and scope checks (`core/StateManager.js:2722-2746`). Removing the boolean does not remove those restrictions or make a dashboard manual pause recoverable.
- `core/OrderExecutor.js:2888-2892` still blocks non-backtest entries for an explicit pause, and reports the persisted reason. The pre-existing backtest exception remains unchanged. Other execution checks are untouched.
- `core/SessionRouter.js:600-601` uses the same predicate. Its actual constructor obtains the StateManager singleton (`:130`), so replacing the previous optional-shape probe does not introduce a missing-provider path in the actual production constructor. Wind-down and failed-safe entry-block states remain independently enforced (`:629-655`).
- Load migration deletes obsolete persisted `isTrading` values (`core/StateManager.js:4342-4345`) and removes only the old unscoped synthetic invalid-enable pause (`:4346-4355`). Ordinary manual/transfer reasons remain. A stale boolean without a real pause reason intentionally no longer disables trading, matching the user's removal instruction.
- Startup and fresh-feed recovery consume the predicate (`run-empire-v2.js:1953,2821`). Legacy dashboard pause state uses the nonempty reason (`public/unified-dashboard-legacy.html:3967-3969`). Runner telemetry renames its running-state field to `isRunning` (`run-empire-v2.js:3553`). The remaining rehearsal/gate edits reconcile their pause fixtures and assertions with this authority.

## Mercury finding attribution

Mercury reported shallow `snapshot = { ...this.state }` rollback as the break. Independently compared the entire `_applyStateUpdatesLocked` method from both pinned Git objects: byte-identical, SHA-256 `3886e745af9dbc43e88116cfda5ede9e3e000f5e23e593e6a0ccfdbea5a6feb7` in both. Method starts at base `core/StateManager.js:1005`, candidate `:1002`; candidate snapshot is `:1006`, catch rollback `:1063-1064`.

The changed pause/resume paths replace scalar fields; they do not mutate a shared Map or alter snapshot/rollback implementation. Mercury supplied no candidate-specific reproducer connecting this removal to mutable-Map corruption. Therefore the cited concern is inherited and does not block this atomic change. This finding attribution does not assert that all pre-existing rollback behavior is correct.

## Actual verification

- Pinned base-to-candidate `git diff --check`: passed.
- Re-executed `remove-istrading/fixtures/probe.cjs` with `REVIEW_TREE` pinned to the candidate. Removed only its receipt-file write from the in-memory test wrapper so existing evidence was not overwritten. Passed: fresh paper/live/backtest initialization without enable flag, stale boolean/malformed-value migration, manual and transfer pause persistence/reload/resume, old synthetic pause removal, and exact extracted OrderExecutor pause branch.
- Executed `remove-istradingpacket/fixtures/router-predicate-proof.cjs` against the same candidate. Passed with actual isolated StateManager and the exact candidate router predicate: fresh=false, explicit session pause=true, resume=false.
- Inspected pinned runtime references. No remaining independent `isTrading` state reader was found in the reviewed production paths; the load-time retirement references are intentional.

Limits: isolated StateManager persistence and extracted branch/predicate tests do not exercise full SessionRouter construction/transitions, the complete execution pipeline, live broker behavior, or PM2 runtime activation. Existing unrelated stale test fixtures and other dirty work are outside this verdict. No network, services, broker orders, historical backtests, deployment or production edits were performed. This is not full pipeline/live acceptance or Stop 1 completion.
