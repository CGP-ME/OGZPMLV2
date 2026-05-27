Mercury adversarial final recheck - dashboard HTML fresh reads and fail-closed token injection.

Prior Mercury findings:
- mtime cache could serve stale HTML if a deploy preserved mtime.
- token injection could silently produce an empty token if WEBSOCKET_AUTH_TOKEN was missing.
- static middleware concern must be proven against actual Express route order and nginx exact-location routing, not assumed.

Attack the current uncommitted patch in:
- ogzprime-ssl-server.js lines 61-145
- /etc/nginx active config exact locations for /unified-dashboard.html and /unified-dashboard-v2.html if visible through source context

Current intended mechanism:
- loadDashboardTemplate() reads the dashboard HTML file from disk on every request.
- injectDashboardToken() returns null when WEBSOCKET_AUTH_TOKEN is absent.
- injectDashboardToken() returns null when the ws-token meta tag is missing.
- serveDashboardTemplateWithToken() returns 500 instead of serving stale, untokened, or uninjected HTML.
- Exact dashboard routes are registered before express.static.

Question:
Find any remaining blocker where /unified-dashboard.html or /unified-dashboard-v2.html can serve stale HTML after a public/ file drop, silently serve without websocket token injection, leak the websocket token to disk, fail open after a template read/injection error, or crash the dashboard server.

Return blockers only. If no blocker, cite exact file:line proof and state whether this closes the root mechanism or only patches a symptom.
