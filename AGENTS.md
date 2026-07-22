# OGZPrime Agent Bootstrap

This file is a bootstrap only. The canonical, load-bearing doctrine is:

`ogz-meta/Alignment/TheDoctrine.md`

Read The Doctrine before non-trivial work. It is not suggestion text. It is the
operating law for this repo, and hookify exists to enforce it.

If this file, any other AGENTS/Claude file, hook, memory, command snippet, or
session note conflicts with The Doctrine, stop and report the contradiction.
The Doctrine wins for agent behavior unless the current user instruction
explicitly supersedes it.

Minimum start:

```bash
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
git log --oneline -8
git stash list
cat ogz-meta/Alignment/TheDoctrine.md
```

Then read the current files, source/help, logs, runtime state, session/status
docs, or specs required by the specific task. Live source and current command
output are required for factual claims.
