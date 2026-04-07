# OGZPrime Environment Variable Audit

**Date**: 2026-04-07
**Auditor**: Claude + Trey
**Branch**: tradingloop-clean-rewrite

## Summary

Not all env vars in parallel-backtest.js actually affect trading behavior. Many are **IGNORED** because they're overridden by locked exit contracts per strategy, or they're **GHOST** vars that are never read by trading code.

## Audit Results

### HONORED (Actually affect trading)

| Env Var | Where Read | Effect |
|---------|-----------|--------|
| `ATR_FILTER_ENABLED` | StrategyOrchestrator.js:725 | Enables/disables ATR filter gate |
| `ATR_MIN_PERCENT` | StrategyOrchestrator.js:727 | Minimum ATR % to allow trades |
| `RISK_MANAGER_BYPASS` | RiskManager.js:88,159 | Bypasses all risk checks |
| `ACCOUNT_DRAWDOWN_BYPASS` | StopLossChecker.js:48 | Bypasses drawdown circuit breaker |
| `MAX_POSITION_SIZE_PCT` | OrderExecutor.js:57,71 | Max position size % |
| `TIER1_TARGET` | MaxProfitManager.js:105 | First profit tier target |
| `TIER2_TARGET` | MaxProfitManager.js:107 | Second profit tier target |
| `TIER3_TARGET` | MaxProfitManager.js:109 | Third profit tier target |

### IGNORED (Overridden by locked exit contracts)

| Env Var | Where Stored | Why Ignored |
|---------|-------------|-------------|
| `STOP_LOSS_PERCENT` | TradingConfig.js:211 | Every strategy has LOCKED exitContract with its own SL |
| `TAKE_PROFIT_PERCENT` | TradingConfig.js:212 | Every strategy has LOCKED exitContract with its own TP |
| `TRAILING_STOP_PERCENT` | TradingConfig.js:213 | Every strategy has LOCKED exitContract with its own trail |

### PARTIAL (Works at entry gate, but may be overridden)

| Env Var | Where Read | Notes |
|---------|-----------|-------|
| `MIN_TRADE_CONFIDENCE` | TradingLoop.js:133 | Entry gate works, but RSI exitContract has `minConfidence: 0.60` that overrides |

### GHOST (Never read by trading code)

| Env Var | Only Referenced In |
|---------|-------------------|
| `TRAILING_STOP_ENABLED` | tools/parallel-backtest.js (preset only) |
| `REGIME_FILTER_ENABLED` | tools/parallel-backtest.js (preset only) |
| `REGIME_ALLOW_TRENDING` | tools/parallel-backtest.js (preset only) |
| `REGIME_ALLOW_RANGING` | tools/parallel-backtest.js (preset only) |
| `REGIME_ALLOW_VOLATILE` | tools/parallel-backtest.js (preset only) |
| `REGIME_ALLOW_QUIET` | tools/parallel-backtest.js (preset only) |

## Why Exit Contracts Override Env Vars

Each strategy has a LOCKED exit contract in `TradingConfig.js` (lines 247+):

```javascript
exitContracts: {
    RSI: {
      stopLossPercent: -0.8,    // LOCKED - validated SL
      takeProfitPercent: 1.0,   // LOCKED - validated TP
      minConfidence: 0.60,      // LOCKED - 60% gate
      _validated: '2026-03-20',
    },
    EMASMACrossover: {
      stopLossPercent: -0.5,    // LOCKED - validated SL
      takeProfitPercent: 1.0,   // LOCKED - validated TP
      _validated: '2026-03-20',
    },
    // ... etc for all strategies
}
```

`ExitContractManager.getDefaultContract()` returns these locked values, ignoring the global defaults set by env vars.

## Two Optimization Loops

This audit reveals two separate optimization paths:

### 1. Environmental Sweep (Fast, Automated)
- Uses `parallel-backtest.js --real`
- Varies: ATR filter, position sizing, profit tiers, risk bypasses
- Result: Find optimal environment for current strategy mix
- When: Any time, cheap to run

### 2. Exit Contract Tuning (Slow, Manual)
- Requires unlocking contracts in `TradingConfig.js`
- Walk-forward validation per strategy
- Re-lock after validation
- When: Deliberate strategy improvement, not casual sweeps

## Cleanup Done (2026-04-07)

1. Deleted presets using IGNORED vars: `wide-stops`, `tight-stops`, `trailing`, `regime`
2. Deleted presets using GHOST vars: `trailing`, `regime`
3. Deleted gauntlets using IGNORED vars: `gauntlet-confidence`, `gauntlet-exits`
4. Added `--real` sweep with only HONORED vars
5. Made `--quick` an alias to `--real`
6. Updated `--full` to only include HONORED sweeps

## Verification

Run this to confirm an env var is actually used:

```bash
grep -rn "ENV_VAR_NAME" --include="*.js" core/ modules/ | grep -v ".bak"
```

If it only appears in TradingConfig.js (storing) but never in core modules (using), it's likely IGNORED.
