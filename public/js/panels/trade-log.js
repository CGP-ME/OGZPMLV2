/**
 * trade-log.js - Real-time Execution Ticker + Session Counters
 *
 * Owns the session counters (P&L / count / wins / losses / startedAt) that
 * back the Session Performance panel above the trade log, and ticks the
 * session timer. Single source of truth — addEntry updates session, then
 * re-renders the Session Performance DOM. core.js consumers can read via
 * TradeLog.getSessionStats() if needed.
 *
 * Trey: "make all of the data... be the same about what it is session
 * or overall — if it's session add a session timer and session labels."
 * This module owns "session" everywhere on the right rail.
 */
(function(OGZ) {
    'use strict';

    const session = {
        startedAt: Date.now(),
        count: 0,
        wins: 0,
        losses: 0,
        cumulativePnl: 0,
    };

    function pad2(n) { return String(n).padStart(2, '0'); }

    function fmtTimer(ms) {
        const totalSec = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
    }

    function tickTimer() {
        const el = document.getElementById('sessionTimer');
        if (el) el.textContent = fmtTimer(Date.now() - session.startedAt);
    }

    function renderSessionPerformance() {
        const pnl = session.cumulativePnl;
        const pnlSign = pnl >= 0 ? '+$' : '-$';
        const pnlColor = pnl > 0 ? '#22c55e' : pnl < 0 ? '#ef4444' : '#e4e4e7';
        const wr = session.count > 0 ? (session.wins / session.count) * 100 : 0;
        const wrColor = wr >= 50 ? '#22c55e' : wr > 0 ? '#fbbf24' : '#e4e4e7';

        const setText = (id, txt, color) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = txt;
            if (color) el.style.color = color;
        };
        setText('totalPnl', pnlSign + Math.abs(pnl).toFixed(2), pnlColor);
        setText('winRate', wr.toFixed(0) + '%', wrColor);
        setText('tradesExecuted', String(session.count));
        setText('sessionWL', `${session.wins}W · ${session.losses}L`);
    }

    const TradeLog = {
        getSessionStats: function() {
            return {
                startedAt: session.startedAt,
                count: session.count,
                wins: session.wins,
                losses: session.losses,
                cumulativePnl: session.cumulativePnl,
                winRate: session.count > 0 ? (session.wins / session.count) * 100 : 0
            };
        },

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
                // Open BUY entries arrive without pnl and don't increment counters.
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

            container.prepend(row);
            // Cap row count at 100
            while (container.children.length > 100) {
                container.removeChild(container.lastChild);
            }

            renderSessionPerformance();
        },

        resetSession: function() {
            session.startedAt = Date.now();
            session.count = 0;
            session.wins = 0;
            session.losses = 0;
            session.cumulativePnl = 0;
            renderSessionPerformance();
            tickTimer();
        }
    };

    // Initial render + start session timer ticking
    document.addEventListener('DOMContentLoaded', () => {
        renderSessionPerformance();
        tickTimer();
        setInterval(tickTimer, 1000);
    });

    OGZ.register('TradeLog', TradeLog);
})(window.OGZ);
