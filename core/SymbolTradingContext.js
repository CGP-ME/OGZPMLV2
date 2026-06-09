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
// into the runtime source of truth. It now lives in core/AssetRegistry.js so
// broker adapters can resolve broker-specific symbols without loading indicator
// and strategy modules through SymbolTradingContext.
//
// This file is INERT until commit 2 wires `symbolContexts` into run-empire-v2.
// Phase 0 single-symbol path is unaffected.

const { ASSET_REGISTRY, normalizeAssetSymbol } = require('./AssetRegistry');
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

        const canonicalSymbol = normalizeAssetSymbol(symbol);
        if (!canonicalSymbol) {
            throw new Error(`SymbolTradingContext: unregistered symbol '${symbol}' - add it to core/AssetRegistry.js or fix the typo.`);
        }

        this.symbol = canonicalSymbol;
        this.timeframe = config.timeframe;
        this.candleStore = candleStore;
        // Mercury fix #2: throw on unregistered symbol. Previously warned and fell
        // through to formatPrice/getMinOrderSize generic defaults — a typo
        // (e.g., 'NDVA' instead of 'NVDA') silently traded a phantom symbol.
        // Hard fail at construction so operator sees the error immediately.
        this.metadata = ASSET_REGISTRY[canonicalSymbol];

        // Per-symbol indicator + signal modules. Each context instances its
        // own — no cross-symbol state leakage. Wolf's spec lists this set;
        // commit 4 (TradingLoop per-symbol) audits whether other modules
        // (NoWick, BreakRetest, ORB, CandlePattern, OGZTPO) need per-symbol
        // homes too based on their internal state coupling.
        // FIX 26 (companion to MIRROR-INDICATOR-SYMBOL): thread the per-symbol
        // `symbol` (already in scope as constructor arg) into IndicatorEngine
        // config. Prior code passed config.indicatorConfig verbatim, which is
        // undefined for callers that supply only { timeframe } (e.g.
        // run-empire-v2.js:799). Fix 10's constructor throw exposed this —
        // before Fix 10 the missing symbol silently defaulted to BTC-USD
        // inside what was supposed to be a per-symbol context for TSLA.
        this.indicatorEngine = new IndicatorEngine({ ...config.indicatorConfig, symbol: canonicalSymbol });
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
