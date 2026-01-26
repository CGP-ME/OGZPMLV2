#!/usr/bin/env node
/**
 * OPTIMIZED BACKTEST ENGINE WITH FEATURE FLAGS
 * Integrates optimizeception logic with tier-based feature flags
 */

const FeatureFlagManager = require('../core/FeatureFlagManager');
const optimizedIndicators = require('../core/OptimizedIndicators');
const fs = require('fs').promises;
const path = require('path');

// CRITICAL: Set BACKTEST_MODE before FeatureFlagManager initializes
process.env.BACKTEST_MODE = 'true';

class OptimizedBacktestEngine {
    constructor(tier = 'ml') {
        this.tier = tier;
        // Use unified FeatureFlagManager instead of TierFeatureFlags
        this.featureFlags = FeatureFlagManager.getInstance();
        this.results = [];
        this.bestConfig = null;
        this.bestScore = -Infinity;

        console.log(`🧪 [Backtest] Mode: ${this.featureFlags.getMode()}, Tier: ${tier}`);
    }

    /**
     * Generate parameter grid based on tier features
     */
    generateParameterGrid() {
        const baseGrid = {
            minConfidence: [10, 15, 20, 25, 30],  // MUCH LOWER for actual trades
            stopLoss: [0.01, 0.015, 0.02],        // 1-2%
            takeProfit: [0.02, 0.025, 0.03],      // 2-3%
            positionSize: [0.1, 0.15, 0.2],       // 10-20%
            rsiOversold: [25, 30, 35],
            rsiOverbought: [65, 70, 75]
        };

        // ML tier gets additional parameters
        if (this.featureFlags.hasFeature('ml_enhanced_signals')) {
            baseGrid.volumeMultiplier = [1.5, 2.0, 2.5];
            baseGrid.macdSensitivity = [0.8, 1.0, 1.2];
            baseGrid.twoPoleThreshold = [-0.5, 0, 0.5];  // BigBeluga oscillator
        }

        // Elite tier gets basic optimization
        if (this.featureFlags.hasFeature('advanced_indicators')) {
            baseGrid.emaFastPeriod = [8, 9, 10];
            baseGrid.emaSlowPeriod = [19, 20, 21];
        }

        return baseGrid;
    }

    /**
     * Run single backtest with parameters
     */
    async runSingleBacktest(params, priceData) {
        const {
            minConfidence = 20,
            stopLoss = 0.015,
            takeProfit = 0.025,
            positionSize = 0.1,
            rsiOversold = 30,
            rsiOverbought = 70
        } = params;

        let balance = 10000;
        let position = 0;
        let entryPrice = 0;
        const trades = [];
        let wins = 0;
        let losses = 0;
        let maxDrawdown = 0;
        let peakBalance = balance;

        const warmupPeriod = 15;

        console.log(`Testing: conf=${minConfidence}, SL=${stopLoss*100}%, TP=${takeProfit*100}%`);

        for (let i = warmupPeriod; i < priceData.length; i++) {
            const currentCandles = priceData.slice(0, i + 1);
            const currentPrice = priceData[i].close;

            // Calculate indicators
            const indicators = optimizedIndicators.calculateTechnicalIndicators(currentCandles);
            if (!indicators.rsi || !indicators.macd) continue;

            // Generate signal with tier-aware logic
            const signal = this.generateSignal(indicators, params);

            // Position management
            if (position > 0) {
                const pnlPercent = (currentPrice - entryPrice) / entryPrice;
                let shouldExit = false;
                let exitReason = '';

                if (pnlPercent <= -stopLoss) {
                    shouldExit = true;
                    exitReason = 'STOP_LOSS';
                    losses++;
                } else if (pnlPercent >= takeProfit) {
                    shouldExit = true;
                    exitReason = 'TAKE_PROFIT';
                    wins++;
                } else if (signal.direction === 'SELL' && signal.confidence > minConfidence) {
                    shouldExit = true;
                    exitReason = 'SIGNAL_REVERSAL';
                    if (pnlPercent > 0) wins++;
                    else losses++;
                }

                if (shouldExit) {
                    const pnl = position * pnlPercent;
                    balance = balance + position + pnl;
                    trades.push({
                        type: 'SELL',
                        price: currentPrice,
                        size: position,
                        pnl,
                        pnlPercent: pnlPercent * 100,
                        reason: exitReason,
                        timestamp: priceData[i].timestamp
                    });
                    position = 0;
                    entryPrice = 0;

                    // Track drawdown
                    if (balance > peakBalance) peakBalance = balance;
                    const drawdown = (peakBalance - balance) / peakBalance;
                    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
                }
            } else if (position === 0 && signal.direction === 'BUY' && signal.confidence > minConfidence) {
                const size = balance * positionSize;
                trades.push({
                    type: 'BUY',
                    price: currentPrice,
                    size,
                    confidence: signal.confidence,
                    timestamp: priceData[i].timestamp
                });
                balance -= size;
                position = size;
                entryPrice = currentPrice;
            }
        }

        // Calculate metrics
        const finalBalance = balance + position;
        const totalReturn = ((finalBalance - 10000) / 10000) * 100;
        const winRate = trades.length > 0 ? (wins / (wins + losses)) * 100 : 0;
        const sharpeRatio = this.calculateSharpeRatio(trades);

        return {
            params,
            metrics: {
                totalTrades: trades.length,
                wins,
                losses,
                winRate,
                totalReturn,
                finalBalance,
                maxDrawdown: maxDrawdown * 100,
                sharpeRatio,
                profitFactor: this.calculateProfitFactor(trades)
            },
            trades
        };
    }

    /**
     * Generate trading signal with tier features
     */
    generateSignal(indicators, params) {
        const { rsiOversold = 30, rsiOverbought = 70 } = params;
        let bullishSignals = 0;
        let bearishSignals = 0;
        let confidence = 5;  // Start VERY low

        // Basic RSI signals (all tiers)
        if (indicators.rsi < rsiOversold) {
            bullishSignals++;
            confidence += 10;  // Lower confidence boost
        } else if (indicators.rsi > rsiOverbought) {
            bearishSignals++;
            confidence += 10;
        }

        // MACD signals (all tiers)
        if (indicators.macd?.histogram > 0) {
            bullishSignals++;
            confidence += 8;
        } else if (indicators.macd?.histogram < 0) {
            bearishSignals++;
            confidence += 8;
        }

        // EMA alignment (elite tier)
        if (this.featureFlags.hasFeature('advanced_indicators')) {
            if (indicators.ema9 > indicators.ema20 && indicators.ema20 > indicators.ema50) {
                bullishSignals++;
                confidence += 12;
            } else if (indicators.ema9 < indicators.ema20 && indicators.ema20 < indicators.ema50) {
                bearishSignals++;
                confidence += 12;
            }
        }

        // ML tier: Two-pole oscillator
        if (this.featureFlags.hasFeature('ml_enhanced_signals') && indicators.twoPoleOsc) {
            const { value, threshold = 0 } = indicators.twoPoleOsc;
            if (value > threshold) {
                bullishSignals++;
                confidence += 15;
            } else if (value < -threshold) {
                bearishSignals++;
                confidence += 15;
            }
        }

        // ML tier: Volume confirmation
        if (this.featureFlags.hasFeature('ml_volume_analysis') && indicators.volume) {
            const volumeMultiplier = params.volumeMultiplier || 2.0;
            if (indicators.volume > indicators.volumeMA * volumeMultiplier) {
                confidence += 10;
            }
        }

        const direction = bullishSignals > bearishSignals ? 'BUY' :
                         bearishSignals > bullishSignals ? 'SELL' : 'HOLD';

        return {
            direction,
            confidence: Math.min(confidence, 100),
            bullishSignals,
            bearishSignals
        };
    }

    /**
     * Calculate Sharpe ratio
     */
    calculateSharpeRatio(trades) {
        if (trades.length === 0) return 0;
        const returns = trades.filter(t => t.pnlPercent).map(t => t.pnlPercent);
        if (returns.length === 0) return 0;

        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev === 0) return 0;
        return (avgReturn * Math.sqrt(252)) / stdDev;
    }

    /**
     * Calculate profit factor
     */
    calculateProfitFactor(trades) {
        let grossProfit = 0;
        let grossLoss = 0;

        trades.forEach(trade => {
            if (trade.pnl > 0) grossProfit += trade.pnl;
            else if (trade.pnl < 0) grossLoss += Math.abs(trade.pnl);
        });

        return grossLoss === 0 ? grossProfit : (grossProfit / grossLoss);
    }

    /**
     * Run optimization with grid search
     */
    async optimize(priceData) {
        const grid = this.generateParameterGrid();
        const paramCombinations = this.generateCombinations(grid);

        console.log(`\n🎯 OPTIMIZECEPTION for ${this.tier} tier`);
        console.log(`📊 Testing ${paramCombinations.length} parameter combinations\n`);

        for (const params of paramCombinations) {
            const result = await this.runSingleBacktest(params, priceData);
            this.results.push(result);

            // Track best configuration
            const score = result.metrics.totalReturn - (result.metrics.maxDrawdown / 2);
            if (score > this.bestScore && result.metrics.totalTrades > 5) {
                this.bestScore = score;
                this.bestConfig = result;
            }

            // Show progress
            if (this.results.length % 10 === 0) {
                console.log(`Progress: ${this.results.length}/${paramCombinations.length}`);
            }
        }

        // Save results
        await this.saveResults();

        return this.bestConfig;
    }

    /**
     * Generate all parameter combinations
     */
    generateCombinations(grid) {
        const keys = Object.keys(grid);
        const combinations = [];

        function combine(index, current) {
            if (index === keys.length) {
                combinations.push({...current});
                return;
            }
            const key = keys[index];
            for (const value of grid[key]) {
                current[key] = value;
                combine(index + 1, current);
            }
        }

        combine(0, {});
        return combinations;
    }

    /**
     * Save optimization results
     */
    async saveResults() {
        const timestamp = new Date().toISOString();
        const resultsDir = path.join(__dirname, 'results');
        await fs.mkdir(resultsDir, { recursive: true });

        // Save best config
        if (this.bestConfig) {
            await fs.writeFile(
                path.join(resultsDir, `optimized-${this.tier}-${timestamp}.json`),
                JSON.stringify(this.bestConfig, null, 2)
            );

            console.log('\n✨ BEST CONFIGURATION FOUND:');
            console.log(`Return: ${this.bestConfig.metrics.totalReturn.toFixed(2)}%`);
            console.log(`Trades: ${this.bestConfig.metrics.totalTrades}`);
            console.log(`Win Rate: ${this.bestConfig.metrics.winRate.toFixed(2)}%`);
            console.log(`Max Drawdown: ${this.bestConfig.metrics.maxDrawdown.toFixed(2)}%`);
            console.log(`Parameters:`, this.bestConfig.params);
        }

        // Save all results
        await fs.writeFile(
            path.join(resultsDir, `all-results-${this.tier}-${timestamp}.json`),
            JSON.stringify(this.results, null, 2)
        );
    }
}

// Export for use in API
module.exports = OptimizedBacktestEngine;

// Run if called directly
if (require.main === module) {
    (async () => {
        try {
            // Load price data
            const dataPath = path.join(__dirname, 'data', 'btc-historical.json');
            const priceData = JSON.parse(await fs.readFile(dataPath, 'utf-8'));

            // Get tier from env or default to ml
            const tier = process.env.TRADING_TIER || 'ml';

            const engine = new OptimizedBacktestEngine(tier);
            const best = await engine.optimize(priceData.slice(0, 500)); // Use first 500 candles for speed

            if (best) {
                console.log('\n🏆 Optimization complete!');
                console.log(`Best score: ${engine.bestScore.toFixed(2)}`);
            } else {
                console.log('\n⚠️ No profitable configuration found');
            }
        } catch (error) {
            console.error('Optimization failed:', error);
            process.exit(1);
        }
    })();
}