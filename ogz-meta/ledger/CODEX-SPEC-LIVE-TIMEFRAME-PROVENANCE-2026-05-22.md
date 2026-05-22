# CODEX SPEC: Live Timeframe Provenance

## Root Cause

Live Kraken was subscribed from `broker.candleTimeframe`, but the runner fed
only `1m` OHLC into `CandleProcessor`, `SymbolTradingContext` read a hardcoded
`15m` CandleStore bucket, and `CandleProcessor` wrote every incoming candle
under the hardcoded `15m` key. The result was current live candle bodies being
stored and analyzed under the wrong timeframe key.

Backtests also need explicit timeframe provenance. If the runtime begins obeying
`broker.candleTimeframe`, a TSLA `15m` fixture cannot inherit a stale live
`CANDLE_TIMEFRAME=1m` from `.env` or the shell.

### Fix 1: Fixed active candle timeframe provenance

**Status:** FIXED

## Verification

- `node --check core/CandleProcessor.js`
- `node --check run-empire-v2.js`
- `node --check tools/instrument-env.js`
- `npx jest test/symbol-routing.test.js --runInBand`
- `git diff --check -- core/CandleProcessor.js run-empire-v2.js tools/instrument-env.js test/symbol-routing.test.js`
- Full P0 proof with KILL 7 adaptive trail modifiers disabled matched the existing anchor exactly: `$13213.042341608163 / 1384 trades / 60.0% WR / PF 1.72`.

The default full P0 remains `$13255.255799695915 / 1410 trades`; that movement is from commit `d49ffa6` structure-aware trailing defaults, not this timeframe provenance fix.

#### File 1: `tools/instrument-env.js`

**Line:** ~54

**str_replace target:**
```js
function extractSymbolTokens(dataFile) {
  const base = path.basename(dataFile, '.json').toLowerCase();
  const tokens = trimKnownPrefixes(base.split(/[-_]/).filter(Boolean));
  const symbolTokens = [];

  for (const token of tokens) {
    if (TIMEFRAME_TOKENS.has(token) || SUFFIX_TOKENS.has(token) || isPeriodToken(token)) {
      break;
    }
    if (!/^[a-z0-9]+$/.test(token)) {
      break;
    }
    symbolTokens.push(token);
  }

  if (symbolTokens.length === 0) {
    throw new Error(`[SYMBOL-MISLABEL-FIX] Cannot derive ticker from data file: ${dataFile}`);
  }

  return symbolTokens;
}

function resolveInstrumentFromDataFile(dataFile) {
  const symbolTokens = extractSymbolTokens(dataFile);
  const baseTicker = symbolTokens[0];
  const lastToken = symbolTokens[symbolTokens.length - 1];
  const hasQuoteToken = symbolTokens.length > 1 && QUOTE_TOKENS.has(lastToken);
  const normalizedPair = symbolTokens.map(t => t.toUpperCase()).join('-');
  const lowerPath = String(dataFile).toLowerCase();
  const cryptoBySource = lowerPath.includes('kraken') || lowerPath.includes('coinbase') || lowerPath.includes('binance');
  const cryptoByBase = configuredCryptoBases().has(baseTicker);
  const isCrypto = hasQuoteToken || cryptoBySource || cryptoByBase;

  if (isCrypto) {
    return {
      TRADING_PAIR: hasQuoteToken ? normalizedPair : `${baseTicker.toUpperCase()}-USD`,
      BROKER: 'kraken',
      ASSET_CLASS: 'crypto',
    };
  }

  return {
    TRADING_PAIR: baseTicker.toUpperCase(),
    BROKER: 'alpaca',
    ASSET_CLASS: 'stocks',
  };
}

module.exports = {
  extractSymbolTokens,
  resolveInstrumentFromDataFile,
};
```

**str_replace replacement:**
```js
function extractSymbolTokens(dataFile) {
  const base = path.basename(dataFile, '.json').toLowerCase();
  const tokens = trimKnownPrefixes(base.split(/[-_]/).filter(Boolean));
  const symbolTokens = [];

  for (const token of tokens) {
    if (TIMEFRAME_TOKENS.has(token) || SUFFIX_TOKENS.has(token) || isPeriodToken(token)) {
      break;
    }
    if (!/^[a-z0-9]+$/.test(token)) {
      break;
    }
    symbolTokens.push(token);
  }

  if (symbolTokens.length === 0) {
    throw new Error(`[SYMBOL-MISLABEL-FIX] Cannot derive ticker from data file: ${dataFile}`);
  }

  return symbolTokens;
}

function extractTimeframeToken(dataFile) {
  const base = path.basename(dataFile, '.json').toLowerCase();
  const tokens = base.split(/[-_]/).filter(Boolean);
  return tokens.find(token => TIMEFRAME_TOKENS.has(token)) || null;
}

function resolveInstrumentFromDataFile(dataFile) {
  const symbolTokens = extractSymbolTokens(dataFile);
  const timeframe = extractTimeframeToken(dataFile);
  const baseTicker = symbolTokens[0];
  const lastToken = symbolTokens[symbolTokens.length - 1];
  const hasQuoteToken = symbolTokens.length > 1 && QUOTE_TOKENS.has(lastToken);
  const normalizedPair = symbolTokens.map(t => t.toUpperCase()).join('-');
  const lowerPath = String(dataFile).toLowerCase();
  const cryptoBySource = lowerPath.includes('kraken') || lowerPath.includes('coinbase') || lowerPath.includes('binance');
  const cryptoByBase = configuredCryptoBases().has(baseTicker);
  const isCrypto = hasQuoteToken || cryptoBySource || cryptoByBase;

  const env = isCrypto ? {
    TRADING_PAIR: hasQuoteToken ? normalizedPair : `${baseTicker.toUpperCase()}-USD`,
    BROKER: 'kraken',
    ASSET_CLASS: 'crypto',
  } : {
    TRADING_PAIR: baseTicker.toUpperCase(),
    BROKER: 'alpaca',
    ASSET_CLASS: 'stocks',
  };

  if (timeframe) {
    env.CANDLE_TIMEFRAME = timeframe;
  }

  return env;
}

module.exports = {
  extractSymbolTokens,
  extractTimeframeToken,
  resolveInstrumentFromDataFile,
};
```

#### File 2: `run-empire-v2.js`

**Line:** ~806

**str_replace target:**
```js
    this.priceHistory = [];  // 1m candles for trading logic
    this.tradingPair = normalizeRuntimeSymbol(resolvedConfig.config.broker.tradingPair);
    if (!this.tradingPair) {
      throw new Error('[BOOT][SymbolContexts] broker.tradingPair missing/invalid — refusing to start without canonical symbol');
    }
```

**str_replace replacement:**
```js
    this.priceHistory = [];
    this.tradingPair = normalizeRuntimeSymbol(resolvedConfig.config.broker.tradingPair);
    if (!this.tradingPair) {
      throw new Error('[BOOT][SymbolContexts] broker.tradingPair missing/invalid — refusing to start without canonical symbol');
    }
    const configuredCandleTimeframe = resolvedConfig.config.broker.candleTimeframe;
    if (typeof configuredCandleTimeframe !== 'string' || !configuredCandleTimeframe.trim()) {
      throw new Error(`[BOOT][Timeframe] broker.candleTimeframe missing/invalid (${configuredCandleTimeframe}) - refusing to start without a real candle timeframe`);
    }
    this.candleTimeframe = configuredCandleTimeframe.trim();
```

**str_replace target:**
```js
    // CHANGE 2026-02-21: Adaptive timeframe selection based on market conditions
    this.timeframeSelector = new AdaptiveTimeframeSelector({
      mtfAdapter: this.mtfAdapter,
      feePercent: 0.26,                            // Kraken maker/taker fee per side
      allowedTimeframes: ['5m', '15m', '30m', '1h'], // Don't scalp 1m, don't swing 4h+
      defaultTimeframe: '15m',
      minSwitchIntervalMs: 5 * 60 * 1000,          // 5 min minimum between switches
    });
```

**str_replace replacement:**
```js
    // CHANGE 2026-02-21: Adaptive timeframe selection based on market conditions
    // Runtime analysis is pinned to broker.candleTimeframe until SymbolTradingContext
    // and CandleStore support active multi-timeframe context swaps.
    this.timeframeSelector = new AdaptiveTimeframeSelector({
      mtfAdapter: this.mtfAdapter,
      feePercent: 0.26,                            // Kraken maker/taker fee per side
      allowedTimeframes: [this.candleTimeframe],
      defaultTimeframe: this.candleTimeframe,
      minSwitchIntervalMs: 5 * 60 * 1000,          // 5 min minimum between switches
    });
```

**str_replace target:**
```js
    // Timeframe '15m' matches the runtime addCandle contract at
    // CandleProcessor.js:107 where every new candle is keyed under '15m'
    // in this._candleStore. (loadCandleHistory at line ~1146 uses '1m' but
    // is GATED OFF in backtest mode by the guard at line 771; the runtime
    // bucket is '15m'.) If the addCandle key changes (e.g., to
    // broker.candleTimeframe), this and CandleProcessor must update together.
    // The '1m'/'15m' mismatch in load-vs-runtime paths is a separate CC-A
    // concern; CC-C uses '15m' to align with the live runtime path.
```

**str_replace replacement:**
```js
    // SymbolTradingContext must read the same timeframe CandleProcessor writes.
    // broker.candleTimeframe is the single active timeframe until active
    // multi-timeframe context swaps are implemented.
```

**str_replace target:**
```js
      const timeframe = '15m';
```

**str_replace replacement:**
```js
      const timeframe = this.candleTimeframe;
```

**str_replace target:**
```js
        const activeTf = (this.timeframeSelector && this.timeframeSelector.currentTimeframe) || '15m';
```

**str_replace replacement:**
```js
        const activeTf = (this.timeframeSelector && this.timeframeSelector.currentTimeframe) || this.candleTimeframe;
```

**str_replace target:**
```js
        const storedCandle = this.storeTimeframeCandle(tf, ohlcData);
        if (tf === '1m') this.handleMarketData({ data: ohlcData, symbol: sym, timeframe: tf });
```

**str_replace replacement:**
```js
        const storedCandle = this.storeTimeframeCandle(tf, ohlcData);
        if (tf === activeTf) this.handleMarketData({ data: ohlcData, symbol: sym, timeframe: tf });
```

**str_replace target:**
```js
      timeframe: resolvedConfig.config.broker.candleTimeframe,
```

**str_replace replacement:**
```js
      timeframe: this.candleTimeframe,
```

**str_replace target:**
```js
      // HIGH-16: broker.candleTimeframe threaded into ctx for orchestrator validation
      candleTimeframe: resolvedConfig.config.broker.candleTimeframe,
```

**str_replace replacement:**
```js
      // HIGH-16: broker.candleTimeframe threaded into ctx for orchestrator validation
      candleTimeframe: this.candleTimeframe,
```

**str_replace target:**
```js
          const activeTf = this.timeframeSelector?.currentTimeframe || '15m';
```

**str_replace replacement:**
```js
          const activeTf = this.timeframeSelector?.currentTimeframe || this.candleTimeframe;
```

**str_replace target:**
```js
          // CHANGE 2026-02-21: Feed 1m candles to indicators + MTF adapter (granular data)
          if (timeframe === '1m') {
            this.handleMarketData({ data: ohlcData, symbol: ohlcSymbol, timeframe });
          }
```

**str_replace replacement:**
```js
          // Feed only the active trading timeframe to indicators + strategy context.
          if (timeframe === activeTf) {
            this.handleMarketData({ data: ohlcData, symbol: ohlcSymbol, timeframe });
          }
```

#### File 3: `core/CandleProcessor.js`

**Line:** ~91

**str_replace target:**
```js
  }

  /**
   * Process a candle - ONE CANONICAL PATH
```

**str_replace replacement:**
```js
  }

  _resolveCandleTimeframe(candle) {
    const timeframe = candle?.timeframe || this.ctx.candleTimeframe || this.ctx.config?.timeframe;
    if (typeof timeframe !== 'string' || !timeframe.trim()) {
      throw new Error(`CandleProcessor.processNewCandle: missing candle timeframe for symbol=${candle?.symbol || this.ctx.tradingPair || '(missing)'}`);
    }
    return timeframe.trim();
  }

  /**
   * Process a candle - ONE CANONICAL PATH
```

**str_replace target:**
```js
  processNewCandle(candle) {
    // Check if this is an update to existing candle or a new candle
```

**str_replace replacement:**
```js
  processNewCandle(candle) {
    const candleTimeframe = this._resolveCandleTimeframe(candle);
    // Check if this is an update to existing candle or a new candle
```

**str_replace target:**
```js
      this.ctx._candleStore.addCandle(
        candleStoreSymbol,
        '15m',
        candle
      );
```

**str_replace replacement:**
```js
      this.ctx._candleStore.addCandle(
        candleStoreSymbol,
        candleTimeframe,
        candle
      );
```

**str_replace target:**
```js
  handleMarketData(ohlcInput) {
    const wrappedInput = ohlcInput && typeof ohlcInput === 'object' && !Array.isArray(ohlcInput)
      ? ohlcInput
      : null;
    const stampedSymbol = normalizeCandleSymbol(wrappedInput?.symbol || wrappedInput?.data?.symbol || wrappedInput?.data?.S);
    const ohlcData = Array.isArray(ohlcInput)
      ? ohlcInput
      : normalizeOhlc(wrappedInput?.data ?? ohlcInput);
```

**str_replace replacement:**
```js
  handleMarketData(ohlcInput) {
    const wrappedInput = ohlcInput && typeof ohlcInput === 'object' && !Array.isArray(ohlcInput)
      ? ohlcInput
      : null;
    const stampedSymbol = normalizeCandleSymbol(wrappedInput?.symbol || wrappedInput?.data?.symbol || wrappedInput?.data?.S);
    const sourceTimeframe = typeof wrappedInput?.timeframe === 'string' && wrappedInput.timeframe.trim()
      ? wrappedInput.timeframe.trim()
      : this.ctx.candleTimeframe;
    if (typeof sourceTimeframe !== 'string' || !sourceTimeframe.trim()) {
      throw new Error(`CandleProcessor.handleMarketData: missing candle timeframe for symbol=${stampedSymbol || this.ctx.tradingPair || '(missing)'}`);
    }
    const ohlcData = Array.isArray(ohlcInput)
      ? ohlcInput
      : normalizeOhlc(wrappedInput?.data ?? ohlcInput);
```

**str_replace target:**
```js
      etime: parseFloat(etime) * 1000  // End time for deduplication
    };
```

**str_replace replacement:**
```js
      etime: parseFloat(etime) * 1000,  // End time for deduplication
      timeframe: sourceTimeframe
    };
```

**str_replace target:**
```js
      timestamp: parseFloat(time) * 1000,  // Use candle's actual timestamp
```

**str_replace replacement:**
```js
      timestamp: parseFloat(time) * 1000,  // Use candle's actual timestamp
      timeframe: candle.timeframe,
```

#### File 4: `test/symbol-routing.test.js`

**Line:** ~17

**str_replace target:**
```js
function makeCtx(symbolContexts, tradingPair = 'BTC-USD') {
  return {
    symbolContexts,
    tradingPair,
    _candleStore: {
```

**str_replace replacement:**
```js
function makeCtx(symbolContexts, tradingPair = 'BTC-USD', candleTimeframe = '1m') {
  return {
    symbolContexts,
    tradingPair,
    candleTimeframe,
    _candleStore: {
```

**str_replace target:**
```js
      '15m',
```

**str_replace replacement:**
```js
      '1m',
```

**str_replace target:**
```js
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('symbol=BTC-USD has no SymbolTradingContext'));
  });
});
```

**str_replace replacement:**
```js
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('symbol=BTC-USD has no SymbolTradingContext'));
  });

  test('stores candles under the incoming timeframe key', () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '15m');
    const processor = new CandleProcessor(ctx);

    processor.handleMarketData({ data: ohlc(77726), symbol: 'BTC-USD', timeframe: '15m' });

    expect(ctx._candleStore.addCandle).toHaveBeenCalledWith(
      'BTC-USD',
      '15m',
      expect.objectContaining({ symbol: 'BTC-USD', c: 77726, timeframe: '15m' })
    );
    expect(ctx.marketData.timeframe).toBe('15m');
  });
});
```
