/**
 * DashboardBroadcaster - candle-derived divergence observations.
 *
 * Trade flow and order-book analytics belong to the observed market-data feed.
 * Candles do not supply funding, liquidation positions or participant identity.
 *
 * Dependencies passed via context object in constructor.
 *
 * @module core/DashboardBroadcaster
 */

'use strict';

// Candle accessors (V2 format: c/o/h/l/v/t)
const { c: _c, h: _h, l: _l, v: _v } = require('./CandleHelper');

class DashboardBroadcaster {
  constructor(ctx) {
    this.ctx = ctx;
    const edgeAnalyticsMaxScopes = Number(ctx?.edgeAnalyticsMaxScopes);
    if (!Number.isInteger(edgeAnalyticsMaxScopes) || edgeAnalyticsMaxScopes <= 0) {
      throw new Error(`[DashboardBroadcaster] edgeAnalyticsMaxScopes invalid (${ctx?.edgeAnalyticsMaxScopes})`);
    }
    this.edgeAnalyticsMaxScopes = edgeAnalyticsMaxScopes;
    this.edgeAnalyticsByScope = new Map();
    console.log('[DashboardBroadcaster] Initialized candle divergence broadcaster');
  }

  _normalizeSymbol(symbol) {
    const raw = String(symbol || '').trim().toUpperCase();
    if (!raw) return null;
    return raw.replace(/^XBT/, 'BTC').replace(/\//g, '-');
  }

  _cleanScopeValue(value) {
    const text = String(value || '').trim();
    return text || null;
  }

  _buildEdgeAnalyticsState() {
    return { lastDivergenceCheck: 0 };
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

  _formatDivergence(divergence) {
    if (!divergence?.type || !divergence?.indicator) return null;
    const type = String(divergence.type).toUpperCase();
    const indicator = String(divergence.indicator).toUpperCase();
    const timeframe = divergence?.timeframe ? ` ${divergence.timeframe}` : '';
    return `${type} ${indicator}${timeframe}`;
  }

  /**
   * Broadcast Edge Analytics data to dashboard
   * Uses canonical candles and their matching indicator engine for divergence observations.
   */
  broadcastEdgeAnalytics(candle) {
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
      const canonicalSymbol = this._normalizeSymbol(symbol);
      if (!canonicalSymbol) {
        console.error(`[DashboardBroadcaster] Invalid symbol for ${timeframe}; refusing edge analytics broadcast`);
        return false;
      }
      const brokerId = this._cleanScopeValue(candle?.brokerId || this.ctx.config?.brokerId);
      const assetClass = this._cleanScopeValue(candle?.assetClass || this.ctx.config?.assetClass);
      const executionMode = this._cleanScopeValue(candle?.executionMode || this.ctx.config?.executionMode);
      const accountId = this._cleanScopeValue(candle?.accountId || this.ctx.config?.accountId);
      const source = this._cleanScopeValue(candle?.source || 'candle_processor');
      const missingScope = [];
      if (!brokerId) missingScope.push('brokerId');
      if (!assetClass) missingScope.push('assetClass');
      if (!executionMode) missingScope.push('executionMode');
      if (missingScope.length > 0) {
        console.error(`[DashboardBroadcaster] Dashboard scope incomplete (${missingScope.join(', ')}) for ${canonicalSymbol} ${timeframe}; refusing edge analytics broadcast`);
        return false;
      }
      const scopeFields = { symbol: canonicalSymbol, asset: canonicalSymbol, timeframe, brokerId, assetClass, executionMode, source };
      if (accountId) scopeFields.accountId = accountId;
      const edgeAnalytics = this._getEdgeAnalytics(canonicalSymbol, timeframe);
      if (!edgeAnalytics) {
        console.error(`[DashboardBroadcaster] Missing analytics state for ${canonicalSymbol} ${timeframe}; refusing edge analytics broadcast`);
        return false;
      }
      const priceHistory = this.ctx.candleStore.getCandles(canonicalSymbol, timeframe);

      const now = Date.now();

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

      return true;
    } catch (error) {
      console.error('Edge analytics broadcast failed:', error.message);
      return false;
    }
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

    const indicators = this.ctx.getSymbolTimeframeContext(symbol, timeframe).indicatorEngine.getSnapshot();
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
