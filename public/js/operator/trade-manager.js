/**
 * trade-manager.js - OGZPrime Execution & Risk Layer
 * Position sizing, SL/TP management, execution commands, Golden Mode lock
 */
(function(OGZ) {
    'use strict';

    let stopLossMode = 'fixed';

    const Operator = {
        init: function() {
            console.log('[Operator] Controls Active.');

            // Auto-calculate whenever risk/entry/stop inputs change
            ['riskPercent', 'entryPrice', 'stopLoss', 'tp1'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', () => this.calculatePosition());
            });

            // Live Price Sync: Pull current price into entry field if empty
            setInterval(() => {
                const entryInput = document.getElementById('entryPrice');
                if (entryInput && !entryInput.value && OGZ.state.lastPrice > 0) {
                    entryInput.value = OGZ.state.lastPrice.toFixed(2);
                }
            }, 1000);
        },

        // CP1: Golden Setup Integration — highlights exec buttons on high-conviction setup
        syncWithGoldenSetup: function(isGolden) {
            const execButtons = document.querySelectorAll('.exec-btn');
            execButtons.forEach(btn => {
                if (isGolden) {
                    btn.classList.add('golden-mode');
                    btn.style.boxShadow = '0 0 20px var(--ml-color)';
                } else {
                    btn.classList.remove('golden-mode');
                    btn.style.boxShadow = 'none';
                }
            });
        },

        calculatePosition: function() {
            const bal = parseFloat(document.getElementById('accountBalance')?.value) || 0;
            const risk = parseFloat(document.getElementById('riskPercent')?.value) || 0;
            const entry = parseFloat(document.getElementById('entryPrice')?.value) || 0;
            const sl = parseFloat(document.getElementById('stopLoss')?.value) || 0;
            const tp1 = parseFloat(document.getElementById('tp1')?.value) || 0;

            if (bal && risk && entry && sl && entry !== sl) {
                const riskAmt = bal * (risk / 100);
                const priceDiff = Math.abs(entry - sl);
                const size = riskAmt / priceDiff;

                const sizeEl = document.getElementById('positionSize');
                const riskEl = document.getElementById('riskAmount');
                const rrEl = document.getElementById('riskReward');

                if (sizeEl) sizeEl.textContent = size.toFixed(4);
                if (riskEl) riskEl.textContent = `$${riskAmt.toFixed(2)}`;

                if (tp1) {
                    const reward = Math.abs(tp1 - entry);
                    if (rrEl) rrEl.textContent = `1:${(reward / priceDiff).toFixed(2)}`;
                }
            }
        },

        // FIXED: setSLMode now accepts el directly to prevent event.target crashes
        setSLMode: function(mode, el) {
            stopLossMode = mode;
            document.querySelectorAll('.sl-btn').forEach(btn => btn.classList.remove('active'));
            if (el) el.classList.add('active');

            const trailSection = document.getElementById('trailDistance')?.parentElement;
            const beSection = document.getElementById('beTarget')?.parentElement;

            if (trailSection) trailSection.style.display = (mode === 'trailing' ? 'flex' : 'none');
            if (beSection) beSection.style.display = (mode === 'breakeven' ? 'flex' : 'none');
        },

        executeOrder: function(side) {
            const socket = OGZ.get('Socket');
            if (!socket || !socket.isConnected()) { console.error('[Operator] Socket disconnected'); return; }

            socket.send({
                type: 'execute_trade',
                side: side,
                size: parseFloat(document.getElementById('positionSize')?.textContent) || 0,
                price: parseFloat(document.getElementById('entryPrice')?.value) || 0,
                stopLoss: parseFloat(document.getElementById('stopLoss')?.value) || 0,
                mode: stopLossMode,
                isGolden: OGZ.state.isGolden
            });
        },

        updateBalance: function(val) {
            const balInput = document.getElementById('accountBalance');
            if (balInput) {
                balInput.value = parseFloat(val).toFixed(2);
                this.calculatePosition();
            }
        }
    };

    OGZ.register('Operator', Operator);

    // Legacy global wrappers for inline onclick handlers
    window.calculatePosition = Operator.calculatePosition.bind(Operator);
    window.setSLMode = Operator.setSLMode.bind(Operator);
    window.executeOrder = Operator.executeOrder.bind(Operator);
})(window.OGZ);
