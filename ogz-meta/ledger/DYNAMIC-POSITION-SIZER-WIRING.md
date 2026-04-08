# DynamicPositionSizer Wiring Spec

## DATE: 2026-03-20
## AUTHOR: Claude Opus (Architect) for Trey / OGZPrime
## EXECUTOR: Claude Code (Sonnet) on VPS

---

## OVERVIEW

DynamicPositionSizer (core/DynamicPositionSizer.js) replaces the inline
confidence multiplier hack in OrderExecutor.js. This doc tells Claude Code
exactly where to wire it.

---

## STEP 1: Add to module initialization

In run-empire-v2.js (or wherever modules are initialized), add:

```javascript
const DynamicPositionSizer = require('./core/DynamicPositionSizer');
const dynamicPositionSizer = new DynamicPositionSizer();

// Wire pattern memory after UnifiedPatternMemory is initialized:
const { getInstance: getUPM } = require('./core/UnifiedPatternMemory');
dynamicPositionSizer.setPatternMemory(getUPM());

// Add to ctx object passed to OrderExecutor:
ctx.dynamicPositionSizer = dynamicPositionSizer;
```

---

## STEP 2: Replace inline sizing in OrderExecutor.js

Find the block starting with:
```
let basePositionPercent = TradingConfig.get('positionSizing.maxPositionSize');
```
Through the sizing console.log.

REPLACE with:

```javascript
    // CHANGE 2026-03-20: DynamicPositionSizer replaces inline hack
    const rawConfidence = decision.confidence;
    const tradeConfidence = (rawConfidence > 1 ? rawConfidence / 100 : rawConfidence) || 0.5;
    const atrPercent = indicators?.atrPercent || (
      indicators?.atr && price > 0 ? (indicators.atr / price) * 100 : 0.30
    );
    const entryTrend = indicators?.trend;
    const trendNumeric = typeof entryTrend === 'string'
      ? (entryTrend === 'bullish' || entryTrend === 'uptrend' ? 1 :
         entryTrend === 'bearish' || entryTrend === 'downtrend' ? -1 : 0)
      : (entryTrend || 0);
    const features = [
      indicators?.rsi != null ? indicators.rsi / 100 : 0.5,
      (indicators?.macd || 0) - (indicators?.macdSignal || 0),
      trendNumeric,
      indicators?.bbWidth || 0.02,
      indicators?.volatility || 0.01,
      0.5, 0, 0, 0
    ];

    const sizing = this.ctx.dynamicPositionSizer.calculate({
      balance: currentBalance,
      confidence: tradeConfidence,
      features: features,
      atrPercent: atrPercent,
      confluenceMultiplier: orchResult?.sizingMultiplier || 1.0,
      price: price,
    });

    if (sizing.blocked) {
      console.log('[POSITION-SIZER] BLOCKED: ' + sizing.reason);
      return;
    }

    const positionSizeUSD = sizing.sizeUSD;
    const positionSizeBTC = sizing.sizeAsset;
    const basePositionPercent = sizing.sizePercent;

    console.log('[POSITION-SIZER] ' + sizing.reason);
    console.log('  Balance=$' + currentBalance.toFixed(2) +
      ' | ' + (sizing.sizePercent * 100).toFixed(1) + '%' +
      ' | $' + positionSizeUSD.toFixed(2));
```

Keep everything AFTER the sizing log unchanged. Variable names
positionSizeUSD, positionSizeBTC, basePositionPercent are preserved.

---

## STEP 3: Print stats at end of backtest

In BacktestRecorder summary section, add:
```javascript
if (ctx.dynamicPositionSizer) {
  ctx.dynamicPositionSizer.printStats();
}
```

---

## STEP 4: Verify

1. Run backtest - results should be similar (equivalent logic)
2. Check logs for [POSITION-SIZER] entries
3. End-of-backtest summary should show DYNAMIC POSITION SIZER stats
4. No quarantine blocks unless pattern memory has quarantined entries
