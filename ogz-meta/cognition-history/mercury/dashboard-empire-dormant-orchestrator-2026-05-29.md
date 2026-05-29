# Mercury Attack Prompt - Dashboard Empire Dormant Orchestrator

Attack `public/js/run-frontend-empire-v2.js` as hostile frontend runtime code.

Do not validate the design. Break it.

Target file/lines:
- Manifest and symbol-required frame contract: `public/js/run-frontend-empire-v2.js:21-126`
- Scope extraction/update: `public/js/run-frontend-empire-v2.js:190-245`
- Asset/module inventory: `public/js/run-frontend-empire-v2.js:247-347`
- Frame dispatch and missing-symbol quarantine: `public/js/run-frontend-empire-v2.js:349-424`
- Socket retry and health interval lifecycle: `public/js/run-frontend-empire-v2.js:426-446`
- Public init/teardown/API: `public/js/run-frontend-empire-v2.js:506-614`

Known integration context:
- `public/js/core.js:28-54` calls `Socket.connect()` and then auto-inits every registered module except `Chart`, `Socket`, and `Theme`.
- `public/unified-dashboard-v2.html:802-854` calls `window.OGZ.init()` and then manually initializes `ChartPanel`, `EdgeAnalyticsPanel`, `Theme`, and `TradeReplay`.
- This slice adds `public/js/run-frontend-empire-v2.js` as a dormant public asset only. It is not yet loaded by `public/unified-dashboard-v2.html`.

Attack goals:
1. Find a sequence where Empire double-registers socket handlers, duplicates health intervals, or leaks retry timers across `init()` / `teardown()` / `init()`.
2. Find a sequence where Empire lies about module health, required assets, or mount presence.
3. Find a sequence where a missing-symbol or wrong-symbol frame reaches an Empire subscriber despite the required-symbol gate.
4. Find any hardcoded broker/symbol inference, fake scope substitution, or default-to-selected-asset behavior.
5. Find any swallowed error that would hide a broken module/frame route from `Empire.health().errors`.
6. Find any way `bootAll()` or `init()` can initialize panel modules and recreate the double-init/dashboard duplication bugs.
7. Find any new failure mode introduced by this file even while it remains dormant.

Return only code-backed findings with file:line evidence. If a claim is not in retrieved context, say so.
