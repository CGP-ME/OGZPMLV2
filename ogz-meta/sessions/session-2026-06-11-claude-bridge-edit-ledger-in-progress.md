# Session Form - 2026-06-11 Claude Bridge Edit Ledger In Progress

## Session Identity

- Date: 2026-06-11
- Branch: `claude/new_beginnings`
- HEAD at session-form write time: `2e23d2bab0fedbffb6ea32fecab36dcd8be5be90`
- Scope: intake and partial implementation of the Claude bridge edit-ledger session-attribution soft spot.
- Status: bridge patch in progress; patch not tested, not Mercury-reviewed, not committed, not pushed.

## Trigger

The user supplied Claude's bridge-box soft-spot finding for review. The finding identified two enforcement issues:

1. The edit ledger used one global `.claude/session-state/edit-ledger.json` without session identity.
2. Stop-gate enforcement could hit the Claude stop-hook block cap, so the stronger enforcement boundary should live earlier where possible.

## Verified Current-Code Finding

The first finding was verified against current files:

- `trai_brain/claude-bridge/edit-ledger.js` used one global ledger path.
- `recordEdit(...)` loaded, appended, and saved without a lock.
- `listEditedFiles()` returned global edits only.
- `trai_brain/claude-bridge/finish-gate.js` used the global edited-file set to decide which changed files belonged to Claude.

Failure class:

- Another session, operator action, or parallel agent could leave unrelated hot-path tracked changes in the repo.
- The global edit ledger could incorrectly attribute or mix those changes.
- Stop-gate behavior could then block or judge the wrong session.

## Partial Patch On Disk

Files currently modified by this unfinished slice:

- `trai_brain/claude-bridge/edit-ledger.js`
- `trai_brain/claude-bridge/post-edit.js`
- `trai_brain/claude-bridge/finish-gate.js`
- `test/claude-bridge-edit-ledger.test.js`
- `test/claude-bridge-finish-gate.test.js`

Current intended design in the dirty patch:

- `edit-ledger.js` now has session-aware ownership:
  - `sessionIdFromHookInput(...)`
  - explicit session identity required for `recordEdit(...)`
  - global `edits` preserved for compatibility
  - per-session `sessions[sessionId].edits` added
  - atomic temp-file write with rename
  - lock file using exclusive open and bounded wait
- `post-edit.js` now fails closed if hook input has no session identity.
- `finish-gate.js` now reads hook input and evaluates Stop scope against this session's edited files.
- Git mutation scope remains intended to check all hot-path diffs, not only this session's edited files.

## Tests Added But Not Run

Tests currently added in dirty working tree:

- Post-edit records successful targets with session identity.
- Session A and session B get separate edit ownership.
- Protected bridge enforcement surface is not recorded.
- Missing session identity fails closed and records nothing.
- Stop hot-path proof can scope to this session without weakening default git mutation scope.

These tests have not been run in this session since the user redirected to session-form work.

## Acceptance Work Still Required

Before this bridge slice can be accepted:

1. Re-read the dirty diff line by line.
2. Confirm hook input actually supplies one of:
   - `session_id`
   - `sessionId`
   - `session.id`
   - `CLAUDE_SESSION_ID`
3. If the real hook input does not carry session identity, do not ship this patch as-is.
4. Run focused tests:
   - `npm test -- --runInBand test/claude-bridge-edit-ledger.test.js test/claude-bridge-finish-gate.test.js`
5. Run syntax checks for touched bridge files.
6. Run Mercury with one adversarial prompt: break the session-scoped edit-ledger fix, especially cross-session attribution, missing hook identity, stale locks, concurrent writes, and git mutation scope.
7. Run sibling scan for other bridge state files that remain global when they should be session-owned.
8. Commit separately from all eval/runtime work if accepted.

## Do Not Claim Yet

Do not claim any of these are complete yet:

- Claude bridge session identity is fixed.
- Stop gate is structurally immune to cross-session attribution.
- The lock implementation is safe under all hook failure modes.
- The real Claude hook payload definitely includes a stable session ID.

This is only an in-progress bookmark so the dirty tree is understandable after context loss.
