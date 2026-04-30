---
name: block-git-reset-hard
enabled: true
event: bash
pattern: git\s+reset\s+(--hard|-hard|--mixed\s+--hard)
action: block
---

**BLOCKED: git reset --hard**

Trey's directive: "NEVER git reset HARD or i will format your ass."

This command is destructive and unrecoverable. It overwrites the working tree and discards uncommitted changes — work that may not be in any reflog or stash.

**Use instead:**
- `git revert <commit>` for undoing pushed commits (per the revert-first-default rule)
- `git stash` to set aside uncommitted changes safely
- `git restore <file>` for unstaging specific files
- `git reset <commit>` (soft/mixed) keeps the working tree intact

If you genuinely need a hard reset, ask Trey explicitly. Do not bypass this hook.
