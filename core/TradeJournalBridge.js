/**
 * Trade journal reporting connection.
 * Receives confirmed execution records explicitly. Its context contains only
 * read operations and reporting outputs; it never owns execution functions,
 * StateManager mutations, broker order methods or process lifecycle methods.
 */

const TradeJournal = require('./TradeJournal');
const TradeReplayCapture = require('./TradeReplayCapture');
const path = require('path');
const fs = require('fs');
const ConfigLoader = require('../foundation/ConfigLoader');  // CHANGE 2026-02-28: Centralized config
const { normalizePatternScope, requirePatternScope } = require('./PatternScope');

const JOURNAL_WRITE_ERROR_CODES = new Set([
  'EACCES',
  'EBUSY',
  'EIO',
  'EISDIR',
  'EMFILE',
  'ENFILE',
  'ENOENT',
  'ENOSPC',
  'ENOTDIR',
  'EPERM',
  'EROFS',
]);

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

function isJournalFailureEventType(eventType) {
  const normalized = nonEmptyStringOrNull(eventType);
  return normalized === 'trade_entry_source_incomplete'
    || normalized === 'trade_entry_journal_refused'
    || normalized === 'trade_entry_recording_exception'
    || normalized === 'trade_entry_state_reconciliation_refused'
    || normalized === 'trade_exit_journal_refused'
    || normalized === 'trade_exit_recording_exception';
}

function isJournalPersistenceError(err) {
  const code = nonEmptyStringOrNull(err?.code);
  if (code && JOURNAL_WRITE_ERROR_CODES.has(code)) return true;
  const message = nonEmptyStringOrNull(err?.message) || '';
  return /append|ledger|write|persist|no space|permission|read-only|eacces|enospc|eperm|erofs/i.test(message);
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
  const scope = normalizePatternScope(activeTrade ?? {}, 'TradeJournalBridge.activeTrade');
  const symbol = scope.ok ? scope.symbol : nonEmptyStringOrNull(activeTrade?.symbol);
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
  if (!scope.ok) {
    const scopeFields = scope.missingFields.length > 0 ? scope.missingFields : ['scopeKey'];
    for (const field of scopeFields) {
      const sourceField = `activeTrade.${field}`;
      if (!missing.includes(sourceField)) missing.push(sourceField);
    }
  }

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
      ...(scope.ok ? {
        brokerId: scope.brokerId,
        accountId: scope.accountId,
        accountIdSource: scope.accountIdSource,
        assetClass: scope.assetClass,
        executionMode: scope.executionMode,
        timeframe: scope.timeframe,
        scopeKey: scope.scopeKey,
        scopeKeyVersion: scope.scopeKeyVersion,
        scopeComplete: scope.scopeComplete,
      } : {}),
    },
  };
}

function timestampOrNull(value) {
  const numeric = finiteNumberOrNull(value);
  if (numeric !== null) return numeric;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  const exitTimestamp = timestampOrNull(exitRecord?.exitTimestamp ?? exitRecord?.exitTime ?? exitRecord?.timestamp);
  const exitFee = nonNegativeNumberOrNull(exitRecord?.exitFee);
  const scope = normalizePatternScope(exitRecord ?? {}, 'TradeJournalBridge.confirmedExit');

  if (!orderId) missing.push('orderId');
  if (!symbol) missing.push('symbol');
  if (!direction) missing.push('direction');
  if (entryPrice == null) missing.push('entryPrice');
  if (exitPrice == null) missing.push('exitPrice');
  if (pnl == null) missing.push('pnl');
  if (holdTime == null) missing.push('holdTime');
  if (!reason) missing.push('reason');
  if (size == null) missing.push('size');
  if (exitFee == null) missing.push('exitFee');
  if (exitTimestamp == null) missing.push('exitTimestamp');
  if (!scope.ok) missing.push(...scope.missingFields.map(field => `scope.${field}`));

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
      exitTimestamp,
      exitFee,
      fillId: nonEmptyStringOrNull(exitRecord.fillId),
      ...(scope.ok ? scope : {}),
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
    symbol: nonEmptyStringOrNull(record.symbol),
    brokerId: nonEmptyStringOrNull(record.brokerId),
    accountId: nonEmptyStringOrNull(record.accountId),
    accountIdSource: nonEmptyStringOrNull(record.accountIdSource),
    assetClass: nonEmptyStringOrNull(record.assetClass),
    executionMode: nonEmptyStringOrNull(record.executionMode),
    timeframe: nonEmptyStringOrNull(record.timeframe),
    scopeKey: nonEmptyStringOrNull(record.scopeKey),
    orderId: nonEmptyStringOrNull(record.orderId),
    tradeId: nonEmptyStringOrNull(record.tradeId),
    fillId: nonEmptyStringOrNull(record.fillId),
    exitTimestamp: timestampOrNull(record.exitTimestamp),
    exitFee: nonNegativeNumberOrNull(record.exitFee),
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
  const runtimeScope = bot?.stateManager?.getDashboardRuntimeScope?.();
  return requirePatternScope(runtimeScope || {
    symbol: bot?.config?.tradingPair || bot?.tradingPair,
    brokerId: bot?.config?.brokerId,
    accountId: bot?.config?.accountId,
    assetClass: bot?.config?.assetClass,
    executionMode: bot?.config?.executionMode,
    timeframe: bot?.config?.timeframe || bot?.candleTimeframe,
  }, 'TradeJournalBridge.dataDir');
}

function resolveReplayPriceHistory(bot, symbol, timeframe) {
  const tradeSymbol = nonEmptyStringOrNull(symbol);
  if (!tradeSymbol) {
    return { ok: false, reason: 'missing_symbol', source: null, priceHistory: null };
  }

  if (typeof bot?.getSymbolTimeframeContext === 'function') {
    const frame = nonEmptyStringOrNull(timeframe);
    const ctx = frame ? bot.getSymbolTimeframeContext(tradeSymbol, frame) : null;
    const history = Array.isArray(ctx?.priceHistory) ? ctx.priceHistory : null;
    return { ok: !!(history && history.length), reason: history?.length ? null : 'trade_timeframe_history_unavailable', source: 'symbol_timeframe_context', symbol: tradeSymbol, timeframe: frame, priceHistory: history };
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

function resolveJournalDataDir(_bot, config = {}, scope) {
  const journalRoot = config.journalRoot;
  if (!journalRoot) {
    throw new Error('[TRADE-JOURNAL-SCOPE] TradeJournalBridge requires an explicit canonical journalRoot');
  }
  return path.join(journalRoot, safeScopePathSegment(scope));
}

function resolveReplayDir(journalDataDir) {
  return path.join(journalDataDir, 'replays');
}

class TradeJournalBridge {
  constructor(context, config) {
    this.context = Object.freeze({ ...context });
    this._journalBridgeConfig = { ...config };
    this._journalStartingBalance = config.startingBalance;
    this._journalBundles = new Map();
    this._primaryScope = null;
    this.journal = null;
    this.replay = null;
    this.visibilityFailurePath = null;
    this.visibilityFailureFallbackPath = path.join(config.journalRoot, '..', 'runtime-audit', 'trade-visibility-failures-fallback.jsonl');
    this._pendingVisibilityErrors = [];
    this._maxPendingVisibilityErrors = config.maxPendingVisibilityErrors;
    this._closedTradeLogKeySet = new Set();
    this._closedTradeLogKeys = [];
    this._journalPersistenceFailureStreak = 0;
  }

  start() {
    const scope = normalizePatternScope(this.context.readRuntimeScope() ?? {}, 'TradeJournalBridge.start');
    if (scope.ok) {
      this._primaryScope = scope;
      this._createJournalBundle(scope);
    } else {
      this._recordVisibilityFailure('journal_runtime_scope_unavailable', {
        phase: 'startup', source: 'StateManager.getDashboardRuntimeScope',
        missing: scope.missingFields,
        message: 'The reporting journal has no complete runtime scope',
        manualReconciliationRequired: true,
      });
    }
    this._loadHistoricalJournalBundles();
    this._reconcileOpenStateTrades();
    this._startupJournalReconciliationPromise = this._reconcileJournalOpenTradesWithAuthoritativeState()
      .catch(error => this._recordStartupJournalBrokerPositionFailure(error));
    this._wireDashboardMessages();
    this._wireBroadcastCycle();
    return { reportingAvailable: !!this.journal, tradingAction: 'none' };
  }

  _loadHistoricalJournalBundles() {
    this._journalInventoryIssues = [];
    this._excludedLegacyDirectories = [];
    try {
      for (const entry of fs.readdirSync(this._journalBridgeConfig.journalRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'exports') continue;
        if (entry.name === 'replays') {
          this._excludedLegacyDirectories.push(entry.name);
          continue;
        }
        const parts = [];
        let offset = 0;
        for (let field = 0; field < 6; field++) {
          const dash = entry.name.indexOf('-', offset);
          const lengthText = entry.name.slice(offset, dash);
          if (dash < 0 || !/^\d+$/.test(lengthText)) break;
          const length = Number(lengthText);
          const encoded = entry.name.slice(dash + 1, dash + 1 + length);
          if (encoded.length !== length) break;
          parts.push(decodeURIComponent(encoded));
          offset = dash + 1 + length;
          if (field < 5 && entry.name.slice(offset, offset + 2) !== '__') break;
          if (field < 5) offset += 2;
        }
        const [executionMode, brokerId, accountId, assetClass, symbol, timeframe] = parts;
        const scope = normalizePatternScope({ executionMode, brokerId, accountId, assetClass, symbol, timeframe, accountIdSource: 'persisted_journal_directory' }, 'TradeJournalBridge.inventory');
        if (parts.length !== 6 || offset !== entry.name.length || !scope.ok || safeScopePathSegment(scope) !== entry.name) {
          this._journalInventoryIssues.push({ directory: entry.name, reason: 'journal_directory_scope_unresolved' });
          continue;
        }
        this._createJournalBundle(scope);
      }
    } catch (error) {
      this._journalInventoryIssues.push({ reason: errorMessageOrNull(error) });
    }
    if (this._journalInventoryIssues.length) this._recordVisibilityFailure('journal_inventory_unavailable', {
      phase: 'initialization', source: 'journalRoot', scope: null,
      message: 'Historical journal scope inventory is incomplete',
      context: { issues: this._journalInventoryIssues }, manualReconciliationRequired: true,
    });
  }

  _reportingBundles() {
    const scope = normalizePatternScope(this.context.readRuntimeScope() ?? {}, 'TradeJournalBridge.reportingAccount');
    if (!scope.ok) return [];
    return this._allJournalBundles().filter(bundle => bundle.scope.brokerId === scope.brokerId
      && bundle.scope.accountId === scope.accountId && bundle.scope.executionMode === scope.executionMode);
  }

  _accountReport() {
    const bundles = this._reportingBundles();
    const unavailable = bundles.filter(bundle => !bundle.journal || bundle.failures.visibilityHistory || this._unresolvedJournalGaps(bundle).length > 0);
    if (!bundles.length || unavailable.length || this._journalInventoryIssues?.length) {
      return { status: 'unavailable', reason: 'Journal history is unavailable or incomplete for the active account.',
        unavailableScopes: unavailable.map(bundle => ({ scope: bundle.scope, reason: bundle.failures.journal || bundle.failures.visibilityHistory || 'Confirmed execution rows are missing', missingRecords: this._unresolvedJournalGaps(bundle).map(record => ({ phase: record.phase, orderId: record.orderId, eventType: record.eventType })) })),
        inventoryIssues: this._journalInventoryIssues || [] };
    }
    try {
      const key = JSON.stringify([new Date().toISOString().slice(0, 10), ...bundles.map(bundle => {
        const file = bundle.journal.paths.ledger;
        const stat = fs.existsSync(file) ? fs.statSync(file) : null;
        return [bundle.scope.scopeKey, stat?.size, stat?.mtimeMs, bundle.journal.openTrades.size];
      })]);
      if (this._accountReportCache?.key === key) return this._accountReportCache.value;
      const trades = bundles.flatMap(bundle => bundle.journal.readClosedTrades()).sort((a, b) => a.timestamp - b.timestamp);
      const invalid = trades.find(trade => ![trade.timestamp, trade.netPnl, trade.grossPnl, trade.fees, trade.holdTimeMs].every(value => Number.isFinite(value)));
      if (invalid) {
        this._recordVisibilityFailure('journal_report_record_unavailable', {
          phase: 'report', source: 'trade-ledger.jsonl', scope: invalid, orderId: invalid.orderId,
          message: 'A persisted exit lacks finite reporting facts', manualReconciliationRequired: true,
        });
        return { status: 'unavailable', reason: 'A persisted exit lacks finite reporting facts.' };
      }
      const report = new TradeJournal.JournalReport({
        ...this._journalBridgeConfig, startingBalance: this._journalStartingBalance,
        // Account reports and exports cover all persisted rows. The live
        // per-scope journal retains its configured recent-trade window.
        maxInMemoryTrades: trades.length,
      });
      for (const trade of trades) report.recordCompletedTrade(trade);
      for (const bundle of bundles) for (const [id, entry] of bundle.journal.openTrades) report.openTrades.set(bundle.scope.scopeKey + ':' + id, entry);
      const value = { status: 'available', report, scope: {
        brokerId: bundles[0].scope.brokerId, accountId: bundles[0].scope.accountId,
        executionMode: bundles[0].scope.executionMode,
      }, includedScopes: bundles.map(bundle => bundle.scope.scopeKey), excludedLegacyDirectories: this._excludedLegacyDirectories || [] };
      this._accountReportCache = { key, value };
      return value;
    } catch (error) {
      this._recordVisibilityFailure('journal_report_unavailable', {
        phase: 'report', source: 'trade-ledger.jsonl', message: errorMessageOrNull(error), manualReconciliationRequired: true,
      });
      return { status: 'unavailable', reason: 'The account journal could not be read; see its failure receipt.' };
    }
  }

  _createJournalBundle(scope) {
    const journalDataDir = resolveJournalDataDir(null, this._journalBridgeConfig, scope);
    const existing = this._journalBundles.get(scope.scopeKey);
    const bundle = existing || {
      scope, journal: null, replay: null,
      visibilityFailurePath: path.join(journalDataDir, 'trade-visibility-failures.jsonl'),
      failures: {}, journalGaps: new Map(),
    };
    this._journalBundles.set(scope.scopeKey, bundle);
    if (!existing && fs.existsSync(bundle.visibilityFailurePath)) {
      try {
        for (const line of fs.readFileSync(bundle.visibilityFailurePath, 'utf8').split('\n').filter(line => line.trim())) {
          const failure = JSON.parse(line);
          if (isJournalFailureEventType(failure.eventType)) this._rememberJournalGap(bundle, failure);
        }
      } catch (error) {
        bundle.failures.visibilityHistory = errorMessageOrNull(error);
        this._recordVisibilityFailure('journal_failure_history_unavailable', {
          phase: 'initialization', source: 'trade-visibility-failures.jsonl', scope,
          message: bundle.failures.visibilityHistory, manualReconciliationRequired: true,
        });
      }
    }
    if (scope.scopeKey === this._primaryScope?.scopeKey) {
      this.visibilityFailurePath = bundle.visibilityFailurePath;
    }
    if (!bundle.journal) {
      try {
        bundle.journal = new TradeJournal({
          ...this._journalBridgeConfig, dataDir: journalDataDir, scope,
          startingBalance: this._journalStartingBalance,
        });
        delete bundle.failures.journal;
      } catch (error) {
        bundle.failures.journal = errorMessageOrNull(error);
        this._recordVisibilityFailure('journal_scope_unavailable', {
          phase: 'initialization', source: 'TradeJournal', scope,
          message: bundle.failures.journal,
          context: { journalDataDir, code: error.code || null },
          manualReconciliationRequired: true,
        });
      }
    }
    if (!bundle.replay) {
      try {
        bundle.replay = new TradeReplayCapture({
          replayDir: resolveReplayDir(journalDataDir),
          candlesBefore: this._journalBridgeConfig.replayCandlesBefore,
          candlesAfter: this._journalBridgeConfig.replayCandlesAfter,
        });
        delete bundle.failures.replay;
      } catch (error) {
        bundle.failures.replay = errorMessageOrNull(error);
        this._recordVisibilityFailure('replay_scope_unavailable', {
          phase: 'initialization', source: 'TradeReplayCapture', scope,
          message: bundle.failures.replay,
          manualReconciliationRequired: true,
        });
      }
    }
    if (scope.scopeKey === this._primaryScope?.scopeKey) {
      this.journal = bundle.journal;
      this.replay = bundle.replay;
    }
    return bundle;
  }

  _getJournalBundleForEntry(entryData) {
    if (!this._journalBundles) {
      return { journal: this.journal, replay: this.replay, scope: this.journal?.scope || null };
    }

    const scope = requirePatternScope(entryData, 'TradeJournalBridge.entry');
    const existing = this._journalBundles.get(scope.scopeKey);
    return existing?.journal && existing?.replay ? existing : this._createJournalBundle(scope);
  }

  _getJournalBundleForOrderId(orderId, scope) {
    const target = nonEmptyStringOrNull(orderId);
    if (!target || !this._journalBundles) {
      return { journal: this.journal, replay: this.replay, scope: this.journal?.scope || null };
    }

    if (scope?.scopeKey) {
      const existing = this._journalBundles.get(scope.scopeKey);
      return existing?.journal && existing?.replay ? existing : this._createJournalBundle(scope);
    }
    for (const bundle of this._journalBundles.values()) {
      if (bundle.journal?.openTrades?.has?.(target)) return bundle;
      if (Array.isArray(bundle.journal?.trades) && bundle.journal.trades.some(trade => trade.orderId === target)) {
        return bundle;
      }
    }
    return null;
  }

  _rememberJournalGap(bundle, record) {
    const source = record.context?.exitRecord || record.context?.entry || record.context?.activeTrade || {};
    const key = JSON.stringify([record.phase, record.orderId, source.fillId, source.exitTimestamp, source.size]);
    bundle.journalGaps.set(key, record);
  }

  _unresolvedJournalGaps(bundle) {
    return Array.from(bundle.journalGaps.values()).filter(record => {
      if (!bundle.journal || !record.orderId) return true;
      if (record.phase === 'entry') return !bundle.journal.entryOrderIds.has(record.orderId);
      const fillId = record.context?.exitRecord?.fillId;
      return !fillId || !bundle.journal.exitFillIds.has(fillId);
    });
  }

  _allJournalBundles() {
    return this._journalBundles ? Array.from(this._journalBundles.values()) : [{ journal: this.journal, replay: this.replay, scope: this.journal?.scope || null }];
  }

  recordClosedCandle(candle) {
    const scope = normalizePatternScope(candle ?? {}, 'TradeJournalBridge.recordClosedCandle');
    if (!scope.ok) return 0;
    const bundle = this._journalBundles?.get(scope.scopeKey);
    if (!bundle?.replay) return 0;
    const result = bundle.replay.capturePostExitCandle(candle, scope);
    for (const failure of result.failures) {
      TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'trade_post_exit_replay_persistence_failed', {
        phase: 'post_exit',
        source: 'TradeReplayCapture.capturePostExitCandle',
        scope: failure.scope,
        orderId: failure.orderId,
        message: failure.message,
        context: {
          code: failure.code,
          candleStart: candle.t,
          candleEnd: candle.etime,
          capturedCandles: failure.capturedCandles,
          persistedCandles: failure.persistedCandles,
          requestedCandles: failure.requestedCandles,
        },
      });
    }
    return result.captured;
  }


  // ════════════════════════════════════════════════════════════════════════
  // TRADE EVENT WIRING
  // ════════════════════════════════════════════════════════════════════════

  recordEntry(activeTrade) {
    const normalized = sourceBackedEntryFromActiveTrade(activeTrade, activeTrade?.orderId);
    const entry = normalized.data;
    const context = {
      phase: 'entry', source: 'OrderExecutor.openPosition',
      orderId: entry.orderId, action: entry.direction,
      scope: normalized.ok ? entry : null,
      context: { entry: compactTradeRecord(activeTrade) },
    };
    if (!normalized.ok) {
      this._recordVisibilityFailure('trade_entry_source_incomplete', {
        ...context, missing: normalized.missing,
        message: `Confirmed entry is missing reporting data: ${normalized.missing.join(', ')}`,
        manualReconciliationRequired: true,
      });
      return { journalRecorded: false, replayRecorded: false };
    }
    const bundle = this._getJournalBundleForEntry(entry);
    let journalEntry = bundle.journal?.openTrades.get(entry.orderId) || null;
    if (!bundle.journal) this._recordVisibilityFailure('trade_entry_journal_refused', {
      ...context, message: 'Journal history is unavailable for this confirmed entry',
    });
    if (bundle.journal && !journalEntry) {
      try {
        journalEntry = bundle.journal.recordEntry(entry);
        if (journalEntry) this._recordJournalPersistenceSuccess(context);
        else this._recordVisibilityFailure('trade_entry_journal_refused', {
          ...context, message: 'TradeJournal refused the confirmed entry record',
        });
      } catch (error) {
        const failure = this._recordVisibilityFailure('trade_entry_recording_exception', {
          ...context, message: errorMessageOrNull(error),
        });
        if (isJournalPersistenceError(error)) this._recordJournalPersistenceFailure(failure, error);
      }
    }
    let replayEntry = null;
    if (bundle.replay) {
      try {
        const history = this.context.readReplayHistory(entry.symbol, entry.timeframe);
        if (history.ok) {
          replayEntry = bundle.replay.captureEntry(entry.orderId, {
            ...entry, price: entry.entryPrice,
          }, history.priceHistory, bundle.scope);
        }
        if (!replayEntry) this._recordVisibilityFailure('trade_entry_replay_missing', {
          ...context, message: history.reason || 'Replay entry capture was unavailable',
          manualReconciliationRequired: true,
        });
      } catch (error) {
        this._recordVisibilityFailure('trade_entry_replay_missing', {
          ...context, message: errorMessageOrNull(error), manualReconciliationRequired: true,
        });
      }
    }
    return { journalRecorded: !!journalEntry, replayRecorded: !!replayEntry };
  }

  _reconcileOpenStateTrades() {
    const activeTrades = this.context.readState().activeTrades;
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
      if (!bundle.journal) continue;
      if (
        bundle.journal.entryOrderIds?.has?.(expectedOrderId)
        || bundle.journal.openTrades?.has?.(expectedOrderId)
        || (Array.isArray(bundle.journal.trades) && bundle.journal.trades.some(closed => closed.orderId === expectedOrderId))
      ) {
        continue;
      }

      try {
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
        } else {
          TradeJournalBridge.prototype._recordJournalPersistenceSuccess.call(this, {
            phase: 'entry',
            source: 'StateManager.activeTrades',
            orderId: expectedOrderId,
            action: normalizedEntry.data.direction,
            symbol: normalizedEntry.data.symbol,
          });
        }
      } catch (err) {
        const record = TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'trade_entry_recording_exception', {
          phase: 'entry',
          source: 'StateManager.activeTrades',
          orderId: expectedOrderId,
          action: normalizedEntry.data.direction,
          message: errorMessageOrNull(err),
          context: { activeTrade: compactTradeRecord(trade), activeTradeKey: keyOrderId },
        });
        if (isJournalPersistenceError(err)) {
          TradeJournalBridge.prototype._recordJournalPersistenceFailure.call(this, record, err);
        }
      }
    }
  }

  _stateOpenTradeProof() {
    const state = this.context.readState();
    const activeTrades = state.activeTrades;
    const entries = activeTradeEntries(activeTrades);
    const stateOpenOrderIds = uniqueNonEmptyStrings(entries.map(({ key, trade }) => (
      nonEmptyStringOrNull(trade?.orderId) || nonEmptyStringOrNull(trade?.id) || nonEmptyStringOrNull(key)
    )));
    const statePositionCount = nonNegativeNumberOrNull(state.positionCount);
    return {
      stateOpenOrderIds,
      stateActiveTradeCount: stateOpenOrderIds.length,
      statePositionCount: Number.isInteger(statePositionCount) ? statePositionCount : stateOpenOrderIds.length,
    };
  }

  async _brokerPositionsForJournalReconciliation() {
    const snapshot = await this.context.readBrokerSnapshot();
    if (snapshot.available !== true) {
      const record = this._recordVisibilityFailure('journal_broker_positions_unavailable', {
        phase: 'startup_authoritative_reconciliation', source: 'broker.getPositions',
        scope: snapshot.scope || null, context: { code: snapshot.code || null },
        message: snapshot.reason, manualReconciliationRequired: true,
      });
      if (snapshot.scope) this._markOpenJournalTradesBrokerUnverified(record);
      return null;
    }
    return snapshot;
  }

  _recordStartupJournalBrokerPositionFailure(err) {
    const broker = this.context.readRuntimeScope()?.brokerId || null;
    const record = TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'journal_broker_positions_unavailable', {
      phase: 'startup_authoritative_reconciliation',
      source: 'broker.getPositions',
      message: errorMessageOrNull(err),
      context: {
        broker,
        code: nonEmptyStringOrNull(err?.code),
        reason: nonEmptyStringOrNull(err?.reason),
        operation: nonEmptyStringOrNull(err?.operation),
      },
      manualReconciliationRequired: true,
    });
    return record;
  }

  _markOpenJournalTradesBrokerUnverified(visibilityRecord, err) {
    const scope = visibilityRecord.scope;
    const broker = scope?.brokerId;
    const code = nonEmptyStringOrNull(visibilityRecord?.context?.code) || 'broker_position_truth_unavailable';
    const reason = nonEmptyStringOrNull(visibilityRecord?.context?.reason) || 'journal_broker_positions_unavailable';
    const message = errorMessageOrNull(err) || visibilityRecord?.message || 'broker positions unavailable';
    let marked = 0;

    for (const bundle of TradeJournalBridge.prototype._allJournalBundles.call(this)) {
      const journal = bundle.journal;
      if (!scope || bundle.scope.brokerId !== scope.brokerId
        || bundle.scope.accountId !== scope.accountId
        || bundle.scope.executionMode !== scope.executionMode) continue;
      if (!journal?.openTrades || typeof journal.recordOpenTradeBrokerUnverified !== 'function') continue;
      for (const orderId of Array.from(journal.openTrades.keys())) {
        try {
          const record = journal.recordOpenTradeBrokerUnverified({
            orderId,
            reason,
            source: 'TradeJournalBridge.startup_authoritative_reconciliation',
            broker,
            code,
            message,
          });
          if (record) marked += 1;
        } catch (markErr) {
          const failure = TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'journal_broker_unverified_mark_failed', {
            phase: 'startup_authoritative_reconciliation',
            source: 'TradeJournal.recordOpenTradeBrokerUnverified',
            orderId,
            message: errorMessageOrNull(markErr),
            context: {
              broker,
              code,
              reason,
            },
            manualReconciliationRequired: true,
          });
          if (isJournalPersistenceError(markErr)) {
            TradeJournalBridge.prototype._recordJournalPersistenceFailure.call(this, failure, markErr);
          }
        }
      }
    }
    return { marked };
  }

  async _reconcileJournalOpenTradesWithAuthoritativeState() {
    const snapshot = await this._brokerPositionsForJournalReconciliation();
    if (!snapshot) {
      return { reconciled: 0, skipped: true, reason: 'broker_positions_unavailable' };
    }

    const brokerPositions = snapshot.positions;
    const stateProof = this._stateOpenTradeProof();
    let reconciled = 0;
    for (const bundle of TradeJournalBridge.prototype._allJournalBundles.call(this)) {
      const journal = bundle.journal;
      if (bundle.scope.brokerId !== snapshot.brokerId
        || bundle.scope.accountId !== snapshot.accountId
        || bundle.scope.executionMode !== snapshot.executionMode) continue;
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

  recordExit(exitRecord, source = 'OrderExecutor.applyFill') {
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

    const data = normalized.data;
    const balance = data.balance;
    const closeKey = closedTradeLogKey(data);
    this._closedTradeLogKeySet ??= new Set();
    this._closedTradeLogKeys ??= [];
    if (this._closedTradeLogKeySet.has(closeKey)) {
      console.warn(`[TradeJournalBridge] Duplicate closed-trade log ignored from ${source}: ${data.orderId}`);
      return false;
    }

    const progress = this._closedTradeProgress?.get(closeKey) || { journalExit: null, replayPath: null, notification: null };

    try {
      const bundle = TradeJournalBridge.prototype._getJournalBundleForOrderId.call(this, data.orderId, data);
      if (!bundle?.journal && !bundle?.replay) {
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
      const journalWriteAttempted = !!bundle.journal && !progress.journalExit;
      const journalExit = progress.journalExit || bundle.journal?.recordExit({
        orderId: data.orderId,
        exitPrice: data.exitPrice,
        reason: data.reason,
        pnl: data.pnl,
        fees: data.exitFee,
        exitTimestamp: data.exitTimestamp,
        fillId: data.fillId,
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
      } else if (journalWriteAttempted) {
        TradeJournalBridge.prototype._recordJournalPersistenceSuccess.call(this, {
          phase: 'exit',
          source,
          orderId: data.orderId,
          action: exitActionOrNull(exitRecord, data),
          symbol: data.symbol || bundle.scope?.symbol,
        });
      }

      if (journalExit) progress.journalExit = journalExit;

      let replayPath = progress.replayPath;
      // A persisted partial journal leg does not complete the trade replay.
      let replayTerminal = journalExit?.partialExit === true;
      if (bundle.replay && !replayPath && !replayTerminal) {
      const replayPriceHistory = this.context.readReplayHistory(data.symbol || bundle.scope?.symbol, bundle.scope?.timeframe);
      if (!replayPriceHistory.ok && bundle.replay.pendingEntries.has(data.orderId)) {
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
      } else if (!replayPath) {
        const replayResult = bundle.replay.captureExitResult(data.orderId, {
          price: data.exitPrice,
          exitPrice: data.exitPrice,
          entryPrice: data.entryPrice,
          reason: data.reason,
          pnl: data.pnl,
          pnlPercent: data.pnlPercent,
          holdTime: data.holdTime,
          exitTimestamp: data.exitTimestamp,
          direction: data.direction,
          size: data.size
        }, replayPriceHistory.priceHistory);
        replayPath = replayResult.path;
        replayTerminal = replayResult.status === 'unavailable';
        if (!replayPath) {
          TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'trade_exit_replay_missing', {
            phase: 'exit',
            source,
            orderId: data.orderId,
            action: exitActionOrNull(exitRecord, data),
            message: `TradeReplayCapture exit ${replayResult.status}: ${replayResult.reason}`,
            context: {
              exitRecord: compactTradeRecord(exitRecord),
              replayPriceHistory: {
                ok: replayPriceHistory.ok,
                source: replayPriceHistory.source,
                symbol: replayPriceHistory.symbol,
                priceHistoryLength: Array.isArray(replayPriceHistory.priceHistory) ? replayPriceHistory.priceHistory.length : null,
              },
            },
          });
        }
      }

      }

      if (replayPath) progress.replayPath = replayPath;
      // Preserve completed channel receipts before fallible ancillary delivery.
      if (journalExit || replayPath) {
        this._closedTradeProgress ??= new Map();
        this._closedTradeProgress.set(closeKey, progress);
      }
      const notification = JSON.stringify([!!journalExit, replayPath]);
      if (progress.notification !== notification) {
        this._pushTradeClosedNotification(data.orderId, data, replayPath, { journalRecorded: !!journalExit });
        progress.notification = notification;
      }
      if (!journalExit || (!replayPath && !replayTerminal)) return false;
      this._closedTradeProgress?.delete(closeKey);
      this._closedTradeLogKeySet.add(closeKey);
      this._closedTradeLogKeys.push(closeKey);
      if (this._closedTradeLogKeys.length > ConfigLoader.getInternalsFileValue('journal.bridgePolicy.closedTradeLogKeyLimit')) {
        const expired = this._closedTradeLogKeys.shift();
        this._closedTradeLogKeySet.delete(expired);
      }
      return true;
    } catch (err) {
      console.warn(`[TradeJournalBridge] Exit recording failed (non-critical): ${err.message}`);
      const record = TradeJournalBridge.prototype._recordVisibilityFailure.call(this, 'trade_exit_recording_exception', {
        phase: 'exit',
        source,
        orderId: data.orderId,
        action: exitActionOrNull(exitRecord, data),
        message: errorMessageOrNull(err),
        context: { exitRecord: compactTradeRecord(exitRecord) },
      });
      if (isJournalPersistenceError(err)) {
        TradeJournalBridge.prototype._recordJournalPersistenceFailure.call(this, record, err);
      }
      return false;
    }
  }

  _recordVisibilityFailure(eventType, details = {}) {
    const timestamp = new Date().toISOString();
    const sourceScope = Object.hasOwn(details, 'scope') ? details.scope
      : (details.context?.entry || details.context?.exitRecord || details.context?.activeTrade || this._primaryScope);
    const normalizedScope = normalizePatternScope(sourceScope ?? {}, 'TradeJournalBridge.visibility');
    const scope = normalizedScope.ok ? normalizedScope : null;
    const filepath = scope
      ? path.join(resolveJournalDataDir(null, this._journalBridgeConfig, scope), 'trade-visibility-failures.jsonl')
      : null;
    const fallbackPath = this.visibilityFailureFallbackPath;
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
      journalStatus: isJournalFailureEventType(eventType) ? 'unjournaled' : null,
      trustStatus: isJournalFailureEventType(eventType) ? 'untrusted' : null,
      manualReconciliationRequired: details.manualReconciliationRequired === true || isJournalFailureEventType(eventType),
    };

    const bundle = scope && this._journalBundles.get(scope.scopeKey);
    if (bundle && isJournalFailureEventType(eventType)) this._rememberJournalGap(bundle, record);
    console.error(`[TradeJournalBridge] ${record.eventType}: ${record.message || 'reporting unavailable'}`);
    TradeJournalBridge.prototype._emitJournalReconciliationTrace.call(this, record);

    if (filepath) {
      try {
        fs.mkdirSync(path.dirname(filepath), { recursive: true });
        record.visibilityLedgerPersisted = true;
        fs.appendFileSync(filepath, `${JSON.stringify(record)}\n`, 'utf8');
      } catch (err) {
        record.visibilityLedgerPersisted = false;
        record.visibilityLedgerError = errorMessageOrNull(err);
        console.error(`[TradeJournalBridge] Failed to append trade visibility failure ledger: ${err.message}`);
        if (record.manualReconciliationRequired && isJournalPersistenceError(err)) {
          TradeJournalBridge.prototype._recordJournalPersistenceFailure.call(this, record, err);
        }
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

  _emitJournalReconciliationTrace(record) {
    this.context.emitTrace('TRADE_JOURNAL_RECONCILIATION_REQUIRED', {
      ...record.scope,
      symbol: record.context?.entry?.symbol || record.context?.exitRecord?.symbol || record.scope?.symbol || null,
      orderId: record.orderId,
      action: record.action,
      phase: record.phase,
      source: record.source,
      eventType: record.eventType,
      reason: record.message,
      journalStatus: 'unjournaled',
      trustStatus: 'untrusted',
      manualReconciliationRequired: true,
    });
  }

  _recordJournalPersistenceFailure(record, err) {
    if (record?.journalPersistenceFailureRecorded === true) {
      return {
        tradingAction: 'none',
        alreadyRecorded: true,
        failureStreak: this._journalPersistenceFailureStreak,
      };
    }
    if (record) {
      record.journalPersistenceFailureRecorded = true;
    }
    this._journalPersistenceFailureStreak = Number.isInteger(this._journalPersistenceFailureStreak)
      ? this._journalPersistenceFailureStreak + 1
      : 1;
    record.journalPersistenceFailureStreak = this._journalPersistenceFailureStreak;
    record.journalPersistenceErrorCode = nonEmptyStringOrNull(err?.code);
    record.journalPersistenceStatus = 'failed';

    const reason = `[TradeJournalBridge] journal persistence failed ${this._journalPersistenceFailureStreak} consecutive time(s): ${errorMessageOrNull(err) || 'unknown error'}`;
    console.error(reason);
    this.context.emitTrace('TRADE_JOURNAL_PERSISTENCE_FAILED', {
      ...record.scope,
      symbol: record.context?.entry?.symbol || record.context?.exitRecord?.symbol || record.scope?.symbol || null,
      orderId: record.orderId,
      action: record.action,
      phase: record.phase,
      source: record.source || 'TradeJournalBridge',
      reason,
      failureStreak: this._journalPersistenceFailureStreak,
      journalStatus: 'infrastructure_down',
      trustStatus: 'untrusted',
      manualReconciliationRequired: true,
      tradingAction: 'none',
    });
    return { tradingAction: 'none', failureStreak: this._journalPersistenceFailureStreak };
  }

  _recordJournalPersistenceSuccess(context = {}) {
    if (!Number.isInteger(this._journalPersistenceFailureStreak) || this._journalPersistenceFailureStreak === 0) {
      return { tradingAction: 'none', reason: 'no_failure_streak' };
    }

    const previousStreak = this._journalPersistenceFailureStreak;
    this._journalPersistenceFailureStreak = 0;
    this.context.emitTrace('TRADE_JOURNAL_PERSISTENCE_RECOVERED', {
      symbol: context.symbol || null,
      orderId: context.orderId || null,
      action: context.action || null,
      phase: context.phase || null,
      source: context.source || 'TradeJournalBridge',
      previousFailureStreak: previousStreak,
      reason: 'journal write succeeded after persistence failure',
      tradingAction: 'none',
    });
    return { tradingAction: 'none', previousFailureStreak: previousStreak };
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
    const maxPending = Math.max(1, Math.floor(this._maxPendingVisibilityErrors));
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
    context.droppedOrderIds = [...context.droppedOrderIds, ...droppedOrderIds].slice(ConfigLoader.getInternalsFileValue('journal.bridgePolicy.droppedOrderIdsSliceStart'));
    context.droppedEventTypes = [...context.droppedEventTypes, ...droppedEventTypes].slice(ConfigLoader.getInternalsFileValue('journal.bridgePolicy.droppedEventTypesSliceStart'));
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

    this._journalMessageHandler = (msg) => {
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
        this._recordVisibilityFailure('journal_request_failed', {
          phase: 'dashboard', source: msg.type, message: errorMessageOrNull(err),
          manualReconciliationRequired: true,
        });
      }
    };

    this._tryDirectWsHook();
  }

  _tryDirectWsHook() {
    const handler = this._journalMessageHandler;

    if (this._dashboardHookTimer) clearInterval(this._dashboardHookTimer);
    this._dashboardHookTimer = setInterval(() => {
      const dashboardWs = this.context.readDashboardSocket();
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
    }, this._journalBridgeConfig.dashboardHookIntervalMs);
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
      this._sendJournalSnapshot();
    }, this._journalBridgeConfig.broadcastIntervalMs);
  }


  // ════════════════════════════════════════════════════════════════════════
  // SEND HELPERS
  // ════════════════════════════════════════════════════════════════════════

  _send(payload) {
    try {
      const dashboardWs = this.context.readDashboardSocket();
      if (dashboardWs && dashboardWs.readyState === 1) {
        dashboardWs.send(JSON.stringify(payload));
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
    const result = this._accountReport();
    if (result.status !== 'available') return { module: 'TradeJournal', ...result };
    const { report, ...metadata } = result;
    return { ...report.getSnapshot(), ...metadata, scopeMode: 'active-account', history: 'all_persisted_closed_fills' };
  }

  _combinedReplayList(limit = ConfigLoader.getInternalsFileValue('journal.bridgePolicy.combinedReplayDefaultLimit')) {
    return TradeJournalBridge.prototype._allJournalBundles.call(this)
      .flatMap(bundle => bundle.replay?.listReplays?.(limit) || [])
      .sort((a, b) => Number(b.savedAt || b.timestamp || 0) - Number(a.savedAt || a.timestamp || 0))
      .slice(0, limit);
  }

  _combinedPerformanceBreakdown(dimension) {
    const result = this._accountReport();
    return result.status === 'available' ? result.report.getPerformanceBreakdown(dimension) : null;
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
    const result = this._accountReport();
    this._send({ type: 'journal_equity', status: result.status, reason: result.reason, scope: result.scope, data: result.status === 'available' ? result.report.getEquityCurve() : null });
  }

  _sendBreakdown(dimension) {
    const result = this._accountReport();
    this._send({ type: 'journal_breakdown', status: result.status, reason: result.reason, scope: result.scope, data: result.status === 'available' ? result.report.getPerformanceBreakdown(dimension) : null, dimension });
  }

  _sendCalendar() {
    const result = this._accountReport();
    this._send({ type: 'journal_calendar', status: result.status, reason: result.reason, scope: result.scope, data: result.status === 'available' ? result.report.getDailySummaries() : null });
  }

  _sendReplay(orderId) {
    if (!orderId) return;
    const data = this._loadReplay(orderId);
    this._send(data ? { type: 'replay_data', data } : { type: 'replay_not_found', orderId });
  }

  _sendReplayList(limit = ConfigLoader.getInternalsFileValue('journal.bridgePolicy.combinedReplayDefaultLimit')) {
    this._send({ type: 'replay_list', data: this._combinedReplayList(limit) });
  }

  _exportCSV() {
    const result = this._accountReport();
    if (result.status !== 'available') return this._send({ type: 'journal_export_failed', reason: result.reason });
    const fields = ['timestamp', 'orderId', 'fillId', 'brokerId', 'accountId', 'executionMode', 'symbol', 'timeframe', 'direction', 'entryPrice', 'exitPrice', 'usdValue', 'grossPnl', 'fees', 'netPnl', 'partialExit', 'holdTimeMs', 'exitReason'];
    const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
    const csv = [fields.join(','), ...result.report.trades.map(row => fields.map(field => quote(row[field])).join(','))].join('\n');
    this._writeReportExport(result, 'csv', csv);
  }

  _exportReport() {
    const result = this._accountReport();
    if (result.status !== 'available') return this._send({ type: 'journal_export_failed', reason: result.reason });
    const { report, ...metadata } = result;
    this._writeReportExport(result, 'json', JSON.stringify({ ...report.exportReport(), ...metadata }, null, 2));
  }

  _writeReportExport(result, format, content) {
    const account = [result.scope.executionMode, result.scope.brokerId, result.scope.accountId].map(encodeURIComponent).join('--');
    const filepath = path.join(this._journalBridgeConfig.journalRoot, 'exports', `${account}-${new Date().toISOString().slice(0, 10)}.${format}`);
    try {
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
      require('./AtomicWrite').writeStringAtomic(filepath, content, 'utf8');
      this._send({ type: 'journal_export_complete', format, path: filepath, scope: result.scope });
    } catch (error) {
      this._recordVisibilityFailure('journal_export_failed', { phase: 'export', source: filepath, message: errorMessageOrNull(error) });
      this._send({ type: 'journal_export_failed', reason: errorMessageOrNull(error) });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ════════════════════════════════════════════════════════════════════════

  destroy() {
    if (this._broadcastTimer) clearInterval(this._broadcastTimer);
    if (this._dashboardHookTimer) clearInterval(this._dashboardHookTimer);
    const failures = [];
    for (const bundle of this._allJournalBundles()) {
      try {
        const result = bundle.journal?.destroy?.();
        if (result === false || result?.success === false) {
          failures.push({
            code: result?.code || 'TRADE_JOURNAL_DESTROY_FAILED',
            reason: result?.reason || 'journal destroy reported failure',
          });
        }
      } catch (error) {
        failures.push({ code: error.code || 'TRADE_JOURNAL_DESTROY_FAILED', reason: error.message });
      }
    }
    if (failures.length > 0) {
      return {
        success: false,
        code: 'TRADE_JOURNAL_BRIDGE_DESTROY_INCOMPLETE',
        reason: failures.map((failure) => failure.reason).join('; '),
        failures,
      };
    }
    console.log('[TradeJournalBridge] Destroyed');
    return { success: true };
  }
}

module.exports = { TradeJournalBridge, TradeJournal, TradeReplayCapture, resolveJournalScope, resolveJournalDataDir, resolveReplayDir, resolveReplayPriceHistory };
