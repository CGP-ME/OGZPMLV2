/**
 * IndicatorAdapter.js - Bridge between dashboard and existing IndicatorEngine
 * Maps the comprehensive IndicatorEngine from /core/indicators to dashboard needs
 */

class IndicatorAdapter {
  constructor(chartManager) {
    this.chartManager = chartManager;
    // We'll create IndicatorEngine instances per asset-timeframe pair
    this.engines = new Map(); // key: "BTC-1m", value: IndicatorEngine instance
  }

  /**
   * Get or create an IndicatorEngine for an asset-timeframe pair
   */
  getEngine(asset, timeframe) {
    const key = `${asset}-${timeframe}`;

    if (!this.engines.has(key)) {
      // Note: IndicatorEngine expects to be loaded server-side
      // For client-side dashboard, we receive calculated values via WebSocket
      console.log(`Creating indicator engine for ${key}`);
      this.engines.set(key, {
        symbol: asset,
        timeframe: timeframe,
        lastIndicators: {}
      });
    }

    return this.engines.get(key);
  }

  /**
   * Process WebSocket indicator update from bot
   * The bot's IndicatorEngine sends pre-calculated values
   */
  processIndicatorUpdate(data) {
    const { symbol, tf, indicators } = data;
    const engine = this.getEngine(symbol, tf);

    // Store the latest indicator values
    engine.lastIndicators = indicators;

    // Cache in ChartManager for display
    if (indicators.rsi !== null) {
      this.chartManager.cacheIndicator(symbol, tf, 'RSI', [indicators.rsi]);
    }

    if (indicators.macd) {
      this.chartManager.cacheIndicator(symbol, tf, 'MACD', [indicators.macd]);
    }

    if (indicators.bb) {
      this.chartManager.cacheIndicator(symbol, tf, 'BB', [indicators.bb]);
    }

    if (indicators.atr !== null) {
      this.chartManager.cacheIndicator(symbol, tf, 'ATR', [indicators.atr]);
    }

    if (indicators.vwap !== null) {
      this.chartManager.cacheIndicator(symbol, tf, 'VWAP', [indicators.vwap]);
    }

    if (indicators.obv !== null) {
      this.chartManager.cacheIndicator(symbol, tf, 'OBV', [indicators.obv]);
    }

    if (indicators.stochRsi) {
      this.chartManager.cacheIndicator(symbol, tf, 'STOCH', [indicators.stochRsi]);
    }

    return indicators;
  }

  /**
   * Get formatted indicator values for display
   */
  getIndicatorDisplay(asset, timeframe) {
    const engine = this.getEngine(asset, timeframe);
    const ind = engine.lastIndicators;

    const display = {
      trend: [],
      momentum: [],
      volume: [],
      volatility: []
    };

    // Trend indicators
    if (ind.sma) {
      Object.entries(ind.sma).forEach(([period, value]) => {
        if (value !== null) {
          display.trend.push({
            name: `SMA ${period}`,
            value: value.toFixed(2)
          });
        }
      });
    }

    if (ind.ema) {
      Object.entries(ind.ema).forEach(([period, value]) => {
        if (value !== null) {
          display.trend.push({
            name: `EMA ${period}`,
            value: value.toFixed(2)
          });
        }
      });
    }

    if (ind.vwap !== null) {
      display.trend.push({
        name: 'VWAP',
        value: ind.vwap.toFixed(2)
      });
    }

    // Momentum indicators
    if (ind.rsi !== null) {
      display.momentum.push({
        name: 'RSI',
        value: ind.rsi.toFixed(2),
        signal: ind.rsi < 30 ? 'oversold' : ind.rsi > 70 ? 'overbought' : 'neutral'
      });
    }

    if (ind.macd) {
      display.momentum.push({
        name: 'MACD',
        value: ind.macd.macd?.toFixed(4) || '0',
        signal: ind.macd.hist > 0 ? 'bullish' : 'bearish'
      });
    }

    if (ind.stochRsi) {
      display.momentum.push({
        name: 'Stoch RSI',
        value: `K:${ind.stochRsi.k?.toFixed(2) || 'N/A'} D:${ind.stochRsi.d?.toFixed(2) || 'N/A'}`
      });
    }

    // Volume indicators
    if (ind.obv !== null) {
      display.volume.push({
        name: 'OBV',
        value: (ind.obv / 1000000).toFixed(2) + 'M'
      });
    }

    if (ind.mfi !== null) {
      display.volume.push({
        name: 'MFI',
        value: ind.mfi.toFixed(2)
      });
    }

    // Volatility indicators
    if (ind.bb) {
      display.volatility.push({
        name: 'BB Width',
        value: ((ind.bb.upper - ind.bb.lower) / ind.bb.mid * 100).toFixed(2) + '%'
      });
    }

    if (ind.atr !== null) {
      display.volatility.push({
        name: 'ATR',
        value: ind.atr.toFixed(2)
      });
    }

    if (ind.keltner) {
      display.volatility.push({
        name: 'Keltner',
        value: `${ind.keltner.upper.toFixed(2)} / ${ind.keltner.lower.toFixed(2)}`
      });
    }

    return display;
  }

  /**
   * Get chart overlay data for indicators
   */
  getChartOverlays(asset, timeframe) {
    const engine = this.getEngine(asset, timeframe);
    const ind = engine.lastIndicators;
    const candles = this.chartManager.getCandles(asset, timeframe);

    const overlays = {
      lines: [],
      bands: [],
      oscillators: []
    };

    if (!ind || candles.length === 0) return overlays;

    // Moving averages as lines
    if (ind.sma) {
      Object.entries(ind.sma).forEach(([period, value]) => {
        if (value !== null) {
          overlays.lines.push({
            id: `sma${period}`,
            name: `SMA ${period}`,
            data: [{ x: candles[candles.length - 1].t, y: value }],
            color: period === '20' ? '#FFA500' : period === '50' ? '#FF6347' : '#FFD700'
          });
        }
      });
    }

    if (ind.ema) {
      Object.entries(ind.ema).forEach(([period, value]) => {
        if (value !== null) {
          overlays.lines.push({
            id: `ema${period}`,
            name: `EMA ${period}`,
            data: [{ x: candles[candles.length - 1].t, y: value }],
            color: period === '20' ? '#00BFFF' : period === '50' ? '#1E90FF' : '#4169E1'
          });
        }
      });
    }

    // Bollinger Bands
    if (ind.bb) {
      overlays.bands.push({
        id: 'bb',
        name: 'Bollinger Bands',
        upper: [{ x: candles[candles.length - 1].t, y: ind.bb.upper }],
        middle: [{ x: candles[candles.length - 1].t, y: ind.bb.mid }],
        lower: [{ x: candles[candles.length - 1].t, y: ind.bb.lower }],
        color: 'rgba(128, 128, 128, 0.2)'
      });
    }

    // Oscillators (separate panel)
    if (ind.rsi !== null) {
      overlays.oscillators.push({
        id: 'rsi',
        name: 'RSI',
        data: [{ x: candles[candles.length - 1].t, y: ind.rsi }],
        color: '#9370DB',
        panel: 'rsi',
        yAxis: { min: 0, max: 100, levels: [30, 70] }
      });
    }

    if (ind.macd) {
      overlays.oscillators.push({
        id: 'macd',
        name: 'MACD',
        data: [{ x: candles[candles.length - 1].t, y: ind.macd.macd }],
        color: '#32CD32',
        panel: 'macd'
      });
      overlays.oscillators.push({
        id: 'macd_signal',
        name: 'Signal',
        data: [{ x: candles[candles.length - 1].t, y: ind.macd.signal }],
        color: '#DC143C',
        panel: 'macd'
      });
      overlays.oscillators.push({
        id: 'macd_hist',
        name: 'Histogram',
        data: [{ x: candles[candles.length - 1].t, y: ind.macd.hist }],
        color: ind.macd.hist > 0 ? '#00FF00' : '#FF0000',
        panel: 'macd',
        type: 'bar'
      });
    }

    return overlays;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IndicatorAdapter;
} else {
  window.IndicatorAdapter = IndicatorAdapter;
}