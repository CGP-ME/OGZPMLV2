Mercury, break my fix.

Scope: updated Claude bridge session-scoped read/edit ledger attribution after the first attack found the `CLAUDE_SESSION_ID` fallback bypass and implicit finish-gate edit scope.

Current patch under attack:
- `trai_brain/claude-bridge/hook-input.js:36-46` now normalizes session identity only from hook input fields: `session_id`, `sessionId`, or `session.id`. It no longer reads `process.env.CLAUDE_SESSION_ID`.
- `trai_brain/claude-bridge/read-ledger.js:69-85` requires explicit `sessionId` for `recordRead` and returns per-session reads only when callers pass `{ sessionId }`.
- `trai_brain/claude-bridge/pre-edit.js:58-75` requires hook session identity and checks `ledger.hasReadFile(rel, { sessionId })`.
- `trai_brain/claude-bridge/post-read.js:12-25` fails closed when read hook input lacks session identity.
- `trai_brain/claude-bridge/edit-ledger.js:74-99` requires explicit `sessionId` for `recordEdit` and returns per-session edits only when callers pass `{ sessionId }`.
- `trai_brain/claude-bridge/post-edit.js:41-51` fails closed when edit hook input lacks session identity.
- `trai_brain/claude-bridge/finish-gate.js:75-85` no longer defaults helper edit scope to the global edit ledger.
- `trai_brain/claude-bridge/finish-gate.js:151-159` returns blocked `missing_explicit_edit_scope` if `evaluateFinishGate` is called without an explicit edit-file array.
- `trai_brain/claude-bridge/finish-gate.js:193-205` passes same-session edited files in Stop hook runtime.
- `trai_brain/claude-bridge/pre-bash.js:301-306` passes the explicit global edit list for Warden git-mutation checking.
- `test/claude-bridge-hook-input.test.js:38-55` proves `CLAUDE_SESSION_ID` is ignored.
- `test/claude-bridge-edit-ledger.test.js:80-99` and `:136-155` prove missing hook identity fails closed even with `CLAUDE_SESSION_ID` set.
- `test/claude-bridge-finish-gate.test.js:99-108` proves direct finish-gate evaluation fails closed without explicit edit scope.

Attack requirements:
1. Find a path where Session B can still satisfy forced-read or edit attribution using Session A ledger data.
2. Find a path where missing hook session identity still lets read/write/stop/git-mutation paths pass.
3. Find a path where legacy global reads/edits are still used by hook runtime in a way that weakens session isolation.
4. Check sibling state files `read-ledger.json`, `edit-ledger.json`, `task-contract.json`, and `hot-path-proof.json`; identify same bug class only with an exploit path.
5. Check tests for blind spots around `post-read`, `pre-edit`, `post-edit`, `finish-gate`, and `pre-bash` Warden.
6. Cite exact files/lines and give a minimal exploit path for any real bypass. If none, enumerate the surfaces checked and why they fail closed.
