# OGZ Alignment Entry Point

This folder contains the alignment doorway for agents entering OGZPrime.

Read this first:

`ogz-meta/Alignment/TheDoctrine.md`

The Doctrine is the canonical, load-bearing operating law. Other files in this
folder are historical, supporting, or bootstrap material unless The Doctrine says
otherwise.

Cold start:

```bash
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
git log --oneline -8
git stash list
cat ogz-meta/Alignment/TheDoctrine.md
```

After reading The Doctrine, verify current state from live source, command/help
output, current session/status docs, runtime/log evidence, and task-specific
specs. Dated alignment files and digests are leads, not timeless law.

If any alignment file conflicts with The Doctrine, stop and report the
contradiction. The Doctrine wins for agent behavior.
