# CODEX SPEC: Alpaca Active Timeframe Ingestion

## Root Cause

Alpaca websocket bars arrive as 1-minute stock bars even when the runtime active
timeframe is configured as `15m`. The runner stores those bars under the
incoming `1m` timeframe and only feeds `CandleProcessor` when
`eventData.timeframe === activeTf`. In Alpaca/TSLA/15m mode, that leaves the
active strategy pipeline cold while logs show real symbol ingress.

The unsafe proposal from `MISSION-1779476103631` tried to remember the requested
subscription timeframe in `AlpacaAdapter` and emit Alpaca 1-minute bars as
`15m`. That would make labels look aligned while feeding 1-minute candles into a
15-minute strategy path. This spec rejects that approach.

The safe path keeps source bars labeled `1m`, converts normalized broker object
timestamps to the seconds-based runner/CandleProcessor API, stores real 1-minute
history, derives completed active-timeframe candles through `CandleAggregator`,
and feeds only those completed active candles to analysis.

### Fix 1: Fixed Alpaca 1m bars feeding active timeframe

**Status:** NOT FIXED

#### File 1: `run-empire-v2.js`

**Line:** ~396

**str_replace target:**
```js
function describeSymbolContexts(map) {
  if (!map || map.size === 0) return '(none)';
  return Array.from(map.keys()).join(',');
}
```

**str_replace replacement:**
```js
function describeSymbolContexts(map) {
  if (!map || map.size === 0) return '(none)';
  return Array.from(map.keys()).join(',');
}

function ohlcTimestampMs(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeOhlcForProcessor(ohlcData) {
  if (!Array.isArray(ohlcData) || ohlcData.length < 8) return null;
  const timeMs = ohlcTimestampMs(ohlcData[0]);
  const etimeMs = ohlcTimestampMs(ohlcData[1] ?? ohlcData[0]);
  if (!Number.isFinite(timeMs) || !Number.isFinite(etimeMs)) return null;

  const normalized = ohlcData.slice();
  normalized[0] = timeMs / 1000;
  normalized[1] = etimeMs / 1000;
  return normalized;
}

function candleToProcessorOhlc(candle, timeframeMs) {
  const timeMs = ohlcTimestampMs(candle?.t);
  if (!Number.isFinite(timeMs) || !Number.isFinite(timeframeMs) || timeframeMs <= 0) {
    return null;
  }
  return [
    timeMs / 1000,
    (timeMs + timeframeMs) / 1000,
    candle.o,
    candle.h,
    candle.l,
    candle.c,
    null,
    candle.v ?? 0,
    null
  ];
}
```

**str_replace target:**
```js
    this.mtfAdapter = new MultiTimeframeAdapter({
      activeTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
    });

    const runtimeCandleTimeframe = resolvedConfig.config.broker.candleTimeframe;
```

**str_replace replacement:**
```js
    this.mtfAdapter = new MultiTimeframeAdapter({
      activeTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
    });
    this.candleAggregator = new CandleAggregator();
    this._emittedAggregatedActiveCandles = new Set();

    const runtimeCandleTimeframe = resolvedConfig.config.broker.candleTimeframe;
```

**str_replace target:**
```js
        const ohlcData = normalizeOhlc(raw);
        if (!ohlcData) {
          console.warn('[OHLC] dropped unnormalizable payload from', tf);
          return;
        }
```

**str_replace replacement:**
```js
        const normalizedOhlcData = normalizeOhlc(raw);
        if (!normalizedOhlcData) {
          console.warn('[OHLC] dropped unnormalizable payload from', tf);
          return;
        }
        const ohlcData = normalizeOhlcForProcessor(normalizedOhlcData);
        if (!ohlcData) {
          console.warn('[OHLC] dropped payload with invalid timestamp from', tf);
          return;
        }
```

**str_replace target:**
```js
        const storedCandle = this.storeTimeframeCandle(tf, ohlcData);
        if (tf === activeTf) this.handleMarketData({ data: ohlcData, symbol: sym, timeframe: tf });
```

**str_replace replacement:**
```js
        const storedCandle = this.storeTimeframeCandle(tf, ohlcData);
        if (tf === activeTf) {
          this.handleMarketData({ data: ohlcData, symbol: sym, timeframe: tf });
        } else {
          this._feedAggregatedActiveCandle({
            symbol: sym,
            sourceTimeframe: tf,
            activeTimeframe: activeTf,
            sourceLabel: `sessionRouter:${this.sessionRouter?.activeSession || 'unknown'}`
          });
        }
```

**str_replace target:**
```js
          const ohlcData = normalizeOhlc(raw);
          if (!ohlcData) {
            console.warn('[OHLC] dropped unnormalizable payload from', timeframe, 'broker:', raw);
            return;
          }
```

**str_replace replacement:**
```js
          const normalizedOhlcData = normalizeOhlc(raw);
          if (!normalizedOhlcData) {
            console.warn('[OHLC] dropped unnormalizable payload from', timeframe, 'broker:', raw);
            return;
          }
          const ohlcData = normalizeOhlcForProcessor(normalizedOhlcData);
          if (!ohlcData) {
            console.warn('[OHLC] dropped payload with invalid timestamp from', timeframe, 'broker:', raw);
            return;
          }
```

**str_replace target:**
```js
          // Store in timeframe-specific history for dashboard
          const storedCandle = this.storeTimeframeCandle(timeframe, ohlcData);

          // Feed only the active trading timeframe to indicators + strategy context.
          if (timeframe === activeTf) {
            this.handleMarketData({ data: ohlcData, symbol: ohlcSymbol, timeframe });
          }
```

**str_replace replacement:**
```js
          // Store in timeframe-specific history for dashboard
          const storedCandle = this.storeTimeframeCandle(timeframe, ohlcData);

          // Feed only the active trading timeframe to indicators + strategy context.
          if (timeframe === activeTf) {
            this.handleMarketData({ data: ohlcData, symbol: ohlcSymbol, timeframe });
          } else {
            this._feedAggregatedActiveCandle({
              symbol: ohlcSymbol,
              sourceTimeframe: timeframe,
              activeTimeframe: activeTf,
              sourceLabel: `single:${resolvedConfig.config.broker.id}`
            });
          }
```

**str_replace target:**
```js
  /**
   * Handle incoming market data from WebSocket
   * REFACTOR Phase 19: Thin dispatcher to CandleProcessor
   */
  handleMarketData(ohlcData) {
    this.candleProcessor.handleMarketData(ohlcData);
  }
```

**str_replace replacement:**
```js
  _feedAggregatedActiveCandle({ symbol, sourceTimeframe, activeTimeframe, sourceLabel }) {
    if (!this.candleAggregator || sourceTimeframe === activeTimeframe) {
      return null;
    }

    const sourceMs = this.candleAggregator.getIntervalMs(sourceTimeframe);
    const activeMs = this.candleAggregator.getIntervalMs(activeTimeframe);
    if (!sourceMs || !activeMs || sourceMs >= activeMs) {
      return null;
    }

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
    if (sourceHistory.length === 0) {
      return null;
    }

    const completed = this.candleAggregator
      .aggregate(sourceHistory, activeTimeframe)
      .filter(candle => candle && this.candleAggregator.isPeriodComplete(candle.t, activeTimeframe));
    if (completed.length === 0) {
      return null;
    }

    const activeCandle = completed[completed.length - 1];
    const dedupeKey = `${symbol}:${activeTimeframe}:${activeCandle.t}`;
    if (this._emittedAggregatedActiveCandles.has(dedupeKey)) {
      return null;
    }

    const activeOhlc = candleToProcessorOhlc(activeCandle, activeMs);
    if (!activeOhlc) {
      console.error(`[VIS][OHLC][Aggregate] failed to convert aggregate ${sourceTimeframe}->${activeTimeframe} for ${symbol}`);
      return null;
    }

    const storedCandle = this.storeTimeframeCandle(activeTimeframe, activeOhlc);
    this.handleMarketData({ data: activeOhlc, symbol, timeframe: activeTimeframe });
    this._emittedAggregatedActiveCandles.add(dedupeKey);
    if (this._emittedAggregatedActiveCandles.size > 1000) {
      this._emittedAggregatedActiveCandles = new Set(Array.from(this._emittedAggregatedActiveCandles).slice(-500));
    }

    console.log(`[VIS][OHLC][Aggregate] source=${sourceLabel} from=${sourceTimeframe} to=${activeTimeframe} symbol=${symbol} periodStart=${new Date(activeCandle.t).toISOString()} periodEnd=${new Date(activeCandle.t + activeMs).toISOString()} close=${activeCandle.c} sourceCandles=${sourceHistory.length} activeCandles=${this.priceHistory.length}`);

    if (storedCandle?.isNewCandle) {
      console.log(`V2: ${activeTimeframe} aggregate closed - running trading analysis`);
      this.run15mTradingCycle(symbol);
    }

    return { storedCandle, activeCandle };
  }

  /**
   * Handle incoming market data from WebSocket
   * REFACTOR Phase 19: Thin dispatcher to CandleProcessor
   */
  handleMarketData(ohlcData) {
    this.candleProcessor.handleMarketData(ohlcData);
  }
```

## Verification

- `node --check run-empire-v2.js`
- Focused runner observation after PM2 restart: TSLA/Alpaca 1m ingress must log
  `[VIS][OHLC][Runner] ... timeframe=1m ... symbol=TSLA`, then completed
  active candles must log `[VIS][OHLC][Aggregate] ... from=1m to=15m ...`.
- Strategy path must no longer remain permanently at `Warming up... 0/3`.
- Mercury attack must ask whether this closes the underlying mechanism or only
  hides it by relabeling bars, and whether any cross-symbol contamination path
  remains.
- Full P0 anchor must be rerun before commit because `run-empire-v2.js` is hot
  path. The canonical baseline source is
  `ogz-meta/specs/baseline-phase0-2026-05-06.md` unless a newer
  `baseline-phase0-*` doc exists.
