/**
 * edge-analytics.js - Alpha Logic Panel
 * Whale Absorption, Confluence Matrix, Wall Radar, Spoof Detection
 *
 * LIVE features: updateMarketInternals (absorption detection)
 * DORMANT features: updateWallRadar (awaits depth_update from Kraken L2)
 * PARKED features: handleSpoofAlert (awaits spoof_alert emitter — handler present, not registered in core.js)
 */
(function(OGZ) {
    'use strict';

    const Edge = {
        // DORMANT: Confluence Matrix rendering (awaits golden_setup_state emitter)
        renderConfluenceMatrix: function(conditions) {
            const container = document.getElementById('divergences');
            if (!container || !conditions) return;

            container.innerHTML = conditions.map(c => `
                <div class="matrix-item ${c.status === 'MET' ? 'met' : 'waiting'}"
                     style="padding: 8px; border-left: 3px solid ${c.status === 'MET' ? 'var(--profit-color)' : '#333'}; background: rgba(255,255,255,0.02); margin-bottom: 4px;">
                    <span style="font-size: 12px; color: ${c.status === 'MET' ? '#fff' : '#777'};">${c.label}</span>
                    <span style="float: right; font-size: 10px; font-weight: 800;">${c.status}</span>
                </div>
            `).join('');
        },

        // LIVE: Aggressor Absorption detection
        // Backend: DashboardBroadcaster.js:152 emits market_internals with aggressor, buySellRatio, bookImbalance
        updateMarketInternals: function(data) {
            const aggEl = document.getElementById('aggressorSide');
            if (!aggEl) return;

            // THE ALPHA: If SELLERS are slamming the bid, but price delta is POSITIVE = Absorption
            const isAbsorption = (data.aggressor === 'SELLERS' && OGZ.state.lastPriceDelta > 0);

            if (isAbsorption) {
                aggEl.innerHTML = 'SELLERS <span class="absorbed-glow" style="color:var(--profit-color); text-shadow: 0 0 10px var(--profit-color);">[ABSORBED]</span>';
            } else {
                aggEl.textContent = data.aggressor;
                aggEl.style.color = data.aggressor === 'BUYERS' ? 'var(--profit-color)' : 'var(--loss-color)';
            }

            const bsrEl = document.getElementById('buySellRatio');
            if (bsrEl) bsrEl.textContent = data.buySellRatio.toFixed(2);

            const biEl = document.getElementById('bookImbalance');
            if (biEl) biEl.textContent = (data.bookImbalance * 100).toFixed(1) + '%';
        },

        // DORMANT: Whale Wall Radar (awaits depth_update from Kraken L2)
        updateWallRadar: function(data) {
            const container = document.getElementById('whaleAlerts');
            if (!container) return;

            if (!data.isLive) {
                container.innerHTML = '<div style="opacity:0.3; font-size:10px;">DEPTH RADAR DORMANT (L1 ONLY)</div>';
                return;
            }

            let html = '<p style="font-size:10px; color:var(--ml-color); margin-bottom:8px; letter-spacing:1px;">WHALE DEPTH RADAR</p>';

            data.walls.forEach(wall => {
                const distance = Math.abs(((wall.price - OGZ.state.lastPrice) / OGZ.state.lastPrice) * 100).toFixed(2);
                const color = wall.side === 'BID' ? 'var(--profit-color)' : 'var(--loss-color)';

                html += `
                    <div class="wall-row" style="border-left: 2px solid ${color}; background:rgba(255,255,255,0.02); padding:6px; margin-bottom:4px;">
                        <div style="display:flex; justify-content:space-between; font-size:10px;">
                            <span style="color:${color}">${wall.side} WALL</span>
                            <span style="color:#666;">${distance}% away</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:baseline;">
                            <span style="font-family:Orbitron; font-size:13px;">$${wall.price.toLocaleString()}</span>
                            <span style="font-size:10px; font-weight:800;">$${(wall.size / 1000000).toFixed(1)}M</span>
                        </div>
                    </div>`;
            });

            container.innerHTML = html;
        },

        // PARKED: Spoof alert rendering (file on disk, handler NOT registered in core.js)
        handleSpoofAlert: function(data) {
            const container = document.getElementById('whaleAlerts');
            if (!container || !data.alerts) return;

            data.alerts.forEach(spoof => {
                const alertEl = document.createElement('div');
                alertEl.className = 'spoof-alert-row';
                alertEl.style = `
                    background: rgba(255, 51, 102, 0.15);
                    border: 1px solid var(--loss-color);
                    padding: 10px; margin-bottom: 6px; border-radius: 4px;
                    animation: flash-red 0.5s infinite alternate;
                `;
                alertEl.innerHTML = `
                    <div style="display:flex; justify-content:space-between; font-size:10px; font-weight:900; color:var(--loss-color);">
                        <span>SPOOF DETECTED</span><span>PULLED</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:4px;">
                        <span style="font-family:Orbitron; font-size:14px;">$${spoof.price.toLocaleString()}</span>
                        <span style="color:#fff;">-$${(spoof.valuePulled / 1000000).toFixed(1)}M</span>
                    </div>
                `;
                container.prepend(alertEl);
                setTimeout(() => alertEl.remove(), 10000);
            });
        }
    };

    OGZ.register('Edge', Edge);
})(window.OGZ);
