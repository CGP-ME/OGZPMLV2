# OGZPrime Config Fingerprint Registry

> **Purpose:** Track every verified config state. If the fingerprint changes, the baseline changed.  
> **Tool:** `node tools/config-audit.js`  
> **Rule:** Run before every backtest sweep. Compare fingerprint. If different, investigate before running.

---

## Active Fingerprints

**STATUS 2026-04-20:** This registry is SUPERSEDED by the Phase 6 snapshot manifest (`config/snapshots/manifest.jsonl`) defined in CONFIG-CONSOLIDATION-SPEC.md. No new fingerprints will be recorded here — Phase 6 writes every process-start snapshot automatically. The rows below are preserved as historical record of pre-migration state.

Phase 0 baseline (post-this-doc) recorded at `ogz-meta/specs/baseline-phase0-2026-04-20.md` uses git SHA `c49c9ab` on branch `config/consolidation`.

| Fingerprint | Date | Description | Verified By |
|---|---|---|---|
| `4aef3ea0cf32e1bd` | 2026-03-17 | VPS production baseline — env var wiring confirmed working. Exit contracts reading from .env. | Claude Opus + config-audit.js |
| `a8eee8a7686d0b1e` | 2026-03-17 | VPS BEFORE exit contract env wiring — exit contracts were hardcoded, ignoring .env values. DO NOT USE. | Claude Opus + config-audit.js |

---

## Key Config Values (fingerprint 4aef3ea0)

### Confidence Gates
- `minTradeConfidence` = 0.50 (from .env) — TradingLoop entry gate
- `minStrategyConfidence` = 0.35 (from TradingConfig) — StrategyOrchestrator per-strategy gate

### Exit Contracts (all strategies except MarketRegime)
- SL = -1.5% (from .env STOP_LOSS_PERCENT)
- TP = 2.0% (from .env TAKE_PROFIT_PERCENT)
- Trailing = 3.5% (from .env TRAILING_STOP_PERCENT)
- Trail Activation = 2.5% (from .env TRAILING_ACTIVATION)

### MarketRegime (strategy-specific defaults)
- SL = -2.0%, TP = 2.5%, Trail = 1.0%, Trail Activation = 1.5%

### Profit Tiers
- Tier 1 = 0.7% (from .env TIER1_TARGET)
- Tier 2 = 1.0% (from .env TIER2_TARGET)
- Tier 3 = 1.5% (from .env TIER3_TARGET)
- Final = 2.5% (from .env FINAL_TARGET)

### Position Sizing
- Base = 1% (from .env BASE_POSITION_SIZE)
- Max = 5% (from .env MAX_POSITION_SIZE_PCT)
- Max Positions = 3

### Risk Management
- Risk Manager = BYPASSED (hardcoded default — not in .env)
- Account Drawdown = ACTIVE (hardcoded default — not in .env)
- Max Drawdown = 18% (from .env)
- Max Daily Loss = 10% (from .env)

### Strategies Active
- RSI, MADynamicSR, EMACrossover, LiquiditySweep, MarketRegime, MultiTimeframe, OGZTPO
- DISABLED: BreakRetest, ORB, TRAI

### Filters
- ATR Filter = DISABLED (not in .env — must set ATR_FILTER_ENABLED=true)

### Fees
- Maker = 0.25%, Taker = 0.40%, Round Trip = 0.50%

---

## March 3rd Winning Config (for reference)

```
STOP_LOSS_PERCENT=2.0
TAKE_PROFIT_PERCENT=2.5
TIER1_TARGET=0.007
TIER2_TARGET=0.010
TIER3_TARGET=0.015
MIN_TRADE_CONFIDENCE=0.50
MAX_POSITION_SIZE_PCT=0.04 (flat, no confidence multiplier)
```

Result: 289 trades, 63.7% WR, +0.73% on 45K candles.
**NOTE:** This was on pre-Mercury2 codebase. Cannot be reproduced on current code.

---

## How to Use

### Before any backtest sweep:
```bash
node tools/config-audit.js
```
Check the fingerprint matches the expected one above. If it doesn't, find out what changed before running.

### After changing .env:
```bash
node tools/config-audit.js
```
Record the new fingerprint here with what changed and why.

### After Claude Code makes changes:
```bash
node tools/config-audit.js
```
Verify fingerprint. If it changed unexpectedly, something got modified that shouldn't have been.

---

## Known Issues (from pipeline audit)

1. **76 runtime process.env reads** — should be 0. Modules read env directly instead of receiving injected config.
2. **Risk manager bypassed by default** — needs RISK_MANAGER_BYPASS=false in .env to enable.
3. **ATR filter disabled by default** — needs ATR_FILTER_ENABLED=true in .env. Best backtest config uses 0.40%.
4. **OrderExecutor uses maxPositionSize (5%) as base** — should use basePositionSize (1%). With confidence multiplier, position can reach 12.5%.
5. **Immediate re-entry after SELL** — TradingLoop re-checks for buy on same candle after closing position.
6. **RegimeDetector instantiated per candle** — should be created once.
7. **Sentry DSN hardcoded** — cannot disable via env var.
8. **nearestStructure never populated** — DynamicTrailingStop structure tightening has no data to work with.

---

## Changelog

| Date | Fingerprint | Change | Author |
|---|---|---|---|
| 2026-03-17 | a8eee8a7 → 4aef3ea0 | Exit contracts wired to env vars | Claude Code |
