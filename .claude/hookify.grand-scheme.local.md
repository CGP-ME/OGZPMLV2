---
name: warn-decide-by-grand-scheme
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (?i)(works\s+for\s+(now|the\s+current|where\s+we\s+are)|fits\s+the\s+current|patches?\s+to\s+make\s+(it|things|this)\s+work|short[- ]term\s+(fix|approach|solution|patch)|makes?\s+sense\s+for\s+(today|now|this\s+phase)|good\s+enough\s+for\s+(now|today|the\s+current)|solves?\s+the\s+immediate|right\s+for\s+the\s+current\s+state|tactical\s+(fix|patch))
---

**Decide by grand scheme, not the current state of the project.**

Trey's directive:
> Make our decisions based off of where the project is going — "grand scheme" — not where it is now and needing to work. This goes for architectural decisions as well.

Detected short-term-thinking language. Stop. Re-frame.

The grand scheme:
- North Star: `MEMORY.md > North Star` — Apex → Houston → TRAI moat → white-glove
- `ogz-meta/GRAND-SCHEME.md`
- `ogz-meta/MASTER-ROLLOUT.md`

Architectural decisions in particular: prefer modular over monolithic, refactor-now over refactor-later, root-cause over patch-symptom — every time.

Re-evaluate the proposal:
- Does this decision still hold up at Apex stage?
- Does it scale to multi-asset / multi-broker / multi-strategy parity?
- Does it serve the TRAI moat?
- Or does it solve "today's problem" in a way we'll undo at scale?

If the answer is "this works for today," it is the wrong answer. Default to the hard path.
