/**
 * trade-log.js - Real-time Execution Ticker
 *
 * Renders a session summary header (cumulative P&L, count, W/L) above
 * the live trade rows. Header updates on every addEntry. Trey: "very
 * unclear as to what is going on can we get a session pnl or something
 * an overall that its counting from."
 *
 * Header values are local-running totals (independent of state.json) so
 * the operator sees what THIS dashboard session has logged. State.json's
 * persistent counters are surfaced separately in Performance Stats.
 */
(function(OGZ) {
    'use strict';

    const SESSION_STATS_ID = 'tradeLogSessionStats';

    const session = {
        startedAt: Date.now(),
        count: 0,
        wins: 0,
        losses: 0,
        cumulativePnl: 0,
    };

    function ensureHeader(container) {
        let header = document.getElementById(SESSION_STATS_ID);
        if (header) return header;
        header = document.createElement('div');
        header.id = SESSION_STATS_ID;
        header.style.cssText = `
            display:grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap:6px;
            padding:8px 10px 10px;
            border-bottom:1px solid rgba(255,255,255,0.08);
            background:rgba(0,0,0,0.25);
            font-family:'JetBrains Mono',monospace;
            font-size:10px;
            color:#a1a1aa;
            letter-spacing:0.04em;
            text-transform:uppercase;
        `;
        // Insert as the FIRST child so it stays at top while rows are prepended below
        container.insertBefore(header, container.firstChild);
        return header;
    }

    function renderHeader(container) {
        const header = ensureHeader(container);
        const pnl = session.cumulativePnl;
        const pnlSign = pnl >= 0 ? '+$' : '-$';
        const pnlColor = pnl > 0 ? '#22c55e' : pnl < 0 ? '#ef4444' : '#a1a1aa';
        const wr = session.count > 0 ? (session.wins / session.count) * 100 : 0;
        const wrColor = wr >= 50 ? '#22c55e' : wr > 0 ? '#fbbf24' : '#a1a1aa';

        header.innerHTML = `
            <div>
                <div style="font-size:9px; color:#71717a;">Session P&L</div>
                <div style="font-family:'Orbitron',monospace; font-size:14px; font-weight:800; color:${pnlColor}; margin-top:2px;">
                    ${pnlSign}${Math.abs(pnl).toFixed(2)}
                </div>
            </div>
            <div>
                <div style="font-size:9px; color:#71717a;">Trades</div>
                <div style="font-family:'Orbitron',monospace; font-size:14px; font-weight:800; color:#e4e4e7; margin-top:2px;">
                    ${session.count}
                </div>
                <div style="font-size:9px; color:#71717a; margin-top:2px;">
                    ${session.wins}W · ${session.losses}L
                </div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:9px; color:#71717a;">Win Rate</div>
                <div style="font-family:'Orbitron',monospace; font-size:14px; font-weight:800; color:${wrColor}; margin-top:2px;">
                    ${wr.toFixed(0)}%
                </div>
            </div>
        `;
    }

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

            if (hasPnl) {
                row.style.background = pnl >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)';
                // Only count CLOSED trades (those that have a P&L) toward W/L stats.
                // Open BUY entries arrive without pnl — they count toward `count`
                // when they later close. Treat any pnl-bearing event as a close.
                session.count++;
                session.cumulativePnl += pnl;
                if (pnl > 0) session.wins++;
                else if (pnl < 0) session.losses++;
            }

            row.innerHTML = `
                <div style="color:${sideColor}; font-weight:900; letter-spacing:1px;">${side}</div>
                <div style="font-family:'Orbitron',monospace; font-size:12px; color:#e4e4e7;">$${parseFloat(price).toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
                <div style="font-family:'JetBrains Mono',monospace; font-size:12px; color:${pnlColor}; text-align:right;">${pnlText}</div>
                <div style="text-align:right; color:#71717a; font-size:10px; font-family:'JetBrains Mono',monospace;">${timestamp}</div>
            `;

            // Insert row AFTER the sticky session header (which lives at firstChild).
            const header = document.getElementById(SESSION_STATS_ID);
            if (header && header.nextSibling) {
                container.insertBefore(row, header.nextSibling);
            } else {
                container.prepend(row);
            }
            // Cap row count at 100 (session header doesn't count toward DOM bloat).
            const dataRows = Array.from(container.children).filter(c => c.id !== SESSION_STATS_ID);
            if (dataRows.length > 100) dataRows[dataRows.length - 1].remove();

            renderHeader(container);
        },

        resetSession: function() {
            session.startedAt = Date.now();
            session.count = 0;
            session.wins = 0;
            session.losses = 0;
            session.cumulativePnl = 0;
            const container = document.getElementById('tradeLog');
            if (container) renderHeader(container);
        }
    };

    // Initial header on first DOM-ready
    document.addEventListener('DOMContentLoaded', () => {
        const c = document.getElementById('tradeLog');
        if (c) renderHeader(c);
    });

    OGZ.register('TradeLog', TradeLog);
})(window.OGZ);
