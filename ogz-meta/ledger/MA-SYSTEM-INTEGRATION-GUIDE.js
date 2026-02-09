/**
 * ============================================================================
 * MA SYSTEM INTEGRATION GUIDE
 * Two modules, one vision — MAs as a complete trading system
 * ============================================================================
 *
 * MODULE 1: EMASMACrossoverSignal.js
 *   - Detects golden/death crosses
 *   - Tracks divergence velocity (how fast MAs spread)
 *   - Blowoff warnings (don't chase exponential moves)
 *   - Snapback detection (mean reversion when overextended MAs start narrowing)
 *
 * MODULE 2: MADynamicSR.js
 *   - Treats MAs as living support/resistance levels
 *   - Bounce detection (price touches MA and bounces = trampoline effect)
 *   - Break detection (price crashes through MA = breakdown/breakout)
 *   - Retest detection (price comes back to test MA after breaking through)
 *   - Compression detection (MAs clustered = explosive move incoming)
 *
 * Together, these catch EVERY MA-based trade signal:
 *   Cross → Diverge → Blowoff → Snapback (Module 1)
 *   Touch → Bounce → Break → Retest (Module 2)
 *
 * ============================================================================
 * WIRING: 3 files, ~30 lines of changes
 * ============================================================================
 */

// ==========================================
// CHANGE 1: run-empire-v2.js — Initialization
// (Near the top where other modules are required)
// ==========================================

const EMASMACrossoverSignal = require('./core/EMASMACrossoverSignal');
const MADynamicSR = require('./core/MADynamicSR');

// In your constructor or init function:
// this.crossoverSignal = new EMASMACrossoverSignal();
// this.maDynamicSR = new MADynamicSR();


// ==========================================
// CHANGE 2: run-empire-v2.js — Main Analysis Loop
// (After indicators are calculated, ~line 1620)
// ==========================================

// After: const indicators = indicatorEngine.getSnapshot();
// After: broadcastPatternAnalysis(...);

// --- MA Crossover + Divergence ---
const crossoverResult = this.crossoverSignal.update(indicators);

// --- MA Dynamic S/R (needs candle data too) ---
const candle = {
  open:  currentBar.open  || indicators.open,
  high:  currentBar.high  || indicators.high,
  low:   currentBar.low   || indicators.low,
  close: currentBar.close || indicators.close,
};
const maSRResult = this.maDynamicSR.update(indicators, candle);

// Add both to the data object passed to TradingBrain:
// marketDataForConfidence = {
//   ...existingData,
//   crossover: crossoverResult,       // Crosses + divergence + snapback
//   maSR: maSRResult,                 // Bounces + breaks + retests
// };


// ==========================================
// CHANGE 3: OptimizedTradingBrain.js — calculateRealConfidence()
// (After existing confidence scoring, ~line 2479)
// ==========================================

// --- MA CROSSOVER SIGNALS ---
if (marketData.crossover && marketData.crossover.hasSignal) {
  const xover = marketData.crossover;
  if (xover.direction === 'bullish') {
    bullishConfidence += xover.confidence;
    console.log(`   ✅ MA CROSSOVER: ${xover.activePairs} bullish cross(es) +${(xover.confidence * 100).toFixed(1)}%`);
  } else if (xover.direction === 'bearish') {
    bearishConfidence += xover.confidence;
    console.log(`   ✅ MA CROSSOVER: ${xover.activePairs} bearish cross(es) +${(xover.confidence * 100).toFixed(1)}%`);
  }
  // Confluence bonus
  if (xover.confluenceBonus > 0) {
    console.log(`   🎯 MA CONFLUENCE: ${xover.activePairs} pairs agree (+${(xover.confluenceBonus * 100).toFixed(1)}% bonus)`);
  }
}

// --- MA SNAPBACK / BLOWOFF WARNINGS ---
if (marketData.crossover && marketData.crossover.snapback?.hasSignal) {
  const snap = marketData.crossover.snapback;
  if (snap.direction === 'bullish') bullishConfidence += snap.confidence;
  else if (snap.direction === 'bearish') bearishConfidence += snap.confidence;
  console.log(`   🔄 MA SNAPBACK: ${snap.direction} mean reversion +${(snap.confidence * 100).toFixed(1)}%`);
}

// --- MA DYNAMIC S/R (bounces, breaks, retests) ---
if (marketData.maSR && marketData.maSR.hasSignal) {
  const sr = marketData.maSR;
  if (sr.direction === 'bullish') {
    bullishConfidence += sr.confidence;
    console.log(`   🎯 MA S/R: ${sr.activeLevels} bullish level(s) +${(sr.confidence * 100).toFixed(1)}%`);
  } else if (sr.direction === 'bearish') {
    bearishConfidence += sr.confidence;
    console.log(`   🎯 MA S/R: ${sr.activeLevels} bearish level(s) +${(sr.confidence * 100).toFixed(1)}%`);
  }
  // Retest hold = highest conviction signal
  if (sr.signals.some(s => s.type === 'retest_hold')) {
    console.log(`   💪 MA RETEST CONFIRMED — institutional conviction`);
  }
  // Compression = explosive move incoming
  if (sr.compression) {
    console.log(`   🔥 MA COMPRESSION — explosive breakout/breakdown imminent`);
  }
}


// ==========================================
// OPTIONAL: Add EMA 9 to IndicatorEngine
// (core/indicators/IndicatorEngine.js, ~line 37)
// ==========================================
// Change: emaPeriods: [20, 50, 200]
// To:     emaPeriods: [9, 20, 50, 200]
// Both modules gracefully fall back if EMA 9 not available


// ==========================================
// OPTIONAL: Dashboard broadcasting
// (run-empire-v2.js, wherever you broadcast to frontend)
// ==========================================

// Add to your WebSocket broadcast:
// maSystem: {
//   crossover: this.crossoverSignal.getState(),
//   dynamicSR: this.maDynamicSR.getState(),
// },
