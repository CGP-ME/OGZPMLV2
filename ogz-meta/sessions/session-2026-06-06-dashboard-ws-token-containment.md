# Session 2026-06-06 - Dashboard WebSocket Token Containment

## Scope

Immediate containment for a public dashboard WebSocket token leak. An anonymous GET to the dashboard exposed the live `WEBSOCKET_AUTH_TOKEN` through the public HTML `ws-token` meta tag.

This session did not implement the future gated session/ticket auth layer. It removed the long-lived secret from public HTML, rotated the runtime token, hardened runtime caching, and added guards so the same leak class fails loudly in repo and CI.

## Root Cause

The dashboard server injected the long-lived `WEBSOCKET_AUTH_TOKEN` into public HTML. The public route had no auth gate, so any anonymous request could receive the token.

Old dashboard docs described this injection as an intended runtime pattern. That guidance is now superseded.

## Runtime Fix

- `ogzprime-ssl-server.js` now scrubs `ws-token` meta content to empty before serving dashboard templates.
- `ogzprime-ssl-server.js` no longer falls back to `CHANGE_ME_IN_PRODUCTION` for WebSocket auth; missing `WEBSOCKET_AUTH_TOKEN` rejects and closes.
- `core/WebSocketManager.js` no longer sends a fallback token; missing `WEBSOCKET_AUTH_TOKEN` closes before auth send.
- Active nginx dashboard routes were updated with `Cache-Control: no-store`, `Pragma: no-cache`, `Expires: 0`, `proxy_no_cache 1`, and `proxy_cache_bypass 1`; `nginx -t` passed and nginx reloaded.
- `WEBSOCKET_AUTH_TOKEN` was rotated in `.env`, and `ogz-websocket` plus `ogz-prime-v2` were restarted with the updated env.

## Guard Fix

- Added `scripts/scan-secrets.js`, a streamed tracked/staged scanner that checks Markdown, config, HTML, docs, fixtures, and backup/reference files without whole-blob buffering.
- Added `ogz-meta/security/burned-dashboard-token-sha256.txt` for SHA-256 fingerprints of burned dashboard token literals. Token literals are not stored there.
- Added `scripts/check-dashboard-token-containment.js` to fetch the real public dashboard routes and require empty/absent `ws-token` metadata plus `Cache-Control: no-store` on dashboard HTML.
- Added `test/dashboard-token-leak-static.test.js` for server/static/scanner regression coverage.
- Added `npm run scan:secrets`, `npm run test:dashboard-token`, and included `scan:secrets` in `npm run ci`.
- Added the GitHub workflow secret-scan step and updated workflow triggers for pushes and PRs involving `main` and `master`.

## Scrubbed Files

Tracked burned-token literals were scrubbed to `[REDACTED]` from:

- `ogz-meta/ledger/fixes.jsonl`
- `public/restore-reference/unified-dashboard-CURRENT-FOR-GROK.html`
- `public/unified-dashboard.html.bak-20260214-040443`
- `public/unified-dashboard.html.bak-205924`
- `public/unified-dashboard.html.bak-214750`

The tracked `config/.env.example` token-like value was replaced with `<REQUIRED_RUNTIME_SECRET>`. It did not match the known exposed token or the current rotated runtime token, and the live WebSocket rejected it. Its fingerprint is still recorded as burned because it lived in git history.

The untracked intake copy `ogz-meta/ledger/OGZPRIME-MOBILE-PHASE0-SECURITY-SPEC.md` was scrubbed on disk so it cannot later be accidentally staged with the dead secret.

## Verification

- `npm run scan:secrets` passed: tracked files scanned `1187`, binary skipped `12`, submodules skipped `1`.
- `npm run test:dashboard-token` passed against `https://ogzprime.org` bare routes:
  - `/` had no `ws-token` meta.
  - `/index.html` had no `ws-token` meta.
  - `/unified-dashboard.html` had empty `ws-token` meta and `Cache-Control: no-store`.
  - `/unified-dashboard-v2.html` had empty `ws-token` meta and `Cache-Control: no-store`.
  - `/unified-dashboard-legacy.html` had no `ws-token` meta and `Cache-Control: no-store`.
- Syntax checks passed for the changed server, bot WebSocket manager, scanner, live smoke, and focused test.
- `npx jest test/dashboard-token-leak-static.test.js test/frontend-websocket-lifecycle.test.js --runInBand` passed: 13 tests.
- The previously exposed token was rejected by live `/ws`.
- The historical `.env.example` token-like value was rejected by live `/ws`.
- Header disambiguation from the VPS showed no `Age`, `Via`, `X-Cache`, or `CF-Cache-Status`; public dashboard responses came from nginx with `Cache-Control: no-store`.
- Mercury attacks passed:
  - `dashboard-token-leak-containment-2026-06-06`
  - `dashboard-token-leak-containment-final-2026-06-06`
  - `dashboard-token-leak-ci-trigger-recheck-2026-06-06`

## Residual Risk

GitHub reports default branch `main`, and both `main` and `master` are not branch-protected. The workflow now detects dashboard-token leaks on pushes and pull requests involving `main`/`master`, but unprotected direct pushes are still detection, not prevention. Enabling branch protection with required passing checks would change the current direct-push workflow and needs explicit operator approval.

Until that decision is made, agents must not claim the regression guard is server-side enforced. It is code/CI enforced when CI runs, local-hook assisted, and runtime-verified on the VPS.
