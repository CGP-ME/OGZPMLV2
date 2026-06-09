'use strict';

const ASSET_REGISTRY = Object.freeze({
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
    'DOGE-USD':  { broker: 'kraken', krakenRest: 'XDGUSD',     krakenWs: 'XDG/USD',   base: 'DOGE', decimals: 5, minOrder: 10,      label: 'Dogecoin',   assetClass: 'crypto' },
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
});

function normalizeAssetSymbol(symbol) {
    if (typeof symbol !== 'string' || !symbol.trim()) return null;

    const raw = symbol.trim().toUpperCase();
    const dashed = raw.replace('/', '-');

    for (const [canonical, cfg] of Object.entries(ASSET_REGISTRY)) {
        if (dashed === canonical) return canonical;

        const krakenRest = cfg.krakenRest ? cfg.krakenRest.toUpperCase() : null;
        if (krakenRest && raw === krakenRest) return canonical;

        const krakenWs = cfg.krakenWs ? cfg.krakenWs.toUpperCase() : null;
        if (krakenWs && (
            raw === krakenWs ||
            raw === krakenWs.replace('/', '') ||
            dashed === krakenWs.replace('/', '-')
        )) {
            return canonical;
        }

        if (cfg.base) {
            const base = cfg.base.toUpperCase();
            if (dashed === `${base}-USD` || raw === `${base}USD`) return canonical;
        }
    }

    return null;
}

function getAssetConfig(symbol) {
    const canonical = normalizeAssetSymbol(symbol);
    return canonical ? ASSET_REGISTRY[canonical] : null;
}

module.exports = { ASSET_REGISTRY, normalizeAssetSymbol, getAssetConfig };
