# OGZPrime Environment Variable Audit

**See:** `ogz-meta/ENV-VAR-AUDIT.md` for the full technical audit.

## Quick Summary

| Status | Env Vars |
|--------|----------|
| **HONORED** | `ATR_FILTER_ENABLED`, `ATR_MIN_PERCENT`, `MAX_POSITION_SIZE_PCT`, `TIER1/2/3_TARGET`, `RISK_MANAGER_BYPASS`, `ACCOUNT_DRAWDOWN_BYPASS` |
| **IGNORED** | `STOP_LOSS_PERCENT`, `TAKE_PROFIT_PERCENT`, `TRAILING_STOP_PERCENT` (locked exit contracts override) |
| **GHOST** | `TRAILING_STOP_ENABLED`, `REGIME_FILTER_ENABLED`, `REGIME_ALLOW_*` (never read) |

## Why This Matters

Setting `STOP_LOSS_PERCENT=0.5` in a backtest does **nothing**. Every strategy has a locked exit contract in `core/TradingConfig.js` that overrides global SL/TP/trailing values.

To tune exits, edit the strategy's contract directly in TradingConfig.js. See `BACKTESTING-GUIDE.md` Test 4.

---

*Full audit with code traces: `ogz-meta/ENV-VAR-AUDIT.md`*
