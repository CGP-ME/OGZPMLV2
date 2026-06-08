# Session 2026-06-08 - Risk Manager Follow-Up And Profile Proof

**Branch:** `codex/multi-runtime-scope-build`
**Repo:** `/opt/ogzprime/OGZPMLV2`
**Recorded at:** `2026-06-08T13:55:36Z`
**Session status:** Two follow-up risk/config fixes committed and pushed. Profile swap/run/swap proof completed on the small TSLA file. Live PM2 runtime adoption remains blocked pending explicit restart approval.

## Scope

This follow-up records the work completed after `session-2026-06-08-risk-manager-profile-config-ownership.md`.

That earlier session closed the RiskManager constructor/config ownership boundary, but it left two explicit follow-up items open:

- Daily loss alert reporting still treated raw daily PnL dollars as a percent.
- `TradingConfig.BASE_CONFIG.risk` still carried stale RiskManager circuit-limit defaults after RiskManager ownership moved to `ConfigLoader`/env/profile startup config.

Both follow-ups were handled as separate atomic code slices with their own commits, focused tests, Mercury review, and P0 gates.

## Commits

```text
fc097e5 Fixed RiskManager daily loss alert percent
e50374e Fixed TradingConfig stale risk defaults
```

Both commits were pushed to `origin/codex/multi-runtime-scope-build`.

## Fix 1 - RiskManager Daily Loss Alert Percent

**Root cause:** `RiskManager._checkRiskAlerts()` compared alert thresholds against `pnlState.dailyLoss`, which is a dollar PnL amount, then printed it as a percent.

**Fix:** `PnLTracker` now exposes period loss percent fields, and `RiskManager` uses `pnlState.dailyLossPercent` for the daily loss alert threshold and alert text.

**Files committed:**

- `core/PnLTracker.js`
- `core/RiskManager.js`
- `test/risk-manager-config.test.js`
- `CHANGELOG.md`

**Verification:**

- Syntax checks passed.
- Focused Jest passed.
- Mercury adversarial attack found no real defect after the fix.
- P0 passed.

Evidence:

```text
ogz-meta/cognition-history/live-eval/risk-manager-alert-percent-2026-06-08/p0.log
```

## Fix 2 - TradingConfig Stale Risk Defaults

**Root cause:** `TradingConfig.BASE_CONFIG.risk` still carried stale RiskManager circuit-limit defaults even though live RiskManager limits are now startup-owned by `ConfigLoader`/env/profile config through `RiskManagerConfig`.

**Fix:** Removed stale RiskManager circuit-limit defaults from `TradingConfig.BASE_CONFIG.risk` while preserving non-circuit risk knobs that still belong to `TradingConfig`.

Removed from baseline rest state:

- `risk.maxDrawdown`
- `risk.maxDailyLoss`
- `risk.maxWeeklyLoss`
- `risk.maxMonthlyLoss`
- `risk.riskManagerBypass`

Preserved:

- `risk.maxRiskPerTrade`
- `risk.accountDrawdownBypass`
- recovery sizing fields

Profile and worker-env startup propagation remains intact. A child-process probe proved `current-eval` worker env still reaches `ConfigLoader` with explicit env-sourced RiskManager limits.

**Files committed:**

- `core/TradingConfig.js`
- `test/trading-config-profile.test.js`
- `CHANGELOG.md`

**Verification:**

- Syntax checks passed.
- Focused Jest passed for profile/env/risk adjacent suites.
- Direct child-process worker-env probe confirmed `ConfigLoader` receives `MAX_DRAWDOWN=5`, `MAX_DAILY_LOSS=1`, `MAX_WEEKLY_LOSS=5`, `MAX_MONTHLY_LOSS=5`, and `RISK_MANAGER_BYPASS=true` from explicit env sources under `current-eval`.
- Mercury initial attack identified a test overclaim; the test was corrected to prove worker-env ownership instead of in-memory `applyTuningProfile()` behavior.
- Mercury recheck accepted the corrected boundary.
- P0 passed.

Evidence:

```text
ogz-meta/cognition-history/live-eval/tradingconfig-risk-default-removal-2026-06-08/p0.log
```

## Profile Swap Proof

A small-file profile swap/run/swap proof was run without shell timeouts:

```text
node tools/parallel-backtest.js --atr --solo=RSI --stocks --data=tuning/tsla-15m-750.json --profile=current-eval
node tools/parallel-backtest.js --atr --solo=RSI --stocks --data=tuning/tsla-15m-750.json --profile=legacy-wide
node tools/parallel-backtest.js --atr --solo=RSI --stocks --data=tuning/tsla-15m-750.json --profile=current-eval
```

Results:

| Profile run | Winner | PnL | Trades | WR | PF | Notes |
|-------------|--------|-----|--------|----|----|-------|
| `current-eval` first run | `atr-040` | `$7.39767257971107` | `17` | `82.35294117647058%` | `1.61` | Eval tier targets present in worker env |
| `legacy-wide` | `atr-040` | `$8.668852764769326` | `14` | `78.57142857142857%` | `1.71` | Legacy-wide tier targets present in worker env |
| `current-eval` rerun | `atr-040` | `$7.39767257971107` | `17` | `82.35294117647058%` | `1.61` | Matched first `current-eval` run |

The swap proof shows:

- `current-eval -> legacy-wide` changes the worker-env tier target surface and the result.
- `legacy-wide -> current-eval` returns to the same `current-eval` result.
- No stale profile mutation carried across the swap sequence in this proof.

Evidence:

```text
ogz-meta/cognition-history/live-eval/profile-swap-proof-2026-06-08/current-eval-rsi-atr.log
ogz-meta/cognition-history/live-eval/profile-swap-proof-2026-06-08/legacy-wide-rsi-atr.log
ogz-meta/cognition-history/live-eval/profile-swap-proof-2026-06-08/current-eval-rsi-atr-rerun.log
backtest-results/sweep-1780926766614.json
backtest-results/sweep-1780926785651.json
backtest-results/sweep-1780926805186.json
```

## Runtime PM2 Status

PM2 was inspected but not restarted.

Current repo config has the intended prop-firm-eval-aligned paper runtime risk values in `ecosystem.config.js`:

```text
ACCOUNT_DRAWDOWN_BYPASS=false
RISK_MANAGER_BYPASS=false
MAX_DRAWDOWN=5
MAX_DAILY_LOSS=1
MAX_WEEKLY_LOSS=5
MAX_MONTHLY_LOSS=5
```

Running PM2 env does not fully match that repo config yet:

- `ogz-prime-v2` is missing `MAX_DRAWDOWN`, `MAX_DAILY_LOSS`, `MAX_WEEKLY_LOSS`, and `MAX_MONTHLY_LOSS`.
- `ogz-prime-v2` has `RISK_MANAGER_BYPASS=false` and `ACCOUNT_DRAWDOWN_BYPASS=false`.
- `ogz-websocket` and `ogz-stripe` still show older `MAX_DRAWDOWN=18` and `MAX_DAILY_LOSS=10.0`, with no weekly/monthly keys observed.

This is an operational adoption blocker, not a repo-code blocker.

Do not claim the live runtime has adopted the new risk config until the relevant PM2 process is restarted with explicit operator approval and verified from runtime env/log evidence.

## Remaining Open Items

1. Get explicit operator approval before restarting any PM2 process to adopt the repo risk env.
2. After restart approval, verify runtime env for `ogz-prime-v2` includes all four RiskManager limit keys and risk bypass remains false for paper/live.
3. Continue eval flip checklist against the live Alpaca stock data stream after runtime adoption is proven.
4. Keep broader config consolidation as a separate slice. `ConfigLoader`/profile startup ownership is fixed for this risk boundary, but the repo still has older config surfaces that need systematic consolidation.

## Recorder Notes

The raw P0, Mercury, and profile-swap proof artifacts remain untracked evidence files. They were not staged with the code commits.

No PM2 restart was performed during this follow-up.
