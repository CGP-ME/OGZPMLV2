---
name: warn-mercury-one-at-a-time
enabled: true
event: bash
action: warn
conditions:
  - field: command
    operator: regex_match
    pattern: (mercury.*\&\s*$|mercury.*&\s*\n.*mercury|mercury.*\&\&\s*mercury|parallel.*mercury|mercury.*--background|mercury.*--parallel|xargs.*mercury|mercury.*&\s*[a-z])
---

**Mercury audits — one at a time, never parallel.**

Trey's verbatim rule (feedback-mercury-one-at-a-time):
> He will choke if you feed him all three at once. Do them right one at a time. Y'all can't even get one thing right most of the time, let alone 3.

Two reasons:
1. Mercury's context window and rate limits degrade on concurrent loads — quality drops
2. CC track record on multi-item batches is bad — when audits run in parallel, results get glossed, flagged findings get missed, "all 3 clean" gets claimed without actually reading each one

How to apply:
- Dispatch ONE Mercury call
- Wait for the full answer
- READ it carefully (not skim)
- Report findings with file:line citations
- Wait for user approval
- Then move to the next audit

Per-audit checkpoint: "Audit 1 clean, proceed to Audit 2?" Do not offer "fire all 3 in parallel" as an option.

Applies to: Mercury agentic audits (ReAct loop), Mercury holistic verification passes, any Mercury-backed code review. Does NOT apply to Mercury's internal ReAct iterations (those are sequential by design).
