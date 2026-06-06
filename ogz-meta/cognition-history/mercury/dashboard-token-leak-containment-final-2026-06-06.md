Mercury, break my fix.

Scope: final dashboard WebSocket token leak containment. Attack this as a security regression guard, not as a general auth redesign. The session/ticket auth layer is separate future work.

Incident:
- Anonymous public dashboard HTML exposed the live WEBSOCKET_AUTH_TOKEN in a ws-token meta tag.
- Runtime token was rotated and PM2 services restarted.
- The previously exposed token is dead and rejected by the live WebSocket.
- A tracked config/.env.example value was a second historical 64-hex token-like value. It is not the known exposed token, not the current rotated runtime token, and the live WebSocket rejects it. Its SHA-256 fingerprint was added to the burned-token denylist anyway because it lived in git history.

Changed/runtime code to attack:

1. ogzprime-ssl-server.js lines 75-131:
- Dashboard templates are read fresh and scrubDashboardToken() forces `<meta name="ws-token" content="">`.
- /unified-dashboard.html and /unified-dashboard-v2.html serve scrubbed HTML.
- Express no longer injects WEBSOCKET_AUTH_TOKEN into public dashboard HTML.

2. ogzprime-ssl-server.js lines 1685-1715:
- WebSocket auth reads only process.env.WEBSOCKET_AUTH_TOKEN.
- Missing token rejects/1011-closes auth.
- No CHANGE_ME_IN_PRODUCTION fallback.

3. core/WebSocketManager.js lines 80-100:
- Bot WS client reads only process.env.WEBSOCKET_AUTH_TOKEN.
- Missing token closes 1011 before auth send.
- No fallback token.

4. Active nginx runtime config /etc/nginx/sites-enabled/ogzprime.conf:
- /unified-dashboard.html and /unified-dashboard-v2.html proxy to Node and add `Cache-Control: no-store`, `Pragma: no-cache`, `Expires: 0`, `proxy_no_cache 1`, `proxy_cache_bypass 1`.
- /unified-dashboard-legacy.html is static but also gets `Cache-Control: no-store`.
- `nginx -t` passed and nginx reloaded.
- Public header check from the VPS showed no Age/Via/X-Cache/CF-Cache-Status/CF edge headers. Public response showed Server nginx/1.18.0, X-Powered-By Express, Cache-Control no-store, Pragma no-cache, Expires 0.

5. scripts/check-dashboard-token-containment.js:
- Fetches real https://ogzprime.org bare routes, no cache-bust:
  /, /index.html, /unified-dashboard.html, /unified-dashboard-v2.html, /unified-dashboard-legacy.html.
- Fails if any route has non-empty ws-token meta or hex-like ws-token meta.
- Requires Cache-Control no-store on dashboard HTML routes.
- Fails loud on fetch/site errors.

6. scripts/scan-secrets.js:
- Streams every tracked file or staged file line-by-line; no whole-blob buffering.
- Fails loud when a file cannot be fully read.
- Skips submodules deliberately and counts them.
- Detects:
  a) non-empty ws-token meta values,
  b) non-placeholder WEBSOCKET_AUTH_TOKEN assignments,
  c) known-burned 64-hex token literals by SHA-256 fingerprint.
- Burned token hashes live in ogz-meta/security/burned-dashboard-token-sha256.txt, not as plaintext token values.
- Scans Markdown/docs/config/fixtures too, not only public HTML.

7. test/dashboard-token-leak-static.test.js:
- Static regression checks for no server injection/fallbacks.
- Scans public HTML files for non-empty ws-token meta.
- Runs `node scripts/scan-secrets.js --tracked`.

8. package.json / .github/workflows/ci.yml:
- npm run ci now includes `npm run scan:secrets`.
- GitHub workflow has an explicit `npm run scan:secrets` step.
- Workflow pull_request branches were corrected from master-only to main+master because the repo default branch is main.

Validation already run:
- `npm run scan:secrets` PASS: tracked files scanned=1187, binarySkipped=12, submodulesSkipped=1.
- `npm run test:dashboard-token` PASS:
  / status 200 no ws-token meta;
  /index.html status 200 no ws-token meta;
  /unified-dashboard.html status 200 ws-token meta length 0 Cache-Control no-store;
  /unified-dashboard-v2.html status 200 ws-token meta length 0 Cache-Control no-store;
  /unified-dashboard-legacy.html status 200 no ws-token meta Cache-Control no-store.
- Syntax checks passed for scripts/scan-secrets.js, scripts/check-dashboard-token-containment.js, test/dashboard-token-leak-static.test.js, ogzprime-ssl-server.js, core/WebSocketManager.js.
- Jest passed: test/dashboard-token-leak-static.test.js and test/frontend-websocket-lifecycle.test.js, 13 tests.
- GitHub verification: default branch is main. main is not branch-protected. master also exists and is not branch-protected. This is not solved by code; it is an explicit remaining repo-settings gap unless operator approves applying protection.

Required attack targets:
- Find any route that still emits a token or can bypass scrubbing.
- Find any cache path that can serve secret-class dashboard HTML without no-store.
- Find any scanner false-negative path where a token in markdown/config/backup HTML/large files/staged content can pass.
- Find any CI path where this can merge without the scanner running.
- Find any reason the `.env.example` historical token-like value still needs rotation beyond the already-rotated WEBSOCKET_AUTH_TOKEN and the live rejection proof.
- Find any hidden breakage to bot auth or dashboard data caused by fail-closed behavior.

Required answer:
- Verdict: PASS or FAIL.
- If FAIL, exact file:line or runtime config path and concrete fix.
- If PASS, list residual risks only. Include whether unprotected main is a blocking acceptance issue for the guard story.
