/**
 * ============================================================================
 * MultiAssetManager — Asset Switching for OGZPrime
 * ============================================================================
 *
 * Handles switching between trading pairs on Kraken. Provides:
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
 * Then in your dashboard WS message handler, add:
 *   if (msg.type === 'asset_change') {
 *     this.assetManager.switchAsset(msg.asset);
 *   }
 *
 * @module core/MultiAssetManager
 * @version 1.0.0
 */

class MultiAssetManager {
  constructor(bot) {
    this.bot = bot;

    // ══════════════════════════════════════════════════════════════════
    // ASSET REGISTRY — map of standard symbol to broker + metadata.
    // Initialized FIRST so the broker-aware default (below) can look it up.
    // ══════════════════════════════════════════════════════════════════
    this.assetRegistry = {
      // ── CRYPTO (Kraken) ─────────────────────────────────────────────
      'BTC-USD':   { broker: 'kraken', krakenRest: 'XXBTZUSD',   krakenWs: 'XBT/USD',   base: 'BTC',  decimals: 1, minOrder: 0.0001,  label: 'Bitcoin',    assetClass: 'crypto' },
      'ETH-USD':   { broker: 'kraken', krakenRest: 'XETHZUSD',   krakenWs: 'ETH/USD',   base: 'ETH',  decimals: 2, minOrder: 0.001,   label: 'Ethereum',   assetClass: 'crypto' },
      'SOL-USD':   { broker: 'kraken', krakenRest: 'SOLUSD',     krakenWs: 'SOL/USD',   base: 'SOL',  decimals: 2, minOrder: 0.01,    label: 'Solana',     assetClass: 'crypto' },
      'XRP-USD':   { broker: 'kraken', krakenRest: 'XXRPZUSD',   krakenWs: 'XRP/USD',   base: 'XRP',  decimals: 4, minOrder: 1,       label: 'Ripple',     assetClass: 'crypto' },
      'ADA-USD':   { broker: 'kraken', krakenRest: 'ADAUSD',     krakenWs: 'ADA/USD',   base: 'ADA',  decimals: 4, minOrder: 1,       label: 'Cardano',    assetClass: 'crypto' },
      'DOT-USD':   { broker: 'kraken', krakenRest: 'DOTUSD',     krakenWs: 'DOT/USD',   base: 'DOT',  decimals: 3, minOrder: 0.1,     label: 'Polkadot',   assetClass: 'crypto' },
      'AVAX-USD':  { broker: 'kraken', krakenRest: 'AVAXUSD',    krakenWs: 'AVAX/USD',  base: 'AVAX', decimals: 2, minOrder: 0.01,    label: 'Avalanche',  assetClass: 'crypto' },
      'LINK-USD':  { broker: 'kraken', krakenRest: 'LINKUSD',    krakenWs: 'LINK/USD',  base: 'LINK', decimals: 3, minOrder: 0.1,     label: 'Chainlink',  assetClass: 'crypto' },
      'MATIC-USD': { broker: 'kraken', krakenRest: 'MATICUSD',   krakenWs: 'MATIC/USD', base: 'MATIC',decimals: 4, minOrder: 1,       label: 'Polygon',    assetClass: 'crypto' },
      'UNI-USD':   { broker: 'kraken', krakenRest: 'UNIUSD',     krakenWs: 'UNI/USD',   base: 'UNI',  decimals: 3, minOrder: 0.1,     label: 'Uniswap',    assetClass: 'crypto' },
      'ATOM-USD':  { broker: 'kraken', krakenRest: 'ATOMUSD',    krakenWs: 'ATOM/USD',  base: 'ATOM', decimals: 3, minOrder: 0.1,     label: 'Cosmos',     assetClass: 'crypto' },
      'LTC-USD':   { broker: 'kraken', krakenRest: 'XLTCZUSD',   krakenWs: 'LTC/USD',   base: 'LTC',  decimals: 2, minOrder: 0.01,    label: 'Litecoin',   assetClass: 'crypto' },
      'DOGE-USD':  { broker: 'kraken', krakenRest: 'XDGUSD',     krakenWs: 'DOGE/USD',  base: 'DOGE', decimals: 5, minOrder: 10,      label: 'Dogecoin',   assetClass: 'crypto' },
      'SHIB-USD':  { broker: 'kraken', krakenRest: 'SHIBUSD',    krakenWs: 'SHIB/USD',  base: 'SHIB', decimals: 8, minOrder: 100000,  label: 'Shiba Inu',  assetClass: 'crypto' },
      'APT-USD':   { broker: 'kraken', krakenRest: 'APTUSD',     krakenWs: 'APT/USD',   base: 'APT',  decimals: 3, minOrder: 0.1,     label: 'Aptos',      assetClass: 'crypto' },

      // ── STOCKS (Alpaca) ─────────────────────────────────────────────
      'TSLA':      { broker: 'alpaca', base: 'TSLA',  decimals: 2, minOrder: 1, label: 'Tesla',          assetClass: 'stocks' },
      'AAPL':      { broker: 'alpaca', base: 'AAPL',  decimals: 2, minOrder: 1, label: 'Apple',          assetClass: 'stocks' },
      'NVDA':      { broker: 'alpaca', base: 'NVDA',  decimals: 2, minOrder: 1, label: 'NVIDIA',         assetClass: 'stocks' },
      'SPY':       { broker: 'alpaca', base: 'SPY',   decimals: 2, minOrder: 1, label: 'S&P 500 ETF',    assetClass: 'stocks' },
      'QQQ':       { broker: 'alpaca', base: 'QQQ',   decimals: 2, minOrder: 1, label: 'Nasdaq 100 ETF', assetClass: 'stocks' },
      'AMD':       { broker: 'alpaca', base: 'AMD',   decimals: 2, minOrder: 1, label: 'AMD',            assetClass: 'stocks' },
      'AMZN':      { broker: 'alpaca', base: 'AMZN',  decimals: 2, minOrder: 1, label: 'Amazon',         assetClass: 'stocks' },
      'MSFT':      { broker: 'alpaca', base: 'MSFT',  decimals: 2, minOrder: 1, label: 'Microsoft',      assetClass: 'stocks' },
      'GOOG':      { broker: 'alpaca', base: 'GOOG',  decimals: 2, minOrder: 1, label: 'Google',         assetClass: 'stocks' },
      'META':      { broker: 'alpaca', base: 'META',  decimals: 2, minOrder: 1, label: 'Meta',           assetClass: 'stocks' },
      'NFLX':      { broker: 'alpaca', base: 'NFLX',  decimals: 2, minOrder: 1, label: 'Netflix',        assetClass: 'stocks' },
      'COIN':      { broker: 'alpaca', base: 'COIN',  decimals: 2, minOrder: 1, label: 'Coinbase',       assetClass: 'stocks' },
      'RIOT':      { broker: 'alpaca', base: 'RIOT',  decimals: 2, minOrder: 1, label: 'Riot Platforms', assetClass: 'stocks' },
      'MARA':      { broker: 'alpaca', base: 'MARA',  decimals: 2, minOrder: 1, label: 'Marathon Digital',assetClass: 'stocks' },
      'PLTR':      { broker: 'alpaca', base: 'PLTR',  decimals: 2, minOrder: 1, label: 'Palantir',       assetClass: 'stocks' },
    };

    // Broker-aware default asset — prevents crypto/stock mismatch when BROKER
    // is changed without also updating TRADING_PAIR. Mercury 2026-04-22 catch:
    // the prior hardcoded 'BTC-USD' default fired even on Alpaca broker runs.
    // When TRADING_PAIR is explicitly set, that always wins.
    let defaultAsset = 'BTC-USD';
    const activeBroker = (process.env.BROKER || 'kraken').toLowerCase();
    if (activeBroker !== 'kraken') {
      const match = Object.entries(this.assetRegistry).find(
        ([, info]) => info.broker === activeBroker
      );
      if (match) defaultAsset = match[0];
    }
    this.activeAsset = process.env.TRADING_PAIR || defaultAsset;

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
    const normalized = this._normalize(symbol);
    return this.assetRegistry[normalized] || null;
  }

  /**
   * Standard → Kraken REST API format
   * 'BTC-USD' → 'XXBTZUSD'
   */
  toKrakenRest(symbol) {
    const cfg = this.getConfig(symbol);
    if (cfg?.broker === 'alpaca') return null; // Stock symbols don't have Kraken mapping
    return cfg?.krakenRest || symbol.replace('-', '').replace('/', '');
  }

  /**
   * Standard → Kraken WebSocket format
   * 'BTC-USD' → 'XBT/USD'
   */
  toKrakenWs(symbol) {
    const cfg = this.getConfig(symbol);
    if (cfg?.broker === 'alpaca') return null; // Stock symbols don't have Kraken mapping
    return cfg?.krakenWs || symbol.replace('-', '/');
  }

  /**
   * Standard → broker-neutral format
   * 'BTC-USD' → 'BTC/USD'
   */
  toSlashFormat(symbol) {
    return this._normalize(symbol).replace('-', '/');
  }

  /**
   * Kraken WS pair → Standard format
   * 'XBT/USD' → 'BTC-USD'
   */
  fromKrakenWs(krakenPair) {
    for (const [standard, cfg] of Object.entries(this.assetRegistry)) {
      if (cfg.krakenWs === krakenPair) return standard;
    }
    return krakenPair.replace('/', '-');
  }

  /** Normalize any format to 'BTC-USD' style */
  _normalize(symbol) {
    if (!symbol) return this.activeAsset;
    // Handle 'BTC/USD' → 'BTC-USD'
    let s = symbol.toUpperCase().replace('/', '-');
    // Handle 'BTCUSD' → 'BTC-USD' (known pairs)
    for (const key of Object.keys(this.assetRegistry)) {
      if (s === key) return key;
      const cfg = this.assetRegistry[key];
      if (s === cfg.krakenRest || s === cfg.krakenWs?.replace('/', '-') || s === cfg.base + 'USD' || s === cfg.base + '-USD') {
        return key;
      }
    }
    return s;
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
  async switchAsset(newAsset) {
    const normalized = this._normalize(newAsset);
    const config = this.getConfig(normalized);

    if (!config) {
      console.warn(`⚠️ MultiAsset: Unknown asset ${newAsset}`);
      this._notifyDashboard('asset_change_error', { error: `Unknown asset: ${newAsset}` });
      return false;
    }

    if (normalized === this.activeAsset) {
      console.log(`📊 MultiAsset: Already on ${normalized}`);
      return true;
    }

    const oldAsset = this.activeAsset;
    console.log(`🔄 MultiAsset: Switching ${oldAsset} → ${normalized} (${config.label})`);

    // ── 1. Cache current candle history ──────────────────────────────
    if (this.bot.priceHistory && this.bot.priceHistory.length > 0) {
      this.candleCache[oldAsset] = [...this.bot.priceHistory];
      console.log(`   💾 Cached ${this.bot.priceHistory.length} candles for ${oldAsset}`);
    }

    // ── 2. Update active asset ──────────────────────────────────────
    this.activeAsset = normalized;
    this.bot.config.tradingPair = normalized;
    this.bot.tradingPair = this.toSlashFormat(normalized);

    // ── 3. Clear current price history ──────────────────────────────
    // Restore from cache if we've been on this asset before
    if (this.candleCache[normalized] && this.candleCache[normalized].length > 0) {
      this.bot.priceHistory = this.candleCache[normalized];
      console.log(`   📂 Restored ${this.bot.priceHistory.length} cached candles for ${normalized}`);
    } else {
      this.bot.priceHistory = [];
      console.log(`   🧹 Cleared price history for fresh ${normalized} data`);
    }

    // ── 4. Route to correct broker ──────────────────────────────────
    if (config.broker === 'alpaca') {
      console.log(`   📈 Routing to Alpaca (stocks)`);
      // Stock assets don't use Kraken WS — skip Kraken resubscription
      // Future: connect Alpaca data stream here
    } else {
      // Crypto — resubscribe Kraken WebSocket
      this._resubscribeWs(config);
    }

    // ── 5. Fetch historical candles ─────────────────────────────────
    try {
      await this.bot.fetchAndSendHistoricalCandles('1m', 200);
    } catch (err) {
      console.warn(`   ⚠️ Historical fetch failed: ${err.message}`);
    }

    // ── 6. Notify dashboard ─────────────────────────────────────────
    this._notifyDashboard('asset_switched', {
      asset: normalized,
      label: config.label,
      base: config.base,
      broker: config.broker,
      assetClass: config.assetClass,
      krakenPair: config.krakenWs || null,
      decimals: config.decimals,
      minOrder: config.minOrder
    });

    console.log(`✅ MultiAsset: Now trading ${config.label} (${normalized})`);
    return true;
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
      console.warn('   ⚠️ Kraken WS not connected, will subscribe on reconnect');
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
    console.log(`   📡 Resubscribed: ${oldWsPair} → ${wsPair} (ticker + ${ohlcIntervals.length} OHLC)`);
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
