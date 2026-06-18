# Stock Share Range Sizing Mercury Adjudication - 2026-06-18

## Scope

Change under review: dynamic stock entry share range for the TTP 5K MAX eval profile.

Final profile scope after P0 adjudication:

- `current-eval` remains the canonical P0 anchor profile and does not enable stock share range.
- `ttp-5k-max` owns the TTP 5K MAX dynamic share range: min 2 shares, max 8 shares, max notional `$5000`, consistency cap buffer `0.98`, and daily-loss risk fraction `1.0`.

Touched production path:

- `core/OrderExecutor.js`
- `core/TradingConfig.js`
- `config/trading.config.json`
- `config/trading.config.schema.json`

## Mercury Finding 1

Claim: `maxNotionalUsd / price` can produce a max share cap below `minShares`, blocking entries when price is too high.

Adjudication: intentional fail-closed behavior, not a bug.

Reason: `ENTRY_MAX_STOCK_NOTIONAL` is a hard notional cap. If `minShares=2` and `maxNotionalUsd=5000`, then a 2-share order above `$2500/share` exceeds the configured cap. The correct behavior is to block with `stock_share_range_impossible` rather than silently violate max notional or silently lower the configured minimum.

## Mercury Finding 2

Claim: the fee floor can reduce order quantity after share-range validation, allowing a below-minimum entry through.

Adjudication: the fee-floor mechanism is false as stated; the adjacent accepted-quantity mutation class was real and fixed.

Evidence:

- `core/FeeModel.js` calculates fee dollars only; it does not mutate `orderQuantity`.
- `core/OrderExecutor.js` accepts explicit broker `qty` / `quantity` below the planned quantity as a partial fill and records the accepted broker quantity.

Fix applied:

- Preserve broker truth: state records the accepted quantity.
- Make the violation loud: if an accepted stock entry fill violates the configured stock share range, emit `ORDER_ACCEPTED_OUTSIDE_SHARE_RANGE`, return `stockShareRangeFillViolation`, and halt new entries for the symbol with a `[RISK-ENTRY-SHARE-RANGE]` reason.

Regression:

- `test/order-executor-pause-gate.test.js` covers planned 2-share stock entry with broker accepted `qty: 1`; state records 1 share and `haltSymbol('TSLA', '[RISK-ENTRY-SHARE-RANGE] ...')` is called.
