---
name: warn-no-deferring
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (defer|deferred|deferrable|post-[A-Za-z]+|after\s+[A-Za-z]+\s+ships|low[- ]priority|deprioritize|not\s+blocking|follow[- ]up\s+later|when\s+there'?s?\s+a\s+window|nice[- ]to[- ]have|backlog\s+for\s+later)
---

**No deferring. There is no bug more serious than another bug. It's a bug — fix it.**

Trey's rule (feedback-no-deferred):
> Never write "deferrable" / "post-X" / "after Y ships" / "low priority follow-up" / "when there's a window." When a problem is known, fix it RIGHT THEN. Severity classification is for ORDER, not for ship-vs-skip. LOW means "fix this last in the batch," not "fix this never."

If a bug or issue was identified in this turn, the path forward is FIX, not file-for-later. Reorder for batch execution if needed, but do not omit.
