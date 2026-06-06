Mercury, break my fix.

Single target: current runtime matrix sweep config ownership.

Acceptance scope:
- core/TradingConfig.js
- tools/matrix-sweep.js
- test/matrix-sweep-surface.test.js

Out of acceptance scope:
- ogz-meta/ledger/** historical/intake copies. If you see a ledger copy, report it as ledger cleanup, not as a runtime break for tools/matrix-sweep.js.
- public/** dashboard code.
- server/** stock-data-adapter code; that stock ticker registry is a different runtime domain, not the matrix sweep shortcut owner.
- tools/parallel-backtest.js; it has its own config-owner slice already and is a separate follow-up if you find a non-matrix issue.

Changed runtime ranges to inspect:
- core/TradingConfig.js:1076-1145 owns matrixSweep default data, shortcuts, stock ticker shortcuts, strategy rosters, and phase grid values.
- core/TradingConfig.js:1501-1502 exposes TradingConfig.getMatrixSweepConfig(), returning deepFreezePlain(clonePlain(BASE_CONFIG.matrixSweep)).
- tools/matrix-sweep.js:88-89 loads MATRIX_SWEEP_CONFIG and DEFAULT_DATA from TradingConfig.
- tools/matrix-sweep.js:187-192 derives frozen DATA_SHORTCUTS and STOCK_TICKERS from MATRIX_SWEEP_CONFIG and checks stock shortcuts through isStockTickerShortcut().
- tools/matrix-sweep.js:229-267 derives frozen GRID and strategy rosters from MATRIX_SWEEP_CONFIG.
- tools/matrix-sweep.js:801,811-816,841-844 uses DEFAULT_DATA and isStockTickerShortcut() in CLI data handling.
- tools/matrix-sweep.js:934-940 exports only frozen config-derived matrix surfaces.
- test/matrix-sweep-surface.test.js:53-93 asserts config ownership, grid parity, and frozen exported surfaces.

Known mechanical evidence before this prompt:
- `rg` found no STOCK_TICKER_SET or old tool-level DATA_SHORTCUTS/GRID/VALIDATED_STRATEGIES/ALL_STRATEGIES owner literals in tools/matrix-sweep.js.
- Pre-patch HEAD already generated the exits phase with buildMonotonicTierCube([...]) and already supported --data= and positional data shortcuts.
- Focused syntax, Jest, and CLI smoke passed after removing the mutable Set.

Attack questions:
1. In acceptance scope only, find any remaining runtime owner for matrix data shortcuts, stock shortcut flags, strategy rosters, or phase grid values outside core/TradingConfig.js.
2. In acceptance scope only, find any path where a caller can mutate exported matrix sweep values and corrupt a future run or test in the same process.
3. In acceptance scope only, find actual generated matrix drift versus pre-patch HEAD for full, quick, exits, and conf phases.
4. In acceptance scope only, find actual CLI data shortcut drift versus pre-patch HEAD for --data tsla, --data=tsla, positional tsla, --data nvda, and stockMode detection.
5. If you find only out-of-scope ledger/archive or separate-tool cleanup, say that explicitly and do not mark the runtime fix broken.

Output required:
- PASS only if no concrete in-scope break is found.
- If you find an in-scope break, give file:line evidence and the smallest root-cause fix.
