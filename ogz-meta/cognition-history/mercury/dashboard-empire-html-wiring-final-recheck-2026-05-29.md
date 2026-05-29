# Mercury Final Recheck Prompt - Dashboard Empire HTML Wiring

Your prior answer was noisy. Re-attack only the concrete wiring risk.

Use exact current lines:
- `public/unified-dashboard-v2.html:790-854`
- `public/js/core.js:28-54`
- `public/js/run-frontend-empire-v2.js:414-464`
- `public/js/run-frontend-empire-v2.js:514-632`

Questions:
1. Does `/js/run-frontend-empire-v2.js` load before or after the inline `window.OGZ.init()` boot call? Cite exact HTML lines.
2. Does `/js/run-frontend-empire-v2.js` load before or after `/trai-widget.js`? Cite exact HTML lines.
3. Is there any executable HTML call to `Empire.init()`, `Empire.bootAll()`, `OGZEmpire.init()`, or `OGZEmpire.bootAll()`? Comments do not count. Cite exact lines or say no executable call found.
4. Is there any executable HTML manual init call for `ChartPanel`, `EdgeAnalyticsPanel`, or `TradeReplay`? Comments do not count. Cite exact lines or say no executable call found.
5. On normal page load, can the Empire script create more than one health interval or install its socket handlers more than once on the same Socket object? Cite exact code lines.
6. Does this wiring cause Empire to call panel module `init()` methods? Cite exact code lines.

Do not discuss `empire.css`; no such asset is part of this change. Return only code-backed findings.
