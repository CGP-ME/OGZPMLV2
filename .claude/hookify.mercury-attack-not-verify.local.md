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

**Mercury dispatched with verification framing — switch to attack framing.**

Trey's rule (feedback-mercury-attack-not-verify):
> Verification framing ("is it correct?", "are these equivalent?") returns soft findings. Adversarial framing ("find a state that LIES", "construct a CRASH", "use this as a WEAPON") finds real bugs. Mercury is rarely wrong — soft prompts get soft answers.

Rewrite the prompt with attack framing:
- "Find a state where this code returns a value that LIES about the real position"
- "Construct an input sequence that CRASHES this handler"
- "Use this race window as a WEAPON to corrupt state"
- "Identify every assumption this code makes and falsify each one"

Don't bias Mercury toward agreement. Let Mercury hunt freely. Mercury agreement comes from correct code, not prompt engineering.

C2 case study (2026-04-27): verification missed a CRITICAL crash that adversarial re-dispatch found in 12 iterations.
