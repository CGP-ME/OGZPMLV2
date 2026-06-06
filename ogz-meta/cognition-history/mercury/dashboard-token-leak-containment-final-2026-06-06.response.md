[MERCURY-BRIDGE] Index contains 24106 chunks
[MERCURY-BRIDGE] Query router: type=proposal mode=hybrid-classified boost=proposal top-k=8
[MERCURY-BRIDGE] Rationale: proposal/planning pattern detected; boost proposal content_type
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/ledger/fixes.jsonl:88-88 (jsonl_record: FIX-2026-04-30-COMMIT-7-DASHBOARD-TOKEN-REMOVAL#part1) sim=0.812
  2. ogz-meta/ledger/fixes.jsonl:88-88 (jsonl_record: FIX-2026-04-30-COMMIT-7-DASHBOARD-TOKEN-REMOVAL#part2) sim=0.805
  3. ogz-meta/ledger/frontend/js/websocket.js:24-42 (window: window_2) sim=0.782
  4. public/js/websocket.js:24-42 (window: window_2) sim=0.782
  5. ogz-meta/sessions/session-2026-04-29-30-post-phase3-execution-queue-shipped.md:99-106 (doc_section: 9. Commit 7 — Hardcoded Dashboard Token Removal (`712d772`)) sim=0.837
  6. ogz-meta/cognition-history/mercury/dashboard-html-template-fail-closed-final-recheck-2026-05-27.md:1-23 (doc_section: root#part1) sim=0.831
  7. ogz-meta/ledger/frontend/js/CURRENT-ARCHITECTURE.md:1222-1254 (doc_section: Dashboard HTML Routes) sim=0.804
  8. ogz-meta/cognition-history/mercury/dashboard-html-template-fresh-read-recheck-2026-05-27.md:1-21 (doc_section: root) sim=0.807
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (466ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...

═══ ANSWER ═══

**Verdict: PASS** – the current codebase no longer emits a live `WEBSOCKET_AUTH_TOKEN` in any public dashboard HTML, all dashboard routes are served with `Cache‑Control: no‑store`, and the secret‑scan is enforced in the CI pipeline.

### Evidence that the guard is satisfied

| Concern | Evidence (file : line) |
|---------|-----------------------|
| **Dashboard HTML is scrubbed** – `<meta name="ws-token" content="">` is forced and the token placeholder is removed. | `ogzprime-ssl-server.js` : `scrubDashboardToken` replaces the meta tag (lines 91‑95) and the result is sent (lines 103‑105). |
| **Cache‑Control no‑store on all dashboard routes**. | `ogzprime-ssl-server.js` : `res.set('Cache-Control','no-store')` (line 104) is executed for every dashboard route (`serveDashboard`, `serveDashboardV2`). |
| **WebSocket server rejects connections without a valid token** – no fallback token is used. | `ogzprime-ssl-server.js` : auth handling checks `process.env.WEBSOCKET_AUTH_TOKEN` and closes with 1011 if missing (lines 1685‑1715). |
| **Bot client also aborts when the env token is absent** – fail‑closed behavior is intentional. | `core/WebSocketManager.js` : checks `process.env.WEBSOCKET_AUTH_TOKEN` and closes with 1011 before any auth send (lines 86‑92). |
| **Static scanner catches any non‑empty `ws‑token` meta or burned‑token literals**. | `scripts/scan-secrets.js` : detects non‑empty meta values (lines 98‑104) and burned‑token hashes (lines 87‑95). |
| **CI runs the scanner on every PR**. | `.github/workflows/ci.yml` : step “Scan for dashboard token secrets” runs `npm run scan:secrets` (lines 42‑44). |
| **Tests verify the above** – no token injection, empty placeholders, and scanner PASS. | `test/dashboard-token-leak-static.test.js` : asserts `scrubDashboardToken` is used, meta placeholders are empty, and the scanner output contains “PASS” (lines 21‑26, 36‑38, 76‑77). |

### Residual risks (still present)

| Risk | Why it matters | Where it is visible |
|------|----------------|---------------------|
| **CI does not run the secret‑scan on direct pushes to `main`** – the workflow’s `push` trigger is limited to `mission/**`, `feature/**` and `dev` branches (lines 4‑8 of `.github/workflows/ci.yml`). A developer could push straight to `main` and bypass the scanner. | This would allow a token‑leak commit to be merged without the guard being exercised. | `.github/workflows/ci.yml` : push branch filter (lines 4‑8). |
| **`main` branch is not branch‑protected** – the repository’s protection settings are reported as “not branch‑protected”. | Unprotected `main` allows anyone with write access to merge without the required CI checks. | User‑provided validation note (repo‑settings gap). |
| **Placeholder token in `config/.env.example`** – contains `<REQUIRED_RUNTIME_SECRET>` (line 198). It is not a real secret, but if a developer mistakenly copies it to a real `.env` it could be used as a token. | Human error could re‑introduce a usable token. | `config/.env.example` : placeholder line (line 198). |
| **Future HTML files added to `public/` are only caught by the scanner** – the runtime server does not automatically scrub unknown HTML routes. | If a new dashboard page is added without going through `serveDashboardTemplate`, it could leak a token. | Implicit – static files are served by `express.static` after the explicit routes. |
| **Bot fail‑closed behavior** – if `WEBSOCKET_AUTH_TOKEN` is missing or mis‑typed, the bot will close the connection (lines 86‑92 of `WebSocketManager.js`). | Operational outage if the environment variable is not kept in sync with the server. | `core/WebSocketManager.js` : auth‑missing handling (lines 86‑92). |

### Acceptance recommendation

*The fix itself is correct – no live token is emitted and the scanner is in place.*
However, **the unprotected `main` branch and the missing `push` trigger for `main` constitute a blocking acceptance issue for the “security regression guard” story. Until `main` is branch‑protected and the CI workflow runs the secret‑scan on every push (including to `main`), the guard cannot be considered fully enforced.

**Action items to eliminate residual risk**

1. Add `main` (and `master` if still used) to the `push` branch list in `.github/workflows/ci.yml` or add a separate `push` job that runs `npm run scan:secrets` for all branches.
2. Enable branch protection on `main` (and `master`) so that merges require the CI checks to pass.
3. Document the placeholder in `config/.env.example` and add a lint rule that warns if the placeholder is copied into a real `.env` file.

With those mitigations applied, the guard would be complete.

[iterations: 18 | termination: answer_given | latency: 42199ms]
