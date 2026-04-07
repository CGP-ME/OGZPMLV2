# Mercury 2 Prompt: Finish the Full PineScript → JavaScript Transpiler

**OBJECTIVE**: Build a production-ready PineScript v5 transpiler for OGZPrime trading bot. Take the best pieces from existing work below and complete the implementation.

---

## WHAT WE HAVE (MERGE THE BEST PIECES)

### 1. Codex's Architecture (Clean, Production-Ready)
- `PineFeatureScanner` - Scans Pine for unsupported features, tells you upfront what needs full VM
- `PineScriptTranspiler` - Signal-mode transpiler with regex-based compilation
- `PineStrategyLoader` - File/env loader that auto-registers strategies
- `StrategyOrchestrator` integration via `_registerPineStrategies()`

### 2. Gemini's Helper Modules (Critical Infrastructure)
- `SessionTracker` - EST conversion, IVB tracking, daily loss circuit breaker
- `IndicatorCalculator` additions - Anchored VWAP with bands, CVD array, highest/lowest
- `VolumeProfile.getLVNs()` - Low Volume Node extraction
- Pine-to-JS gotcha cheat sheet (var persistence, lookback indexing, na handling)

### 3. Our Lexer/Parser/AST Runtime
- Already tokenizes SMS Pine (6,612 tokens)
- Parses variable declarations, function calls, control flow
- Needs edge case fixes for: while loops, for loops, array operations

---

## WHAT'S MISSING (THE 20%)

The SMS v4 PineScript uses these advanced features that simple regex can't handle:

1. **`while` loops** - Value area expansion algorithm
2. **`for` loops** - Volume profile bin filling, LVN detection
3. **`array.*` operations** - `array.new_float()`, `array.set()`, `array.get()`, `array.push()`, `array.copy()`, `array.sort()`, `array.clear()`, `array.size()`
4. **Persistent state with `var`** - Variables that persist across candles
5. **Series lookback `[N]`** - `close[1]`, `high[3]`, etc.
6. **User-defined functions** - `getLongSize()`, `getShortTP()`, `candleRange()`, etc.
7. **Strategy lifecycle** - `strategy.entry()`, `strategy.exit()`, `strategy.close()`, `strategy.position_size`, `strategy.position_avg_price`
8. **Session/time functions** - `time()`, `dayofweek`, session detection

---

## THE TARGET: SMS v4 PINESCRIPT

The full source is in: `/opt/ogzprime/OGZPMLV2/pinescript/SmartMoneySweep-v4.pine`

Key constructs that MUST work:

```pine
// Persistent variables
var float vpHigh = na
var float[] vpVolume = array.new_float(vpBins, 0.0)

// For loops with array operations
for i = 0 to vpBins - 1
    array.set(vpVolume, i, 0.0)

for j = 0 to vpLookback - 1
    cH = high[j]  // Series lookback
    // ... bin filling logic
    for k = sBin to eBin
        array.set(vpVolume, k, array.get(vpVolume, k) + value)

// While loops
while vaVol < vaTargetVol
    eUp = vahBin < vpBins - 1
    if eUp and (uV >= dV or not eDn)
        vahBin += 1
        vaVol += uV
    else
        break

// User-defined functions
getLongSize() =>
    hasInit = initBullMet
    longConditionsMet >= 3 and hasInit ? maxPositionPct : minPositionPct

// Strategy calls
strategy.entry("Long", strategy.long, qty=math.round(strategy.equity * (posSize / 100.0) / close, 2))
strategy.exit("Long Exit", "Long", stop=activeSL, limit=takeProfit)
```

---

## OGZPRIME INTEGRATION INTERFACE

Transpiled strategies must implement this interface:

```javascript
module.exports = {
  name: 'SmartMoneySweep',

  // Called on each candle
  evaluate(ctx) {
    // ctx.priceHistory = array of {open, high, low, close, volume, timestamp}
    // ctx.indicators = pre-computed indicators (optional)

    return {
      direction: 'buy' | 'sell' | null,
      confidence: 0.0 - 1.0,
      overrideLevels: {
        stopLoss: number,      // absolute price
        takeProfit: number,    // absolute price
        trailingStop: number   // optional
      },
      sizingMultiplier: 1.0 - 2.5,  // based on conditions met
      reason: 'SMS sweep at VAL with absorption'
    };
  }
};
```

---

## EXISTING HELPER CODE (FROM GEMINI)

### SessionTracker - For time/session handling

```javascript
class SessionTracker {
    constructor() {
        this.currentDay = -1;
        this.ivbHigh = null;
        this.ivbLow = null;
        this.ivbLocked = false;
        this.ivbBarCount = 0;
        this.dailyLosses = 0;
    }

    getESTTime(timestamp) {
        return new Date(timestamp).toLocaleString("en-US", { timeZone: "America/New_York" });
    }

    update(candle, ivbMinutesTarget = 30, timeframeMinutes = 15) {
        const estDate = new Date(this.getESTTime(candle.timestamp));
        const hours = estDate.getHours();
        const minutes = estDate.getMinutes();
        const dayOfWeek = estDate.getDay();
        const decimalTime = hours + (minutes / 60);

        if (dayOfWeek !== this.currentDay) {
            this.currentDay = dayOfWeek;
            this.ivbHigh = candle.high;
            this.ivbLow = candle.low;
            this.ivbLocked = false;
            this.ivbBarCount = 1;
            this.dailyLosses = 0;
        }

        const isCashSession = decimalTime >= 9.5 && decimalTime < 16.0;
        const isValidTradingSession = decimalTime >= 9.75 && decimalTime < 15.75;

        const ivbBarsNeeded = Math.round(ivbMinutesTarget / timeframeMinutes);
        if (isCashSession && !this.ivbLocked) {
            this.ivbBarCount++;
            if (candle.high > this.ivbHigh) this.ivbHigh = candle.high;
            if (candle.low < this.ivbLow) this.ivbLow = candle.low;
            if (this.ivbBarCount >= ivbBarsNeeded) this.ivbLocked = true;
        }

        return {
            isCashSession,
            isValidTradingSession,
            ivb: {
                locked: this.ivbLocked,
                high: this.ivbHigh,
                low: this.ivbLow,
                mid: this.ivbLocked ? (this.ivbHigh + this.ivbLow) / 2 : null
            }
        };
    }

    recordDailyLoss() { this.dailyLosses++; }
    canTrade(maxDailyLosses = 3) { return this.dailyLosses < maxDailyLosses; }
}
```

### IndicatorCalculator Additions

```javascript
// Daily Anchored VWAP (reset at session start)
static dailyAnchoredVWAP(dailyCandles) {
    if (!dailyCandles || dailyCandles.length === 0) return null;

    let cumulativePVS = 0;
    let cumulativeVol = 0;

    for (let c of dailyCandles) {
        const typicalPrice = (c.high + c.low + c.close) / 3;
        cumulativePVS += typicalPrice * c.volume;
        cumulativeVol += c.volume;
    }

    const vwap = cumulativePVS / cumulativeVol;

    let varianceSum = 0;
    for (let c of dailyCandles) {
        const typicalPrice = (c.high + c.low + c.close) / 3;
        varianceSum += c.volume * Math.pow(typicalPrice - vwap, 2);
    }
    const stdev = Math.sqrt(varianceSum / cumulativeVol);

    return { vwap, upper: vwap + stdev, lower: vwap - stdev };
}

// Cumulative Volume Delta
static calculateCVDArray(candles) {
    let cvdArray = [];
    let runningCVD = 0;

    for (let c of candles) {
        const isBullish = c.close > c.open;
        const delta = isBullish ? c.volume : -c.volume;
        runningCVD += delta;
        cvdArray.push(runningCVD);
    }
    return cvdArray;
}

// Pine's ta.highest and ta.lowest
static highest(seriesArray, lookback) {
    const slice = seriesArray.slice(-lookback);
    return Math.max(...slice);
}

static lowest(seriesArray, lookback) {
    const slice = seriesArray.slice(-lookback);
    return Math.min(...slice);
}
```

### VolumeProfile LVN Extraction

```javascript
getLVNs(vpBins, percentile = 20) {
    const volumes = vpBins.map(bin => bin.volume).filter(v => v > 0);
    volumes.sort((a, b) => a - b);

    const pIndex = Math.max(0, Math.floor(volumes.length * (percentile / 100.0)));
    const lvnThreshold = volumes[pIndex];

    let lvnLevels = [];

    for (let bin of vpBins) {
        if (bin.volume <= lvnThreshold && bin.volume > 0) {
            if (bin.price < this.valPrice || bin.price > this.vahPrice) {
                lvnLevels.push(bin.price);
            }
        }
        if (lvnLevels.length >= 10) break;
    }

    return lvnLevels;
}
```

---

## PINE-TO-JS GOTCHA CHEAT SHEET

| Pine Script Concept | TradingView Behavior | Node.js Translation |
|---------------------|---------------------|---------------------|
| `var x = 0` | Initializes ONCE, persists across bars | Use class property `this.x = 0` in constructor |
| `x := 1` | Reassignment of persistent variable | Standard JS: `this.x = 1` |
| `close[1]` | Previous candle's close | `candles[candles.length - 2].close` |
| `close[3]` | Close 3 candles ago | `candles[candles.length - 4].close` |
| `na(x)` | Checks if "Not Available" | `x === null \|\| x === undefined \|\| Number.isNaN(x)` |
| `bar_index` | Bars since chart start | `candles.length` or counter |
| `strategy.entry(...)` | Execute trade | `return { direction: 'buy', confidence: 0.85 }` |
| `strategy.position_avg_price` | Average fill price | Fetch from StateManager |

---

## CODEX'S PINEFEATURESCANNER (USE THIS)

```javascript
class PineFeatureScanner {
  scan(source = '') {
    const text = String(source || '');
    const has = (re) => re.test(text);

    const features = {
      varDeclarations: has(/\bvar\b/),
      reassignment: has(/:=/),
      arrays: has(/\barray\./),
      loops: has(/\bfor\b\s+\w+\s*=\s*.+\bto\b|\bwhile\b/),
      functionsArrow: has(/\w+\s*\([^\)]*\)\s*=>/),
      strategyExit: has(/\bstrategy\.exit\s*\(/),
      strategyClose: has(/\bstrategy\.close\s*\(/),
      strategyState: has(/\bstrategy\.(position_size|position_avg_price|closedtrades|equity)\b/),
      sessionTime: has(/\binput\.session\b|\btime\s*\(/),
      plotsAlerts: has(/\bplot\w*\s*\(|\balertcondition\s*\(/),
      atr: has(/\bta\.atr\s*\(/),
      highest: has(/\bta\.highest\s*\(/),
      lowest: has(/\bta\.lowest\s*\(/),
      stdev: has(/\bta\.stdev\s*\(/),
      vwap: has(/\bta\.vwap\s*\(/),
    };

    const unsupportedSignalMode = [];
    if (features.arrays) unsupportedSignalMode.push('array.* operations');
    if (features.loops) unsupportedSignalMode.push('for/while loops');
    if (features.functionsArrow) unsupportedSignalMode.push('multi-step => functions');
    if (features.strategyExit || features.strategyClose || features.strategyState) {
      unsupportedSignalMode.push('strategy.* position/exit lifecycle semantics');
    }
    if (features.sessionTime) unsupportedSignalMode.push('session-aware time() semantics');

    return {
      features,
      unsupportedSignalMode,
      signalModeReady: unsupportedSignalMode.length === 0
    };
  }
}
```

---

## DELIVERABLES

1. **Full Pine Runtime** (`core/PineRuntime.js`)
   - Lexer that tokenizes Pine v5
   - Parser that builds AST
   - Executor that runs AST with series history
   - Support for: `var`, `:=`, `for`, `while`, `array.*`, lookback `[N]`, user functions

2. **TA Library** (`core/PineTALib.js`)
   - `ta.sma`, `ta.ema`, `ta.rsi`, `ta.atr`, `ta.macd`, `ta.stoch`
   - `ta.highest`, `ta.lowest`, `ta.vwap`, `ta.stdev`
   - `ta.crossover`, `ta.crossunder`
   - All operate on series arrays

3. **Strategy Bridge** (`core/PineStrategyBridge.js`)
   - Maps `strategy.entry/exit/close` to OGZPrime signals
   - Tracks `strategy.position_size`, `strategy.position_avg_price`
   - Handles `strategy.equity`, `strategy.closedtrades`

4. **CLI Tool** (`tools/pine-import.js`)
   - `node tools/pine-import.js path/to/strategy.pine`
   - Outputs ready-to-use JS module in `modules/`
   - Reports any unsupported features

5. **Integration** - Wire into StrategyOrchestrator with env-based loading

---

## SUCCESS CRITERIA

Run SMS v4 through the transpiler against 18 months of TSLA 15m data:
- **Trade count** within 5% of TradingView's 397
- **Profit factor** close to TradingView's 1.339
- **Entry/exit prices** match within slippage tolerance

---

## FILES TO REFERENCE

- **SMS v4 PineScript**: `/opt/ogzprime/OGZPMLV2/pinescript/SmartMoneySweep-v4.pine`
- **Current SMS JS module**: `/opt/ogzprime/OGZPMLV2/modules/SmartMoneySweep.js`
- **StrategyOrchestrator**: `/opt/ogzprime/OGZPMLV2/core/StrategyOrchestrator.js`
- **TradingLoop**: `/opt/ogzprime/OGZPMLV2/core/TradingLoop.js`
- **TSLA 15m data**: `/opt/ogzprime/OGZPMLV2/tuning/tsla-15m-18mo.json`
