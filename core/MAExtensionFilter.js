/**
 * MAExtensionFilter - 20MA Extension + Acceleration + First-Touch Skip
 *
 * Filters mean-reversion signals by tracking how far/fast price moves
 * away from the 20MA. After an "accelerating away" event, the first
 * touch back to the MA is often a fake-out - skip it, take the second.
 *
 * @author OGZPrime
 */

class MAExtensionFilter {
    constructor(config = {}) {
        // Slope thresholds
        this.slopeWindow = config.slopeWindow || 5;           // Bars for slope calc
        this.slopeTh = config.slopeTh || 0.001;               // Trend slope threshold
        this.slope200Th = config.slope200Th || 0.0005;        // Sideways 200MA threshold

        // Extension thresholds (in ATR units)
        this.extTh = config.extTh || 1.5;                     // Extension threshold
        this.accelTh = config.accelTh || 0.2;                 // Acceleration threshold
        this.touchBand = config.touchBand || 0.3;             // Touch band (ATR units)

        // First-touch skip settings
        this.skipTimeout = config.skipTimeout || 20;          // Bars before reset
        this.usePercentBand = config.usePercentBand || false; // Use % instead of ATR
        this.percentBand = config.percentBand || 0.005;       // 0.5% band if no ATR

        // State tracking
        this.state = {
            regime: 'unknown',           // 'trendUp', 'trendDown', 'sideways'
            extension: 0,
            prevExtension: 0,
            accel: 0,
            acceleratingAway: false,
            accelerateDirection: null,   // 'up' or 'down'
            touchCount: 0,
            barsSinceAccelerate: 0,
            skipActive: false
        };

        // History for slope calculation
        this.sma20History = [];
        this.sma200History = [];
        this.extensionHistory = [];

        console.log('📐 MAExtensionFilter initialized');
    }

    /**
     * Calculate slope over N bars
     */
    calcSlope(values, n) {
        if (values.length < n + 1) return 0;

        const recent = values.slice(-n - 1);
        const oldest = recent[0];
        const newest = recent[recent.length - 1];

        if (oldest === 0) return 0;
        return (newest - oldest) / oldest / n;
    }

    /**
     * Detect market regime
     */
    detectRegime(close, sma20, sma200) {
        const slope20 = this.calcSlope(this.sma20History, this.slopeWindow);
        const slope200 = this.calcSlope(this.sma200History, this.slopeWindow);

        // Trend up: positive slope + price above MA
        if (slope20 > this.slopeTh && close > sma20) {
            return 'trendUp';
        }

        // Trend down: negative slope + price below MA
        if (slope20 < -this.slopeTh && close < sma20) {
            return 'trendDown';
        }

        // Sideways: flat 20MA and 200MA
        if (Math.abs(slope20) <= this.slopeTh && Math.abs(slope200) <= this.slope200Th) {
            return 'sideways';
        }

        return 'transition';
    }

    /**
     * Calculate extension from 20MA (in ATR units or %)
     */
    calcExtension(close, sma20, atr) {
        if (this.usePercentBand || !atr || atr === 0) {
            // Use percentage
            return (close - sma20) / close;
        }
        // Use ATR
        return (close - sma20) / atr;
    }

    /**
     * Check if price is touching the 20MA band
     */
    isTouchingMA(close, sma20, atr) {
        const distance = Math.abs(close - sma20);

        if (this.usePercentBand || !atr || atr === 0) {
            return distance / close <= this.percentBand;
        }

        return distance <= this.touchBand * atr;
    }

    /**
     * Main update - call on each candle
     * Returns filter decision for mean-reversion signals
     */
    update(close, sma20, sma200, atr) {
        // Update histories
        this.sma20History.push(sma20);
        this.sma200History.push(sma200);
        if (this.sma20History.length > 50) this.sma20History.shift();
        if (this.sma200History.length > 50) this.sma200History.shift();

        // Calculate extension
        this.state.prevExtension = this.state.extension;
        this.state.extension = this.calcExtension(close, sma20, atr);
        this.state.accel = this.state.extension - this.state.prevExtension;

        this.extensionHistory.push(this.state.extension);
        if (this.extensionHistory.length > 20) this.extensionHistory.shift();

        // Detect regime
        this.state.regime = this.detectRegime(close, sma20, sma200);

        // Check for accelerating away
        const acceleratingUp = this.state.regime === 'trendUp' &&
                               this.state.extension > this.extTh &&
                               this.state.accel > this.accelTh;

        const acceleratingDown = this.state.regime === 'trendDown' &&
                                 this.state.extension < -this.extTh &&
                                 this.state.accel < -this.accelTh;

        // New accelerate event
        if (acceleratingUp && !this.state.acceleratingAway) {
            this.state.acceleratingAway = true;
            this.state.accelerateDirection = 'up';
            this.state.touchCount = 0;
            this.state.barsSinceAccelerate = 0;
            this.state.skipActive = true;
            console.log(`🚀 Accelerating UP - extension: ${this.state.extension.toFixed(2)}, accel: ${this.state.accel.toFixed(3)}`);
        }

        if (acceleratingDown && !this.state.acceleratingAway) {
            this.state.acceleratingAway = true;
            this.state.accelerateDirection = 'down';
            this.state.touchCount = 0;
            this.state.barsSinceAccelerate = 0;
            this.state.skipActive = true;
            console.log(`🚀 Accelerating DOWN - extension: ${this.state.extension.toFixed(2)}, accel: ${this.state.accel.toFixed(3)}`);
        }

        // Track bars since accelerate event
        if (this.state.skipActive) {
            this.state.barsSinceAccelerate++;

            // Timeout reset
            if (this.state.barsSinceAccelerate >= this.skipTimeout) {
                this.resetSkip('timeout');
            }
        }

        // Check for MA touch
        const touching = this.isTouchingMA(close, sma20, atr);

        if (touching && this.state.skipActive) {
            this.state.touchCount++;
            console.log(`👆 MA Touch #${this.state.touchCount} (skip: ${this.state.touchCount === 1 ? 'YES' : 'NO'})`);

            if (this.state.touchCount >= 2) {
                this.resetSkip('second_touch');
            }
        }

        // Reset accelerating state when price returns to MA
        if (touching && !this.state.skipActive) {
            this.state.acceleratingAway = false;
            this.state.accelerateDirection = null;
        }

        return this.getFilterResult(close, sma20, touching);
    }

    /**
     * Reset skip state
     */
    resetSkip(reason) {
        console.log(`📐 Skip reset: ${reason}`);
        this.state.skipActive = false;
        this.state.touchCount = 0;
        this.state.barsSinceAccelerate = 0;
    }

    /**
     * Get filter result for signal decisions
     */
    getFilterResult(close, sma20, touching) {
        const shouldSkip = this.state.skipActive && this.state.touchCount <= 1;

        return {
            regime: this.state.regime,
            extension: this.state.extension,
            accel: this.state.accel,
            acceleratingAway: this.state.acceleratingAway,
            accelerateDirection: this.state.accelerateDirection,
            touching: touching,
            touchCount: this.state.touchCount,
            skipActive: this.state.skipActive,
            shouldSkipSignal: shouldSkip,
            barsSinceAccelerate: this.state.barsSinceAccelerate,

            // Signal guidance
            allowLong: !shouldSkip || this.state.accelerateDirection !== 'down',
            allowShort: !shouldSkip || this.state.accelerateDirection !== 'up',

            // Debug
            priceVsMA: close > sma20 ? 'above' : 'below'
        };
    }

    /**
     * Check if a mean-reversion LONG signal should be taken
     * (price touching MA from below after downward acceleration)
     */
    shouldTakeLong(close, sma20, atr) {
        const result = this.getFilterResult(close, sma20, this.isTouchingMA(close, sma20, atr));

        // Skip first touch after accelerating down
        if (result.skipActive && result.accelerateDirection === 'down' && result.touchCount <= 1) {
            return { take: false, reason: 'first_touch_skip' };
        }

        return { take: true, reason: 'allowed' };
    }

    /**
     * Check if a mean-reversion SHORT signal should be taken
     * (price touching MA from above after upward acceleration)
     */
    shouldTakeShort(close, sma20, atr) {
        const result = this.getFilterResult(close, sma20, this.isTouchingMA(close, sma20, atr));

        // Skip first touch after accelerating up
        if (result.skipActive && result.accelerateDirection === 'up' && result.touchCount <= 1) {
            return { take: false, reason: 'first_touch_skip' };
        }

        return { take: true, reason: 'allowed' };
    }

    /**
     * Get current state for debugging/telemetry
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Reset all state
     */
    reset() {
        this.state = {
            regime: 'unknown',
            extension: 0,
            prevExtension: 0,
            accel: 0,
            acceleratingAway: false,
            accelerateDirection: null,
            touchCount: 0,
            barsSinceAccelerate: 0,
            skipActive: false
        };
        this.sma20History = [];
        this.sma200History = [];
        this.extensionHistory = [];
        console.log('📐 MAExtensionFilter reset');
    }
}

module.exports = MAExtensionFilter;
