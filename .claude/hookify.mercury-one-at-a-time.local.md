---
name: warn-mercury-one-at-a-time
enabled: true
event: bash
action: warn
conditions:
  - field: command
    operator: regex_match
    pattern: (mercury.*\&\s*$|mercury.*&\s*\n.*mercury|mercury.*\&\&\s*mercury|parallel.*mercury|mercury.*--background|mercury.*--parallel|xargs.*mercury|mercury.*&\s*[a-z])
---

**Mercury — one question, one answer. Like one commit, one change.**

Two violation shapes:

1. **Shell-level parallel dispatch** (what this regex catches): `mercury & mercury`, `xargs mercury`, etc. Mercury chokes on concurrent loads; CC glosses batched results.

2. **Prompt-level bundling** (regex CANNOT catch — you have to police this manually): one `mercury ask` that asks for "any of the following 5 things." Mercury answers the easiest vector, emits `answer_given`, terminates well under cap. The other 4 vectors are silently un-hunted. The response log looks like a clean completion. You only catch this by re-reading the prompt against the response and asking: "did Mercury address every bullet I asked, or just one?"

Sibling discipline of `hookify.git-commit-no-bundling.local.md`. Same mental model: one unit of work = one cleanly-verifiable outcome.

**How to apply:**
- ONE question per dispatch
- Sequential, with verdict checkpoint between each
- Log dispatch flags to a `.cmd` sibling file so the dispatch shape is recoverable later
- If your prompt has "find any of the following," split it

Trey's verbatim on shell-parallel (2026-04-22): "he will choke if you feed him all three at once do them right one at a time yall cant even get one thing right most of the time let alone 3."

Trey's verbatim on prompt-bundling (2026-05-18, after Fix 30 V2 attack where 5-vector bundle → Mercury answered vector 1 → I consumed as full coverage): "you did that but the response got truncated meaning you dont even have the full picture GREAT THERES ANOTHER FAILURE POINT WE HAVE TO AUDIT."
