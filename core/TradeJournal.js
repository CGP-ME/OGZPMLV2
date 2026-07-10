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
const { requirePatternScope } = require('./PatternScope');

function outcomeFromPnl(pnl) {
  if (pnl > 0) return 'win';
  if (pnl < 0) return 'loss';
  return 'flat';
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim().length === 0) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positiveNumberOrNull(value) {
  const n = finiteNumberOrNull(value);
  return n !== null && n > 0 ? n : null;
}

function nonNegativeNumberOrNull(value) {
  const n = finiteNumberOrNull(value);
  return n !== null && n >= 0 ? n : null;
}

function nonNegativeIntegerOrNull(value) {
  const n = nonNegativeNumberOrNull(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

function nonEmptyStringOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nonEmptyStringArrayOrNull(value) {
  if (!Array.isArray(value)) return null;
  const strings = value.map(nonEmptyStringOrNull);
  return strings.every(item => item !== null) ? strings : null;
}

function jsonCloneOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = nonEmptyStringOrNull(value);
    if (normalized) return normalized;
  }
  return null;
}

function roundFiniteOrNull(value, decimals = 2) {
  const n = finiteNumberOrNull(value);
  return n === null ? null : Number(n.toFixed(decimals));
}

function indicatorNumberOrNull(value) {
  if (value && typeof value === 'object' && Number.isFinite(Number(value.macd))) {
    return Number(value.macd);
  }
  return finiteNumberOrNull(value);
}

function tradeSideOrNull(direction) {
  const value = nonEmptyStringOrNull(direction);
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === 'buy' || normalized === 'long') return 'long';
  if (normalized === 'sell' || normalized === 'sell_short' || normalized === 'short') return 'short';
  return null;
}

function expectedGrossPnl(entryPrice, exitPrice, usdValue, side) {
  const move = side === 'short'
    ? (entryPrice - exitPrice) / entryPrice
    : (exitPrice - entryPrice) / entryPrice;
  return usdValue * move;
}

function pnlTolerance(expected, usdValue) {
  return Math.max(0.01, Math.abs(expected) * 0.0001, usdValue * 0.000001);
}

function usdValueTolerance(sizeUsd) {
  return Math.max(0.01, sizeUsd * 0.000001);
}

function remainingLifecycleTolerance(sizeUsd) {
  const n = positiveNumberOrNull(sizeUsd) ?? 1;
  return Math.max(Number.EPSILON * Math.max(1, n), n * 1e-12);
}

function exitNotionalOrNull(exit) {
  return positiveNumberOrNull(
    exit?.size ?? exit?.sizeUsd ?? exit?.usdValue ?? exit?.exitSize
  );
}

function ledgerExitNotionalOrNull(exit) {
  return positiveNumberOrNull(
    exit?.usdValue ?? exit?.sizeUsd ?? exit?.exitSize ?? exit?.size
  );
}

function exitNotionalConflictOrNull(exit, expectedNotional, options = {}) {
  const expected = positiveNumberOrNull(expectedNotional);
  if (expected === null) return null;
  const tolerance = usdValueTolerance(expected);
  const fields = options.includeLegacySize === false
    ? ['usdValue', 'sizeUsd', 'exitSize']
    : ['size', 'sizeUsd', 'usdValue', 'exitSize'];
  for (const field of fields) {
    const value = positiveNumberOrNull(exit?.[field]);
    if (value !== null && Math.abs(value - expected) > tolerance) {
      return { field, value, expected };
    }
  }
  return null;
}

class TradeJournal {
  constructor(config = {}) {
    // ── Storage paths ──────────────────────────────────────────────────
    if (!config.dataDir) {
      throw new Error('[TRADE-JOURNAL-SCOPE] TradeJournal requires an explicit scoped dataDir; refusing unscoped data/journal default');
    }
    const dataDir = config.dataDir;
    this.scope = requirePatternScope(config.scope || config, 'TradeJournal');
    this.paths = {
      dir: dataDir,
      ledger: path.join(dataDir, 'trade-ledger.jsonl'),
      equity: path.join(dataDir, 'equity-snapshots.jsonl'),
      statsCache: path.join(dataDir, 'journal-stats.json'),
      exports: path.join(dataDir, 'exports')
    };

    // ── Config ─────────────────────────────────────────────────────────
    this.config = {
      // FIX MIRROR-JOURNAL-BALANCE: refuse phantom $10K default. CRIT-08 hardened
      // StateManager.getEquity; TradeJournal mirror was not audited.
      startingBalance: (() => {
        if (!Number.isFinite(config.startingBalance) || config.startingBalance <= 0) {
          throw new Error(`[MIRROR-JOURNAL-BALANCE] TradeJournal requires positive finite startingBalance (got ${config.startingBalance}) — refusing $10K phantom`);
        }
        return config.startingBalance;
      })(),
      maxInMemoryTrades: config.maxInMemoryTrades || 5000,
      maxEquityPoints: config.maxEquityPoints || 10000,
      autoSaveInterval: config.autoSaveInterval || 60000,  // 1 min
      ...config
    };

    // ── In-memory state (rebuilt from ledger on startup) ───────────────
    this.trades = [];           // completed trades (bounded)
    this.openTrades = new Map(); // orderId → entry record
    this.entryOrderIds = new Set(); // every consumed ENTRY orderId, including reconciled orphans
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

    console.log(`[TradeJournal] initialized | ${this.trades.length} historical trades loaded | Balance: $${this.stats.currentBalance.toFixed(2)}`);
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
   * @param {number} entry.size         - Position size
   * @param {number} entry.usdValue     - USD value of position
   * @param {number} entry.confidence   - Confidence score (0-100)
   * @param {string} entry.regime       - Market regime at entry
   * @param {Array}  entry.patterns     - Patterns detected at entry
   * @param {Object} entry.indicators   - Indicator values at entry
   * @param {number} [entry.fees]       - Entry fees
   */
  recordEntry(entry) {
    const missing = [];
    const orderId = nonEmptyStringOrNull(entry?.orderId);
    const direction = nonEmptyStringOrNull(entry?.direction);
    const side = tradeSideOrNull(direction);
    const entryPrice = positiveNumberOrNull(entry?.entryPrice);
    const size = positiveNumberOrNull(entry?.size);
    const usdValue = positiveNumberOrNull(entry?.usdValue);
    const confidence = finiteNumberOrNull(entry?.confidence);
    const fees = nonNegativeNumberOrNull(entry?.fees);
    const hasSuppliedTimestamp = entry?.timestamp !== undefined && entry?.timestamp !== null;
    const timestamp = hasSuppliedTimestamp ? nonNegativeNumberOrNull(entry?.timestamp) : Date.now();

    if (!orderId) missing.push('orderId');
    if (!direction || !side) missing.push('direction');
    if (entryPrice === null) missing.push('entryPrice');
    if (size === null) missing.push('size');
    if (usdValue === null) missing.push('usdValue');
    if (confidence === null) missing.push('confidence');
    if (fees === null) missing.push('fees');
    if (hasSuppliedTimestamp && timestamp === null) missing.push('timestamp');

    if (missing.length > 0) {
      console.warn(`[TradeJournal] Refusing incomplete entry record; missing field(s): ${missing.join(', ')}`);
      return null;
    }

    if (Math.abs(size - usdValue) > usdValueTolerance(size)) {
      console.warn(`[TradeJournal] Refusing entry ${orderId}; size and usdValue must both represent the same USD notional`);
      return null;
    }

    if (this.entryOrderIds.has(orderId) || this.openTrades.has(orderId) || this.trades.some(trade => trade.orderId === orderId)) {
      console.warn(`[TradeJournal] Refusing duplicate entry orderId: ${orderId}`);
      return null;
    }

    const record = {
      event: 'ENTRY',
      timestamp,
      orderId,
      direction,
      entryPrice,
      size,
      usdValue,
      confidence,
      regime: nonEmptyStringOrNull(entry.regime),
      patterns: Array.isArray(entry.patterns) ? entry.patterns.map(p => ({
        name: nonEmptyStringOrNull(p?.name) ?? nonEmptyStringOrNull(p?.type),
        confidence: finiteNumberOrNull(p?.confidence)
      })).filter(p => p.name !== null) : [],
      indicators: {
        rsi: finiteNumberOrNull(entry.indicators?.rsi),
        macd: indicatorNumberOrNull(entry.indicators?.macd),
        trend: nonEmptyStringOrNull(entry.indicators?.trend),
        volatility: finiteNumberOrNull(entry.indicators?.volatility)
      },
      entryStrategy: firstNonEmptyString(entry.entryStrategy, entry.strategy, entry.winnerStrategy),
      winnerStrategy: firstNonEmptyString(entry.winnerStrategy, entry.entryStrategy, entry.strategy),
      strategy: firstNonEmptyString(entry.strategy, entry.entryStrategy, entry.winnerStrategy),
      signalId: nonEmptyStringOrNull(entry.signalId),
      decisionId: nonEmptyStringOrNull(entry.decisionId),
      traceId: nonEmptyStringOrNull(entry.traceId),
      executionRoute: nonEmptyStringOrNull(entry.executionRoute),
      executionVenue: nonEmptyStringOrNull(entry.executionVenue),
      marketDataBrokerId: nonEmptyStringOrNull(entry.marketDataBrokerId),
      signalBasis: nonEmptyStringOrNull(entry.signalBasis),
      crossoverCount: finiteNumberOrNull(entry.crossoverCount),
      decisionLedger: jsonCloneOrNull(entry.decisionLedger),
      strategySignals: Array.isArray(entry.strategySignals) ? jsonCloneOrNull(entry.strategySignals) : null,
      orchestratorDecision: jsonCloneOrNull(entry.orchestratorDecision),
      competingStrategies: Array.isArray(entry.competingStrategies) ? jsonCloneOrNull(entry.competingStrategies) : null,
      confluence: jsonCloneOrNull(entry.confluence),
      positionSizing: jsonCloneOrNull(entry.positionSizing),
      exitContract: jsonCloneOrNull(entry.exitContract),
      riskGates: jsonCloneOrNull(entry.riskGates),
      fees,
      ...this._scopeRecordFields()
    };

    // Append to ledger (crash-safe)
    this._appendLedger(record);

    // Store in open trades map only after the append-only ledger accepts it.
    this.entryOrderIds.add(record.orderId);
    this.openTrades.set(record.orderId, record);

    console.log(`[TradeJournal] ENTRY logged: ${record.direction} size=${record.size.toFixed(6)} @ $${record.entryPrice.toFixed(2)} | Conf: ${record.confidence}% | Regime: ${record.regime}`);
    return record;
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
    const orderId = nonEmptyStringOrNull(exit?.orderId);
    if (!orderId) {
      console.warn('[TradeJournal] Refusing incomplete exit record; missing field(s): orderId');
      return null;
    }

    const now = Date.now();
    const entry = this.openTrades.get(orderId);
    if (!entry) {
      console.warn(`[TradeJournal] Refusing exit for ${orderId}; no matching open entry in journal`);
      return null;
    }

    const missing = [];
    const direction = nonEmptyStringOrNull(entry.direction);
    const side = tradeSideOrNull(direction);
    const entryPrice = positiveNumberOrNull(entry.entryPrice);
    const exitPrice = positiveNumberOrNull(exit?.exitPrice);
    const openSize = positiveNumberOrNull(entry.size);
    const openUsdValue = positiveNumberOrNull(entry.usdValue);
    const grossPnl = finiteNumberOrNull(exit?.pnl);
    const entryFees = nonNegativeNumberOrNull(entry.fees);
    const exitFees = nonNegativeNumberOrNull(exit?.fees);
    const exitReason = nonEmptyStringOrNull(exit?.reason);
    const holdTime = nonNegativeNumberOrNull(now - entry.timestamp);
    const exitUsdValue = exitNotionalOrNull(exit);

    if (!direction || !side) missing.push('direction');
    if (entryPrice === null) missing.push('entryPrice');
    if (exitPrice === null) missing.push('exitPrice');
    if (openSize === null) missing.push('size');
    if (openUsdValue === null) missing.push('usdValue');
    if (exitUsdValue === null) missing.push('exitSize');
    if (grossPnl === null) missing.push('pnl');
    if (entryFees === null) missing.push('entryFees');
    if (exitFees === null) missing.push('fees');
    if (!exitReason) missing.push('reason');
    if (holdTime === null) missing.push('holdTime');

    if (missing.length > 0) {
      console.warn(`[TradeJournal] Refusing incomplete exit record for ${orderId}; missing field(s): ${missing.join(', ')}`);
      return null;
    }

    const notionalTolerance = usdValueTolerance(openUsdValue);
    const notionalConflict = exitNotionalConflictOrNull(exit, exitUsdValue);
    if (notionalConflict) {
      console.warn(`[TradeJournal] Refusing exit for ${orderId}; exit notional field ${notionalConflict.field}=${notionalConflict.value.toFixed(6)} conflicts with selected exit size ${notionalConflict.expected.toFixed(6)}`);
      return null;
    }
    if (exitUsdValue - openUsdValue > notionalTolerance) {
      console.warn(`[TradeJournal] Refusing exit for ${orderId}; exit size ${exitUsdValue.toFixed(6)} exceeds open journal size ${openUsdValue.toFixed(6)}`);
      return null;
    }

    const effectiveExitUsdValue = Math.min(exitUsdValue, openUsdValue);
    const remainingUsdValue = Math.max(0, openUsdValue - effectiveExitUsdValue);
    const exitFraction = effectiveExitUsdValue / openUsdValue;
    const isPartialExit = remainingUsdValue > remainingLifecycleTolerance(openUsdValue);
    const entryFeesForExit = entryFees * exitFraction;
    const remainingEntryFees = isPartialExit ? Math.max(0, entryFees - entryFeesForExit) : 0;

    const expectedGross = expectedGrossPnl(entryPrice, exitPrice, effectiveExitUsdValue, side);
    const tolerance = pnlTolerance(expectedGross, effectiveExitUsdValue);
    if (Math.abs(grossPnl - expectedGross) > tolerance) {
      console.warn(`[TradeJournal] Refusing exit for ${orderId}; supplied pnl ${grossPnl.toFixed(6)} does not match ${side} price movement ${expectedGross.toFixed(6)}`);
      return null;
    }

    const totalFees = entryFeesForExit + exitFees;
    const netPnl = grossPnl - totalFees;
    const pnlPercent = netPnl / effectiveExitUsdValue * 100;
    const balanceAfter = this.stats.currentBalance + netPnl;

    const completedTrade = {
      event: 'EXIT',
      timestamp: now,
      orderId,
      direction,
      entryPrice,
      exitPrice,
      size: effectiveExitUsdValue,
      usdValue: effectiveExitUsdValue,
      originalOpenSize: openSize,
      originalOpenUsdValue: openUsdValue,
      exitFraction,
      partialExit: isPartialExit,
      remainingSize: isPartialExit ? remainingUsdValue : 0,
      remainingUsdValue: isPartialExit ? remainingUsdValue : 0,
      entryFeesAllocated: entryFeesForExit,
      remainingEntryFees,
      grossPnl,
      fees: totalFees,
      netPnl,
      pnlPercent,
      holdTimeMs: holdTime,
      holdTimeFormatted: this._formatDuration(holdTime),
      exitReason,
      mfe: finiteNumberOrNull(exit?.maxProfit),
      mae: finiteNumberOrNull(exit?.maxDrawdown),
      confidence: finiteNumberOrNull(entry.confidence),
      regime: nonEmptyStringOrNull(entry.regime),
      patterns: Array.isArray(entry.patterns) ? entry.patterns : [],
      indicators: entry.indicators && typeof entry.indicators === 'object' ? entry.indicators : {},
      entryStrategy: firstNonEmptyString(entry.entryStrategy, entry.strategy, entry.winnerStrategy),
      winnerStrategy: firstNonEmptyString(entry.winnerStrategy, entry.entryStrategy, entry.strategy),
      strategy: firstNonEmptyString(entry.strategy, entry.entryStrategy, entry.winnerStrategy),
      signalId: nonEmptyStringOrNull(entry.signalId),
      decisionId: nonEmptyStringOrNull(entry.decisionId),
      traceId: nonEmptyStringOrNull(entry.traceId),
      signalBasis: nonEmptyStringOrNull(entry.signalBasis),
      crossoverCount: finiteNumberOrNull(entry.crossoverCount),
      decisionLedger: jsonCloneOrNull(entry.decisionLedger),
      strategySignals: Array.isArray(entry.strategySignals) ? jsonCloneOrNull(entry.strategySignals) : null,
      orchestratorDecision: jsonCloneOrNull(entry.orchestratorDecision),
      competingStrategies: Array.isArray(entry.competingStrategies) ? jsonCloneOrNull(entry.competingStrategies) : null,
      confluence: jsonCloneOrNull(entry.confluence),
      positionSizing: jsonCloneOrNull(entry.positionSizing),
      exitContract: jsonCloneOrNull(entry.exitContract),
      riskGates: jsonCloneOrNull(entry.riskGates),
      entryTime: entry.timestamp,
      balanceAfter,
      ...this._scopeRecordFields()
    };

    // ── Append to ledger ──────────────────────────────────────────────
    this._appendLedger(completedTrade);

    // ── Update in-memory trades ───────────────────────────────────────
    this.trades.push(completedTrade);
    if (this.trades.length > this.config.maxInMemoryTrades) {
      this.trades = this.trades.slice(-this.config.maxInMemoryTrades);
    }

    // ── Update open trade lifecycle ───────────────────────────────────
    if (isPartialExit) {
      this.openTrades.set(orderId, {
        ...entry,
        size: remainingUsdValue,
        usdValue: remainingUsdValue,
        fees: remainingEntryFees,
        partialExitCount: (nonNegativeIntegerOrNull(entry.partialExitCount) ?? 0) + 1,
        lastPartialExitAt: now,
      });
    } else {
      this.openTrades.delete(orderId);
    }

    // ── Update equity curve ───────────────────────────────────────────
    this._recordEquityPoint(completedTrade);

    // ── Recompute stats ───────────────────────────────────────────────
    this._updateStats(completedTrade);

    const outcome = netPnl > 0 ? 'WIN' : netPnl < 0 ? 'LOSS' : 'FLAT';
    const pnlPercentText = pnlPercent === null ? 'n/a' : `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`;
    console.log(`[TradeJournal] EXIT logged: ${outcome} ${completedTrade.direction} | P&L: $${netPnl.toFixed(2)} (${pnlPercentText}) | Reason: ${completedTrade.exitReason} | Hold: ${completedTrade.holdTimeFormatted}`);

    return completedTrade;
  }

  /**
   * Record that an open journal entry was reconciled against authoritative flat
   * broker and StateManager proof for that order. This removes only orphaned
   * open journal state; it does not fabricate an EXIT, P&L, balance update, or
   * completed trade.
   */
  recordOpenTradeReconciliation(details = {}) {
    const missing = [];
    const orderId = nonEmptyStringOrNull(details.orderId);
    const reason = nonEmptyStringOrNull(details.reason);
    const source = nonEmptyStringOrNull(details.source);
    const statePositionCount = nonNegativeIntegerOrNull(details.statePositionCount);
    const stateActiveTradeCount = nonNegativeIntegerOrNull(details.stateActiveTradeCount);
    const stateOpenOrderIds = nonEmptyStringArrayOrNull(details.stateOpenOrderIds);
    const brokerPositionCount = nonNegativeIntegerOrNull(details.brokerPositionCount);
    const brokerSymbolPositionCount = nonNegativeIntegerOrNull(details.brokerSymbolPositionCount);
    const brokerPositions = Array.isArray(details.brokerPositions) ? details.brokerPositions : null;

    if (!orderId) missing.push('orderId');
    if (!reason) missing.push('reason');
    if (!source) missing.push('source');
    if (statePositionCount === null) missing.push('statePositionCount');
    if (stateActiveTradeCount === null) missing.push('stateActiveTradeCount');
    if (stateOpenOrderIds === null) missing.push('stateOpenOrderIds');
    if (brokerPositionCount === null) missing.push('brokerPositionCount');
    if (brokerSymbolPositionCount === null) missing.push('brokerSymbolPositionCount');
    if (brokerPositions === null) missing.push('brokerPositions');

    if (missing.length > 0) {
      console.warn(`[TradeJournal] Refusing open-trade reconciliation; missing field(s): ${missing.join(', ')}`);
      return null;
    }

    const entry = this.openTrades.get(orderId);
    if (!entry) {
      console.warn(`[TradeJournal] Refusing open-trade reconciliation for ${orderId}; no matching open entry in journal`);
      return null;
    }

    const brokerSymbols = brokerPositions.map(position => nonEmptyStringOrNull(position?.symbol));
    const scopeSymbolKey = this.scope.symbol.toUpperCase();
    const matchingBrokerSymbols = brokerSymbols.filter(symbol => symbol?.toUpperCase() === scopeSymbolKey);

    if (
      stateOpenOrderIds.length !== stateActiveTradeCount ||
      brokerPositions.length !== brokerPositionCount ||
      brokerSymbols.some(symbol => symbol === null) ||
      matchingBrokerSymbols.length !== brokerSymbolPositionCount
    ) {
      console.warn(`[TradeJournal] Refusing open-trade reconciliation for ${orderId}; reconciliation proof is inconsistent`);
      return null;
    }

    if (stateOpenOrderIds.includes(orderId) || brokerSymbolPositionCount !== 0) {
      console.warn(`[TradeJournal] Refusing open-trade reconciliation for ${orderId}; target order still has authoritative exposure`);
      return null;
    }

    const record = {
      event: 'OPEN_TRADE_RECONCILED',
      timestamp: Date.now(),
      orderId,
      reason,
      source,
      statePositionCount,
      stateActiveTradeCount,
      stateOpenOrderIds,
      brokerPositionCount,
      brokerSymbolPositionCount,
      brokerPositions,
      reconciledEntry: {
        timestamp: entry.timestamp,
        direction: entry.direction,
        entryPrice: entry.entryPrice,
        size: entry.size,
        usdValue: entry.usdValue,
        confidence: entry.confidence,
        regime: entry.regime,
      },
      ...this._scopeRecordFields()
    };

    this._appendLedger(record);
    this.entryOrderIds.add(orderId);
    this.openTrades.delete(orderId);

    console.warn(`[TradeJournal] OPEN_TRADE_RECONCILED logged for ${orderId}; journal open state removed after target-specific broker/state proof`);
    return record;
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
   * @param {'symbol'|'regime'|'pattern'|'hourOfDay'|'dayOfWeek'|'confidenceBand'|'exitReason'|'month'} dimension
   * @returns {Object} { [key]: { trades, wins, losses, netPnl, winRate, avgPnl, avgWin, avgLoss, profitFactor } }
   */
  getPerformanceBreakdown(dimension) {
    const buckets = {};

    for (const trade of this.trades) {
      let key;
      switch (dimension) {
        case 'symbol':
          key = nonEmptyStringOrNull(trade.symbol);
          if (!key) continue;
          break;
        case 'regime':
          key = nonEmptyStringOrNull(trade.regime);
          if (!key) continue;
          break;
        case 'pattern':
          // A trade may have multiple patterns — count each
          if (!trade.patterns || trade.patterns.length === 0) {
            key = 'no_pattern';
            this._addToBucket(buckets, key, trade);
          } else {
            for (const p of trade.patterns) {
              const patternName = nonEmptyStringOrNull(p?.name);
              if (patternName) this._addToBucket(buckets, patternName, trade);
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
          const conf = finiteNumberOrNull(trade.confidence);
          if (conf === null) continue;
          if (conf < 55) key = '< 55%';
          else if (conf < 65) key = '55-65%';
          else if (conf < 75) key = '65-75%';
          else if (conf < 85) key = '75-85%';
          else key = '85%+';
          break;
        case 'exitReason':
          key = nonEmptyStringOrNull(trade.exitReason);
          if (!key) continue;
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
      const pnl = trade.netPnl;
      if (pnl > 0) {
        streakHistory.push('W');
        tempWin++;
        tempLoss = 0;
        longestWin = Math.max(longestWin, tempWin);
      } else if (pnl < 0) {
        streakHistory.push('L');
        tempLoss++;
        tempWin = 0;
        longestLoss = Math.max(longestLoss, tempLoss);
      } else {
        streakHistory.push('F');
        tempWin = 0;
        tempLoss = 0;
      }
    }

    // Current streak
    const lastPnl = this.trades[this.trades.length - 1]?.netPnl;
    if (lastPnl > 0) {
      currentStreak = tempWin;
      currentType = 'winning';
    } else if (lastPnl < 0) {
      currentStreak = tempLoss;
      currentType = 'losing';
    } else {
      currentStreak = 0;
      currentType = 'flat';
    }

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
        symbol: t.symbol,
        direction: t.direction,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        netPnl: roundFiniteOrNull(t.netPnl),
        pnlPercent: roundFiniteOrNull(t.pnlPercent),
        outcome: outcomeFromPnl(t.netPnl),
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
        finiteNumberOrNull(t.pnlPercent) === null ? '' : t.pnlPercent.toFixed(2) + '%',
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
    const filename = nonEmptyStringOrNull(options.filename) ?? this._defaultCSVFilename();
    const filepath = path.join(this.paths.exports, filename);
    // Atomic write — partial CSV exports corrupt downstream tools (Mercury Vector 6)
    const { writeStringAtomic } = require('./AtomicWrite');
    writeStringAtomic(filepath, csv, 'utf8');

    console.log(`[TradeJournal] Exported ${filtered.length} trades to ${filepath}`);
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
    console.log('[TradeJournal] destroyed, stats saved');
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
    // FIX MIRROR-JOURNAL-INVARIANT: refuse silent NaN propagation through analytics.
    // Belt-and-suspenders — constructor throw should prevent the state, but if
    // upstream catch+ignores, this fires loudly rather than silently zeroing.
    if (!Number.isFinite(s.startingBalance) || s.startingBalance <= 0) {
      throw new Error(`[MIRROR-JOURNAL-INVARIANT] stats.startingBalance must be positive finite (got ${s.startingBalance}) — refusing NaN-corrupt analytics`);
    }
    s.netPnlPercent = (s.netPnl / s.startingBalance) * 100;

    // ── Balance ─────────────────────────────────────────────────────
    s.currentBalance = Number.isFinite(trade.balanceAfter) ? trade.balanceAfter : (s.currentBalance + pnl);
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
    const tradeDayKey = this._dayKeyForTimestamp(trade.timestamp);
    if (s._todayDate !== todayKey) {
      s._todayDate = todayKey;
      s.todayTrades = 0;
      s.todayPnl = 0;
      s.todayWins = 0;
    }
    if (tradeDayKey === todayKey) {
      s.todayTrades++;
      s.todayPnl += pnl;
      if (isWin) s.todayWins++;
    }
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
    this._appendFile(this.paths.ledger, JSON.stringify(record), { critical: true });
  }

  _appendFile(filepath, line, options = {}) {
    try {
      fs.appendFileSync(filepath, line + '\n', 'utf8');
      return true;
    } catch (err) {
      console.error(`[TradeJournal] Failed to append to ${filepath}: ${err.message}`);
      if (options.critical === true) throw err;
      return false;
    }
  }

  _saveStatsCache() {
    try {
      const cacheData = {
        savedAt: Date.now(),
        stats: { ...this.stats, _pnlArray: undefined },  // Don't save huge array
        tradeCount: this.trades.length
      };
      const { writeJsonAtomic } = require('./AtomicWrite');
      writeJsonAtomic(this.paths.statsCache, cacheData);
    } catch (err) {
      console.error(`[TradeJournal] Failed to save stats cache: ${err.message}`);
    }
  }

  /**
   * Rebuild all state from the append-only ledger file.
   * This is the single source of truth — everything else is derived.
   */
  _rebuildFromLedger() {
    if (!fs.existsSync(this.paths.ledger)) {
      console.log('[TradeJournal] No existing ledger found, starting fresh');
      return;
    }

    try {
      const raw = fs.readFileSync(this.paths.ledger, 'utf8');
      const lines = raw.split('\n').filter(l => l.trim());

      const entries = new Map(); // orderId -> entry record
      const seenEntryOrderIds = new Set();

      for (const [index, line] of lines.entries()) {
        let record;
        try {
          record = JSON.parse(line);
        } catch {
          throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${index + 1} is malformed JSON`);
        }

        if (record.event === 'ENTRY') {
          this._assertLedgerRecordScope(record, index + 1);
          const orderId = nonEmptyStringOrNull(record.orderId);
          if (!orderId) {
            throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${index + 1} ENTRY missing orderId`);
          }
          if (seenEntryOrderIds.has(orderId)) {
            throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${index + 1} duplicates ENTRY orderId ${orderId}`);
          }
          seenEntryOrderIds.add(orderId);
          this.entryOrderIds.add(orderId);
          entries.set(record.orderId, record);
          this.openTrades.set(record.orderId, record);
        } else if (record.event === 'EXIT') {
          this._assertLedgerRecordScope(record, index + 1);
          const orderId = nonEmptyStringOrNull(record.orderId);
          if (!orderId) {
            throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${index + 1} EXIT missing orderId`);
          }
          if (!entries.has(orderId)) {
            throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${index + 1} EXIT has no matching open ENTRY for orderId ${orderId}`);
          }
          const entry = entries.get(orderId);
          const exitUsdValue = ledgerExitNotionalOrNull(record);
          const entryUsdValue = positiveNumberOrNull(entry?.usdValue);
          if (exitUsdValue === null || entryUsdValue === null) {
            throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${index + 1} EXIT missing positive notional`);
          }
          const notionalConflict = exitNotionalConflictOrNull(record, exitUsdValue, { includeLegacySize: false });
          if (notionalConflict) {
            throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${index + 1} EXIT notional field ${notionalConflict.field} conflicts with selected exit size`);
          }
          const canonicalExitRecord = {
            ...record,
            size: positiveNumberOrNull(record.size) ?? exitUsdValue,
            usdValue: positiveNumberOrNull(record.usdValue) ?? exitUsdValue,
          };
          this.trades.push(canonicalExitRecord);
          const remainingFromRecord = finiteNumberOrNull(record.remainingUsdValue ?? record.remainingSize);
          const tolerance = usdValueTolerance(entryUsdValue);
          const lifecycleTolerance = remainingLifecycleTolerance(entryUsdValue);
          if (remainingFromRecord !== null) {
            const expectedRemaining = Math.max(0, entryUsdValue - exitUsdValue);
            if (remainingFromRecord < -tolerance || Math.abs(Math.max(0, remainingFromRecord) - expectedRemaining) > tolerance) {
              throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${index + 1} EXIT remaining notional does not match open entry`);
            }
            if (remainingFromRecord > lifecycleTolerance) {
              const remainingEntry = {
                ...entry,
                size: remainingFromRecord,
                usdValue: remainingFromRecord,
                fees: nonNegativeNumberOrNull(record.remainingEntryFees) ?? (
                  nonNegativeNumberOrNull(entry.fees) !== null
                    ? entry.fees * (remainingFromRecord / entryUsdValue)
                    : entry.fees
                ),
                partialExitCount: (nonNegativeIntegerOrNull(entry.partialExitCount) ?? 0) + 1,
                lastPartialExitAt: nonNegativeNumberOrNull(canonicalExitRecord.timestamp) ?? entry.lastPartialExitAt,
              };
              entries.set(orderId, remainingEntry);
              this.openTrades.set(orderId, remainingEntry);
            } else {
              this.openTrades.delete(orderId);
              entries.delete(orderId);
            }
          } else if (entryUsdValue - exitUsdValue > tolerance) {
            throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${index + 1} EXIT is partial-sized but missing remaining journal state`);
          } else {
            this.openTrades.delete(orderId);
            entries.delete(orderId);
          }
        } else if (record.event === 'OPEN_TRADE_RECONCILED') {
          this._assertLedgerRecordScope(record, index + 1);
          const orderId = nonEmptyStringOrNull(record.orderId);
          const reason = nonEmptyStringOrNull(record.reason);
          const source = nonEmptyStringOrNull(record.source);
          const statePositionCount = nonNegativeIntegerOrNull(record.statePositionCount);
          const stateActiveTradeCount = nonNegativeIntegerOrNull(record.stateActiveTradeCount);
          const stateOpenOrderIds = nonEmptyStringArrayOrNull(record.stateOpenOrderIds);
          const brokerPositionCount = nonNegativeIntegerOrNull(record.brokerPositionCount);
          const brokerSymbolPositionCount = nonNegativeIntegerOrNull(record.brokerSymbolPositionCount);
          const brokerPositions = Array.isArray(record.brokerPositions) ? record.brokerPositions : null;

          if (!orderId) {
            throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${index + 1} OPEN_TRADE_RECONCILED missing orderId`);
          }
          if (!reason || !source || statePositionCount === null || stateActiveTradeCount === null || stateOpenOrderIds === null || brokerPositionCount === null || brokerSymbolPositionCount === null || brokerPositions === null) {
            throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${index + 1} OPEN_TRADE_RECONCILED missing reconciliation proof`);
          }
          const brokerSymbols = brokerPositions.map(position => nonEmptyStringOrNull(position?.symbol));
          const scopeSymbolKey = this.scope.symbol.toUpperCase();
          const matchingBrokerSymbols = brokerSymbols.filter(symbol => symbol?.toUpperCase() === scopeSymbolKey);
          if (
            stateOpenOrderIds.length !== stateActiveTradeCount ||
            brokerPositions.length !== brokerPositionCount ||
            brokerSymbols.some(symbol => symbol === null) ||
            matchingBrokerSymbols.length !== brokerSymbolPositionCount
          ) {
            throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${index + 1} OPEN_TRADE_RECONCILED proof is inconsistent`);
          }
          if (stateOpenOrderIds.includes(orderId) || brokerSymbolPositionCount !== 0) {
            throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${index + 1} OPEN_TRADE_RECONCILED target still has authoritative exposure`);
          }
          if (!entries.has(orderId)) {
            throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${index + 1} OPEN_TRADE_RECONCILED has no matching open ENTRY for orderId ${orderId}`);
          }

          this.entryOrderIds.add(orderId);
          this.openTrades.delete(orderId);
          entries.delete(orderId);
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

      console.log(`TradeJournal: Rebuilt from ledger — ${this.trades.length} completed trades, ${this.openTrades.size} open positions`);

    } catch (err) {
      console.error(`TradeJournal: Failed to rebuild from ledger: ${err.message}`);
      throw err;
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

  _dayKeyForTimestamp(timestamp) {
    const ms = Number(timestamp);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  }

  _defaultCSVFilename() {
    return `ogzprime-trades-${new Date().toISOString().split('T')[0]}.csv`;
  }

  _scopeRecordFields() {
    return {
      symbol: this.scope.symbol,
      brokerId: this.scope.brokerId,
      accountId: this.scope.accountId,
      accountIdSource: this.scope.accountIdSource,
      assetClass: this.scope.assetClass,
      executionMode: this.scope.executionMode,
      timeframe: this.scope.timeframe,
      scopeKey: this.scope.scopeKey,
      scopeKeyVersion: this.scope.scopeKeyVersion,
      scopeComplete: this.scope.scopeComplete
    };
  }

  _assertLedgerRecordScope(record, lineNumber) {
    if (String(record.scopeKey || '') !== this.scope.scopeKey) {
      const actualScopeKey = record.scopeKey === undefined || record.scopeKey === null || record.scopeKey === ''
        ? 'missing'
        : String(record.scopeKey);
      throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${lineNumber} scopeKey mismatch: got ${actualScopeKey}, expected ${this.scope.scopeKey}`);
    }
    if (Number(record.scopeKeyVersion) !== 2) {
      const actualVersion = record.scopeKeyVersion === undefined || record.scopeKeyVersion === null || record.scopeKeyVersion === ''
        ? 'missing'
        : String(record.scopeKeyVersion);
      throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${lineNumber} scopeKeyVersion must be 2; got ${actualVersion}`);
    }
    if (record.scopeComplete !== this.scope.scopeComplete) {
      throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${lineNumber} scopeComplete mismatch: got ${record.scopeComplete}, expected ${this.scope.scopeComplete}`);
    }
    const recordScope = requirePatternScope(record, `TradeJournal.ledger line ${lineNumber}`);
    if (recordScope.scopeKey !== this.scope.scopeKey) {
      throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournal ledger line ${lineNumber} scopeKey mismatch: got ${recordScope.scopeKey}, expected ${this.scope.scopeKey}`);
    }
  }
}

module.exports = TradeJournal;
