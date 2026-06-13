/**
 * @fileoverview TradeLogger - Persistent Trade History & Analytics
 *
 * Logs all trades to daily JSON files for performance analysis,
 * backtesting validation, and regulatory compliance.
 *
 * @description
 * ARCHITECTURE ROLE:
 * TradeLogger provides persistent trade records that survive restarts.
 * Used for:
 * - Performance analysis (win rate, avg P&L, etc.)
 * - Backtesting validation (compare backtest vs live)
 * - Audit trail for debugging trade issues
 * - Daily/weekly reporting
 *
 * FILE STRUCTURE:
 * ```
 * logs/trades/
 * |-- trades_2026-02-01.json
 * |-- trades_2026-02-02.json
 * `-- ...
 * ```
 *
 * TRADE RECORD FORMAT:
 * ```json
 * {
 *   "timestamp": "2026-02-01T12:00:00Z",
 *   "type": "BUY|SELL",
 *   "price": 100000,
 *   "amount": 0.001,
 *   "pnl": 1.50,
 *   "confidence": 75,
 *   "indicators": { "rsi": 45, "macd": 0.5 }
 * }
 * ```
 *
 * @module utils/tradeLogger
 * @requires fs
 * @requires path
 *
 * @example
 * const { logTrade } = require('./utils/tradeLogger');
 *
 * // Log a trade
 * logTrade({
 *   type: 'BUY',
 *   price: 100000,
 *   amount: 0.001,
 *   confidence: 75,
 *   indicators: { rsi: 45 }
 * });
 */

const fs = require('fs');
const path = require('path');

class TradeLogger {
    constructor() {
        // Use project root directory
        this.logDir = path.join(process.cwd(), 'logs', 'trades');
        this.ensureDirectoryExists();
    }

    finiteOrNull(value) {
        return Number.isFinite(value) ? value : null;
    }

    valueOrNull(value) {
        return value ?? null;
    }

    formatNullableNumber(value, decimals = 2) {
        return Number.isFinite(value) ? value.toFixed(decimals) : 'n/a';
    }

    finiteValues(values) {
        return values.filter(value => Number.isFinite(value));
    }

    averageFinite(values) {
        const finite = this.finiteValues(values);
        if (finite.length === 0) return null;
        return finite.reduce((sum, value) => sum + value, 0) / finite.length;
    }

    minFinite(values) {
        const finite = this.finiteValues(values);
        return finite.length === 0 ? null : Math.min(...finite);
    }

    maxFinite(values) {
        const finite = this.finiteValues(values);
        return finite.length === 0 ? null : Math.max(...finite);
    }

    /**
     * Ensure the logs directory exists
     */
    ensureDirectoryExists() {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
                console.log(`Created logs directory: ${this.logDir}`);
            }
        } catch (error) {
            console.error(`Failed to create logs directory: ${error.message}`);
        }
    }

    /**
     * Get today's log filename
     * @returns {string} Full path to today's log file
     */
    getTodayLogFile() {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        return path.join(this.logDir, `trades_${today}.json`);
    }

    /**
     * Load existing trades for today
     * @returns {Array} Array of existing trades
     */
    loadTodaysTrades() {
        const filePath = this.getTodayLogFile();
        
        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.warn(`Could not load existing trades: ${error.message}`);
        }
        
        return [];
    }

    /**
     * Save trades array to file
     * @param {Array} trades - Array of trade objects
     */
    saveTrades(trades) {
        // FIX 2026-02-20: Skip disk writes in backtest - causes EMFILE on Windows
        if (process.env.BACKTEST_MODE === 'true') return true;
        const filePath = this.getTodayLogFile();
        
        try {
            require('./AtomicWrite').writeJsonAtomic(filePath, trades);
            return true;
        } catch (error) {
            console.error(`Failed to save trades: ${error.message}`);
            return false;
        }
    }

    /**
     * Format hold time in human readable format
     * @param {number} holdTimeMs - Hold time in milliseconds
     * @returns {string} Formatted hold time
     */
    formatHoldTime(holdTimeMs) {
        // Type-safe conversion
        const ms = parseInt(holdTimeMs, 10);
        if (!Number.isFinite(ms)) return null;

        if (ms === 0) return '0s';

        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    /**
     * Get RSI signal interpretation
     * @param {number} rsi - RSI value
     * @returns {string} RSI signal
     */
    getRsiSignal(rsi) {
        if (!rsi) return 'unknown';
        if (rsi >= 70) return 'overbought';
        if (rsi <= 30) return 'oversold';
        if (rsi >= 60) return 'bullish';
        if (rsi <= 40) return 'bearish';
        return 'neutral';
    }

    /**
     * Get current market session
     * @returns {string} Market session
     */
    getMarketSession() {
        const hour = new Date().getUTCHours();
        
        // Market sessions (UTC)
        if (hour >= 13 && hour < 21) return 'US_OPEN';
        if (hour >= 8 && hour < 16) return 'EU_OPEN';
        if (hour >= 0 && hour < 8) return 'ASIA_OPEN';
        return 'OFF_HOURS';
    }

    /**
     * Log a single trade with comprehensive market analysis
     * @param {Object} tradeData - Trade information
     */
    logTrade(tradeData) {
        try {
            // Comprehensive trade record with all indicators and analysis
            const trade = {
                // Include caller fields first; normalized audit fields below win.
                ...tradeData,

                // Basic trade info
                timestamp: new Date().toISOString(),
                tradeId: `trade_${Date.now()}`,
                type: this.valueOrNull(tradeData.type),
                
                // Price data
                entryPrice: this.finiteOrNull(tradeData.entryPrice),
                exitPrice: this.finiteOrNull(tradeData.exitPrice),
                currentPrice: this.finiteOrNull(tradeData.currentPrice),
                size: this.finiteOrNull(tradeData.size),
                
                // Performance metrics
                pnl: this.finiteOrNull(tradeData.pnl),
                pnlPercent: this.finiteOrNull(tradeData.pnlPercent),
                fees: this.finiteOrNull(tradeData.fees),
                netPnl: Number.isFinite(tradeData.pnl) && Number.isFinite(tradeData.fees)
                    ? tradeData.pnl - tradeData.fees
                    : null,
                
                // Timing
                entryTime: tradeData.entryTime || new Date().toISOString(),
                exitTime: tradeData.exitTime || new Date().toISOString(),
                holdTime: this.finiteOrNull(tradeData.holdTime),
                holdTimeFormatted: Number.isFinite(tradeData.holdTime) ? this.formatHoldTime(tradeData.holdTime) : null,
                
                // Account data
                balanceBefore: this.finiteOrNull(tradeData.balanceBefore),
                balanceAfter: this.finiteOrNull(tradeData.balanceAfter),
                
                // Technical indicators at entry
                indicators: {
                    rsi: this.finiteOrNull(tradeData.rsi),
                    rsiSignal: this.getRsiSignal(tradeData.rsi),
                    macd: this.finiteOrNull(tradeData.macd),
                    macdSignal: this.finiteOrNull(tradeData.macdSignal),
                    macdHistogram: this.finiteOrNull(tradeData.macdHistogram),
                    macdCrossover: tradeData.macdCrossover || false,
                    ema20: this.finiteOrNull(tradeData.ema20),
                    ema50: this.finiteOrNull(tradeData.ema50),
                    ema200: this.finiteOrNull(tradeData.ema200),
                    sma20: this.finiteOrNull(tradeData.sma20),
                    sma50: this.finiteOrNull(tradeData.sma50),
                    bollingerUpper: this.finiteOrNull(tradeData.bollingerUpper),
                    bollingerLower: this.finiteOrNull(tradeData.bollingerLower),
                    bollingerMiddle: this.finiteOrNull(tradeData.bollingerMiddle),
                    stochastic: this.finiteOrNull(tradeData.stochastic),
                    volume: this.finiteOrNull(tradeData.volume),
                    atr: this.finiteOrNull(tradeData.atr),
                    adx: this.finiteOrNull(tradeData.adx)
                },
                
                // Market analysis
                analysis: {
                    trend: this.valueOrNull(tradeData.trend),
                    trendStrength: this.finiteOrNull(tradeData.trendStrength),
                    confidence: this.finiteOrNull(tradeData.confidence),
                    volatility: this.finiteOrNull(tradeData.volatility),
                    marketRegime: this.valueOrNull(tradeData.marketRegime),
                    support: this.finiteOrNull(tradeData.support),
                    resistance: this.finiteOrNull(tradeData.resistance),
                    fibLevels: tradeData.fibLevels || [],
                    keyLevel: tradeData.keyLevel || null,
                    levelDistance: this.finiteOrNull(tradeData.levelDistance)
                },
                
                // Entry reasoning
                entrySignal: {
                    primaryReason: this.valueOrNull(tradeData.entryReason),
                    secondaryReasons: tradeData.secondaryReasons || [],
                    signalStrength: this.finiteOrNull(tradeData.signalStrength),
                    conflictingSignals: tradeData.conflictingSignals || [],
                    patternMatch: tradeData.patternMatch || null,
                    patternConfidence: this.finiteOrNull(tradeData.patternConfidence),
                    timeframeConcurrence: tradeData.timeframeConcurrence || false
                },
                
                // Exit reasoning
                exitSignal: {
                    exitReason: tradeData.exitReason ?? tradeData.reason ?? null,
                    exitType: tradeData.exitType ?? null,
                    profitTier: tradeData.profitTier || null,
                    stopLossPrice: this.finiteOrNull(tradeData.stopLossPrice),
                    takeProfitPrice: this.finiteOrNull(tradeData.takeProfitPrice),
                    trailingStopPrice: this.finiteOrNull(tradeData.trailingStopPrice),
                    maxProfitReached: this.finiteOrNull(tradeData.maxProfitReached),
                    maxDrawdown: this.finiteOrNull(tradeData.maxDrawdown)
                },
                
                // Risk management
                riskManagement: {
                    positionSize: this.finiteOrNull(tradeData.positionSize),
                    riskPercent: this.finiteOrNull(tradeData.riskPercent),
                    riskAmount: this.finiteOrNull(tradeData.riskAmount),
                    rewardRiskRatio: this.finiteOrNull(tradeData.rewardRiskRatio),
                    maxRisk: this.finiteOrNull(tradeData.maxRisk),
                    actualRisk: this.finiteOrNull(tradeData.actualRisk)
                },
                
                // Pattern recognition data
                patternData: {
                    patternType: tradeData.patternType || null,
                    patternId: tradeData.patternId || null,
                    similarPatterns: this.finiteOrNull(tradeData.similarPatterns),
                    patternWinRate: this.finiteOrNull(tradeData.patternWinRate),
                    patternAvgReturn: this.finiteOrNull(tradeData.patternAvgReturn),
                    isNewPattern: tradeData.isNewPattern || false
                },
                
                // Market context
                marketContext: {
                    timeOfDay: new Date().getHours(),
                    dayOfWeek: new Date().getDay(),
                    marketSession: this.getMarketSession(),
                    newsEvents: tradeData.newsEvents || [],
                    economicEvents: tradeData.economicEvents || [],
                    marketSentiment: this.valueOrNull(tradeData.marketSentiment)
                },
                
                // Performance tracking
                performance: {
                    winStreak: this.finiteOrNull(tradeData.winStreak),
                    lossStreak: this.finiteOrNull(tradeData.lossStreak),
                    dailyPnL: this.finiteOrNull(tradeData.dailyPnL),
                    weeklyPnL: this.finiteOrNull(tradeData.weeklyPnL),
                    monthlyPnL: this.finiteOrNull(tradeData.monthlyPnL),
                    totalTrades: this.finiteOrNull(tradeData.totalTrades),
                    winRate: this.finiteOrNull(tradeData.winRate)
                },
                
                // Houston fund tracking
                houstonFund: {
                    target: 25000,
                    current: this.finiteOrNull(tradeData.balanceAfter),
                    progress: Number.isFinite(tradeData.balanceAfter) ? (tradeData.balanceAfter / 25000) * 100 : null,
                    remaining: Number.isFinite(tradeData.balanceAfter) ? 25000 - tradeData.balanceAfter : null,
                    daysTrading: this.finiteOrNull(tradeData.daysTrading),
                    avgDailyGain: this.finiteOrNull(tradeData.avgDailyGain)
                },
                
                // Raw data for debugging
                rawData: {
                    candles: tradeData.candles ? tradeData.candles.slice(-5) : [], // Last 5 candles
                    features: tradeData.features || [],
                    originalAnalysis: tradeData.originalAnalysis || null
                },
            };

            // Load existing trades
            const trades = this.loadTodaysTrades();
            
            // Add new trade
            trades.push(trade);
            
            // Save updated trades
            const saved = this.saveTrades(trades);
            
            if (saved) {
                console.log('COMPREHENSIVE TRADE LOG:');
                console.log(`   ${trade.type} | Entry: ${trade.entryPrice} | Exit: ${trade.exitPrice}`);
                console.log(`   P&L: ${this.formatNullableNumber(trade.pnl)} (${this.formatNullableNumber(trade.pnlPercent)}%) | Hold: ${trade.holdTimeFormatted}`);
                console.log(`   RSI: ${this.formatNullableNumber(trade.indicators.rsi, 1)} (${trade.indicators.rsiSignal}) | Trend: ${trade.analysis.trend} | Confidence: ${this.formatNullableNumber(trade.analysis.confidence)}`);
                console.log(`   Reason: ${trade.entrySignal.primaryReason} -> ${trade.exitSignal.exitReason}`);
                console.log(`   Houston Fund: ${this.formatNullableNumber(trade.houstonFund.current)} (${this.formatNullableNumber(trade.houstonFund.progress, 1)}% to goal)`);
            }
            
            return saved;
            
        } catch (error) {
            console.error(`Error logging trade: ${error.message}`);
            return false;
        }
    }

    /**
     * Get comprehensive trade statistics for today
     * @returns {Object} Detailed trade statistics
     */
    getTodayStats() {
        const trades = this.loadTodaysTrades();
        
        if (trades.length === 0) {
            return {
                totalTrades: 0,
                wins: 0,
                losses: 0,
                totalPnL: 0,
                winRate: 0,
                avgPnL: 0,
                bestTrade: 0,
                worstTrade: 0,
                avgHoldTime: 0,
                avgRSI: 0,
                trendBreakdown: {},
                exitReasonBreakdown: {},
                houstonProgress: 0
            };
        }

        const wins = trades.filter(t => t.pnl > 0);
        const losses = trades.filter(t => t.pnl < 0);
        const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
        const bestTrade = Math.max(...trades.map(t => t.pnl));
        const worstTrade = Math.min(...trades.map(t => t.pnl));
        const avgHoldTime = this.averageFinite(trades.map(t => t.holdTime));
        const avgRSI = this.averageFinite(trades.map(t => t.indicators?.rsi));

        // Trend breakdown
        const trendBreakdown = {};
        trades.forEach(t => {
            const trend = t.analysis?.trend ?? 'missing';
            trendBreakdown[trend] = (trendBreakdown[trend] || 0) + 1;
        });

        // Exit reason breakdown
        const exitReasonBreakdown = {};
        trades.forEach(t => {
            const reason = t.exitSignal?.exitReason ?? t.exitReason ?? 'missing';
            exitReasonBreakdown[reason] = (exitReasonBreakdown[reason] || 0) + 1;
        });

        // Pattern performance
        const patternStats = {};
        trades.forEach(t => {
            if (t.patternData?.patternType) {
                const pattern = t.patternData.patternType;
                if (!patternStats[pattern]) {
                    patternStats[pattern] = { wins: 0, losses: 0, totalPnL: 0, count: 0 };
                }
                patternStats[pattern].count++;
                patternStats[pattern].totalPnL += t.pnl;
                if (t.pnl > 0) patternStats[pattern].wins++;
                else patternStats[pattern].losses++;
            }
        });

        // Risk management stats
        const avgRiskPercent = this.averageFinite(trades.map(t => t.riskManagement?.riskPercent));
        const avgRewardRisk = this.averageFinite(trades.map(t => t.riskManagement?.rewardRiskRatio));

        return {
            // Basic stats
            totalTrades: trades.length,
            wins: wins.length,
            losses: losses.length,
            breakeven: trades.filter(t => t.pnl === 0).length,
            
            // Performance
            totalPnL: totalPnL,
            winRate: (wins.length / trades.length) * 100,
            avgPnL: totalPnL / trades.length,
            bestTrade: bestTrade,
            worstTrade: worstTrade,
            profitFactor: wins.reduce((sum, t) => sum + t.pnl, 0) / Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0)) || 0,
            
            // Timing
            avgHoldTime: avgHoldTime,
            avgHoldTimeFormatted: this.formatHoldTime(avgHoldTime),
            shortestTrade: this.minFinite(trades.map(t => t.holdTime)),
            longestTrade: this.maxFinite(trades.map(t => t.holdTime)),
            
            // Technical analysis
            avgRSI: avgRSI,
            avgConfidence: this.averageFinite(trades.map(t => t.analysis?.confidence)),
            avgVolatility: this.averageFinite(trades.map(t => t.analysis?.volatility)),
            
            // Breakdowns
            trendBreakdown,
            exitReasonBreakdown,
            patternStats,
            
            // Risk management
            avgRiskPercent,
            avgRewardRisk,
            maxDrawdown: this.minFinite(trades.map(t => t.exitSignal?.maxDrawdown)),
            
            // Houston fund
            houstonProgress: trades.length > 0 ? trades[trades.length - 1].houstonFund?.progress || 0 : 0,
            currentBalance: trades.length > 0 ? trades[trades.length - 1].balanceAfter || 0 : 0,
            
            // Raw data
            trades: trades
        };
    }

    /**
     * Get all trade files
     * @returns {Array} Array of trade file paths
     */
    getAllTradeFiles() {
        try {
            const files = fs.readdirSync(this.logDir);
            return files
                .filter(file => file.startsWith('trades_') && file.endsWith('.json'))
                .map(file => path.join(this.logDir, file));
        } catch (error) {
            console.error(`Error reading trade files: ${error.message}`);
            return [];
        }
    }

    /**
     * Clean old log files (keep last 30 days)
     */
    cleanOldLogs() {
        try {
            const files = this.getAllTradeFiles();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            files.forEach(filePath => {
                const fileName = path.basename(filePath);
                const dateMatch = fileName.match(/trades_(\d{4}-\d{2}-\d{2})\.json/);
                
                if (dateMatch) {
                    const fileDate = new Date(dateMatch[1]);
                    if (fileDate < thirtyDaysAgo) {
                        fs.unlinkSync(filePath);
                        console.log(`Cleaned old log file: ${fileName}`);
                    }
                }
            });
        } catch (error) {
            console.error(`Error cleaning old logs: ${error.message}`);
        }
    }
}

// Create singleton instance
const tradeLogger = new TradeLogger();

// Export functions for compatibility
function logTrade(tradeData) {
    return tradeLogger.logTrade(tradeData);
}

function getTodayStats() {
    return tradeLogger.getTodayStats();
}

function cleanOldLogs() {
    return tradeLogger.cleanOldLogs();
}

function generateDailyReport() {
    return tradeLogger.generateDailyReport();
}

// Export both class and functions
module.exports = {
    TradeLogger,
    logTrade,
    getTodayStats,
    cleanOldLogs,
    generateDailyReport,
    tradeLogger
};
