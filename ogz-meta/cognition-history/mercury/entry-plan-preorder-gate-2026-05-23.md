# Mercury attack prompt: entry plan and pre-order gate

You are Mercury. Attack this patch adversarially.

Context:
- Repo: /opt/ogzprime/OGZPMLV2
- File under review: core/OrderExecutor.js
- Tests added/changed: test/order-executor-pause-gate.test.js
- Goal of patch: build an explicit entry plan for BUY/SELL_SHORT before live routing, convert USD sizing into the broker quantity unit for stocks, run a pre-order entry gate before any broker/webhook/state side effects, and preserve the canonical P0 backtest anchor.
- This is a foundation change for later TTP eval rules. Do not review the later TTP 5% rule because it is not implemented in this patch.

Changed code ranges to attack:
- core/OrderExecutor.js:41-120
  - _isEntryAction()
  - _entrySide()
  - _entryQuantityUnit()
  - _entryOrderQuantity()
  - _buildEntryPlan()
  - _runPreOrderEntryGate()
- core/OrderExecutor.js:263-287
  - entryPlan construction
  - zero-quantity refusal for non-paper/non-backtest
  - gate execution before the execution try block
- core/OrderExecutor.js:343-360
  - live orderRouter.sendOrder() now uses entryPlan.side and entryPlan.orderQuantity
  - entryPlan options carry sizeUsd and quantityUnit
- core/OrderExecutor.js:451-479 and 546-559
  - BUY branch uses entryPlan sizeUsd/strategy/exitContract and webhook quantity
- core/OrderExecutor.js:626-653 and 712-725
  - SELL_SHORT branch uses entryPlan sizeUsd/strategy/exitContract and webhook quantity
- test/order-executor-pause-gate.test.js:166-305
  - live share quantity test
  - blocked gate side-effect test
  - small throughput test

Attack questions:
1. Find any execution path where a BUY or SELL_SHORT can reach broker routing, webhook emit, StateManager.openPosition(), MaxProfitManager.start(), or notification side effects before _runPreOrderEntryGate() is called.
2. Find any execution path where the gate sees one quantity but the broker, webhook, or StateManager gets a different quantity/size for the same entry.
3. Find any path where stock live routing can still send USD notional as Alpaca quantity instead of shares.
4. Find any path where crypto/base-asset routing is made worse by this change.
5. Find any path where non-entry exits (SELL/COVER) are accidentally affected by entryPlan null behavior.
6. Find any path where this changes backtest or paper accounting enough to move the P0 anchor.
7. Find any hidden assumption in _entryQuantityUnit() that would make a future broker/asset class unsafe.
8. Find any test gap that could let the above bugs pass.

Verification already run before this prompt:
- node --check core/OrderExecutor.js: pass
- node --check test/order-executor-pause-gate.test.js: pass
- npx jest test/order-executor-pause-gate.test.js test/config-loader-live-guard.test.js --runInBand: 11 passed
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
- Answer this architecture question explicitly: did this patch close the underlying USD-as-shares/pre-order-gate mechanism, or only hide the symptom, and what new failure modes did it introduce?
