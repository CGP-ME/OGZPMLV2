/**
 * OGZ NATIVE TWO-POLE OSCILLATOR
 * ================================
 * Pure function implementation - NO hidden globals, NO class state
 * Takes candle series in, returns all computed values out
 * 
 * ORIGINAL OGZ MATH - Safe for commercial use
 * Inspired by general oscillator concepts, NOT copied from any Pine script
 * 
 * @author OGZPrime Team
 * @version 1.0.0
 */

// ============================================================================
// HELPER FUNCTIONS (Pure, no side effects)
// ============================================================================

/**
 * Simple Moving Average
 * @param {number[]} values - Array of values
 * @param {number} period - Lookback period
 * @param {number} endIndex - Calculate SMA ending at this index
 * @returns {number} SMA value
 */
function sma(values, period, endIndex) {
    if (endIndex < period - 1) {
        // Not enough data, return the average of what we have
        const available = values.slice(0, endIndex + 1);
        return available.reduce((sum, v) => sum + v, 0) / available.length;
    }
    
    let sum = 0;
    for (let i = endIndex - period + 1; i <= endIndex; i++) {
        sum += values[i];
    }
    return sum / period;
}

/**
 * Standard Deviation
 * @param {number[]} values - Array of values
 * @param {number} period - Lookback period
 * @param {number} endIndex - Calculate StdDev ending at this index
 * @returns {number} Standard deviation
 */
function stdDev(values, period, endIndex) {
    if (endIndex < period - 1) {
        // Not enough data
        const available = values.slice(0, endIndex + 1);
        if (available.length < 2) return 0;
        
        const mean = available.reduce((sum, v) => sum + v, 0) / available.length;
        const squaredDiffs = available.map(v => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / available.length;
        return Math.sqrt(variance);
    }
    
    const mean = sma(values, period, endIndex);
    let sumSquaredDiff = 0;
    
    for (let i = endIndex - period + 1; i <= endIndex; i++) {
        sumSquaredDiff += Math.pow(values[i] - mean, 2);
    }
    
    return Math.sqrt(sumSquaredDiff / period);
}

/**
 * True Range calculation for a single bar
 * @param {number} high - Current high
 * @param {number} low - Current low
 * @param {number} prevClose - Previous close (or current close if i=0)
 * @returns {number} True range value
 */
function trueRange(high, low, prevClose) {
    return Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
    );
}

// ============================================================================
// MAIN COMPUTATION FUNCTION
// ============================================================================

/**
 * Compute OGZ Two-Pole Oscillator
 * 
 * @param {Object} input - Input configuration
 * @param {number[]} input.closes - Array of close prices
 * @param {number[]} input.highs - Array of high prices
 * @param {number[]} input.lows - Array of low prices
 * @param {number} [input.tpoLength=20] - Two-pole filter length
 * @param {number} [input.normLength=25] - Normalization lookback
 * @param {number} [input.volLength=20] - Volatility (ATR) period
 * @param {number} [input.lagBars=4] - Lag bars for tpoLag
 * 
 * @returns {Object} OgzTpoOutput
 * @returns {number[]} returns.tpo - Current oscillator values
 * @returns {number[]} returns.tpoLag - Lagged oscillator values
 * @returns {number[]} returns.norm - Normalized price signal
 * @returns {Object} returns.bands - Reference level bands
 * @returns {number[]} returns.vol - Volatility (ATR) values
 */
function computeOgzTpo(input) {
    const {
        closes,
        highs,
        lows,
        tpoLength = 20,
        normLength = 25,
        volLength = 20,
        lagBars = 4
    } = input;
    
    // Validate inputs
    if (!closes || !highs || !lows) {
        throw new Error('computeOgzTpo requires closes, highs, and lows arrays');
    }
    
    const len = closes.length;
    if (len === 0) {
        return {
            tpo: [],
            tpoLag: [],
            norm: [],
            bands: {
                upperExtreme: 1,
                upperZone: 0.5,
                mid: 0,
                lowerZone: -0.5,
                lowerExtreme: -1
            },
            vol: []
        };
    }
    
    // ========================================================================
    // STEP 1: Calculate Normalized Price Signal (norm)
    // ========================================================================
    // Formula:
    //   dev = close - SMA(close, normLength)
    //   devSma = SMA(dev, normLength)
    //   devCentered = dev - devSma
    //   stdevDev = StdDev(dev, normLength)
    //   norm = devCentered / stdevDev (if stdevDev > 0)
    
    const norm = new Array(len).fill(0);
    const dev = new Array(len).fill(0);
    
    // First pass: calculate deviations
    for (let i = 0; i < len; i++) {
        const closeSma = sma(closes, normLength, i);
        dev[i] = closes[i] - closeSma;
    }
    
    // Second pass: normalize deviations
    for (let i = 0; i < len; i++) {
        const devSma = sma(dev, normLength, i);
        const devCentered = dev[i] - devSma;
        const stdevDev = stdDev(dev, normLength, i);
        
        norm[i] = stdevDev > 0 ? devCentered / stdevDev : 0;
    }
    
    // ========================================================================
    // STEP 2: Two-Pole Smoothing Filter (tpo)
    // ========================================================================
    // This is a generic 2-pole EMA-style low-pass filter
    // alpha = 2 / (tpoLength + 1)
    // s1[i] = (1 - alpha) * s1[i-1] + alpha * norm[i]
    // s2[i] = (1 - alpha) * s2[i-1] + alpha * s1[i]
    // tpo[i] = s2[i]
    
    const alpha = 2 / (tpoLength + 1);
    const s1 = new Array(len).fill(0);
    const s2 = new Array(len).fill(0);
    const tpo = new Array(len).fill(0);
    
    for (let i = 0; i < len; i++) {
        if (i === 0) {
            s1[0] = norm[0];
            s2[0] = norm[0];
        } else {
            s1[i] = (1 - alpha) * s1[i - 1] + alpha * norm[i];
            s2[i] = (1 - alpha) * s2[i - 1] + alpha * s1[i];
        }
        tpo[i] = s2[i];
    }
    
    // ========================================================================
    // STEP 3: Lagged Reference (tpoLag)
    // ========================================================================
    // tpoLag[i] = tpo[i - lagBars] if i >= lagBars, else tpo[0]
    
    const tpoLag = new Array(len).fill(0);
    
    for (let i = 0; i < len; i++) {
        tpoLag[i] = i >= lagBars ? tpo[i - lagBars] : tpo[0];
    }
    
    // ========================================================================
    // STEP 4: Volatility / ATR for Dynamic SL/TP
    // ========================================================================
    // tr[i] = max(high-low, |high-prevClose|, |low-prevClose|)
    // vol[i] = SMA(tr, volLength)
    
    const tr = new Array(len).fill(0);
    const vol = new Array(len).fill(0);
    
    for (let i = 0; i < len; i++) {
        const prevClose = i > 0 ? closes[i - 1] : closes[0];
        tr[i] = trueRange(highs[i], lows[i], prevClose);
    }
    
    for (let i = 0; i < len; i++) {
        vol[i] = sma(tr, volLength, i);
    }
    
    // ========================================================================
    // RETURN COMPLETE OUTPUT
    // ========================================================================
    
    return {
        tpo,
        tpoLag,
        norm,
        bands: {
            upperExtreme: 1,
            upperZone: 0.5,
            mid: 0,
            lowerZone: -0.5,
            lowerExtreme: -1
        },
        vol
    };
}

// ============================================================================
// SIGNAL GENERATION HELPERS (Optional - for strategy layer)
// ============================================================================

/**
 * Detect crossover signals from TPO data
 * This is a HELPER - strategy logic should live in strategy modules
 * 
 * @param {Object} tpoOutput - Output from computeOgzTpo
 * @param {number} index - Bar index to check
 * @returns {Object|null} Signal object or null
 */
function detectTpoCrossover(tpoOutput, index) {
    const { tpo, tpoLag, bands } = tpoOutput;
    
    if (index < 1) return null;
    
    const prevTpo = tpo[index - 1];
    const currTpo = tpo[index];
    const prevLag = tpoLag[index - 1];
    const currLag = tpoLag[index];
    
    // Bullish crossover: TPO crosses above TPO_LAG
    if (prevTpo <= prevLag && currTpo > currLag) {
        // Check if in oversold zone for high-probability entry
        const inOversold = currTpo <= bands.lowerZone;
        const inExtremeOversold = currTpo <= bands.lowerExtreme;
        
        return {
            type: 'BULLISH_CROSS',
            action: 'BUY',
            tpo: currTpo,
            tpoLag: currLag,
            zone: inExtremeOversold ? 'extreme_oversold' : (inOversold ? 'oversold' : 'neutral'),
            strength: Math.abs(currTpo - currLag),
            highProbability: inOversold
        };
    }
    
    // Bearish crossover: TPO crosses below TPO_LAG
    if (prevTpo >= prevLag && currTpo < currLag) {
        // Check if in overbought zone for high-probability entry
        const inOverbought = currTpo >= bands.upperZone;
        const inExtremeOverbought = currTpo >= bands.upperExtreme;
        
        return {
            type: 'BEARISH_CROSS',
            action: 'SELL',
            tpo: currTpo,
            tpoLag: currLag,
            zone: inExtremeOverbought ? 'extreme_overbought' : (inOverbought ? 'overbought' : 'neutral'),
            strength: Math.abs(currTpo - currLag),
            highProbability: inOverbought
        };
    }
    
    return null;
}

/**
 * Calculate dynamic stop loss based on volatility
 * 
 * @param {number} entryPrice - Entry price
 * @param {number} vol - Current volatility (ATR)
 * @param {string} direction - 'LONG' or 'SHORT'
 * @param {number} [multiplier=1.5] - ATR multiplier for stop distance
 * @returns {Object} Stop loss and take profit levels
 */
function calculateDynamicLevels(entryPrice, vol, direction, multiplier = 1.5) {
    const stopDistance = vol * multiplier;
    const tpDistance = stopDistance * 1.5; // 1.5:1 R:R ratio
    
    if (direction === 'LONG') {
        return {
            stopLoss: entryPrice - stopDistance,
            takeProfit: entryPrice + tpDistance,
            riskAmount: stopDistance,
            rewardAmount: tpDistance,
            riskRewardRatio: 1.5
        };
    } else {
        return {
            stopLoss: entryPrice + stopDistance,
            takeProfit: entryPrice - tpDistance,
            riskAmount: stopDistance,
            rewardAmount: tpDistance,
            riskRewardRatio: 1.5
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    computeOgzTpo,
    detectTpoCrossover,
    calculateDynamicLevels,
    // Export helpers for testing/advanced use
    helpers: {
        sma,
        stdDev,
        trueRange
    }
};

// Also support ES6 imports if using TypeScript/bundler
module.exports.default = computeOgzTpo;
