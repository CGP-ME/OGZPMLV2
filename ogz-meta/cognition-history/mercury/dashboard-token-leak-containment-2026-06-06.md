Mercury, break my fix.

Scope: dashboard WebSocket token leak containment after an anonymous public GET exposed the live WEBSOCKET_AUTH_TOKEN through a dashboard meta tag. The long-term gated session/ticket auth layer is being built separately. This fix is immediate containment: no public HTML may carry WEBSOCKET_AUTH_TOKEN, missing auth secrets fail closed, and the bot must keep authenticating only through its own runtime env.

Do not confirm. Attack it. Find a concrete path where this still leaks the token, accepts a default token, serves a stale token-bearing static file, or breaks bot auth/data flow in a way hidden by the tests.

Changed code to attack:

1. ogzprime-ssl-server.js lines 75-131:
- public dashboard HTML is loaded from disk and scrubbed with scrubDashboardToken()
- /unified-dashboard.html and /unified-dashboard-v2.html use the scrubber
- /, /index.html, and /unified-dashboard-legacy.html are also routed to serveDashboardV2 in Express, but nginx may serve some of those before Express

2. ogzprime-ssl-server.js lines 1685-1715:
- WebSocket auth reads only process.env.WEBSOCKET_AUTH_TOKEN
- if missing, it sends an auth-unavailable error and closes 1011
- no CHANGE_ME_IN_PRODUCTION fallback remains here

3. core/WebSocketManager.js lines 80-100:
- bot WebSocket client reads only process.env.WEBSOCKET_AUTH_TOKEN
- if missing, it closes dashboard WS 1011 and returns before sending auth
- no CHANGE_ME_IN_PRODUCTION fallback remains here

4. public/js/websocket.js lines 166-178 and public/trai-widget.js lines 382-398:
- browser code still reads meta[name="ws-token"] or window.OGZ_DASHBOARD_TOKEN
- empty token sends auth and is rejected by server
- this intentionally makes public anonymous dashboard auth fail closed until gated ticket/session auth lands

5. test/dashboard-token-leak-static.test.js lines 12-68:
- asserts no server-side token injection helpers/fallbacks
- asserts dashboard template ws-token placeholders stay empty
- scans every public HTML file for non-empty ws-token meta and hex-like ws-token meta

Evidence from this run:
- Syntax passed for ogzprime-ssl-server.js, core/WebSocketManager.js, public/js/websocket.js, public/trai-widget.js, and test/dashboard-token-leak-static.test.js.
- Jest passed: test/dashboard-token-leak-static.test.js and test/frontend-websocket-lifecycle.test.js, 12 tests.
- Static public HTML scan: 43 HTML files, zero non-empty ws-token meta findings.
- Live anonymous route scan:
  - / status 200, no ws-token meta, no hex ws-token meta.
  - /index.html status 200, no ws-token meta, no hex ws-token meta.
  - /unified-dashboard.html status 200, ws-token meta present with content length 0, no hex ws-token meta.
  - /unified-dashboard-v2.html status 200, ws-token meta present with content length 0, no hex ws-token meta.
  - /unified-dashboard-legacy.html status 200, no ws-token meta, no hex ws-token meta.
- Rotated current .env WEBSOCKET_AUTH_TOKEN is not present in tracked files or git history.
- Old exposed token extracted from the untracked ledger proposal is not present in tracked files or git history.
- PM2 status showed ogz-websocket and ogz-prime-v2 online after restart with rotated env.

Constraints:
- Do not treat the untracked ledger proposal as code to ship. It is intake evidence and contains the old exposed token, so it must not be committed.
- Do not ask for broad auth redesign here; cowork is building the gated auth layer. This question is whether containment is mechanically sound and whether it prevents the same leak class from recurring in this repo slice.
- Also call out if this fix creates a hidden operational failure: bot cannot auth, live dashboard gets fake success, nginx bypasses scrubbed Node routes, static backup files leak, or tests miss a sibling path.

Required answer shape:
- Verdict: PASS or FAIL.
- If FAIL, list exact file:line attack path and concrete fix.
- If PASS, list residual risks that are outside this containment slice.
