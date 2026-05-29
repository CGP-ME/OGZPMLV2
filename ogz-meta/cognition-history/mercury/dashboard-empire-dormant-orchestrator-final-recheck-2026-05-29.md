# Mercury Final Recheck Prompt - Dashboard Empire Dormant Orchestrator

Final adversarial pass on `public/js/run-frontend-empire-v2.js`.

Break the current file if possible. Do not validate it.

Attack vectors:
1. `init()` / `teardown()` / `init()` with the same Socket object.
2. `init()` / `teardown()` / replacement Socket object / `init()`.
3. Socket missing at first init, then registered later.
4. Required-symbol frames without `symbol`.
5. Symbol switch from BTC-USD to TSLA where broker/account/timeframe/executionMode should not carry stale values.
6. Any broker or asset alias inference.
7. Any error path that disappears from `Empire.health().errors`.
8. Any path where `bootAll()` or `init()` initializes panel modules.

Line ranges:
- Symbol/scope: `public/js/run-frontend-empire-v2.js:190-253`
- Route/quarantine: `public/js/run-frontend-empire-v2.js:386-412`
- Socket install/retry: `public/js/run-frontend-empire-v2.js:416-456`
- Health/API: `public/js/run-frontend-empire-v2.js:506-614`

Return only code-backed findings with file:line evidence. If a vector cannot be breached, cite the lines that block it.
