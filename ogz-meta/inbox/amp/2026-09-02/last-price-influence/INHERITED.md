# Inherited violations

## `run-empire-v2.js`

- `_normalizeHydrationCandle` retains the inherited volume default
  `raw?.v ?? raw?.volume ?? 0` and synthesized end time `t + timeframeMs`.
- REST writers retain `latest.etime || latest.t`; canonical normalization makes
  zero unreachable, but the `||` trading-data pattern remains unchanged.
- SessionRouter trace fields retain `|| 'unknown'` / `|| null` presentation
  defaults and the active-timeframe fallback retains `|| this.candleTimeframe`.
- Invalid/unnormalizable broker frames retain their existing logged early-return
  behavior. This mission did not add those paths.
- The processor OHLC representation remains seconds. A provider alleged a
  possible one-millisecond floating-point round-trip edge; it is named, unfixed,
  and outside the authorized minimum producer correction.

## `core/StateManager.js`

- `eventTimeMs = Date.now()` remains an inherited default for callers that omit
  time. All three production callers pass an explicit time.
- `getLastPrice` retains `get(symbol) || null`; the writer excludes non-positive
  prices, but the pattern remains unchanged.
- The monotonic stale-input rejection remains the ruled true-boundary tripwire.

No inherited issue above is represented as fixed by Part D.
