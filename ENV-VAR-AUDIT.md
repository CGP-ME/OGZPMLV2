# OGZPrime Environment Variable Audit

**See:** `ogz-meta/ENV-VAR-AUDIT.md` for the full technical audit.

## Quick Summary

| Status | Env Vars |
|--------|----------|
| **HONORED** | `ATR_FILTER_ENABLED`, `ATR_MIN_PERCENT`, `MAX_POSITION_SIZE_PCT`, `TIER1/2/3_TARGET` |
| **IGNORED** | `STOP_LOSS_PERCENT`, `TAKE_PROFIT_PERCENT`, `TRAILING_STOP_PERCENT` (locked exit contracts override) |
| **GHOST** | `TRAILING_STOP_ENABLED`, `REGIME_FILTER_ENABLED`, `REGIME_ALLOW_*` (never read) |
| **RULED DELETED** | `RISK_MANAGER_BYPASS`, `ACCOUNT_DRAWDOWN_BYPASS`, `MAX_DRAWDOWN`, `MAX_DAILY_LOSS`, `MAX_WEEKLY_LOSS`, `MAX_MONTHLY_LOSS` — account-level loss protection is TTP venue guards only per Trey ruling 3, 2026-08-29 |

## Why This Matters

Setting `STOP_LOSS_PERCENT=0.5` in a backtest does **nothing**. Every strategy has a locked exit contract in `core/TradingConfig.js` that overrides global SL/TP/trailing values.

To tune exits, edit the strategy's contract directly in TradingConfig.js. See `BACKTESTING-GUIDE.md` Test 4.

---

*Full audit with code traces: `ogz-meta/ENV-VAR-AUDIT.md`*
