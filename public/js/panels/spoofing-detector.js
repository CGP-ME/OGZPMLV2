/**
 * spoofing-detector.js - Whale Wall Pulling Detection
 * Detects when $2M+ walls are pulled within 0.1% proximity of price.
 *
 * PARKED: This file exists on disk but is NOT loaded in the script block.
 * Zero handlers registered in core.js. Awaits spoof_alert backend emitter.
 * When ready: add <script src="/js/panels/spoofing-detector.js"></script>
 * and register handler in core.js: socket.registerHandler('spoof_alert', ...)
 */
'use strict';

const SpoofingDetector = {
    previousWalls: { bids: new Map(), asks: new Map() },
    SPOOF_THRESHOLD_USD: 2000000,
    PROXIMITY_THRESHOLD: 0.001,

    detectSpoofs: function(currentBook, currentPrice) {
        const spoofs = [];

        const checkSide = (currentLevels, side) => {
            const currentMap = new Map(currentLevels.map(l => [parseFloat(l[0]), parseFloat(l[1]) * parseFloat(l[0])]));
            const prevMap = side === 'BID' ? this.previousWalls.bids : this.previousWalls.asks;

            prevMap.forEach((prevValue, price) => {
                const currentValue = currentMap.get(price) || 0;
                const valueDropped = prevValue - currentValue;

                if (valueDropped >= this.SPOOF_THRESHOLD_USD) {
                    const proximity = Math.abs((price - currentPrice) / currentPrice);
                    if (proximity <= this.PROXIMITY_THRESHOLD) {
                        spoofs.push({
                            price: price,
                            valuePulled: valueDropped,
                            side: side,
                            type: side === 'BID' ? 'FAKE_SUPPORT' : 'FAKE_RESISTANCE',
                            timestamp: Date.now()
                        });
                    }
                }
            });

            if (side === 'BID') this.previousWalls.bids = currentMap;
            else this.previousWalls.asks = currentMap;
        };

        checkSide(currentBook.bids, 'BID');
        checkSide(currentBook.asks, 'ASK');

        return spoofs.length > 0 ? { type: 'spoof_alert', alerts: spoofs } : null;
    }
};

if (typeof module !== 'undefined') module.exports = SpoofingDetector;
