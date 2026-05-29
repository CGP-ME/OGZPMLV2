/**
 * DashboardBroadcaster - Phase 17 Extraction
 *
 * EXACT COPY of broadcastEdgeAnalytics(), calculateVolatility(), detectDivergences()
 * from run-empire-v2.js. NO logic changes.
 *
 * Dependencies passed via context object in constructor.
 *
 * @module core/DashboardBroadcaster
 */

'use strict';

// Candle accessors (V2 format: c/o/h/l/v/t)
const { c: _c, o: _o, h: _h, l: _l, v: _v, t: _t } = require('./CandleHelper');

class DashboardBroadcaster {
  constructor(ctx) {
    this.ctx = ctx;
    const edgeAnalyticsMaxScopes = Number(ctx?.edgeAnalyticsMaxScopes);
    if (!Number.isInteger(edgeAnalyticsMaxScopes) || edgeAnalyticsMaxScopes <= 0) {
      throw new Error(`[DashboardBroadcaster] edgeAnalyticsMaxScopes invalid (${ctx?.edgeAnalyticsMaxScopes})`);
    }
    this.edgeAnalyticsMaxScopes = edgeAnalyticsMaxScopes;
    this.edgeAnalyticsByScope = new Map();
    console.log('[DashboardBroadcaster] Initialized (Phase 17 - exact copy)');
  }

  _normalizeSymbol(symbol) {
    const raw = String(symbol || '').trim().toUpperCase();
    if (!raw) return null;
    return raw.replace(/^XBT/, 'BTC').replace(/\//g, '-');
  }

  _buildEdgeAnalyticsState() {
    return {
      cvd: 0,
      buyVolume: 0,
      sellVolume: 0,
      lastFundingCheck: 0,
      fundingRate: 0.0001,
      liquidationLevels: { long: {}, short: {} },
      marketInternals: {},
      fearGreedValue: 50,
      smartMoney: { flow: 'NEUTRAL', activity: 'MEDIUM' },
      whaleTrades: [],
      lastLiquidationCalc: 0,
      lastInternalsCalc: 0,
      lastFearGreedCalc: 0,
      lastDivergenceCheck: 0,
      lastSmartMoneyCheck: 0
    };
  }

  _scopeKey(symbol, timeframe) {
    const canonicalSymbol = this._normalizeSymbol(symbol);
    if (!canonicalSymbol || !timeframe) return null;
    return `${canonicalSymbol}:${timeframe}`;
  }

  _getEdgeAnalytics(symbol, timeframe) {
    const key = this._scopeKey(symbol, timeframe);
    if (!key) return null;
    if (!this.edgeAnalyticsByScope.has(key)) {
      while (this.edgeAnalyticsByScope.size >= this.edgeAnalyticsMaxScopes) {
        const oldestKey = this.edgeAnalyticsByScope.keys().next().value;
        if (!oldestKey) break;
        this.edgeAnalyticsByScope.delete(oldestKey);
      }
      this.edgeAnalyticsByScope.set(key, this._buildEdgeAnalyticsState());
    }
    return this.edgeAnalyticsByScope.get(key);
  }

  _getPriceHistory(symbol, timeframe = null) {
    const canonicalSymbol = this._normalizeSymbol(symbol);
    if (!canonicalSymbol) return [];

    const histories = this.ctx.symbolTimeframeHistories;
    if (histories instanceof Map) {
      const byTimeframe = histories.get(canonicalSymbol);
      if (byTimeframe instanceof Map) {
        const timeframeHistory = timeframe ? byTimeframe.get(timeframe) : null;
        if (Array.isArray(timeframeHistory) && timeframeHistory.length > 0) return timeframeHistory;
        return [];
      }
    }

    const symbolCtx = this.ctx.symbolContexts instanceof Map
      ? this.ctx.symbolContexts.get(canonicalSymbol)
      : null;
    if (Array.isArray(symbolCtx?.priceHistory) && symbolCtx.priceHistory.length > 0) {
      return symbolCtx.priceHistory;
    }

    const history = Array.isArray(this.ctx.priceHistory) ? this.ctx.priceHistory : [];
    return history.filter(candle => this._normalizeSymbol(candle?.symbol) === canonicalSymbol);
  }

  _getIndicatorSnapshot(symbol) {
    const canonicalSymbol = this._normalizeSymbol(symbol);
    const symbolCtx = this.ctx.symbolContexts instanceof Map
      ? this.ctx.symbolContexts.get(canonicalSymbol)
      : null;
    if (symbolCtx?.indicatorEngine?.getSnapshot) {
      return symbolCtx.indicatorEngine.getSnapshot();
    }

    const globalEngine = this.ctx.indicatorEngine;
    const globalSymbol = this._normalizeSymbol(globalEngine?.config?.symbol);
    if (globalEngine?.getSnapshot && globalSymbol === canonicalSymbol) {
      return globalEngine.getSnapshot();
    }

    return null;
  }

  _cvdTrend(cvd) {
    if (cvd > 0) return 'BUYERS';
    if (cvd < 0) return 'SELLERS';
    return 'NEUTRAL';
  }

  _fundingSignal(currentFunding, predictedFunding) {
    const current = Number(currentFunding);
    const predicted = Number(predictedFunding);
    if (!Number.isFinite(current) || !Number.isFinite(predicted)) return 'UNKNOWN';
    if (current > 0 && predicted > current) return 'RISING';
    if (current < 0 && predicted < current) return 'FALLING';
    return 'NEUTRAL';
  }

  _fearGreedLabel(value) {
    const score = Number(value);
    if (!Number.isFinite(score)) return 'UNKNOWN';
    if (score > 50) return 'GREED';
    if (score < 50) return 'FEAR';
    return 'NEUTRAL';
  }

  _formatDivergence(divergence) {
    if (!divergence?.type || !divergence?.indicator) return null;
    const type = String(divergence.type).toUpperCase();
    const indicator = String(divergence.indicator).toUpperCase();
    const timeframe = divergence?.timeframe ? ` ${divergence.timeframe}` : '';
    return `${type} ${indicator}${timeframe}`;
  }

  /**
   * Broadcast Edge Analytics data to dashboard
   * Includes CVD, liquidation levels, funding rates, whale alerts, market internals
   */
  broadcastEdgeAnalytics(price, volume, candle) {
    try {
      if (!this.ctx.dashboardWs || this.ctx.dashboardWs.readyState !== 1) return false;

      const symbol = this._normalizeSymbol(candle?.symbol);
      if (!symbol) {
        console.error('[DashboardBroadcaster] Missing candle.symbol; refusing unattributed edge analytics broadcast');
        return false;
      }
      const timeframe = candle?.timeframe || null;
      if (!timeframe) {
        console.error(`[DashboardBroadcaster] Missing candle.timeframe for ${symbol}; refusing unattributed edge analytics broadcast`);
        return false;
      }
      const numericPrice = Number(price);
      if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
        console.error(`[DashboardBroadcaster] Invalid price for ${symbol} ${timeframe}; refusing edge analytics broadcast`);
        return false;
      }
      const numericVolume = Number(volume);
      if (!Number.isFinite(numericVolume) || numericVolume < 0) {
        console.error(`[DashboardBroadcaster] Invalid volume for ${symbol} ${timeframe}; refusing edge analytics broadcast`);
        return false;
      }
      price = numericPrice;
      volume = numericVolume;
      const scopeFields = { symbol, timeframe };
      const edgeAnalytics = this._getEdgeAnalytics(symbol, timeframe);
      if (!edgeAnalytics) {
        console.error(`[DashboardBroadcaster] Missing analytics state for ${symbol} ${timeframe}; refusing edge analytics broadcast`);
        return false;
      }
      const priceHistory = this._getPriceHistory(symbol, timeframe);

      // God Mode: Delta tick emission for zero-lag chart updates
      this.ctx.dashboardWs.send(JSON.stringify({
        type: 'delta',
        ...scopeFields,
        tick: { symbol, timeframe, price, volume, timestamp: Date.now() }
      }));

      // Calculate CVD (Cumulative Volume Delta)
      const isBuy = _c(candle) >= _o(candle);  // Simple: close >= open = buy pressure
      const volumeDelta = isBuy ? volume : -volume;
      edgeAnalytics.cvd += volumeDelta;
      edgeAnalytics.buyVolume += isBuy ? volume : 0;
      edgeAnalytics.sellVolume += !isBuy ? volume : 0;

      // Send CVD update
      this.ctx.dashboardWs.send(JSON.stringify({
        type: 'cvd_update',
        ...scopeFields,
        cvd: edgeAnalytics.cvd,
        cvdValue: edgeAnalytics.cvd,
        cvdTrend: this._cvdTrend(edgeAnalytics.cvd),
        buyVolume: edgeAnalytics.buyVolume,
        sellVolume: edgeAnalytics.sellVolume,
        timestamp: Date.now()
      }));

      // Calculate liquidation levels (every 10 seconds)
      const now = Date.now();
      if (now - edgeAnalytics.lastLiquidationCalc > 10000) {
        edgeAnalytics.lastLiquidationCalc = now;

        // Typical leverages for crypto
        const leverages = [10, 25, 50, 100];
        const liquidationData = {
          long: { price: 0, volume: 0 },
          short: { price: 99999999, volume: 0 }
        };

        // Calculate weighted liquidation zones
        leverages.forEach(leverage => {
          const longLiq = price * (1 - 1/leverage);
          const shortLiq = price * (1 + 1/leverage);

          // Weight by typical leverage usage
          const weight = 100 / leverage;

          // Find nearest liquidation clusters
          if (longLiq > liquidationData.long.price) {
            liquidationData.long.price = longLiq;
          }
          liquidationData.long.volume += volume * weight * 10000;

          if (shortLiq < liquidationData.short.price) {
            liquidationData.short.price = shortLiq;
          }
          liquidationData.short.volume += volume * weight * 10000;
        });

        edgeAnalytics.liquidationLevels = liquidationData;

        this.ctx.dashboardWs.send(JSON.stringify({
          type: 'liquidation_data',
          ...scopeFields,
          levels: liquidationData,
          longLiqPrice: liquidationData.long.price,
          longLiqVol: liquidationData.long.volume,
          shortLiqPrice: liquidationData.short.price,
          shortLiqVol: liquidationData.short.volume,
          currentPrice: price,
          timestamp: Date.now()
        }));
      }

      // Check for whale trades (large volume)
      const avgVolume = priceHistory.slice(-20).reduce((sum, c) => sum + (_v(c) || 0), 0) / 20;
      if (priceHistory.length >= 20 && avgVolume > 0 && volume > avgVolume * 5) {  // 5x average = whale
        const whaleData = {
          ...scopeFields,
          amount: volume,
          size: volume * price,  // USD value
          price: price,
          side: isBuy ? 'BUY' : 'SELL',
          timestamp: Date.now()
        };

        edgeAnalytics.whaleTrades.push(whaleData);
        if (edgeAnalytics.whaleTrades.length > 10) {
          edgeAnalytics.whaleTrades.shift();
        }

        this.ctx.dashboardWs.send(JSON.stringify({
          type: 'whale_trade',
          ...whaleData
        }));
      }

      // Calculate market internals (every 5 seconds)
      if (now - edgeAnalytics.lastInternalsCalc > 5000) {
        edgeAnalytics.lastInternalsCalc = now;

        const buySellRatio = edgeAnalytics.buyVolume / Math.max(edgeAnalytics.sellVolume, 0.01);
        const aggressor = buySellRatio > 1.2 ? 'BUYERS' : buySellRatio < 0.8 ? 'SELLERS' : 'NEUTRAL';
        const spread = _h(candle) - _l(candle);
        const spreadPercent = (spread / price) || 0;

        const internals = {
          buySellRatio: buySellRatio,
          aggressor: aggressor,
          bookImbalance: (buySellRatio - 1) / (buySellRatio + 1),
          spread: spreadPercent
        };

        edgeAnalytics.marketInternals = internals;

        this.ctx.dashboardWs.send(JSON.stringify({
          type: 'market_internals',
          ...scopeFields,
          ...internals,
          timestamp: Date.now()
        }));
      }

      // Update funding rates (every 60 seconds)
      if (now - edgeAnalytics.lastFundingCheck > 60000) {
        edgeAnalytics.lastFundingCheck = now;

        const momentum = priceHistory.length > 10 ?
          (price - _c(priceHistory[priceHistory.length - 10])) / _c(priceHistory[priceHistory.length - 10]) : 0;
        const fundingBias = momentum * 0.001;
        edgeAnalytics.fundingRate = 0.0001 + fundingBias;

        const predictedFunding = edgeAnalytics.fundingRate * (1 + momentum);

        this.ctx.dashboardWs.send(JSON.stringify({
          type: 'funding_rate',
          ...scopeFields,
          current: edgeAnalytics.fundingRate,
          currentFunding: edgeAnalytics.fundingRate,
          predicted: predictedFunding,
          predictedFunding,
          fundingSignal: this._fundingSignal(edgeAnalytics.fundingRate, predictedFunding),
          timestamp: Date.now()
        }));
      }

      // Calculate Fear & Greed (every 30 seconds)
      if (now - edgeAnalytics.lastFearGreedCalc > 30000) {
        edgeAnalytics.lastFearGreedCalc = now;

        const volatility = this.calculateVolatility(priceHistory);
        const momentum = priceHistory.length > 10 ?
          (price - _c(priceHistory[priceHistory.length - 10])) / _c(priceHistory[priceHistory.length - 10]) : 0;
        const volumeTrend = volume / Math.max(avgVolume, 0.01);

        const fearGreed = Math.min(100, Math.max(0,
          50 +
          (momentum > 0 ? 20 : -20) +
          (volatility < 0.02 ? 10 : -10) +
          (volumeTrend > 1 ? 10 : -10) +
          (edgeAnalytics.cvd > 0 ? 10 : -10)
        ));

        edgeAnalytics.fearGreedValue = fearGreed;

        this.ctx.dashboardWs.send(JSON.stringify({
          type: 'fear_greed',
          ...scopeFields,
          value: fearGreed,
          fgValue: fearGreed,
          fgLabel: this._fearGreedLabel(fearGreed),
          timestamp: Date.now()
        }));
      }

      // Detect divergences (every 15 seconds)
      if (now - edgeAnalytics.lastDivergenceCheck > 15000) {
        edgeAnalytics.lastDivergenceCheck = now;

        const divergences = this.detectDivergences(priceHistory, timeframe, symbol);

        if (divergences.length > 0) {
          const divergenceLabels = divergences
            .map(div => this._formatDivergence(div))
            .filter(Boolean);
          if (divergenceLabels.length > 0) {
            this.ctx.dashboardWs.send(JSON.stringify({
              type: 'divergence',
              ...scopeFields,
              divergences: divergenceLabels,
              divergenceDetails: divergences,
              timestamp: Date.now()
            }));
          }
        }
      }

      // Smart Money Flow (every 20 seconds)
      if (now - edgeAnalytics.lastSmartMoneyCheck > 20000) {
        edgeAnalytics.lastSmartMoneyCheck = now;

        const priceChange = priceHistory.length > 10 ?
          (price - _c(priceHistory[Math.max(0, priceHistory.length - 10)])) / price : 0;
        const volumeProfile = edgeAnalytics.whaleTrades.filter(t => t.side === 'BUY').length;

        let flow = 'NEUTRAL';
        if (priceChange < -0.02 && volumeProfile > 3) flow = 'ACCUMULATING';
        else if (priceChange > 0.02 && volumeProfile < 2) flow = 'DISTRIBUTING';

        const activity = volume > avgVolume * 3 ? 'HIGH' : volume > avgVolume * 1.5 ? 'MEDIUM' : 'LOW';

        edgeAnalytics.smartMoney = { flow, activity };

        this.ctx.dashboardWs.send(JSON.stringify({
          type: 'smart_money',
          ...scopeFields,
          flow: flow,
          smartFlow: flow,
          activity: activity,
          instActivity: activity,
          dormancy: 'LOW',
          timestamp: Date.now()
        }));
      }

      return true;
    } catch (error) {
      console.error('Edge analytics broadcast failed:', error.message);
      return false;
    }
  }

  /**
   * Calculate price volatility for Fear & Greed
   * EXACT COPY from run-empire-v2.js
   */
  calculateVolatility(priceHistory = null) {
    const history = Array.isArray(priceHistory) ? priceHistory : [];
    if (history.length < 20) return 0.02;

    const returns = [];
    for (let i = 1; i < Math.min(20, history.length); i++) {
      const ret = (_c(history[i]) - _c(history[i-1])) / _c(history[i-1]);
      returns.push(ret);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  /**
   * Detect price/indicator divergences
   * EXACT COPY from run-empire-v2.js
   */
  detectDivergences(priceHistory = null, timeframe = null, symbol = null) {
    const divergences = [];
    const history = Array.isArray(priceHistory) ? priceHistory : [];

    if (history.length < 20) return divergences;

    const recentPrices = history.slice(-20);
    const priceHigh = Math.max(...recentPrices.map(candle => _h(candle)));
    const priceLow = Math.min(...recentPrices.map(candle => _l(candle)));
    const currentPrice = _c(recentPrices[recentPrices.length - 1]);

    const indicators = this._getIndicatorSnapshot(symbol);
    const rsi = indicators?.indicators?.rsi;

    if (rsi) {
      if (currentPrice > priceHigh * 0.98 && rsi < 70) {
        divergences.push({
          type: 'bearish',
          indicator: 'RSI',
          timeframe
        });
      } else if (currentPrice < priceLow * 1.02 && rsi > 30) {
        divergences.push({
          type: 'bullish',
          indicator: 'RSI',
          timeframe
        });
      }
    }

    const avgVolume = recentPrices.reduce((sum, c) => sum + _v(c), 0) / recentPrices.length;
    const currentVolume = _v(recentPrices[recentPrices.length - 1]);

    if (currentPrice > priceHigh * 0.98 && currentVolume < avgVolume * 0.7) {
      divergences.push({
        type: 'bearish',
        indicator: 'Volume',
        timeframe
      });
    }

    return divergences;
  }
}

module.exports = DashboardBroadcaster;
