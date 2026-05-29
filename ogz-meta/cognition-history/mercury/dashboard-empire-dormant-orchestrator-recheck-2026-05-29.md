# Mercury Recheck Prompt - Dashboard Empire Dormant Orchestrator

Re-attack `public/js/run-frontend-empire-v2.js` after the stale-scope fix.

Do not validate the change. Break it.

Focus only on these attack vectors:
1. Construct a symbol-switch sequence that makes `Empire.health().scope` keep stale broker/account/timeframe/execution-mode from the prior symbol.
2. Construct an `init()` / `teardown()` / `init()` sequence that duplicates socket handlers, duplicates health intervals, or leaves frame routing dead.
3. Construct a missing-symbol frame for a type in `SYMBOL_REQUIRED_FRAMES` that still reaches an Empire subscriber.
4. Find a hardcoded broker/symbol inference or selected-asset fallback in the current file.
5. Find an error path that fails without being visible in `Empire.health().errors`.
6. Find any path where `bootAll()` or `init()` initializes panel modules.

Use these live line ranges:
- Scope extraction and clearing: `public/js/run-frontend-empire-v2.js:190-253`
- Frame route/quarantine: `public/js/run-frontend-empire-v2.js:384-412`
- Socket handler install/retry: `public/js/run-frontend-empire-v2.js:414-446`
- Health and public API: `public/js/run-frontend-empire-v2.js:498-614`

Return only code-backed findings with file:line evidence. If you cannot breach a vector, say exactly why with file:line evidence.
