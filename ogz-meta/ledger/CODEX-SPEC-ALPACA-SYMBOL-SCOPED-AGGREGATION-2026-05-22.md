# CODEX SPEC: Alpaca Symbol-Scoped Active Timeframe Aggregation

## Root Cause

The first Alpaca active-timeframe ingestion patch correctly refused to relabel
1-minute Alpaca bars as 15-minute bars, but its aggregation source still read
from `this.timeframeHistories[sourceTimeframe]`. That array is global to the
runner and not keyed by symbol. The patch guarded by refusing aggregation when
more than one `SymbolTradingContext` exists, which prevents contamination but
also means multi-symbol or SessionRouter mode cannot derive active candles.

The safe completion is to keep dashboard/global timeframe history intact for
existing consumers, but add a symbol-scoped timeframe history used only by
active-timeframe aggregation. Aggregation then reads `symbol + sourceTimeframe`
instead of global `sourceTimeframe`, removing the contamination mechanism.

### Fix 1: Fixed active-timeframe aggregation source history

**Status:** NOT FIXED

#### File 1: `run-empire-v2.js`

**Line:** ~949

**str_replace target:**
```js
    this.timeframeHistories = {
      '1m': [],   // same as priceHistory
      '5m': [],
      '15m': [],
      '30m': [],
      '1h': [],
      '4h': [],   // CHANGE 2026-01-29: Added missing 4H timeframe
      '1d': []
    };
    this.dashboardTimeframe = '1m';  // Track what timeframe dashboard wants
```

**str_replace replacement:**
```js
    this.timeframeHistories = {
      '1m': [],   // same as priceHistory
      '5m': [],
      '15m': [],
      '30m': [],
      '1h': [],
      '4h': [],   // CHANGE 2026-01-29: Added missing 4H timeframe
      '1d': []
    };
    this.symbolTimeframeHistories = new Map();
    this.dashboardTimeframe = '1m';  // Track what timeframe dashboard wants
```

**str_replace target:**
```js
        const storedCandle = this.storeTimeframeCandle(tf, ohlcData);
        if (tf === activeTf) {
```

**str_replace replacement:**
```js
        const storedCandle = this.storeTimeframeCandle(tf, ohlcData);
        this.storeSymbolTimeframeCandle(sym, tf, ohlcData);
        if (tf === activeTf) {
```

**str_replace target:**
```js
          // Store in timeframe-specific history for dashboard
          const storedCandle = this.storeTimeframeCandle(timeframe, ohlcData);

          // Feed only the active trading timeframe to indicators + strategy context.
```

**str_replace replacement:**
```js
          // Store in timeframe-specific history for dashboard
          const storedCandle = this.storeTimeframeCandle(timeframe, ohlcData);
          this.storeSymbolTimeframeCandle(ohlcSymbol, timeframe, ohlcData);

          // Feed only the active trading timeframe to indicators + strategy context.
```

**str_replace target:**
```js

  _feedAggregatedActiveCandle({ symbol, sourceTimeframe, activeTimeframe, sourceLabel }) {
```

**str_replace replacement:**
```js

  storeSymbolTimeframeCandle(symbol, timeframe, ohlcData) {
    const canonicalSymbol = normalizeRuntimeSymbol(symbol);
    if (!canonicalSymbol) return { isNewCandle: false, candle: null };

    if (!this.symbolTimeframeHistories) {
      this.symbolTimeframeHistories = new Map();
    }
    if (!this.symbolTimeframeHistories.has(canonicalSymbol)) {
      this.symbolTimeframeHistories.set(canonicalSymbol, new Map());
    }

    const byTimeframe = this.symbolTimeframeHistories.get(canonicalSymbol);
    if (!byTimeframe.has(timeframe)) {
      byTimeframe.set(timeframe, []);
    }

    if (!Array.isArray(ohlcData) || ohlcData.length < 8) {
      return { isNewCandle: false, candle: null };
    }

    const [time, etime, open, high, low, close, vwap, volume] = ohlcData;
    const candle = {
      t: parseFloat(time) * 1000,
      etime: parseFloat(etime) * 1000,
      o: parseFloat(open),
      h: parseFloat(high),
      l: parseFloat(low),
      c: parseFloat(close),
      v: parseFloat(volume)
    };

    const history = byTimeframe.get(timeframe);
    const lastCandle = history[history.length - 1];
    let isNewCandle = false;

    if (lastCandle && lastCandle.etime === candle.etime) {
      history[history.length - 1] = candle;
    } else {
      isNewCandle = true;
      history.push(candle);
      if (history.length > 200) {
        byTimeframe.set(timeframe, history.slice(-200));
      }
    }

    return { isNewCandle, candle };
  }

  getSymbolTimeframeCandles(symbol, timeframe) {
    const canonicalSymbol = normalizeRuntimeSymbol(symbol);
    if (!canonicalSymbol || !this.symbolTimeframeHistories) return [];
    return this.symbolTimeframeHistories.get(canonicalSymbol)?.get(timeframe) || [];
  }

  _feedAggregatedActiveCandle({ symbol, sourceTimeframe, activeTimeframe, sourceLabel }) {
```

**str_replace target:**
```js
    if (this.symbolContexts && this.symbolContexts.size > 1) {
      const guardKey = `${sourceTimeframe}:${activeTimeframe}`;
      this._visAggregateRefusals ??= new Set();
      if (!this._visAggregateRefusals.has(guardKey)) {
        this._visAggregateRefusals.add(guardKey);
        console.error(`[VIS][OHLC][Aggregate] refusing ${sourceTimeframe}->${activeTimeframe} aggregation for ${symbol}: timeframeHistories are not symbol-scoped; contexts=${describeSymbolContexts(this.symbolContexts)}`);
      }
      return null;
    }

    const sourceHistory = this.timeframeHistories[sourceTimeframe] || [];
```

**str_replace replacement:**
```js
    const sourceHistory = this.getSymbolTimeframeCandles(symbol, sourceTimeframe);
```

**str_replace target:**
```js
    const storedCandle = this.storeTimeframeCandle(activeTimeframe, activeOhlc);
    this.handleMarketData({ data: activeOhlc, symbol, timeframe: activeTimeframe });
```

**str_replace replacement:**
```js
    const storedCandle = this.storeTimeframeCandle(activeTimeframe, activeOhlc);
    this.storeSymbolTimeframeCandle(symbol, activeTimeframe, activeOhlc);
    this.handleMarketData({ data: activeOhlc, symbol, timeframe: activeTimeframe });
```

## Verification

- `node --check run-empire-v2.js`
- Focused symbol-scoping check: source aggregation reads
  `getSymbolTimeframeCandles(symbol, sourceTimeframe)`, not global
  `timeframeHistories[sourceTimeframe]`.
- Mercury re-attack the same file and specifically ask whether the prior
  mixed-symbol aggregation finding remains.
- Full P0 anchor before commit because the runner hot path changed.
