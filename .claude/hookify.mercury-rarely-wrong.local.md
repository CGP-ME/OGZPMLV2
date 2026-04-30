---
name: warn-mercury-rarely-wrong
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (mercury\s+(failed|errored|truncated|hit\s+the\s+cap|ran\s+out)|cap[- ]truncation|max[- ]tokens?\s+exceeded|mercury\s+(missed|wrong|off|incorrect))
  - field: transcript
    operator: regex_match
    pattern: (grep|rg\s+|ripgrep|let\s+me\s+search|i'?ll\s+search\s+manually|searching\s+the\s+codebase\s+manually)
---

**Mercury is rarely wrong. Your context to him was wrong, most likely.**

Trey's playbook (mercury-dispatch-playbook + mercury-prompts-must-attack):
> Three Mercury failure modes, three distinct fixes:
> 1. CAP TRUNCATION: bump --max-tokens to 7750 (NEVER lower)
> 2. WRONG-PATH ANSWER: split the prompt into smaller, more specific sub-prompts with exact file:line ranges
> 3. ACTUAL ERROR: direct bash invocation, not pipeline

You appear to have fallen back to manual grep instead of re-dispatching Mercury. Per the mercury-one-at-a-time rule:
- Don't parallel-dispatch — sequential with per-audit checkpoint
- Always name file:line ranges in prompts
- Use --max-tokens=7750 ALWAYS

Re-formulate the Mercury prompt with attack framing and exact line ranges. Do not grep around the failure.
