/**
 * emitter-bridge.js - Backend Data Translator
 * Converts trading loop state into dashboard-consumable packets.
 *
 * DORMANT: This file exists on disk but is NOT imported into
 * OptimizedTradingBrain.js or any trading loop file.
 * Trey wires it manually in a separate single-change commit.
 */
'use strict';

class EmitterBridge {
    constructor(io) {
        this.io = io;
    }

    // Intelligence: Strategy Battleground packet
    broadcastIntelligence(decision, brainData) {
        this.io.emit('bot_thinking', {
            type: 'bot_thinking',
            decision: decision,
            confidence: brainData.totalConfidence,
            analysis: brainData.analysis,
            winner_id: brainData.winnerId,
            strategy_stack: brainData.allStrategies.map(s => ({
                id: s.id,
                name: s.name,
                confidence: s.confidence
            }))
        });
    }

    // Golden Setup: Proximity packet
    broadcastGoldenState(proximity, checklist) {
        this.io.emit('golden_setup_state', {
            type: 'golden_setup_state',
            proximity: proximity,
            is_golden: proximity >= 0.9,
            conditions: checklist
        });
    }
}

module.exports = EmitterBridge;
