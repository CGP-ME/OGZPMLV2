Mercury, break my fix.

Scope: Claude bridge session-scoped ledger attribution after closing both prior findings:
1. Removed `CLAUDE_SESSION_ID` fallback from `sessionIdFromHookInput`.
2. Removed implicit global edit scope from finish-gate evaluation.
3. Blocked bridge read/write access to `.claude/session-state/`.

Current patch under attack:
- `trai_brain/claude-bridge/hook-input.js:36-45` only accepts session identity from hook input fields.
- `trai_brain/claude-bridge/policy.js:20-30` protects `.claude/session-state/` from writes and reads.
- `trai_brain/claude-bridge/policy.js:77-93` blocks protected state before the broad `.claude/` allowlist in `checkPath`.
- `trai_brain/claude-bridge/read-ledger.js:69-85` requires explicit session identity for writes and only returns per-session reads when supplied.
- `trai_brain/claude-bridge/pre-edit.js:58-75` requires same-session read proof.
- `trai_brain/claude-bridge/post-read.js:12-25` fails closed on missing session identity.
- `trai_brain/claude-bridge/edit-ledger.js:74-99` requires explicit session identity for edit attribution.
- `trai_brain/claude-bridge/post-edit.js:41-51` fails closed on missing session identity.
- `trai_brain/claude-bridge/finish-gate.js:75-85` has no global helper fallback.
- `trai_brain/claude-bridge/finish-gate.js:151-159` fails closed without explicit edit scope.
- `trai_brain/claude-bridge/pre-bash.js:301-306` passes explicit edit scope for Warden git mutation.
- Tests: `test/claude-bridge-hook-input.test.js`, `test/claude-bridge-edit-ledger.test.js`, `test/claude-bridge-finish-gate.test.js`, `test/claude-bridge-policy.test.js`, `test/claude-bridge-pre-bash.test.js`.

Attack requirements:
1. Find a concrete path where Session B can still satisfy forced-read or edit attribution using Session A ledger data.
2. Find a concrete path where missing hook session identity lets read/write/stop/git-mutation paths pass.
3. Find a concrete path where legacy global reads/edits are still used by hook runtime in a way that weakens session isolation.
4. Find a concrete path where `.claude/session-state/` can still be read or written through bridge Read/Edit/Bash policy.
5. Check sibling state files `read-ledger.json`, `edit-ledger.json`, `task-contract.json`, and `hot-path-proof.json`; identify same bug class only with an exploit path.
6. Check tests for blind spots around `post-read`, `pre-read`, `pre-edit`, `post-edit`, `finish-gate`, `pre-bash`, and policy.
7. Cite exact files/lines and give a minimal exploit path for any real bypass. If none, enumerate the surfaces checked and why they fail closed.
