# Mercury Recheck Prompt: OHLC Numeric-String Timestamp Fix

Attack the revised uncommitted timestamp patch after the first Mercury finding.

Changed file ranges:
- `foundation/ohlc-normalize.js:32-60`
- `foundation/ohlc-normalize.js:78-107`
- `run-empire-v2.js:361-419`
- `test/ohlc-normalize.test.js:1-50`

First Mercury found that accepting any positive numeric string was too wide.
The patch now:
- Allows epoch-shaped numeric strings only:
  - 10 digits, optional decimal: Unix seconds from realistic broker feeds.
  - 13+ digits, optional decimal: Unix milliseconds.
- Rejects other numeric-like strings before `Date.parse()` so values such as
  `"0.001"`, `"1e3"`, `"123456789"`, and negative epoch strings cannot be
  accidentally parsed as dates.
- Keeps ISO strings routed to `Date.parse()`.
- Keeps `run-empire-v2.js` delegating to the exported `toTimestampMs()`.

Attack questions:
1. Can malformed numeric strings still reach CandleProcessor as valid timestamps?
2. Did the regex reject any realistic Kraken/Alpaca/broker timestamp shape the
   live or backtest path needs?
3. Did this change existing number or ISO string behavior in a way that can move
   the P0 anchor?
4. Is the array passthrough contract still safe for current consumers? Check
   `run-empire-v2.js` and `core/CandleProcessor.js` call paths specifically.
5. Are the new tests enough to catch the live failure mode and the first Mercury
   edge cases?

Return blocker findings only first. If no blocker remains, state residual risk,
the exact files/lines checked, and what P0 still needs to prove.
