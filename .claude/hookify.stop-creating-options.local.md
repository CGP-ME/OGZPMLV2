---
name: warn-stop-creating-options
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (?i)(option\s+1.*option\s+2|option\s+a.*option\s+b|three\s+options?:|here\s+are\s+(your|the)\s+options|i\s+see\s+(three|a\s+few)\s+(options|approaches|paths)|would\s+you\s+like\s+me\s+to|do\s+you\s+want\s+me\s+to|should\s+i\s+(do|run|fire|continue|proceed|go\s+ahead)|three\s+paths\s+forward|few\s+approaches?:|menu\s+of\s+(choices?|options)|a\)\s+.+\s*b\)\s+.+\s*c\)|1\)\s+\w.*2\)\s+\w.*3\))
---

**Stop creating options. Just execute.**

Trey's verbatim correction (feedback-stop-creating-options):
> Bro stop asking me a bunch of stupid questions, quit creating problems to feel better or whatever you are doing milking token usage.

Detected multi-option / decision-menu language. Strip it.

The pattern: wrapping every directive in a 3-option framework + asking permission to proceed + adding insight-block preambles to delay execution = performance and token-waste, not discipline.

How to apply:
- If Trey said "do X, then Y," do X then Y. Don't stop after X to ask "want me to do Y now?"
- If a sub-decision genuinely needs his input, ask ONCE, briefly, in passing — not as a numbered options menu.
- Insight blocks: ONE substantive observation about work just done, not three-paragraph preambles about what you're about to do.

The smoke-detector phrasings:
- "Calling it on both X and Y?"
- "Want me to do A or B?"
- "Three paths forward"
- "Should I proceed?"

When you catch yourself typing those on a directive with an obvious next step, delete and execute.

Distinct from `feedback-default-to-hard-path.md` (which is about WHICH option to pick when there's a real choice). This is about NOT GENERATING options when there isn't a real choice.
