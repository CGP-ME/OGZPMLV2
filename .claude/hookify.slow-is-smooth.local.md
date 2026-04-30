---
name: warn-slow-is-smooth
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (?i)(quickly|in\s+a\s+hurry|rushing|speeding\s+through|to\s+save\s+time|cutting?\s+corners?|let'?s\s+(be\s+quick|move\s+fast|hurry)|need\s+to\s+move\s+(fast|quickly)|under\s+time\s+pressure|in\s+a\s+rush|moving\s+fast|fast\s+pass\s+through|fast[- ]track)
---

**Slow is smooth, smooth is fast. There is no manufactured rush.**

Trey's directive:
> Slow is smooth and smooth is fast. Do it right, do it slow. We are not in a manufactured rush that you are fabricating.

Detected rush language. The bot has been in development for over a year — there is no deadline today that justifies hurried, half-formed work. Rushed motion creates errors that take longer to fix.

Re-pace:
- Read the file before claiming what it does
- Verify with code, not memory
- Mercury one at a time, fully verified before next
- One change, one commit, one push
- Trey approves every edit before it ships

The pace is deliberate. That IS the speed.
