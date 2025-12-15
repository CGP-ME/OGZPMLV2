/**
 * OGZ Prime V2 - Backtesting Engine
 *
 * This engine simulates trading strategies on historical data to find
 * optimal parameters for maximum profitability.
 */

const OptimizedTradingBrain = require('../core/OptimizedTradingBrain.js');
const optimizedIndicators = require('../core/OptimizedIndicators.js');
const { getInstance: getStateManager } = require('../core/StateManager.js');
const MaxProfitManager = require('../core/MaxProfitManager.js');
const RiskManager = require('../core/RiskManager.js');
const fs = require('fs').promises;
const path = require('path');

class BacktestEngine {
    constructor() {
        this.results = [];
        this.bestStrategy = null;
        this.indicators = optimizedIndicators;  // Use the singleton instance
    }

    /**
     * Load historical price data from file or API
     */
    async loadHistoricalData(source, period = '30d') {
        console.log(`📊 Loading historical data for ${period}...`);

        // Check for cached data first
        const cacheFile = `./backtest/data/btc_${period}.json`;
        try {
            const cached = await fs.readFile(cacheFile, 'utf8');
            console.log(`✅ Loaded cached data from ${cacheFile}`);
            return JSON.parse(cached);
        } catch (e) {
            // Fetch fresh data if no cache
            console.log(`📡 Fetching fresh data from Kraken...`);
            return await this.fetchKrakenData(period);
        }
    }

    /**
     * Fetch historical data from Kraken
     */
    async fetchKrakenData(period) {
        const intervals = {
            '1d': 1440,    // Daily
            '7d': 10080,   // Weekly
            '30d': 43200,  // Monthly
            '90d': 129600  // 3 months
        };

        const since = Math.floor(Date.now() / 1000) - intervals[period] * 60;

        try {
            const response = await fetch(
                `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1&since=${since}`
            );
            const data = await response.json();

            if (data.error && data.error.length > 0) {
                throw new Error(`Kraken API error: ${data.error.join(', ')}`);
            }

            // Transform Kraken data to our format
            const candles = data.result.XXBTZUSD.map(candle => ({
                timestamp: candle[0] * 1000,
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[6])
            }));

            // Cache the data
            await this.cacheData(`btc_${period}.json`, candles);

            return candles;
        } catch (error) {
            console.error('❌ Error fetching Kraken data:', error);
            throw error;
        }
    }

    /**
     * Cache data to disk for faster subsequent runs
     */
    async cacheData(filename, data) {
        const dir = './backtest/data';
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
            path.join(dir, filename),
            JSON.stringify(data, null, 2)
        );
        console.log(`💾 Cached data to ${filename}`);
    }

    /**
     * Run backtest with specific parameters
     */
    async runBacktest(priceData, params = {}) {
        const {
            initialBalance = 10000,
            positionSize = 0.05,      // 5% per trade
            stopLoss = 0.02,           // 2% stop loss
            takeProfit = 0.03,         // 3% take profit
            rsiOverbought = 70,
            rsiOversold = 30,
            macdThreshold = 0,
            minConfidence = 30,        // Minimum confidence to trade
            maxTrades = 30,            // Max trades per day
            trailingStop = false,
            trailingPercent = 0.01
        } = params;

        // Initialize components - use getInstance for singleton
        const stateManager = getStateManager();
        const tradingBrain = new OptimizedTradingBrain(initialBalance);
        const maxProfitManager = new MaxProfitManager();
        const riskManager = new RiskManager();

        // Set initial state
        stateManager.updateState({
            balance: initialBalance,
            totalBalance: initialBalance,
            position: 0,
            activeTrades: new Map()
        });

        // Track metrics
        const trades = [];
        let wins = 0;
        let losses = 0;
        let maxDrawdown = 0;
        let peakBalance = initialBalance;

        // Need at least 15 candles for indicators
        const warmupPeriod = 15;

        console.log(`\n🔄 Running backtest with params:`, params);
        console.log(`📊 Testing ${priceData.length} candles...`);

        for (let i = warmupPeriod; i < priceData.length; i++) {
            const currentCandles = priceData.slice(0, i + 1);
            const currentPrice = priceData[i].close;
            const state = stateManager.getState();

            // Calculate indicators
            const indicators = this.indicators.calculateAll(currentCandles);

            // Skip if indicators not ready
            if (!indicators.rsi || !indicators.macd) continue;

            // Generate trade signal
            const signal = this.generateSignal(indicators, params);

            // Check if we should exit current position
            if (state.position > 0) {
                const entryPrice = state.entryPrice;
                const pnlPercent = (currentPrice - entryPrice) / entryPrice;

                // Check exit conditions
                let shouldExit = false;
                let exitReason = '';

                // Stop loss
                if (pnlPercent <= -stopLoss) {
                    shouldExit = true;
                    exitReason = 'STOP_LOSS';
                    losses++;
                }
                // Take profit
                else if (pnlPercent >= takeProfit) {
                    shouldExit = true;
                    exitReason = 'TAKE_PROFIT';
                    wins++;
                }
                // Signal reversal
                else if (signal.direction === 'SELL' && signal.confidence > minConfidence) {
                    shouldExit = true;
                    exitReason = 'SIGNAL_REVERSAL';
                    if (pnlPercent > 0) wins++;
                    else losses++;
                }
                // Trailing stop
                else if (trailingStop && state.highWaterMark) {
                    const trailing = (state.highWaterMark - currentPrice) / state.highWaterMark;
                    if (trailing >= trailingPercent) {
                        shouldExit = true;
                        exitReason = 'TRAILING_STOP';
                        if (pnlPercent > 0) wins++;
                        else losses++;
                    }
                }

                if (shouldExit) {
                    // Close position
                    const pnl = state.position * pnlPercent;
                    const newBalance = state.balance + state.position + pnl;

                    trades.push({
                        type: 'SELL',
                        price: currentPrice,
                        size: state.position,
                        pnl,
                        pnlPercent: pnlPercent * 100,
                        reason: exitReason,
                        timestamp: priceData[i].timestamp
                    });

                    stateManager.updateState({
                        balance: newBalance,
                        totalBalance: newBalance,
                        position: 0,
                        entryPrice: 0,
                        highWaterMark: 0
                    });

                    // Update peak balance and drawdown
                    if (newBalance > peakBalance) {
                        peakBalance = newBalance;
                    }
                    const drawdown = (peakBalance - newBalance) / peakBalance;
                    if (drawdown > maxDrawdown) {
                        maxDrawdown = drawdown;
                    }
                }
                // Update high water mark for trailing stop
                else if (trailingStop && currentPrice > (state.highWaterMark || 0)) {
                    stateManager.updateState({ highWaterMark: currentPrice });
                }
            }
            // Check if we should enter a position
            else if (state.position === 0 && signal.direction === 'BUY' && signal.confidence > minConfidence) {
                // Check daily trade limit
                const todayTrades = trades.filter(t => {
                    const tradeDate = new Date(t.timestamp).toDateString();
                    const currentDate = new Date(priceData[i].timestamp).toDateString();
                    return tradeDate === currentDate;
                }).length;

                if (todayTrades < maxTrades) {
                    // Open position
                    const size = state.balance * positionSize;

                    trades.push({
                        type: 'BUY',
                        price: currentPrice,
                        size,
                        confidence: signal.confidence,
                        timestamp: priceData[i].timestamp
                    });

                    stateManager.updateState({
                        balance: state.balance - size,
                        position: size,
                        entryPrice: currentPrice,
                        highWaterMark: currentPrice
                    });
                }
            }
        }

        // Calculate final metrics
        const finalBalance = stateManager.getState().balance + stateManager.getState().position;
        const totalReturn = ((finalBalance - initialBalance) / initialBalance) * 100;
        const winRate = trades.length > 0 ? (wins / (wins + losses)) * 100 : 0;
        const avgWin = this.calculateAvgWin(trades);
        const avgLoss = this.calculateAvgLoss(trades);
        const profitFactor = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;
        const sharpeRatio = this.calculateSharpeRatio(trades);

        const results = {
            params,
            metrics: {
                totalTrades: trades.length,
                wins,
                losses,
                winRate: winRate.toFixed(2) + '%',
                totalReturn: totalReturn.toFixed(2) + '%',
                finalBalance: finalBalance.toFixed(2),
                maxDrawdown: (maxDrawdown * 100).toFixed(2) + '%',
                avgWin: avgWin.toFixed(2) + '%',
                avgLoss: avgLoss.toFixed(2) + '%',
                profitFactor: profitFactor.toFixed(2),
                sharpeRatio: sharpeRatio.toFixed(2)
            },
            trades
        };

        return results;
    }

    /**
     * Generate trading signal based on indicators
     */
    generateSignal(indicators, params) {
        const {
            rsiOverbought = 70,
            rsiOversold = 30,
            macdThreshold = 0
        } = params;

        let bullishSignals = 0;
        let bearishSignals = 0;
        let confidence = 10; // Base confidence

        // RSI signals
        if (indicators.rsi < rsiOversold) {
            bullishSignals++;
            confidence += 20;
        } else if (indicators.rsi > rsiOverbought) {
            bearishSignals++;
            confidence += 20;
        }

        // MACD signals
        if (indicators.macd?.histogram > macdThreshold) {
            bullishSignals++;
            confidence += 15;
        } else if (indicators.macd?.histogram < -macdThreshold) {
            bearishSignals++;
            confidence += 15;
        }

        // EMA alignment
        if (indicators.ema9 > indicators.ema20 && indicators.ema20 > indicators.ema50) {
            bullishSignals++;
            confidence += 25;
        } else if (indicators.ema9 < indicators.ema20 && indicators.ema20 < indicators.ema50) {
            bearishSignals++;
            confidence += 25;
        }

        // Bollinger Bands
        if (indicators.bollingerBands) {
            const price = indicators.price;
            const { lower, upper } = indicators.bollingerBands;

            if (price <= lower) {
                bullishSignals++;
                confidence += 10;
            } else if (price >= upper) {
                bearishSignals++;
                confidence += 10;
            }
        }

        // Determine direction
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
     * Calculate average win percentage
     */
    calculateAvgWin(trades) {
        const wins = trades.filter(t => t.pnlPercent > 0);
        if (wins.length === 0) return 0;
        return wins.reduce((sum, t) => sum + t.pnlPercent, 0) / wins.length;
    }

    /**
     * Calculate average loss percentage
     */
    calculateAvgLoss(trades) {
        const losses = trades.filter(t => t.pnlPercent < 0);
        if (losses.length === 0) return 0;
        return losses.reduce((sum, t) => sum + t.pnlPercent, 0) / losses.length;
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

        // Annualized Sharpe (assuming daily returns, 252 trading days)
        return (avgReturn * Math.sqrt(252)) / stdDev;
    }

    /**
     * Grid search to find optimal parameters
     */
    async optimizeParameters(priceData) {
        console.log('\n🔍 Starting parameter optimization...\n');

        const paramGrid = {
            positionSize: [0.02, 0.05, 0.1],        // 2%, 5%, 10%
            stopLoss: [0.01, 0.02, 0.03],           // 1%, 2%, 3%
            takeProfit: [0.02, 0.03, 0.05],         // 2%, 3%, 5%
            rsiOversold: [20, 25, 30],
            rsiOverbought: [70, 75, 80],
            minConfidence: [20, 30, 40],
            trailingStop: [false, true]
        };

        let bestResult = null;
        let bestReturn = -Infinity;
        let totalCombinations = 1;

        // Calculate total combinations
        for (const key in paramGrid) {
            totalCombinations *= paramGrid[key].length;
        }

        console.log(`📊 Testing ${totalCombinations} parameter combinations...\n`);

        let tested = 0;

        // Test all combinations
        for (const positionSize of paramGrid.positionSize) {
            for (const stopLoss of paramGrid.stopLoss) {
                for (const takeProfit of paramGrid.takeProfit) {
                    for (const rsiOversold of paramGrid.rsiOversold) {
                        for (const rsiOverbought of paramGrid.rsiOverbought) {
                            for (const minConfidence of paramGrid.minConfidence) {
                                for (const trailingStop of paramGrid.trailingStop) {
                                    const params = {
                                        positionSize,
                                        stopLoss,
                                        takeProfit,
                                        rsiOversold,
                                        rsiOverbought,
                                        minConfidence,
                                        trailingStop,
                                        trailingPercent: 0.01
                                    };

                                    const result = await this.runBacktest(priceData, params);
                                    tested++;

                                    const totalReturn = parseFloat(result.metrics.totalReturn);

                                    // Update best result if this is better
                                    if (totalReturn > bestReturn) {
                                        bestReturn = totalReturn;
                                        bestResult = result;

                                        console.log(`\n🏆 New best! Return: ${totalReturn.toFixed(2)}%`);
                                        console.log(`   Win Rate: ${result.metrics.winRate}`);
                                        console.log(`   Profit Factor: ${result.metrics.profitFactor}`);
                                        console.log(`   Params:`, params);
                                    }

                                    // Progress update
                                    if (tested % 10 === 0) {
                                        console.log(`Progress: ${tested}/${totalCombinations} (${(tested/totalCombinations*100).toFixed(1)}%)`);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        console.log('\n✅ Optimization complete!');
        console.log('\n🏆 BEST PARAMETERS FOUND:');
        console.log('═══════════════════════════════════════');
        console.log(bestResult.params);
        console.log('\n📊 PERFORMANCE METRICS:');
        console.log('═══════════════════════════════════════');
        console.log(bestResult.metrics);

        // Save best parameters
        await this.saveBestParams(bestResult);

        return bestResult;
    }

    /**
     * Save best parameters to file
     */
    async saveBestParams(result) {
        const dir = './backtest/results';
        await fs.mkdir(dir, { recursive: true });

        const filename = `best_params_${new Date().toISOString().split('T')[0]}.json`;
        await fs.writeFile(
            path.join(dir, filename),
            JSON.stringify(result, null, 2)
        );

        console.log(`\n💾 Best parameters saved to ${filename}`);
    }

    /**
     * Generate performance report
     */
    async generateReport(results) {
        let report = '# OGZ PRIME V2 - BACKTEST REPORT\n\n';
        report += `Generated: ${new Date().toISOString()}\n\n`;

        report += '## BEST PARAMETERS\n\n';
        report += '```json\n';
        report += JSON.stringify(results.params, null, 2);
        report += '\n```\n\n';

        report += '## PERFORMANCE METRICS\n\n';
        report += '| Metric | Value |\n';
        report += '|--------|-------|\n';
        for (const [key, value] of Object.entries(results.metrics)) {
            report += `| ${key} | ${value} |\n`;
        }

        report += '\n## TRADE ANALYSIS\n\n';

        // Group trades by outcome
        const winners = results.trades.filter(t => t.pnlPercent > 0);
        const losers = results.trades.filter(t => t.pnlPercent < 0);

        report += `- Total Trades: ${results.trades.length}\n`;
        report += `- Winners: ${winners.length}\n`;
        report += `- Losers: ${losers.length}\n`;
        report += `- Largest Win: ${Math.max(...winners.map(t => t.pnlPercent || 0)).toFixed(2)}%\n`;
        report += `- Largest Loss: ${Math.min(...losers.map(t => t.pnlPercent || 0)).toFixed(2)}%\n`;

        // Save report
        const dir = './backtest/reports';
        await fs.mkdir(dir, { recursive: true });

        const filename = `backtest_report_${new Date().toISOString().split('T')[0]}.md`;
        await fs.writeFile(path.join(dir, filename), report);

        console.log(`\n📄 Report saved to ${filename}`);

        return report;
    }
}

// Export for use in other modules
module.exports = BacktestEngine;

// Run if called directly
if (require.main === module) {
    const engine = new BacktestEngine();

    (async () => {
        try {
            console.log('🚀 OGZ Prime V2 Backtesting Engine\n');

            // Load historical data (30 days)
            const priceData = await engine.loadHistoricalData('kraken', '30d');
            console.log(`✅ Loaded ${priceData.length} candles\n`);

            // Run optimization
            const bestResult = await engine.optimizeParameters(priceData);

            // Generate report
            await engine.generateReport(bestResult);

            console.log('\n✅ Backtesting complete!');

        } catch (error) {
            console.error('❌ Backtest failed:', error);
            process.exit(1);
        }
    })();
}