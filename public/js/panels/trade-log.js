/**
 * trade-log.js - Real-time Execution Ticker
 * Prepends trade entries, prunes at 100 to prevent DOM bloat
 */
(function(OGZ) {
    'use strict';

    const TradeLog = {
        addEntry: function(trade) {
            const container = document.getElementById('tradeLog');
            if (!container) return;

            const row = document.createElement('div');
            row.className = 'trade-row';
            row.style = 'display:grid; grid-template-columns: 1fr 2fr 1fr; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11px; align-items: center;';

            const side = trade.action || trade.side || 'UNKNOWN';
            const sideColor = side === 'BUY' ? 'var(--profit-color)' : 'var(--loss-color)';
            const price = trade.price || trade.entryPrice || 0;
            const timestamp = trade.timestamp ? new Date(trade.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

            row.innerHTML = `
                <div style="color:${sideColor}; font-weight:900; letter-spacing:1px;">${side}</div>
                <div style="font-family: 'Orbitron'; font-size: 13px; color: #fff;">$${parseFloat(price).toLocaleString()}</div>
                <div style="text-align:right; color:#555; font-size:10px;">${timestamp}</div>
            `;

            container.prepend(row);
            if (container.children.length > 100) container.lastChild.remove();
        }
    };

    OGZ.register('TradeLog', TradeLog);
})(window.OGZ);
