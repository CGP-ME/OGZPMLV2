/**
 * SCALP SIGNAL MANAGER
 * Manages multiple proven scalp signal strategies
 * Combines signals from various "industry secret" indicators
 */

class ScalpSignalManager {
    constructor(config = {}) {
        this.strategies = new Map();
        this.signalHistory = [];
        this.activeSignals = [];

        // Configuration
        this.minConfluence = config.minConfluence || 2;  // Minimum strategies agreeing
        this.maxSignalAge = config.maxSignalAge || 5000; // 5 seconds
        this.riskRewardRatio = config.riskRewardRatio || 1.5;

        // Performance tracking
        this.stats = {
            totalSignals: 0,
            magicSignals: 0,
            confluenceSignals: 0,
            winRate: 0,
            avgRR: 0
        };

        console.log('🎯 Scalp Signal Manager initialized');
        console.log(`   📊 Min confluence: ${this.minConfluence} strategies`);
        console.log(`   ⏱️ Max signal age: ${this.maxSignalAge}ms`);
        console.log(`   💰 Risk/Reward: 1:${this.riskRewardRatio}`);
    }

    /**
     * Register a new scalp strategy
     */
    registerStrategy(name, strategy) {
        if (!strategy || typeof strategy.update !== 'function') {
            throw new Error(`Strategy ${name} must have an update() method`);
        }

        this.strategies.set(name, {
            instance: strategy,
            weight: strategy.weight || 1,
            enabled: true,
            stats: {
                signals: 0,
                accuracy: 0
            }
        });

        console.log(`✅ Registered strategy: ${name}`);
        return this;
    }

    /**
     * Update all strategies with new price/volume data
     */
    update(price, volume = 1, additionalData = {}) {
        const timestamp = Date.now();
        const signals = [];

        // Collect signals from all strategies
        for (const [name, strategy] of this.strategies) {
            if (!strategy.enabled) continue;

            try {
                const result = strategy.instance.update(price, volume, additionalData);

                if (result && result.signal) {
                    // Add strategy name for tracking
                    result.signal.strategy = name;
                    result.signal.timestamp = timestamp;

                    // Check if it's a magic signal
                    if (result.signal.magic || result.signal.confidence > 80) {
                        console.log(`✨ MAGIC signal from ${name}!`);
                        this.stats.magicSignals++;
                    }

                    signals.push(result.signal);
                    strategy.stats.signals++;
                }

                // Store additional data from strategy
                if (result) {
                    additionalData[name] = {
                        oscillator: result.oscillator,
                        delta: result.delta,
                        zone: result.zone
                    };
                }
            } catch (error) {
                console.error(`Error in strategy ${name}:`, error.message);
            }
        }

        // Clean old signals
        this.activeSignals = this.activeSignals.filter(
            s => timestamp - s.timestamp < this.maxSignalAge
        );

        // Add new signals
        this.activeSignals.push(...signals);

        // Check for confluence
        const confluenceSignal = this.checkConfluence(price);

        if (confluenceSignal) {
            this.signalHistory.push(confluenceSignal);
            this.stats.totalSignals++;

            // Limit history
            if (this.signalHistory.length > 100) {
                this.signalHistory.shift();
            }

            return {
                signal: confluenceSignal,
                strategies: this.getActiveStrategyNames(),
                data: additionalData
            };
        }

        return {
            signal: null,
            strategies: this.getActiveStrategyNames(),
            data: additionalData
        };
    }

    /**
     * Check if multiple strategies agree (confluence)
     */
    checkConfluence(currentPrice) {
        const buySignals = this.activeSignals.filter(s => s.type === 'BUY');
        const sellSignals = this.activeSignals.filter(s => s.type === 'SELL');

        // Check for BUY confluence
        if (buySignals.length >= this.minConfluence) {
            const avgConfidence = buySignals.reduce((sum, s) => sum + (s.confidence || 50), 0) / buySignals.length;
            const hasMagic = buySignals.some(s => s.magic);

            console.log(`🟢 CONFLUENCE BUY: ${buySignals.length} strategies agree!`);
            if (hasMagic) console.log(`   ✨ Including MAGIC signal!`);

            this.stats.confluenceSignals++;

            return {
                type: 'BUY',
                confluence: buySignals.length,
                confidence: Math.min(95, avgConfidence + (buySignals.length * 5)),
                magic: hasMagic,
                strategies: buySignals.map(s => s.strategy),
                price: currentPrice,
                timestamp: Date.now(),
                stopLoss: this.calculateStopLoss(currentPrice, 'BUY'),
                takeProfit: this.calculateTakeProfit(currentPrice, 'BUY')
            };
        }

        // Check for SELL confluence
        if (sellSignals.length >= this.minConfluence) {
            const avgConfidence = sellSignals.reduce((sum, s) => sum + (s.confidence || 50), 0) / sellSignals.length;
            const hasMagic = sellSignals.some(s => s.magic);

            console.log(`🔴 CONFLUENCE SELL: ${sellSignals.length} strategies agree!`);
            if (hasMagic) console.log(`   ✨ Including MAGIC signal!`);

            this.stats.confluenceSignals++;

            return {
                type: 'SELL',
                confluence: sellSignals.length,
                confidence: Math.min(95, avgConfidence + (sellSignals.length * 5)),
                magic: hasMagic,
                strategies: sellSignals.map(s => s.strategy),
                price: currentPrice,
                timestamp: Date.now(),
                stopLoss: this.calculateStopLoss(currentPrice, 'SELL'),
                takeProfit: this.calculateTakeProfit(currentPrice, 'SELL')
            };
        }

        return null;
    }

    /**
     * Calculate stop loss for signal
     */
    calculateStopLoss(price, type) {
        const stopPercent = 0.005; // 0.5% default

        if (type === 'BUY') {
            return price * (1 - stopPercent);
        } else {
            return price * (1 + stopPercent);
        }
    }

    /**
     * Calculate take profit for signal (1.5:1 RR ratio)
     */
    calculateTakeProfit(price, type) {
        const profitPercent = 0.005 * this.riskRewardRatio; // 0.75% for 1.5:1

        if (type === 'BUY') {
            return price * (1 + profitPercent);
        } else {
            return price * (1 - profitPercent);
        }
    }

    /**
     * Enable/disable specific strategy
     */
    toggleStrategy(name, enabled) {
        if (this.strategies.has(name)) {
            this.strategies.get(name).enabled = enabled;
            console.log(`${enabled ? '✅' : '❌'} Strategy ${name}: ${enabled ? 'enabled' : 'disabled'}`);
        }
    }

    /**
     * Get list of active strategy names
     */
    getActiveStrategyNames() {
        return Array.from(this.strategies.entries())
            .filter(([_, s]) => s.enabled)
            .map(([name, _]) => name);
    }

    /**
     * Get performance statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeStrategies: this.getActiveStrategyNames().length,
            totalStrategies: this.strategies.size,
            recentSignals: this.signalHistory.slice(-10)
        };
    }

    /**
     * Add a new proven scalp strategy dynamically
     */
    addProvenStrategy(config) {
        const { name, indicator, rules } = config;

        console.log(`📈 Adding proven strategy: ${name}`);
        console.log(`   Indicator: ${indicator}`);
        console.log(`   Rules: ${JSON.stringify(rules)}`);

        // This is where you'd add the new strategy implementation
        // For now, returning success
        return {
            success: true,
            message: `Strategy ${name} queued for implementation`
        };
    }
}

module.exports = ScalpSignalManager;