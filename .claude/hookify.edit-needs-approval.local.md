---
name: warn-edit-needs-trey-approval
enabled: true
event: file
pattern: .
action: warn
---

**Code change about to fire — did Trey approve THIS specific change?**

CLAUDE.md THE LAW:
> Before ANY code edit:
> 1. REPORT what you found (bug, issue, proposed fix)
> 2. SHOW the exact changes you want to make
> 3. WAIT for "OK", "approved", "do it", or similar confirmation
> 4. ONLY THEN apply the fix

**No improv. No "let me just fix this." No derivation from approved scope.**

If Trey approved this exact edit (file path + before/after) in this conversation, proceed. If not — STOP, report findings, wait for OK.

Anything committed and pushed must be verified by Trey AND adversarially attacked by Mercury.
