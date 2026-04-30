---
name: warn-no-improv
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (let\s+me\s+just\s+(fix|update|adjust|tweak|patch)|i'?ll\s+just\s+(fix|update|go\s+ahead)|i'?ll\s+go\s+ahead\s+and|let\s+me\s+apply|let\s+me\s+go\s+ahead)
---

**No improv. No derivation. Wait for Trey's verification.**

Trey's directive:
> No improv, no derivation, no "let me just fix this" — wait for Trey's verification.

Detected language pattern that signals self-authorized code change. The rule is:
1. REPORT what you found
2. SHOW the exact changes
3. WAIT for "OK", "approved", "do it"
4. ONLY THEN apply

If you're about to make a code change that Trey hasn't explicitly green-lit by file:line, STOP. Report findings. Wait.
