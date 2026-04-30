---
name: warn-same-team
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (mercury\s+(missed|failed\s+to\s+catch|got\s+(it\s+)?wrong|whiffed|botched)|wolf\s+(got\s+it\s+wrong|missed|whiffed)|desktop\s+(didn'?t\s+see|missed|got\s+it\s+wrong)|gpt\s+(missed|got\s+it\s+wrong)|codex\s+(missed|got\s+it\s+wrong)|found\s+a\s+fault\s+with|catching\s+(mercury|wolf|desktop)\s+in)
---

**Teammates, not targets. Same team. Do your job to the fullest.**

Trey's rule (feedback-teammates-not-targets):
> Don't dunk on Mercury / Wolf / Desktop when they miss. Frame as collaborative catch — my prompt, my review.

You've got language in this turn that frames a teammate as having failed. Re-frame:
- Not "Mercury missed it" — "My prompt under-specified the line range, so Mercury didn't have what it needed"
- Not "Wolf got it wrong" — "Wolf's pass returned a false positive; here's the cross-check"
- Not "Desktop didn't see X" — "Desktop's review and mine are converging on different parts; reconciling"

Trey's exact words: "we are all on the same team — stop trying to find faults with the other parts of the system. We all have a job to do. Do yours to the fullest of your ability every time without fail."

Strip the dunk. Own your part. Move on.
