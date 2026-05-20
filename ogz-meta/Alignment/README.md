# OGZ Alignment Entry Point

This folder is the cold-start doorway for an AI agent entering OGZPMLV2.

It is not, by itself, the source of truth. The source of truth is live repo state verified in the current session. These docs tell you what to read, what to distrust, and how to become useful without inventing project state.

## Cold-Start Order

Before answering questions or touching files, walk this path:

1. Run the live-state check:

```bash
pwd
git branch --show-current
git log --oneline -8
git status --short
git stash list
```

2. Read `ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md`.

This is the doctrine/cold-start behavior brief. It tells you how to avoid the project's known AI failure modes.

3. Read the newest dated master alignment file.

As of this folder, that is `ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT-2026-05-19.md`. Treat it as a dated state snapshot, not live truth.

4. Read the verified digest, not the stale digest.

Use `ogz-meta/Alignment/OGZ-DIGEST-2026-05-19-VERIFIED.md`. Do not use `OGZ-DIGEST-2026-05-19.md` as canonical unless you are doing archaeology and explicitly mark it unverified.

5. Read the newest session forms.

```bash
ls -t ogz-meta/sessions/ | head -5
```

Read those session docs newest-to-oldest until you can explain the current work queue, current branch posture, dirty tree, stashes, Mercury state, and what is blocked.

6. Read the current P0 anchor spec.

```bash
ls -t ogz-meta/specs/baseline-phase0-*.md | head -1
```

Then open the file it prints. Do not quote P0 numbers from memory.

7. Read the active fix queue.

```bash
rg -n "^### Fix|Status:|BROKEN|HALF-FIXED|UNFIXED|FIXED" ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md
```

8. Read the law and safety docs.

```bash
cat CLAUDE.md
cat ogz-meta/04_guardrails-and-rules.md
cat ogz-meta/05_landmines-and-gotchas.md
```

9. Verify Mercury's indexed paths before citing Mercury coverage.

```bash
cat trai_brain/mercury-bridge/config.js
```

10. Only then read the live code for the module you are touching.

No doc, digest, session form, or chat transcript outranks the live file.

## Canonical Use

- `OGZ-MASTER-ALIGNMENT.md` = how a cold agent must behave.
- `OGZ-MASTER-ALIGNMENT-YYYY-MM-DD.md` = dated state snapshot.
- `OGZ-DIGEST-YYYY-MM-DD-VERIFIED.md` = verified transcript digest.
- `OGZ-DIGEST-YYYY-MM-DD.md` without `VERIFIED` = non-canonical starter material unless re-verified.
- `ogz-meta/sessions/` = current-state chain.
- `ogz-meta/specs/baseline-phase0-*.md` = P0 anchor source.
- `ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md` = fix queue source.

## Required Exit Check

Before reporting that you are "caught up," you must be able to state:

- Current branch and last pushed commit.
- Dirty tracked files and untracked file classes.
- Stashes and their labels.
- Current P0 anchor source file and expected final balance.
- Whether Mercury was recently reindexed or needs reindex.
- Active runtime blockers.
- Active pipeline/doc/cleanup work.
- The exact live files you opened for the task at hand.

If you cannot state those from commands run in this session, you are not aligned yet.
