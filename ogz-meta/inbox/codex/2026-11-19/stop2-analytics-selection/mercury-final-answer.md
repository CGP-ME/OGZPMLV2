VERDICT: no_break_found

ADVERSARIAL_REVIEW_BLOCKING: no

CANDIDATE SET: examined 5 of 5 (v2 dropdown; v2 watchlist; v1 dropdown; v1 watchlist [rejected — no watchlist on v1]; old-asset-retention [refuted by gate + synchronous DOM update])

AST EVIDENCE: I used `find_references` on `ChartPanel` (38 matches, all within `chart-panel.js`, confirming `switchAsset` at line 500 and registration at 2680-2681/2686-2687), plus `grep`/`regex_grep` for `setSymbol`, `EdgeAnalyticsPanel`, `watchlist:select`, `switchAsset`, `cp-assetSelector`, `assetSelector`, `OGZ.init`, and `watchlist`. I performed whole-file reads of `edge-analytics-panel.js` (lines 1-496) and the relevant ranges of `chart-panel.js` (480-515, 1354-1410, 1495-1660, 2640-2695). I did not use a host-provided AST scan; all structure claims are backed by my own tool calls above.

INHERITED: The `edge-analytics-panel.js` watchlist handler inherited the removal of its direct `setSymbol` call, making it fully dependent on `chart-panel`'s `switchAsset` to reset analytics. This is safe on v2 (chart-panel present) and moot on v1 (no watchlist). `frameMatchesSelectedAsset` has a silent fallback chain: `#cp-assetSelector` → `#assetSelector` (lines 198-199); if neither element exists, `selected` is `undefined` and all analytics renders are silently suppressed (Boolean gate fails). I did not observe any path where an unselected asset's data can render.

FOURTH SHAPE CLASSIFIER: classified 2 of 2 added guards/fallbacks from the diffs. (a) `chart-panel.js:1606-1607` — added `if (analytics) analytics.setSymbol(sym)`; guarded by `OGZ.get('EdgeAnalyticsPanel')` presence; if unregistered, the analytics reset is skipped but the DOM gate still blocks foreign data. (b) `edge-analytics-panel.js:393-395` — added init-time `setSymbol(selected.value)` reading `#cp-assetSelector` → `#assetSelector`; this is a mount-time sync, not a bot-runtime gate. No new bot gates were introduced.

ALLEGATIONS: No break is alleged. The changed watchlist handler no longer calls `setSymbol` directly; I traced that ownership moves to `chart-panel.switchAsset` (`chart-panel.js:1606-1607`), which is reachable on the only dashboard that has a watchlist (v2). I found no path where the analytics panel displays a non-selected asset's values.

SUBSTANTIVE RESOLUTION: none (no substantive dispute; single supported conclusion)

WHAT I DID: Read the four captured diffs; whole-file read of `edge-analytics-panel.js` (1-496); read `chart-panel.js` ranges 480-515, 1354-1410, 1495-1660, 2640-2695; read `unified-dashboard.html` 2690-2760, 3060-3120, 3300-3456; read `core.js` 1-160; read `run-frontend-empire-v2.js` 40-130, 290-330, 600-630; read `edge-analytics.js` 1-91; ran grep/find_references for `switchAsset`, `watchlist:select`, `cp-assetSelector`, `assetSelector`, `setSymbol`, `EdgeAnalyticsPanel`, `OGZ.init`, `watchlist`, `mount`, `init`, `exportName`.

WHAT I DID NOT DO: I did not execute any code or test; did not verify live socket event payload shapes; did not observe runtime bus subscriber ordering; did not audit the full v1 legacy `chart.js` internals; did not read the entire `chart-panel.js` (2695 lines) or the full `unified-dashboard.html`/`unified-dashboard-v2.html` files — only the ranges relevant to the transition path.

WHAT I ASSUMED: I assumed the panels initialize via `OGZ.init()` (confirmed by `core.js:98-100` and the HTML boot calls) and that the socket delivers events carrying an asset identifier comparable to the selector value. I assumed `#cp-assetSelector` (v2) and `#assetSelector` (v1) are the authoritative "displayed asset" sources.

WHY THIS VERDICT: The evidence establishes a single, consistent ownership model: the switch path updates the DOM selector value and calls `setSymbol` (clearing stale data), and `frameMatchesSelectedAsset` gates every render to the current DOM-selected asset. I found no reachable control flow where an old or non-selected asset's analytics survive a transition, and no path where the analytics are owned by anything other than the newly selected asset.

IF INCOMPLETE, WHY: Not incomplete for the ownership question. The remaining gaps (event payload shape, subscriber ordering, runtime execution) would affect *whether data renders at all*, not *which asset owns what renders*, so they do not change the verdict.
