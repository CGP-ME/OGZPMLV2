# Commit Handoff

This folder is the commit-facing counterpart to `ogz-meta/inbox/`.

Use it for small text packets that make completed-but-not-yet-committed work
visible, cleanable, and easy to stage intentionally.

Path convention:

`ogz-meta/commit-handoff/<YYYY-MM-DD>/<slug>.md`

Each packet should list the task, files changed, verification, commit grouping,
untracked files that belong to the work, unrelated dirty files preserved, and
approvals or blockers still required.

Do not store secrets, raw logs, large outputs, broker data dumps, model
transcripts, or generated artifacts here.
