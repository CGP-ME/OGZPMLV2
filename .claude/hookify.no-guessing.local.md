---
name: warn-no-guessing
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (?i)(i\s+(think|believe)\s+(it|this|that|the|maybe)|probably\s+(is|does|works|fires|returns)|should\s+be\s+(working|fine|correct|safe|enough)|might\s+be\s+(the|that|wrong)|seems\s+like\s+(it|the|this)|appears\s+to\s+(be|work|do)|likely\s+(does|is|will|that)|presumably|guessing\s+(it|that|the)|i'?m\s+not\s+sure\s+but|maybe\s+(it|this|that)\s+(is|does))
---

**No guessing. If you don't know, ask. If you don't have the docs, don't make shit up.**

Trey's directive:
> No guessing. If you don't know, just ask. If you don't have the docs, don't make shit up. Just ask. If you are scared, go to ogz-meta and find alignment.

Hedge language detected. Two paths from here:

1. **You actually know** — verify by reading the file/running the command/checking git, then state it definitively with file:line citation. Strip the hedge.

2. **You don't know** — say so. Ask Trey, or read in `ogz-meta/` to find alignment:
   - `ogz-meta/specs/` — canonical truth
   - `ogz-meta/sessions/` — recent session docs
   - `ogz-meta/04_guardrails-and-rules.md` — what NOT to do
   - `ogz-meta/05_landmines-and-gotchas.md` — known traps
   - `ogz-meta/claudito_context.md` — full system context

"Probably," "should be," "I think" — these are tells. Either verify and state it, or ask. No middle ground.
