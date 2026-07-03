# Tomorrow Morning Readiness

Last curated by Codex: 2026-05-28.
Branch: `codex/multi-runtime-scope-build`.

This checklist reflects what actually landed in this Codex pass. The ledger
intake doc at `ogz-meta/ledger/frontend/TOMORROW-MORNING-READINESS.md` had
stale claims from a cowork workspace, so this file separates landed work from
open work.

## Landed And Pushed

- `12f72e7 Fixed`: header brand sizing in `public/js/panels/header-strip.js`.
- `21a9224 Fixed`: watchlist no-data state in `public/js/panels/watchlist-strip.js`
  and `public/css/panels/watchlist-strip.css`.
- `84448b1 Fixed`: open positions live motion in
  `public/js/panels/open-positions.js`.
- `a73e308 Added`: strategy leaderboard aggregate strip in
  `public/js/panels/strategy-leaderboard.js`.
- `19cbc3b Added`: live report trade replay row links in
  `public/js/panels/live-report.js`.
- `87ec5ba Fixed`: mobile rail stacking in `public/unified-dashboard-v2.html`.
- `e9f2cb2 Added`: asset cache busting in `tools/cachebust.js`,
  `public/unified-dashboard-v2.html`, and `public/unified-dashboard.html`.

## Verification Already Run

- `node --check` on edited JavaScript files where applicable.
- `git diff --check` before each commit.
- Focused Mercury attacks for each dashboard/runtime slice.
- `node tools/cachebust.js` was run after adding the cache-busting tool.
- Cachebust idempotence was checked: rerun stamped zero files and still reported
  the same missing optional v2 refs.

No P0 was required for these frontend-only/documentation/cachebust slices.

## Static Deploy Preflight

Run from `/opt/ogzprime/OGZPMLV2`:

```bash
git log --oneline -8
git status --short --branch
node tools/cachebust.js
```

Expected recent commits include:

```text
e9f2cb2 Added dashboard asset cache busting
87ec5ba Fixed dashboard mobile rail stacking
19cbc3b Added live report trade replay links
a73e308 Added strategy leaderboard aggregate strip
84448b1 Fixed open positions live motion
21a9224 Fixed watchlist no-data state
12f72e7 Fixed dashboard header brand sizing
```

If files are copied to a server path by SCP/WinSCP, confirm they are readable by
nginx:

```bash
find /opt/ogzprime/OGZPMLV2/public -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) -exec ls -l {} \;
```

Use mode `644` for public JS/CSS/HTML files. Do not run a broad chmod unless the
target path is confirmed correct.

## Browser Smoke Check

Open:

```text
https://ogzprime.org/unified-dashboard-v2.html
```

Paste this in the browser console:

```js
(function () {
  const O = window.OGZ;
  const mods = O && O.state && Object.keys(O.state.activeModules || {});
  let candleCount = 'err';
  try {
    candleCount = window.candleSeries && window.candleSeries.data
      ? window.candleSeries.data().length
      : 'missing';
  } catch (_) {}
  return JSON.stringify({
    moduleCount: mods ? mods.length : 0,
    hasChartPanel: !!(mods && mods.indexOf('ChartPanel') >= 0),
    hasHeatbar: !!(mods && mods.indexOf('Heatbar') >= 0),
    hasLiveReport: !!(mods && mods.indexOf('LiveReport') >= 0),
    hasHeaderStrip: !!(mods && mods.indexOf('HeaderStrip') >= 0),
    hasWatchlistStrip: !!(mods && mods.indexOf('WatchlistStrip') >= 0),
    socketConnected: !!(O && O.get('Socket') && O.get('Socket').isConnected && O.get('Socket').isConnected()),
    candleCount,
    watchlistNoDataCards: document.querySelectorAll('.ws-card.no-data').length,
    openPositionsBreathing: document.querySelectorAll('.op-row.breathing').length,
    liveReportReplayRows: document.querySelectorAll('.lr-tr-clickable').length
  }, null, 2);
})();
```

Expected:

- `hasLiveReport`, `hasHeaderStrip`, `hasWatchlistStrip`, and `hasChartPanel`
  are true.
- `socketConnected` is true when the websocket process is online.
- `watchlistNoDataCards` may be nonzero until ticker feeds wake up.
- `openPositionsBreathing` is only nonzero when at least one open position row
  exists.
- `liveReportReplayRows` is only nonzero after closed trades exist.

## Open Items Not Closed By This Pass

- Backend symbol attribution remains the root fix for mixed chart/feed truth:
  `price`, `candle`, `delta`, `historical_candles`, and trade frames need
  reliable `symbol` fields.
- Exit-side trade frames still need verified `exitReason` and strategy
  attribution if not already landed in the current backend branch.
- Broker ack/reject frames are still required for honest Gate H broker
  execution visibility.
- Gate decision frames are still required for honest Gate H risk/eval visibility.
- `public/js/panels/system-health.js` still contains the `LAST CRASH` display
  path. Do not claim it was removed until that file is changed and committed.
- `public/js/panels/chart-panel.js` still uses the current checked-in oscillator
  sizing path. Do not claim the cowork chart sizing drop landed unless it is
  separately inspected, applied, tested, and committed.
- `public/js/panels/trade-replay.js` needs a focused listener-lifecycle review.
  Cowork/Mercury flagged a possible stale listener risk around row click
  handlers.
- `public/js/panels/live-report.js` still has a broader double-init/socket bind
  risk class outside the replay-row handler that was fixed in `19cbc3b`.

## Restart Policy

Static frontend changes do not need a PM2 restart.

Restart only when backend/runtime code changes need to be loaded, and then
verify the exact process that owns the changed code:

```bash
pm2 list
pm2 logs ogz-prime-v2 --lines 100
pm2 logs ogz-websocket --lines 100
```

Do not use a green browser load as proof that backend emit-shape fixes are
running. Verify socket frames and PM2 logs.

## Rollback Policy

Each frontend slice was committed separately. If one panel breaks, revert that
one commit or restore that one file, then rerun:

```bash
node tools/cachebust.js
```

Do not roll back unrelated dashboard files to fix one panel.
