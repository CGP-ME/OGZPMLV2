/**
 * OGZ Prime V2 - Backtesting REST API Server
 *
 * Provides HTTP endpoints for running backtests, optimizations, and retrieving results
 *
 * Endpoints:
 * - POST /api/backtest/run - Run single backtest with params
 * - POST /api/backtest/optimize - Run optimization grid search
 * - GET /api/backtest/results/:id - Get backtest results
 * - GET /api/backtest/list - List all backtest runs
 * - GET /api/backtest/best - Get best performing parameters
 * - WS /ws - WebSocket for real-time progress updates
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

// Import our modules
const optimizedIndicators = require('../core/OptimizedIndicators.js');
const FeatureFlagManager = require('../core/FeatureFlagManager.js');

// CRITICAL: Set BACKTEST_MODE before FeatureFlagManager initializes
process.env.BACKTEST_MODE = 'true';

const app = express();
const PORT = process.env.BACKTEST_PORT || 3011;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Create HTTP server
const server = http.createServer(app);

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ server });

// Store active backtest jobs
const activeJobs = new Map();
const completedJobs = new Map();

// Initialize unified feature flag manager
const flagManager = FeatureFlagManager.getInstance();
console.log(`🧪 [Backtest API] Mode: ${flagManager.getMode()}, Features: ${flagManager.getEnabledFeatures().length} enabled`);

/**
 * Broadcast message to all WebSocket clients
 */
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

/**
 * Simple backtest runner (without the complex imports)
 */
async function runSimpleBacktest(params, jobId) {
    try {
        broadcast({
            type: 'job_started',
            jobId,
            message: 'Loading historical data...'
        });

        // Load cached data or fetch from Kraken
        const priceData = await loadHistoricalData(params.period || '30d');

        broadcast({
            type: 'data_loaded',
            jobId,
            candles: priceData.length
        });

        const results = await simulateTrades(priceData, params, jobId);

        // Store results
        completedJobs.set(jobId, results);
        activeJobs.delete(jobId);

        // Save to file for persistence
        await saveResults(jobId, results);

        broadcast({
            type: 'job_completed',
            jobId,
            results
        });

        return results;
    } catch (error) {
        console.error('Backtest error:', error);
        broadcast({
            type: 'job_error',
            jobId,
            error: error.message
        });
        throw error;
    }
}

/**
 * Load historical price data
 */
async function loadHistoricalData(period = '30d') {
    // SECURITY: Validate period to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(period)) {
        throw new Error('Invalid period parameter');
    }

    const cacheFile = path.join(__dirname, 'data', `btc_${period}.json`);

    try {
        const data = await fs.readFile(cacheFile, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        // Fetch from Kraken if no cache
        return await fetchKrakenData(period);
    }
}

/**
 * Fetch data from Kraken
 */
async function fetchKrakenData(period) {
    const fetch = require('node-fetch');
    const intervals = {
        '1d': 1440,
        '7d': 10080,
        '30d': 43200,
        '90d': 129600
    };

    const since = Math.floor(Date.now() / 1000) - intervals[period] * 60;

    const response = await fetch(
        `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1&since=${since}`
    );
    const data = await response.json();

    if (data.error && data.error.length > 0) {
        throw new Error(`Kraken API error: ${data.error.join(', ')}`);
    }

    const candles = data.result.XXBTZUSD.map(candle => ({
        timestamp: candle[0] * 1000,
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[6])
    }));

    // Cache the data
    const dir = path.join(__dirname, 'data');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
        path.join(dir, `btc_${period}.json`),
        JSON.stringify(candles, null, 2)
    );

    return candles;
}

/**
 * Simulate trades based on parameters
 */
async function simulateTrades(priceData, params, jobId) {
    const {
        initialBalance = 10000,
        positionSize = 0.05,
        stopLoss = 0.02,
        takeProfit = 0.03,
        rsiOverbought = 70,
        rsiOversold = 30,
        minConfidence = 30,
        maxTrades = 30
    } = params;

    let balance = initialBalance;
    let position = 0;
    let entryPrice = 0;
    const trades = [];
    let wins = 0;
    let losses = 0;
    let maxDrawdown = 0;
    let peakBalance = initialBalance;

    const warmupPeriod = 15;

    for (let i = warmupPeriod; i < priceData.length; i++) {
        const currentCandles = priceData.slice(0, i + 1);
        const currentPrice = priceData[i].close;

        // Calculate indicators using our singleton
        let indicators;
        try {
            indicators = optimizedIndicators.calculateTechnicalIndicators(currentCandles);
        } catch (error) {
            console.error(`❌ Technical indicator calculation error:`, error);
            continue;
        }

        if (!indicators || !indicators.rsi || !indicators.macd) continue;

        // Generate trading signal
        const signal = generateSignal(indicators, params);

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

                if (balance > peakBalance) {
                    peakBalance = balance;
                }
                const drawdown = (peakBalance - balance) / peakBalance;
                if (drawdown > maxDrawdown) {
                    maxDrawdown = drawdown;
                }
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

        // Send progress updates
        if (i % 50 === 0) {
            broadcast({
                type: 'progress',
                jobId,
                progress: ((i - warmupPeriod) / (priceData.length - warmupPeriod)) * 100,
                currentBalance: balance + position,
                trades: trades.length
            });
        }
    }

    // Calculate final metrics
    const finalBalance = balance + position;
    const totalReturn = ((finalBalance - initialBalance) / initialBalance) * 100;
    const winRate = trades.length > 0 ? (wins / (wins + losses)) * 100 : 0;

    return {
        jobId,
        params,
        metrics: {
            totalTrades: trades.length,
            wins,
            losses,
            winRate: winRate.toFixed(2) + '%',
            totalReturn: totalReturn.toFixed(2) + '%',
            finalBalance: finalBalance.toFixed(2),
            maxDrawdown: (maxDrawdown * 100).toFixed(2) + '%',
            sharpeRatio: calculateSharpeRatio(trades)
        },
        trades,
        timestamp: new Date().toISOString()
    };
}

/**
 * Generate trading signal
 */
function generateSignal(indicators, params) {
    const { rsiOverbought = 70, rsiOversold = 30 } = params;

    let bullishSignals = 0;
    let bearishSignals = 0;
    let confidence = 10;

    // RSI signals
    if (indicators.rsi < rsiOversold) {
        bullishSignals++;
        confidence += 20;
    } else if (indicators.rsi > rsiOverbought) {
        bearishSignals++;
        confidence += 20;
    }

    // MACD signals
    if (indicators.macd?.histogram > 0) {
        bullishSignals++;
        confidence += 15;
    } else if (indicators.macd?.histogram < 0) {
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
function calculateSharpeRatio(trades) {
    if (trades.length === 0) return 0;

    const returns = trades.filter(t => t.pnlPercent).map(t => t.pnlPercent);
    if (returns.length === 0) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    return ((avgReturn * Math.sqrt(252)) / stdDev).toFixed(2);
}

/**
 * Save results to file
 */
async function saveResults(jobId, results) {
    const dir = path.join(__dirname, 'results');
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
        path.join(dir, `${jobId}.json`),
        JSON.stringify(results, null, 2)
    );
}

// ====== API ENDPOINTS ======

/**
 * POST /api/backtest/run
 * Run a single backtest with given parameters
 */
app.post('/api/backtest/run', async (req, res) => {
    const jobId = uuidv4();
    const params = req.body;

    activeJobs.set(jobId, {
        status: 'running',
        params,
        startTime: Date.now()
    });

    // Run backtest asynchronously
    runSimpleBacktest(params, jobId).catch(error => {
        activeJobs.delete(jobId);
        console.error('Backtest failed:', error);
    });

    res.json({
        success: true,
        jobId,
        message: 'Backtest started',
        params
    });
});

/**
 * POST /api/backtest/optimize
 * Run grid search optimization
 */
app.post('/api/backtest/optimize', async (req, res) => {
    const jobId = uuidv4();
    const { paramGrid, baseParams = {} } = req.body;

    if (!paramGrid) {
        return res.status(400).json({
            success: false,
            error: 'paramGrid is required'
        });
    }

    activeJobs.set(jobId, {
        status: 'optimizing',
        paramGrid,
        startTime: Date.now()
    });

    // Run optimization asynchronously
    runOptimization(paramGrid, baseParams, jobId).catch(error => {
        activeJobs.delete(jobId);
        console.error('Optimization failed:', error);
    });

    res.json({
        success: true,
        jobId,
        message: 'Optimization started'
    });
});

/**
 * Run parameter optimization
 */
async function runOptimization(paramGrid, baseParams, jobId) {
    const priceData = await loadHistoricalData(baseParams.period || '30d');

    let bestResult = null;
    let bestReturn = -Infinity;
    const allResults = [];

    // Calculate total combinations
    let totalCombinations = 1;
    for (const key in paramGrid) {
        totalCombinations *= paramGrid[key].length;
    }

    broadcast({
        type: 'optimization_started',
        jobId,
        totalCombinations
    });

    let tested = 0;

    // Generate all combinations
    const combinations = generateCombinations(paramGrid);

    for (const combo of combinations) {
        const params = { ...baseParams, ...combo };
        const result = await simulateTrades(priceData, params, jobId);

        tested++;
        allResults.push(result);

        const totalReturn = parseFloat(result.metrics.totalReturn);

        if (totalReturn > bestReturn) {
            bestReturn = totalReturn;
            bestResult = result;

            broadcast({
                type: 'new_best',
                jobId,
                bestResult: result.metrics,
                params
            });
        }

        broadcast({
            type: 'optimization_progress',
            jobId,
            tested,
            totalCombinations,
            currentParams: params
        });
    }

    const optimizationResults = {
        jobId,
        bestResult,
        allResults: allResults.sort((a, b) =>
            parseFloat(b.metrics.totalReturn) - parseFloat(a.metrics.totalReturn)
        ).slice(0, 10), // Top 10 results
        totalTested: tested,
        timestamp: new Date().toISOString()
    };

    completedJobs.set(jobId, optimizationResults);
    activeJobs.delete(jobId);

    await saveResults(jobId, optimizationResults);

    broadcast({
        type: 'optimization_completed',
        jobId,
        results: optimizationResults
    });

    return optimizationResults;
}

/**
 * Generate all parameter combinations
 */
function generateCombinations(paramGrid) {
    const keys = Object.keys(paramGrid);
    const combinations = [];

    function generate(index, current) {
        if (index === keys.length) {
            combinations.push({ ...current });
            return;
        }

        const key = keys[index];
        for (const value of paramGrid[key]) {
            current[key] = value;
            generate(index + 1, current);
        }
    }

    generate(0, {});
    return combinations;
}

/**
 * GET /api/backtest/results/:id
 * Get results for a specific job
 */
app.get('/api/backtest/results/:id', async (req, res) => {
    const { id } = req.params;

    // SECURITY: Validate ID to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid ID format'
        });
    }

    // Check if job is still running
    if (activeJobs.has(id)) {
        return res.json({
            success: true,
            status: 'running',
            job: activeJobs.get(id)
        });
    }

    // Check completed jobs
    if (completedJobs.has(id)) {
        return res.json({
            success: true,
            status: 'completed',
            results: completedJobs.get(id)
        });
    }

    // Try to load from file
    try {
        const data = await fs.readFile(
            path.join(__dirname, 'results', `${id}.json`),
            'utf8'
        );
        return res.json({
            success: true,
            status: 'completed',
            results: JSON.parse(data)
        });
    } catch (e) {
        return res.status(404).json({
            success: false,
            error: 'Job not found'
        });
    }
});

/**
 * GET /api/backtest/list
 * List all backtest runs
 */
app.get('/api/backtest/list', async (req, res) => {
    const running = Array.from(activeJobs.entries()).map(([id, job]) => ({
        id,
        status: 'running',
        ...job
    }));

    const completed = Array.from(completedJobs.entries()).map(([id, job]) => ({
        id,
        status: 'completed',
        metrics: job.metrics,
        timestamp: job.timestamp
    }));

    res.json({
        success: true,
        running,
        completed,
        total: running.length + completed.length
    });
});

/**
 * GET /api/backtest/best
 * Get best performing parameters
 */
app.get('/api/backtest/best', async (req, res) => {
    let bestResult = null;
    let bestReturn = -Infinity;

    for (const [id, job] of completedJobs) {
        const returns = parseFloat(job.metrics?.totalReturn || job.bestResult?.metrics?.totalReturn || -999);
        if (returns > bestReturn) {
            bestReturn = returns;
            bestResult = job;
        }
    }

    if (!bestResult) {
        return res.json({
            success: false,
            message: 'No completed backtests found'
        });
    }

    res.json({
        success: true,
        bestResult
    });
});

/**
 * GET /api/backtest/presets
 * Get preset parameter combinations
 */
app.get('/api/backtest/presets', (req, res) => {
    res.json({
        success: true,
        presets: {
            conservative: {
                positionSize: 0.02,
                stopLoss: 0.01,
                takeProfit: 0.02,
                minConfidence: 50
            },
            balanced: {
                positionSize: 0.05,
                stopLoss: 0.02,
                takeProfit: 0.03,
                minConfidence: 35
            },
            aggressive: {
                positionSize: 0.10,
                stopLoss: 0.03,
                takeProfit: 0.05,
                minConfidence: 25
            },
            scalper: {
                positionSize: 0.03,
                stopLoss: 0.005,
                takeProfit: 0.01,
                minConfidence: 40,
                maxTrades: 100
            }
        }
    });
});

/**
 * Serve static dashboard
 */
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>OGZ Prime Backtesting API</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; background: #1a1a1a; color: #fff; }
                h1 { color: #4CAF50; }
                .endpoint { background: #2a2a2a; padding: 10px; margin: 10px 0; border-radius: 5px; }
                .method { color: #ff9800; font-weight: bold; }
                .path { color: #03a9f4; }
                .status { margin-top: 20px; padding: 10px; background: #2a2a2a; border-radius: 5px; }
            </style>
        </head>
        <body>
            <h1>🚀 OGZ Prime V2 - Backtesting API</h1>
            <div class="status">
                <strong>Status:</strong> Running on port ${PORT}<br>
                <strong>WebSocket:</strong> ws://localhost:${PORT}/ws
            </div>

            <h2>API Endpoints:</h2>

            <div class="endpoint">
                <span class="method">POST</span>
                <span class="path">/api/backtest/run</span>
                - Run single backtest
            </div>

            <div class="endpoint">
                <span class="method">POST</span>
                <span class="path">/api/backtest/optimize</span>
                - Run parameter optimization
            </div>

            <div class="endpoint">
                <span class="method">GET</span>
                <span class="path">/api/backtest/results/:id</span>
                - Get job results
            </div>

            <div class="endpoint">
                <span class="method">GET</span>
                <span class="path">/api/backtest/list</span>
                - List all jobs
            </div>

            <div class="endpoint">
                <span class="method">GET</span>
                <span class="path">/api/backtest/best</span>
                - Get best parameters
            </div>

            <div class="endpoint">
                <span class="method">GET</span>
                <span class="path">/api/backtest/presets</span>
                - Get parameter presets
            </div>
        </body>
        </html>
    `);
});

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to backtest server'
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('WebSocket message:', data);
        } catch (e) {
            console.error('Invalid WebSocket message:', e);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║   OGZ PRIME V2 - BACKTESTING API SERVER       ║
╠═══════════════════════════════════════════════╣
║   🚀 Server running on port ${PORT}              ║
║   📊 API: http://localhost:${PORT}/api          ║
║   🔌 WebSocket: ws://localhost:${PORT}/ws       ║
║   🎯 Tier: ${flagManager.getTier().toUpperCase()} (ML Enhanced)          ║
╚═══════════════════════════════════════════════╝
    `);
});

module.exports = { app, server };