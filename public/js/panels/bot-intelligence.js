/**
 * bot-intelligence.js - AI Strategy Visualization
 * Strategy Winner HUD with confidence bar chart
 *
 * LIVE-PARTIAL: Shows winner name + confidence from existing bot_thinking emission.
 * Full battleground bar chart requires strategy_stack in payload (future backend work).
 */
(function(OGZ) {
    'use strict';

    const Intelligence = {
        // Strategy Winner HUD
        updateWinnerHUD: function(data) {
            const display = document.getElementById('thoughtDisplay');
            if (!display) return;

            let strategyStackHTML = '';
            if (data.strategy_stack) {
                strategyStackHTML = `<div class="strategy-battleground" style="margin-top: 15px; border-top: 1px solid rgba(255,215,0,0.1); padding-top: 10px;">
                    <p style="font-size: 9px; color: var(--text-secondary); margin-bottom: 8px; letter-spacing: 1px;">STRATEGY BATTLEGROUND</p>`;

                data.strategy_stack.forEach(strat => {
                    const isWinner = strat.id === data.winner_id;
                    const barColor = isWinner ? 'var(--ml-color)' : '#333';

                    strategyStackHTML += `
                        <div class="strat-row" style="margin-bottom: 6px;">
                            <div style="display: flex; justify-content: space-between; font-size: 11px;">
                                <span style="color: ${isWinner ? 'var(--ml-color)' : '#999'}; font-weight: ${isWinner ? '800' : '400'};">
                                    ${isWinner ? '>> ' : ''}${strat.name}
                                </span>
                                <span style="font-family: Orbitron;">${(strat.confidence * 100).toFixed(0)}%</span>
                            </div>
                            <div style="height: 2px; background: rgba(255,255,255,0.05); width: 100%; margin-top: 2px;">
                                <div style="height: 100%; width: ${strat.confidence * 100}%; background: ${barColor}; transition: width 0.4s ease-out;"></div>
                            </div>
                        </div>`;
                });
                strategyStackHTML += '</div>';
            }

            // Fallback for existing bot_thinking format (message + confidence only)
            const analysis = data.analysis || data.message || data.data?.reasoning || 'Analyzing...';
            const decision = data.decision || data.data?.module || 'HOLD';
            const confidence = data.confidence != null
                ? (data.confidence > 1 ? data.confidence / 100 : data.confidence)
                : 0;

            display.innerHTML = `
                <div class="thought-entry">
                    <p class="thought-step"><strong>Analysis:</strong> ${analysis}</p>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin: 10px 0;">
                        <span class="decision-badge ${decision.toLowerCase()}">${decision.toUpperCase()}</span>
                        <div style="text-align: right;">
                            <div style="font-size: 9px; color: #888;">TOTAL CONFIDENCE</div>
                            <div style="font-family: Orbitron; color: var(--ml-color); font-size: 18px;">${(confidence * 100).toFixed(1)}%</div>
                        </div>
                    </div>
                    ${strategyStackHTML}
                </div>`;
        }
    };

    OGZ.register('Intelligence', Intelligence);
})(window.OGZ);
