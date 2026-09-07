# Inherited findings

The touched files are tooling/config/tests, not the trading runtime.

- `trai_brain/mercury-bridge/run-ledger.js:221-230` catches git receipt-read failures and returns a caller-supplied fallback. This pre-existing behavior can degrade branch/HEAD/dirty-state receipts to placeholders rather than carrying the command failure as a first-class field. It is outside this minimum-surgery mission and remains unfixed.
- Existing metric/display `|| 0` uses in `react-loop.js`, `ask.js`, and `run-ledger.js` do not default trading data and were not changed.
- Existing catches in the touched bridge files either return explicit error/quarantine receipts or terminate the relevant stage; no newly touched catch swallows an execution-path failure.
- No trading env bypass, trading-data silent default, bot runtime mutation, broker call, PM2 action, or new throw was added.
