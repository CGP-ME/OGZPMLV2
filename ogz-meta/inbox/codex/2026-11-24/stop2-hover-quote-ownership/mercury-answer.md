# Independent Review — Current-Price Identity During Historical-Candle Hover

## Scope and question
The diff removes, from both served chart implementations, the crosshair handler's write to the header price element (`_cachedPriceEl` / `#currentPrice`). Before the change, hovering a historical candle overwrote the header with an OHLC string (`O:…H:…L:…C:…`); the handler restored the live price when the cursor left a candle. After the change, the crosshair handler only manages the floating tooltip, and the header is owned by the live-quote producer. The question: does this fail or cost money in production?

## What the change does (producers)
**chart.js (`unified-dashboard.html`)** — crosshair handler now only writes the tooltip (`public/js/chart.js:427-487`). The header `#currentPrice` is now written only by:
- `update()` live tick producer: `public/js/chart.js:936-951` (`priceEl.textContent = $${price.toLocaleString()}`), fired on every WS tick regardless of hover.
- `clearAll()`: `public/js/chart.js:823-825` (writes `$lastPrice` or `'--'` on symbol switch).
- `init()` adds the flash class (`:215-222`); `destroy()` nulls the ref (`:886`).

**chart-panel.js (`unified-dashboard-v2.html`)** — identical structure:
- Crosshair handler: `public/js/panels/chart-panel.js:1078-1142`.
- Live producer: `public/js/panels/chart-panel.js:2006-2021`.
- `clearAll()`: `public/js/panels/chart-panel.js:1834-1836`; teardown nulls ref (`:1893`).

The only other crosshair subscription in chart-panel.js is the oscillator-pane sync callback (`public/js/panels/chart-panel.js:2412-2417`), which only calls `chart.setCrosshairPosition(...)`; it does not touch the header. I verified via grep that `_cachedPriceEl` has exactly the references enumerated above and no other writer exists in either served implementation.

## Consumers of `#currentPrice`
- Hero mirror (`public/unified-dashboard.html:3404-3461`): MutationObserver → `parsePrice` → `dst.textContent = '$' + num.toFixed(2)` + delta (`:3440-3452`).
- asset-tf-card.js `syncPrice` (`public/js/panels/asset-tf-card.js:42-48`): mirrors text verbatim into the card price.
- command-palette.js copy-price (`public/js/command-palette.js:529-537`): copies `#currentPrice` text to clipboard.

## Before/after behavior during hover
- **Before**: hovering a candle set `#currentPrice` to `O:…H:…L:…C:…`. The hero's `parsePrice` regex (`public/unified-dashboard.html:3415-3421`) extracted the first number — the candle's **open** — and displayed it as the "current price," computing deltas against consecutive opens (bogus signals). The asset card mirrored the raw OHLC string; the copy command copied OHLC.
- **After**: `#currentPrice` stays at the live tick price during hover. OHLC is shown only in the floating tooltip (`crosshairTooltip`), which exists in both dashboards (`public/unified-dashboard.html:3178`; created by chart-panel.js at `public/js/panels/chart-panel.js:867-898`).

This is precisely the intended contract ("live quotes own the header; historical candle hover belongs to the tooltip") and it fixes the previous identity corruption rather than introducing one.

## Candidates considered and disposition
1. **Stale header if ticks stop** — rejected as a regression: the removed "restore on unhover" branch only wrote `$lastPrice` from `OGZ.state`, which equals the last tick value; `update()` keeps writing live price continuously whether or not a candle is hovered. If the feed stops, candles freeze too, so the header freezing is consistent with the chart, not a new monetary cost.
2. **Tooltip missing → loss of all hover feedback** — rejected: `#crosshairTooltip` is present in `unified-dashboard.html:3178` and created at mount in chart-panel.js.
3. **Another producer writing OHLC to the header** — rejected: full enumeration of `_cachedPriceEl` references in both files shows only `init`/`update`/`clearAll`/`destroy`; the oscillator-pane crosshair callback does not touch the header.
4. **Consumer depending on OHLC format in `#currentPrice`** — rejected: hero mirror, asset card, and copy command all benefit from a pure-price string; none parse `O:/H:/L:/C:`.
5. **Legacy dashboard's old-style crosshair** (`public/unified-dashboard-legacy.html:3229`) — out of scope: it is not one of the two served implementations, and this diff did not touch it.

## Verdict
VERDICT: no_break_found

ADVERSARIAL_REVIEW_BLOCKING: no

WHY THIS VERDICT: The change removes the only path that ever wrote historical OHLC into `#currentPrice`; both served implementations now keep the header at the live tick price during hover (chart.js:936-951; chart-panel.js:2006-2021), with OHLC confined to the tooltip (chart.js:429-487; chart-panel.js:1078-1142). Every consumer of `#currentPrice` (hero mirror, asset card, copy command) receives a clean price string, so the previous misleading "current price = candle open" behavior is eliminated. I found no reachable production trigger that fails or misprices as a result of this change.

CANDIDATE SET: examined 15 of 16; complete candidate inventory:
1. chart.js crosshair handler (removed header write) — examined (`:429-487`)
2. chart.js `update()` live producer — examined (`:936-951`)
3. chart.js `clearAll`/`init`/`destroy` `_cachedPriceEl` handling — examined (`:215-222, :823-825, :886`)
4. chart-panel.js crosshair handler — examined (`:1078-1142`)
5. chart-panel.js `update()` live producer — examined (`:2006-2021`)
6. chart-panel.js `clearAll`/teardown/init — examined (`:1834-1836, :1893, :926-931`)
7. chart-panel.js oscillator-pane crosshair callback — examined, not a header producer (`:2412-2417`)
8. unified-dashboard.html hero mirror — examined (`:3404-3461`)
9. unified-dashboard.html `#currentPrice` element + `#crosshairTooltip` — examined (`:3057, :3178`)
10. unified-dashboard-v2.html script selection (chart-panel.js only, legacy chart.js deleted) — examined (`:1091, :1171`)
11. asset-tf-card.js consumer — examined (`:42-48`)
12. command-palette.js consumer — examined (`:529-537`)
13. drawing-tools.js — checked via grep; no `currentPrice` reference
14. Legacy dashboard crosshair — noted, out of scope, unread (`public/unified-dashboard-legacy.html:3229`)
15. demo.html / practicingGUItrading.html — out of scope (not served dashboards)
16. websocket.js → `Chart.update()` dispatch — partially examined (registration alias confirmed at `chart-panel.js:2670-2682`, `chart.js:1101`); full dispatch trace not read

AST EVIDENCE: I used `grep`, `regex_grep`, `open_file`, `find_definition`, `serena_blast_radius`, and `read_review_receipt`. `serena_blast_radius` reports both chart files as entry-point scripts with 0 callers (isolated). I did not use `serena_property_refs`/`serena_method_callers`/`serena_class_fields`; structure claims here rest on exhaustive literal grep of `_cachedPriceEl`/`currentPrice`/`subscribeCrosshairMove` plus `open_file` reads of every relevant region.

INHERITED: The four changed paths inherit the header-ownership duty from the deleted crosshair branch into `update()`/`clearAll()`. No new swallowed errors or silent defaults were introduced; the HTML diffs are version-string bumps and a comment rewrite (`public/unified-dashboard.html:3439`).

ALLEGATIONS: None — I found no defect. The change is a fix for the previous header/hero identity corruption.

SUBSTANTIVE RESOLUTION: none (no substantive dispute exists).

WHAT I DID: read all four captured diffs; read the crosshair handlers, live producers, `clearAll`, init/destroy, hero mirror, and consumer code in both implementations; enumerated every `_cachedPriceEl`/`currentPrice`/`subscribeCrosshairMove` reference; confirmed each dashboard loads exactly one chart module.

WHAT I DID NOT DO: did not execute the code (no host-attested runtime receipt); did not fully trace the websocket.js→update() dispatch; did not read the legacy dashboard's crosshair (out of scope); did not read `demo.html`/`practicingGUItrading.html`.

WHAT I ASSUMED: that the two served implementations are `unified-dashboard.html` (chart.js) and `unified-dashboard-v2.html` (chart-panel.js), per the review scope and the diff targets; that `update()` fires on live WS ticks (supported by the module registration and the comment at `public/js/chart.js:212-213`).

IF INCOMPLETE, WHY: not incomplete for the question asked; the only named gap is the unread legacy-dashboard path and the unexecuted runtime behavior, neither of which changes the source-derived conclusion.

MISSING EVIDENCE: an executed/attested runtime observation of hover behavior; the exact websocket.js→update() dispatch path. Neither is required to conclude the source change is correct.
