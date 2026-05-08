// CC-C Multi-Symbol — Commit 1 of 6: SymbolTradingContext (NEW)
//
// Per-symbol container for indicator engine, signal modules, and metadata.
// Replaces the global priceHistory + IndicatorEngine pattern at run-empire-v2.js
// where every candle from every subscribed symbol pushed to a single shared
// array — cross-symbol contamination of indicators and signals.
//
// Trey 2026-05-08 directive #1: priceHistory is a GETTER onto CandleStore.
// CandleStore is the single source of truth (Map<symbol, Map<timeframe,
// candle[]>>); this class never holds its own copy. Eliminates sync risk.
//
// Trey 2026-05-08 directive #2: ASSET_REGISTRY absorbed from MultiAssetManager
// (core/MultiAssetManager.js:34-72) so this file becomes the single source of
// symbol metadata going forward. MultiAssetManager keeps its own copy until
// commit 6 of this refactor deletes the file entirely; during commits 1-5 the
// two copies are duplicated by design (transitional state, MultiAssetManager
// still serves legacy callers).
//
// This file is INERT until commit 2 wires `symbolContexts` into run-empire-v2.
// Phase 0 single-symbol path is unaffected.

const IndicatorEngine = require('./indicators/IndicatorEngine');
const EMASMACrossoverSignal = require('../modules/EMASMACrossoverSignal');
const MADynamicSR = require('../modules/MADynamicSR');
const VolumeProfile = require('./VolumeProfile');
const FibonacciDetector = require('./FibonacciDetector');

// Mercury fix #1: shared frozen empty so the priceHistory getter returns a
// stable reference when CandleStore has no candles yet. Prevents downstream
// consumers caching `const ph = symCtx.priceHistory` then failing reference
// equality on subsequent reads during the cold-start window.
const EMPTY_PRICE_HISTORY = Object.freeze([]);

const ASSET_REGISTRY = {
    // CRYPTO (Kraken)
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

    // STOCKS (Alpaca)
    'TSLA': { broker: 'alpaca', base: 'TSLA', decimals: 2, minOrder: 1, label: 'Tesla',           assetClass: 'stocks' },
    'AAPL': { broker: 'alpaca', base: 'AAPL', decimals: 2, minOrder: 1, label: 'Apple',           assetClass: 'stocks' },
    'NVDA': { broker: 'alpaca', base: 'NVDA', decimals: 2, minOrder: 1, label: 'NVIDIA',          assetClass: 'stocks' },
    'SPY':  { broker: 'alpaca', base: 'SPY',  decimals: 2, minOrder: 1, label: 'S&P 500 ETF',     assetClass: 'stocks' },
    'QQQ':  { broker: 'alpaca', base: 'QQQ',  decimals: 2, minOrder: 1, label: 'Nasdaq 100 ETF',  assetClass: 'stocks' },
    'AMD':  { broker: 'alpaca', base: 'AMD',  decimals: 2, minOrder: 1, label: 'AMD',             assetClass: 'stocks' },
    'AMZN': { broker: 'alpaca', base: 'AMZN', decimals: 2, minOrder: 1, label: 'Amazon',          assetClass: 'stocks' },
    'MSFT': { broker: 'alpaca', base: 'MSFT', decimals: 2, minOrder: 1, label: 'Microsoft',       assetClass: 'stocks' },
    'GOOG': { broker: 'alpaca', base: 'GOOG', decimals: 2, minOrder: 1, label: 'Google',          assetClass: 'stocks' },
    'META': { broker: 'alpaca', base: 'META', decimals: 2, minOrder: 1, label: 'Meta',            assetClass: 'stocks' },
    'NFLX': { broker: 'alpaca', base: 'NFLX', decimals: 2, minOrder: 1, label: 'Netflix',         assetClass: 'stocks' },
    'COIN': { broker: 'alpaca', base: 'COIN', decimals: 2, minOrder: 1, label: 'Coinbase',        assetClass: 'stocks' },
    'RIOT': { broker: 'alpaca', base: 'RIOT', decimals: 2, minOrder: 1, label: 'Riot Platforms',  assetClass: 'stocks' },
    'MARA': { broker: 'alpaca', base: 'MARA', decimals: 2, minOrder: 1, label: 'Marathon Digital',assetClass: 'stocks' },
    'PLTR': { broker: 'alpaca', base: 'PLTR', decimals: 2, minOrder: 1, label: 'Palantir',        assetClass: 'stocks' },
};

class SymbolTradingContext {
    /**
     * @param {string} symbol — e.g. 'TSLA', 'BTC-USD'
     * @param {object} candleStore — instance of core/CandleStore.js (single source of truth for candles)
     * @param {object} [config]
     * @param {string} [config.timeframe='15m']
     * @param {object} [config.indicatorConfig] — passed through to IndicatorEngine
     */
    constructor(symbol, candleStore, config = {}) {
        if (!symbol) throw new Error('SymbolTradingContext: symbol required');
        if (!candleStore) throw new Error('SymbolTradingContext: candleStore required (single source of truth for priceHistory)');
        // Mercury fix #7: timeframe is REQUIRED. No '15m' default. Caller
        // (run-empire-v2.js commit 2) reads broker.candleTimeframe — threaded
        // through ctx in commit b4173b8 — and passes it explicitly. Defaulting
        // silently could pull candles for the wrong timeframe key from
        // CandleStore on a non-15m feed.
        if (!config.timeframe) {
            throw new Error('SymbolTradingContext: config.timeframe required (no default — pass broker.candleTimeframe explicitly)');
        }

        this.symbol = symbol;
        this.timeframe = config.timeframe;
        this.candleStore = candleStore;
        // Mercury fix #2: throw on unknown symbol. Previously warned and fell
        // through to formatPrice/getMinOrderSize generic defaults — a typo
        // (e.g., 'NDVA' instead of 'NVDA') silently traded a phantom symbol.
        // Hard fail at construction so operator sees the error immediately.
        this.metadata = ASSET_REGISTRY[symbol];
        if (!this.metadata) {
            throw new Error(`SymbolTradingContext: unknown symbol '${symbol}' — not in ASSET_REGISTRY. Add it to ASSET_REGISTRY in core/SymbolTradingContext.js or fix the typo.`);
        }

        // Per-symbol indicator + signal modules. Each context instances its
        // own — no cross-symbol state leakage. Wolf's spec lists this set;
        // commit 4 (TradingLoop per-symbol) audits whether other modules
        // (NoWick, BreakRetest, ORB, CandlePattern, OGZTPO) need per-symbol
        // homes too based on their internal state coupling.
        this.indicatorEngine = new IndicatorEngine(config.indicatorConfig);
        this.emaCrossover = new EMASMACrossoverSignal();
        this.maDynamicSR = new MADynamicSR();
        this.volumeProfile = new VolumeProfile();
        this.fibonacciDetector = new FibonacciDetector();

        // Per-symbol last-computed signal outputs. CandleProcessor (commit 3)
        // populates these on every candle by calling the corresponding update().
        this.emaCrossoverSignal = null;
        this.maDynamicSRSignal = null;

        // Latest market data slice (price, volume, timestamp) — populated by
        // CandleProcessor on each new candle. Per-symbol so consumers reading
        // `symCtx.marketData.price` get the right symbol's tick.
        this.marketData = null;
    }

    // SINGLE SOURCE OF TRUTH (Trey 2026-05-08 directive #1):
    // priceHistory is a GETTER onto CandleStore. No separate stored array.
    // Returns the array reference held inside CandleStore — same array that
    // CandleStore mutates on addCandle, so this view is always live. Empty
    // array fallback when CandleStore has no candles for this symbol/tf yet.
    get priceHistory() {
        if (!this.candleStore) return EMPTY_PRICE_HISTORY;
        return this.candleStore.getCandles(this.symbol, this.timeframe) || EMPTY_PRICE_HISTORY;
    }

    // Folded from MultiAssetManager.formatPrice — per-asset display decimals.
    formatPrice(price) {
        const decimals = this.metadata?.decimals ?? 2;
        return parseFloat(price).toFixed(decimals);
    }

    // Folded from MultiAssetManager.getMinOrderSize — per-asset minimum lot.
    getMinOrderSize() {
        return this.metadata?.minOrder ?? 1;
    }

    getBroker()     { return this.metadata?.broker ?? null; }
    getAssetClass() { return this.metadata?.assetClass ?? null; }
    getLabel()      { return this.metadata?.label ?? this.symbol; }
}

module.exports = { SymbolTradingContext, ASSET_REGISTRY };
