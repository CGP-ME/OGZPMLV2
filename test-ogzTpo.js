/**
 * OGZ TWO-POLE OSCILLATOR TEST HARNESS
 * =====================================
 * Tests the new pure-function TPO implementation
 * Compares output with existing class-based TwoPoleOscillator
 * 
 * Run: node src/indicators/test-ogzTpo.js
 */

const { computeOgzTpo, detectTpoCrossover, calculateDynamicLevels } = require('./ogzTwoPoleOscillator');

// Try to load existing TPO for comparison (may not exist in test env)
let ExistingTpo;
try {
    ExistingTpo = require('../../core/TwoPoleOscillator');
} catch (e) {
    console.log('⚠️ Existing TwoPoleOscillator not found - skipping comparison tests');
    ExistingTpo = null;
}

// ============================================================================
// GENERATE SYNTHETIC TEST DATA
// ============================================================================

function generateSyntheticCandles(numCandles = 100, startPrice = 95000, volatility = 0.02) {
    const closes = [];
    const highs = [];
    const lows = [];
    
    let price = startPrice;
    
    for (let i = 0; i < numCandles; i++) {
        // Add some trend + noise
        const trend = Math.sin(i / 20) * 0.005; // Gentle oscillating trend
        const noise = (Math.random() - 0.5) * volatility;
        
        price = price * (1 + trend + noise);
        
        const candleRange = price * (0.005 + Math.random() * 0.01);
        const open = price + (Math.random() - 0.5) * candleRange;
        
        const high = Math.max(price, open) + Math.random() * candleRange * 0.5;
        const low = Math.min(price, open) - Math.random() * candleRange * 0.5;
        
        closes.push(price);
        highs.push(high);
        lows.push(low);
    }
    
    return { closes, highs, lows };
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

function testBasicComputation() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('TEST 1: BASIC COMPUTATION');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    const { closes, highs, lows } = generateSyntheticCandles(100);
    
    console.log(`📊 Generated ${closes.length} synthetic candles`);
    console.log(`   Price range: $${Math.min(...closes).toFixed(2)} - $${Math.max(...closes).toFixed(2)}`);
    
    const result = computeOgzTpo({ closes, highs, lows });
    
    console.log('\n✅ computeOgzTpo() executed successfully');
    console.log('\n📈 OUTPUT STRUCTURE:');
    console.log(`   tpo: ${result.tpo.length} values`);
    console.log(`   tpoLag: ${result.tpoLag.length} values`);
    console.log(`   norm: ${result.norm.length} values`);
    console.log(`   vol: ${result.vol.length} values`);
    console.log(`   bands:`, result.bands);
    
    // Show sample values from end of series
    const lastIdx = closes.length - 1;
    console.log('\n📍 LAST BAR VALUES:');
    console.log(`   Close: $${closes[lastIdx].toFixed(2)}`);
    console.log(`   TPO: ${result.tpo[lastIdx].toFixed(4)}`);
    console.log(`   TPO Lag: ${result.tpoLag[lastIdx].toFixed(4)}`);
    console.log(`   Norm: ${result.norm[lastIdx].toFixed(4)}`);
    console.log(`   Vol (ATR): $${result.vol[lastIdx].toFixed(2)}`);
    
    // Validate ranges
    const tpoMin = Math.min(...result.tpo);
    const tpoMax = Math.max(...result.tpo);
    console.log(`\n📊 TPO RANGE: ${tpoMin.toFixed(4)} to ${tpoMax.toFixed(4)}`);
    
    if (tpoMin >= -3 && tpoMax <= 3) {
        console.log('   ✅ TPO values are in reasonable normalized range');
    } else {
        console.log('   ⚠️ TPO values may be outside expected range');
    }
    
    return result;
}

function testCrossoverDetection() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('TEST 2: CROSSOVER DETECTION');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    const { closes, highs, lows } = generateSyntheticCandles(200);
    const result = computeOgzTpo({ closes, highs, lows });
    
    const signals = [];
    
    for (let i = 1; i < closes.length; i++) {
        const signal = detectTpoCrossover(result, i);
        if (signal) {
            signals.push({
                bar: i,
                price: closes[i],
                ...signal
            });
        }
    }
    
    console.log(`🔔 DETECTED ${signals.length} CROSSOVER SIGNALS:\n`);
    
    // Show first 10 signals
    signals.slice(0, 10).forEach((sig, idx) => {
        const emoji = sig.action === 'BUY' ? '🟢' : '🔴';
        const hpIndicator = sig.highProbability ? '⭐' : '';
        console.log(`   ${emoji} Bar ${sig.bar}: ${sig.action} @ $${sig.price.toFixed(2)} [${sig.zone}] ${hpIndicator}`);
        console.log(`      TPO: ${sig.tpo.toFixed(4)}, Lag: ${sig.tpoLag.toFixed(4)}, Strength: ${sig.strength.toFixed(4)}`);
    });
    
    if (signals.length > 10) {
        console.log(`   ... and ${signals.length - 10} more signals`);
    }
    
    // Stats
    const buys = signals.filter(s => s.action === 'BUY');
    const sells = signals.filter(s => s.action === 'SELL');
    const highProb = signals.filter(s => s.highProbability);
    
    console.log('\n📊 SIGNAL STATS:');
    console.log(`   Total: ${signals.length}`);
    console.log(`   BUY: ${buys.length} (${(buys.length/signals.length*100).toFixed(1)}%)`);
    console.log(`   SELL: ${sells.length} (${(sells.length/signals.length*100).toFixed(1)}%)`);
    console.log(`   High Probability: ${highProb.length} (${(highProb.length/signals.length*100).toFixed(1)}%)`);
    
    return signals;
}

function testDynamicLevels() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('TEST 3: DYNAMIC SL/TP CALCULATION');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    const { closes, highs, lows } = generateSyntheticCandles(100);
    const result = computeOgzTpo({ closes, highs, lows });
    
    const lastPrice = closes[closes.length - 1];
    const lastVol = result.vol[result.vol.length - 1];
    
    console.log(`📍 Current Price: $${lastPrice.toFixed(2)}`);
    console.log(`📊 Current ATR (Vol): $${lastVol.toFixed(2)}`);
    
    // Calculate levels for LONG
    const longLevels = calculateDynamicLevels(lastPrice, lastVol, 'LONG');
    console.log('\n🟢 LONG POSITION LEVELS:');
    console.log(`   Entry: $${lastPrice.toFixed(2)}`);
    console.log(`   Stop Loss: $${longLevels.stopLoss.toFixed(2)} (-$${longLevels.riskAmount.toFixed(2)})`);
    console.log(`   Take Profit: $${longLevels.takeProfit.toFixed(2)} (+$${longLevels.rewardAmount.toFixed(2)})`);
    console.log(`   Risk/Reward: 1:${longLevels.riskRewardRatio}`);
    
    // Calculate levels for SHORT
    const shortLevels = calculateDynamicLevels(lastPrice, lastVol, 'SHORT');
    console.log('\n🔴 SHORT POSITION LEVELS:');
    console.log(`   Entry: $${lastPrice.toFixed(2)}`);
    console.log(`   Stop Loss: $${shortLevels.stopLoss.toFixed(2)} (+$${shortLevels.riskAmount.toFixed(2)})`);
    console.log(`   Take Profit: $${shortLevels.takeProfit.toFixed(2)} (-$${shortLevels.rewardAmount.toFixed(2)})`);
    console.log(`   Risk/Reward: 1:${shortLevels.riskRewardRatio}`);
    
    // Test with different ATR multipliers
    console.log('\n📊 SL DISTANCE vs ATR MULTIPLIER:');
    [1.0, 1.5, 2.0, 2.5, 3.0].forEach(mult => {
        const levels = calculateDynamicLevels(lastPrice, lastVol, 'LONG', mult);
        const slPct = (levels.riskAmount / lastPrice * 100).toFixed(2);
        console.log(`   ${mult}x ATR: SL @ $${levels.stopLoss.toFixed(2)} (${slPct}% from entry)`);
    });
}

function testComparisonWithExisting() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('TEST 4: COMPARISON WITH EXISTING TPO');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    if (!ExistingTpo) {
        console.log('⚠️ Existing TwoPoleOscillator not available - skipping comparison');
        return;
    }
    
    const { closes, highs, lows } = generateSyntheticCandles(100);
    
    // New implementation (batch)
    const newResult = computeOgzTpo({ closes, highs, lows });
    
    // Existing implementation (incremental)
    const existing = new ExistingTpo({ smaLength: 25, filterLength: 20 });
    const existingResults = closes.map(price => existing.update(price));
    
    console.log('📊 COMPARISON (Last 10 bars):\n');
    console.log('Bar | Price      | New TPO    | Old TPO    | Diff');
    console.log('----+------------+------------+------------+--------');
    
    for (let i = closes.length - 10; i < closes.length; i++) {
        const newTpo = newResult.tpo[i];
        const oldTpo = existingResults[i].filtered;
        const diff = Math.abs(newTpo - oldTpo);
        
        console.log(
            `${i.toString().padStart(3)} | ` +
            `$${closes[i].toFixed(2).padStart(9)} | ` +
            `${newTpo.toFixed(6).padStart(10)} | ` +
            `${oldTpo.toFixed(6).padStart(10)} | ` +
            `${diff.toFixed(6)}`
        );
    }
    
    // Calculate correlation
    const lastN = 50;
    const newSlice = newResult.tpo.slice(-lastN);
    const oldSlice = existingResults.slice(-lastN).map(r => r.filtered);
    
    const meanNew = newSlice.reduce((a, b) => a + b, 0) / lastN;
    const meanOld = oldSlice.reduce((a, b) => a + b, 0) / lastN;
    
    let cov = 0, varNew = 0, varOld = 0;
    for (let i = 0; i < lastN; i++) {
        const dNew = newSlice[i] - meanNew;
        const dOld = oldSlice[i] - meanOld;
        cov += dNew * dOld;
        varNew += dNew * dNew;
        varOld += dOld * dOld;
    }
    
    const correlation = cov / Math.sqrt(varNew * varOld);
    
    console.log(`\n📈 CORRELATION (last ${lastN} bars): ${correlation.toFixed(4)}`);
    
    if (correlation > 0.9) {
        console.log('   ✅ High correlation - implementations are consistent');
    } else if (correlation > 0.7) {
        console.log('   🟡 Moderate correlation - some differences in calculation');
    } else {
        console.log('   ⚠️ Low correlation - implementations differ significantly');
    }
}

function testPerformance() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('TEST 5: PERFORMANCE BENCHMARK');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    const sizes = [100, 500, 1000, 5000, 10000];
    
    console.log('Candles | Time (ms) | Throughput');
    console.log('--------+-----------+----------------');
    
    sizes.forEach(size => {
        const { closes, highs, lows } = generateSyntheticCandles(size);
        
        const start = process.hrtime.bigint();
        
        // Run multiple times for more accurate measurement
        const iterations = Math.max(1, Math.floor(10000 / size));
        for (let i = 0; i < iterations; i++) {
            computeOgzTpo({ closes, highs, lows });
        }
        
        const end = process.hrtime.bigint();
        const totalMs = Number(end - start) / 1e6;
        const avgMs = totalMs / iterations;
        const throughput = (size / avgMs * 1000).toFixed(0);
        
        console.log(
            `${size.toString().padStart(7)} | ` +
            `${avgMs.toFixed(3).padStart(9)} | ` +
            `${throughput.padStart(10)} candles/sec`
        );
    });
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

console.log('\n');
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║     OGZ TWO-POLE OSCILLATOR - TEST SUITE                      ║');
console.log('║     Pure Function Implementation                              ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');

testBasicComputation();
testCrossoverDetection();
testDynamicLevels();
testComparisonWithExisting();
testPerformance();

console.log('\n');
console.log('═══════════════════════════════════════════════════════════════');
console.log('ALL TESTS COMPLETE ✅');
console.log('═══════════════════════════════════════════════════════════════');
console.log('\n');
