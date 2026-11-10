---
name: warn-mercury-attack-not-verify
enabled: true
event: bash
action: warn
conditions:
  - field: command
    operator: regex_match
    pattern: mercury|callMercury|mercury-bridge|mercury-cli
  - field: command
    operator: regex_match
    pattern: (verify|verification|is\s+(it\s+)?correct|is\s+(this\s+)?equivalent|are\s+these\s+equivalent|confirm|please\s+check|sanity\s+check)
---

**Mercury: one neutral question; no prescribed answer.**

Trey's 2026-11-10 correction supersedes the old attack-word instructions and
retires the generic review phrase. Do not replace a request for approval with a
request for a predetermined defect.

State the behavior or uncertainty and relevant raw observations. Do not provide
your diagnosis, preferred fix, expected answer or desired verdict. Let Mercury
choose the tools, inspect relevant producers and consumers, compare alternatives
and reach its own answer. Require current citations and named missing evidence.

A whole repair or work-summary checklist is not one focused question. Read the
complete answer before the next dispatch. This warning detects some wording; it
cannot establish that a question is unbiased. Inspect the question and added
context yourself. Usage: `trai_brain/mercury-bridge/README.md`.
