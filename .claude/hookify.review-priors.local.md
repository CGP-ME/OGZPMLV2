---
name: warn-review-priors-on-session-start
enabled: true
event: prompt
action: warn
conditions:
  - field: user_prompt
    operator: regex_match
    pattern: (?i)^(hi|hello|hey|good\s+morning|good\s+evening|good\s+night|gm\b|gn\b|let'?s\s+start|starting\s+(work|fresh|over)|new\s+session|booting\s+up|begin\s+work|ready\s+to\s+(work|begin|start)|whats?\s+up|sup\b|back\s+to\s+(work|it)|here\s+we\s+go|alright\s+lets|claude\s*$|claude\s+ready)
---

**Session start detected — review priors before doing anything.**

Trey's directive:
> When you begin work make sure to review the priors so you have context.

CLAUDE.md bootstrap order for new sessions:
1. Read CLAUDE.md (you have it)
2. Read most recent 2-3 session docs in `ogz-meta/sessions/` — these are canonical current state
3. Read `ogz-meta/MASTER-ROLLOUT.md` 30-Second Status section ONLY (skip phase details — may be stale)
4. Read `ogz-meta/recent-changes.md` top 50 lines for narrative
5. Specs as needed for the specific task

Do not start working. Read priors first. Then propose the next concrete action.

Memory rule: `feedback-session-doc-pattern.md` and `MEMORY.md > Critical Rules > Append-Only Session Docs`.
