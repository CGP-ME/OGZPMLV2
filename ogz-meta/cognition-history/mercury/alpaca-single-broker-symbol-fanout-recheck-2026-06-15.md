Mercury, break my fix.

Corrected target:
- `run-empire-v2.js:174-192` resolves disabled-SessionRouter single-broker subscription symbols.
- `run-empire-v2.js:2006-2038` subscribes all explicit Alpaca symbols and resolves incoming OHLC symbols from `eventData.symbol`, then `raw.symbol`, then Alpaca `raw.S`, then the single-symbol subscription only when exactly one symbol is configured.
- `test/single-broker-subscription-symbols.test.js:42-270` covers explicit Alpaca fanout, no Alpaca `TRADING_PAIR` invention, non-Alpaca single-symbol feeds, runtime fanout, symbol-less multi-symbol drop, and valid Alpaca `raw.S` routing.

Attack request:
Find any remaining state, config, input sequence, broker payload shape, SessionRouter-disabled runtime condition, or sibling subscription path where this still misroutes bars, drops valid bars, assigns a missing symbol to the wrong symbol, corrupts per-symbol CandleStore / SymbolTradingContext state, breaks non-Alpaca runtime, or fails to observe all configured `ALPACA_SYMBOLS`.

Use exact current code file:line evidence. Do not answer with test-pass confirmation. If broken, give the smallest root-cause patch shape.
