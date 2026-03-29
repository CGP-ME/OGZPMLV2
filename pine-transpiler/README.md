# Pine Script v5 Transpiler

Converts TradingView Pine Script v5 strategies to JavaScript modules compatible with OGZPrime.

## Structure

```
pine-transpiler/
├── core/
│   ├── PineFeatureScanner.js  # Static analysis - detects advanced features
│   ├── PineLexer.js           # Tokenizer for Pine v5
│   ├── PineParser.js          # AST builder (var, :=, loops, functions)
│   ├── PineArray.js           # array.* API wrapper
│   ├── PineTALib.js           # TA functions (sma, ema, rsi, atr, etc.)
│   ├── PineRuntime.js         # AST executor with series history
│   └── PineStrategyBridge.js  # Maps strategy.* to OGZPrime signals
├── helpers/
│   └── SessionTracker.js      # EST conversion, IVB tracking, daily loss
├── tools/
│   └── pine-import.js         # CLI transpiler tool
└── modules/                   # Output directory for transpiled strategies
```

## Usage

### 1. Transpile a Pine Script

```bash
node pine-transpiler/tools/pine-import.js path/to/strategy.pine
```

This creates `pine-transpiler/modules/<strategy-name>.js`

### 2. Use in OGZPrime

```javascript
const strategy = require('./pine-transpiler/modules/MyStrategy');

const signal = strategy.evaluate({
  priceHistory: candles  // array of {open, high, low, close, volume, timestamp}
});

// signal = {
//   direction: 'buy' | 'sell' | null,
//   confidence: 0-1,
//   overrideLevels: { stopLoss, takeProfit },
//   sizingMultiplier: 1-2.5,
//   reason: 'Pine Long entry'
// }
```

## Supported Pine Features

- `var` - Persistent variables across candles
- `:=` - Reassignment
- `for i = 0 to N` - For loops
- `while` - While loops
- `array.*` - new_float, get, set, push, clear, copy, sort
- `ta.*` - sma, ema, rsi, atr, highest, lowest, stdev, vwap, crossover, crossunder
- `close[N]` - Series lookback
- `strategy.entry/exit/close` - Trade signals
- User-defined arrow functions

## Example: SMS v4

```bash
node pine-transpiler/tools/pine-import.js pinescript/SmartMoneySweep-v4.pine
```

## Notes

- The runtime maintains up to 500 candles of history for lookbacks
- Session tracking auto-detects US cash session (9:30-16:00 EST)
- Daily loss circuit breaker resets at session start
