/**
 * kraken-depth-adapter.js - L2/L3 Order Book Scanner
 * Processes raw Kraken depth data for whale wall detection and TPO density.
 *
 * isLive is supplied by the caller or inferred from the current book depth.
 * The helper is stateless; adapter instances own runtime feed liveness.
 *
 * Dashboard-only adapter: emits depth_update frames, never trading decisions.
 */
'use strict';

const KrakenDepth = {
    WALL_MIN_USD: 2000000, // $2M+ qualifies as whale wall

    _toFiniteNumber: function(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    },

    _normalizeLevels: function(levels) {
        if (!Array.isArray(levels)) return [];
        const normalized = [];
        for (const level of levels) {
            if (!Array.isArray(level) || level.length < 2) continue;
            const price = this._toFiniteNumber(level[0]);
            const size = this._toFiniteNumber(level[1]);
            if (price === null || size === null || price <= 0 || size < 0) continue;
            normalized.push([price, size]);
        }
        return normalized;
    },

    process: function(rawBook, metadata = {}) {
        const symbol = metadata.symbol || rawBook?.symbol || null;
        if (!symbol) return null;

        const bids = this._normalizeLevels(rawBook?.bids);
        const asks = this._normalizeLevels(rawBook?.asks);
        if (bids.length === 0 && asks.length === 0) return null;

        const isLive = Boolean(metadata.isLive || rawBook?.isLive || bids.length > 10 || asks.length > 10);

        const walls = [];

        // Scan Bids
        bids.forEach(([price, size]) => {
            const usd = price * size;
            if (usd >= this.WALL_MIN_USD) {
                walls.push({ price, size: usd, side: 'BID' });
            }
        });

        // Scan Asks
        asks.forEach(([price, size]) => {
            const usd = price * size;
            if (usd >= this.WALL_MIN_USD) {
                walls.push({ price, size: usd, side: 'ASK' });
            }
        });

        const source = metadata.source || rawBook?.source;
        if (!source) return null;

        return {
            type: 'depth_update',
            symbol,
            source,
            isLive,
            walls: walls.sort((a, b) => b.size - a.size).slice(0, 15),
            density: [], // Populated from full book binning when available
            depth: {
                bids: bids.slice(0, 25),
                asks: asks.slice(0, 25)
            },
            timestamp: metadata.timestamp || rawBook?.timestamp || Date.now()
        };
    },

    _resetForTest: function() {
        // Stateless helper retained for existing tests.
    }
};

module.exports = KrakenDepth;
