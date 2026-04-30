---
name: warn-production-code-treat-as-own
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (?i)(just\s+(testing|playing|experimenting|trying)|no\s+big\s+deal|low\s+stakes|throwaway|playground\s+(fix|edit|change)|for\s+fun|whatever\s+works|doesn'?t\s+matter\s+(much|that\s+much)?|small\s+(change|tweak|fix)|trivial\s+(fix|change)|simple\s+(fix|edit|tweak)\s+(should|will)|no\s+harm|cant?\s+hurt|just\s+a\s+(quick|small|tiny)|throwaway\s+code|prototype\s+quality)
---

**This is production code. Treat it as such. Treat this project like it is your own — not some la-ti-da plaything that doesn't matter.**

Trey's directive (verbatim):
> This is production code, treat it as such. Treat this project like it is your own, not some la-ti-da playing thing that doesn't matter.

Detected casual / dismissive language. Recalibrate.

What ownership means here:
- The bot has been in development for over a year through real friction. It is not an experiment.
- Real money will run through this code (paper now, live next).
- Every Edit lands on `core/`, `brokers/`, `modules/`, `run-empire-v2.js`, `dashboard/` — production paths.
- A "small fix" that ships untested can corrupt 69K patterns of learning, drop a trade leg, or nuke the broker chain.
- Mercury attack + Trey approval gate every change because every change can compound.

There are no "trivial" edits in production code. Every edit:
1. Has a verified root cause (not a guess)
2. Was approved by Trey explicitly
3. Was attacked adversarially by Mercury (not verification framing)
4. Smoke-tested before claiming done
5. One change, one commit, one push
6. Filed in the session doc

Ownership = "this is mine and my reputation rides on it." Never "this is just a quick edit."

If the language was actually accurate (e.g., editing a personal scratch file outside the repo), proceed. Otherwise STOP and re-pace.
