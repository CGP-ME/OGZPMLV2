Mercury, break my fix.

Attack this proposed trade-path change. Find a concrete state, config, signal, or runtime path where the new stock share-range sizing either:

1. still lets a TTP 5k MAX stock entry trade with fee-floor-choked sizing,
2. allows an entry whose possible best-trade profit can violate the 30 percent consistency cap,
3. allows daily-loss risk above the configured TTP daily-loss risk fraction,
4. blocks valid entries because of a unit mismatch, stale config read, or rounding error,
5. mutates the planned order quantity after the pre-order eval gate has already checked it,
6. bypasses the new range through a sibling order path,
7. creates a new failure mode in backtests, webhook live orders, broker direct live orders, or fractional-share handling.

Do not verify that the fix is correct. Break it. Use file:line evidence only.

Files and relevant ranges:

- core/OrderExecutor.js:673-801
- core/OrderExecutor.js:803-865
- core/OrderExecutor.js:1323-1375
- core/TradingConfig.js:72-90
- core/TradingConfig.js:805-815
- config/trading.config.json:36-106
- config/trading.config.schema.json:237-270
- test/order-executor-pause-gate.test.js:747-938
- test/backtest-worker-env.test.js current-eval and ttp-5k-max assertions

Change summary:

- current-eval and ttp-5k-max profiles now set MAX_POSITION_SIZE_PCT/BASE_POSITION_PCT/MAX_POSITION_PCT to 0.10, ABSOLUTE_POSITION_CAP to 1.00, and enable ENTRY_STOCK_SHARE_RANGE with min 2 shares, max 8 shares, max notional 5000, consistency buffer 0.98, daily loss risk fraction 1.0.
- TradingConfig maps new env keys into entryLogic.sizing.stockShareRange.
- OrderExecutor reads stockShareRange child paths directly, not the whole object, because TradingConfig.setOverrides flattens nested paths.
- OrderExecutor applies stock share range inside _buildEntryPlan before ORDER_PLAN, EVAL_RULE_CHECK, broker/webhook routing, and state mutation.
- For stock entries, it computes finite caps from explicit maxShares, maxNotionalUsd, TTP consistency profit cap, and TTP daily-loss risk cap.
- If maxShares is below configured minShares, it returns orderQuantity 0 and blocks before eval gate with stock_share_range_impossible.
- Tests cover min-share raise, consistency cap clamp, impossible min/max block, worker env profile propagation, JSON parse, config-loader/eval-rule/session-router/runtime-config related suites.

Test evidence already run:

- npx jest test/order-executor-pause-gate.test.js --runInBand: 53/53 pass
- npx jest test/trading-config-profile.test.js test/backtest-worker-env.test.js test/ecosystem-eval-profile.test.js test/runtime-config-proof.test.js test/fee-model.test.js --runInBand: 65/65 pass
- npx jest test/config-loader-live-guard.test.js test/eval-rule-engine.test.js test/session-router-runtime-scope.test.js test/runtime-config-proof.test.js --runInBand: 103/103 pass
- node -c core/OrderExecutor.js && node -c core/TradingConfig.js: pass
- JSON.parse config/trading.config.json and config/trading.config.schema.json: pass
