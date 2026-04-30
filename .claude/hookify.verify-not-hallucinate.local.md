---
name: warn-verify-not-hallucinate
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (the\s+(bug|issue|problem)\s+is\s+(at|in|on)|this\s+function\s+(does|returns|handles)|the\s+code\s+(does|will|should)|line\s+\d+\s+(is|does|returns)|this\s+returns|this\s+sets|this\s+(reads|writes|calls))
---

**Did you verify this with code, or are you hallucinating?**

Trey's rule (feedback-verify-before-claiming + feedback-verify-before-citing):
> Never quote a comment as authority without `git blame` first. Comments rot; trajectories don't. Trey's clock burns when I argue from a misread.

Claim-style language detected in transcript. Before stopping, confirm:
- Did I actually Read the file I'm citing, in this turn?
- Did I quote the line number I'm referencing?
- If I cited a comment or doc string, did I `git blame` it to check it's not stale?
- Memory says X exists — did I grep to confirm X still exists?

"The memory says X exists" is not the same as "X exists now."
"Shoot it straight and shoot it true" — quote line numbers, do not hallucinate.
