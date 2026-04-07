# OGZPrime Baseline Matrix

**Date**: 2026-04-07
**Commit**: 2e6eb3d
**Branch**: tradingloop-clean-rewrite
**Data**: tuning/tsla-15m-18mo.json (all presets use same file)

## Results

| Preset | Strategy | Final Balance | P&L | Return |
|--------|----------|---------------|-----|--------|
| baseline | RSI+EMA | $9,497.53 | -$502.47 | -5.02% |
| sms | SmartMoneySweep | $9,498.56 | -$501.44 | -5.01% |
| rsi-only | RSI | $9,706.05 | -$293.95 | -2.94% |
| ema-only | EMA | $9,498.54 | -$501.46 | -5.01% |

## ENV Fingerprint

```
SOLO_STRATEGY=<per preset>
EXECUTION_MODE=backtest
CANDLE_SOURCE=file
CANDLE_DATA_FILE=tuning/tsla-15m-18mo.json
BACKTEST_MODE=true
BACKTEST_FAST=true
BACKTEST_NO_PATTERN_SAVE=true
FEE_MAKER=0
FEE_TAKER=0
ENABLE_TRAI=false
ACCOUNT_DRAWDOWN_BYPASS=true
DIRECTION_FILTER=both
ENABLE_SHORTS=true
ENABLE_SMS=true (sms preset only)
SMS_VP_RTH_ONLY=true (sms preset only)
```

## Notes

- All strategies are currently losing money on this 18-month TSLA dataset
- RSI-only performs best with -2.94% loss
- EMA and SMS perform similarly at ~-5.01%
- Combined RSI+EMA does not improve over individual strategies

## Report Files

- baseline: backtest-report-v14MERGED-1775529782324.json
- sms: backtest-report-v14MERGED-1775529784060.json
- rsi-only: backtest-report-v14MERGED-1775529804391.json
- ema-only: backtest-report-v14MERGED-1775529821938.json

## Next Steps

Target: ~15% profit, sub-5% DD for Apex evaluation criteria
