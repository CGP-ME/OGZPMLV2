/**
 * ============================================================================
 * TradeJournalBridge v2 — Journal + Replay Auto-Wiring
 * ============================================================================
 *
 * Connects TradeJournal AND TradeReplayCapture to run-empire-v2.js without
 * modifying existing modules. It:
 *   1. Records every entry/exit in the journal ledger
 *   2. Captures candle context at entry/exit for visual replay
 *   3. On trade close: auto-saves replay + pushes "View Replay" to dashboard
 *   4. Handles all dashboard WebSocket requests for journal + replay data
 *   5. Broadcasts journal snapshots every 30s
 *   6. Provides HTTP API routes for /journal, /replay, /api/*
 *
 * INTEGRATION (add to run-empire-v2.js):
 * ```
 * const { TradeJournalBridge } = require('./core/TradeJournalBridge');
 * // In startBot() after all modules initialized:
 * this.journalBridge = new TradeJournalBridge(this);
 * ```
 *
 * @module core/TradeJournalBridge
 * @version 2.0.0
 */

const TradeJournal = require('./TradeJournal');
const TradeReplayCapture = require('./TradeReplayCapture');
const path = require('path');
const fs = require('fs');
const TradingConfig = require('./TradingConfig');  // CHANGE 2026-02-28: Centralized config
const { requirePatternScope } = require('./PatternScope');

function safeScopePathSegment(scope) {
  return [
    scope.executionMode,
    scope.brokerId,
    scope.accountId,
    scope.assetClass,
    scope.symbol,
    scope.timeframe,
  ].map(part => {
    const encoded = encodeURIComponent(String(part));
    return `${encoded.length}-${encoded}`;
  }).join('__');
}

function finiteNumberOrNull(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundedNumberOrNull(v, digits = 2) {
  const n = finiteNumberOrNull(v);
  if (n == null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function classifyReplayOutcome(pnl, pnlPercent) {
  const roundedPnl = roundedNumberOrNull(pnl, 2);
  const roundedPct = roundedNumberOrNull(pnlPercent, 2);
  const values = [roundedPnl, roundedPct].filter((v) => v != null);
  const signs = values.filter((v) => v !== 0).map((v) => Math.sign(v));
  const hasPositive = signs.includes(1);
  const hasNegative = signs.includes(-1);
  const hasZero = values.includes(0);

  if (hasPositive && hasNegative) return 'unverified';
  if (hasZero && signs.length > 0) return 'unverified';
  if (hasPositive) return 'win';
  if (hasNegative) return 'loss';
  if (values.length === 0) return 'unverified';
  return 'flat';
}

function nonEmptyStringOrNull(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

function positiveNumberOrNull(v) {
  const n = finiteNumberOrNull(v);
  return n != null && n > 0 ? n : null;
}

function nonNegativeNumberOrNull(v) {
  const n = finiteNumberOrNull(v);
  return n != null && n >= 0 ? n : null;
}

function isCloseLogRecord(record) {
  const type = nonEmptyStringOrNull(record?.type)?.toUpperCase() || null;
  const action = nonEmptyStringOrNull(record?.action)?.toUpperCase() || null;
  return ['EXIT', 'SELL', 'COVER'].includes(type) || ['EXIT', 'SELL', 'COVER'].includes(action);
}

function entryActionOrNull(action) {
  const normalized = nonEmptyStringOrNull(action)?.toUpperCase() || null;
  return normalized === 'BUY' || normalized === 'SELL_SHORT' ? normalized : null;
}

function findActiveTradeByOrderId(activeTrades, orderId) {
  const targetOrderId = nonEmptyStringOrNull(orderId);
  if (!targetOrderId) return null;

  if (activeTrades instanceof Map) {
    if (activeTrades.has(targetOrderId)) {
      return activeTrades.get(targetOrderId) || null;
    }
    for (const trade of activeTrades.values()) {
      if (trade && (trade.orderId === targetOrderId || trade.id === targetOrderId)) {
        return trade;
      }
    }
    return null;
  }

  if (Array.isArray(activeTrades)) {
    for (const entry of activeTrades) {
      const trade = Array.isArray(entry) ? entry[1] : entry;
      if (trade && (trade.orderId === targetOrderId || trade.id === targetOrderId)) {
        return trade;
      }
    }
    return null;
  }

  if (activeTrades && typeof activeTrades === 'object') {
    const keyedTrade = activeTrades[targetOrderId];
    if (keyedTrade) return keyedTrade;
    for (const trade of Object.values(activeTrades)) {
      if (trade && (trade.orderId === targetOrderId || trade.id === targetOrderId)) {
        return trade;
      }
    }
  }

  return null;
}

function normalizeClosedTradeRecord(exitRecord) {
  const missing = [];
  const orderId = nonEmptyStringOrNull(exitRecord?.id)
    || nonEmptyStringOrNull(exitRecord?.orderId)
    || nonEmptyStringOrNull(exitRecord?.tradeId);
  const direction = nonEmptyStringOrNull(exitRecord?.direction);
  const entryPrice = positiveNumberOrNull(exitRecord?.entryPrice);
  const exitPrice = positiveNumberOrNull(exitRecord?.exitPrice);
  const pnl = finiteNumberOrNull(exitRecord?.pnl ?? exitRecord?.netPnl ?? exitRecord?.pnlDollars);
  const pnlPercent = finiteNumberOrNull(exitRecord?.pnlPercent ?? exitRecord?.profitLossPercent);
  const holdTime = nonNegativeNumberOrNull(exitRecord?.holdTime ?? exitRecord?.holdDuration ?? exitRecord?.holdTimeMs);
  const reason = nonEmptyStringOrNull(exitRecord?.exitReason) || nonEmptyStringOrNull(exitRecord?.reason);
  const size = positiveNumberOrNull(exitRecord?.size ?? exitRecord?.sizeUsd ?? exitRecord?.usdValue);
  const maxProfit = finiteNumberOrNull(exitRecord?.maxProfit ?? exitRecord?.maxProfitPercent);
  const balance = finiteNumberOrNull(exitRecord?.balance ?? exitRecord?.balanceAfter);

  if (!orderId) missing.push('orderId');
  if (!direction) missing.push('direction');
  if (entryPrice == null) missing.push('entryPrice');
  if (exitPrice == null) missing.push('exitPrice');
  if (pnl == null) missing.push('pnl');
  if (holdTime == null) missing.push('holdTime');
  if (!reason) missing.push('reason');

  return {
    ok: missing.length === 0,
    missing,
    data: {
      orderId,
      direction,
      entryPrice,
      exitPrice,
      pnl,
      pnlPercent,
      reason,
      holdTime,
      size,
      maxProfit,
      balance,
    },
  };
}

function closedTradeLogKey(data) {
  return [
    data.orderId,
    data.direction,
    data.entryPrice,
    data.exitPrice,
    data.pnl,
    data.holdTime,
  ].join('|');
}

function exitActionOrNull(exitRecord, normalizedData = {}) {
  const explicitAction = nonEmptyStringOrNull(exitRecord?.action);
  if (explicitAction) return explicitAction.toUpperCase();

  const explicitType = nonEmptyStringOrNull(exitRecord?.type);
  if (explicitType && explicitType.toUpperCase() !== 'EXIT') return explicitType.toUpperCase();

  const direction = nonEmptyStringOrNull(normalizedData.direction || exitRecord?.direction)?.toLowerCase();
  if (direction === 'buy' || direction === 'long') return 'SELL';
  if (direction === 'sell_short' || direction === 'short') return 'COVER';
  return null;
}

function errorMessageOrNull(err) {
  if (!err) return null;
  if (err instanceof Error) return err.message || err.name || 'Error';
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch (_jsonErr) {
    return String(err);
  }
}

function compactTradeRecord(record) {
  if (!record || typeof record !== 'object') return {};
  return {
    id: nonEmptyStringOrNull(record.id),
    orderId: nonEmptyStringOrNull(record.orderId),
    tradeId: nonEmptyStringOrNull(record.tradeId),
    type: nonEmptyStringOrNull(record.type),
    action: nonEmptyStringOrNull(record.action),
    direction: nonEmptyStringOrNull(record.direction),
    entryPrice: finiteNumberOrNull(record.entryPrice),
    exitPrice: finiteNumberOrNull(record.exitPrice),
    pnl: finiteNumberOrNull(record.pnl ?? record.netPnl ?? record.pnlDollars),
    pnlPercent: finiteNumberOrNull(record.pnlPercent ?? record.profitLossPercent),
    reason: nonEmptyStringOrNull(record.exitReason) || nonEmptyStringOrNull(record.reason),
    holdTime: nonNegativeNumberOrNull(record.holdTime ?? record.holdDuration ?? record.holdTimeMs),
    size: finiteNumberOrNull(record.size ?? record.sizeUsd ?? record.usdValue),
  };
}

function resolveJournalScope(bot) {
  return requirePatternScope({
    symbol: bot?.config?.tradingPair || bot?.tradingPair,
    brokerId: bot?.config?.brokerId,
    accountId: bot?.config?.accountId,
    assetClass: bot?.config?.assetClass,
    executionMode: bot?.config?.executionMode,
    timeframe: bot?.config?.timeframe || bot?.candleTimeframe,
  }, 'TradeJournalBridge.dataDir');
}

function resolveJournalDataDir(bot, config = {}, scope = resolveJournalScope(bot)) {
  const journalRoot = config.dataDir || bot?.config?.journalDataDir;
  if (!journalRoot) {
    throw new Error('[TRADE-JOURNAL-SCOPE] TradeJournalBridge requires configured journalDataDir root; refusing implicit data/journal fallback');
  }
  return path.join(journalRoot, safeScopePathSegment(scope));
}

function resolveReplayDir(journalDataDir, config = {}) {
  const replayDir = config.replayDir || path.join(journalDataDir, 'replays');
  const resolvedJournalDir = path.resolve(journalDataDir);
  const resolvedReplayDir = path.resolve(replayDir);
  const relative = path.relative(resolvedJournalDir, resolvedReplayDir);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return replayDir;
  }
  throw new Error(`[TRADE-JOURNAL-SCOPE] TradeJournalBridge.replayDir must stay under scoped journal dataDir (${journalDataDir}); got ${replayDir}`);
}

class TradeJournalBridge {
  constructor(bot, config = {}) {
    this.bot = bot;

    // ── Initialize journal ──────────────────────────────────────────
    // FIX MIRROR-JOURNAL-BALANCE companion: coerce raw env-string values to Number,
    // use ?? not || to preserve explicit 0 (constructor will reject 0 as invalid balance,
    // surfacing real upstream bug rather than hiding under $10K phantom).
    // SPREAD ORDER CRITICAL: ...config must come FIRST; scoped dataDir and
    // startingBalance override LAST so callers cannot reopen the unscoped ledger.
    // Mercury caught Wolf's initial spec putting startingBalance before ...config which
    // caused the spread to silently overwrite the coerced value with raw config input —
    // re-introducing the exact bug Fix 27 was meant to fix.
    const _rawStartingBalance = config.startingBalance ?? TradingConfig.get('startingBalance');
    const journalScope = resolveJournalScope(this.bot);
    const journalDataDir = resolveJournalDataDir(this.bot, config, journalScope);
    this.journal = new TradeJournal({
      ...config,
      dataDir: journalDataDir,
      scope: journalScope,
      startingBalance: Number(_rawStartingBalance),
    });

    // ── Initialize replay capture ───────────────────────────────────
    this.replay = new TradeReplayCapture({
      replayDir: resolveReplayDir(journalDataDir, config),
      candlesBefore: 60,
      candlesAfter: 30
    });
    this.visibilityFailurePath = path.join(journalDataDir, 'trade-visibility-failures.jsonl');
    this.visibilityFailureFallbackPath = path.join(process.cwd(), 'data', 'runtime-audit', 'trade-visibility-failures-fallback.jsonl');
    this._pendingVisibilityErrors = [];
    this._maxPendingVisibilityErrors = 50;
    this._closedTradeLogKeySet = new Set();
    this._closedTradeLogKeys = [];

    // ── Wire everything ─────────────────────────────────────────────
    this._wireTradeEvents();
    this._wireDashboardMessages();
    this._wireBroadcastCycle();

    console.log('TradeJournalBridge v2: Journal + Replay wired into bot');
  }


  // ════════════════════════════════════════════════════════════════════════
  // TRADE EVENT WIRING
  // ════════════════════════════════════════════════════════════════════════

  _wireTradeEvents() {
    const bot = this.bot;
    const journal = this.journal;
    const replay = this.replay;
    const bridge = this;

    // ── Intercept trade ENTRIES ─────────────────────────────────────
    const originalExecuteTrade = bot.executeTrade.bind(bot);
    bot.executeTrade = async function(...args) {
      const result = await originalExecuteTrade(...args);
      const failureContext = {
        phase: 'entry',
        source: 'bot.executeTrade',
        orderId: null,
        action: null,
      };

      try {
        const [decision, confidenceData, price, indicators, patterns] = args;
        failureContext.action = decision?.action || null;
        const entryAction = entryActionOrNull(decision?.action);

        if (entryAction) {
          const resultOrderId = nonEmptyStringOrNull(result?.orderId);
          if (
            result?.success !== true
            || result?.orderAccepted !== true
            || result?.stateMutationSucceeded !== true
            || !resultOrderId
          ) {
            if (result?.success === true || result?.orderAccepted === true || result?.stateMutationSucceeded === true) {
              throw new Error(`Entry ${entryAction} execution result missing confirmed orderId/state mutation; refusing journal capture`);
            }
            return result;
          }

          const stateManager = bot.stateManager;
          const activeTrades = stateManager?.get('activeTrades') || new Map();
          const lastTrade = findActiveTradeByOrderId(activeTrades, resultOrderId);
          if (!lastTrade) {
            throw new Error(`Entry ${resultOrderId} succeeded but is missing from StateManager activeTrades; refusing journal capture`);
          }
          failureContext.orderId = resultOrderId;
          const regime = bot.regimeDetector?.detectRegime?.(bot.priceHistory);
          const sizeUsd = Number(lastTrade.sizeUsd ?? lastTrade.usdValue);
          if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) {
            throw new Error(`Entry ${resultOrderId} missing explicit USD size (sizeUsd/usdValue); refusing to infer from ambiguous size`);
          }
          const entryData = {
            orderId: resultOrderId,
            direction: entryAction,
            entryPrice: lastTrade.entryPrice || price,
            size: sizeUsd,
            usdValue: sizeUsd,
            confidence: confidenceData?.totalConfidence || decision.confidence || 0,
            regime: regime?.currentRegime || 'unknown',
            patterns: lastTrade.patterns || patterns || [],
            indicators: {
              rsi: indicators?.rsi || 0,
              macd: indicators?.macd?.macd || indicators?.macd || 0,
              trend: indicators?.trend || 'unknown',
              volatility: indicators?.volatility || 0
            },
            fees: 0
          };

          // Record in journal
          const journalEntry = journal.recordEntry(entryData);
          if (!journalEntry) {
            TradeJournalBridge.prototype._recordVisibilityFailure.call(bridge, 'trade_entry_journal_refused', {
              ...failureContext,
              orderId: entryData.orderId,
              message: 'TradeJournal.recordEntry returned null',
              context: { entry: compactTradeRecord(entryData) },
            });
          }

          // Capture candle context for replay
          const replayEntry = replay.captureEntry(entryData.orderId, {
            price: entryData.entryPrice,
            direction: entryData.direction,
            confidence: entryData.confidence,
            regime: entryData.regime,
            patterns: entryData.patterns,
            indicators: entryData.indicators
          }, bot.priceHistory || []);
          if (!replayEntry) {
            TradeJournalBridge.prototype._recordVisibilityFailure.call(bridge, 'trade_entry_replay_missing', {
              ...failureContext,
              orderId: entryData.orderId,
              message: 'TradeReplayCapture.captureEntry returned null',
              context: {
                entry: compactTradeRecord(entryData),
                priceHistoryLength: Array.isArray(bot.priceHistory) ? bot.priceHistory.length : null,
              },
            });
          }
        }
      } catch (err) {
        console.warn(`[TradeJournalBridge] Entry recording failed (non-critical): ${err.message}`);
        TradeJournalBridge.prototype._recordVisibilityFailure.call(bridge, 'trade_entry_recording_exception', {
          ...failureContext,
          message: errorMessageOrNull(err),
        });
      }

      return result;
    };

    // ── Intercept trade EXITS ───────────────────────────────────────
    const wrapLogSink = (owner, key, label) => {
      if (!owner || typeof owner[key] !== 'function') return false;
      if (owner[key]._tradeJournalBridgeWrapped === true) return false;

      const originalLogTrade = owner[key];
      owner[key] = async function(exitRecord) {
        try {
          return await originalLogTrade.call(this, exitRecord);
        } finally {
          bridge._recordTradeLogClose(exitRecord, label);
        }
      };
      owner[key]._tradeJournalBridgeWrapped = true;
      return true;
    };

    wrapLogSink(bot, 'logTrade', 'bot.logTrade');
    wrapLogSink(bot.orderExecutor?.ctx, 'logTrade', 'orderExecutor.ctx.logTrade');
  }

  _recordTradeLogClose(exitRecord, source = 'logTrade') {
    if (!isCloseLogRecord(exitRecord)) return false;

    const normalized = normalizeClosedTradeRecord(exitRecord);
    if (!normalized.ok) {
      console.warn(`[TradeJournalBridge] Refusing closed-trade replay from ${source}; missing field(s): ${normalized.missing.join(', ')}`);
      TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'closed_trade_record_incomplete', {
        phase: 'exit',
        source,
        orderId: normalized.data.orderId || nonEmptyStringOrNull(exitRecord?.orderId) || nonEmptyStringOrNull(exitRecord?.id) || nonEmptyStringOrNull(exitRecord?.tradeId),
        action: exitActionOrNull(exitRecord, normalized.data),
        missing: normalized.missing,
        message: `Closed trade record missing field(s): ${normalized.missing.join(', ')}`,
        context: { exitRecord: compactTradeRecord(exitRecord) },
      });
      return false;
    }

    const stateManager = this.bot.stateManager;
    const data = normalized.data;
    const balance = data.balance ?? finiteNumberOrNull(stateManager?.get?.('balance'));
    const closeKey = closedTradeLogKey(data);
    this._closedTradeLogKeySet ??= new Set();
    this._closedTradeLogKeys ??= [];
    if (this._closedTradeLogKeySet.has(closeKey)) {
      console.warn(`[TradeJournalBridge] Duplicate closed-trade log ignored from ${source}: ${data.orderId}`);
      return false;
    }

    try {
      const journalExit = this.journal.recordExit({
        orderId: data.orderId,
        exitPrice: data.exitPrice,
        reason: data.reason,
        pnl: data.pnl,
        fees: 0,
        maxProfit: data.maxProfit,
        holdTime: data.holdTime,
        balance,
        direction: data.direction,
        entryPrice: data.entryPrice,
        size: data.size
      });
      if (!journalExit) {
        TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'trade_exit_journal_refused', {
          phase: 'exit',
          source,
          orderId: data.orderId,
          action: exitActionOrNull(exitRecord, data),
          message: 'TradeJournal.recordExit returned null',
          context: { exitRecord: compactTradeRecord(exitRecord) },
        });
      }

      const replayPath = this.replay.captureExit(data.orderId, {
        price: data.exitPrice,
        exitPrice: data.exitPrice,
        entryPrice: data.entryPrice,
        reason: data.reason,
        pnl: data.pnl,
        pnlPercent: data.pnlPercent,
        holdTime: data.holdTime,
        direction: data.direction,
        size: data.size
      }, this.bot.priceHistory || []);
      if (!replayPath) {
        TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'trade_exit_replay_missing', {
          phase: 'exit',
          source,
          orderId: data.orderId,
          action: exitActionOrNull(exitRecord, data),
          message: 'TradeReplayCapture.captureExit returned null',
          context: {
            exitRecord: compactTradeRecord(exitRecord),
            priceHistoryLength: Array.isArray(this.bot.priceHistory) ? this.bot.priceHistory.length : null,
          },
        });
      }

      this._pushTradeClosedNotification(data.orderId, data, replayPath, { journalRecorded: !!journalExit });
      this._closedTradeLogKeySet.add(closeKey);
      this._closedTradeLogKeys.push(closeKey);
      if (this._closedTradeLogKeys.length > 500) {
        const expired = this._closedTradeLogKeys.shift();
        this._closedTradeLogKeySet.delete(expired);
      }
      return true;
    } catch (err) {
      console.warn(`[TradeJournalBridge] Exit recording failed (non-critical): ${err.message}`);
      TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'trade_exit_recording_exception', {
        phase: 'exit',
        source,
        orderId: data.orderId,
        action: exitActionOrNull(exitRecord, data),
        message: errorMessageOrNull(err),
        context: { exitRecord: compactTradeRecord(exitRecord) },
      });
      return false;
    }
  }

  _recordVisibilityFailure(eventType, details = {}) {
    const timestamp = new Date().toISOString();
    const scope = this.journal?.scope || null;
    const filepath = this.visibilityFailurePath
      || (this.journal?.paths?.dir ? path.join(this.journal.paths.dir, 'trade-visibility-failures.jsonl') : null);
    const fallbackPath = this.visibilityFailureFallbackPath
      || path.join(process.cwd(), 'data', 'runtime-audit', 'trade-visibility-failures-fallback.jsonl');
    const record = {
      type: 'trade_visibility_failure',
      eventType: String(eventType || 'trade_visibility_failure'),
      timestamp,
      phase: nonEmptyStringOrNull(details.phase),
      source: nonEmptyStringOrNull(details.source),
      orderId: nonEmptyStringOrNull(details.orderId),
      action: nonEmptyStringOrNull(details.action),
      missing: Array.isArray(details.missing) ? details.missing.map(String) : [],
      message: nonEmptyStringOrNull(details.message),
      scope,
      context: details.context && typeof details.context === 'object' ? details.context : {},
      visibilityLedgerPath: filepath,
      visibilityLedgerPersisted: false,
      visibilityLedgerError: null,
      visibilityFallbackPath: fallbackPath,
      visibilityFallbackPersisted: false,
      visibilityFallbackError: null,
      visibilityAllPersistenceFailed: false,
      visibilityTradingPauseAttempted: false,
      visibilityTradingPauseConfirmed: false,
      visibilityTradingPauseReason: null,
      visibilityTradingPauseError: null,
      visibilityDashboardDelivered: false,
      visibilityDashboardQueued: false,
    };

    if (filepath) {
      try {
        fs.mkdirSync(path.dirname(filepath), { recursive: true });
        record.visibilityLedgerPersisted = true;
        fs.appendFileSync(filepath, `${JSON.stringify(record)}\n`, 'utf8');
      } catch (err) {
        record.visibilityLedgerPersisted = false;
        record.visibilityLedgerError = errorMessageOrNull(err);
        console.error(`[TradeJournalBridge] Failed to append trade visibility failure ledger: ${err.message}`);
        const fallbackPersisted = TradeJournalBridge.prototype._writeVisibilityFailureFallback.call(this, record);
        record.visibilityAllPersistenceFailed = fallbackPersisted !== true;
      }
    } else {
      record.visibilityLedgerError = 'missing scoped visibility failure path';
      console.error('[TradeJournalBridge] Trade visibility failure has no scoped ledger path');
      const fallbackPersisted = TradeJournalBridge.prototype._writeVisibilityFailureFallback.call(this, record);
      record.visibilityAllPersistenceFailed = fallbackPersisted !== true;
    }

    if (record.visibilityAllPersistenceFailed) {
      TradeJournalBridge.prototype._pauseTradingAfterVisibilityPersistenceFailure.call(this, record);
    }

    TradeJournalBridge.prototype._sendVisibilityFailure.call(this, record);
    return record;
  }

  _pauseTradingAfterVisibilityPersistenceFailure(record) {
    const stateManager = this.bot?.stateManager;
    const reason = `Trade visibility failure could not be persisted: eventType=${record.eventType || 'unknown'} orderId=${record.orderId || 'unknown'}`;
    record.visibilityTradingPauseReason = reason;

    if (!stateManager || typeof stateManager.pauseTrading !== 'function') {
      record.visibilityTradingPauseError = 'StateManager.pauseTrading unavailable';
      console.error(`[TradeJournalBridge] ${record.visibilityTradingPauseError}; ${reason}`);
      return record;
    }

    record.visibilityTradingPauseAttempted = true;
    try {
      const pauseResult = stateManager.pauseTrading(reason, {
        source: 'TradeJournalBridge.visibility',
        recoverable: false,
        scope: record.scope || undefined,
      });
      if (pauseResult && typeof pauseResult.catch === 'function') {
        pauseResult.catch((err) => {
          console.error(`[TradeJournalBridge] Visibility failure pause rejected: ${err.message}`);
        });
      }
      record.visibilityTradingPauseConfirmed =
        (typeof stateManager.get === 'function' && stateManager.get('isTrading') === false)
        || stateManager.state?.isTrading === false;
      if (!record.visibilityTradingPauseConfirmed) {
        console.error(`[TradeJournalBridge] Visibility failure pause was not confirmed immediately; ${reason}`);
      }
    } catch (err) {
      record.visibilityTradingPauseError = errorMessageOrNull(err);
      console.error(`[TradeJournalBridge] Visibility failure pause failed: ${record.visibilityTradingPauseError}`);
    }
    return record;
  }

  _sendVisibilityFailure(record) {
    const payload = {
      type: 'trade_visibility_error',
      data: record
    };
    const send = typeof this._send === 'function'
      ? this._send
      : TradeJournalBridge.prototype._send;
    const delivered = send.call(this, payload);
    record.visibilityDashboardDelivered = delivered === true;
    if (!record.visibilityDashboardDelivered) {
      TradeJournalBridge.prototype._queueVisibilityFailure.call(this, payload);
      record.visibilityDashboardQueued = true;
    }
    return record.visibilityDashboardDelivered;
  }

  _queueVisibilityFailure(payload) {
    if (!Array.isArray(this._pendingVisibilityErrors)) this._pendingVisibilityErrors = [];
    const maxPending = Math.max(1, Math.floor(this._maxPendingVisibilityErrors || 50));
    this._pendingVisibilityErrors.push(payload);
    if (this._pendingVisibilityErrors.length <= maxPending) {
      return;
    }

    const overflowIndex = this._pendingVisibilityErrors.findIndex(item => item?.data?.eventType === 'trade_visibility_dashboard_queue_overflow');
    const overflowPayload = overflowIndex >= 0
      ? this._pendingVisibilityErrors.splice(overflowIndex, 1)[0]
      : TradeJournalBridge.prototype._createVisibilityQueueOverflowPayload.call(this);

    const keepIndividualSlots = Math.max(0, maxPending - 1);
    const dropCount = Math.max(0, this._pendingVisibilityErrors.length - keepIndividualSlots);
    const droppedPayloads = this._pendingVisibilityErrors.splice(0, dropCount);
    const overflowData = overflowPayload.data;
    const context = overflowData.context;
    const droppedOrderIds = droppedPayloads
      .map(item => nonEmptyStringOrNull(item?.data?.orderId))
      .filter(Boolean);
    const droppedEventTypes = droppedPayloads
      .map(item => nonEmptyStringOrNull(item?.data?.eventType))
      .filter(Boolean);

    overflowData.timestamp = new Date().toISOString();
    overflowData.visibilityDashboardDelivered = false;
    overflowData.visibilityDashboardQueued = true;
    context.droppedCount += droppedPayloads.length;
    context.droppedOrderIds = [...context.droppedOrderIds, ...droppedOrderIds].slice(-50);
    context.droppedEventTypes = [...context.droppedEventTypes, ...droppedEventTypes].slice(-50);
    TradeJournalBridge.prototype._persistVisibilityQueueOverflow.call(this, overflowData);

    this._pendingVisibilityErrors.push(overflowPayload);
  }

  _createVisibilityQueueOverflowPayload() {
    const timestamp = new Date().toISOString();
    return {
      type: 'trade_visibility_error',
      data: {
        type: 'trade_visibility_failure',
        eventType: 'trade_visibility_dashboard_queue_overflow',
        timestamp,
        phase: 'dashboard',
        source: 'TradeJournalBridge._queueVisibilityFailure',
        orderId: null,
        action: null,
        missing: [],
        message: 'Dashboard visibility queue overflowed while disconnected; individual records remain in the scoped visibility ledger when persistence succeeded.',
        scope: this.journal?.scope || null,
        context: {
          droppedCount: 0,
          droppedOrderIds: [],
          droppedEventTypes: [],
          visibilityLedgerPath: this.visibilityFailurePath
            || (this.journal?.paths?.dir ? path.join(this.journal.paths.dir, 'trade-visibility-failures.jsonl') : null),
          visibilityFallbackPath: this.visibilityFailureFallbackPath
            || path.join(process.cwd(), 'data', 'runtime-audit', 'trade-visibility-failures-fallback.jsonl'),
        },
        visibilityDashboardDelivered: false,
        visibilityDashboardQueued: true,
        visibilityLedgerPath: null,
        visibilityLedgerPersisted: false,
        visibilityLedgerError: null,
        visibilityFallbackPath: null,
        visibilityFallbackPersisted: false,
        visibilityFallbackError: null,
      }
    };
  }

  _persistVisibilityQueueOverflow(record) {
    const filepath = this.visibilityFailurePath
      || (this.journal?.paths?.dir ? path.join(this.journal.paths.dir, 'trade-visibility-failures.jsonl') : null);
    const fallbackPath = this.visibilityFailureFallbackPath
      || path.join(process.cwd(), 'data', 'runtime-audit', 'trade-visibility-failures-fallback.jsonl');
    record.visibilityLedgerPath = filepath;
    record.visibilityLedgerPersisted = false;
    record.visibilityLedgerError = null;
    record.visibilityFallbackPath = fallbackPath;
    record.visibilityFallbackPersisted = false;
    record.visibilityFallbackError = null;

    if (filepath) {
      try {
        fs.mkdirSync(path.dirname(filepath), { recursive: true });
        record.visibilityLedgerPersisted = true;
        fs.appendFileSync(filepath, `${JSON.stringify(record)}\n`, 'utf8');
        return true;
      } catch (err) {
        record.visibilityLedgerPersisted = false;
        record.visibilityLedgerError = errorMessageOrNull(err);
        console.error(`[TradeJournalBridge] Failed to persist dashboard visibility overflow summary: ${err.message}`);
      }
    } else {
      record.visibilityLedgerError = 'missing scoped visibility failure path';
    }

    try {
      fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
      record.visibilityFallbackPersisted = true;
      fs.appendFileSync(fallbackPath, `${JSON.stringify(record)}\n`, 'utf8');
      return true;
    } catch (err) {
      record.visibilityFallbackPersisted = false;
      record.visibilityFallbackError = errorMessageOrNull(err);
      console.error(`[TradeJournalBridge] Failed to persist dashboard visibility overflow fallback: ${err.message}`);
      try {
        fs.writeSync(2, `[TRADE_VISIBILITY_QUEUE_OVERFLOW_UNPERSISTED] ${JSON.stringify(record)}\n`);
      } catch (_stderrErr) {
        // Last-resort visibility path failed; do not throw from dashboard queue bookkeeping.
      }
      return false;
    }
  }

  _flushPendingVisibilityErrors() {
    if (!Array.isArray(this._pendingVisibilityErrors) || this._pendingVisibilityErrors.length === 0) {
      return 0;
    }
    const pending = this._pendingVisibilityErrors;
    this._pendingVisibilityErrors = [];
    let deliveredCount = 0;
    for (const payload of pending) {
      const send = typeof this._send === 'function'
        ? this._send
        : TradeJournalBridge.prototype._send;
      const data = payload?.data;
      const previousDelivered = data?.visibilityDashboardDelivered;
      const previousQueued = data?.visibilityDashboardQueued;
      if (data) {
        data.visibilityDashboardDelivered = true;
        data.visibilityDashboardQueued = false;
      }
      if (send.call(this, payload)) {
        deliveredCount += 1;
      } else {
        if (data) {
          data.visibilityDashboardDelivered = previousDelivered;
          data.visibilityDashboardQueued = previousQueued;
        }
        this._pendingVisibilityErrors.push(payload);
      }
    }
    return deliveredCount;
  }

  _writeVisibilityFailureFallback(record) {
    const fallbackPath = record.visibilityFallbackPath
      || this.visibilityFailureFallbackPath
      || path.join(process.cwd(), 'data', 'runtime-audit', 'trade-visibility-failures-fallback.jsonl');
    try {
      fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
      record.visibilityFallbackPath = fallbackPath;
      record.visibilityFallbackPersisted = true;
      fs.appendFileSync(fallbackPath, `${JSON.stringify(record)}\n`, 'utf8');
      return true;
    } catch (err) {
      record.visibilityFallbackPersisted = false;
      record.visibilityFallbackError = errorMessageOrNull(err);
      record.visibilityAllPersistenceFailed = true;
      console.error(`[TradeJournalBridge] Failed to append trade visibility fallback ledger: ${err.message}`);
      try {
        fs.writeSync(2, `[TRADE_VISIBILITY_FAILURE_UNPERSISTED] ${JSON.stringify(record)}\n`);
      } catch (_stderrErr) {
        // Last-resort visibility path failed; do not throw after trade side effects.
      }
      return false;
    }
  }


  // ════════════════════════════════════════════════════════════════════════
  // TRADE CLOSED NOTIFICATION — Pushes "View Replay" to Dashboard
  // ════════════════════════════════════════════════════════════════════════

  _pushTradeClosedNotification(orderId, exitRecord, replayPath, options = {}) {
    const pnl = finiteNumberOrNull(exitRecord.pnl);
    const pnlPercent = finiteNumberOrNull(exitRecord.pnlPercent);
    const outcome = classifyReplayOutcome(pnl, pnlPercent);
    const replayAvailable = !!(replayPath && fs.existsSync(replayPath));
    this._send({
      type: 'trade_closed_replay',
      data: {
        orderId,
        direction: nonEmptyStringOrNull(exitRecord.direction),
        entryPrice: positiveNumberOrNull(exitRecord.entryPrice),
        exitPrice: positiveNumberOrNull(exitRecord.exitPrice),
        pnl,
        pnlPercent,
        outcome,
        reason: nonEmptyStringOrNull(exitRecord.reason),
        holdTime: nonNegativeNumberOrNull(exitRecord.holdTime),
        isWin: outcome === 'win',
        isLoss: outcome === 'loss',
        isBreakEven: outcome === 'flat',
        journalRecorded: options.journalRecorded === true ? true : (options.journalRecorded === false ? false : null),
        replayAvailable,
        replayUrl: replayAvailable ? `/replay?id=${orderId}` : null,
        timestamp: Date.now()
      }
    });

    // Fresh snapshot so dashboard updates immediately
    this._sendJournalSnapshot();
    console.log(`Trade closed replay ${replayPath ? 'saved' : 'skipped'}; notification pushed`);
  }


  // ════════════════════════════════════════════════════════════════════════
  // DASHBOARD WEBSOCKET MESSAGE HANDLING
  // ════════════════════════════════════════════════════════════════════════

  _wireDashboardMessages() {
    const bridge = this;

    this.bot._journalMessageHandler = (msg) => {
      try {
        switch (msg.type) {
          case 'request_journal':         bridge._sendJournalSnapshot(); break;
          case 'request_journal_equity':  bridge._sendEquityCurve(); break;
          case 'request_journal_breakdowns': bridge._sendBreakdown(msg.dimension || 'regime'); break;
          case 'request_journal_calendar': bridge._sendCalendar(); break;
          case 'request_journal_export_csv': bridge._exportCSV(); break;
          case 'request_journal_export_report': bridge._exportReport(); break;
          case 'request_replay':          bridge._sendReplay(msg.orderId); break;
          case 'request_replay_list':     bridge._sendReplayList(msg.limit); break;
        }
      } catch (err) {
        console.warn(`[TradeJournalBridge] Handler error: ${err.message}`);
      }
    };

    this._tryDirectWsHook();
  }

  _tryDirectWsHook() {
    const bot = this.bot;
    const handler = bot._journalMessageHandler;

    if (this._dashboardHookTimer) clearInterval(this._dashboardHookTimer);
    this._dashboardHookTimer = setInterval(() => {
      const dashboardWs = bot.dashboardWs;
      if (!dashboardWs || dashboardWs.readyState !== 1) return;

      this._flushPendingVisibilityErrors();
      if (this._journalDashboardHookedSocket === dashboardWs) return;
      if (typeof dashboardWs.on !== 'function') {
        if (this._journalDashboardHookWarningSocket !== dashboardWs) {
          console.warn('[TradeJournalBridge] Dashboard WebSocket cannot register journal message handler; visibility errors will still flush through send()');
          this._journalDashboardHookWarningSocket = dashboardWs;
        }
        return;
      }

      TradeJournalBridge.prototype._attachJournalDashboardSocket.call(this, dashboardWs, handler);
      this._journalDashboardHookedSocket = dashboardWs;
      console.log('[TradeJournalBridge] Hooked into dashboard WebSocket');
    }, 2000);
  }

  _attachJournalDashboardSocket(dashboardWs, handler) {
    if (typeof dashboardWs.on !== 'function') {
      return false;
    }
    dashboardWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type && (msg.type.startsWith('request_journal') || msg.type.startsWith('request_replay'))) {
          handler(msg);
        }
      } catch { /* ignore */ }
    });
    return true;
  }


  // ════════════════════════════════════════════════════════════════════════
  // BROADCAST
  // ════════════════════════════════════════════════════════════════════════

  _wireBroadcastCycle() {
    this._broadcastTimer = setInterval(() => {
      TradeJournalBridge.prototype._flushPendingVisibilityErrors.call(this);
      if (this.journal.trades.length > 0) this._sendJournalSnapshot();
    }, 30000);
  }


  // ════════════════════════════════════════════════════════════════════════
  // SEND HELPERS
  // ════════════════════════════════════════════════════════════════════════

  _send(payload) {
    try {
      if (this.bot.dashboardWs && this.bot.dashboardWs.readyState === 1) {
        this.bot.dashboardWs.send(JSON.stringify(payload));
        if (payload?.type !== 'trade_visibility_error') {
          TradeJournalBridge.prototype._flushPendingVisibilityErrors.call(this);
        }
        return true;
      }
    } catch (err) {
      console.warn(`[TradeJournalBridge] Send failed: ${err.message}`);
    }
    return false;
  }

  _sendJournalSnapshot() {
    this._send({ type: 'journal_snapshot', data: this.journal.getSnapshot() });
  }

  _sendEquityCurve() {
    this._send({ type: 'journal_equity', data: this.journal.getEquityCurve(500) });
  }

  _sendBreakdown(dimension) {
    this._send({ type: 'journal_breakdown', data: this.journal.getPerformanceBreakdown(dimension), dimension });
  }

  _sendCalendar() {
    this._send({ type: 'journal_calendar', data: this.journal.getDailySummaries(90) });
  }

  _sendReplay(orderId) {
    if (!orderId) return;
    const data = this.replay.loadReplay(orderId);
    this._send(data ? { type: 'replay_data', data } : { type: 'replay_not_found', orderId });
  }

  _sendReplayList(limit = 50) {
    this._send({ type: 'replay_list', data: this.replay.listReplays(limit) });
  }

  _exportCSV() {
    try {
      const filepath = this.journal.exportCSV();
      this._send({ type: 'journal_export_complete', format: 'csv', path: filepath });
    } catch (err) { console.error(`[TradeJournalBridge] CSV export failed: ${err.message}`); }
  }

  _exportReport() {
    try {
      const report = this.journal.exportReport();
      const filepath = path.join(process.cwd(), 'data', 'journal', 'exports',
        `ogzprime-report-${new Date().toISOString().split('T')[0]}.json`);
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
      const { writeJsonAtomic } = require('./AtomicWrite');
      writeJsonAtomic(filepath, report);
      this._send({ type: 'journal_export_complete', format: 'json', path: filepath });
    } catch (err) { console.error(`[TradeJournalBridge] Report export failed: ${err.message}`); }
  }


  // ════════════════════════════════════════════════════════════════════════
  // HTTP ROUTES — Register with Express or raw HTTP
  // ════════════════════════════════════════════════════════════════════════

  registerRoutes(app) {
    const replay = this.replay;
    const journal = this.journal;

    app.get('/replay', (req, res) => res.sendFile(path.join(process.cwd(), 'public', 'trade-replay.html')));
    app.get('/journal', (req, res) => res.sendFile(path.join(process.cwd(), 'public', 'trade-journal.html')));

    app.get('/api/replay/adjacent', (req, res) => {
      const all = replay.listReplays(1000);
      const idx = all.findIndex(r => r.orderId === req.query.id);
      const target = idx + (parseInt(req.query.direction) || 1);
      res.json({ orderId: (target >= 0 && target < all.length) ? all[target].orderId : null });
    });

    app.get('/api/replay/:id', (req, res) => {
      const data = replay.loadReplay(req.params.id);
      data ? res.json(data) : res.status(404).json({ error: 'Replay not found' });
    });

    app.get('/api/replays', (req, res) => res.json(replay.listReplays(parseInt(req.query.limit) || 50)));
    app.get('/api/journal/stats', (req, res) => res.json(journal.getStats()));
    app.get('/api/journal/equity', (req, res) => res.json(journal.getEquityCurve(parseInt(req.query.limit) || 500)));
    app.get('/api/journal/breakdown/:dim', (req, res) => res.json(journal.getPerformanceBreakdown(req.params.dim)));

    console.log('[TradeJournalBridge] HTTP routes registered (/journal, /replay, /api/*)');
  }

  /** Raw HTTP handler for non-Express servers */
  handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sendFile = (filePath) => {
      if (fs.existsSync(filePath)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync(filePath));
        return true;
      }
      return false;
    };
    const sendJSON = (data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return true;
    };

    if (url.pathname === '/journal') return sendFile(path.join(process.cwd(), 'public', 'trade-journal.html'));
    if (url.pathname === '/replay') return sendFile(path.join(process.cwd(), 'public', 'trade-replay.html'));

    if (url.pathname.startsWith('/api/replay/adjacent')) {
      const all = this.replay.listReplays(1000);
      const idx = all.findIndex(r => r.orderId === url.searchParams.get('id'));
      const target = idx + (parseInt(url.searchParams.get('direction')) || 1);
      return sendJSON({ orderId: (target >= 0 && target < all.length) ? all[target].orderId : null });
    }
    if (url.pathname.startsWith('/api/replay/')) {
      const id = url.pathname.split('/').pop();
      const data = this.replay.loadReplay(id);
      return data ? sendJSON(data) : sendJSON({ error: 'Not found' }, 404);
    }
    if (url.pathname === '/api/replays') return sendJSON(this.replay.listReplays(parseInt(url.searchParams.get('limit')) || 50));
    if (url.pathname === '/api/journal/stats') return sendJSON(this.journal.getStats());
    if (url.pathname === '/api/journal/equity') return sendJSON(this.journal.getEquityCurve(500));
    if (url.pathname.startsWith('/api/journal/breakdown/')) {
      const dim = url.pathname.split('/').pop();
      return sendJSON(this.journal.getPerformanceBreakdown(dim));
    }

    return false;
  }


  // ════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ════════════════════════════════════════════════════════════════════════

  destroy() {
    if (this._broadcastTimer) clearInterval(this._broadcastTimer);
    if (this._dashboardHookTimer) clearInterval(this._dashboardHookTimer);
    this.journal.destroy();
    console.log('[TradeJournalBridge] Destroyed');
  }
}

module.exports = { TradeJournalBridge, TradeJournal, TradeReplayCapture, resolveJournalScope, resolveJournalDataDir, resolveReplayDir };
