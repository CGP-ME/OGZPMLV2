/**
 * TWO-POLE OSCILLATOR MODULE [BigBeluga]
 * Advanced momentum oscillator with Butterworth filtering
 * Generates crossover signals and invalidation levels
 * Based on TradingView indicator by BigBeluga
 */

class TwoPoleOscillator {
    constructor(config = {}) {
        // Oscillator parameters
        this.smaLength = config.smaLength || 25;           // SMA period for deviation
        this.filterLength = config.filterLength || 15;      // Two-pole filter length (15 = balanced)

        // 5-Level System: -1, -0.5, 0, 0.5, 1
        this.extremeOverbought = config.extremeOverbought || 1.0;   // Pullback imminent
        this.overbought = config.overbought || 0.5;                 // Standard overbought
        this.neutral = 0;                                            // Equilibrium
        this.oversold = config.oversold || -0.5;                     // Standard oversold
        this.extremeOversold = config.extremeOversold || -1.0;       // Bounce imminent

        // Legacy threshold names for compatibility
        this.upperThreshold = this.overbought;
        this.lowerThreshold = this.oversold;

        // State tracking
        this.oscillatorHistory = [];
        this.filteredHistory = [];
        this.priceHistory = [];
        this.maxHistory = 100;

        // Signal tracking
        this.lastSignal = null;
        this.lastCrossover = null;
        this.invalidationLevels = {
            bullish: null,  // Stop loss for long positions
            bearish: null   // Stop loss for short positions
        };

        // Two-pole filter state
        this.smooth1 = null;
        this.smooth2 = null;

        console.log('🎯 Two-Pole Oscillator initialized [BigBeluga]');
        console.log(`   📊 SMA Length: ${this.smaLength}`);
        console.log(`   🔧 Filter Length: ${this.filterLength}`);
        console.log(`   📈 Thresholds: ${this.lowerThreshold} to ${this.upperThreshold}`);
    }

    /**
     * Two-pole Butterworth filter function
     * Creates ultra-smooth output with minimal lag
     */
    twoPoleFilter(value) {
        const alpha = 2.0 / (this.filterLength + 1);

        // Initialize on first run
        if (this.smooth1 === null) {
            this.smooth1 = value;
            this.smooth2 = value;
            return value;
        }

        // First pole
        this.smooth1 = (1 - alpha) * this.smooth1 + alpha * value;

        // Second pole
        this.smooth2 = (1 - alpha) * this.smooth2 + alpha * this.smooth1;

        return this.smooth2;
    }

    /**
     * Calculate the raw oscillator value
     * Based on price deviation from mean
     */
    calculateOscillator(prices) {
        const len = prices.length;
        if (len < this.smaLength) {
            return 0;
        }

        const start = len - this.smaLength;
        let sum = 0;

        // OPTIMIZATION: Use for loop to avoid slice/reduce allocations
        for (let i = start; i < len; i++) {
            sum += prices[i];
        }

        const sma = sum / this.smaLength;
        let sumSqDiff = 0;

        // Calculate variance
        for (let i = start; i < len; i++) {
            const diff = prices[i] - sma;
            sumSqDiff += diff * diff;
        }

        const variance = sumSqDiff / this.smaLength;
        const stdDev = Math.sqrt(variance);

        const currentPrice = prices[len - 1];
        const deviation = currentPrice - sma;

        // Normalize oscillator (-1 to 1 range typically)
        return stdDev > 0 ? deviation / stdDev : 0;
    }

    /**
     * Update oscillator with new price data
     * Returns signal if crossover detected
     */
    update(price) {
        // Add to price history
        this.priceHistory.push(price);
        if (this.priceHistory.length > this.maxHistory) {
            this.priceHistory.shift();
        }

        // Calculate raw oscillator
        const rawOscillator = this.calculateOscillator(this.priceHistory);

        // Apply two-pole filter for smoothing
        const filtered = this.twoPoleFilter(rawOscillator);

        // Store history
        this.oscillatorHistory.push(rawOscillator);
        this.filteredHistory.push(filtered);

        if (this.oscillatorHistory.length > this.maxHistory) {
            this.oscillatorHistory.shift();
            this.filteredHistory.shift();
        }

        // Detect crossover signals
        const signal = this.detectCrossover();

        // Update invalidation levels
        this.updateInvalidationLevels(price, filtered);

        // Calculate delta (divergence between oscillator and filter)
        const delta = Math.abs(rawOscillator - filtered) / Math.max(Math.abs(filtered), 0.001);

        return {
            oscillator: rawOscillator,
            filtered: filtered,
            filter: filtered,  // Alias for compatibility
            delta: delta,      // Add delta to return value
            signal: signal,
            invalidation: this.invalidationLevels,
            thresholds: {
                upper: this.upperThreshold,
                lower: this.lowerThreshold
            }
        };
    }

    /**
     * Detect crossover signals
     * CRITICAL: Signal ONLY valid if oscillator is in overbought/oversold zone (±0.5)
     */
    detectCrossover() {
        if (this.oscillatorHistory.length < 2 || this.filteredHistory.length < 2) {
            return null;
        }

        const prevOsc = this.oscillatorHistory[this.oscillatorHistory.length - 2];
        const currOsc = this.oscillatorHistory[this.oscillatorHistory.length - 1];
        const prevFilt = this.filteredHistory[this.filteredHistory.length - 2];
        const currFilt = this.filteredHistory[this.filteredHistory.length - 1];

        let signal = null;

        // Bullish crossover (oscillator crosses above filtered)
        if (prevOsc <= prevFilt && currOsc > currFilt) {
            // Calculate delta as percentage divergence
            const delta = Math.abs(currOsc - currFilt) / Math.max(Math.abs(currFilt), 0.001);

            // DUAL VALIDATION: Must be in oversold zone AND delta > 20%
            if (currOsc <= -0.5 && delta > 0.2) {
                signal = {
                    type: 'BUY',
                    strength: delta,
                    confidence: this.calculateSignalConfidence(currOsc, currFilt),
                    timestamp: Date.now(),
                    valid: true,
                    zone: 'oversold',
                    delta: delta * 100,
                    magic: true // This is where the magic happens!
                };
                this.lastSignal = signal;
                this.lastCrossover = 'bullish';

                console.log(`\n🟢 ✨ MAGIC BUY SIGNAL ✨`);
                console.log(`   ✅ Oversold: ${currOsc.toFixed(3)} < -0.5`);
                console.log(`   ✅ Delta: ${(delta * 100).toFixed(1)}% > 20%`);
                console.log(`   Entry point confirmed!`);
            } else {
                // Invalid signal - missing requirements
                const reasons = [];
                if (currOsc > -0.5) reasons.push(`Not oversold (${currOsc.toFixed(3)} > -0.5)`);
                if (delta <= 0.2) reasons.push(`Weak delta (${(delta * 100).toFixed(1)}% < 20%)`);

                console.log(`⚠️ INVALID BUY: ${reasons.join(', ')}`);
                signal = {
                    type: 'INVALID',
                    reason: reasons.join(', '),
                    oscillator: currOsc,
                    delta: delta * 100
                };
            }
        }
        // Bearish crossover (oscillator crosses below filtered)
        else if (prevOsc >= prevFilt && currOsc < currFilt) {
            // Calculate delta as percentage divergence
            const delta = Math.abs(currOsc - currFilt) / Math.max(Math.abs(currFilt), 0.001);

            // DUAL VALIDATION: Must be in overbought zone AND delta > 20%
            if (currOsc >= 0.5 && delta > 0.2) {
                signal = {
                    type: 'SELL',
                    strength: delta,
                    confidence: this.calculateSignalConfidence(currOsc, currFilt),
                    timestamp: Date.now(),
                    valid: true,
                    zone: 'overbought',
                    delta: delta * 100,
                    magic: true // This is where the magic happens!
                };
                this.lastSignal = signal;
                this.lastCrossover = 'bearish';

                console.log(`\n🔴 ✨ MAGIC SELL SIGNAL ✨`);
                console.log(`   ✅ Overbought: ${currOsc.toFixed(3)} > 0.5`);
                console.log(`   ✅ Delta: ${(delta * 100).toFixed(1)}% > 20%`);
                console.log(`   Entry point confirmed!`);
            } else {
                // Invalid signal - missing requirements
                const reasons = [];
                if (currOsc < 0.5) reasons.push(`Not overbought (${currOsc.toFixed(3)} < 0.5)`);
                if (delta <= 0.2) reasons.push(`Weak delta (${(delta * 100).toFixed(1)}% < 20%)`);

                console.log(`⚠️ INVALID SELL: ${reasons.join(', ')}`);
                signal = {
                    type: 'INVALID',
                    reason: reasons.join(', '),
                    oscillator: currOsc,
                    delta: delta * 100
                };
            }
        }

        return signal;
    }

    /**
     * Calculate signal confidence based on 5-level system
     */
    calculateSignalConfidence(oscillator, filtered) {
        let confidence = 40; // Base confidence

        // 5-Level confidence system
        const absOsc = Math.abs(oscillator);

        if (absOsc >= this.extremeOverbought) {
            // Level ±1: Extreme - pullback/bounce imminent
            confidence = 90; // Very high confidence for reversal
            console.log(`⚠️ EXTREME ZONE: ${oscillator.toFixed(2)} - Reversal imminent!`);
        } else if (absOsc >= this.overbought) {
            // Level ±0.5: Standard overbought/oversold
            confidence = 70; // Good confidence
        } else if (absOsc >= 0.25) {
            // Between neutral and threshold
            confidence = 55; // Moderate confidence
        } else {
            // Near neutral (0)
            confidence = 40; // Low confidence - noisy zone
        }

        // MAGIC ZONE: Delta length over 20% = STRONG SIGNAL
        const delta = Math.abs(oscillator - filtered);

        if (delta > 0.2) {
            // THIS IS WHERE THE MAGIC HAPPENS!
            confidence += 25; // Major signal boost
            console.log(`🎯 MAGIC DELTA: ${(delta * 100).toFixed(1)}% divergence - STRONG SIGNAL!`);
        } else if (delta > 0.15) {
            confidence += 15; // Good divergence
        } else if (delta > 0.1) {
            confidence += 10; // Moderate divergence
        } else {
            // Delta too small - weak signal
            confidence -= 5; // Penalty for no divergence
        }

        // Filter length adjustment
        // Shorter filter = more responsive but noisier
        // Longer filter = smoother but laggier
        const filterAdjustment = this.filterLength < 10 ? -10 : // Very noisy
                                 this.filterLength > 20 ? -5 : // Too laggy
                                 0; // Balanced (10-20 range)

        confidence += filterAdjustment;

        return Math.min(Math.max(confidence, 20), 95); // Clamp 20-95%
    }

    /**
     * Calculate precise stop-loss and take-profit levels
     * Stop: Just below entry candle
     * Take Profit: 1.5x the risk (1.5:1 RR ratio)
     */
    calculateTradeLevels(entryPrice, signal, candleLow = null, candleHigh = null) {
        const levels = {};

        if (signal.type === 'BUY') {
            // Stop loss: Just below the entry candle's low
            const stopBuffer = entryPrice * 0.001; // 0.1% buffer below candle
            levels.stopLoss = (candleLow || entryPrice * 0.995) - stopBuffer;

            // Calculate risk
            const risk = entryPrice - levels.stopLoss;

            // Take profit: 1.5x the risk
            levels.takeProfit = entryPrice + (risk * 1.5);

            // Store for invalidation tracking
            this.invalidationLevels.bullish = levels.stopLoss;

            console.log(`📊 BUY LEVELS SET:`);
            console.log(`   Entry: $${entryPrice.toFixed(2)}`);
            console.log(`   Stop: $${levels.stopLoss.toFixed(2)} (Risk: ${((risk/entryPrice)*100).toFixed(2)}%)`);
            console.log(`   Target: $${levels.takeProfit.toFixed(2)} (1.5:1 RR)`);
        }
        else if (signal.type === 'SELL') {
            // Stop loss: Just above the entry candle's high
            const stopBuffer = entryPrice * 0.001; // 0.1% buffer above candle
            levels.stopLoss = (candleHigh || entryPrice * 1.005) + stopBuffer;

            // Calculate risk
            const risk = levels.stopLoss - entryPrice;

            // Take profit: 1.5x the risk (downside)
            levels.takeProfit = entryPrice - (risk * 1.5);

            // Store for invalidation tracking
            this.invalidationLevels.bearish = levels.stopLoss;

            console.log(`📊 SELL LEVELS SET:`);
            console.log(`   Entry: $${entryPrice.toFixed(2)}`);
            console.log(`   Stop: $${levels.stopLoss.toFixed(2)} (Risk: ${((risk/entryPrice)*100).toFixed(2)}%)`);
            console.log(`   Target: $${levels.takeProfit.toFixed(2)} (1.5:1 RR)`);
        }

        return levels;
    }

    /**
     * Update invalidation levels for risk management
     * Called after calculating trade levels
     */
    updateInvalidationLevels(currentPrice, filteredValue) {
        // Levels are now set in calculateTradeLevels() for precise stop placement
        // This method kept for compatibility
    }

    /**
     * Check if current price has hit invalidation levels
     */
    checkInvalidation(currentPrice, position) {
        if (position > 0 && this.invalidationLevels.bullish) {
            if (currentPrice <= this.invalidationLevels.bullish) {
                console.log(`⚠️ BULLISH INVALIDATION: Price ${currentPrice} hit stop ${this.invalidationLevels.bullish}`);
                return {
                    triggered: true,
                    type: 'bullish',
                    level: this.invalidationLevels.bullish,
                    action: 'SELL' // Exit long position
                };
            }
        }

        if (position < 0 && this.invalidationLevels.bearish) {
            if (currentPrice >= this.invalidationLevels.bearish) {
                console.log(`⚠️ BEARISH INVALIDATION: Price ${currentPrice} hit stop ${this.invalidationLevels.bearish}`);
                return {
                    triggered: true,
                    type: 'bearish',
                    level: this.invalidationLevels.bearish,
                    action: 'BUY' // Exit short position
                };
            }
        }

        return { triggered: false };
    }

    /**
     * Get current oscillator state for dashboard
     */
    getState() {
        const current = this.oscillatorHistory[this.oscillatorHistory.length - 1] || 0;
        const filtered = this.filteredHistory[this.filteredHistory.length - 1] || 0;

        return {
            oscillator: current,
            filtered: filtered,
            signal: this.lastSignal,
            crossover: this.lastCrossover,
            invalidationLevels: this.invalidationLevels,
            thresholds: {
                upper: this.upperThreshold,
                lower: this.lowerThreshold
            },
            history: {
                oscillator: this.oscillatorHistory.slice(-50),
                filtered: this.filteredHistory.slice(-50)
            }
        };
    }

    /**
     * Get chart data for dashboard visualization with gradient coloring
     */
    getChartData() {
        const dataPoints = Math.min(this.oscillatorHistory.length, 50);
        const chartData = [];
        const crossPoints = []; // X marks for crossover points

        for (let i = this.oscillatorHistory.length - dataPoints; i < this.oscillatorHistory.length; i++) {
            const osc = this.oscillatorHistory[i];
            const filt = this.filteredHistory[i];

            // Calculate gradient color and transparency
            const strength = Math.abs(osc);
            const opacity = Math.max(0.2, Math.min(1, strength * 2)); // Fade near zero

            // Determine color based on position
            let color, gradientColor;
            if (osc > filt) {
                // BULLISH - Blue/Cyan gradient
                const intensity = Math.min(255, 100 + strength * 155);
                color = `rgba(0, ${intensity}, 255, ${opacity})`; // Blue tones
                gradientColor = 'bullish';
            } else {
                // BEARISH - Purple gradient
                const intensity = Math.min(255, 100 + strength * 155);
                color = `rgba(${intensity}, 0, ${intensity}, ${opacity})`; // Purple tones
                gradientColor = 'bearish';
            }

            // Check for crossover points (for X marks)
            if (i > 0) {
                const prevOsc = this.oscillatorHistory[i - 1];
                const prevFilt = this.filteredHistory[i - 1];

                // Crossover detected
                if ((prevOsc <= prevFilt && osc > filt) ||
                    (prevOsc >= prevFilt && osc < filt)) {
                    crossPoints.push({
                        index: i,
                        type: osc > filt ? 'bullish' : 'bearish',
                        value: osc,
                        price: this.priceHistory[i] || 0
                    });
                }
            }

            chartData.push({
                index: i,
                oscillator: osc,
                filtered: filt,
                upper: this.upperThreshold,
                lower: this.lowerThreshold,
                zero: 0,
                color: color,
                gradientColor: gradientColor,
                opacity: opacity,
                strength: strength
            });
        }

        return {
            data: chartData,
            crossPoints: crossPoints, // X marks for the chart
            invalidation: this.invalidationLevels,
            lastSignal: this.lastSignal,
            gradient: {
                bullish: 'linear-gradient(to top, rgba(0,255,255,0.2), rgba(0,255,255,1))',
                bearish: 'linear-gradient(to bottom, rgba(255,0,255,0.2), rgba(255,0,255,1))'
            }
        };
    }

    /**
     * Get cross point markers for main price chart
     * Returns X coordinates for marking crossover points
     */
    getCrossPointMarkers() {
        const markers = [];

        if (this.lastSignal && this.priceHistory.length > 0) {
            const currentPrice = this.priceHistory[this.priceHistory.length - 1];

            markers.push({
                price: currentPrice,
                type: this.lastSignal.type,
                symbol: 'X',
                color: this.lastSignal.type === 'BUY' ? '#0080FF' : '#8B008B', // Blue for bull, Purple for bear
                size: 12,
                timestamp: this.lastSignal.timestamp
            });
        }

        // Add invalidation level markers (STOP LOSS LEVELS)
        if (this.invalidationLevels.bullish) {
            markers.push({
                price: this.invalidationLevels.bullish,
                type: 'stop_loss',
                symbol: '━',  // Horizontal line for stop
                color: '#FF4444',  // Red for stop loss
                size: 10,
                label: 'STOP (Long)',
                description: 'Exit long position if price drops below'
            });
        }

        if (this.invalidationLevels.bearish) {
            markers.push({
                price: this.invalidationLevels.bearish,
                type: 'stop_loss',
                symbol: '━',  // Horizontal line for stop
                color: '#FF6666',  // Light red for stop loss
                size: 10,
                label: 'STOP (Short)',
                description: 'Exit short position if price rises above'
            });
        }

        return markers;
    }
}

module.exports = TwoPoleOscillator;