/**
 * OGZ TPO WIRING - COPY/PASTE READY
 * ==================================
 */

// ═══════════════════════════════════════════════════════════════
// 1. ADD TO IMPORTS (top of your main bot file)
// ═══════════════════════════════════════════════════════════════
const OgzTpoIntegration = require('./core/OgzTpoIntegration');

// ═══════════════════════════════════════════════════════════════
// 2. ADD TO INITIALIZATION (after TierFeatureFlags init)
// ═══════════════════════════════════════════════════════════════
this.ogzTpo = this.tierFlags.isEnabled('ogzTpoEnabled') 
    ? OgzTpoIntegration.fromTierFlags(this.tierFlags) 
    : null;

// ═══════════════════════════════════════════════════════════════
// 3. ADD TO CANDLE PROCESSING (in your update loop)
// ═══════════════════════════════════════════════════════════════
if (this.ogzTpo) {
    const tpoResult = this.ogzTpo.update(candle);
    if (tpoResult.signal) {
        // Signal fired - use tpoResult.signal.action ('BUY'/'SELL')
        // Dynamic levels at: tpoResult.signal.levels.stopLoss / .takeProfit
    }
}

// ═══════════════════════════════════════════════════════════════
// 4. ADD TO VOTING (in your confidence calculation)
// ═══════════════════════════════════════════════════════════════
if (this.ogzTpo) {
    votes.push(...this.ogzTpo.getVotes());
}

// ═══════════════════════════════════════════════════════════════
// THAT'S IT. 4 LINES OF WIRING.
// ═══════════════════════════════════════════════════════════════
