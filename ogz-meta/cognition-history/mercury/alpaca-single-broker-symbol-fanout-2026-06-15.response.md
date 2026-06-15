Mercury response summary for `alpaca-single-broker-symbol-fanout-2026-06-15.md`.

Verdict: real issue found.

Finding:
- The first patch read the OHLC symbol only from `eventData.symbol`.
- Alpaca bars can carry the ticker under raw payload fields such as `raw.symbol` or `raw.S`.
- In the multi-symbol single-broker path, a valid Alpaca bar with only `raw.S` would be dropped as missing-symbol instead of routed to that symbol.

Patch shape requested:
- Resolve incoming OHLC symbols from `eventData.symbol`, then `raw.symbol`, then `raw.S`, then the single-symbol subscription only when exactly one symbol is configured.
- Keep multi-symbol missing-symbol payloads fail-closed.

Action taken:
- Patched `run-empire-v2.js`.
- Added regression coverage for valid Alpaca `raw.S` routing.
