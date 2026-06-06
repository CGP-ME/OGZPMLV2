Mercury, break my fix.

Scope:
- The change moves canonical backtest worker env values and stock zero-fee values out of tools/backtest-worker-env.js and into core/TradingConfig.js.
- The intended behavior must not change. This is a config ownership cleanup only.

Exact current lines to inspect:
- core/TradingConfig.js:931-966 defines BASE_CONFIG.backtestWorkerEnv.canonical and stockZeroFee.
- core/TradingConfig.js:1310-1316 exposes frozen copies via getBacktestWorkerEnvDefaults() and getBacktestStockZeroFeeEnv().
- tools/backtest-worker-env.js:1-31 imports TradingConfig and creates CANONICAL_BACKTEST_ENV / STOCK_ZERO_FEE_ENV from the accessors.
- tools/backtest-worker-env.js:190-213 applies env precedence: base env, canonical env, tuning profile env, file/state/report, stock zero-fee env, direction/config/instrument overrides, then profile stamps.
- test/backtest-worker-env.test.js:86-120 verifies config ownership, frozen exports, and stock worker env equivalence.

Attack questions:
1. Find any path where this move changes runtime/backtest behavior compared with the prior worker-local constants.
2. Find any mutable-state path where a caller can mutate exported worker defaults or TradingConfig canonical defaults and silently affect later workers.
3. Find any override-order bug introduced or preserved by the move, especially fees, slippage, tuning profile env, stock zero-fee env, DIRECTION_FILTER, or sourceEnv pollution.
4. Find any same-class sibling violation where canonical worker env values still have a second owner outside core/TradingConfig.js.
5. Decide whether this closes the root mechanism or only moves the symptom. Name exact file:line evidence for every claim.

Do not confirm. Break it.
