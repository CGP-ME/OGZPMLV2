---
name: warn-session-form-at-end
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (?i)(wrapping\s+up|calling\s+it|good\s+night|gn\b|end\s+of\s+session|session\s+(over|complete|done)|done\s+for\s+(now|today|the\s+night)|that'?s\s+it\s+for\s+(today|tonight|now)|signing\s+off|tapping\s+out|over\s+and\s+out|that'?s\s+a\s+wrap|see\s+you\s+tomorrow|talk\s+later|let'?s\s+stop|alright\s+we'?re\s+done)
---

**Session ending — fill out the session form.**

Trey's directive:
> Fill out the session form at the end of every session's work.

Per `ogz-meta/sessions/SESSION-DOC-MANIFEST.md`, write ONE dated session doc at:
`ogz-meta/sessions/session-YYYY-MM-DD-{slug}.md`

Required sections:
- Header (date / branch / last commit / Phase 0 baseline)
- What Was Done This Session (numbered, with root cause + fix per item)
- Smoke Tests (with pass/fail status)
- Files Touched table
- Git Log
- Half-Cooked Items Status table
- Open Items for Next Session
- Context for Next Session
- Recorder Pipeline Disposition

Do NOT mutate rolling docs (MASTER-ROLLOUT.md, RUNNING-TODO.md, TODO-NEXT-SESSION.md, POST-MATRIX-BACKLOG.md) to flip checkboxes. Append-only session docs only.

Format template: `ogz-meta/sessions/session-2026-04-25-27-asset-isolation-strategy-parity-bot-swap.md`
