# Mercury follow-up attack prompt: broker order quantity plan

You are Mercury. Attack the revised patch after the first Mercury pass found real blockers.

Context:
- Repo: /opt/ogzprime/OGZPMLV2
- File under review: core/OrderExecutor.js
- Tests under review: test/order-executor-pause-gate.test.js
- First Mercury pass found:
  1. assetClass detection was too fragile and could classify stocks as base units.
  2. SELL/COVER live broker route could still send USD notional as broker quantity because entryPlan is null for exits.
- The patch was revised to make one root mechanism: live broker order quantity planning for entry and exit actions.

Changed code ranges to attack:
- core/OrderExecutor.js:41-181
  - _isEntryAction()
  - _isExitAction()
  - _entrySide()
  - _exitSide()
  - _orderQuantityUnit()
  - _orderQuantityFromSizeUsd()
  - _buildEntryPlan()
  - _findExitTrade()
  - _buildExitPlan()
  - _runPreOrderEntryGate()
- core/OrderExecutor.js:320-359
  - entry plan and pre-order entry gate
  - live-only exit plan
  - no-matching-exit halt before broker route
- core/OrderExecutor.js:411-430
  - live orderRouter.sendOrder() uses brokerOrderPlan.side and brokerOrderPlan.orderQuantity
- core/OrderExecutor.js:519-615 and 694-781
  - BUY/SELL_SHORT state/webhook path uses entryPlan size and quantity
- core/OrderExecutor.js:1037-1057 and 1368-1473
  - SELL/COVER exit matching and webhook quantity now use exitPlan when live
- test/order-executor-pause-gate.test.js:206-495
  - BUY entry quantity
  - blocked gate side effects
  - entry throughput
  - SELL exit quantity
  - COVER exit quantity
  - assetClass alias and unsupported assetClass cases

Attack questions:
1. Find any BUY/SELL_SHORT path where broker, webhook, StateManager.openPosition(), MaxProfitManager.start(), or notifications can happen before the pre-order entry gate.
2. Find any BUY/SELL_SHORT path where the gate sees one quantity/size and broker/webhook/state sees another.
3. Find any SELL/COVER path where live broker routing can still send USD notional as share quantity to Alpaca.
4. Find any SELL/COVER path where broker side is wrong, especially COVER needing buy rather than cover.
5. Find any no-matching-exit path where broker routing can happen before the KILL-5 halt.
6. Find any assetClass value that should be supported for this repo but is now rejected, or any malformed stock assetClass that can still fall through to base units.
7. Find any backtest/paper path that changed P0 accounting.
8. Find any test gap that could let one of the above pass.

Verification already run after the revision:
- node --check core/OrderExecutor.js: pass
- node --check test/order-executor-pause-gate.test.js: pass
- npx jest test/order-executor-pause-gate.test.js test/config-loader-live-guard.test.js --runInBand: 15 passed
- npm run test:smoke: 13 passed, 0 failed, 1 existing Bombardier warning
- P0 canonical anchor via ogz-meta/anchor-runner full: finalBalance 13255.255799695915, totalTrades 1410

Output format:
- Findings first, ordered by severity.
- Cite exact file:line evidence.
- For each finding, say whether it is:
  - real blocker in this patch,
  - existing unrelated bug,
  - acceptable residual risk,
  - or false positive with evidence.
- Answer this architecture question explicitly: did this patch now close the underlying broker-quantity mechanism for entries and exits, or only hide the symptom, and what new failure modes did it introduce?
