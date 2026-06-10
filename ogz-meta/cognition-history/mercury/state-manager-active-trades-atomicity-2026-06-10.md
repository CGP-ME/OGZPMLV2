Mercury, break my fix.

Target: StateManager activeTrades mutation atomicity in /opt/ogzprime/OGZPMLV2/core/StateManager.js.

Changed code ranges:
- core/StateManager.js:429-630 openPosition
- core/StateManager.js:724-905 closePosition
- core/StateManager.js:915-1018 reducePosition
- test/state-manager-load.test.js:12-27 explicit config env setup
- test/state-manager-load.test.js:203-318 rollback regressions

Attack objective:
Find a concrete execution path where openPosition, closePosition, or reducePosition still mutates live activeTrades, position, inPosition, trade sizing fields, decisionLedger exits/outcome, closedTrades, trade counters, or narrator/ledger side effects before the locked state update has succeeded.

Assumptions to falsify:
1. The Map clones at core/StateManager.js:578, 784, and 941 prevent live activeTrades mutation before _applyStateUpdatesLocked succeeds.
2. The cloned reduce trade at core/StateManager.js:942-952 prevents trade size, remainingOrderQuantity, and decisionLedger.exits mutation before _applyStateUpdatesLocked succeeds.
3. The result?.success guards at core/StateManager.js:615, 889, and 899 prevent narrator or ledger side effects after a failed state update.
4. Calling _applyStateUpdatesLocked while holding the lock does not introduce a deadlock or bypass validation/save/listener behavior that updateState previously provided.
5. The sibling scan finding that StateManager.set and FRESH_START are not the same runtime entry/exit mutation bug class is wrong only if you can show a production entry/exit caller path that uses them to mutate activeTrades non-atomically.

Return concrete file:line evidence only. If you find a bug, include the minimal input sequence or call sequence that triggers it and the exact state corruption or false side effect.
