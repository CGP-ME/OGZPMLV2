# Mercury Attack Prompt: OHLC Numeric-String Timestamp Fix

Attack this uncommitted hot-path fix. Do not confirm it. Try to break it.

Changed files and line ranges:
- `foundation/ohlc-normalize.js:38-55`
- `foundation/ohlc-normalize.js:71-105`
- `run-empire-v2.js:361-419`
- `test/ohlc-normalize.test.js:1-38`

Context:
- Live Kraken OHLC payloads emitted timestamps as numeric strings such as
  `"1779850177.477202"` and close-time strings such as `"1779850800.000000"`.
- Before this patch, `run-empire-v2.js` parsed string timestamps with `Date.parse`,
  so those payloads returned `null` and were dropped as invalid timestamps.
- The patch exports `toTimestampMs()` from `foundation/ohlc-normalize.js`.
- `toTimestampMs()` parses positive numeric strings before ISO strings.
- `run-empire-v2.js` delegates its local `ohlcTimestampMs()` to `toTimestampMs()`.

Attack questions:
1. Can this parse a string that should stay invalid and let malformed candles into
   CandleProcessor?
2. Can this change ISO-string behavior, millisecond-number behavior, or
   second-number behavior in a way that moves the TSLA P0 anchor?
3. Can this produce seconds-vs-milliseconds mistakes for realistic broker
   payloads, especially decimal seconds and integer millisecond strings?
4. Does exporting `toTimestampMs()` introduce a backwards-compatibility hazard
   for existing `normalizeOhlc()` consumers?
5. Does `normalizeOhlc()` array passthrough plus `run-empire-v2.js`
   `normalizeOhlcForProcessor()` still handle Kraken canonical arrays correctly,
   or is there a gap where another consumer of `normalizeOhlc()` still sees raw
   timestamp strings?
6. Did the new tests miss a root failure mode that would let the live bot appear
   healthy while silently dropping or misdating candles?

Return:
- Findings with exact file:line citations.
- If a finding is real, give the smallest root-cause fix.
- If no blocker, state residual risks and what P0/focused tests still prove or
  do not prove.
