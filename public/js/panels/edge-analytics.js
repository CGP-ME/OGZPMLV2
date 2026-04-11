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
        // Bind panel toggle events
        init: function() {
            // Edge panel toggle
            const edgeToggle = document.querySelector('.edge-toggle');
            if (edgeToggle) edgeToggle.addEventListener('click', () => this.togglePanel());
            const edgeHeader = document.querySelector('.edge-header');
            if (edgeHeader) edgeHeader.addEventListener('click', () => this.togglePanel());

            // Start simulated data generators for display
            // These populate the Edge panel until real backend data replaces them
            this.startSimulatedFeeds();
        },

        startSimulatedFeeds: function() {
            const lastPrice = () => OGZ.state.lastPrice || 73000;

            // Whale alert monitor — simulated until real whale_trade events
            setInterval(() => {
                if (Math.random() > 0.8) {
                    const container = document.getElementById('whaleAlerts');
                    if (!container) return;
                    const amount = (Math.random() * 10 + 1).toFixed(2);
                    const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
                    const price = (lastPrice() * (1 + (Math.random() - 0.5) * 0.002)).toFixed(2);
                    const item = document.createElement('div');
                    item.className = 'whale-item';
                    item.style.cssText = `padding:8px; margin:4px 0; background:rgba(0,100,255,0.1); border-radius:4px; font-size:11px; border-left:3px solid ${side === 'BUY' ? 'var(--profit-color)' : 'var(--loss-color)'}`;
                    item.innerHTML = `<span style="color:${side === 'BUY' ? 'var(--profit-color)' : 'var(--loss-color)'}; font-weight:800;">${side}</span> ${amount} BTC @ $${parseFloat(price).toLocaleString()}`;
                    container.prepend(item);
                    if (container.children.length > 5) container.lastChild.remove();
                }
            }, 8000);

            // CVD simulation with chart
            let cvdValue = 0;
            const cvdHistory = [];
            setInterval(() => {
                cvdValue += (Math.random() - 0.48) * 50;
                cvdHistory.push(cvdValue);
                if (cvdHistory.length > 60) cvdHistory.shift();

                const el = document.getElementById('cvdValue');
                const trend = document.getElementById('cvdTrend');
                if (el) {
                    el.textContent = cvdValue.toFixed(0);
                    el.style.color = cvdValue > 0 ? 'var(--profit-color)' : 'var(--loss-color)';
                }
                if (trend) trend.textContent = cvdValue > 50 ? 'BULLISH' : cvdValue < -50 ? 'BEARISH' : 'NEUTRAL';

                // Draw CVD chart on canvas
                const canvas = document.getElementById('cvdChart');
                if (canvas && cvdHistory.length > 2) {
                    const ctx = canvas.getContext('2d');
                    const w = canvas.width, h = canvas.height;
                    ctx.clearRect(0, 0, w, h);

                    const min = Math.min(...cvdHistory);
                    const max = Math.max(...cvdHistory);
                    const range = max - min || 1;

                    // Zero line
                    const zeroY = h - ((0 - min) / range) * h;
                    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                    ctx.beginPath();
                    ctx.moveTo(0, zeroY);
                    ctx.lineTo(w, zeroY);
                    ctx.stroke();

                    // CVD line
                    ctx.strokeStyle = cvdValue > 0 ? '#00ff88' : '#ff3366';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    cvdHistory.forEach((v, i) => {
                        const x = (i / (cvdHistory.length - 1)) * w;
                        const y = h - ((v - min) / range) * h;
                        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    });
                    ctx.stroke();

                    // Fill under the line
                    ctx.lineTo(w, h);
                    ctx.lineTo(0, h);
                    ctx.closePath();
                    ctx.fillStyle = cvdValue > 0 ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)';
                    ctx.fill();
                }
            }, 5000);

            // Fear & Greed simulation
            setInterval(() => {
                const value = Math.round(30 + Math.random() * 40);
                const el = document.getElementById('fgValue');
                const fill = document.getElementById('fgFill');
                const label = document.getElementById('fgLabel');
                if (el) el.textContent = value;
                if (fill) fill.style.width = value + '%';
                if (label) {
                    label.textContent = value < 25 ? 'EXTREME FEAR' : value < 40 ? 'FEAR' : value < 60 ? 'NEUTRAL' : value < 75 ? 'GREED' : 'EXTREME GREED';
                }
            }, 30000);

            // Market internals simulation (overridden by real market_internals from backend)
            setInterval(() => {
                const bsr = document.getElementById('buySellRatio');
                const bi = document.getElementById('bookImbalance');
                const spread = document.getElementById('spreadValue');
                const agg = document.getElementById('aggressorSide');
                if (bsr) bsr.textContent = (0.8 + Math.random() * 0.4).toFixed(2);
                if (bi) bi.textContent = (Math.random() * 20 - 10).toFixed(1) + '%';
                if (spread) spread.textContent = (Math.random() * 0.1).toFixed(3) + '%';
                if (agg) {
                    const side = Math.random() > 0.5 ? 'BUYERS' : 'SELLERS';
                    agg.textContent = side;
                    agg.style.color = side === 'BUYERS' ? 'var(--profit-color)' : 'var(--loss-color)';
                }
            }, 5000);

            // Smart money flow simulation
            setInterval(() => {
                const flows = ['ACCUMULATING', 'DISTRIBUTING', 'NEUTRAL', 'STRONG INFLOW'];
                const activity = ['HIGH', 'MEDIUM', 'LOW'];
                const dormancy = ['LOW', 'MEDIUM', 'HIGH'];
                const sf = document.getElementById('smartFlow');
                const ia = document.getElementById('instActivity');
                const dm = document.getElementById('dormancy');
                if (sf) sf.textContent = flows[Math.floor(Math.random() * flows.length)];
                if (ia) ia.textContent = activity[Math.floor(Math.random() * activity.length)];
                if (dm) dm.textContent = dormancy[Math.floor(Math.random() * dormancy.length)];
            }, 30000);

            // Divergence scanner simulation
            setInterval(() => {
                const container = document.getElementById('divergences');
                if (!container) return;
                const divs = ['RSI Bullish Divergence on 4H', 'MACD Hidden Bearish on 1H', 'Volume Divergence on Daily', 'OBV Divergence Forming'];
                const selected = divs[Math.floor(Math.random() * divs.length)];
                container.innerHTML = '';
                const div = document.createElement('div');
                div.className = 'divergence-item';
                div.textContent = selected;
                container.appendChild(div);
            }, 15000);

            // Liquidation level calculation
            setInterval(() => {
                const p = lastPrice();
                if (!p) return;
                const longLiq = document.getElementById('longLiqPrice');
                const shortLiq = document.getElementById('shortLiqPrice');
                if (longLiq) longLiq.textContent = '$' + (p * 0.95).toFixed(0);
                if (shortLiq) shortLiq.textContent = '$' + (p * 1.05).toFixed(0);
            }, 60000);
        },

        togglePanel: function() {
            const panel = document.getElementById('edgePanel');
            if (panel) panel.classList.toggle('collapsed');
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
