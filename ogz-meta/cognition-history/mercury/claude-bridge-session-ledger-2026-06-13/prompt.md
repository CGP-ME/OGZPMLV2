Mercury, break my fix.

Scope: Claude bridge session-scoped read/edit ledger attribution only.

Current patch under attack:
- `trai_brain/claude-bridge/hook-input.js:36-47` normalizes session identity from hook input or `CLAUDE_SESSION_ID`.
- `trai_brain/claude-bridge/read-ledger.js:24-101` stores global compatibility reads plus `sessions[sessionId].reads`; `recordRead` requires an explicit session id.
- `trai_brain/claude-bridge/pre-edit.js:58-75` requires the same hook session to have read the file before edit/write.
- `trai_brain/claude-bridge/post-read.js:12-25` fails closed when a read hook lacks session identity and records reads with the session id.
- `trai_brain/claude-bridge/edit-ledger.js:74-99` records edits globally plus per-session and requires an explicit session id.
- `trai_brain/claude-bridge/post-edit.js:41-51` fails closed when an edit hook lacks session identity and records edits with the session id.
- `trai_brain/claude-bridge/finish-gate.js:193-231` requires session identity and evaluates Stop hot-path proof against same-session edited files.
- `test/claude-bridge-edit-ledger.test.js:56-88` covers cross-session forced-read blocking and missing-session read failure.
- `test/claude-bridge-edit-ledger.test.js:90-133` covers same-session edit ownership and missing-session edit failure.

Attack requirements:
1. Find a path where Session B can satisfy forced-read or edit attribution using Session A ledger data.
2. Find a path where missing hook session identity lets a read/write/stop path pass instead of failing closed.
3. Find a path where legacy global reads/edits are still used by hook runtime in a way that weakens session isolation.
4. Check sibling state files `read-ledger.json`, `edit-ledger.json`, `task-contract.json`, and `hot-path-proof.json`; identify which are the same bug class only if you can show an exploit path.
5. Check tests for blind spots around `post-read`, `pre-edit`, `post-edit`, and `finish-gate`.
6. Cite exact files/lines and give a minimal exploit path for any real bypass. If none, enumerate the surfaces checked and why they fail closed.
