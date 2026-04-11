/**
 * system-snapshot.js - Real-time Performance Tracking
 * Maps to production DOM IDs: totalPnl, winRate, tradesExecuted
 */
(function(OGZ) {
    'use strict';

    const Snapshot = {
        update: function(data) {
            if (data.totalPnL !== undefined) {
                const pnlEl = document.getElementById('totalPnl');
                if (pnlEl) {
                    pnlEl.textContent = (data.totalPnL >= 0 ? '+' : '') + '$' + data.totalPnL.toFixed(2);
                    pnlEl.style.color = data.totalPnL >= 0 ? 'var(--profit-color)' : 'var(--loss-color)';
                }
            }
            if (data.winRate !== undefined) {
                const wrEl = document.getElementById('winRate');
                if (wrEl) wrEl.textContent = data.winRate.toFixed(1) + '%';
            }
            if (data.tradeCount !== undefined) {
                const tcEl = document.getElementById('tradesExecuted');
                if (tcEl) tcEl.textContent = data.tradeCount;
            }
        }
    };

    OGZ.register('Snapshot', Snapshot);
})(window.OGZ);
