Mercury adversarial recheck - dashboard HTML fresh reads.

Prior Mercury found blockers in the mtime-aware cache approach:
- stale HTML if deployment preserves mtime
- silent token injection drop when the ws-token meta tag is missing
- stale HTML or confusing behavior if the cached template survives disk unreadability

Attack the revised uncommitted patch in:
- ogzprime-ssl-server.js lines 61-145
- CHANGELOG.md Unreleased dashboard fresh reads entry

Current intended mechanism:
- loadDashboardTemplate() reads unified-dashboard.html or unified-dashboard-v2.html from disk on every dashboard request.
- injectDashboardToken() refuses to serve HTML if the ws-token meta tag is missing.
- serveDashboardTemplateWithToken() returns 500 on missing/unreadable templates or missing injection point.

Question:
Find any remaining state where /unified-dashboard.html or /unified-dashboard-v2.html can serve stale HTML after a public/ file drop, silently serve without websocket token injection, leak the websocket token to disk, fail open after a template read error, or crash the dashboard server.

Return blockers only. If no blocker, cite exact file:line proof and state whether this closes the root mechanism or only patches a symptom.
