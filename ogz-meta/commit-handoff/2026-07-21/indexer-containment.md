# Indexer Containment Handoff

Date: 2026-07-21
Repo: `/opt/ogzprime/OGZPMLV2`
Branch observed: `codex/multi-asset-symbol-state`

## Scope

Tighten Mercury/RAG candidate selection so doctrine intake and preservation files
do not become retrieval truth by accident.

## Files changed

- `trai_brain/mercury-bridge/indexer.js`
- `mercury.ignore`
- `ogz-meta/Alignment/TheDoctrine.md`
- `ogz-meta/commit-handoff/2026-07-21/indexer-containment.md`

## What changed

- Replaced the broad `ogz-meta/Alignment` index scope with explicit
  `ogz-meta/Alignment/TheDoctrine.md`.
- Preserved the existing `ogz-meta/specs` index scope.
- Added `archive/` and `commit-handoff/` to `mercury.ignore`; those directory
  names only exist under `ogz-meta/` in the observed checkout.
- Added doctrine requiring indexer scope to be narrow, explicit, and checked
  before any reindex after intake/doctrine work.

## Verification

- Read-only candidate enumeration before the patch showed these Alignment files
  were eligible: `OGZ-DIGEST-2026-05-19-VERIFIED.md`,
  `OGZ-MASTER-ALIGNMENT-2026-05-19.md`, `OGZ-MASTER-ALIGNMENT.md`,
  `README.md`, and `TheDoctrine.md`.
- `find . -type d \( -name archive -o -name commit-handoff \) -print` showed
  only `./ogz-meta/archive` and `./ogz-meta/commit-handoff` used those directory
  names.
- No Mercury/RAG/bot reindex was run.
- No PM2 process was started, stopped, restarted, or reloaded.

## Commit recommendation

Commit separately from the doctrine bootstrap if desired:

`Added Mercury indexer doctrine containment`

Stage explicit paths only.
