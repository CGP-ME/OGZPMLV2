# Mercury attack: live bypass guard

You are Mercury. Attack this patch; do not confirm it softly.

Context:
- `foundation/ConfigLoader.js:73-83` builds `mode.liveTrading`, `mode.confirmLiveTrading`, `mode.backtest`, and related mode config from env.
- `foundation/ConfigLoader.js:150-156` builds `risk.riskManagerBypass` and `risk.accountDrawdownBypass`.
- `foundation/ConfigLoader.js:269-278` now adds validation errors when `LIVE_TRADING=true` is combined with either `ACCOUNT_DRAWDOWN_BYPASS=true` or `RISK_MANAGER_BYPASS=true`.
- `foundation/ConfigLoader.js:351-364` now throws validation errors outside backtest mode even when `load({ silent: true })` is used.
- `run-empire-v2.js:3-5` loads ConfigLoader with `silent: true` before trading startup.
- `run-empire-v2.js:1244-1285` still performs the two-key live trading mode check after config load.
- `test/config-loader-live-guard.test.js:37-78` covers silent live rejection for both bypass flags, allowed live with both bypasses false, and non-blocking backtest.

Patch intent:
Make the bot impossible to start in live trading mode with account drawdown bypass or risk manager bypass enabled. This is an eval-disqualification safety gate. Paper mode and backtest behavior must not be changed.

Attack tasks:
1. Find any env combination where live trading can still start with `ACCOUNT_DRAWDOWN_BYPASS=true` or `RISK_MANAGER_BYPASS=true`.
2. Find any path where `load({ silent: true })` records validation errors but still returns config to `run-empire-v2.js`.
3. Find any path where this patch accidentally blocks paper trading or normal backtests.
4. Identify whether the fix closes the underlying mechanism or only the symptom.
5. Identify new failure modes introduced by throwing before the later two-key live trading fallback.

Return:
- SHIP / DO NOT SHIP verdict.
- File:line evidence for every claim.
- If DO NOT SHIP, give the minimal exact code change needed.
