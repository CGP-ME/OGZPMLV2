# Stop 2: indicators follow native candle updates

The served legacy and V2 charts now recalculate price overlays after native
candle insertion or replacement, using the same stored bars rendered as candles.
Old generated Fibonacci/support-resistance lines are replaced; vanished trend
lines and indicators from the previous asset/frame/history are cleared.
V2 reuses its oscillator calculation path, and quote-only updates do not
recalculate candle indicators. Calculations and trading decisions are unchanged.

- [Baseline reproduction](baseline.json): native history initially fills the
  overlays, but subsequent candle changes leave EMA/VWAP stale in both charts.
- [Isolated candidate behavior](candidate.json): actual socket/core dispatch,
  chart methods and indicator math, with synthetic DOM/chart-series boundaries.
  New/current/older bars update EMA/VWAP correctly; generated line counts remain
  bounded; shorter history and scope changes clear stale indicators; quote-only
  updates leave them untouched. No Jest was added or run.
- [Fixture](fixtures/indicators.cjs) reuses the earlier native-client fixture.
  Initial fixture setup omitted `window`, and its first proposed bar had an
  invalid OHLC range. Both fixture errors were corrected before the recorded
  baseline and candidate receipts. Neither was a production failure.
- [Reviewed source identity](source-identity.json), [review command](review-command.json),
  [complete Mercury answer](mercury-answer.md), [review accounting](review.json).
  Mercury found no break in the focused refresh behavior. It performed no
  execution, and explicitly did not read the complete chart files. Its metadata
  coverage flags remain recorded. This is one selected Mercury seat, not a full
  panel agreement or fresh RAG claim.
- [Candidate browser observation](candidate-browser.json): only this browser's
  responses substituted the prepared four files, before source activation.
- [Served browser observation](served-browser.json): Chromium 156 loaded the
  actual public pages after application. Both rendered all seven requested
  frames, received native stock candles and advanced EMA overlays. No page
  exception or blocked outgoing command occurred. Three HTTP 401 console
  messages per page concern missing HTTP dashboard-session access; the existing
  WebSocket credential authenticated the market-data connection. This does not
  certify the supervisor notice/session-authenticated HTTP paths.

**Newly observed blocker:** During the stock session, BTC-USD history was labeled
as Bitcoin but returned approximately $28 stock bars. The quote remained near
$63,000. This is not accepted native Bitcoin evidence. The request used
`this.kraken`, an alias for the active Alpaca adapter. The separate broker-owner
repair packet records the source correction. Stop 2 remains open.

The live observation also exposes an existing RSI timestamp alignment issue:
the legacy plotted RSI ends 14 input bars before the newest candle. Indicator
formula/date alignment requires its own repair; this change does not claim it
was fixed. CVD/source-simulation cleanup remains separate work.

Full screenshots contain operator account/position information and are retained
locally under restricted `private/`, not committed. Browser automation only
issued dashboard data/read/display messages. Backend processes, credentials,
profiles, positions and journals were not changed or restarted. Public static
files are served from disk, so new page loads use this source immediately.

Browser tooling was installed only in the user's cache: existing Playwright
1.64.0, its Chromium headless shell, FFmpeg, and extracted Ubuntu shared-library
packages. No project dependency or system package installation was changed.
