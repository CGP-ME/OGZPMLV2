# Multi-Timeframe Adapter - Integration Guide

## What Was Wrong

Your bot was running on **1-minute data only**. The `TimeframeManager` had definitions for every timeframe from 1s to 1M, but the `updateHigherTimeframes()` and `backfillTimeframe()` methods were stubs — comments saying "Would implement aggregation logic here."

Your Polygon WebSocket subscribes to:
- `XT.X:BTC-USD` (individual trades/ticks)
- `XA.X:BTC-USD` (1-minute aggregate bars)

That's it. Every RSI, MACD, trend, and pattern analysis was calculated on 1-minute noise with zero higher-timeframe context.

## What This Fixes

The `MultiTimeframeAdapter` gives your bot vision across **all timeframes**:

| Timeframe | Source | What It Tells You |
|-----------|--------|-------------------|
| 1m | WebSocket (existing) | Scalp entries/exits, micro momentum |
| 5m | Aggregated from 1m | Short-term trend, noise filtering |
| 15m | Aggregated from 5m | Intraday trend direction |
| 30m | Aggregated from 5m | Swing context |
| 1h | Polygon REST + aggregated | Key trend timeframe |
| 4h | Aggregated from 1h | Institutional timeframe |
| 1d | Polygon REST | The big picture trend |
| 5d | Aggregated from 1d | Weekly trend |
| 1M | Aggregated from 1d | Monthly macro trend |
| 3M | Aggregated from 1M | Quarterly macro |
| 6M | Aggregated from 1M | Semi-annual macro |
| YTD | Calculated from 1d | Year-to-date performance context |
| ALL | Calculated from 1d | All available historical context |

## Files

- `MultiTimeframeAdapter.js` — The core module (self-contained, no external indicator deps)
- `mtf-integration-hook.js` — Integration helpers for your existing bot

## Integration Steps

### Step 1: Copy Files to Your Bot Directory

```bash
cp MultiTimeframeAdapter.js /path/to/your/bot/
cp mtf-integration-hook.js /path/to/your/bot/
```

### Step 2: Add to Your Main Bot Constructor

In your main bot file (e.g., `ogzprime_ssl_server_advanced.js` or wherever your bot class lives):

```javascript
const { initMultiTimeframe, enhanceTradeDecision } = require('./mtf-integration-hook');

// In constructor or init method:
async initializeBot() {
  // ... your existing init code ...

  // ADD THIS - Initialize multi-timeframe system
  console.log('🕐 Initializing Multi-Timeframe Analysis...');
  this.mtf = await initMultiTimeframe({
    polygonApiKey: process.env.POLYGON_API_KEY,
    ticker: 'X:BTCUSD',
    backfillDays: 365,       // 1 year of daily data
    apiCallDelayMs: 13000,   // Polygon free tier rate limit
  });
}
```

### Step 3: Feed 1-Minute Candles

In your existing candle/tick handler (wherever you process Polygon data):

```javascript
// When a 1m candle closes (in your WebSocket handler or trading cycle):
handleAggregateMessage(msg) {
  // ... your existing candle processing ...

  const candle = {
    timestamp: msg.s || Date.now(),
    open: parseFloat(msg.o),
    high: parseFloat(msg.h),
    low: parseFloat(msg.l),
    close: parseFloat(msg.c),
    volume: parseFloat(msg.v || 0),
  };

  // ADD THIS - Feed to multi-timeframe adapter
  if (this.mtf) {
    this.mtf.ingestCandle(candle);
  }
}
```

### Step 4: Use MTF in Trade Decisions

In your `performTradingCycle()` or `analyzePatterns()`:

```javascript
async performTradingCycle() {
  // ... your existing analysis code that produces a signal ...

  // BEFORE executing a trade, check MTF confluence:
  if (this.mtf && proposedSignal) {
    const mtfDecision = enhanceTradeDecision(
      this.mtf,
      { confidence: signalConfidence },
      proposedSignal.direction  // 'buy' or 'sell'
    );

    console.log(`📊 MTF Check: ${mtfDecision.mtfApproved ? '✅' : '❌'} | ` +
      `Confidence: ${(mtfDecision.originalConfidence * 100).toFixed(0)}% → ${(mtfDecision.adjustedConfidence * 100).toFixed(0)}%`);
    
    for (const reason of mtfDecision.reasons) {
      console.log(`   ${reason}`);
    }

    if (!mtfDecision.shouldProceed) {
      console.log('⏸️ MTF says WAIT - skipping trade');
      return;
    }

    // Use the adjusted confidence for position sizing
    signalConfidence = mtfDecision.adjustedConfidence;
  }

  // ... continue with trade execution ...
}
```

### Step 5: Dashboard Data (Optional)

For your frontend dashboard at ogzprime.com:

```javascript
// Add to your WebSocket broadcast data:
const mtfStatus = this.mtf ? this.mtf.getStatus() : null;

broadcastData = {
  ...broadcastData,
  multiTimeframe: mtfStatus ? {
    confluence: mtfStatus.confluence,
    ytd: mtfStatus.ytd,
    allTime: mtfStatus.allTime,
    candleCounts: mtfStatus.candleCounts,
    readyTimeframes: mtfStatus.readyTimeframes,
  } : null,
};
```

## How It Works

### Real-Time Aggregation
Every time a 1m candle closes, the adapter automatically builds candles for 5m, 15m, 30m, 1h, 4h. No extra API calls needed — it's pure math from the data you already have.

### Historical Backfill
On startup, it fetches historical data from Polygon REST API:
- 1 year of daily candles → feeds 1d, 5d, 1M, 3M, 6M
- 30 days of hourly → feeds 1h, 4h
- 7 days of 5-minute → feeds 5m, 15m, 30m
- 2 days of 1-minute → immediate scalping context

### Confluence Scoring
Higher timeframes get more weight (1h and 4h dominate). The system checks:
- RSI across all timeframes (are they agreeing?)
- Trend direction (are MA crossovers aligned?)
- MACD momentum (same direction everywhere?)
- Bollinger band position (near extremes?)

Result: A score from -1 (full bearish) to +1 (full bullish) with a confidence level.

### Trade Enhancement
Before any trade executes, the `enhanceTradeDecision()` function:
- Boosts confidence when MTF agrees with the proposed trade
- Cuts confidence when trading against higher timeframe trends
- Checks if price is near YTD extremes
- Returns a clear shouldProceed yes/no

## Architecture Notes

This is a **pure add-on module**. It:
- Does NOT modify any existing files
- Does NOT replace the existing TimeframeManager
- Has its own indicator calculations (no dependency on OptimizedIndicators)
- Emits events your existing code can listen to
- Can be turned off by simply not calling `ingestCandle()`

## Polygon API Considerations

- **Free tier**: 5 calls/minute. The backfill uses 13-second delays between calls. Initial backfill takes ~1 minute.
- **Paid tier**: Set `apiCallDelayMs: 200` for much faster backfill.
- Historical data is only fetched on startup. After that, everything is aggregated from the WebSocket feed in real-time.
