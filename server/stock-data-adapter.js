/**
 * stock-data-adapter.js - Alpaca Stock Data for Dashboard
 * Fetches real historical candles for stock tickers.
 * Crypto tickers bypass this and go through Kraken as before.
 */
'use strict';

const { resolveDashboardStockDataConfig } = require('./dashboard-stock-stream-config');

function resolveRequestConfig(options = {}) {
    return options.config || resolveDashboardStockDataConfig(process.env);
}

function missingRequestConfigKeys(config) {
    const missing = [];
    if (!String(config?.apiKey || '').trim()) missing.push('ALPACA_API_KEY');
    if (!String(config?.apiSecret || '').trim()) missing.push('ALPACA_API_SECRET');
    if (!String(config?.dataUrl || '').trim()) missing.push('ALPACA_STOCK_DATA_URL');
    if (!String(config?.feed || '').trim()) missing.push('ALPACA_STOCK_DATA_FEED');
    if (!String(config?.adjustment || '').trim()) missing.push('ALPACA_STOCK_DATA_ADJUSTMENT');
    if (!Number.isInteger(config?.tickerMaxAgeMs) || config.tickerMaxAgeMs <= 0) {
        missing.push('STOCK_TICKER_MAX_AGE_MS');
    }
    if (!Array.isArray(config?.stockSymbols) || config.stockSymbols.length === 0) {
        missing.push('DASHBOARD_STOCK_PRICE_SYMBOLS');
    }
    if (!config?.timeframes || typeof config.timeframes !== 'object') {
        missing.push('DASHBOARD_STOCK_TIMEFRAME_CONFIG');
    }
    return missing;
}

function stockDataConfigReject(symbol, config) {
    const missing = missingRequestConfigKeys(config);
    const reason = missing.includes('ALPACA_API_KEY') || missing.includes('ALPACA_API_SECRET')
        ? 'missing_credentials'
        : 'missing_stock_data_config';
    console.error(`[StockAdapter] Missing required Alpaca stock data config for ${symbol}: ${missing.join(', ') || 'unknown'}`);
    return stockTickerReject(symbol, reason, { missing });
}

function isStock(ticker, options = {}) {
    const config = resolveRequestConfig(options);
    const clean = ticker.replace('-USD', '').replace('/', '').toUpperCase();
    return Array.isArray(config.stockSymbols) && config.stockSymbols.includes(clean);
}

function cleanTicker(ticker) {
    return ticker.replace('-USD', '').replace('/', '').toUpperCase();
}

function toEpochSeconds(value) {
    const numeric = Number(value);
    if (value !== null && value !== '' && Number.isFinite(numeric)) {
        return Math.floor(numeric > 1e12 ? numeric / 1000 : numeric);
    }

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : NaN;
}

async function fetchStockCandles(ticker, timeframe = '15m', limit = 500, options = {}) {
    const config = resolveRequestConfig(options);
    const symbol = cleanTicker(ticker);
    if (missingRequestConfigKeys(config).length > 0) {
        stockDataConfigReject(symbol, config);
        return null;
    }
    if (!config.stockSymbols.includes(symbol)) {
        console.error(`[StockAdapter] Unsupported stock candle symbol ${symbol}: not in DASHBOARD_STOCK_PRICE_SYMBOLS`);
        return null;
    }

    const timeframeConfig = config.timeframes[timeframe];
    if (!timeframeConfig) {
        console.error(`[StockAdapter] Unsupported stock candle timeframe ${timeframe} for ${symbol}`);
        return null;
    }

    // Calculate start date based on limit and timeframe
    const now = new Date();
    // Go back further than needed to account for market hours only
    const start = new Date(now.getTime() - (timeframeConfig.intervalMs * limit * 3));

    const params = new URLSearchParams({
        start: start.toISOString(),
        end: now.toISOString(),
        timeframe: timeframeConfig.alpaca,
        limit: String(limit),
        adjustment: config.adjustment,
        feed: config.feed,
        sort: 'desc'
    });

    const url = `${config.dataUrl}/${symbol}/bars?${params}`;

    try {
        const response = await fetch(url, {
            headers: {
                'APCA-API-KEY-ID': config.apiKey,
                'APCA-API-SECRET-KEY': config.apiSecret
            }
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`[StockAdapter] HTTP ${response.status} for ${symbol}: ${text}`);
            return null;
        }

        const data = await response.json();
        const bars = data.bars || [];

        if (bars.length === 0) {
            console.warn(`[StockAdapter] No bars returned for ${symbol} @ ${timeframe}`);
            return null;
        }

        const candles = bars.map(bar => ({
            time: toEpochSeconds(bar.t),
            open: Number(bar.o),
            high: Number(bar.h),
            low: Number(bar.l),
            close: Number(bar.c),
            volume: Number(bar.v)
        }))
            .filter(c => (
                Number.isFinite(c.time) &&
                Number.isFinite(c.open) &&
                Number.isFinite(c.high) &&
                Number.isFinite(c.low) &&
                Number.isFinite(c.close) &&
                Number.isFinite(c.volume)
            ))
            .sort((a, b) => a.time - b.time);

        if (candles.length === 0) {
            console.warn(`[StockAdapter] No valid bars returned for ${symbol} @ ${timeframe}`);
            return null;
        }

        console.log(`[StockAdapter] ${candles.length} candles for ${symbol} @ ${timeframe}`);
        return candles;

    } catch (err) {
        console.error(`[StockAdapter] Fetch error for ${symbol}:`, err.message);
        return null;
    }
}

function stockTickerReject(symbol, reason, details = {}) {
    return {
        ok: false,
        symbol,
        reason,
        ...details
    };
}

async function fetchStockTickerResult(ticker, options = {}) {
    const symbol = cleanTicker(ticker);
    const config = resolveRequestConfig(options);
    if (missingRequestConfigKeys(config).length > 0) {
        return stockDataConfigReject(symbol, config);
    }
    if (!config.stockSymbols.includes(symbol)) {
        return stockTickerReject(symbol, 'not_stock_symbol');
    }

    const params = new URLSearchParams({ feed: config.feed });
    const url = `${config.dataUrl}/${symbol}/snapshot?${params}`;

    try {
        const response = await fetch(url, {
            headers: {
                'APCA-API-KEY-ID': config.apiKey,
                'APCA-API-SECRET-KEY': config.apiSecret
            }
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`[StockAdapter] Snapshot HTTP ${response.status} for ${symbol}: ${text}`);
            return stockTickerReject(symbol, 'http_error', { status: response.status });
        }

        const snap = await response.json();
        const latestTradePrice = Number(snap.latestTrade?.p);
        const minuteClose = Number(snap.minuteBar?.c);
        const dayClose = Number(snap.dailyBar?.c);
        const price = Number.isFinite(latestTradePrice) && latestTradePrice > 0
            ? latestTradePrice
            : Number.isFinite(minuteClose) && minuteClose > 0
                ? minuteClose
                : Number.isFinite(dayClose) && dayClose > 0
                    ? dayClose
                    : null;

        if (!Number.isFinite(price) || price <= 0) {
            return stockTickerReject(symbol, 'invalid_price');
        }

        const prevClose = Number(snap.prevDailyBar?.c);
        const change = Number.isFinite(prevClose) && prevClose > 0 ? price - prevClose : null;
        const changePct = change != null ? (change / prevClose) * 100 : null;
        const volume = Number(snap.dailyBar?.v ?? snap.minuteBar?.v);
        const sourceTimestamp = snap.latestTrade?.t || snap.minuteBar?.t || snap.dailyBar?.t;
        const parsedTimestamp = new Date(sourceTimestamp).getTime();
        if (!Number.isFinite(parsedTimestamp)) {
            return stockTickerReject(symbol, 'invalid_timestamp');
        }
        const ageMs = Date.now() - parsedTimestamp;
        if (ageMs > config.tickerMaxAgeMs) {
            return stockTickerReject(symbol, 'stale_snapshot', {
                ageMs,
                maxAgeMs: config.tickerMaxAgeMs,
                sourceTimestamp: parsedTimestamp
            });
        }

        return {
            ok: true,
            ticker: {
                symbol,
                price,
                close: price,
                change,
                changePct,
                volume: Number.isFinite(volume) ? volume : null,
                timestamp: parsedTimestamp,
                source: 'alpaca',
                feed: config.feed
            }
        };

    } catch (err) {
        console.error(`[StockAdapter] Snapshot fetch error for ${symbol}:`, err.message);
        return stockTickerReject(symbol, 'fetch_error', { error: err.message });
    }
}

async function fetchStockTicker(ticker, options = {}) {
    const result = await fetchStockTickerResult(ticker, options);
    if (result.ok) return result.ticker;

    if (typeof options.onReject === 'function') {
        try {
            options.onReject(result);
        } catch (err) {
            console.error('[StockAdapter] Snapshot reject handler failed:', err.message);
        }
    }

    return null;
}

module.exports = {
    isStock,
    fetchStockCandles,
    fetchStockTicker,
    fetchStockTickerResult,
    cleanTicker
};
