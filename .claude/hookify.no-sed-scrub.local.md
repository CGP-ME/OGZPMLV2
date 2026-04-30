---
name: block-no-sed-scrub
enabled: true
event: bash
action: block
conditions:
  - field: command
    operator: regex_match
    pattern: sed\s+-i\b|sed\s+(--in-place)|find\s+.*-exec\s+sed\s+-i|sed\s+.*-i\s+
---

**BLOCKED: sed -i bulk rewrite.**

Trey's verbatim rule (feedback-no-sed-scrub):
> Do not sed scrub. Last time that was catastrophic. It ended up corrupting a ton of shit.

A prior session corrupted many source files via sed bulk replacement (regex interaction with string literals, escape sequences, multi-line code structures). Recovery effort was significant.

**Use the Edit tool instead:**
- Each replacement is scoped and auditable
- Edit enforces uniqueness per replacement (guardrail against silent breakage)
- Multi-file changes go file-by-file with visible diffs

If hundreds of instances need changing across many files:
1. Propose the scope
2. Ask whether to do it over multiple commits
3. Or whether to defer entirely

Read-only bulk find is fine: `grep -rn "pattern"` or the Grep tool. Only the replacement side is banned.

**Exception:** Generated/regenerated files (build outputs, indexes) — but those don't run through sed in the first place.
