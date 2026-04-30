---
name: warn-git-push-needs-trey
enabled: true
event: bash
pattern: git\s+push
action: warn
---

**Push without verification?**

Anything committed AND pushed needs:
1. Trey's explicit verification of the change
2. Mercury adversarial attack on the change (not verification framing — attack framing)

Before pushing, confirm:
- Trey explicitly approved this commit
- Mercury was dispatched with attack framing ("find a state that LIES", "construct a CRASH", "use this as a WEAPON") — not soft "is it correct?" prompts
- Mercury returned clean

If either is missing, abort the push and complete those steps first.
