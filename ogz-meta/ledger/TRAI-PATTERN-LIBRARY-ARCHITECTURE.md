# TRAI Pattern Library Architecture
## Multiple Libraries for Multiple Purposes

---

## The Problem

Right now UnifiedPatternMemory stores everything in one flat bucket.
A hammer at support and a head-and-shoulders top get the same treatment:
just a 9-element feature vector with a win rate.

But they serve completely different purposes in the trading decision.

---

## The Solution: Categorized Pattern Libraries

### Library 1: ENTRY PATTERNS
**Purpose:** Trigger new trades
**Examples:** hammer at support, bullish engulfing after sweep, RSI extreme + divergence, morning star
**What gets stored:**
- Pattern name + type (single candle, multi candle, structural)
- Entry direction (long/short)
- Regime context (trending_up, ranging, trending_down)
- Indicator context (RSI level, ATR%, volume)
- Timeframe detected on
- Outcome: PnL, hold time, max favorable excursion (MFE), max adverse excursion (MAE)
- Win rate, expectancy, sample count

**How TRAI uses it:**
"Should I enter this trade? Similar entry patterns in this regime have 68% WR and +1.3R expectancy over 42 trades."

### Library 2: EXIT PATTERNS
**Purpose:** Signal when to close positions
**Examples:** evening star at resistance, bearish engulfing after extended run, shooting star at new high
**What gets stored:**
- Pattern name + type
- Exit quality: did exiting here produce better PnL than holding?
- How much profit was left on the table vs how much drawdown was avoided
- Regime context at exit time
- Comparison: exit-here PnL vs hold-to-stop PnL vs hold-to-target PnL

**How TRAI uses it:**
"This exit pattern appeared. Historical data shows exiting here saves 1.2% average vs holding. Override trailing stop and exit now."

### Library 3: REGIME PATTERNS
**Purpose:** Set overall aggression level
**Examples:** compression before breakout, volatility expansion cycle, accumulation/distribution
**What gets stored:**
- Regime type and transition (ranging→trending, trending→ranging)
- Duration of regime
- Best strategy performance per regime
- Best position sizing per regime
- Best exit parameters per regime

**How TRAI uses it:**
"Market just shifted from ranging to trending_up. In this regime, RSI entries with 7% sizing and 1.5% trailing produced best results historically."

### Library 4: CONTINUATION PATTERNS
**Purpose:** Add to winning positions or hold through pullbacks
**Examples:** bull flag in uptrend, ascending triangle mid-rally, pullback to EMA in trend
**What gets stored:**
- Pattern name
- How often continuation follows vs reversal
- Optimal add-to-position size
- Average continuation distance after pattern
- Context: trend strength, volume confirmation

**How TRAI uses it:**
"Already long. Bull flag detected. 73% of the time this continues 1.5% higher. Add 50% to position."

### Library 5: REVERSAL PATTERNS
**Purpose:** Signal direction changes, trigger shorts or close longs
**Examples:** head and shoulders, double top, triple bottom, divergence
**What gets stored:**
- Pattern name + confirmation criteria
- How often reversal actually follows
- Average reversal magnitude
- False signal rate
- Best entry timing (immediate vs wait for confirmation)

**How TRAI uses it:**
"Head and shoulders detected with neckline break. 61% reversal rate historically. Close long, open short at 60% confidence."

---

## Implementation

### UnifiedPatternMemory Changes

Add a `category` field to every pattern record:

```javascript
_createPattern(signature, features) {
  return {
    signature,
    features: [...features],
    category: 'unknown',  // entry | exit | regime | continuation | reversal
    patternName: null,     // hammer, engulfing, head_shoulders, etc.
    direction: null,       // buy | sell | neutral
    regime: null,          // trending_up | trending_down | ranging
    timeframe: null,       // 1m | 5m | 15m | 1h | 4h
    ticker: null,          // TSLA | NVDA | SPY | BTC-USD
    // ... existing fields ...
  };
}
```

### Query Methods

```javascript
// Get entry patterns for current conditions
getEntryConfidence(features, regime, timeframe) {
  return this._queryByCategory('entry', features, regime, timeframe);
}

// Get exit signal for current position
getExitSignal(features, regime, positionDirection) {
  return this._queryByCategory('exit', features, regime);
}

// Get regime-optimal config
getRegimeConfig(regime, ticker) {
  return this._queryByCategory('regime', null, regime);
}

// Should we add to position?
getContinuationSignal(features, regime, positionDirection) {
  return this._queryByCategory('continuation', features, regime);
}

// Is reversal likely?
getReversalSignal(features, regime) {
  return this._queryByCategory('reversal', features, regime);
}
```

### How CandlePatternDetector Feeds the Libraries

CandlePatternDetector already classifies patterns. Wire it:

```javascript
// In CandleProcessor or TradingLoop, after detection:
const patterns = candlePatternDetector.detect(candles, indicators);

for (const pattern of patterns) {
  const category = classifyPattern(pattern);
  // hammer, engulfing, morning_star → 'entry'
  // evening_star, shooting_star → 'exit'  
  // flag, pennant, triangle → 'continuation'
  // head_shoulders, double_top → 'reversal'
  
  unifiedPatternMemory.recordObservation(features, {
    category,
    patternName: pattern.name,
    direction: pattern.direction,
    regime: currentRegime,
    timeframe: candleTimeframe,
    ticker: tradingPair,
  });
}
```

### Premium Pattern Packs

Each pack is a JSON file with categorized patterns:

```json
{
  "pack": "TSLA-Momentum-v1",
  "ticker": "TSLA",
  "generated": "2026-03-19",
  "dataRange": "2024-03-19 to 2026-03-19",
  "totalPatterns": 847,
  "categories": {
    "entry": {
      "count": 312,
      "promoted": 89,
      "avgWinRate": 0.64,
      "avgExpectancy": 1.3
    },
    "exit": {
      "count": 198,
      "promoted": 52
    },
    "regime": {
      "count": 45,
      "configs": {
        "trending_up": { "bestSL": 1.5, "bestTP": 2.0, "bestSizing": 0.07 },
        "ranging": { "bestSL": 0.8, "bestTP": 1.0, "bestSizing": 0.03 },
        "trending_down": { "bestSL": 1.0, "bestTP": 1.5, "bestSizing": 0.05 }
      }
    },
    "continuation": {
      "count": 178,
      "promoted": 41
    },
    "reversal": {
      "count": 114,
      "promoted": 28
    }
  },
  "patterns": { ... }
}
```

---

## Timeframe-Aware Exits (Already Configured, Not Wired)

TradingConfig.js already has this:

```javascript
timeframeConfig: {
  '1m':  { trailPct: 0.003, maxHoldMin: 15,   slPct: 0.005, tpPct: 0.008 },
  '5m':  { trailPct: 0.006, maxHoldMin: 60,   slPct: 0.010, tpPct: 0.018 },
  '15m': { trailPct: 0.010, maxHoldMin: 120,  slPct: 0.015, tpPct: 0.025 },
  '1h':  { trailPct: 0.020, maxHoldMin: 480,  slPct: 0.025, tpPct: 0.045 },
  '4h':  { trailPct: 0.030, maxHoldMin: 1440, slPct: 0.035, tpPct: 0.070 },
}
```

Wire it into ExitContractManager:
```javascript
const tfConfig = TradingConfig.getTimeframeConfig(trade.timeframe || '15m');
// Use tfConfig.slPct instead of global STOP_LOSS_PERCENT
// Use tfConfig.tpPct instead of global TAKE_PROFIT_PERCENT
```

This means a 1h trade gets 2.5% SL and 4.5% TP, while a 15m trade gets 1.5% SL and 2.5% TP.
Automatic. Per trade. Based on timeframe.

---

## Priority Order

1. Add category + metadata fields to UnifiedPatternMemory
2. Wire CandlePatternDetector to generate real entry signals (not just 10% hold)
3. Wire timeframe-specific exits in ExitContractManager
4. Build pattern pack export tool
5. Add category-aware query methods to UnifiedPatternMemory
6. Wire TRAI to use categorized queries instead of flat getConfidence()
