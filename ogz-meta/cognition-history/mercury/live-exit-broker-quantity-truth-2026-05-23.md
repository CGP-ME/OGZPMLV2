# Mercury attack prompt: live exit broker quantity truth

Attack the patch that changes live exit quantity planning from USD/current-price recalculation to stored broker-unit quantity.

Scope:
- `core/OrderExecutor.js:86-97` accepts broker order quantity from broker response or planned quantity, and reads `remainingOrderQuantity`.
- `core/OrderExecutor.js:146-191` builds live SELL/COVER exit plans from active trade `remainingOrderQuantity`, floors stock partial shares, computes `stateExitFraction`, and refuses missing/mismatched quantity truth.
- `core/OrderExecutor.js:446-463` routes live broker orders and stores accepted `orderQuantity` / `quantityUnit` on the trade result.
- `core/OrderExecutor.js:581-609` stores long entry order quantity/unit and remaining order quantity/unit into `StateManager.openPosition`.
- `core/OrderExecutor.js:761-791` stores short entry order quantity/unit and remaining order quantity/unit into `StateManager.openPosition`.
- `core/OrderExecutor.js:1021-1036` routes live partial long exits through `StateManager.reducePosition` using `stateExitFraction` and the actual broker-routed `orderQuantity`.
- `core/StateManager.js:754-806` mutates partial-close state and remaining broker quantity during `reducePosition`.
- `test/order-executor-pause-gate.test.js:408-580` covers full long close, full short cover, partial long close, and missing legacy quantity refusal.
- `test/state-manager-load.test.js:52-82` covers StateManager remaining order quantity mutation.

Adversarial question:
Find any input sequence where this patch still lets a live stock exit place the wrong broker share count, corrupts `activeTrades.remainingOrderQuantity`, creates state/broker divergence after a partial exit, blocks a valid close unnecessarily, or only papers over the USD/current-price recalculation root cause. Include file:line evidence and a concrete failing sequence. Also check whether the fix changes backtest/P0 behavior or creates a new failure mode for existing active trades.
