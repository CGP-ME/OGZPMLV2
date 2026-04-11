/**
 * kraken-depth-adapter.js - L2/L3 Order Book Scanner
 * Processes raw Kraken depth data for whale wall detection and TPO density.
 *
 * DORMANT: isLive defaults to false. Auto-activates when L2 depth feed
 * provides >10 bid levels. On free/L1 Kraken feeds, this stays dormant.
 *
 * NOT imported into any trading loop file. Backend wiring is separate.
 */
'use strict';

const KrakenDepth = {
    isLive: false,
    WALL_MIN_USD: 2000000, // $2M+ qualifies as whale wall

    process: function(rawBook) {
        // Auto-activate on L2+ feeds
        if (rawBook.bids && rawBook.bids.length > 10) {
            this.isLive = true;
        }

        const walls = [];

        // Scan Bids
        if (rawBook.bids) {
            rawBook.bids.forEach(([price, size]) => {
                const usd = parseFloat(price) * parseFloat(size);
                if (usd >= this.WALL_MIN_USD) {
                    walls.push({ price: parseFloat(price), size: usd, side: 'BID' });
                }
            });
        }

        // Scan Asks
        if (rawBook.asks) {
            rawBook.asks.forEach(([price, size]) => {
                const usd = parseFloat(price) * parseFloat(size);
                if (usd >= this.WALL_MIN_USD) {
                    walls.push({ price: parseFloat(price), size: usd, side: 'ASK' });
                }
            });
        }

        return {
            type: 'depth_update',
            isLive: this.isLive,
            walls: walls.sort((a, b) => b.size - a.size).slice(0, 15),
            density: [], // Populated from full book binning when available
            timestamp: Date.now()
        };
    }
};

module.exports = KrakenDepth;
