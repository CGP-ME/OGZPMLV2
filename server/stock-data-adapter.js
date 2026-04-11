/**
 * stock-data-adapter.js - Alpaca Stock Data for Dashboard
 * Fetches real historical candles for stock tickers.
 * Crypto tickers bypass this and go through Kraken as before.
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const API_KEY = process.env.ALPACA_API_KEY;
const API_SECRET = process.env.ALPACA_API_SECRET;
const DATA_URL = 'https://data.sandbox.alpaca.markets/v2/stocks';

// Stock tickers this adapter handles — everything else goes to Kraken
const STOCK_TICKERS = new Set([
    'TSLA', 'NVDA', 'AAPL', 'AMZN', 'MSFT', 'GOOGL', 'META', 'AMD',
    'NFLX', 'SPY', 'QQQ', 'PLTR', 'COIN', 'RIOT', 'MARA'
]);

const TIMEFRAME_MAP = {
    '1m': '1Min', '5m': '5Min', '15m': '15Min', '30m': '30Min',
    '1h': '1Hour', '4h': '4Hour', '1d': '1Day'
};

function isStock(ticker) {
    // Strip -USD suffix if present, check against stock list
    const clean = ticker.replace('-USD', '').replace('/', '').toUpperCase();
    return STOCK_TICKERS.has(clean);
}

function cleanTicker(ticker) {
    return ticker.replace('-USD', '').replace('/', '').toUpperCase();
}

async function fetchStockCandles(ticker, timeframe = '15m', limit = 500) {
    if (!API_KEY || !API_SECRET) {
        console.error('[StockAdapter] ALPACA_API_KEY and ALPACA_API_SECRET required');
        return null;
    }

    const symbol = cleanTicker(ticker);
    const alpacaTf = TIMEFRAME_MAP[timeframe] || '15Min';

    // Calculate start date based on limit and timeframe
    const now = new Date();
    let msPerBar;
    switch (timeframe) {
        case '1m': msPerBar = 60000; break;
        case '5m': msPerBar = 300000; break;
        case '15m': msPerBar = 900000; break;
        case '30m': msPerBar = 1800000; break;
        case '1h': msPerBar = 3600000; break;
        case '4h': msPerBar = 14400000; break;
        case '1d': msPerBar = 86400000; break;
        default: msPerBar = 900000;
    }
    // Go back further than needed to account for market hours only
    const start = new Date(now.getTime() - (msPerBar * limit * 3));

    const params = new URLSearchParams({
        start: start.toISOString(),
        end: now.toISOString(),
        timeframe: alpacaTf,
        limit: String(limit),
        adjustment: 'split'
    });

    const url = `${DATA_URL}/${symbol}/bars?${params}`;

    try {
        const response = await fetch(url, {
            headers: {
                'APCA-API-KEY-ID': API_KEY,
                'APCA-API-SECRET-KEY': API_SECRET
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

        // Convert Alpaca format to OGZPrime candle format
        const candles = bars.map(bar => ({
            t: new Date(bar.t).getTime(),
            o: bar.o,
            h: bar.h,
            l: bar.l,
            c: bar.c,
            v: bar.v
        }));

        console.log(`[StockAdapter] ${candles.length} candles for ${symbol} @ ${timeframe}`);
        return candles;

    } catch (err) {
        console.error(`[StockAdapter] Fetch error for ${symbol}:`, err.message);
        return null;
    }
}

module.exports = { isStock, fetchStockCandles, STOCK_TICKERS, cleanTicker };
