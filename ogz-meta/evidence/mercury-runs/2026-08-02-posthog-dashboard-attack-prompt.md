# Mercury attack dispatch — PostHog analytics wiring on the dashboard shell

Date: 2026-08-02
Changeset: PostHog analytics bootstrap added to all public pages, including the hot-path dashboard shell.

## The change under attack

1. NEW FILE `public/js/posthog-init.js` (35 lines): an IIFE that (a) no-ops with a
   console.warn when POSTHOG_KEY does not match /^phc_/, (b) otherwise creates an
   async script element pointing at https://us-assets.i.posthog.com/static/array.js,
   appends it to document.head, and calls window.posthog.init(...) in its onload.
2. `public/unified-dashboard-v2.html` line 35: added
   `<script src="/js/posthog-init.js"></script>` immediately after the title tag,
   with no async/defer attribute, ahead of every panel CSS import and the
   TradingView lightweight-charts script at line 37.

## Attack brief

Break my fix. Find a concrete state — a specific browser condition, server
response, or boot ordering — where this addition crashes the dashboard boot
sequence (OGZ.init and the panel modules loaded at the bottom of
public/unified-dashboard-v2.html), silently corrupts panel rendering or the
WebSocket wiring, or makes the dashboard lie to the operator while appearing
healthy. Construct the failure, do not just gesture at it. Specifically hunt:

1. Does `ogzprime-ssl-server.js` (the express server that serves this page and
   `express.static(public)`) set any Content-Security-Policy, helmet, or other
   response headers that would block the parser-blocking fetch of
   /js/posthog-init.js or the async CDN fetch of array.js? If the CDN fetch is
   blocked or hangs, trace what actually happens to page boot.
2. The new script tag is synchronous in the head: construct the state where its
   fetch failing or stalling (server restart mid-load, 404 from a stale nginx
   cache, permissions regression on public/js/) delays or breaks the
   lightweight-charts load at line 37 or the module boot at the bottom of the
   file.
3. Does anything in public/js/ or the panel modules already define or read
   `window.posthog`, or mutate document.head in a way that races the appendChild
   in posthog-init.js? A collision that corrupts either side counts.
4. The onload guard `if (window.posthog && window.posthog.init)` — find a state
   where array.js loads but init never fires, or fires twice, silently — the
   operator then believes analytics is live when it is not, or double-counts.
5. Any new failure modes this introduces for the WS-token containment rule
   stated at lines 30-32 of the dashboard head (public HTML must never carry
   WEBSOCKET_AUTH_TOKEN) — could a third-party analytics bundle exfiltrate or
   capture anything it should not from this page?

Name file:line for every finding. If after crawling the code you cannot
construct any failing state, say so explicitly and list what you checked.
