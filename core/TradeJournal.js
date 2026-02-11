/**
 * ============================================================================
 * TradeJournal - Elite Trade Ledger & Performance Analytics
 * ============================================================================
 *
 * The single centralized trade record for OGZPrime. Every entry, every exit,
 * every dollar, every fee, every lesson — in one persistent, crash-safe place.
 *
 * ARCHITECTURE ROLE:
 * TradeJournal is the immutable financial record. It receives trade events
 * from RiskManager/ExecutionLayer and provides analytics to the dashboard.
 *
 * DATA FLOW:
 * ```
 * ExecutionLayer.executeTrade() ──► TradeJournal.recordEntry()
 * RiskManager.closePosition()  ──► TradeJournal.recordExit()
 * Dashboard WebSocket          ◄── TradeJournal.getSnapshot()
 * Tax Season                   ◄── TradeJournal.exportCSV()
 * ```
 *
 * STORAGE:
 * ```
 * data/journal/
 * ├── trade-ledger.jsonl        (append-only, every trade, NEVER deleted)
 * ├── equity-snapshots.jsonl    (balance after each trade, for equity curve)
 * ├── journal-stats.json        (cached aggregate stats, rebuilt on startup)
 * └── exports/                  (CSV exports on demand)
 * ```
 *
 * DESIGN PRINCIPLES:
 * - Append-only ledger: crash-safe, no data loss even on hard kill
 * - Stats computed from ledger on startup (single source of truth)
 * - All arrays bounded (no memory leaks in 24/7 operation)
 * - Zero dependencies beyond Node.js built-ins
 * - Plugs into V2 without touching existing modules
 *
 * @module core/TradeJournal
 * @requires fs
 * @requires path
 * @version 1.0.0
 * @author OGZPrime Team
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

class TradeJournal {
  constructor(config = {}) {
    // ── Storage paths ──────────────────────────────────────────────────
    const dataDir = config.dataDir || path.join(process.cwd(), 'data', 'journal');
    this.paths = {
      dir: dataDir,
      ledger: path.join(dataDir, 'trade-ledger.jsonl'),
      equity: path.join(dataDir, 'equity-snapshots.jsonl'),
      statsCache: path.join(dataDir, 'journal-stats.json'),
      exports: path.join(dataDir, 'exports')
    };

    // ── Config ─────────────────────────────────────────────────────────
    this.config = {
      startingBalance: config.startingBalance || 10000,
      maxInMemoryTrades: config.maxInMemoryTrades || 5000,
      maxEquityPoints: config.maxEquityPoints || 10000,
      autoSaveInterval: config.autoSaveInterval || 60000,  // 1 min
      ...config
    };

    // ── In-memory state (rebuilt from ledger on startup) ───────────────
    this.trades = [];           // completed trades (bounded)
    this.openTrades = new Map(); // orderId → entry record
    this.equityCurve = [];      // { timestamp, balance, equity, drawdown }
    this.stats = this._emptyStats();

    // ── Ensure directories exist ──────────────────────────────────────
    this._ensureDirs();

    // ── Rebuild state from ledger ─────────────────────────────────────
    this._rebuildFromLedger();

    // ── Auto-save stats cache ─────────────────────────────────────────
    this._autoSaveTimer = setInterval(() => {
      this._saveStatsCache();
    }, this.config.autoSaveInterval);

    console.log(`📒 TradeJournal initialized | ${this.trades.length} historical trades loaded | Balance: $${this.stats.currentBalance.toFixed(2)}`);
  }


  // ════════════════════════════════════════════════════════════════════════
  // PUBLIC API: RECORDING
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Record a trade ENTRY (position opened)
   * Call this from run-empire-v2.js after ExecutionLayer confirms the trade.
   *
   * @param {Object} entry
   * @param {string} entry.orderId      - Unique order ID
   * @param {string} entry.direction    - 'BUY' or 'SELL'
   * @param {number} entry.entryPrice   - Entry price in USD
   * @param {number} entry.size         - Position size in BTC
   * @param {number} entry.usdValue     - USD value of position
   * @param {number} entry.confidence   - Confidence score (0-100)
   * @param {string} entry.regime       - Market regime at entry
   * @param {Array}  entry.patterns     - Patterns detected at entry
   * @param {Object} entry.indicators   - Indicator values at entry
   * @param {number} [entry.fees]       - Entry fees
   */
  recordEntry(entry) {
    if (!entry || !entry.orderId || !entry.entryPrice) {
      console.warn('📒 TradeJournal: Invalid entry data, skipping');
      return;
    }

    const record = {
      event: 'ENTRY',
      timestamp: Date.now(),
      orderId: entry.orderId,
      direction: entry.direction || 'BUY',
      entryPrice: Number(entry.entryPrice),
      size: Number(entry.size || 0),
      usdValue: Number(entry.usdValue || (entry.size * entry.entryPrice) || 0),
      confidence: Number(entry.confidence || 0),
      regime: entry.regime || 'unknown',
      patterns: (entry.patterns || []).map(p => ({
        name: p.name || p.type || 'unknown',
        confidence: p.confidence || 0
      })),
      indicators: {
        rsi: entry.indicators?.rsi || 0,
        macd: entry.indicators?.macd || 0,
        trend: entry.indicators?.trend || 'unknown',
        volatility: entry.indicators?.volatility || 0
      },
      fees: Number(entry.fees || 0)
    };

    // Store in open trades map
    this.openTrades.set(record.orderId, record);

    // Append to ledger (crash-safe)
    this._appendLedger(record);

    console.log(`📒 ENTRY logged: ${record.direction} ${record.size.toFixed(6)} BTC @ $${record.entryPrice.toFixed(2)} | Conf: ${record.confidence}% | Regime: ${record.regime}`);
  }

  /**
   * Record a trade EXIT (position closed)
   * Call this from RiskManager.closePosition() or ExecutionLayer.
   *
   * @param {Object} exit
   * @param {string} exit.orderId      - Must match an open entry
   * @param {number} exit.exitPrice    - Exit price in USD
   * @param {string} exit.reason       - Exit reason (tp, sl, trailing, manual, etc.)
   * @param {number} exit.pnl          - Realized P&L in USD
   * @param {number} [exit.fees]       - Exit fees
   * @param {number} [exit.maxProfit]  - Maximum favorable excursion (MFE)
   * @param {number} [exit.maxDrawdown]- Maximum adverse excursion (MAE)
   * @param {number} [exit.balance]    - Account balance after trade
   */
  recordExit(exit) {
    if (!exit || !exit.orderId) {
      console.warn('📒 TradeJournal: Invalid exit data, skipping');
      return;
    }

    const entry = this.openTrades.get(exit.orderId);
    if (!entry) {
      // Trade may have been opened before journal was wired — create synthetic entry
      console.warn(`📒 TradeJournal: No entry found for ${exit.orderId}, recording exit-only`);
    }

    const now = Date.now();
    const entryPrice = entry?.entryPrice || exit.entryPrice || 0;
    const exitPrice = Number(exit.exitPrice || 0);
    const grossPnl = Number(exit.pnl || 0);
    const totalFees = Number(entry?.fees || 0) + Number(exit.fees || 0);
    const netPnl = grossPnl - totalFees;
    const holdTime = entry ? (now - entry.timestamp) : Number(exit.holdTime || 0);
    const pnlPercent = entry?.usdValue > 0 ? (netPnl / entry.usdValue * 100) : 0;

    const completedTrade = {
      event: 'EXIT',
      timestamp: now,
      orderId: exit.orderId,
      direction: entry?.direction || exit.direction || 'BUY',
      entryPrice: entryPrice,
      exitPrice: exitPrice,
      size: entry?.size || Number(exit.size || 0),
      usdValue: entry?.usdValue || 0,
      grossPnl: grossPnl,
      fees: totalFees,
      netPnl: netPnl,
      pnlPercent: pnlPercent,
      holdTimeMs: holdTime,
      holdTimeFormatted: this._formatDuration(holdTime),
      exitReason: exit.reason || 'unknown',
      mfe: Number(exit.maxProfit || 0),     // Max Favorable Excursion
      mae: Number(exit.maxDrawdown || 0),   // Max Adverse Excursion
      confidence: entry?.confidence || 0,
      regime: entry?.regime || 'unknown',
      patterns: entry?.patterns || [],
      indicators: entry?.indicators || {},
      entryTime: entry?.timestamp || 0,
      balanceAfter: Number(exit.balance || 0)
    };

    // ── Append to ledger ──────────────────────────────────────────────
    this._appendLedger(completedTrade);

    // ── Update in-memory trades ───────────────────────────────────────
    this.trades.push(completedTrade);
    if (this.trades.length > this.config.maxInMemoryTrades) {
      this.trades = this.trades.slice(-this.config.maxInMemoryTrades);
    }

    // ── Remove from open trades ───────────────────────────────────────
    this.openTrades.delete(exit.orderId);

    // ── Update equity curve ───────────────────────────────────────────
    this._recordEquityPoint(completedTrade);

    // ── Recompute stats ───────────────────────────────────────────────
    this._updateStats(completedTrade);

    const emoji = netPnl >= 0 ? '✅' : '❌';
    console.log(`📒 EXIT logged: ${emoji} ${completedTrade.direction} | P&L: $${netPnl.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%) | Reason: ${completedTrade.exitReason} | Hold: ${completedTrade.holdTimeFormatted}`);

    return completedTrade;
  }


  // ════════════════════════════════════════════════════════════════════════
  // PUBLIC API: ANALYTICS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Get full performance stats — the crown jewel
   * @returns {Object} Complete analytics snapshot
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Get equity curve for charting
   * @param {number} [limit] - Max points to return (downsampled if needed)
   * @returns {Array} [{ timestamp, balance, equity, drawdown, drawdownPct }]
   */
  getEquityCurve(limit = 500) {
    if (this.equityCurve.length <= limit) return [...this.equityCurve];
    // Downsample: keep first, last, and evenly spaced points
    const step = Math.floor(this.equityCurve.length / limit);
    const sampled = [];
    for (let i = 0; i < this.equityCurve.length; i += step) {
      sampled.push(this.equityCurve[i]);
    }
    // Always include the last point
    if (sampled[sampled.length - 1] !== this.equityCurve[this.equityCurve.length - 1]) {
      sampled.push(this.equityCurve[this.equityCurve.length - 1]);
    }
    return sampled;
  }

  /**
   * Get trade history with filtering and pagination
   * @param {Object} [filters]
   * @param {number} [filters.page]        - Page number (1-indexed)
   * @param {number} [filters.perPage]     - Trades per page (default 50)
   * @param {string} [filters.direction]   - 'BUY' or 'SELL'
   * @param {string} [filters.regime]      - Filter by market regime
   * @param {boolean} [filters.winners]    - true=winners only, false=losers only
   * @param {number} [filters.minPnl]     - Minimum P&L filter
   * @param {number} [filters.maxPnl]     - Maximum P&L filter
   * @param {number} [filters.since]      - Timestamp, trades after this time
   * @param {number} [filters.until]      - Timestamp, trades before this time
   * @returns {Object} { trades, total, page, pages }
   */
  getTradeHistory(filters = {}) {
    let filtered = [...this.trades];

    if (filters.direction) filtered = filtered.filter(t => t.direction === filters.direction);
    if (filters.regime) filtered = filtered.filter(t => t.regime === filters.regime);
    if (filters.winners === true) filtered = filtered.filter(t => t.netPnl > 0);
    if (filters.winners === false) filtered = filtered.filter(t => t.netPnl <= 0);
    if (filters.minPnl != null) filtered = filtered.filter(t => t.netPnl >= filters.minPnl);
    if (filters.maxPnl != null) filtered = filtered.filter(t => t.netPnl <= filters.maxPnl);
    if (filters.since) filtered = filtered.filter(t => t.timestamp >= filters.since);
    if (filters.until) filtered = filtered.filter(t => t.timestamp <= filters.until);

    // Sort newest first
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    const perPage = filters.perPage || 50;
    const page = filters.page || 1;
    const total = filtered.length;
    const pages = Math.ceil(total / perPage);
    const start = (page - 1) * perPage;
    const trades = filtered.slice(start, start + perPage);

    return { trades, total, page, pages };
  }

  /**
   * Performance breakdown by a given dimension
   * @param {'regime'|'pattern'|'hourOfDay'|'dayOfWeek'|'confidenceBand'|'exitReason'|'month'} dimension
   * @returns {Object} { [key]: { trades, wins, losses, netPnl, winRate, avgPnl, avgWin, avgLoss, profitFactor } }
   */
  getPerformanceBreakdown(dimension) {
    const buckets = {};

    for (const trade of this.trades) {
      let key;
      switch (dimension) {
        case 'regime':
          key = trade.regime || 'unknown';
          break;
        case 'pattern':
          // A trade may have multiple patterns — count each
          if (!trade.patterns || trade.patterns.length === 0) {
            key = 'no_pattern';
            this._addToBucket(buckets, key, trade);
          } else {
            for (const p of trade.patterns) {
              this._addToBucket(buckets, p.name || 'unknown', trade);
            }
            continue; // already added
          }
          break;
        case 'hourOfDay':
          key = new Date(trade.entryTime || trade.timestamp).getUTCHours().toString().padStart(2, '0') + ':00';
          break;
        case 'dayOfWeek':
          key = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(trade.entryTime || trade.timestamp).getUTCDay()];
          break;
        case 'confidenceBand':
          const conf = trade.confidence || 0;
          if (conf < 55) key = '< 55%';
          else if (conf < 65) key = '55-65%';
          else if (conf < 75) key = '65-75%';
          else if (conf < 85) key = '75-85%';
          else key = '85%+';
          break;
        case 'exitReason':
          key = trade.exitReason || 'unknown';
          break;
        case 'month':
          const d = new Date(trade.timestamp);
          key = `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`;
          break;
        default:
          key = 'all';
      }
      this._addToBucket(buckets, key, trade);
    }

    // Compute derived stats for each bucket
    for (const key of Object.keys(buckets)) {
      const b = buckets[key];
      b.winRate = b.trades > 0 ? (b.wins / b.trades * 100) : 0;
      b.avgPnl = b.trades > 0 ? (b.netPnl / b.trades) : 0;
      b.avgWin = b.wins > 0 ? (b.grossWins / b.wins) : 0;
      b.avgLoss = b.losses > 0 ? (b.grossLosses / b.losses) : 0;
      b.profitFactor = b.grossLosses !== 0 ? Math.abs(b.grossWins / b.grossLosses) : (b.grossWins > 0 ? Infinity : 0);
      b.avgHoldTime = b.trades > 0 ? this._formatDuration(b.totalHoldTime / b.trades) : '0s';
      b.expectancy = b.trades > 0 ? ((b.winRate / 100 * b.avgWin) - ((1 - b.winRate / 100) * Math.abs(b.avgLoss))) : 0;
    }

    return buckets;
  }

  /**
   * Get daily summaries for calendar view
   * @param {number} [days] - Number of days back (default 90)
   * @returns {Array} [{ date, trades, wins, losses, netPnl, balance, drawdown }]
   */
  getDailySummaries(days = 90) {
    const cutoff = Date.now() - (days * 86400000);
    const dailyMap = {};

    for (const trade of this.trades) {
      if (trade.timestamp < cutoff) continue;
      const dateKey = new Date(trade.timestamp).toISOString().split('T')[0];
      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = {
          date: dateKey,
          trades: 0, wins: 0, losses: 0,
          grossPnl: 0, fees: 0, netPnl: 0,
          biggestWin: 0, biggestLoss: 0
        };
      }
      const d = dailyMap[dateKey];
      d.trades++;
      d.grossPnl += trade.grossPnl || 0;
      d.fees += trade.fees || 0;
      d.netPnl += trade.netPnl || 0;
      if (trade.netPnl > 0) {
        d.wins++;
        d.biggestWin = Math.max(d.biggestWin, trade.netPnl);
      } else {
        d.losses++;
        d.biggestLoss = Math.min(d.biggestLoss, trade.netPnl);
      }
    }

    return Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get streak information
   * @returns {Object} { current, longest, worstLosing, currentType }
   */
  getStreaks() {
    if (this.trades.length === 0) {
      return { currentStreak: 0, currentType: 'none', longestWin: 0, longestLoss: 0, streakHistory: [] };
    }

    let currentStreak = 0;
    let currentType = 'none';
    let longestWin = 0;
    let longestLoss = 0;
    let tempWin = 0;
    let tempLoss = 0;
    const streakHistory = [];  // last 20 win/loss markers

    for (const trade of this.trades) {
      const isWin = trade.netPnl > 0;
      streakHistory.push(isWin ? 'W' : 'L');

      if (isWin) {
        tempWin++;
        tempLoss = 0;
        longestWin = Math.max(longestWin, tempWin);
      } else {
        tempLoss++;
        tempWin = 0;
        longestLoss = Math.max(longestLoss, tempLoss);
      }
    }

    // Current streak
    currentStreak = this.trades[this.trades.length - 1]?.netPnl > 0 ? tempWin : tempLoss;
    currentType = this.trades[this.trades.length - 1]?.netPnl > 0 ? 'winning' : 'losing';

    return {
      currentStreak,
      currentType,
      longestWin,
      longestLoss,
      recentHistory: streakHistory.slice(-30)  // last 30 trades W/L pattern
    };
  }

  /**
   * Compact snapshot for WebSocket broadcast to dashboard
   * @returns {Object} Key stats + recent trades for live display
   */
  getSnapshot() {
    const s = this.stats;
    const streaks = this.getStreaks();
    const recentTrades = this.trades.slice(-10).reverse();

    return {
      module: 'TradeJournal',
      // ── Headline numbers ──
      totalTrades: s.totalTrades,
      winRate: Number(s.winRate.toFixed(1)),
      netPnl: Number(s.netPnl.toFixed(2)),
      netPnlPercent: Number(s.netPnlPercent.toFixed(2)),
      currentBalance: Number(s.currentBalance.toFixed(2)),
      // ── Risk metrics ──
      profitFactor: Number(s.profitFactor.toFixed(2)),
      sharpeRatio: Number(s.sharpeRatio.toFixed(2)),
      maxDrawdown: Number(s.maxDrawdownPercent.toFixed(2)),
      currentDrawdown: Number(s.currentDrawdownPercent.toFixed(2)),
      expectancy: Number(s.expectancy.toFixed(2)),
      // ── Averages ──
      avgWin: Number(s.avgWin.toFixed(2)),
      avgLoss: Number(s.avgLoss.toFixed(2)),
      avgHoldTime: s.avgHoldTime,
      avgHoldTimeWinners: s.avgHoldTimeWinners,
      avgHoldTimeLosers: s.avgHoldTimeLosers,
      // ── Streaks ──
      currentStreak: streaks.currentStreak,
      currentStreakType: streaks.currentType,
      longestWinStreak: streaks.longestWin,
      longestLossStreak: streaks.longestLoss,
      recentWL: streaks.recentHistory,
      // ── Best / Worst ──
      bestTrade: s.bestTrade,
      worstTrade: s.worstTrade,
      // ── Today ──
      todayTrades: s.todayTrades,
      todayPnl: Number(s.todayPnl.toFixed(2)),
      todayWinRate: Number(s.todayWinRate.toFixed(1)),
      // ── Open positions ──
      openPositions: this.openTrades.size,
      // ── Recent trades ──
      recentTrades: recentTrades.map(t => ({
        orderId: t.orderId,
        direction: t.direction,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        netPnl: Number(t.netPnl.toFixed(2)),
        pnlPercent: Number(t.pnlPercent.toFixed(2)),
        holdTime: t.holdTimeFormatted,
        exitReason: t.exitReason,
        confidence: t.confidence,
        regime: t.regime,
        timestamp: t.timestamp
      }))
    };
  }


  // ════════════════════════════════════════════════════════════════════════
  // PUBLIC API: EXPORT
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Export trade history as CSV (tax-ready)
   * @param {Object} [options]
   * @param {number} [options.since] - Start timestamp
   * @param {number} [options.until] - End timestamp
   * @param {string} [options.filename] - Custom filename
   * @returns {string} Path to exported CSV file
   */
  exportCSV(options = {}) {
    const since = options.since || 0;
    const until = options.until || Date.now();
    const filtered = this.trades.filter(t => t.timestamp >= since && t.timestamp <= until);

    const headers = [
      'Date', 'Time_UTC', 'Order_ID', 'Direction', 'Entry_Price', 'Exit_Price',
      'Size_BTC', 'USD_Value', 'Gross_PnL', 'Fees', 'Net_PnL', 'PnL_Percent',
      'Hold_Duration', 'Exit_Reason', 'Confidence', 'Regime', 'Patterns',
      'RSI', 'MACD', 'Trend', 'Balance_After'
    ];

    const rows = filtered.map(t => {
      const dt = new Date(t.timestamp);
      return [
        dt.toISOString().split('T')[0],
        dt.toISOString().split('T')[1].replace('Z', ''),
        t.orderId,
        t.direction,
        t.entryPrice.toFixed(2),
        t.exitPrice.toFixed(2),
        t.size.toFixed(8),
        t.usdValue.toFixed(2),
        t.grossPnl.toFixed(2),
        t.fees.toFixed(4),
        t.netPnl.toFixed(2),
        t.pnlPercent.toFixed(2) + '%',
        t.holdTimeFormatted,
        t.exitReason,
        t.confidence,
        t.regime,
        (t.patterns || []).map(p => p.name).join('; '),
        t.indicators?.rsi?.toFixed(1) || '',
        t.indicators?.macd?.toFixed(4) || '',
        t.indicators?.trend || '',
        t.balanceAfter?.toFixed(2) || ''
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    // Write to exports directory
    const filename = options.filename || `ogzprime-trades-${new Date().toISOString().split('T')[0]}.csv`;
    const filepath = path.join(this.paths.exports, filename);
    fs.writeFileSync(filepath, csv, 'utf8');

    console.log(`📒 Exported ${filtered.length} trades to ${filepath}`);
    return filepath;
  }

  /**
   * Export full performance report as JSON
   * @returns {Object} Complete report with all analytics
   */
  exportReport() {
    return {
      generated: new Date().toISOString(),
      stats: this.getStats(),
      streaks: this.getStreaks(),
      dailySummaries: this.getDailySummaries(365),
      breakdowns: {
        byRegime: this.getPerformanceBreakdown('regime'),
        byPattern: this.getPerformanceBreakdown('pattern'),
        byHour: this.getPerformanceBreakdown('hourOfDay'),
        byDay: this.getPerformanceBreakdown('dayOfWeek'),
        byConfidence: this.getPerformanceBreakdown('confidenceBand'),
        byExitReason: this.getPerformanceBreakdown('exitReason'),
        byMonth: this.getPerformanceBreakdown('month')
      },
      equityCurve: this.getEquityCurve(200)
    };
  }


  // ════════════════════════════════════════════════════════════════════════
  // PUBLIC API: CLEANUP
  // ════════════════════════════════════════════════════════════════════════

  destroy() {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
    this._saveStatsCache();
    console.log('📒 TradeJournal destroyed, stats saved');
  }


  // ════════════════════════════════════════════════════════════════════════
  // PRIVATE: STATS ENGINE
  // ════════════════════════════════════════════════════════════════════════

  _emptyStats() {
    return {
      // ── Counts ──
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakEvens: 0,
      winRate: 0,
      // ── P&L ──
      grossPnl: 0,
      totalFees: 0,
      netPnl: 0,
      netPnlPercent: 0,
      // ── Balance ──
      startingBalance: this.config.startingBalance,
      currentBalance: this.config.startingBalance,
      peakBalance: this.config.startingBalance,
      // ── Drawdown ──
      currentDrawdown: 0,
      currentDrawdownPercent: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      maxDrawdownRecoveryTime: 0,
      // ── Averages ──
      avgWin: 0,
      avgLoss: 0,
      avgPnl: 0,
      avgWinPercent: 0,
      avgLossPercent: 0,
      avgHoldTime: '0s',
      avgHoldTimeWinners: '0s',
      avgHoldTimeLosers: '0s',
      // ── Best / Worst ──
      bestTrade: { pnl: 0, orderId: null, date: null },
      worstTrade: { pnl: 0, orderId: null, date: null },
      largestPosition: 0,
      // ── Risk metrics ──
      profitFactor: 0,
      expectancy: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      payoffRatio: 0,
      recoveryFactor: 0,
      // ── Today ──
      todayTrades: 0,
      todayPnl: 0,
      todayWins: 0,
      todayWinRate: 0,
      // ── Internal accumulators (not exposed directly) ──
      _grossWins: 0,
      _grossLosses: 0,
      _totalHoldTime: 0,
      _winHoldTime: 0,
      _lossHoldTime: 0,
      _pnlArray: [],        // for Sharpe/Sortino — bounded in _updateStats
      _todayDate: ''
    };
  }

  /**
   * Incrementally update stats when a new trade completes
   */
  _updateStats(trade) {
    const s = this.stats;
    const pnl = trade.netPnl;
    const isWin = pnl > 0;
    const isBreakEven = pnl === 0;

    // ── Counts ──────────────────────────────────────────────────────
    s.totalTrades++;
    if (isWin) s.wins++;
    else if (isBreakEven) s.breakEvens++;
    else s.losses++;
    s.winRate = s.totalTrades > 0 ? (s.wins / s.totalTrades * 100) : 0;

    // ── P&L ─────────────────────────────────────────────────────────
    s.grossPnl += trade.grossPnl || 0;
    s.totalFees += trade.fees || 0;
    s.netPnl += pnl;
    s.netPnlPercent = s.startingBalance > 0 ? (s.netPnl / s.startingBalance * 100) : 0;

    // ── Balance ─────────────────────────────────────────────────────
    s.currentBalance = trade.balanceAfter || (s.currentBalance + pnl);
    if (s.currentBalance > s.peakBalance) {
      s.peakBalance = s.currentBalance;
    }

    // ── Drawdown ────────────────────────────────────────────────────
    s.currentDrawdown = s.peakBalance - s.currentBalance;
    s.currentDrawdownPercent = s.peakBalance > 0 ? (s.currentDrawdown / s.peakBalance * 100) : 0;
    if (s.currentDrawdown > s.maxDrawdown) {
      s.maxDrawdown = s.currentDrawdown;
      s.maxDrawdownPercent = s.peakBalance > 0 ? (s.maxDrawdown / s.peakBalance * 100) : 0;
    }

    // ── Win/Loss accumulators ───────────────────────────────────────
    if (isWin) {
      s._grossWins += pnl;
      s._winHoldTime += trade.holdTimeMs || 0;
    } else if (!isBreakEven) {
      s._grossLosses += Math.abs(pnl);
      s._lossHoldTime += trade.holdTimeMs || 0;
    }
    s._totalHoldTime += trade.holdTimeMs || 0;

    // ── Averages ────────────────────────────────────────────────────
    s.avgWin = s.wins > 0 ? (s._grossWins / s.wins) : 0;
    s.avgLoss = s.losses > 0 ? (s._grossLosses / s.losses) : 0;
    s.avgPnl = s.totalTrades > 0 ? (s.netPnl / s.totalTrades) : 0;
    s.avgWinPercent = s.wins > 0 ? (s._grossWins / s.wins / s.startingBalance * 100) : 0;
    s.avgLossPercent = s.losses > 0 ? (s._grossLosses / s.losses / s.startingBalance * 100) : 0;
    s.avgHoldTime = s.totalTrades > 0 ? this._formatDuration(s._totalHoldTime / s.totalTrades) : '0s';
    s.avgHoldTimeWinners = s.wins > 0 ? this._formatDuration(s._winHoldTime / s.wins) : '0s';
    s.avgHoldTimeLosers = s.losses > 0 ? this._formatDuration(s._lossHoldTime / s.losses) : '0s';

    // ── Best / Worst ────────────────────────────────────────────────
    if (pnl > s.bestTrade.pnl) {
      s.bestTrade = { pnl: pnl, orderId: trade.orderId, date: new Date(trade.timestamp).toISOString() };
    }
    if (pnl < s.worstTrade.pnl) {
      s.worstTrade = { pnl: pnl, orderId: trade.orderId, date: new Date(trade.timestamp).toISOString() };
    }
    s.largestPosition = Math.max(s.largestPosition, trade.usdValue || 0);

    // ── Risk metrics ────────────────────────────────────────────────
    s.profitFactor = s._grossLosses > 0 ? (s._grossWins / s._grossLosses) : (s._grossWins > 0 ? Infinity : 0);
    s.payoffRatio = s.avgLoss > 0 ? (s.avgWin / s.avgLoss) : (s.avgWin > 0 ? Infinity : 0);
    s.expectancy = (s.winRate / 100 * s.avgWin) - ((1 - s.winRate / 100) * s.avgLoss);
    s.recoveryFactor = s.maxDrawdown > 0 ? (s.netPnl / s.maxDrawdown) : 0;
    s.calmarRatio = s.maxDrawdownPercent > 0 ? (s.netPnlPercent / s.maxDrawdownPercent) : 0;

    // ── Sharpe / Sortino (rolling window) ───────────────────────────
    s._pnlArray.push(pnl);
    if (s._pnlArray.length > 500) s._pnlArray = s._pnlArray.slice(-500);
    s.sharpeRatio = this._calcSharpe(s._pnlArray);
    s.sortinoRatio = this._calcSortino(s._pnlArray);

    // ── Today's stats ───────────────────────────────────────────────
    const todayKey = new Date().toISOString().split('T')[0];
    if (s._todayDate !== todayKey) {
      s._todayDate = todayKey;
      s.todayTrades = 0;
      s.todayPnl = 0;
      s.todayWins = 0;
    }
    s.todayTrades++;
    s.todayPnl += pnl;
    if (isWin) s.todayWins++;
    s.todayWinRate = s.todayTrades > 0 ? (s.todayWins / s.todayTrades * 100) : 0;
  }

  /**
   * Full recompute of all stats from trade array (used on startup)
   */
  _recomputeAllStats() {
    this.stats = this._emptyStats();
    for (const trade of this.trades) {
      this._updateStats(trade);
    }
  }


  // ════════════════════════════════════════════════════════════════════════
  // PRIVATE: RISK MATH
  // ════════════════════════════════════════════════════════════════════════

  _calcSharpe(returns) {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    return stdDev > 0 ? (mean / stdDev * Math.sqrt(252)) : 0;  // Annualized
  }

  _calcSortino(returns) {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downsideReturns = returns.filter(r => r < 0);
    if (downsideReturns.length === 0) return mean > 0 ? Infinity : 0;
    const downsideVariance = downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length;
    const downsideDev = Math.sqrt(downsideVariance);
    return downsideDev > 0 ? (mean / downsideDev * Math.sqrt(252)) : 0;
  }


  // ════════════════════════════════════════════════════════════════════════
  // PRIVATE: EQUITY TRACKING
  // ════════════════════════════════════════════════════════════════════════

  _recordEquityPoint(trade) {
    const point = {
      timestamp: trade.timestamp,
      tradeNumber: this.trades.length,
      balance: this.stats.currentBalance,
      netPnl: this.stats.netPnl,
      drawdown: this.stats.currentDrawdown,
      drawdownPct: this.stats.currentDrawdownPercent,
      peak: this.stats.peakBalance
    };

    this.equityCurve.push(point);
    if (this.equityCurve.length > this.config.maxEquityPoints) {
      this.equityCurve = this.equityCurve.slice(-this.config.maxEquityPoints);
    }

    // Append to equity snapshots file
    this._appendFile(this.paths.equity, JSON.stringify(point));
  }


  // ════════════════════════════════════════════════════════════════════════
  // PRIVATE: PERSISTENCE
  // ════════════════════════════════════════════════════════════════════════

  _ensureDirs() {
    for (const dir of [this.paths.dir, this.paths.exports]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  _appendLedger(record) {
    this._appendFile(this.paths.ledger, JSON.stringify(record));
  }

  _appendFile(filepath, line) {
    try {
      fs.appendFileSync(filepath, line + '\n', 'utf8');
    } catch (err) {
      console.error(`📒 TradeJournal: Failed to append to ${filepath}: ${err.message}`);
    }
  }

  _saveStatsCache() {
    try {
      const cacheData = {
        savedAt: Date.now(),
        stats: { ...this.stats, _pnlArray: undefined },  // Don't save huge array
        tradeCount: this.trades.length
      };
      fs.writeFileSync(this.paths.statsCache, JSON.stringify(cacheData, null, 2), 'utf8');
    } catch (err) {
      console.error(`📒 TradeJournal: Failed to save stats cache: ${err.message}`);
    }
  }

  /**
   * Rebuild all state from the append-only ledger file.
   * This is the single source of truth — everything else is derived.
   */
  _rebuildFromLedger() {
    if (!fs.existsSync(this.paths.ledger)) {
      console.log('📒 TradeJournal: No existing ledger found, starting fresh');
      return;
    }

    try {
      const raw = fs.readFileSync(this.paths.ledger, 'utf8');
      const lines = raw.split('\n').filter(l => l.trim());

      const entries = new Map(); // orderId → entry record

      for (const line of lines) {
        let record;
        try {
          record = JSON.parse(line);
        } catch {
          continue; // Skip malformed lines
        }

        if (record.event === 'ENTRY') {
          entries.set(record.orderId, record);
          this.openTrades.set(record.orderId, record);
        } else if (record.event === 'EXIT') {
          this.trades.push(record);
          this.openTrades.delete(record.orderId);
          entries.delete(record.orderId);
        }
      }

      // Bound in-memory trades
      if (this.trades.length > this.config.maxInMemoryTrades) {
        this.trades = this.trades.slice(-this.config.maxInMemoryTrades);
      }

      // Rebuild equity curve from equity snapshots file
      if (fs.existsSync(this.paths.equity)) {
        const eqRaw = fs.readFileSync(this.paths.equity, 'utf8');
        const eqLines = eqRaw.split('\n').filter(l => l.trim());
        for (const line of eqLines) {
          try {
            this.equityCurve.push(JSON.parse(line));
          } catch { /* skip */ }
        }
        if (this.equityCurve.length > this.config.maxEquityPoints) {
          this.equityCurve = this.equityCurve.slice(-this.config.maxEquityPoints);
        }
      }

      // Recompute all stats from trades
      this._recomputeAllStats();

      console.log(`📒 TradeJournal: Rebuilt from ledger — ${this.trades.length} completed trades, ${this.openTrades.size} open positions`);

    } catch (err) {
      console.error(`📒 TradeJournal: Failed to rebuild from ledger: ${err.message}`);
    }
  }


  // ════════════════════════════════════════════════════════════════════════
  // PRIVATE: HELPERS
  // ════════════════════════════════════════════════════════════════════════

  _addToBucket(buckets, key, trade) {
    if (!buckets[key]) {
      buckets[key] = {
        trades: 0, wins: 0, losses: 0,
        netPnl: 0, grossWins: 0, grossLosses: 0,
        totalHoldTime: 0
      };
    }
    const b = buckets[key];
    b.trades++;
    b.netPnl += trade.netPnl || 0;
    b.totalHoldTime += trade.holdTimeMs || 0;
    if (trade.netPnl > 0) {
      b.wins++;
      b.grossWins += trade.netPnl;
    } else {
      b.losses++;
      b.grossLosses += Math.abs(trade.netPnl);
    }
  }

  _formatDuration(ms) {
    if (!ms || ms <= 0) return '0s';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
}

module.exports = TradeJournal;
