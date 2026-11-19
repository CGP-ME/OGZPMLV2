/**
 * edge-analytics.js - Alpha Logic Panel
 * Whale Absorption, Confluence Matrix, Wall Radar, Spoof Detection
 *
 * Panel controls and event-supplied confluence.
 * Observed market analytics are rendered by EdgeAnalyticsPanel.
 * PARKED features: handleSpoofAlert (awaits spoof_alert emitter — handler present, not registered in core.js)
 */
(function(OGZ) {
    'use strict';

    const Edge = {
        // Bind panel toggle events
        init: function() {
            // Edge panel toggle
            const edgeToggle = document.querySelector('.edge-toggle');
            if (edgeToggle) edgeToggle.addEventListener('click', () => this.togglePanel());
            const edgeHeader = document.querySelector('.edge-header');
            if (edgeHeader) edgeHeader.addEventListener('click', () => this.togglePanel());

        },

        togglePanel: function() {
            const panel = document.getElementById('edgePanel');
            if (!panel) return;
            const willCollapse = !panel.classList.contains('collapsed');
            panel.classList.toggle('collapsed');
            // BUG FIX 2026-04-27: trigger the .main-container.left-collapsed
            // adaptive padding (defined at unified-dashboard.html:320) so the
            // chart fills the freed space when Edge Analytics collapses.
            // Without this the padding-left:340px stayed put and the chart
            // visually sat under the collapsed rail.
            const main = document.querySelector('.main-container');
            if (main) main.classList.toggle('left-collapsed', willCollapse);
            // Force chart resize after the 300ms padding transition lands so
            // lightweight-charts redraws into the new container width.
            setTimeout(() => {
                if (window.tvChart && typeof window.tvChart.resize === 'function') {
                    const c = document.getElementById('tvChartContainer');
                    if (c) window.tvChart.resize(c.clientWidth, c.clientHeight);
                }
                window.dispatchEvent(new Event('resize'));
            }, 320);
        },

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
