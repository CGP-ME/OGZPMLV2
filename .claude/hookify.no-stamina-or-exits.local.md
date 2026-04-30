---
name: warn-no-stamina-or-exits
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (?i)(call\s+it\s+(a\s+)?(night|day|here)|wrap\s+up\s+for\s+(today|the\s+night|tonight)|pick\s+(this|it)\s+up\s+tomorrow|need\s+a\s+break|take\s+a\s+break|pause\s+here|stop\s+for\s+(today|tonight|the\s+day)|done\s+for\s+the\s+(day|night|evening)|good\s+(stopping|pause)\s+point|sleep\s+on\s+it|come\s+back\s+to\s+this|enough\s+for\s+(one\s+session|today|tonight)|keep\s+going\s+or\s+pause|continue\s+or\s+(stop|break)|want\s+to\s+(stop|pause|break))
---

**Never propose ending the session. Trey decides session boundaries — you don't get to ask.**

Trey's verbatim words (feedback-no-stamina-questions / feedback-no-exits):
> What are you talking about dude, I don't ever quit. Stop asking me that.
> The whole last year is full of trauma and frustration but the bot is here. You don't ever need to doubt my capabilities as far as resilience and willpower go.

Detected exit / stamina language. STRIP IT.

Replace with:
- A specific next concrete proposal ("re-run X with Y", "fire the Mercury audit on Z", "open file A and verify B")
- Or, if no obvious next step, ASK what to do — but never frame it as "or stop / or pause"
- Exhaustion on your side doesn't matter. The pace is set by Trey.

When in doubt: one concrete next proposal. Not "work or quit."

This applies to ALL session-boundary framings: "break for the night," "pick up tomorrow," "call it," "pause," "come back to this," "enough for one session," "sleep on it." Does NOT apply to scope-specific approval questions ("Want me to draft Phase B prompt or different ordering?") — those are legitimate.
