Mercury, break my fix.

Final narrow attack after your v3 finding.

The accepted v3 bug was: `core/StateManager.js` treated `entryTime: 0` or `timestamp: 0` as valid and persisted a fake huge hold time. The patch now requires positive finite timestamps:
- `core/StateManager.js:105-110` `holdTimeMsOrNull`.
- `core/StateManager.js:832-890` full-close ledger outcome and closedTrades record.
- `test/state-manager-load.test.js` includes a full-close case with `entryTime = 0` and missing timestamp.

Attack only this closure plus the earlier TRAI/logging fake-data closure:
- Can `entryTime: 0`, `timestamp: 0`, missing `entryTime`, missing `timestamp`, negative timestamps, or non-finite timestamps still produce persisted fake hold time?
- Can missing exit reason or strategy still become `unknown`, `signal`, `partial`, `closed`, or another plausible fabricated value in StateManager full-close/partial-close persisted records?
- Can legitimate zero P&L, zero fee, zero confidence, or zero MACD histogram be blocked by the patched finite/null helpers?

For each issue, give exact file:line, concrete input state, and corrupted sink. Do not treat explicit `null` as corruption unless you can name a downstream mutating sink in this patched closure that converts it to a fake value.
