# Stop 1 migration issues

| Migration | Issue | Evidence | Deferred action |
| --- | --- | --- | --- |
| Candle-store disk retention ownership | The existing isolated candle-history test cannot construct the current configuration because its fixture omits the dashboard token and stock/crypto broker credentials required by `foundation/ConfigLoader.js`. The candle-store assertions do not run. | `python3 scripts/test-isolated.py -- node node_modules/jest/bin/jest.js test/candle-history-runtime-timeframe.test.js --runInBand` on 2026-10-26 | Repair the existing test fixture after the Stop 1 migration list is complete. |
