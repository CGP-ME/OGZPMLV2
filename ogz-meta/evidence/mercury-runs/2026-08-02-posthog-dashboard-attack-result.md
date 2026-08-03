# Mercury attack result — PostHog analytics wiring on the dashboard shell

Date: 2026-08-02
Dispatch: node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750
Termination: answer_given (12 iterations, 11/11 tool calls succeeded, 4 files opened)
Run ledger: ogz-meta/cognition-history/mercury-runs/2026-08-02.jsonl:1
Prompt: ogz-meta/evidence/mercury-runs/2026-08-02-posthog-dashboard-attack-prompt.md

## Mercury verdict (verbatim summary)

"The new posthog-init.js and its synchronous script tag cannot crash the
dashboard or corrupt panel rendering under the current code base. The server
does not set a CSP/Helmet header that would block the script, a missing or
stalled posthog-init.js only delays parsing (it does not abort the page), no
other module reads window.posthog, the async CDN script's onload guard can
silently skip init but never fires twice, and the empty ws-token meta tag
cannot be harvested by the analytics bundle."

Per-vector findings:

1. CSP/Helmet blocking: NO — zero matches for Content-Security-Policy or
   helmet in ogzprime-ssl-server.js or the repo.
2. CDN fetch of array.js blocked: POSSIBLE (network-level block) — dashboard
   still boots; analytics silently disabled by the onload guard. Accepted:
   analytics loss must never take the dashboard down; silent-skip is the
   correct failure direction for a third-party bundle.
3. Synchronous head script stalls (server restart mid-load, permissions
   regression): POSSIBLE — parser blocks until browser timeout, delaying
   lightweight-charts (line 37), the panel modules, OGZ.init, and the WS
   session request (which could then hit dashboard_auth_unavailable). REAL
   FINDING — FIXED same session: the tag is now
   `<script src="/js/posthog-init.js" defer></script>` on all 13 pages, so
   the loader can no longer block parsing. defer preserves execution before
   DOMContentLoaded; the loader only appends an async CDN script to head, so
   it has no ordering dependency on the parser.
4. onload fires but init never runs (array.js downloads but throws): POSSIBLE —
   silent analytics skip only, no double init (script appended exactly once).
   Accepted, same failure-direction rationale as vector 2.
5. window.posthog collisions: NO — repo-wide search finds the symbol only in
   posthog-init.js itself.
6. WS-token containment: NO — meta ws-token is empty by design (server-side
   containment rule, unified-dashboard-v2.html lines 30-32) and posthog-init.js
   never reads it.

## Disposition summary

Real finding fixed: 1 (vector 3 — parser-blocking tag, fixed with defer on all
13 instrumented pages).
Accepted-by-failure-direction: 2 (vectors 2 and 4 — analytics loss is silent
and never takes the page down; that is the required direction for third-party
analytics on a trading dashboard).
Not reproducible: 3 (vectors 1, 5, 6).
