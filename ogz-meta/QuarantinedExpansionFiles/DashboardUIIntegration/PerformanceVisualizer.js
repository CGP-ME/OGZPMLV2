/**
 * ============================================================================
 * DOCUMENTED_PerformanceVisualizer.js - Trading Performance Charts & Reports
 * ============================================================================
 * 
 * SYSTEM ROLE: Visual analytics and report generation for OGZ Prime
 * 
 * BUSINESS PURPOSE:
 * Creates stunning visual reports and charts that showcase your trading
 * performance. These visualizations are crucial for marketing, investor
 * presentations, and personal tracking of your journey to financial freedom.
 * 
 * HOUSTON MISSION IMPACT:
 * Professional-grade performance reports help you:
 * - Track progress toward your Houston move goal
 * - Present results to potential investors or partners  
 * - Analyze trading patterns for continuous improvement
 * - Generate marketing materials for bot monetization
 * 
 * OUTPUT FORMATS:
 * - Interactive HTML reports with Chart.js
 * - JSON data exports for external analysis
 * - Equity curve visualizations
 * - Pattern performance breakdowns
 * - Monthly/weekly performance summaries
 * 
 * @author OGZ Prime Development Team
 * @version 10.2.0
 * @since 2025-06-16
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

/**
 * Performance Visualizer for OGZ Prime Trading System
 * 
 * VISUALIZATION CAPABILITIES:
 * - Real-time equity curve tracking
 * - Trade-by-trade performance analysis
 * - Pattern effectiveness visualization
 * - Risk metrics and drawdown analysis
 * - Monthly performance breakdowns
 * - Interactive HTML report generation
 * 
 * INTEGRATION POINTS:
 * - Called by backtesting system for historical analysis
 * - Triggered periodically during live trading
 * - Generates marketing materials for bot promotion
 * - Provides data for external analytics tools
 */
class PerformanceVisualizer {
  /**
   * Initialize the performance visualization system
   * 
   * @param {Object} options - Configuration options
   * @param {string} [options.outputDir] - Directory for chart outputs
   * @param {number} [options.captureFrequency=100] - Capture every N trades
   * @param {boolean} [options.saveCharts=true] - Whether to save chart data
   * @param {boolean} [options.generateHtml=true] - Whether to generate HTML reports
   */
  constructor(options = {}) {
    /**
     * Configuration options for visualization system
     * @type {Object}
     */
    this.options = {
      /** @type {string} Output directory for generated charts and reports */
      outputDir: path.resolve(__dirname, '../output/charts'),
      
      /** @type {number} Frequency of performance snapshots (every N trades) */
      captureFrequency: options.captureFrequency || 100,
      
      /** @type {boolean} Whether to save chart data to files */
      saveCharts: options.saveCharts !== false,
      
      /** @type {boolean} Whether to generate HTML reports */
      generateHtml: options.generateHtml !== false,
      
      // Merge additional options
      ...options
    };
    
    // Create output directory if it doesn't exist
    if (this.options.saveCharts && !fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }
    
    /**
     * Trading performance data storage
     * @type {Object}
     */
    this.data = {
      /** @type {Array<Object>} Equity curve data points */
      equity: [],
      
      /** @type {Array<Object>} Individual trade records */
      trades: [],
      
      /** @type {Object<string, Object>} Pattern performance data */
      patterns: {},
      
      /** @type {Array<Object>} Drawdown analysis data */
      drawdowns: [],
      
      /** @type {Object<string, Object>} Monthly returns breakdown */
      monthlyReturns: {}
    };
    
    /**
     * Performance metrics calculations
     * @type {Object}
     */
    this.metrics = {
      /** @type {number} Starting account balance */
      startBalance: 0,
      
      /** @type {number} Current account balance */
      currentBalance: 0,
      
      /** @type {number} Total number of trades executed */
      totalTrades: 0,
      
      /** @type {number} Number of winning trades */
      winningTrades: 0,
      
      /** @type {number} Number of losing trades */
      losingTrades: 0,
      
      /** @type {number} Profit factor (gross profit / gross loss) */
      profitFactor: 0,
      
      /** @type {number} Sharpe ratio for risk-adjusted returns */
      sharpeRatio: 0,
      
      /** @type {number} Maximum drawdown percentage */
      maxDrawdown: 0,
      
      /** @type {number} Average winning trade amount */
      averageWin: 0,
      
      /** @type {number} Average losing trade amount */
      averageLoss: 0,
      
      /** @type {number} Overall win rate percentage */
      winRate: 0
    };
    
    console.log("📊 Performance Visualizer initialized");
  }
  
  /**
   * Initialize tracking with starting balance
   * 
   * INITIALIZATION:
   * Sets up the baseline for all performance calculations and creates
   * the first equity curve data point.
   * 
   * @param {number} startBalance - Initial account balance
   * @returns {PerformanceVisualizer} Returns this instance for method chaining
   */
  initialize(startBalance) {
    this.metrics.startBalance = startBalance;
    this.metrics.currentBalance = startBalance;
    
    // Add first equity curve point
    this.data.equity.push({
      timestamp: Date.now(),
      balance: startBalance
    });
    
    console.log(`💰 Performance tracking initialized with $${startBalance.toFixed(2)}`);
    return this;
  }
  
  /**
   * Track a completed trade for performance analysis
   * 
   * TRADE TRACKING:
   * Records trade details, updates performance metrics, and triggers
   * periodic visualization updates based on capture frequency.
   * 
   * @param {Object} trade - Completed trade object
   * @param {number} trade.entryPrice - Trade entry price
   * @param {number} trade.exitPrice - Trade exit price
   * @param {Date} trade.entryTime - Trade entry timestamp
   * @param {Date} trade.exitTime - Trade exit timestamp
   * @param {number} trade.pnl - Trade profit/loss
   * @param {string} trade.direction - Trade direction ('buy' or 'sell')
   * @param {string} [trade.patternId] - Associated pattern identifier
   * @param {number} currentBalance - Current account balance after trade
   * @returns {PerformanceVisualizer} Returns this instance for method chaining
   */
  trackTrade(trade, currentBalance) {
    // ====================================================================
    // METRICS UPDATE
    // ====================================================================
    
    this.metrics.totalTrades++;
    this.metrics.currentBalance = currentBalance;
    
    // Track win/loss statistics
    if (trade.pnl > 0) {
      this.metrics.winningTrades++;
      this.metrics.averageWin = 
        (this.metrics.averageWin * (this.metrics.winningTrades - 1) + trade.pnl) / 
        this.metrics.winningTrades;
    } else {
      this.metrics.losingTrades++;
      this.metrics.averageLoss = 
        (this.metrics.averageLoss * (this.metrics.losingTrades - 1) + Math.abs(trade.pnl)) / 
        this.metrics.losingTrades;
    }
    
    // Update win rate
    this.metrics.winRate = this.metrics.winningTrades / this.metrics.totalTrades;
    
    // ====================================================================
    // EQUITY CURVE TRACKING
    // ====================================================================
    
    this.data.equity.push({
      timestamp: trade.exitTime,
      balance: currentBalance
    });
    
    // ====================================================================
    // TRADE RECORD STORAGE
    // ====================================================================
    
    this.data.trades.push(trade);
    
    // ====================================================================
    // PATTERN PERFORMANCE TRACKING
    // ====================================================================
    
    if (trade.patternId) {
      if (!this.data.patterns[trade.patternId]) {
        this.data.patterns[trade.patternId] = {
          trades: [],
          wins: 0,
          losses: 0,
          totalPnL: 0
        };
      }
      
      this.data.patterns[trade.patternId].trades.push(trade);
      if (trade.pnl > 0) {
        this.data.patterns[trade.patternId].wins++;
      } else {
        this.data.patterns[trade.patternId].losses++;
      }
      this.data.patterns[trade.patternId].totalPnL += trade.pnl;
    }
    
    // ====================================================================
    // MONTHLY RETURNS CALCULATION
    // ====================================================================
    
    const date = new Date(trade.exitTime);
    const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    
    if (!this.data.monthlyReturns[monthKey]) {
      this.data.monthlyReturns[monthKey] = {
        trades: 0,
        pnl: 0
      };
    }
    
    this.data.monthlyReturns[monthKey].trades++;
    this.data.monthlyReturns[monthKey].pnl += trade.pnl;
    
    // ====================================================================
    // DRAWDOWN ANALYSIS
    // ====================================================================
    
    this.calculateDrawdown();
    
    // ====================================================================
    // ADVANCED METRICS CALCULATION
    // ====================================================================
    
    // Calculate Sharpe ratio and profit factor after sufficient trades
    if (this.metrics.totalTrades % 20 === 0) {
      this.calculateAdvancedMetrics();
    }
    
    // ====================================================================
    // PERIODIC VISUALIZATION UPDATES
    // ====================================================================
    
    // Generate visual snapshots at specified intervals
    if (this.metrics.totalTrades % this.options.captureFrequency === 0) {
      this.generateSnapshot();
    }
    
    return this;
  }
  
  /**
   * Calculate current drawdown from peak equity
   * 
   * DRAWDOWN ANALYSIS:
   * Tracks the percentage decline from the highest equity peak.
   * Critical for understanding risk and system stability.
   * 
   * @private
   */
  calculateDrawdown() {
    if (this.data.equity.length < 2) return;
    
    // Find peak equity value
    let peak = this.metrics.startBalance;
    for (const point of this.data.equity) {
      if (point.balance > peak) {
        peak = point.balance;
      }
    }
    
    // Calculate current drawdown percentage
    const currentDrawdown = peak > 0 ? 
      (peak - this.metrics.currentBalance) / peak * 100 : 0;
    
    // Update maximum drawdown if exceeded
    if (currentDrawdown > this.metrics.maxDrawdown) {
      this.metrics.maxDrawdown = currentDrawdown;
      
      // Alert for significant drawdowns
      if (currentDrawdown > 5) {
        console.log(`📉 Drawdown alert: ${currentDrawdown.toFixed(2)}% - System recovering...`);
      }
    }
    
    // Record drawdown data point
    this.data.drawdowns.push({
      timestamp: Date.now(),
      drawdown: currentDrawdown,
      balance: this.metrics.currentBalance,
      peak
    });
  }
  
  /**
   * Calculate advanced performance metrics
   * 
   * ADVANCED CALCULATIONS:
   * - Profit Factor: Ratio of gross profit to gross loss
   * - Sharpe Ratio: Risk-adjusted return measurement
   * - Statistical analysis of trading performance
   * 
   * @private
   */
  calculateAdvancedMetrics() {
    // ====================================================================
    // PROFIT FACTOR CALCULATION
    // ====================================================================
    
    let grossProfit = 0;
    let grossLoss = 0;
    
    this.data.trades.forEach(trade => {
      if (trade.pnl > 0) {
        grossProfit += trade.pnl;
      } else {
        grossLoss += Math.abs(trade.pnl);
      }
    });
    
    this.metrics.profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit;
    
    // ====================================================================
    // SHARPE RATIO CALCULATION
    // ====================================================================
    
    if (this.data.equity.length > 30) {
      // Calculate daily returns for Sharpe ratio
      const dailyReturns = [];
      let prevBalance = this.metrics.startBalance;
      
      for (let i = 1; i < this.data.equity.length; i++) {
        // Check if approximately one day has passed
        if (this.data.equity[i].timestamp - this.data.equity[i-1].timestamp > 23 * 60 * 60 * 1000) {
          const dailyReturn = (this.data.equity[i].balance - prevBalance) / prevBalance;
          dailyReturns.push(dailyReturn);
          prevBalance = this.data.equity[i].balance;
        }
      }
      
      if (dailyReturns.length > 0) {
        // Calculate mean return and standard deviation
        const avgReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
        const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length;
        const stdDev = Math.sqrt(variance);
        
        // Calculate annualized Sharpe ratio (assuming risk-free rate of 0)
        this.metrics.sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0; // Crypto 24/7/365
      }
    }
  }
  
  /**
   * Generate a comprehensive performance snapshot
   * 
   * SNAPSHOT FEATURES:
   * - Console performance summary
   * - Top performing patterns analysis
   * - Monthly performance breakdown
   * - File exports (if enabled)
   * - HTML report generation (if enabled)
   */
  generateSnapshot() {
    // Only generate if we have meaningful data
    if (this.metrics.totalTrades < 10) return;
    
    console.log(`\n📊 PERFORMANCE SNAPSHOT #${Math.floor(this.metrics.totalTrades/this.options.captureFrequency)}`);
    console.log(`Initial Balance: $${this.metrics.startBalance.toFixed(2)}`);
    console.log(`Current Balance: $${this.metrics.currentBalance.toFixed(2)}`);
    console.log(`Profit/Loss: $${(this.metrics.currentBalance - this.metrics.startBalance).toFixed(2)}`);
    console.log(`Return: ${((this.metrics.currentBalance / this.metrics.startBalance - 1) * 100).toFixed(2)}%`);
    console.log(`Total Trades: ${this.metrics.totalTrades}`);
    console.log(`Win Rate: ${(this.metrics.winRate * 100).toFixed(2)}%`);
    console.log(`Profit Factor: ${this.metrics.profitFactor.toFixed(2)}`);
    console.log(`Sharpe Ratio: ${this.metrics.sharpeRatio.toFixed(2)}`);
    console.log(`Max Drawdown: ${this.metrics.maxDrawdown.toFixed(2)}%`);
    
    // ====================================================================
    // TOP PATTERNS ANALYSIS
    // ====================================================================
    
    console.log(`\nTOP PATTERNS:`);
    const patternEntries = Object.entries(this.data.patterns);
    if (patternEntries.length > 0) {
      const sortedPatterns = patternEntries
        .sort((a, b) => b[1].totalPnL - a[1].totalPnL)
        .slice(0, 5);
      
      sortedPatterns.forEach(([patternId, data]) => {
        const winRate = data.trades.length > 0 ? (data.wins / data.trades.length * 100) : 0;
        console.log(`  ${patternId}: ${data.trades.length} trades, ${winRate.toFixed(1)}% win rate, $${data.totalPnL.toFixed(2)} P&L`);
      });
    } else {
      console.log(`  No patterns tracked yet`);
    }
    
    // ====================================================================
    // MONTHLY PERFORMANCE BREAKDOWN
    // ====================================================================
    
    console.log(`\nMONTHLY PERFORMANCE:`);
    const monthlyEntries = Object.entries(this.data.monthlyReturns);
    if (monthlyEntries.length > 0) {
      const sortedMonths = monthlyEntries.sort((a, b) => a[0].localeCompare(b[0]));
      sortedMonths.forEach(([month, data]) => {
        console.log(`  ${month}: ${data.trades} trades, $${data.pnl.toFixed(2)} P&L`);
      });
    } else {
      console.log(`  No monthly data yet`);
    }
    
    console.log(`=========================\n`);
    
    // ====================================================================
    // FILE EXPORTS
    // ====================================================================
    
    if (this.options.saveCharts) {
      this.saveChartData();
    }
    
    if (this.options.generateHtml) {
      this.generateHtmlReport();
    }
  }
  
  /**
   * Save chart data to JSON files for external analysis
   * 
   * EXPORTED DATA:
   * - Equity curve data with timestamps
   * - Complete performance metrics
   * - Recent trades sample (last 100)
   * 
   * @private
   */
  saveChartData() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Save equity curve data
    fs.writeFileSync(
      path.join(this.options.outputDir, `equity_${timestamp}.json`),
      JSON.stringify(this.data.equity),
      'utf8'
    );
    
    // Save performance metrics
    fs.writeFileSync(
      path.join(this.options.outputDir, `metrics_${timestamp}.json`),
      JSON.stringify(this.metrics),
      'utf8'
    );
    
    // Save recent trades sample (for privacy, limit to last 100)
    fs.writeFileSync(
      path.join(this.options.outputDir, `trades_${timestamp}.json`),
      JSON.stringify(this.data.trades.slice(-100)),
      'utf8'
    );
    
    console.log(`💾 Chart data saved to ${this.options.outputDir}`);
  }
  
  /**
   * Generate comprehensive HTML performance report
   * 
   * HTML REPORT FEATURES:
   * - Interactive Chart.js visualizations
   * - Responsive design for mobile/desktop
   * - Professional styling for presentations
   * - Pattern performance breakdown
   * - Downloadable format for sharing
   * 
   * @private
   */
  generateHtmlReport() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(this.options.outputDir, `report_${timestamp}.html`);
    
    // Generate comprehensive HTML report with embedded Chart.js
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OGZ Prime Performance Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 30px; background: #1a1a2e; color: white; padding: 20px; border-radius: 5px; }
    .header h1 { margin-bottom: 5px; }
    .header p { color: #ddd; }
    .metrics { display: flex; flex-wrap: wrap; margin-bottom: 30px; }
    .metric-card { width: calc(25% - 20px); margin: 10px; background: #f9f9f9; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .metric-card h3 { margin-top: 0; color: #555; font-size: 0.9em; }
    .metric-card p { margin-bottom: 0; font-size: 1.8em; font-weight: bold; color: #333; }
    .metric-card p.positive { color: #28a745; }
    .metric-card p.negative { color: #dc3545; }
    .chart-container { margin-bottom: 30px; background: white; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h2 { color: #444; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-top: 40px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    table th, table td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #eee; }
    table th { background: #f5f5f5; }
    tr:hover { background: #f9f9f9; }
    .pattern-card { margin-bottom: 20px; background: white; padding: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .pattern-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .pattern-stats { display: flex; }
    .stat { margin-left: 20px; text-align: center; }
    .stat-value { font-size: 1.2em; font-weight: bold; display: block; }
    .stat-label { font-size: 0.8em; color: #666; }
    .footer { text-align: center; margin-top: 40px; color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>OGZ Prime Performance Report</h1>
      <p>Generated on ${new Date().toLocaleString()}</p>
    </div>

    <div class="metrics">
      <div class="metric-card">
        <h3>Total Return</h3>
        <p class="${this.metrics.currentBalance >= this.metrics.startBalance ? 'positive' : 'negative'}">
          ${((this.metrics.currentBalance / this.metrics.startBalance - 1) * 100).toFixed(2)}%
        </p>
      </div>
      <div class="metric-card">
        <h3>Win Rate</h3>
        <p>${(this.metrics.winRate * 100).toFixed(2)}%</p>
      </div>
      <div class="metric-card">
        <h3>Profit Factor</h3>
        <p>${this.metrics.profitFactor.toFixed(2)}</p>
      </div>
      <div class="metric-card">
        <h3>Sharpe Ratio</h3>
        <p>${this.metrics.sharpeRatio.toFixed(2)}</p>
      </div>
      <div class="metric-card">
        <h3>Total Trades</h3>
        <p>${this.metrics.totalTrades}</p>
      </div>
      <div class="metric-card">
        <h3>Current Balance</h3>
        <p>$${this.metrics.currentBalance.toFixed(2)}</p>
      </div>
      <div class="metric-card">
        <h3>Max Drawdown</h3>
        <p class="negative">${this.metrics.maxDrawdown.toFixed(2)}%</p>
      </div>
      <div class="metric-card">
        <h3>Avg Win/Loss</h3>
        <p>$${this.metrics.averageWin.toFixed(2)} / $${this.metrics.averageLoss.toFixed(2)}</p>
      </div>
    </div>

    <h2>Equity Curve</h2>
    <div class="chart-container">
      <canvas id="equityChart"></canvas>
    </div>

    <h2>Drawdown Chart</h2>
    <div class="chart-container">
      <canvas id="drawdownChart"></canvas>
    </div>

    <h2>Monthly Returns</h2>
    <div class="chart-container">
      <canvas id="monthlyChart"></canvas>
    </div>

    <h2>Top Performing Patterns</h2>
    <div id="patternsContainer">
      ${this.generatePatternShowcase()}
    </div>

    <h2>Recent Trades</h2>
    <table id="tradesTable">
      <thead>
        <tr>
          <th>Pattern</th>
          <th>Direction</th>
          <th>Entry Time</th>
          <th>Exit Time</th>
          <th>P&L</th>
        </tr>
      </thead>
      <tbody>
        ${this.data.trades.slice(-20).reverse().map(trade => `
          <tr>
            <td>${trade.patternId || 'Unknown'}</td>
            <td>${trade.direction.toUpperCase()}</td>
            <td>${new Date(trade.entryTime).toLocaleString()}</td>
            <td>${new Date(trade.exitTime).toLocaleString()}</td>
            <td style="color: ${trade.pnl >= 0 ? '#28a745' : '#dc3545'}">$${trade.pnl.toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="footer">
      <p>OGZ Prime Trading System &copy; 2025 | All Rights Reserved</p>
    </div>
  </div>

  <script>
    // Chart Data
    const equityData = ${JSON.stringify(this.data.equity)};
    const drawdownData = ${JSON.stringify(this.data.drawdowns)};
    const monthlyData = ${JSON.stringify(this.data.monthlyReturns)};
    const patterns = ${JSON.stringify(this.data.patterns)};
    const trades = ${JSON.stringify(this.data.trades.slice(-20))};

    // Create Equity Chart
    const equityCtx = document.getElementById('equityChart').getContext('2d');
    new Chart(equityCtx, {
      type: 'line',
      data: {
        labels: equityData.map(d => new Date(d.timestamp).toLocaleDateString()),
        datasets: [{
          label: 'Account Balance',
          data: equityData.map(d => d.balance),
          borderColor: '#4CAF50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          tension: 0.1,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Equity Curve' }
        }
      }
    });

    // Create Drawdown Chart
    const drawdownCtx = document.getElementById('drawdownChart').getContext('2d');
    new Chart(drawdownCtx, {
      type: 'line',
      data: {
        labels: drawdownData.map(d => new Date(d.timestamp).toLocaleDateString()),
        datasets: [{
          label: 'Drawdown (%)',
          data: drawdownData.map(d => d.drawdown),
          borderColor: '#E57373',
          backgroundColor: 'rgba(229, 115, 115, 0.1)',
          tension: 0.1,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Drawdown Chart' }
        },
        scales: {
          y: { 
            reverse: true,
            title: {
              display: true,
              text: 'Drawdown (%)'
            }
          }
        }
      }
    });

    // Create Monthly Returns Chart
    const monthLabels = Object.keys(monthlyData).sort();
    const monthValues = monthLabels.map(m => monthlyData[m].pnl);
    
    const monthlyCtx = document.getElementById('monthlyChart').getContext('2d');
    new Chart(monthlyCtx, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [{
          label: 'Monthly P&L',
          data: monthValues,
          backgroundColor: monthValues.map(v => v >= 0 ? 'rgba(76, 175, 80, 0.7)' : 'rgba(229, 115, 115, 0.7)'),
          borderColor: monthValues.map(v => v >= 0 ? '#4CAF50' : '#E57373'),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Monthly Returns' }
        }
      }
    });
  </script>
</body>
</html>
    `;
    
    fs.writeFileSync(reportPath, html, 'utf8');
    console.log(`📋 HTML report saved to ${reportPath}`);
  }
  
  /**
   * Generate pattern showcase HTML for the report
   * 
   * @returns {string} HTML content for pattern showcase
   * @private
   */
  generatePatternShowcase() {
    // Get top 5 patterns by profitability
    const topPatterns = Object.entries(this.data.patterns)
      .map(([id, data]) => ({
        id,
        ...data
      }))
      .filter(p => p.trades && p.trades.length >= 3) // Only patterns with sufficient trades
      .sort((a, b) => b.totalPnL - a.totalPnL)
      .slice(0, 5);
    
    if (topPatterns.length === 0) {
      return '<p>No significant patterns detected yet. Run more backtest data to generate pattern statistics.</p>';
    }
    
    let html = '';
    
    // Generate HTML for each pattern
    topPatterns.forEach(pattern => {
      const winRate = pattern.trades.length > 0 ? (pattern.wins / pattern.trades.length * 100) : 0;
      const avgPnL = pattern.trades.length > 0 ? (pattern.totalPnL / pattern.trades.length) : 0;
      
      html += `
      <div class="pattern-card">
        <div class="pattern-header">
          <h3>${pattern.id.toUpperCase()}</h3>
          <div class="pattern-stats">
            <div class="stat">
              <span class="stat-value">${winRate.toFixed(1)}%</span>
              <span class="stat-label">Win Rate</span>
            </div>
            <div class="stat">
              <span class="stat-value">${pattern.trades.length}</span>
              <span class="stat-label">Trades</span>
            </div>
            <div class="stat">
              <span class="stat-value">$${pattern.totalPnL.toFixed(2)}</span>
              <span class="stat-label">Total P&L</span>
            </div>
            <div class="stat">
              <span class="stat-value">$${avgPnL.toFixed(2)}</span>
              <span class="stat-label">Avg P&L</span>
            </div>
          </div>
        </div>
      </div>
      `;
    });
    
    return html;
  }
  
  /**
   * Generate final performance report and summary
   * 
   * FINAL REPORT:
   * Creates comprehensive final report with all trading data,
   * performance metrics, and visualizations. Used for system
   * shutdown or complete backtesting analysis.
   * 
   * @returns {Object} Final report data summary
   */
  generateFinalReport() {
    // Calculate final metrics
    this.calculateAdvancedMetrics();
    
    // Generate final snapshot
    this.generateSnapshot();
    
    // Create comprehensive marketing report
    const report = {
      startTime: this.data.equity[0].timestamp,
      endTime: this.data.equity[this.data.equity.length - 1].timestamp,
      startBalance: this.metrics.startBalance,
      endBalance: this.metrics.currentBalance,
      totalReturn: this.metrics.currentBalance / this.metrics.startBalance - 1,
      metrics: { ...this.metrics },
      patterns: Object.keys(this.data.patterns).length,
      monthlyReturns: { ...this.data.monthlyReturns }
    };
    
    // Save final report
    if (this.options.saveCharts) {
      const reportPath = path.join(this.options.outputDir, 'final_report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
      console.log(`📋 Final report saved to ${reportPath}`);
      
      // Generate final HTML report
      this.generateHtmlReport();
    }
    
    return report;
  }
}

module.exports = PerformanceVisualizer;

/**
 * ============================================================================
 * USAGE EXAMPLES FOR DEVELOPMENT TEAM
 * ============================================================================
 * 
 * // 1. INITIALIZE PERFORMANCE VISUALIZER
 * const PerformanceVisualizer = require('./core/PerformanceVisualizer');
 * 
 * const visualizer = new PerformanceVisualizer({
 *   outputDir: './reports',
 *   captureFrequency: 50,  // Generate snapshot every 50 trades
 *   generateHtml: true
 * });
 * 
 * // 2. START TRACKING
 * visualizer.initialize(10000); // $10,000 starting balance
 * 
 * // 3. TRACK INDIVIDUAL TRADES
 * const trade = {
 *   entryPrice: 50000,
 *   exitPrice: 50250,
 *   entryTime: new Date('2025-06-16T10:00:00Z'),
 *   exitTime: new Date('2025-06-16T10:15:00Z'),
 *   pnl: 250,
 *   direction: 'buy',
 *   patternId: 'bullish_momentum_v2'
 * };
 * 
 * const currentBalance = 10250;
 * visualizer.trackTrade(trade, currentBalance);
 * 
 * // 4. GENERATE FINAL REPORT
 * const finalReport = visualizer.generateFinalReport();
 * console.log(`Total Return: ${(finalReport.totalReturn * 100).toFixed(2)}%`);
 * 
 * ============================================================================
 * MARKETING AND MONETIZATION USE CASES
 * ============================================================================
 * 
 * // INVESTOR PRESENTATIONS
 * // Generate professional HTML reports for potential investors
 * 
 * // SOCIAL MEDIA CONTENT
 * // Use equity curves and performance metrics for social proof
 * 
 * // SUBSCRIPTION SERVICE MARKETING
 * // Show pattern performance to justify premium pricing
 * 
 * // PERSONAL TRACKING
 * // Monitor progress toward Houston move goal
 * 
 * ============================================================================
 */