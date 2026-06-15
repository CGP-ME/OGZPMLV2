Mercury response summary for `alpaca-single-broker-symbol-fanout-recheck-2026-06-15.md`.

Verdict: no additional defect accepted in the changed single-broker path after the `raw.S` patch.

Re-attack note:
- Mercury pointed at the SessionRouter OHLC handler and suggested assigning stock-session missing-symbol bars to the first stock symbol.
- That patch shape was rejected because it would reintroduce cross-symbol contamination for multi-symbol stocks.

Current evidence:
- `brokers/AlpacaAdapter.js` emits stock bar frames as `{ timeframe: '1m', data: bar, symbol: bar.symbol }`, where `bar.symbol` comes from Alpaca `msg.S`.
- `run-empire-v2.js` SessionRouter OHLC handler reads `eventData.symbol` and `raw.symbol` / `raw.S`.
- If a stock SessionRouter payload truly has no symbol, current behavior drops it instead of assigning it to TSLA or the first configured stock. That is fail-closed and matches this slice's contamination rule.

Remaining load-bearing assumption:
- Alpaca adapter bar events must continue carrying the symbol through `eventData.symbol`, `raw.symbol`, or `raw.S`.
