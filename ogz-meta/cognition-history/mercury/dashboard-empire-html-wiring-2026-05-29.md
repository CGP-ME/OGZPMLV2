# Mercury Attack Prompt - Dashboard Empire HTML Wiring

Attack the wiring of `public/js/run-frontend-empire-v2.js` into `public/unified-dashboard-v2.html`.

Do not validate it. Break the integration.

Changed area:
- `public/unified-dashboard-v2.html:794-805` loads `/js/run-frontend-empire-v2.js` after `trade-replay.js` and before `/trai-widget.js`.

Relevant boot context:
- `public/js/core.js:28-54` calls `Socket.connect()` and then auto-inits every registered module except `Chart`, `Socket`, and `Theme`.
- `public/unified-dashboard-v2.html:816-853` calls `window.OGZ.init()` and manually initializes `ChartPanel`, `EdgeAnalyticsPanel`, `Theme`, and `TradeReplay`.
- `public/js/run-frontend-empire-v2.js:514-632` registers `Empire`; `Empire.init()` binds socket handlers and starts one health interval, while `bootAll()` only returns health.

Attack goals:
1. Find a path where the new script include double-initializes any panel module.
2. Find a path where the new include creates duplicate socket handlers or duplicate health intervals on normal page load.
3. Find a load-order path where Empire initializes before `Socket` exists or before modules are registered and reports false health.
4. Find a cache/version path where the new asset does not load or is not represented in the manifest.
5. Find any explicit `Empire.init()`, `Empire.bootAll()`, `OGZEmpire.init()`, or `OGZEmpire.bootAll()` call in the HTML.
6. Find any production behavior change beyond loading and auto-initializing Empire through the existing `OGZ.init()` pass.

Return only code-backed findings with file:line evidence. If a vector cannot be breached, cite the lines that block it.
