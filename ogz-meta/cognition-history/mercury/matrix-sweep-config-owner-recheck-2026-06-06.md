Mercury, break my fix.

Single target: matrix sweep config ownership recheck after removing the mutable ticker Set.

Changed ranges to inspect:
- core/TradingConfig.js:1076-1145 owns matrixSweep default data, shortcuts, stock ticker shortcuts, strategy rosters, and phase grid values.
- core/TradingConfig.js:1501-1502 exposes TradingConfig.getMatrixSweepConfig(), returning deepFreezePlain(clonePlain(BASE_CONFIG.matrixSweep)).
- tools/matrix-sweep.js:88-89 loads MATRIX_SWEEP_CONFIG and DEFAULT_DATA from TradingConfig.
- tools/matrix-sweep.js:187-192 derives frozen DATA_SHORTCUTS and STOCK_TICKERS from MATRIX_SWEEP_CONFIG and checks stock shortcuts with isStockTickerShortcut().
- tools/matrix-sweep.js:229-267 derives frozen GRID and strategy rosters from MATRIX_SWEEP_CONFIG. GRID.exits.tierPresets is generated from the config-owned tierGrid through the existing buildMonotonicTierCube() helper.
- tools/matrix-sweep.js:801,811-816,841-844 uses DEFAULT_DATA and isStockTickerShortcut() in CLI data handling.
- tools/matrix-sweep.js:934-940 exports DEFAULT_DATA, DATA_SHORTCUTS, STOCK_TICKERS, VALIDATED_STRATEGIES, ALL_STRATEGIES, and GRID; it does not export a mutable Set.
- test/matrix-sweep-surface.test.js:53-93 asserts config ownership, grid parity, and frozen exported surfaces.

Important prior-answer adjudication:
- Your previous response said STOCK_TICKER_SET was exported. Current code does not export STOCK_TICKER_SET, and the Set has been removed anyway.
- Your previous response said GRID.exits changed from a small hard-coded list to C(N,3). The pre-patch HEAD implementation already used buildMonotonicTierCube([0.005, 0.0075, 0.010, 0.0125, 0.015, 0.0175, 0.020, 0.0225, 0.025, 0.0275]) inline, so C(N,3) generation is not new behavior.
- Your previous response said --data= and positional shortcut handling were new. Pre-patch HEAD already handled --data= and positional DATA_SHORTCUTS.

Attack questions:
1. Find any remaining runtime owner for matrix data shortcuts, stock shortcut flags, strategy rosters, or phase grid values outside core/TradingConfig.js.
2. Find any path where a caller can mutate exported matrix sweep values and corrupt a future run or test in the same process.
3. Find any actual generated matrix drift versus pre-patch HEAD for full, quick, exits, and conf phases.
4. Find any actual CLI data shortcut drift versus pre-patch HEAD for --data tsla, --data=tsla, positional tsla, --data nvda, and stockMode detection.
5. Find whether this moved only the symptom while another duplicate owner still controls the same values.

Tests already run after the Set removal:
- node --check core/TradingConfig.js
- node --check tools/matrix-sweep.js
- node --check test/matrix-sweep-surface.test.js
- npx jest test/matrix-sweep-surface.test.js test/backtest-worker-env.test.js test/trading-config-profile.test.js test/parallel-backtest-solo-env.test.js test/anchor-runner-env.test.js --runInBand
- node tools/matrix-sweep.js --help
- sibling scan for old tool-level literals and STOCK_TICKER_SET found no matches outside core/TradingConfig.js owner values.

Output required:
- PASS only if no concrete break is found.
- If you find a break, give file:line evidence and the smallest root-cause fix.
