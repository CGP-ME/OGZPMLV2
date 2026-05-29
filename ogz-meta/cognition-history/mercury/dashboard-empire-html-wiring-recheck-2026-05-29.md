# Mercury Recheck Prompt - Dashboard Empire HTML Wiring

Re-attack the current wiring after the boot script cleanup.

Changed area:
- `public/unified-dashboard-v2.html:790-854`
- `public/js/core.js:28-54`
- `public/js/run-frontend-empire-v2.js:514-632`

Attack goals:
1. Prove any remaining manual `ChartPanel`, `EdgeAnalyticsPanel`, `TradeReplay`, or `Empire` init call exists in the HTML.
2. Prove the new Empire script can load after `window.OGZ.init()` or after `/trai-widget.js`.
3. Prove normal page load can initialize any panel twice because of this HTML boot block.
4. Prove Empire creates duplicate health intervals or duplicate socket handlers on normal page load.
5. Prove the new asset is missing from the v2 HTML, not cache-busted, or absent from Empire's own manifest.
6. Prove the wiring changes production behavior beyond loading Empire and removing stale manual init calls for modules already auto-initialized by `core.js`.

Return only code-backed findings with file:line evidence. If a vector cannot be breached, cite the lines that block it.
