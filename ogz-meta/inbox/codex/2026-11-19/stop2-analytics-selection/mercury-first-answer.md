I have traced the full control flow. Let me compile the findings.

**Summary of evidence gathered:**
- `edge-analytics-panel.js` full source read (lines 1-497): `onAssetChange`, `onWatchlistSelect`, `setSymbol`, `clearAll`, `frameMatchesSelectedAsset`, `init`.
- Diff receipts for all three targets read.
- `chart-panel.js` read at lines 470-560, 1360-1410, 1490-1660: `bindWatchlistSelect`, `armWatchlistSelectBinding`, `switchAsset`, dropdown change handler, and the bus-timing comment.
- `watchlist-strip.js` read at lines 130-180, 660-760: `ensureEventBus`, `setSelected` emission.
- `core.js` read at lines 1-120: `OGZ.init()` ordering.
- Dashboard script order read for both v1 and v2.

---

VERDICT: found_break
ADVERSARIAL_REVIEW_BLOCKING: yes

CANDIDATE SET: examined 3 of 3 changed paths (`public/js/panels/edge-analytics-panel.js`, `public/unified-dashboard-v2.html`, `public/unified-dashboard.html`), plus the producers/consumers relevant to the question: `chart-panel.js`, `watchlist-strip.js`, `core.js`, `run-frontend-empire-v2.js`, and the four `ensureEventBus` providers (`watchlist-strip`, `header-strip`, `open-positions`, `custom-alerts`).

**Direct answer.** There are two transition paths, and they resolve differently:

1. **Chart dropdown** — the *newly-selected* asset owns the analytics. `onAssetChange(event)` reads `event.target.value` (the new selection) directly and calls `setSymbol(event.target.value)` (`edge-analytics-panel.js:384-386`). `setSymbol` invokes `clearAll()` when the symbol changed (`edge-analytics-panel.js:421-424`), resetting every value to `--`/`Unavailable`/`No data source` (`edge-analytics-panel.js:426-457`). Rendering is then gated to the selected asset by `frameMatchesSelectedAsset` (`edge-analytics-panel.js:196-204`). So the new asset owns the (cleared, then repopulated) values.

2. **Watchlist** — the *previous (old)* asset owns the analytics values immediately after the transition. `onWatchlistSelect(data)` does **not** use the watchlist payload; it reads the dropdown value `selector.value` (`edge-analytics-panel.js:378-380`). Because of subscription ordering (below), this handler runs *before* chart-panel updates the dropdown, so `selector.value` still holds the old asset. `setSymbol(oldAsset)` is a no-op (`state.currentSymbol === oldAsset`, so `clearAll()` is skipped), and the old asset's values remain displayed.

**Why the ordering produces the old-asset ownership.** The diff changed `onWatchlistSelect` from `setSymbol(String(data.symbol))` (baseline, the true selection) to `setSymbol(selector.value)` (the dropdown). In the v2 dashboard the dropdown is only updated by chart-panel's `switchAsset` (`chart-panel.js:1599` `assetSel.value = sym`), which is triggered by chart-panel's `_watchlistSelectHandler`. The subscription order on `watchlist:select` is:

- `chart-panel.js` registers `Chart`/`ChartPanel`; `Chart` is special-cased to init first in `OGZ.init()` (`core.js:96`). Its init calls `armWatchlistSelectBinding()` (`chart-panel.js:1395`), but at that moment `OGZ.bus` does not exist yet — the code comment states this explicitly: "Chart initializes before WatchlistStrip creates OGZ.bus" (`chart-panel.js:1392-1394`). So `bindWatchlistSelect()` returns false (`chart-panel.js:493`, `500-503`) and `armWatchlistSelectBinding` starts a 50ms `setInterval` retry (`chart-panel.js:507-518`). **No subscription yet.**
- `watchlist-strip.js` (loaded at v2 line 1136, before chart-panel at 1171) creates the bus in its init via `ensureEventBus()` (`watchlist-strip.js:672`, `140-162`).
- `edge-analytics-panel.js` (loaded at v2 line 1172) inits after the bus exists and subscribes immediately (`edge-analytics-panel.js:410-412`).
- chart-panel's 50ms retry fires only after the synchronous `OGZ.init()` loop completes, so it subscribes *last*.

Thus on a `watchlist:select` emission, `onWatchlistSelect` runs first with a stale dropdown, `setSymbol` does not clear, and the old asset's analytics persist. This is a regression from the baseline, which used `data.symbol` and would have cleared correctly regardless of dropdown state.

**Contrary evidence considered and rejected.** I checked whether any *earlier*- could update the dropdown before `onWatchlistSelect`. The only dropdown-updating subscriber is chart-panel's `_watchlistSelectHandler`, which subscribes after edge-analytics (deferred retry). `run-frontend-empire-v2.js`'s handler (loaded at v2 line 1179) subscribes after both. So no pre-`onWatchlistSelect` dropdown update exists. I also verified the v1 dashboard (`unified-dashboard.html`) loads neither `chart-panel.js` nor `watchlist-strip.js` (grep for `watchlist` returned zero matches; only the static `<select id="assetSelector">` at line 3066 exists), so v1 has no watchlist path and only the (correct) dropdown path applies.

**ALLEGATIONS.** The break is a behavioral regression in the watchlist path of `edge-analytics-panel.js`, introduced by the diff at `edge-analytics-panel.js:378-380` (changing `data.symbol` → `selector.value`). It is supported by the ordering evidence above. The dropdown path is not broken.

**INHERITED.** The analytics panel relies on the shared `OGZ.bus` existing at init time; if it does not (e.g., if `watchlist-strip` were absent or failed to init), `edge-analytics-panel` silently skips the watchlist subscription (`edge-analytics-panel.js:410-412` has no retry), so watchlist transitions would never touch the analytics at all. This is a silent-default dependency, not exercised in the current v2 order.

**AST EVIDENCE.** I used `open_file` (full source), `grep`/`regex_grep`, `find_definition`, and `read_review_receipt` for diffs. I did not use `serena_*` AST call-graph tools; the ordering claim is derived from source read + the explicit code comment, not from an AST caller scan.

**FOURTH SHAPE CLASSIFIER.** The diff adds no throw/guard/gate; it only changes the symbol source inside `onWatchlistSelect` (`edge-analytics-panel.js:378-380`) and renames `onLegacyAssetChange`→`onAssetChange` and repoints the selector id in `init`/`teardown`;edge-analytics-panel.js:396-398`, `465-467`).

**SUBSTANTIVE RESOLUTION:** none (no prior reviewer findings exist for this question).

WHAT I DID: read the full `edge-analytics-panel.js`, the three captured diffs, the relevant `chart-panel.js` ranges (470-560, 1360-1410, 1490-1660), `watchlist-strip.js` (130-180, 660-760), `core.js` (1-120), and the v1/v2 dashboard script sections; grep'd `cp-assetSelector`, `watchlist:select`, `ensureEventBus`, `chart-panel.js`, `watchlist-strip.js`, and `assetSelector`; traced registration/init order through `OGZ.init()`.
WHAT I DID NOT DO: did not execute the code; the subscription-order and stale-dropdown behavior is derived from source + the explicit chart-panel comment, not observed at runtime. I did not run a browser/socket harness.
WHAT I ASSUMED: that `OGZ.init()` runs synchronously (so the 50ms `setInterval` retry cannot fire mid-init), that `Object.keys(state.activeModules)` iteration order equals registration (script-load) order, and that module init order is the v2 script order for the non-special modules.
WHY THIS VERDICT: the watchlist path reads the dropdown (`selector.value`) instead of the watchlist payload (`data.symbol`); because edge-analytics subscribes to `watchlist:select` before chart-panel (which updates the dropdown), the handler reads a stale value, `setSymbol` is a no-op, and the old asset's analytics remain displayed — a regression introduced by the diff.
IF INCOMPLETE, WHY: the runtime ordering is inferred, not executed; a live harness (browser + socket) would be needed to observe the exact post-transition values. This does not change the verdict because the source ordering is unambiguous.

MISSING EVIDENCE: an executed runtime trace of a watchlist transition (to directly observe the stale-dropdown read); a confirmation that no other unexamined subscriber updates `#cp-assetSelector` before `onWatchlistSelect` (I found none among the grep'd subscribers).
