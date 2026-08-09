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
const ConfigLoader = require('../foundation/ConfigLoader');  // CHANGE 2026-02-28: Centralized config
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

function activeTradeEntries(activeTrades) {
  if (activeTrades instanceof Map) {
    return Array.from(activeTrades.entries()).map(([key, trade]) => ({ key, trade }));
  }
  if (Array.isArray(activeTrades)) {
    return activeTrades.map((entry, index) => {
      if (Array.isArray(entry)) return { key: entry[0], trade: entry[1] };
      return { key: index, trade: entry };
    });
  }
  if (activeTrades && typeof activeTrades === 'object') {
    return Object.entries(activeTrades).map(([key, trade]) => ({ key, trade }));
  }
  return [];
}

function indicatorObjectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
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

function activeTradeProvenance(activeTrade) {
  const decisionLedger = jsonCloneOrNull(activeTrade?.decisionLedger);
  const orchestratorDecision = jsonCloneOrNull(decisionLedger?.orchestratorDecision || activeTrade?.orchestratorDecision);
  const strategySignals = Array.isArray(decisionLedger?.strategySignals)
    ? jsonCloneOrNull(decisionLedger.strategySignals)
    : (Array.isArray(activeTrade?.strategySignals) ? jsonCloneOrNull(activeTrade.strategySignals) : null);
  const winnerStrategy = firstNonEmptyString(
    activeTrade?.winnerStrategy,
    orchestratorDecision?.winnerStrategy,
    activeTrade?.entryStrategy,
    activeTrade?.strategy
  );
  const entryStrategy = firstNonEmptyString(
    activeTrade?.entryStrategy,
    activeTrade?.strategy,
    winnerStrategy
  );
  const competingStrategies = Array.isArray(orchestratorDecision?.competingStrategies)
    ? jsonCloneOrNull(orchestratorDecision.competingStrategies)
    : null;

  return {
    entryStrategy,
    winnerStrategy,
    strategy: entryStrategy,
    signalId: firstNonEmptyString(activeTrade?.signalId, decisionLedger?.signalId),
    decisionId: firstNonEmptyString(activeTrade?.decisionId, decisionLedger?.decisionId),
    traceId: firstNonEmptyString(activeTrade?.traceId, decisionLedger?.traceId),
    executionRoute: firstNonEmptyString(activeTrade?.executionRoute, decisionLedger?.executionRoute),
    executionVenue: firstNonEmptyString(activeTrade?.executionVenue, decisionLedger?.executionVenue),
    marketDataBrokerId: firstNonEmptyString(activeTrade?.marketDataBrokerId, activeTrade?.brokerId, decisionLedger?.marketDataBrokerId),
    signalBasis: firstNonEmptyString(activeTrade?.signalBasis, orchestratorDecision?.signalBasis),
    crossoverCount: finiteNumberOrNull(activeTrade?.crossoverCount ?? orchestratorDecision?.crossoverCount),
    decisionLedger,
    strategySignals,
    orchestratorDecision,
    competingStrategies,
    confluence: jsonCloneOrNull(decisionLedger?.confluence || activeTrade?.confluence),
    positionSizing: jsonCloneOrNull(decisionLedger?.positionSizing || activeTrade?.positionSizing),
    exitContract: jsonCloneOrNull(decisionLedger?.exitContract || activeTrade?.exitContract),
    riskGates: jsonCloneOrNull(decisionLedger?.riskGates || activeTrade?.riskGates),
  };
}

function sourceBackedEntryFromActiveTrade(activeTrade, expectedOrderId) {
  const missing = [];
  const orderId = nonEmptyStringOrNull(activeTrade?.orderId) || nonEmptyStringOrNull(activeTrade?.id);
  const symbol = nonEmptyStringOrNull(activeTrade?.symbol);
  const action = entryActionOrNull(activeTrade?.action) || entryActionOrNull(activeTrade?.type);
  const entryPrice = positiveNumberOrNull(activeTrade?.entryPrice);
  const sizeUsd = positiveNumberOrNull(activeTrade?.sizeUsd ?? activeTrade?.usdValue);
  const confidence = finiteNumberOrNull(activeTrade?.confidence);
  const fees = nonNegativeNumberOrNull(activeTrade?.entryFee ?? activeTrade?.fees);
  const timestamp = nonNegativeNumberOrNull(activeTrade?.timestamp);
  const expected = nonEmptyStringOrNull(expectedOrderId);
  const provenance = activeTradeProvenance(activeTrade);

  if (!orderId) missing.push('activeTrade.orderId');
  if (expected && orderId && orderId !== expected) missing.push('activeTrade.orderId');
  if (!symbol) missing.push('activeTrade.symbol');
  if (!action) missing.push('activeTrade.action');
  if (entryPrice == null) missing.push('entryPrice');
  if (sizeUsd == null) missing.push('sizeUsd');
  if (confidence == null) missing.push('confidence');
  if (fees == null) missing.push('entryFee');
  if (timestamp == null) missing.push('timestamp');
  if (!provenance.entryStrategy) missing.push('activeTrade.entryStrategy');
  if (!provenance.traceId) missing.push('activeTrade.traceId');
  if (!provenance.signalId) missing.push('activeTrade.signalId');
  if (!provenance.decisionId) missing.push('activeTrade.decisionId');

  return {
    ok: missing.length === 0,
    missing,
    data: {
      orderId: expected || orderId,
      symbol,
      direction: action,
      entryPrice,
      size: sizeUsd,
      usdValue: sizeUsd,
      confidence,
      regime: nonEmptyStringOrNull(activeTrade?.regimeAtEntry) || nonEmptyStringOrNull(activeTrade?.regime),
      patterns: Array.isArray(activeTrade?.patterns) ? activeTrade.patterns : [],
      indicators: indicatorObjectOrEmpty(activeTrade?.entryIndicators || activeTrade?.indicators),
      fees,
      timestamp,
      ...provenance,
    },
  };
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
  const symbol = nonEmptyStringOrNull(exitRecord?.symbol);

  if (!orderId) missing.push('orderId');
  if (!symbol) missing.push('symbol');
  if (!direction) missing.push('direction');
  if (entryPrice == null) missing.push('entryPrice');
  if (exitPrice == null) missing.push('exitPrice');
  if (pnl == null) missing.push('pnl');
  if (holdTime == null) missing.push('holdTime');
  if (!reason) missing.push('reason');
  if (size == null) missing.push('size');

  return {
    ok: missing.length === 0,
    missing,
    data: {
      orderId,
      symbol,
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
    data.size,
  ].join('|');
}

function exitActionOrNull(exitRecord, normalizedData = {}) {
  const explicitAction = nonEmptyStringOrNull(exitRecord?.action);
  if (explicitAction) return explicitAction.toUpperCase();

  const explicitType = nonEmptyStringOrNull(exitRecord?.type);
  if (explicitType && explicitType.toUpperCase() !== 'EXIT') return explicitType.toUpperCase();

  const direction = nonEmptyStringOrNull(normalizedData.direction || exitRecord?.direction)?.toLowerCase();
  if (direction === 'buy' || direction === 'long') return 'SELL';
  if (direction === 'sell' || direction === 'sell_short' || direction === 'short') return 'COVER';
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
    entryFee: finiteNumberOrNull(record.entryFee),
    fees: finiteNumberOrNull(record.fees),
    timestamp: finiteNumberOrNull(record.timestamp),
    confidence: finiteNumberOrNull(record.confidence),
    pnl: finiteNumberOrNull(record.pnl ?? record.netPnl ?? record.pnlDollars),
    pnlPercent: finiteNumberOrNull(record.pnlPercent ?? record.profitLossPercent),
    reason: nonEmptyStringOrNull(record.exitReason) || nonEmptyStringOrNull(record.reason),
    holdTime: nonNegativeNumberOrNull(record.holdTime ?? record.holdDuration ?? record.holdTimeMs),
    size: finiteNumberOrNull(record.size ?? record.sizeUsd ?? record.usdValue),
  };
}

function uniqueNonEmptyStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = nonEmptyStringOrNull(value);
    if (!normalized) continue;
    const key = normalized.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function configuredJournalSymbols(bot) {
  const symbols = [
    bot?.config?.tradingPair,
    bot?.tradingPair,
    ...(Array.isArray(bot?.ttpCutoffSymbols) ? bot.ttpCutoffSymbols : []),
  ];
  if (bot?.symbolContexts instanceof Map) {
    symbols.push(...bot.symbolContexts.keys());
  }
  return uniqueNonEmptyStrings(symbols);
}

function normalizeBrokerPositionForJournal(position) {
  const symbol = nonEmptyStringOrNull(position?.symbol);
  if (!symbol) return null;
  return {
    symbol,
    side: nonEmptyStringOrNull(position?.side),
    size: finiteNumberOrNull(position?.size ?? position?.qty ?? position?.quantity),
    broker: nonEmptyStringOrNull(position?.broker),
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

function resolveJournalScopeForSymbol(bot, symbol) {
  return requirePatternScope({
    symbol,
    brokerId: bot?.config?.brokerId,
    accountId: bot?.config?.accountId,
    assetClass: bot?.config?.assetClass,
    executionMode: bot?.config?.executionMode,
    timeframe: bot?.config?.timeframe || bot?.candleTimeframe,
  }, 'TradeJournalBridge.symbolDataDir');
}

function resolveReplayPriceHistory(bot, symbol) {
  const tradeSymbol = nonEmptyStringOrNull(symbol);
  if (!tradeSymbol) {
    return { ok: false, reason: 'missing_symbol', source: null, priceHistory: null };
  }

  const symbolContexts = bot?.symbolContexts;
  if (symbolContexts instanceof Map) {
    const symCtx = symbolContexts.get(tradeSymbol);
    const scopedHistory = Array.isArray(symCtx?.priceHistory) ? symCtx.priceHistory : null;
    if (scopedHistory && scopedHistory.length > 0) {
      return { ok: true, reason: null, source: 'symbol_context', symbol: tradeSymbol, priceHistory: scopedHistory };
    }
    return {
      ok: false,
      reason: symCtx ? 'symbol_price_history_empty' : 'symbol_context_missing',
      source: 'symbol_context',
      symbol: tradeSymbol,
      availableSymbols: Array.from(symbolContexts.keys()),
      priceHistory: null,
    };
  }

  const configuredSymbol = firstNonEmptyString(bot?.config?.tradingPair, bot?.tradingPair);
  const globalHistory = Array.isArray(bot?.priceHistory) ? bot.priceHistory : null;
  if ((!configuredSymbol || configuredSymbol === tradeSymbol) && globalHistory) {
    return { ok: true, reason: null, source: 'single_symbol_global', symbol: tradeSymbol, priceHistory: globalHistory };
  }

  return {
    ok: false,
    reason: configuredSymbol === tradeSymbol ? 'single_symbol_global_price_history_empty' : 'symbol_contexts_unavailable',
    source: 'single_symbol_global',
    symbol: tradeSymbol,
    configuredSymbol,
    priceHistory: null,
  };
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
    const _rawStartingBalance = config.startingBalance ?? ConfigLoader.get('startingBalance');
    this._journalBridgeConfig = { ...config };
    this._journalStartingBalance = Number(_rawStartingBalance);
    this._journalBundles = new Map();
    const journalScope = resolveJournalScope(this.bot);
    const primaryBundle = this._createJournalBundle(journalScope);
    this.journal = primaryBundle.journal;
    this.replay = primaryBundle.replay;
    this.visibilityFailurePath = primaryBundle.visibilityFailurePath;
    this.visibilityFailureFallbackPath = path.join(process.cwd(), 'data', 'runtime-audit', 'trade-visibility-failures-fallback.jsonl');
    this._pendingVisibilityErrors = [];
    this._maxPendingVisibilityErrors = 50;
    this._closedTradeLogKeySet = new Set();
    this._closedTradeLogKeys = [];
    this._preloadConfiguredJournalBundles();
    this._reconcileOpenStateTrades();
    this._startupJournalReconciliationPromise = this._reconcileJournalOpenTradesWithAuthoritativeState()
      .catch(err => {
        console.warn(`[TradeJournalBridge] Startup journal-open reconciliation skipped: ${err.message}`);
      });

    // ── Wire everything ─────────────────────────────────────────────
    this._wireTradeEvents();
    this._wireDashboardMessages();
    this._wireBroadcastCycle();

    console.log('TradeJournalBridge v2: Journal + Replay wired into bot');
  }

  _createJournalBundle(scope) {
    const journalDataDir = resolveJournalDataDir(this.bot, this._journalBridgeConfig, scope);
    const journal = new TradeJournal({
      ...this._journalBridgeConfig,
      dataDir: journalDataDir,
      scope,
      startingBalance: this._journalStartingBalance,
    });
    const replay = new TradeReplayCapture({
      replayDir: resolveReplayDir(journalDataDir, this._journalBridgeConfig),
      candlesBefore: 60,
      candlesAfter: 30
    });
    const bundle = {
      scope,
      journal,
      replay,
      visibilityFailurePath: path.join(journalDataDir, 'trade-visibility-failures.jsonl'),
    };
    this._journalBundles.set(scope.scopeKey, bundle);
    return bundle;
  }

  _preloadConfiguredJournalBundles() {
    for (const symbol of configuredJournalSymbols(this.bot)) {
      try {
        const scope = resolveJournalScopeForSymbol(this.bot, symbol);
        if (!this._journalBundles.has(scope.scopeKey)) {
          this._createJournalBundle(scope);
        }
      } catch (err) {
        console.warn(`[TradeJournalBridge] Skipping configured journal bundle for ${symbol}: ${err.message}`);
      }
    }
  }

  _getJournalBundleForEntry(entryData) {
    if (!this._journalBundles) {
      return { journal: this.journal, replay: this.replay, scope: this.journal?.scope || null };
    }

    const symbol = nonEmptyStringOrNull(entryData?.symbol);
    if (!symbol) {
      throw new Error(`Entry ${entryData?.orderId || 'unknown'} missing activeTrade.symbol; refusing boot-scope journal attribution`);
    }

    const scope = resolveJournalScopeForSymbol(this.bot, symbol);
    const existing = this._journalBundles.get(scope.scopeKey);
    return existing || this._createJournalBundle(scope);
  }

  _getJournalBundleForOrderId(orderId) {
    const target = nonEmptyStringOrNull(orderId);
    if (!target || !this._journalBundles) {
      return { journal: this.journal, replay: this.replay, scope: this.journal?.scope || null };
    }

    for (const bundle of this._journalBundles.values()) {
      if (bundle.journal?.openTrades?.has?.(target)) return bundle;
      if (Array.isArray(bundle.journal?.trades) && bundle.journal.trades.some(trade => trade.orderId === target)) {
        return bundle;
      }
    }
    return null;
  }

  _allJournalBundles() {
    return this._journalBundles ? Array.from(this._journalBundles.values()) : [{ journal: this.journal, replay: this.replay, scope: this.journal?.scope || null }];
  }


  // ════════════════════════════════════════════════════════════════════════
  // TRADE EVENT WIRING
  // ════════════════════════════════════════════════════════════════════════

  _wireTradeEvents() {
    const bot = this.bot;
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
        const [decision] = args;
        failureContext.action = decision?.action || null;
        const decisionAction = nonEmptyStringOrNull(decision?.action)?.toUpperCase() || null;
        const decisionEntryAction = entryActionOrNull(decisionAction);
        const decisionExitAction = decisionAction === 'SELL' || decisionAction === 'COVER';
        const resultOrderId = nonEmptyStringOrNull(result?.orderId);
        const confirmedEntrySideEffect = result?.success === true
          && result?.orderAccepted === true
          && result?.stateMutationSucceeded === true
          && resultOrderId;
        const stateManager = bot.stateManager;
        const activeTrades = stateManager?.get('activeTrades') || new Map();
        const activeTrade = resultOrderId ? findActiveTradeByOrderId(activeTrades, resultOrderId) : null;
        const activeTradeEntryAction = decisionExitAction ? null : (entryActionOrNull(activeTrade?.action) || entryActionOrNull(activeTrade?.type));
        const entryAction = activeTradeEntryAction || decisionEntryAction;

        if (entryAction) {
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

          if (!activeTrade) {
            throw new Error(`Entry ${resultOrderId} succeeded but is missing from StateManager activeTrades; refusing journal capture`);
          }
          if (decisionEntryAction && activeTradeEntryAction && decisionEntryAction !== activeTradeEntryAction) {
            throw new Error(`Entry ${resultOrderId} action mismatch: decision=${decisionEntryAction} activeTrade=${activeTradeEntryAction}`);
          }
          failureContext.orderId = resultOrderId;
          failureContext.action = entryAction;
          const normalizedEntry = sourceBackedEntryFromActiveTrade(activeTrade, resultOrderId);
          if (!normalizedEntry.ok) {
            TradeJournalBridge.prototype._recordVisibilityFailure.call(bridge, 'trade_entry_source_incomplete', {
              ...failureContext,
              orderId: resultOrderId,
              action: entryAction,
              missing: normalizedEntry.missing,
              message: `Entry ${resultOrderId} missing source-backed active trade field(s): ${normalizedEntry.missing.join(', ')}`,
              context: { activeTrade: compactTradeRecord(activeTrade) },
            });
            return result;
          }
          const entryData = normalizedEntry.data;

          const bundle = TradeJournalBridge.prototype._getJournalBundleForEntry.call(bridge, entryData);

          // Record in the symbol-scoped journal.
          const journalEntry = bundle.journal.recordEntry(entryData);
          if (!journalEntry) {
            TradeJournalBridge.prototype._recordVisibilityFailure.call(bridge, 'trade_entry_journal_refused', {
              ...failureContext,
              orderId: entryData.orderId,
              message: 'TradeJournal.recordEntry returned null',
              context: { entry: compactTradeRecord(entryData) },
            });
          }

          const replayPriceHistory = resolveReplayPriceHistory(bot, entryData.symbol);
          if (!replayPriceHistory.ok) {
            TradeJournalBridge.prototype._recordVisibilityFailure.call(bridge, 'trade_entry_replay_missing', {
              ...failureContext,
              orderId: entryData.orderId,
              message: `Trade replay entry skipped: ${replayPriceHistory.reason}`,
              context: {
                entry: compactTradeRecord(entryData),
                replayPriceHistory: replayPriceHistory,
              },
            });
          } else {
            // Capture candle context for replay from the trade symbol's price stream.
            const replayEntry = bundle.replay.captureEntry(entryData.orderId, {
              price: entryData.entryPrice,
              direction: entryData.direction,
              confidence: entryData.confidence,
              regime: entryData.regime,
              patterns: entryData.patterns,
              indicators: entryData.indicators,
              entryStrategy: entryData.entryStrategy,
              winnerStrategy: entryData.winnerStrategy,
              strategy: entryData.strategy,
              signalId: entryData.signalId,
              decisionId: entryData.decisionId,
              traceId: entryData.traceId,
              signalBasis: entryData.signalBasis,
              crossoverCount: entryData.crossoverCount,
              decisionLedger: entryData.decisionLedger,
              strategySignals: entryData.strategySignals,
              orchestratorDecision: entryData.orchestratorDecision,
              competingStrategies: entryData.competingStrategies,
              confluence: entryData.confluence,
              positionSizing: entryData.positionSizing,
              exitContract: entryData.exitContract,
              riskGates: entryData.riskGates
            }, replayPriceHistory.priceHistory);
            if (!replayEntry) {
              TradeJournalBridge.prototype._recordVisibilityFailure.call(bridge, 'trade_entry_replay_missing', {
                ...failureContext,
                orderId: entryData.orderId,
                message: 'TradeReplayCapture.captureEntry returned null',
                context: {
                  entry: compactTradeRecord(entryData),
                  replayPriceHistory: {
                    ok: replayPriceHistory.ok,
                    source: replayPriceHistory.source,
                    symbol: replayPriceHistory.symbol,
                    priceHistoryLength: replayPriceHistory.priceHistory.length,
                  },
                },
              });
            }
          }
        } else if (!decisionExitAction && confirmedEntrySideEffect && activeTrade) {
          throw new Error(`Entry ${resultOrderId} succeeded but active trade action is not journalable; refusing silent capture skip`);
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

  _reconcileOpenStateTrades() {
    const activeTrades = this.bot?.stateManager?.get?.('activeTrades');
    for (const { key, trade } of activeTradeEntries(activeTrades)) {
      const activeOrderId = nonEmptyStringOrNull(trade?.orderId) || nonEmptyStringOrNull(trade?.id);
      const keyOrderId = nonEmptyStringOrNull(key);
      const expectedOrderId = activeOrderId;
      if (!expectedOrderId) {
        TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'trade_entry_state_reconciliation_refused', {
          phase: 'entry',
          source: 'StateManager.activeTrades',
          orderId: null,
          action: entryActionOrNull(trade?.action) || entryActionOrNull(trade?.type),
          missing: ['activeTrade.orderId'],
          message: 'Open active trade missing orderId/id; refusing journal reconciliation',
          context: { activeTrade: compactTradeRecord(trade), activeTradeKey: keyOrderId },
        });
        continue;
      }

      const normalizedEntry = sourceBackedEntryFromActiveTrade(trade, expectedOrderId);
      if (!normalizedEntry.ok) {
        TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'trade_entry_state_reconciliation_refused', {
          phase: 'entry',
          source: 'StateManager.activeTrades',
          orderId: expectedOrderId,
          action: entryActionOrNull(trade?.action) || entryActionOrNull(trade?.type),
          missing: normalizedEntry.missing,
          message: `Open active trade ${expectedOrderId} missing source-backed field(s): ${normalizedEntry.missing.join(', ')}`,
          context: { activeTrade: compactTradeRecord(trade), activeTradeKey: keyOrderId },
        });
        continue;
      }

      const bundle = TradeJournalBridge.prototype._getJournalBundleForEntry.call(this, normalizedEntry.data);
      if (
        bundle.journal.entryOrderIds?.has?.(expectedOrderId)
        || bundle.journal.openTrades?.has?.(expectedOrderId)
        || (Array.isArray(bundle.journal.trades) && bundle.journal.trades.some(closed => closed.orderId === expectedOrderId))
      ) {
        continue;
      }

      const journalEntry = bundle.journal.recordEntry({
        ...normalizedEntry.data,
        source: 'StateManager.activeTrades',
      });
      if (!journalEntry) {
        TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'trade_entry_state_reconciliation_refused', {
          phase: 'entry',
          source: 'StateManager.activeTrades',
          orderId: expectedOrderId,
          action: normalizedEntry.data.direction,
          message: 'TradeJournal.recordEntry returned null during open state reconciliation',
          context: { activeTrade: compactTradeRecord(trade), activeTradeKey: keyOrderId },
        });
      }
    }
  }

  _stateOpenTradeProof() {
    const activeTrades = this.bot?.stateManager?.get?.('activeTrades');
    const entries = activeTradeEntries(activeTrades);
    const stateOpenOrderIds = uniqueNonEmptyStrings(entries.map(({ key, trade }) => (
      nonEmptyStringOrNull(trade?.orderId) || nonEmptyStringOrNull(trade?.id) || nonEmptyStringOrNull(key)
    )));
    const statePositionCount = nonNegativeNumberOrNull(this.bot?.stateManager?.get?.('positionCount'));
    return {
      stateOpenOrderIds,
      stateActiveTradeCount: stateOpenOrderIds.length,
      statePositionCount: Number.isInteger(statePositionCount) ? statePositionCount : stateOpenOrderIds.length,
    };
  }

  async _brokerPositionsForJournalReconciliation() {
    const adapter = this.bot?.sessionRouter?.activeBroker;
    if (!adapter || typeof adapter.getPositions !== 'function') {
      console.warn('[TradeJournalBridge] Active broker does not support getPositions() for journal reconciliation; refusing broker-ambiguous position read');
      return null;
    }
    const positions = await adapter.getPositions();
    if (!Array.isArray(positions)) {
      throw new Error(`broker.getPositions returned ${typeof positions}, expected array`);
    }
    return positions
      .map(normalizeBrokerPositionForJournal)
      .filter(Boolean);
  }

  async _reconcileJournalOpenTradesWithAuthoritativeState() {
    const brokerPositions = await this._brokerPositionsForJournalReconciliation();
    if (!brokerPositions) {
      return { reconciled: 0, skipped: true, reason: 'broker_positions_unavailable' };
    }

    const stateProof = this._stateOpenTradeProof();
    let reconciled = 0;
    for (const bundle of TradeJournalBridge.prototype._allJournalBundles.call(this)) {
      const journal = bundle.journal;
      const scopeSymbol = nonEmptyStringOrNull(bundle.scope?.symbol);
      if (!journal?.openTrades || !scopeSymbol) continue;
      const brokerSymbolPositionCount = brokerPositions
        .filter(position => position.symbol.toUpperCase() === scopeSymbol.toUpperCase())
        .length;
      for (const orderId of Array.from(journal.openTrades.keys())) {
        const record = journal.recordOpenTradeReconciliation({
          orderId,
          reason: 'state_manager_and_broker_flat',
          source: 'TradeJournalBridge.startup_authoritative_reconciliation',
          ...stateProof,
          brokerPositionCount: brokerPositions.length,
          brokerSymbolPositionCount,
          brokerPositions,
        });
        if (record) reconciled += 1;
      }
    }

    if (reconciled > 0) {
      console.warn(`[TradeJournalBridge] Reconciled ${reconciled} stale journal-open trade(s) using StateManager plus broker position proof`);
      TradeJournalBridge.prototype._sendJournalSnapshot.call(this);
    }
    return { reconciled, skipped: false };
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
      let bundle = TradeJournalBridge.prototype._getJournalBundleForOrderId.call(this, data.orderId);
      if (!bundle && data.symbol) {
        bundle = TradeJournalBridge.prototype._getJournalBundleForEntry.call(this, {
          orderId: data.orderId,
          symbol: data.symbol,
        });
      }
      if (!bundle?.journal || !bundle?.replay) {
        TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'trade_exit_scope_unresolved', {
          phase: 'exit',
          source,
          orderId: data.orderId,
          action: exitActionOrNull(exitRecord, data),
          message: `Closed trade ${data.orderId} could not resolve a symbol-scoped journal bundle`,
          context: { exitRecord: compactTradeRecord(exitRecord) },
        });
        return false;
      }
      const journalExit = bundle.journal.recordExit({
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

      const replayPriceHistory = resolveReplayPriceHistory(this.bot, data.symbol || bundle.scope?.symbol);
      let replayPath = null;
      if (!replayPriceHistory.ok) {
        TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'trade_exit_replay_missing', {
          phase: 'exit',
          source,
          orderId: data.orderId,
          action: exitActionOrNull(exitRecord, data),
          message: `Trade replay exit skipped: ${replayPriceHistory.reason}`,
          context: {
            exitRecord: compactTradeRecord(exitRecord),
            replayPriceHistory: replayPriceHistory,
          },
        });
      } else {
        replayPath = bundle.replay.captureExit(data.orderId, {
          price: data.exitPrice,
          exitPrice: data.exitPrice,
          entryPrice: data.entryPrice,
          reason: data.reason,
          pnl: data.pnl,
          pnlPercent: data.pnlPercent,
          holdTime: data.holdTime,
          direction: data.direction,
          size: data.size
        }, replayPriceHistory.priceHistory);
        if (!replayPath) {
          TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'trade_exit_replay_missing', {
            phase: 'exit',
            source,
            orderId: data.orderId,
            action: exitActionOrNull(exitRecord, data),
            message: 'TradeReplayCapture.captureExit returned null',
            context: {
              exitRecord: compactTradeRecord(exitRecord),
              replayPriceHistory: {
                ok: replayPriceHistory.ok,
                source: replayPriceHistory.source,
                symbol: replayPriceHistory.symbol,
                priceHistoryLength: replayPriceHistory.priceHistory.length,
              },
            },
          });
        }
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
      TradeJournalBridge.prototype._markVisibilityPersistenceFailureAlert.call(this, record);
    }

    TradeJournalBridge.prototype._sendVisibilityFailure.call(this, record);
    return record;
  }

  _markVisibilityPersistenceFailureAlert(record) {
    const reason = `Trade visibility failure could not be persisted: eventType=${record.eventType || 'unknown'} orderId=${record.orderId || 'unknown'}`;
    record.visibilityTradingPauseReason = reason;
    record.visibilityTradingPauseAttempted = false;
    record.visibilityTradingPauseConfirmed = false;
    record.visibilityTradingPauseError = null;
    console.error(`[TradeJournalBridge] ${reason}; alert only, trading not paused`);
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
      if (TradeJournalBridge.prototype._combinedClosedTrades.call(this).length > 0) this._sendJournalSnapshot();
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

  _combinedClosedTrades() {
    return TradeJournalBridge.prototype._allJournalBundles.call(this)
      .flatMap(bundle => Array.isArray(bundle.journal?.trades) ? bundle.journal.trades : [])
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  }

  _combinedOpenTradeCount() {
    return TradeJournalBridge.prototype._allJournalBundles.call(this)
      .reduce((sum, bundle) => sum + (bundle.journal?.openTrades?.size || 0), 0);
  }

  _combinedJournalSnapshot() {
    const bundles = TradeJournalBridge.prototype._allJournalBundles.call(this);
    if (bundles.length === 1) return bundles[0].journal.getSnapshot();

    const trades = this._combinedClosedTrades();
    const netPnl = trades.reduce((sum, trade) => sum + (finiteNumberOrNull(trade.netPnl) || 0), 0);
    const wins = trades.filter(trade => (finiteNumberOrNull(trade.netPnl) || 0) > 0);
    const losses = trades.filter(trade => (finiteNumberOrNull(trade.netPnl) || 0) < 0);
    const grossWins = wins.reduce((sum, trade) => sum + (finiteNumberOrNull(trade.netPnl) || 0), 0);
    const grossLosses = losses.reduce((sum, trade) => sum + (finiteNumberOrNull(trade.netPnl) || 0), 0);
    const todayKey = new Date().toISOString().split('T')[0];
    const todayTrades = trades.filter(trade => new Date(Number(trade.timestamp || 0)).toISOString().split('T')[0] === todayKey);
    const todayPnl = todayTrades.reduce((sum, trade) => sum + (finiteNumberOrNull(trade.netPnl) || 0), 0);
    const todayWins = todayTrades.filter(trade => (finiteNumberOrNull(trade.netPnl) || 0) > 0).length;
    const recentTrades = trades.slice(-10).reverse();
    const startingBalance = finiteNumberOrNull(this._journalStartingBalance) || 0;
    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
    const avgWin = wins.length > 0 ? grossWins / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLosses / losses.length : 0;
    const profitFactor = grossLosses !== 0 ? Math.abs(grossWins / grossLosses) : (grossWins > 0 ? Infinity : 0);
    const expectancy = totalTrades > 0 ? netPnl / totalTrades : 0;
    const sortedByPnl = trades.slice().sort((a, b) => (finiteNumberOrNull(a.netPnl) || 0) - (finiteNumberOrNull(b.netPnl) || 0));

    let currentStreak = 0;
    let currentStreakType = 'none';
    let longestWinStreak = 0;
    let longestLossStreak = 0;
    let runningWin = 0;
    let runningLoss = 0;
    const recentWL = [];
    for (const trade of trades) {
      const pnl = finiteNumberOrNull(trade.netPnl) || 0;
      if (pnl > 0) {
        recentWL.push('W');
        runningWin += 1;
        runningLoss = 0;
        longestWinStreak = Math.max(longestWinStreak, runningWin);
        currentStreak = runningWin;
        currentStreakType = 'win';
      } else if (pnl < 0) {
        recentWL.push('L');
        runningLoss += 1;
        runningWin = 0;
        longestLossStreak = Math.max(longestLossStreak, runningLoss);
        currentStreak = runningLoss;
        currentStreakType = 'loss';
      } else {
        recentWL.push('F');
        runningWin = 0;
        runningLoss = 0;
        currentStreak = 0;
        currentStreakType = 'flat';
      }
    }

    return {
      module: 'TradeJournal',
      scopeMode: 'multi-symbol-aggregate',
      symbols: bundles.map(bundle => bundle.scope?.symbol).filter(Boolean),
      totalTrades,
      winRate: Number(winRate.toFixed(1)),
      netPnl: Number(netPnl.toFixed(2)),
      netPnlPercent: startingBalance > 0 ? Number((netPnl / startingBalance * 100).toFixed(2)) : 0,
      currentBalance: Number((startingBalance + netPnl).toFixed(2)),
      profitFactor: Number.isFinite(profitFactor) ? Number(profitFactor.toFixed(2)) : profitFactor,
      sharpeRatio: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      expectancy: Number(expectancy.toFixed(2)),
      avgWin: Number(avgWin.toFixed(2)),
      avgLoss: Number(avgLoss.toFixed(2)),
      avgHoldTime: '0s',
      avgHoldTimeWinners: '0s',
      avgHoldTimeLosers: '0s',
      currentStreak,
      currentStreakType,
      longestWinStreak,
      longestLossStreak,
      recentWL: recentWL.slice(-30),
      bestTrade: sortedByPnl.length ? sortedByPnl[sortedByPnl.length - 1] : null,
      worstTrade: sortedByPnl.length ? sortedByPnl[0] : null,
      todayTrades: todayTrades.length,
      todayPnl: Number(todayPnl.toFixed(2)),
      todayWinRate: todayTrades.length > 0 ? Number((todayWins / todayTrades.length * 100).toFixed(1)) : 0,
      openPositions: this._combinedOpenTradeCount(),
      recentTrades: recentTrades.map(t => ({
        orderId: t.orderId,
        symbol: t.symbol,
        direction: t.direction,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        netPnl: roundedNumberOrNull(t.netPnl),
        pnlPercent: roundedNumberOrNull(t.pnlPercent),
        outcome: classifyReplayOutcome(t.netPnl, t.pnlPercent),
        holdTime: t.holdTimeFormatted,
        exitReason: t.exitReason,
        confidence: t.confidence,
        regime: t.regime,
        timestamp: t.timestamp
      }))
    };
  }

  _combinedReplayList(limit = 50) {
    return TradeJournalBridge.prototype._allJournalBundles.call(this)
      .flatMap(bundle => bundle.replay?.listReplays?.(limit) || [])
      .sort((a, b) => Number(b.savedAt || b.timestamp || 0) - Number(a.savedAt || a.timestamp || 0))
      .slice(0, limit);
  }

  _addBreakdownTrade(buckets, key, trade) {
    if (!key) return;
    if (!buckets[key]) {
      buckets[key] = {
        trades: 0,
        wins: 0,
        losses: 0,
        netPnl: 0,
        grossWins: 0,
        grossLosses: 0,
        totalHoldTime: 0,
      };
    }
    const bucket = buckets[key];
    const pnl = finiteNumberOrNull(trade.netPnl) || 0;
    bucket.trades += 1;
    bucket.netPnl += pnl;
    bucket.totalHoldTime += finiteNumberOrNull(trade.holdTimeMs) || 0;
    if (pnl > 0) {
      bucket.wins += 1;
      bucket.grossWins += pnl;
    } else if (pnl < 0) {
      bucket.losses += 1;
      bucket.grossLosses += pnl;
    }
  }

  _combinedPerformanceBreakdown(dimension) {
    const bundles = TradeJournalBridge.prototype._allJournalBundles.call(this);
    if (bundles.length === 1) return bundles[0].journal.getPerformanceBreakdown(dimension);

    const buckets = {};
    for (const trade of this._combinedClosedTrades()) {
      switch (dimension) {
        case 'symbol':
          this._addBreakdownTrade(buckets, trade.symbol, trade);
          break;
        case 'regime':
          this._addBreakdownTrade(buckets, trade.regime, trade);
          break;
        case 'pattern':
          if (!Array.isArray(trade.patterns) || trade.patterns.length === 0) {
            this._addBreakdownTrade(buckets, 'no_pattern', trade);
          } else {
            for (const pattern of trade.patterns) {
              this._addBreakdownTrade(buckets, nonEmptyStringOrNull(pattern?.name), trade);
            }
          }
          break;
        case 'hourOfDay':
          this._addBreakdownTrade(buckets, new Date(trade.entryTime || trade.timestamp).getUTCHours().toString().padStart(2, '0') + ':00', trade);
          break;
        case 'dayOfWeek':
          this._addBreakdownTrade(buckets, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(trade.entryTime || trade.timestamp).getUTCDay()], trade);
          break;
        case 'confidenceBand': {
          const conf = finiteNumberOrNull(trade.confidence);
          if (conf === null) break;
          const key = conf < 55 ? '< 55%' : conf < 65 ? '55-65%' : conf < 75 ? '65-75%' : conf < 85 ? '75-85%' : '85%+';
          this._addBreakdownTrade(buckets, key, trade);
          break;
        }
        case 'exitReason':
          this._addBreakdownTrade(buckets, trade.exitReason, trade);
          break;
        case 'month': {
          const date = new Date(trade.timestamp);
          this._addBreakdownTrade(buckets, `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}`, trade);
          break;
        }
        default:
          this._addBreakdownTrade(buckets, 'all', trade);
      }
    }

    for (const bucket of Object.values(buckets)) {
      bucket.winRate = bucket.trades > 0 ? (bucket.wins / bucket.trades * 100) : 0;
      bucket.avgPnl = bucket.trades > 0 ? (bucket.netPnl / bucket.trades) : 0;
      bucket.avgWin = bucket.wins > 0 ? (bucket.grossWins / bucket.wins) : 0;
      bucket.avgLoss = bucket.losses > 0 ? (bucket.grossLosses / bucket.losses) : 0;
      bucket.profitFactor = bucket.grossLosses !== 0 ? Math.abs(bucket.grossWins / bucket.grossLosses) : (bucket.grossWins > 0 ? Infinity : 0);
      bucket.avgHoldTime = '0s';
      bucket.expectancy = bucket.trades > 0 ? bucket.netPnl / bucket.trades : 0;
    }

    return buckets;
  }

  _loadReplay(orderId) {
    const target = nonEmptyStringOrNull(orderId);
    if (!target) return null;
    for (const bundle of TradeJournalBridge.prototype._allJournalBundles.call(this)) {
      const data = bundle.replay?.loadReplay?.(target);
      if (data) return data;
    }
    return null;
  }

  _sendJournalSnapshot() {
    this._send({ type: 'journal_snapshot', data: this._combinedJournalSnapshot() });
  }

  _sendEquityCurve() {
    this._send({ type: 'journal_equity', data: this.journal.getEquityCurve(500) });
  }

  _sendBreakdown(dimension) {
    this._send({ type: 'journal_breakdown', data: this._combinedPerformanceBreakdown(dimension), dimension });
  }

  _sendCalendar() {
    this._send({ type: 'journal_calendar', data: this.journal.getDailySummaries(90) });
  }

  _sendReplay(orderId) {
    if (!orderId) return;
    const data = this._loadReplay(orderId);
    this._send(data ? { type: 'replay_data', data } : { type: 'replay_not_found', orderId });
  }

  _sendReplayList(limit = 50) {
    this._send({ type: 'replay_list', data: this._combinedReplayList(limit) });
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
    const bridge = this;

    app.get('/replay', (req, res) => res.sendFile(path.join(process.cwd(), 'public', 'trade-replay.html')));
    app.get('/journal', (req, res) => res.sendFile(path.join(process.cwd(), 'public', 'trade-journal.html')));

    app.get('/api/replay/adjacent', (req, res) => {
      const all = bridge._combinedReplayList(1000);
      const idx = all.findIndex(r => r.orderId === req.query.id);
      const target = idx + (parseInt(req.query.direction) || 1);
      res.json({ orderId: (target >= 0 && target < all.length) ? all[target].orderId : null });
    });

    app.get('/api/replay/:id', (req, res) => {
      const data = bridge._loadReplay(req.params.id);
      data ? res.json(data) : res.status(404).json({ error: 'Replay not found' });
    });

    app.get('/api/replays', (req, res) => res.json(bridge._combinedReplayList(parseInt(req.query.limit) || 50)));
    app.get('/api/journal/stats', (req, res) => res.json(bridge._combinedJournalSnapshot()));
    app.get('/api/journal/equity', (req, res) => res.json(bridge.journal.getEquityCurve(parseInt(req.query.limit) || 500)));
    app.get('/api/journal/breakdown/:dim', (req, res) => res.json(bridge._combinedPerformanceBreakdown(req.params.dim)));

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
      const all = this._combinedReplayList(1000);
      const idx = all.findIndex(r => r.orderId === url.searchParams.get('id'));
      const target = idx + (parseInt(url.searchParams.get('direction')) || 1);
      return sendJSON({ orderId: (target >= 0 && target < all.length) ? all[target].orderId : null });
    }
    if (url.pathname.startsWith('/api/replay/')) {
      const id = url.pathname.split('/').pop();
      const data = this._loadReplay(id);
      return data ? sendJSON(data) : sendJSON({ error: 'Not found' }, 404);
    }
    if (url.pathname === '/api/replays') return sendJSON(this._combinedReplayList(parseInt(url.searchParams.get('limit')) || 50));
    if (url.pathname === '/api/journal/stats') return sendJSON(this._combinedJournalSnapshot());
    if (url.pathname === '/api/journal/equity') return sendJSON(this.journal.getEquityCurve(500));
    if (url.pathname.startsWith('/api/journal/breakdown/')) {
      const dim = url.pathname.split('/').pop();
      return sendJSON(this._combinedPerformanceBreakdown(dim));
    }

    return false;
  }


  // ════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ════════════════════════════════════════════════════════════════════════

  destroy() {
    if (this._broadcastTimer) clearInterval(this._broadcastTimer);
    if (this._dashboardHookTimer) clearInterval(this._dashboardHookTimer);
    for (const bundle of this._allJournalBundles()) {
      bundle.journal?.destroy?.();
    }
    console.log('[TradeJournalBridge] Destroyed');
  }
}

module.exports = { TradeJournalBridge, TradeJournal, TradeReplayCapture, resolveJournalScope, resolveJournalDataDir, resolveReplayDir, resolveReplayPriceHistory };
