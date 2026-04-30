---
name: warn-working-vs-correct
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (?i)(pattern\s+learning\s+is\s+(active|working)|saving\s+(correctly|properly)|writes?\s+(are|is)\s+(happening|flowing)|file\s+(is\s+)?growing|counters?\s+(are\s+)?ticking|patterns?\s+loading|subsystem\s+is\s+(healthy|fine|working|active)|looks\s+(healthy|good)\s+to\s+me|healthy\s+state|everything\s+is\s+saving|saving\s+to\s+(disk|the\s+file)|writes\s+complete|no\s+errors|all\s+(green|good))
---

**"Working" and "correct" are not the same thing.**

Trey's rule (feedback-working-vs-correct):
> When auditing any system, "it's working" means TWO things must be true:
> 1. The mechanical behavior is happening (writes, saves, counter ticks, logs flowing)
> 2. The WORK is on the correct target (right file path, right asset, right scope, right destination)

**You may have only verified (1).**

Before claiming a subsystem healthy, also verify (2):
- Write path matches expected target for current asset / mode / session
- Scope of what's being written matches the current operational context
- Destination isn't shared across mutually-exclusive contexts (crypto vs stock, live vs paper) unless explicitly intended

When the user has flipped contexts (broker change, asset change, mode change), every persistent-state subsystem needs a fresh audit — not a "looks working" check.

**The 2026-04-22 incident:** Pattern learning was "active" — file growing, 69K patterns loaded, saves every 5 min. But the file was the crypto pattern bank, and the bot had just flipped to stocks. Cross-contamination went undetected for 35 minutes / 7 save cycles because only the first-order check was done.

The second-order check is "does the target match the current operation."

Before stopping, verify (2) explicitly. State the target file path. State the asset class. State the mode. Then declare healthy — or don't.
