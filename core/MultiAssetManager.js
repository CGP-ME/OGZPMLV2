'use strict';

const { ASSET_REGISTRY, getAssetConfig, normalizeAssetSymbol } = require('./AssetRegistry');

/**
 * ============================================================================
 * MultiAssetManager — Asset Switching for OGZPrime
 * ============================================================================
 *
 * Legacy asset registry helpers. Runtime asset switching is disabled until
 * SessionRouter owns broker transitions end-to-end. Provides:
 *   1. Standard ↔ Kraken symbol mapping (BTC-USD → XXBTZUSD → XBT/USD)
 *   2. Per-asset configuration (min sizes, decimals, formatting)
 *   3. WS resubscription when asset changes
 *   4. Dashboard chart data fetch for new asset
 *   5. Price history isolation per asset
 *
 * INTEGRATION:
 *   const MultiAssetManager = require('./core/MultiAssetManager');
 *   this.assetManager = new MultiAssetManager(this);
 *
 * Dashboard asset_change must stay display-only; do not route it here to mutate
 * the live trading runtime.
 *
 * @module core/MultiAssetManager
 * @version 1.0.0
 */

class MultiAssetManager {
  constructor(bot) {
    this.bot = bot;

    this.assetRegistry = ASSET_REGISTRY;

    // Broker-aware default asset — prevents crypto/stock mismatch when BROKER
    // is changed without also updating TRADING_PAIR. Mercury 2026-04-22 catch:
    // the prior hardcoded 'BTC-USD' default fired even on Alpaca broker runs.
    // Explicit TRADING_PAIR still has to match the explicitly selected broker.
    let defaultAsset = 'BTC-USD';
    const activeBroker = (process.env.BROKER || 'kraken').toLowerCase();
    if (activeBroker !== 'kraken') {
      const match = Object.entries(this.assetRegistry).find(
        ([, info]) => info.broker === activeBroker
      );
      if (match) defaultAsset = match[0];
    }
    const configuredAsset = process.env.TRADING_PAIR || defaultAsset;
    const normalizedAsset = this._normalize(configuredAsset);
    if (!normalizedAsset) {
      throw new Error(`[MultiAsset] Unknown startup asset ${configuredAsset}; refusing runtime initialization`);
    }
    const configuredBroker = process.env.BROKER ? process.env.BROKER.toLowerCase() : null;
    const normalizedConfig = this.assetRegistry[normalizedAsset];
    if (configuredBroker && normalizedConfig?.broker !== configuredBroker) {
      throw new Error(`[MultiAsset] Startup asset ${normalizedAsset} belongs to broker ${normalizedConfig?.broker}; BROKER=${configuredBroker}`);
    }
    this.activeAsset = normalizedAsset;

    // Per-asset candle history cache (so switching back doesn't lose data)
    this.candleCache = {};

    console.log(`[MultiAssetManager] Initialized | Active: ${this.activeAsset} | ${Object.keys(this.assetRegistry).length} assets available`);
  }


  // ════════════════════════════════════════════════════════════════════════
  // SYMBOL CONVERSION
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Get full asset config for a standard symbol
   * @param {string} symbol - e.g. 'BTC-USD', 'ETH-USD', 'ETH/USD'
   */
  getConfig(symbol) {
    return getAssetConfig(symbol);
  }

  /**
   * Standard → Kraken REST API format
   * 'BTC-USD' → 'XXBTZUSD'
   */
  toKrakenRest(symbol) {
    const cfg = this.getConfig(symbol);
    if (!cfg) {
      throw new Error(`[MultiAsset] Unknown asset ${symbol}; refusing Kraken REST mapping`);
    }
    if (cfg.broker !== 'kraken') {
      throw new Error(`[MultiAsset] Asset ${symbol} belongs to broker ${cfg.broker}; refusing Kraken REST mapping`);
    }
    if (!cfg.krakenRest) {
      throw new Error(`[MultiAsset] Asset ${symbol} has no Kraken REST mapping`);
    }
    return cfg.krakenRest;
  }

  /**
   * Standard → Kraken WebSocket format
   * 'BTC-USD' → 'XBT/USD'
   */
  toKrakenWs(symbol) {
    const cfg = this.getConfig(symbol);
    if (!cfg) {
      throw new Error(`[MultiAsset] Unknown asset ${symbol}; refusing Kraken WS mapping`);
    }
    if (cfg.broker !== 'kraken') {
      throw new Error(`[MultiAsset] Asset ${symbol} belongs to broker ${cfg.broker}; refusing Kraken WS mapping`);
    }
    if (!cfg.krakenWs) {
      throw new Error(`[MultiAsset] Asset ${symbol} has no Kraken WS mapping`);
    }
    return cfg.krakenWs;
  }

  /**
   * Standard → broker-neutral format
   * 'BTC-USD' → 'BTC/USD'
   */
  toSlashFormat(symbol) {
    const normalized = this._normalize(symbol);
    if (!normalized || !this.assetRegistry[normalized]) {
      throw new Error(`[MultiAsset] Unknown asset ${symbol}; refusing slash-format mapping`);
    }
    return normalized.replace('-', '/');
  }

  /**
   * Kraken WS pair → Standard format
   * 'XBT/USD' → 'BTC-USD'
   */
  fromKrakenWs(krakenPair) {
    if (typeof krakenPair !== 'string' || !krakenPair.trim()) return null;
    const raw = krakenPair.trim().toUpperCase();
    for (const [standard, cfg] of Object.entries(this.assetRegistry)) {
      const ws = cfg.krakenWs ? cfg.krakenWs.toUpperCase() : null;
      const rest = cfg.krakenRest ? cfg.krakenRest.toUpperCase() : null;
      if (ws === raw || rest === raw) return standard;
    }
    return null;
  }

  /** Normalize any format to 'BTC-USD' style */
  _normalize(symbol) {
    return normalizeAssetSymbol(symbol);
  }


  // ════════════════════════════════════════════════════════════════════════
  // ASSET SWITCHING
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Switch the active trading asset.
   * - Caches current candle history
   * - Resubscribes Kraken WS to new pair
   * - Fetches historical candles for new asset
   * - Notifies dashboard
   *
   * @param {string} newAsset - e.g. 'ETH-USD'
   * @returns {boolean} success
   */
  switchAsset(newAsset) {
    const normalized = this._normalize(newAsset);
    const config = this.getConfig(normalized);

    if (!config) {
      console.warn(`[MultiAsset] Unknown asset ${newAsset}`);
      this._notifyDashboard('asset_change_error', { error: `Unknown asset: ${newAsset}` });
      return false;
    }

    console.warn(`[MultiAsset] Refusing runtime asset switch to ${normalized}; SessionRouter must own broker transitions`);
    this._notifyDashboard('asset_change_ignored', {
      asset: normalized,
      broker: config.broker,
      assetClass: config.assetClass,
      reason: 'session_router_required'
    });
    return false;
  }


  /**
   * Resubscribe Kraken WS to new pair
   */
  _resubscribeWs(config) {
    const kraken = this.bot.kraken;
    if (!kraken) return;

    // Access the underlying simple adapter's WebSocket
    const ws = kraken.simple?.ws || kraken.ws;
    if (!ws || ws.readyState !== 1) {
      console.warn('[MultiAsset] Kraken WS not connected, will subscribe on reconnect');
      return;
    }

    const wsPair = config.krakenWs;

    // Unsubscribe from ALL current subscriptions
    // Then resubscribe to new pair
    const ohlcIntervals = [1, 5, 15, 30, 60, 240, 1440];

    // Unsubscribe old
    const oldConfig = this.getConfig(this.bot._previousAsset || 'BTC-USD');
    const oldWsPair = oldConfig?.krakenWs || 'XBT/USD';

    ws.send(JSON.stringify({
      event: 'unsubscribe',
      pair: [oldWsPair],
      subscription: { name: 'ticker' }
    }));
    for (const interval of ohlcIntervals) {
      ws.send(JSON.stringify({
        event: 'unsubscribe',
        pair: [oldWsPair],
        subscription: { name: 'ohlc', interval }
      }));
    }

    // Subscribe new
    ws.send(JSON.stringify({
      event: 'subscribe',
      pair: [wsPair],
      subscription: { name: 'ticker' }
    }));
    for (const interval of ohlcIntervals) {
      ws.send(JSON.stringify({
        event: 'subscribe',
        pair: [wsPair],
        subscription: { name: 'ohlc', interval }
      }));
    }

    this.bot._previousAsset = this.activeAsset;
    console.log(`[MultiAsset] Resubscribed: ${oldWsPair} -> ${wsPair} (ticker + ${ohlcIntervals.length} OHLC)`);
  }


  // ════════════════════════════════════════════════════════════════════════
  // DASHBOARD NOTIFICATIONS
  // ════════════════════════════════════════════════════════════════════════

  _notifyDashboard(type, data) {
    try {
      if (this.bot.dashboardWs && this.bot.dashboardWsConnected) {
        this.bot.dashboardWs.send(JSON.stringify({ type, data, timestamp: Date.now() }));
      }
    } catch {}
  }


  // ════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ════════════════════════════════════════════════════════════════════════

  /** Get all available assets */
  getAvailableAssets() {
    return Object.entries(this.assetRegistry).map(([symbol, cfg]) => ({
      symbol,
      label: cfg.label,
      base: cfg.base,
      broker: cfg.broker,
      assetClass: cfg.assetClass,
      minOrder: cfg.minOrder,
      decimals: cfg.decimals
    }));
  }

  /** Get active asset info */
  getActiveAsset() {
    return {
      symbol: this.activeAsset,
      ...this.assetRegistry[this.activeAsset]
    };
  }

  /** Format price with correct decimals for current asset */
  formatPrice(price) {
    const cfg = this.getConfig(this.activeAsset);
    return price.toFixed(cfg?.decimals || 2);
  }

  /** Get minimum order size for current asset */
  getMinOrderSize() {
    const cfg = this.getConfig(this.activeAsset);
    return cfg?.minOrder || 0.001;
  }
}

module.exports = MultiAssetManager;
