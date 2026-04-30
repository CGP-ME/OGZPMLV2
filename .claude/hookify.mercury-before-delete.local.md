---
name: warn-mercury-before-delete
enabled: true
event: bash
action: warn
conditions:
  - field: command
    operator: regex_match
    pattern: rm\s+(-[a-z]+\s+)*(.*\.(json|jsonl|log|csv|state|patterns|ledger|bank|history|memory|store|db|sqlite))|rm\s+(-[a-z]+\s+)*(data/|state/|ledger/|patterns/|learned/|history/|.*-state\.|.*-bank\.)
---

**Before deleting state files: Mercury forensic extraction first.**

Trey's verbatim words on 2026-04-22 (feedback-mercury-before-delete):
> We could've used Mercury to pick apart that file in an instant.

Lost 69K patterns of crypto learning to a `rm` that day. The file was "part clean / part bad" — Mercury could have parsed it in 30 seconds and emitted a clean subset.

Before this rm, mentally check:
- Is there a temporal field (`lastUpdated`, `timestamp`, `created`, `modified`) that could partition the file into clean/dirty?
- Is this learned-state, log, ledger, or any persistent intelligence?
- Is the contamination point known (e.g., bot flipped to stocks at HH:MM UTC)?

If yes, **propose Mercury forensic extraction FIRST**:
- Give Mercury the file path
- The contamination start timestamp
- The filter criterion
- Mercury reads, parses, emits clean subset to a NEW path
- Original is preserved until clean subset is verified

Mercury-assisted options should be in the A/B/C choice list when offering cleanup paths. Don't limit to "delete / keep-as-is / manual surgery."

Especially important for **gitignored files** — there's no other recovery path.

If this is genuinely a temp file or build artifact (not learned-state), proceed. Otherwise STOP and propose forensic extraction.
