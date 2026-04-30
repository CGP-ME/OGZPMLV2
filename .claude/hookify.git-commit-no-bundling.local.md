---
name: warn-git-commit-no-bundling
enabled: true
event: bash
pattern: git\s+(commit.*\s+and\s+|add\s+(-A|--all|\.\s|\.$))
action: warn
---

**One change, one commit, one push. No bundling.**

Detected possible commit-bundling or `git add -A` / `git add .`:
- Commit messages containing " and " often bundle multiple changes
- `git add -A` / `git add .` stages everything indiscriminately, including untracked files that may not belong in this commit

**Trey's commit hygiene:**
- One logical change per commit
- Stage files explicitly by name: `git add path/to/file.js`
- Push after every commit — do not batch
- Mercury verifies first, Trey verifies second, then push

If this commit is genuinely a single logical change with multiple files, proceed. Otherwise split it.
