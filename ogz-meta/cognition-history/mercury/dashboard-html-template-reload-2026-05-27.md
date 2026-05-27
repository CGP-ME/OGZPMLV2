Mercury adversarial review - dashboard HTML template reload.

Attack the current uncommitted patch in:
- ogzprime-ssl-server.js lines 61-145
- CHANGELOG.md Unreleased dashboard reload entry

Root bug:
Nginx proxies /unified-dashboard-v2.html to ogzprime-ssl-server.js so the server can inject WEBSOCKET_AUTH_TOKEN into the HTML meta tag. The server previously cached public/unified-dashboard-v2.html at process boot, so frontend drops to public/ were not visible until ogz-websocket restarted.

Question:
Find any state where this mtime-aware cache still serves stale dashboard HTML after public/unified-dashboard.html or public/unified-dashboard-v2.html changes, leaks or drops the websocket token injection, fails open by serving old HTML after the disk template becomes unreadable, or causes a request-time crash.

Constraints:
- Do not ask whether the patch is correct. Attack it.
- Cite exact file:line proof.
- Separate blockers from non-blocking observations.
- Include whether this closes the root mechanism or only patches a symptom.
