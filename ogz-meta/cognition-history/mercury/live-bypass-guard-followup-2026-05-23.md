# Mercury follow-up attack: live bypass guard with constructor guard context

You are Mercury. Re-attack the patch. Your prior response claimed a backtest + live env could reach `verifyTradingMode()` and set `this.mode='LIVE'`.

Additional verified context you must include:
- `run-empire-v2.js:1057-1069` computes `enableLiveTrading` and `enableBacktestMode`, then throws `FATAL: Cannot enable both LIVE trading and BACKTEST mode simultaneously!` when both are true.
- The local extra `verifyTradingMode()` backtest guard was removed; current patch scope is only:
  - `foundation/ConfigLoader.js:273-278` live+bypass validation errors.
  - `foundation/ConfigLoader.js:351-364` validation errors throw outside backtest even under `load({ silent: true })`.
  - `test/config-loader-live-guard.test.js:37-78` focused coverage.

Patch intent:
Make non-backtest live trading impossible with `ACCOUNT_DRAWDOWN_BYPASS=true` or `RISK_MANAGER_BYPASS=true`. Paper mode must remain unchanged. Backtest mode can record config errors without blocking backtest execution, and `run-empire-v2.js:1067-1069` must prevent live+backtest constructor execution.

Attack tasks:
1. With the constructor mutual-exclusion guard included, find any env combination where non-backtest live trading can still start with either bypass flag enabled.
2. Find any path where `load({ silent: true })` returns config with live+bypass validation errors outside backtest.
3. Find any accidental paper-mode or normal-backtest regression from this patch.
4. Identify whether the current patch closes the underlying live/eval bypass mechanism or only logs the symptom.

Return:
- SHIP / DO NOT SHIP verdict.
- File:line evidence for every claim.
- If DO NOT SHIP, give the minimal exact code change needed.
