# Mercury follow-up adjudication: entry/order quantity plan

## Finding: "equityclass" asset-class alias missing

Verdict: false positive for this repo.

Evidence checked after Mercury response:

- `.env:54` uses `ASSET_CLASS=stocks`.
- `foundation/ConfigLoader.js:189` derives `broker.assetClass` from `ASSET_CLASS`, defaulting to `stocks` for Alpaca and `crypto` for Kraken.
- `core/SymbolTradingContext.js:36-67` and `core/MultiAssetManager.js:36-67` use only `crypto` and `stocks`.
- `foundation/Instrument.js:47-51` defines `EQUITY`, `ETF`, and `CRYPTO`; `_orderQuantityUnit()` already accepts `equity`, `etf`, and their plural stock/equity aliases.
- `rg "equityclass|equity-class"` returned no repo hits.

Decision: do not add a guessed `equityclass` alias. Unknown asset classes now fail loud instead of falling through to base-unit routing, which is the correct behavior for broker quantity planning.

## Finding: zero-quantity guard excludes backtest/paper

Verdict: acceptable residual risk / P0-preservation behavior for this patch.

The live/eval hazard is blocked because zero broker quantities are refused when `!backtestMode && !paperTrading`. Backtest/paper behavior was left unchanged to preserve the canonical P0 anchor. The post-fix full P0 reproduced `finalBalance=13255.255799695915` and `totalTrades=1410`.
