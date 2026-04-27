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
            row.style = 'display:grid; grid-template-columns: 60px 1fr 1fr 70px; gap:8px; padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.05); font-size:11px; align-items:center;';

            const side = (trade.action || trade.side || 'UNKNOWN').toUpperCase();
            const sideColor = side === 'BUY' ? '#22c55e' : '#ef4444';
            const price = trade.price || trade.entryPrice || 0;
            const timestamp = trade.timestamp ? new Date(trade.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

            const pnl = (trade.pnl != null) ? Number(trade.pnl) : null;
            const hasPnl = Number.isFinite(pnl);
            const pnlText = hasPnl ? (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2) : '—';
            const pnlColor = !hasPnl ? '#71717a' : (pnl >= 0 ? '#22c55e' : '#ef4444');

            // Tint the row faintly by P&L sign (or leave neutral for entries)
            if (hasPnl) {
                row.style.background = pnl >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)';
            }

            row.innerHTML = `
                <div style="color:${sideColor}; font-weight:900; letter-spacing:1px;">${side}</div>
                <div style="font-family:'Orbitron',monospace; font-size:12px; color:#e4e4e7;">$${parseFloat(price).toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
                <div style="font-family:'JetBrains Mono',monospace; font-size:12px; color:${pnlColor}; text-align:right;">${pnlText}</div>
                <div style="text-align:right; color:#71717a; font-size:10px; font-family:'JetBrains Mono',monospace;">${timestamp}</div>
            `;

            container.prepend(row);
            if (container.children.length > 100) container.lastChild.remove();
        }
    };

    OGZ.register('TradeLog', TradeLog);
})(window.OGZ);
