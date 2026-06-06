Mercury, break my fix.

Single target: matrix sweep config ownership.

Changed ranges to inspect:
- core/TradingConfig.js:1076-1145 adds BASE_CONFIG.matrixSweep with default data, data shortcuts, stock ticker shortcuts, validated/exploratory strategy rosters, and phase grid values.
- core/TradingConfig.js:1501-1502 adds TradingConfig.getMatrixSweepConfig(), returning deepFreezePlain(clonePlain(BASE_CONFIG.matrixSweep)).
- tools/matrix-sweep.js:58 imports TradingConfig.
- tools/matrix-sweep.js:88-89 loads MATRIX_SWEEP_CONFIG and DEFAULT_DATA from TradingConfig.
- tools/matrix-sweep.js:187-189 derives DATA_SHORTCUTS, STOCK_TICKERS, and STOCK_TICKER_SET from MATRIX_SWEEP_CONFIG.
- tools/matrix-sweep.js:226-264 builds frozen GRID and strategy rosters from MATRIX_SWEEP_CONFIG, including generated strict-monotonic exit tier presets from config-owned tierGrid.
- tools/matrix-sweep.js:276 uses the existing TradingConfig import for BASE_CONFIG exit contracts.
- tools/matrix-sweep.js:798,808-813,838-841 uses DEFAULT_DATA and STOCK_TICKER_SET in CLI data handling.
- tools/matrix-sweep.js:932-937 exports the derived frozen surface.
- test/matrix-sweep-surface.test.js:53-93 asserts config ownership, grid parity, and frozen exported surfaces.

Attack questions:
1. Find any remaining runtime owner for matrix data shortcuts, stock shortcut flags, strategy rosters, or phase grid values outside core/TradingConfig.js.
2. Find any path where a caller can mutate the exported matrix sweep surface and corrupt a future run or test in the same process.
3. Find any behavior drift introduced by generating GRID.exits.tierPresets from matrixSweep.grid.exits.tierGrid instead of the prior inline buildMonotonicTierCube([...]) call.
4. Find any behavior drift in CLI data shortcut handling, especially --data tsla, --data=tsla, positional tsla, --data nvda, and stockMode detection.
5. Find whether this moved only the symptom while another same-file duplicate owner still controls the same values.

Tests already run before this prompt:
- node --check core/TradingConfig.js
- node --check tools/matrix-sweep.js
- node --check test/matrix-sweep-surface.test.js
- npx jest test/matrix-sweep-surface.test.js test/backtest-worker-env.test.js test/trading-config-profile.test.js test/parallel-backtest-solo-env.test.js test/anchor-runner-env.test.js --runInBand
- node tools/matrix-sweep.js --help
- sibling scan for old tool-level literals found only core/TradingConfig.js owner values.

Output required:
- PASS only if no concrete break is found.
- If you find a break, give file:line evidence and the smallest root-cause fix.
