/**
 * OrderExecutor - Phase 14 Extraction
 *
 * EXACT COPY of executeTrade() from run-empire-v2.js
 * NO logic changes. Just moved to separate file.
 *
 * Dependencies passed via context object in constructor.
 *
 * @module core/OrderExecutor
 */

'use strict';

const { getInstance: getStateManager } = require('./StateManager');
const ConfigLoader = require('../foundation/ConfigLoader');
const exitContractManager = require('./ExitContractManager');
const { getBrokerInfo } = require('../brokers/BrokerRegistry');
// Phase 4 REWRITE: FeatureFlagManager removed - AGGRESSIVE_LEARNING_MODE deleted
const { TradingProofLogger } = require('../ogz-meta/claudito-logger');
const { getInstance: getUnifiedPatternMemory } = require('./UnifiedPatternMemory');  // CHANGE 2026-03-18: Unified pattern store
const { getPIDController } = require('./PIDController');  // FIX 2026-04-05: Adaptive parameter optimization
const { createTraceId, emitTrace } = require('./TraceSpine');
const { getNarrator } = require('./TradeNarrator');
const FeeModel = require('./FeeModel');
const { assertExplicitExitOwnership } = require('./dto/ExitContractOwnership');
const PolicyBuilder = require('./PolicyBuilder');
const { positionEffectFromAction } = require('./PositionEffect');

const stateManager = getStateManager();
const SUPPORTED_ACTIONS = new Set(['BUY', 'SELL_SHORT', 'SELL', 'COVER']);
const DIRECTION_INTEGRITY_EXIT_REFUSAL = 'direction_integrity_exit_refusal';

// CHANGE 2026-03-17: Module-level constants removed, use ctx.backtestFast/backtestMode/paperTrading
// These are now injected via constructor from ConfigLoader

class OrderExecutor {
  constructor(ctx) {
    // Store entire context - all dependencies from runner
    this.ctx = ctx;

    // Local state
    this.pendingTraiDecisions = ctx.pendingTraiDecisions || new Map();
    this.tradeExitCount = 0;

    console.log('[OrderExecutor] Initialized (Phase 14 - exact copy)');
  }

  _isEntryAction(action) {
    return action === 'BUY' || action === 'SELL_SHORT';
  }

  _isExitAction(action) {
    return action === 'SELL' || action === 'COVER';
  }

  _activeTradeDirection(trade) {
    const direction = String(trade?.direction || '').trim().toLowerCase();
    const action = String(trade?.action || '').trim().toUpperCase();
    const directionSide = direction === 'long' || direction === 'short' ? direction : null;
    const actionSide = action === 'BUY'
      ? 'long'
      : (action === 'SELL_SHORT' ? 'short' : null);
    if (directionSide && actionSide && directionSide !== actionSide) {
      return null;
    }
    return directionSide || actionSide;
  }

  async _haltDirectionIntegrityExitRefusal({ symbol, reason, traceId, signalId, decisionId, tradeId, action, metadata = {} }) {
    const haltSymbol = this._firstNonEmptyString(symbol, this.ctx.tradingPair);
    if (!haltSymbol) {
      emitTrace(this.ctx, 'DIRECTION_INTEGRITY_EXIT_REFUSAL_UNHALTED', {
        traceId,
        signalId,
        decisionId,
        action,
        tradeId,
        reason,
      });
      console.error(`[EXECUTION-FILL] Direction integrity refusal could not halt missing symbol: ${reason}`);
      return { success: false, reason: 'missing_symbol' };
    }

    if (
      typeof stateManager.getSymbolHaltCode === 'function'
      && stateManager.getSymbolHaltCode(haltSymbol) === DIRECTION_INTEGRITY_EXIT_REFUSAL
    ) {
      emitTrace(this.ctx, 'DIRECTION_INTEGRITY_EXIT_REFUSAL_STANDING', {
        traceId,
        signalId,
        decisionId,
        symbol: haltSymbol,
        action,
        tradeId,
        reason,
      });
      return { success: true, alreadyHalted: true, reason: DIRECTION_INTEGRITY_EXIT_REFUSAL };
    }

    const haltReason = `[EXECUTION-FILL] ${haltSymbol} direction integrity exit refusal (${reason}); operator must reconcile active trade identity before exits resume`;
    const haltResult = typeof stateManager.haltSymbol === 'function'
      ? await stateManager.haltSymbol(haltSymbol, haltReason, {
        code: DIRECTION_INTEGRITY_EXIT_REFUSAL,
        authority: 'financial_integrity',
        financialIntegrityCritical: true,
        entryBlockScope: 'symbol',
        operatorActionRequired: true,
        manualReconciliationRequired: true,
        traceId,
        signalId,
        decisionId,
        tradeId,
        action,
        reason,
        ...metadata,
      })
      : { success: false, reason: 'missing_halt_symbol' };

    emitTrace(this.ctx, 'DIRECTION_INTEGRITY_EXIT_REFUSAL', {
      traceId,
      signalId,
      decisionId,
      symbol: haltSymbol,
      action,
      tradeId,
      reason,
      symbolHaltSucceeded: haltResult?.success === true,
      alreadyHalted: haltResult?.alreadyHalted === true,
      ...metadata,
    });
    console.error(`[EXECUTION-FILL] ${haltReason}`);
    return haltResult;
  }

  _shouldStoreTraiDecisionForOrder(traiDecision, decision, symbol, nowMs = Date.now()) {
    const traiSignal = traiDecision?.originalSignal || {};
    const traiDecisionAgeMs = Number.isFinite(traiDecision?.createdAt)
      ? nowMs - traiDecision.createdAt
      : null;
    return Boolean(
      traiDecision
      && traiDecision.id
      && String(traiDecision.mode || '') !== 'passive'
      && String(traiSignal.symbol || '') === String(symbol || '')
      && String(traiSignal.action || '').toUpperCase() === String(decision?.action || '').toUpperCase()
      && Number.isFinite(traiDecisionAgeMs)
      && traiDecisionAgeMs >= 0
      && traiDecisionAgeMs <= 60000
    );
  }

  _firstFiniteNumber(...values) {
    for (const value of values) {
      if (Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  }

  _firstNonEmptyString(...values) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
    return null;
  }

  _normalizePatternFeatureVector(features) {
    if (!Array.isArray(features) || features.length === 0 || features.length > 50) {
      return null;
    }
    if (!features.every(value => Number.isFinite(value))) {
      return null;
    }
    return [...features];
  }

  _entryPatternFeaturesForTrai(trade) {
    const pattern = this._firstPatternWithOutcomeFeatures(trade);
    return pattern ? [...pattern.features] : null;
  }

  _resolveStoredSizeUsd(trade, label) {
    const storedSizeUsd = this._firstFiniteNumber(trade?.sizeUsd, trade?.size);
    if (storedSizeUsd !== null && storedSizeUsd > 0) {
      return Math.abs(storedSizeUsd);
    }

    throw new Error(`[ORDER-PLAN] ${label} active trade ${trade?.orderId || trade?.id || 'missing-id'} missing positive sizeUsd/size; refusing to plan or record a zero-dollar exit`);
  }

  _buildTraiLearningIndicators(trade) {
    const entryIndicators = trade?.entryIndicators || {};
    const entryMacd = entryIndicators.macd;
    const storedIndicators = trade?.indicators || {};

    return {
      rsi: this._firstFiniteNumber(entryIndicators.rsi, storedIndicators.rsi),
      macd: this._firstFiniteNumber(
        entryMacd?.macd,
        entryMacd?.value,
        typeof entryMacd === 'number' ? entryMacd : null,
        storedIndicators.macd?.macd,
        storedIndicators.macd?.value,
        storedIndicators.macd
      ),
      macdSignal: this._firstFiniteNumber(
        entryMacd?.signal,
        entryMacd?.signalLine,
        entryIndicators.macdSignal,
        storedIndicators.macd?.signal,
        storedIndicators.macd?.signalLine,
        storedIndicators.macdSignal,
        storedIndicators.signal
      ),
      macdHistogram: this._firstFiniteNumber(
        entryMacd?.histogram,
        entryMacd?.hist,
        entryIndicators.macdHistogram,
        storedIndicators.macd?.histogram,
        storedIndicators.macd?.hist,
        storedIndicators.macdHistogram
      ),
      bbWidth: this._firstFiniteNumber(
        entryIndicators.bbWidth,
        entryIndicators.bb?.bandwidth,
        entryIndicators.bb?.width,
        entryIndicators.bollinger?.bandwidth,
        storedIndicators.bb?.bandwidth,
        storedIndicators.bb?.width,
        storedIndicators.bollinger?.bandwidth,
        storedIndicators.bbWidth
      ),
      primaryPattern: trade?.patterns?.[0]?.name ?? null
    };
  }

  _entrySide(action) {
    if (action === 'BUY') return 'buy';
    if (action === 'SELL_SHORT') return 'sell';
    throw new Error(`[ENTRY-PLAN] unsupported entry action ${action}`);
  }

  _exitSide(action) {
    if (action === 'SELL') return 'sell';
    if (action === 'COVER') return 'buy';
    throw new Error(`[ORDER-PLAN] unsupported exit action ${action}`);
  }

  _runtimeScope(symbol = null, overrides = {}, options = {}) {
    const cfg = this.ctx.config || {};
    const routerEnabled = this.ctx.runner && typeof this.ctx.runner.isSessionRoutingActive === 'function'
      ? this.ctx.runner.isSessionRoutingActive() === true
      : this.ctx.runner?.sessionRouter?.enabled === true;
    const overrideTimeframe = typeof overrides?.timeframe === 'string' && overrides.timeframe.trim() !== ''
      ? overrides.timeframe.trim()
      : null;
    const ctxTimeframe = typeof this.ctx.candleTimeframe === 'string' && this.ctx.candleTimeframe.trim() !== ''
      ? this.ctx.candleTimeframe.trim()
      : null;
    const runnerTimeframe = overrideTimeframe !== null ? overrideTimeframe : ctxTimeframe;
    const runnerScope = this.ctx.runner && typeof this.ctx.runner.getCandleScopeEnvelope === 'function'
      ? this.ctx.runner.getCandleScopeEnvelope({ timeframe: runnerTimeframe })
      : {};
    const cleanOverrides = Object.fromEntries(
      Object.entries(overrides || {}).filter(([, value]) => value !== undefined && value !== null)
    );
    const scoped = options.preferOverrides
      ? { ...runnerScope, ...cleanOverrides }
      : { ...cleanOverrides, ...runnerScope };
    const accountId = scoped.accountId || (!routerEnabled ? cfg.accountId : null) || 'default';
    const scope = {
      symbol,
      brokerId: scoped.brokerId || (!routerEnabled ? cfg.brokerId : null),
      accountId,
      accountIdSource: scoped.accountIdSource || cfg.accountIdSource || (accountId !== 'default' ? 'config' : 'default'),
      assetClass: scoped.assetClass || (!routerEnabled ? cfg.assetClass : null),
      executionMode: cfg.enableBacktestMode ? 'backtest' : (scoped.executionMode || (!routerEnabled ? cfg.executionMode : null)),
      timeframe: scoped.timeframe || (!routerEnabled ? (cfg.timeframe || this.ctx.candleTimeframe) : null),
    };
    if (routerEnabled) {
      const missing = [];
      const hasText = (value) => value !== null && value !== undefined && String(value).trim() !== '';
      if (!hasText(scope.brokerId)) missing.push('brokerId');
      if (!hasText(scope.accountId) || scope.accountId === 'default' || scope.accountIdSource === 'default') missing.push('accountId');
      if (!hasText(scope.assetClass)) missing.push('assetClass');
      if (!hasText(scope.executionMode)) missing.push('executionMode');
      if (!hasText(scope.timeframe)) missing.push('timeframe');
      if (missing.length > 0) {
        throw new Error(`[SESSION-SCOPE] OrderExecutor runtime scope incomplete (${missing.join(', ')}) - refusing static config fallback`);
      }
    }
    return scope;
  }

  _emitSymbolCooldownGateEvent({ traceId, signalId, symbol, action, reason, detail, executionScope }) {
    const ws = this.ctx.dashboardWs;
    if (!ws || ws.readyState !== 1 || typeof ws.send !== 'function') return false;

    const gate = {
      gate: 'symbol_cooldown',
      passed: false,
      rejectReason: detail || reason || 'symbol cooldown active',
    };
    const frame = {
      type: 'gate_event',
      timestamp: Date.now(),
      traceId: traceId || null,
      signalId: signalId || null,
      symbol,
      action,
      kind: 'risk_block',
      passed: false,
      reason: reason || 'symbol_cooldown',
      riskGates: [gate],
      brokerId: executionScope?.brokerId || null,
      accountId: executionScope?.accountId || null,
      assetClass: executionScope?.assetClass || null,
      executionMode: executionScope?.executionMode || null,
      timeframe: executionScope?.timeframe || null,
      data: {
        symbol,
        action,
        kind: 'risk_block',
        passed: false,
        reason: reason || 'symbol_cooldown',
        riskGates: [gate],
        traceId: traceId || null,
        signalId: signalId || null,
        brokerId: executionScope?.brokerId || null,
        accountId: executionScope?.accountId || null,
        assetClass: executionScope?.assetClass || null,
        executionMode: executionScope?.executionMode || null,
        timeframe: executionScope?.timeframe || null,
      },
    };

    try {
      ws.send(JSON.stringify(frame));
      return true;
    } catch (err) {
      console.warn(`[GateMeter] symbol_cooldown gate_event send failed: ${err.message}`);
      return false;
    }
  }

  _buildEvalQuarantineRiskGates(gateResult) {
    const inputs = gateResult?.inputs;
    const staleFields = Array.isArray(inputs?.staleFields) ? inputs.staleFields : [];
    if (inputs?.staleDataQuarantine !== true || staleFields.length === 0) {
      return [];
    }

    return staleFields.map(field => ({
      gate: 'ttp_operational_data_quarantine',
      passed: true,
      status: 'quarantined',
      trusted: false,
      contributed: false,
      calendarMemoryWriteAllowed: false,
      field: field.field || null,
      value: field.value ?? null,
      expected: field.expected ?? null,
      ageDays: Number.isFinite(Number(field.ageDays)) ? Number(field.ageDays) : null,
      reason: field.reason || 'stale_ttp_operational_data',
      message: field.message || 'Stale TTP operational data is quarantined; trading continues',
    }));
  }

  _buildOperationalQuarantine(gateResult, riskGates) {
    const inputs = gateResult?.inputs;
    const fields = Array.isArray(inputs?.staleFields) ? inputs.staleFields : [];
    if (inputs?.staleDataQuarantine !== true) {
      return null;
    }

    return {
      status: 'quarantined',
      trusted: false,
      source: 'EvalRuleEngine',
      fields,
      alerts: Array.isArray(inputs?.quarantineAlerts) ? inputs.quarantineAlerts : riskGates,
      policy: inputs.policy || 'stale_ttp_data_quarantined_trading_continues',
    };
  }

  _emitTtpQuarantineGateEvent({ traceId, signalId, symbol, action, riskGates, executionScope }) {
    if (!Array.isArray(riskGates) || riskGates.length === 0) return false;
    const fieldSummary = riskGates
      .map(gate => `${gate.field || 'unknown'}${Number.isFinite(gate.ageDays) ? ` ageDays=${gate.ageDays}` : ''}`)
      .join(', ');
    console.warn(`[TTP-QUARANTINE] ${action} ${symbol} trading continues with quarantined stale operational data: ${fieldSummary}`);

    emitTrace(this.ctx, 'TTP_STALE_DATA_QUARANTINE', {
      traceId,
      signalId,
      symbol,
      action,
      riskGates,
      policy: 'stale_ttp_data_quarantined_trading_continues',
    });

    const ws = this.ctx.dashboardWs;
    if (!ws || ws.readyState !== 1 || typeof ws.send !== 'function') return false;

    const frame = {
      type: 'gate_event',
      timestamp: Date.now(),
      traceId: traceId || null,
      signalId: signalId || null,
      symbol,
      action,
      kind: 'quarantine',
      passed: true,
      reason: 'ttp_operational_data_quarantine',
      riskGates,
      brokerId: executionScope?.brokerId || null,
      accountId: executionScope?.accountId || null,
      assetClass: executionScope?.assetClass || null,
      executionMode: executionScope?.executionMode || null,
      timeframe: executionScope?.timeframe || null,
      data: {
        symbol,
        action,
        kind: 'quarantine',
        passed: true,
        reason: 'ttp_operational_data_quarantine',
        riskGates,
        traceId: traceId || null,
        signalId: signalId || null,
        brokerId: executionScope?.brokerId || null,
        accountId: executionScope?.accountId || null,
        assetClass: executionScope?.assetClass || null,
        executionMode: executionScope?.executionMode || null,
        timeframe: executionScope?.timeframe || null,
      },
    };

    try {
      ws.send(JSON.stringify(frame));
      return true;
    } catch (err) {
      console.warn(`[GateMeter] ttp_operational_data_quarantine gate_event send failed: ${err.message}`);
      return false;
    }
  }

  _orderQuantityUnit(scope = null) {
    const assetClass = String((scope && scope.assetClass) || this._runtimeScope().assetClass || '').trim().toLowerCase();
    if (['stocks', 'stock', 'equities', 'equity', 'etfs', 'etf'].includes(assetClass)) {
      return 'shares';
    }
    if (['crypto', 'cryptos', 'cryptocurrency', 'forex', 'fx', 'futures', 'future'].includes(assetClass)) {
      return 'base';
    }
    throw new Error(`[ORDER-PLAN] unsupported assetClass ${JSON.stringify(assetClass)} for broker quantity planning`);
  }

  _supportsFractionalOrderQuantity(scope = null) {
    if (this._orderQuantityUnit(scope) !== 'shares') {
      return true;
    }

    const brokerId = String((scope && scope.brokerId) || this._runtimeScope(scope?.symbol || null).brokerId || '').trim().toLowerCase();
    if (!brokerId) {
      return false;
    }

    const brokerInfo = getBrokerInfo(brokerId);
    if (Array.isArray(brokerInfo?.features) && brokerInfo.features.some(feature => String(feature).toLowerCase() === 'fractional')) {
      return true;
    }

    const scopedAdapter = this.ctx[`${brokerId}Adapter`];
    if (scopedAdapter && typeof scopedAdapter.supportsFractionalShares === 'function') {
      return scopedAdapter.supportsFractionalShares() === true;
    }

    const brokerAdapter = this.ctx.brokerAdapter || this.ctx.broker;
    if (brokerAdapter && typeof brokerAdapter.supportsFractionalShares === 'function') {
      const adapterBrokerName = typeof brokerAdapter.getBrokerName === 'function'
        ? String(brokerAdapter.getBrokerName()).trim().toLowerCase()
        : '';
      if (this._brokerNameMatchesBrokerId(adapterBrokerName, brokerId, brokerInfo)) {
        return brokerAdapter.supportsFractionalShares() === true;
      }
    }

    return false;
  }

  _brokerNameMatchesBrokerId(adapterBrokerName, brokerId, brokerInfo = null) {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedAdapterName = normalize(adapterBrokerName);
    const normalizedBrokerId = normalize(brokerId);
    const normalizedRegistryName = normalize(brokerInfo?.name);

    if (!normalizedAdapterName || !normalizedBrokerId) {
      return false;
    }
    return normalizedAdapterName === normalizedBrokerId
      || (normalizedRegistryName && normalizedAdapterName === normalizedRegistryName);
  }

  _normalizeOrderQuantity(rawQuantity, scope = null, options = {}) {
    const forceWholeShares = options.forceWholeShares === true;
    if (this._orderQuantityUnit(scope) !== 'shares' || (!forceWholeShares && this._supportsFractionalOrderQuantity(scope))) {
      return rawQuantity;
    }

    const orderQuantity = Math.floor(rawQuantity);
    if (
      options.allowMinimumShare === true
      && orderQuantity <= 0
      && rawQuantity > 0
      && Number(options.remainingOrderQuantity) >= 1
    ) {
      return 1;
    }
    return orderQuantity;
  }

  _orderQuantityFromSizeUsd(sizeUsd, price, scope = null, options = {}) {
    if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) {
      throw new Error(`[ORDER-PLAN] invalid sizeUsd ${sizeUsd}`);
    }
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`[ORDER-PLAN] invalid price ${price}`);
    }

    const rawQuantity = sizeUsd / price;
    return this._normalizeOrderQuantity(rawQuantity, scope, options);
  }

  _acceptedOrderQuantity(orderResult, plannedQuantity) {
    if (!Number.isFinite(plannedQuantity) || plannedQuantity <= 0) {
      throw new Error(`[ORDER-PLAN] planned order quantity invalid: ${plannedQuantity}`);
    }
    const tolerance = Math.max(Math.abs(plannedQuantity) * 1e-8, 1e-12);
    const explicitQuantity = Number(orderResult?.qty ?? orderResult?.quantity);
    if (Number.isFinite(explicitQuantity) && explicitQuantity > 0) {
      if (explicitQuantity > plannedQuantity + tolerance) {
        throw new Error(`[ORDER-PLAN] accepted order quantity ${explicitQuantity} exceeds planned quantity ${plannedQuantity}`);
      }
      return explicitQuantity;
    }

    const brokerQuantity = Number(orderResult?.amount);
    if (Number.isFinite(brokerQuantity) && brokerQuantity > 0) {
      if (Math.abs(brokerQuantity - plannedQuantity) > tolerance) {
        throw new Error(`[ORDER-PLAN] broker amount ${brokerQuantity} differs from planned quantity ${plannedQuantity}; refusing to interpret ambiguous amount as quantity`);
      }
      return brokerQuantity;
    }
    return plannedQuantity;
  }

  _acceptedOrderSizeUsd(orderPlan, acceptedQuantity) {
    const plannedQuantity = Number(orderPlan?.orderQuantity);
    const plannedSizeUsd = Number(orderPlan?.sizeUsd);
    if (!Number.isFinite(plannedQuantity) || plannedQuantity <= 0) {
      throw new Error(`[ORDER-PLAN] planned order quantity invalid for size resolution: ${plannedQuantity}`);
    }
    if (!Number.isFinite(plannedSizeUsd) || plannedSizeUsd <= 0) {
      throw new Error(`[ORDER-PLAN] planned order USD invalid for size resolution: ${plannedSizeUsd}`);
    }
    if (!Number.isFinite(acceptedQuantity) || acceptedQuantity <= 0) {
      throw new Error(`[ORDER-PLAN] accepted order quantity invalid for size resolution: ${acceptedQuantity}`);
    }
    return plannedSizeUsd * (acceptedQuantity / plannedQuantity);
  }

  _tradeRemainingOrderQuantity(trade) {
    const quantity = Number(trade?.remainingOrderQuantity);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
  }

  _webhookQuantityBlockReason(quantity, quantityUnit) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return 'non_positive_quantity';
    }
    if (quantityUnit === 'shares' && !Number.isInteger(quantity)) {
      return 'fractional_share_quantity';
    }
    return null;
  }

  _webhookExecutionBlockReason(orderPlan, action = null) {
    if (!orderPlan) {
      return 'webhook_missing_order_plan';
    }
    if (this.ctx.webhookAdapter?.dryRun !== false) {
      return 'webhook_dry_run';
    }
    const quantityReason = this._webhookQuantityBlockReason(orderPlan.orderQuantity, orderPlan.quantityUnit);
    return quantityReason ? `webhook_${quantityReason}` : null;
  }

  _webhookSignalForOrderPlan(action, orderPlan) {
    if (!SUPPORTED_ACTIONS.has(action)) {
      throw new Error(`[WEBHOOK-ORDER] unsupported action ${JSON.stringify(action)} for webhook signal`);
    }
    const webhookAction = (action === 'BUY' || action === 'COVER') ? 'buy' : 'sell';
    return {
      action: webhookAction,
      symbol: orderPlan.symbol,
      quantity: orderPlan.orderQuantity,
      quantityUnit: orderPlan.quantityUnit,
      orderType: 'market',
      ...(this._isExitAction(action) ? { bypassThrottle: true } : {}),
    };
  }

  _expectedWebhookAction(action) {
    if (!SUPPORTED_ACTIONS.has(action)) {
      throw new Error(`[WEBHOOK-ORDER] unsupported action ${JSON.stringify(action)} for webhook signal`);
    }
    return (action === 'BUY' || action === 'COVER') ? 'buy' : 'sell';
  }

  _extractWebhookOrderId(result = {}) {
    const directId = result?.orderId || result?.id;
    if (typeof directId === 'string' && directId.trim()) {
      return directId.trim();
    }

    const response = result?.response || {};
    const responseId = response?.orderId || response?.order_id || response?.id;
    if (typeof responseId === 'string' && responseId.trim()) {
      return responseId.trim();
    }

    if (typeof response?.body === 'string' && response.body.trim()) {
      try {
        const parsed = JSON.parse(response.body);
        const parsedId = parsed?.orderId || parsed?.order_id || parsed?.id;
        if (typeof parsedId === 'string' && parsedId.trim()) {
          return parsedId.trim();
        }
      } catch (_) {
        return null;
      }
    }

    return null;
  }

  _webhookCorrelationOrderId(action, orderPlan, decisionId) {
    const symbol = String(orderPlan?.symbol || 'UNKNOWN').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    const actionKey = String(action || 'ORDER').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    const decisionKey = String(decisionId || `dec_${Date.now()}`).trim().replace(/[^A-Za-z0-9_-]+/g, '_');
    return `WEBHOOK_PENDING_${actionKey}_${symbol}_${decisionKey}`;
  }

  _webhookResponseBody(result = {}) {
    const body = result?.response?.body;
    return typeof body === 'string' ? body : '';
  }

  _webhookResponseJson(result = {}) {
    const body = this._webhookResponseBody(result);
    if (!body.trim()) return null;
    try {
      return JSON.parse(body);
    } catch (_) {
      return null;
    }
  }

  _isWebhookBrokerFlatResult(action, result = {}) {
    if (!this._isExitAction(action)) return false;
    return this._webhookResponseBody(result)
      .toLowerCase()
      .includes('no open positions for the asset');
  }

  _extractWebhookFillProof(action, result = {}) {
    if (!this._isExitAction(action)) return null;
    const parsed = this._webhookResponseJson(result) || {};
    const statusText = String(
      result?.status
        || result?.orderStatus
        || result?.fillStatus
        || parsed?.status
        || parsed?.orderStatus
        || parsed?.order_status
        || parsed?.fillStatus
        || parsed?.fill_status
        || parsed?.status_description
        || ''
    ).trim().toLowerCase();
    const terminalFillStatuses = new Set(['filled', 'fill', 'executed', 'complete', 'completed']);
    if (!terminalFillStatuses.has(statusText)) {
      return null;
    }

    const filledQuantity = [
      result?.filledQuantity,
      result?.filledQty,
      result?.executedQuantity,
      result?.executedQty,
      result?.qtyFilled,
      parsed?.filledQuantity,
      parsed?.filledQty,
      parsed?.filled_qty,
      parsed?.executedQuantity,
      parsed?.executedQty,
      parsed?.executed_qty,
      parsed?.qtyFilled,
      parsed?.qty_filled,
    ].map((value) => Number(value)).find((value) => Number.isFinite(value));
    if (!Number.isFinite(filledQuantity) || filledQuantity <= 0) {
      return null;
    }

    const orderId = this._extractWebhookOrderId(result);
    if (!orderId) {
      return null;
    }

    return {
      orderId,
      filledQuantity,
      status: statusText,
    };
  }

  _isFullExitExecution(executedExitPlan) {
    if (!executedExitPlan) return false;
    const remainingQuantity = Number(executedExitPlan.remainingOrderQuantity);
    const filledQuantity = Number(executedExitPlan.orderQuantity);
    return Number.isFinite(remainingQuantity)
      && remainingQuantity > 0
      && Number.isFinite(filledQuantity)
      && filledQuantity + 1e-9 >= remainingQuantity;
  }

  _normalizeBrokerPositionSymbol(symbol) {
    return String(symbol || '').trim().toUpperCase().replace('/', '-');
  }

  _brokerPositionSize(position) {
    const candidates = [
      position?.size,
      position?.qty,
      position?.quantity,
      position?.shares,
      position?.position,
    ];
    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value)) {
        return Math.abs(value);
      }
    }
    return null;
  }

  _matchingBrokerPositionForExit(exitPlan, positions = []) {
    const targetSymbol = this._normalizeBrokerPositionSymbol(exitPlan?.symbol);
    if (!targetSymbol || !Array.isArray(positions)) return null;
    return positions.find((position) => {
      const symbol = this._normalizeBrokerPositionSymbol(position?.symbol);
      const size = this._brokerPositionSize(position);
      return symbol === targetSymbol && size !== null && size > 1e-9;
    }) || null;
  }

  _unparseableBrokerPositionForExit(exitPlan, positions = []) {
    const targetSymbol = this._normalizeBrokerPositionSymbol(exitPlan?.symbol);
    if (!targetSymbol || !Array.isArray(positions)) return null;
    return positions.find((position) => {
      const symbol = this._normalizeBrokerPositionSymbol(position?.symbol);
      return symbol === targetSymbol && this._brokerPositionSize(position) === null;
    }) || null;
  }

  _exitIntentTtlMs() {
    const webhookTimeout = Number(this.ctx.webhookAdapter?.timeout);
    return Number.isFinite(webhookTimeout) && webhookTimeout > 0 ? webhookTimeout * 3 : 15000;
  }

  _exitIntentAgeMs(pendingExitIntent, nowMs = Date.now()) {
    const submittedAtMs = Number(pendingExitIntent?.submittedAtMs);
    return Number.isFinite(submittedAtMs) && submittedAtMs > 0 ? Math.max(0, nowMs - submittedAtMs) : null;
  }

  _exitIntentOrigin(pendingExitIntent) {
    return {
      intentId: pendingExitIntent?.intentId || null,
      lifecycleState: pendingExitIntent?.lifecycleState || null,
      submittedAtMs: Number.isFinite(Number(pendingExitIntent?.submittedAtMs)) ? Number(pendingExitIntent.submittedAtMs) : null,
      acceptedAtMs: Number.isFinite(Number(pendingExitIntent?.acceptedAtMs)) ? Number(pendingExitIntent.acceptedAtMs) : null,
      brokerOrderId: pendingExitIntent?.brokerOrderId || null,
      sourceEventId: pendingExitIntent?.sourceEventId || null,
    };
  }

  _isWebhookOrderStatusRoute() {
    return !this.ctx.backtestMode && this.ctx.webhookAdapter?.enabled === true && this.ctx.webhookAdapter?.dryRun === false;
  }

  _isWebhookExecutionPlan(exitPlan) {
    return exitPlan?.executionRoute === 'webhook' || this._isWebhookOrderStatusRoute();
  }

  _exitIntentTruthSource(exitPlan) {
    if (this._isWebhookExecutionPlan(exitPlan)) {
      return {
        venue: 'signalstack_ttp_webhook',
        source: 'none_available_in_repo',
        available: false,
        operatorReconciliationRequired: true,
      };
    }
    return {
      venue: exitPlan?.executionVenue || exitPlan?.brokerId || 'broker',
      source: 'broker_open_orders_api',
      available: true,
      operatorReconciliationRequired: false,
    };
  }

  _openOrderId(order) {
    return this._firstNonEmptyString(order?.orderId, order?.id, order?.clientOrderId, order?.client_order_id);
  }

  _openOrderSide(order) {
    const raw = this._firstNonEmptyString(order?.side, order?.action, order?.direction);
    if (!raw) return null;
    const side = raw.trim().toLowerCase();
    if (side === 'buy' || side === 'cover') return 'buy';
    if (side === 'sell' || side === 'sell_short' || side === 'short') return 'sell';
    return null;
  }

  _openOrderIsPending(order) {
    const status = this._firstNonEmptyString(order?.status, order?.state, order?.status_description, order?.statusDescription);
    if (!status) return true;
    return !new Set(['filled', 'complete', 'completed', 'cancelled', 'canceled', 'expired', 'rejected', 'failed']).has(status.trim().toLowerCase());
  }

  _matchingOpenExitOrderForIntent(exitPlan, pendingExitIntent, orders = []) {
    const targetSymbol = this._normalizeBrokerPositionSymbol(exitPlan?.symbol);
    const targetSide = exitPlan?.side === 'buy' || exitPlan?.side === 'sell' ? exitPlan.side : null;
    const pendingOrderId = this._firstNonEmptyString(pendingExitIntent?.brokerOrderId, pendingExitIntent?.orderId);
    if (!targetSymbol || !Array.isArray(orders)) return null;
    return orders.find((order) => {
      if (!this._openOrderIsPending(order)) return false;
      const orderId = this._openOrderId(order);
      const symbol = this._normalizeBrokerPositionSymbol(order?.symbol);
      const side = this._openOrderSide(order);
      if (pendingOrderId && orderId && orderId === pendingOrderId) {
        return side !== null && (!targetSide || side === targetSide);
      }
      return symbol === targetSymbol && targetSide && side === targetSide;
    }) || null;
  }

  _unmatchableOpenExitOrderForIntent(exitPlan, pendingExitIntent, orders = []) {
    const targetSymbol = this._normalizeBrokerPositionSymbol(exitPlan?.symbol);
    const targetSide = exitPlan?.side === 'buy' || exitPlan?.side === 'sell' ? exitPlan.side : null;
    const pendingOrderId = this._firstNonEmptyString(pendingExitIntent?.brokerOrderId, pendingExitIntent?.orderId);
    if (!targetSymbol || !targetSide || !Array.isArray(orders)) return null;
    return orders.find((order) => {
      if (!this._openOrderIsPending(order)) return false;
      const orderId = this._openOrderId(order);
      const symbol = this._normalizeBrokerPositionSymbol(order?.symbol);
      if (pendingOrderId && orderId && orderId === pendingOrderId) {
        return this._openOrderSide(order) === null;
      }
      return symbol === targetSymbol && this._openOrderSide(order) === null;
    }) || null;
  }

  async _readBrokerOpenOrdersForExit(exitPlan) {
    const truthSource = this._exitIntentTruthSource(exitPlan);
    if (truthSource.available !== true) {
      return { available: false, orders: [], matchingOrder: null, error: 'webhook_order_status_unavailable', truthSource };
    }
    if (exitPlan?.side !== 'buy' && exitPlan?.side !== 'sell') {
      return { available: false, orders: [], matchingOrder: null, error: 'exit_plan_side_unmatchable', truthSource };
    }
    const router = this.ctx.orderRouter;
    const adapters = router?.adapters instanceof Map ? router.adapters : null;
    if (!adapters) {
      return { available: false, orders: [], matchingOrder: null, error: 'missing_order_router_adapters', truthSource };
    }
    const targetBroker = this._firstNonEmptyString(exitPlan?.brokerId);
    const orders = [];
    let readableAdapters = 0;
    const errors = [];

    for (const [brokerName, adapter] of adapters.entries()) {
      if (targetBroker && String(brokerName || '').trim().toLowerCase() !== targetBroker.trim().toLowerCase()) {
        continue;
      }
      if (!adapter || typeof adapter.getOpenOrders !== 'function') {
        continue;
      }
      try {
        const brokerOrders = await adapter.getOpenOrders();
        readableAdapters += 1;
        for (const order of Array.isArray(brokerOrders) ? brokerOrders : []) {
          orders.push({ ...order, broker: brokerName });
        }
      } catch (err) {
        errors.push(`${brokerName}:${err?.message || 'open_order_read_failed'}`);
      }
    }

    if (readableAdapters === 0) {
      return {
        available: false,
        orders: [],
        matchingOrder: null,
        error: errors[0] || 'no_open_order_reader_for_exit_broker',
        truthSource,
      };
    }

    const unmatchableOrder = this._unmatchableOpenExitOrderForIntent(exitPlan, exitPlan?.pendingExitIntent, orders);
    if (unmatchableOrder) {
      return {
        available: false,
        orders,
        matchingOrder: null,
        error: 'open_order_side_unmatchable',
        unmatchableOrderId: this._openOrderId(unmatchableOrder),
        truthSource,
      };
    }

    return {
      available: true,
      orders,
      matchingOrder: this._matchingOpenExitOrderForIntent(exitPlan, exitPlan?.pendingExitIntent, orders),
      error: null,
      truthSource,
    };
  }

  async _releaseExitIntentWithTrace({ exitPlan, pendingExitIntent, reason, traceId, signalId, decisionId, symbol, action }) {
    const ageMs = this._exitIntentAgeMs(pendingExitIntent);
    const origin = this._exitIntentOrigin(pendingExitIntent);
    const intentId = pendingExitIntent?.intentId || null;
    if (!exitPlan?.tradeId || !intentId) {
      return { released: false, reason: 'missing_exit_intent_identity', ageMs, origin };
    }

    let released;
    try {
      released = await stateManager.releaseExitSlot(exitPlan.tradeId, intentId, { reason });
    } catch (err) {
      released = { success: false, released: false, reason: err?.message || 'release_exception' };
    }
    const releaseReason = released?.reason || released?.error || 'release_unknown';
    const ok = released?.success === true && released?.released === true;

    emitTrace(this.ctx, ok ? 'EXIT_INTENT_STALE_RELEASED' : 'EXIT_INTENT_STALE_RELEASE_FAILED', {
      traceId,
      signalId,
      decisionId,
      symbol: symbol || exitPlan.symbol,
      action: action || exitPlan.action,
      tradeId: exitPlan.tradeId,
      intentId,
      reason,
      releaseReason,
      ageMs,
      origin,
    });
    const logLine = `[EXECUTION-FILL] ${ok ? 'Released' : 'Failed to release'} exit intent ${intentId} for ${exitPlan.symbol} reason=${reason} ageMs=${ageMs ?? 'unknown'} origin=${JSON.stringify(origin)}`;
    if (ok) {
      console.warn(logLine);
    } else {
      console.error(logLine);
    }

    return { released: ok, reason: releaseReason, ageMs, origin };
  }

  async _haltExitIntentReconciliationRequired({ exitPlan, pendingExitIntent, reason, traceId, signalId, decisionId, symbol, action, truthSource }) {
    const ageMs = this._exitIntentAgeMs(pendingExitIntent);
    const origin = this._exitIntentOrigin(pendingExitIntent);
    const haltReason = `[EXIT-INTENT] ${exitPlan.symbol} pending exit intent cannot be reconciled automatically (${reason}); operator must confirm venue order/position state`;
    let haltResult = null;
    if (typeof stateManager.haltSymbol === 'function') {
      haltResult = await stateManager.haltSymbol(exitPlan.symbol, haltReason, {
        code: 'exit_intent_reconciliation_required',
        authority: 'financial_integrity',
        financialIntegrityCritical: true,
        manualReconciliationRequired: true,
        operatorActionRequired: true,
        entryBlockScope: 'symbol',
        traceId,
        signalId,
        decisionId,
        tradeId: exitPlan.tradeId,
        intentId: pendingExitIntent?.intentId || null,
        ageMs,
        origin,
        truthSource: truthSource || this._exitIntentTruthSource(exitPlan),
      });
    }

    emitTrace(this.ctx, 'EXIT_INTENT_RECONCILIATION_REQUIRED', {
      traceId,
      signalId,
      decisionId,
      symbol: symbol || exitPlan.symbol,
      action: action || exitPlan.action,
      tradeId: exitPlan.tradeId,
      intentId: pendingExitIntent?.intentId || null,
      reason,
      ageMs,
      origin,
      truthSource: truthSource || this._exitIntentTruthSource(exitPlan),
      symbolHaltSucceeded: haltResult?.success === true,
    });
    console.error(`[EXECUTION-FILL] ${haltReason} ageMs=${ageMs ?? 'unknown'} origin=${JSON.stringify(origin)}`);

    return {
      released: false,
      halted: haltResult?.success === true,
      reason: 'exit_intent_reconciliation_required',
      detail: reason,
      ageMs,
      origin,
      truthSource: truthSource || this._exitIntentTruthSource(exitPlan),
    };
  }

  async _reconcilePendingExitIntentForReservation({ exitPlan, pendingExitIntent, traceId, signalId, decisionId, symbol, action }) {
    const nowMs = Date.now();
    const ageMs = this._exitIntentAgeMs(pendingExitIntent, nowMs);
    const ttlMs = this._exitIntentTtlMs();
    const planWithPending = { ...exitPlan, pendingExitIntent };

    const openOrderState = await this._readBrokerOpenOrdersForExit(planWithPending);
    if (openOrderState.error === 'open_order_side_unmatchable' || openOrderState.error === 'exit_plan_side_unmatchable') {
      return this._haltExitIntentReconciliationRequired({
        exitPlan,
        pendingExitIntent,
        reason: openOrderState.error,
        traceId,
        signalId,
        decisionId,
        symbol,
        action,
        truthSource: openOrderState.truthSource || this._exitIntentTruthSource(exitPlan),
      });
    }
    if (openOrderState.available === true) {
      const matchingOrder = this._matchingOpenExitOrderForIntent(exitPlan, pendingExitIntent, openOrderState.orders);
      if (!matchingOrder) {
        return this._releaseExitIntentWithTrace({
          exitPlan,
          pendingExitIntent,
          reason: 'exit_intent_no_matching_open_order',
          traceId,
          signalId,
          decisionId,
          symbol,
          action,
        });
      }
      emitTrace(this.ctx, 'EXIT_INTENT_OPEN_ORDER_CONFIRMED', {
        traceId,
        signalId,
        decisionId,
        symbol: symbol || exitPlan.symbol,
        action: action || exitPlan.action,
        tradeId: exitPlan.tradeId,
        intentId: pendingExitIntent?.intentId || null,
        ageMs,
        ttlMs,
        orderId: this._openOrderId(matchingOrder),
      });
      return { released: false, reason: 'matching_open_order_confirmed', ageMs };
    }

    if (ageMs !== null && ageMs >= ttlMs) {
      return this._haltExitIntentReconciliationRequired({
        exitPlan,
        pendingExitIntent,
        reason: openOrderState.error || 'open_order_reconciliation_unavailable',
        traceId,
        signalId,
        decisionId,
        symbol,
        action,
        truthSource: openOrderState.truthSource || this._exitIntentTruthSource(exitPlan),
      });
    }

    emitTrace(this.ctx, 'EXIT_INTENT_RECONCILE_UNAVAILABLE', {
      traceId,
      signalId,
      decisionId,
      symbol: symbol || exitPlan.symbol,
      action: action || exitPlan.action,
      tradeId: exitPlan.tradeId,
      intentId: pendingExitIntent?.intentId || null,
      ageMs,
      ttlMs,
      reason: openOrderState.error || 'open_order_reconciliation_unavailable',
      truthSource: openOrderState.truthSource || this._exitIntentTruthSource(exitPlan),
    });
    return { released: false, reason: openOrderState.error || 'open_order_reconciliation_unavailable', ageMs };
  }

  _exitPlanFromActiveTrade(trade, tradeKey) {
    const tradeId = this._firstNonEmptyString(trade?.id, trade?.orderId, tradeKey);
    const symbol = this._firstNonEmptyString(trade?.symbol, this.ctx.tradingPair);
    if (!tradeId || !symbol || !trade?.pendingExitIntent?.intentId) return null;
    const direction = this._activeTradeDirection(trade);
    if (!direction) return null;
    const action = direction === 'short' ? 'COVER' : 'SELL';
    return {
      tradeId,
      symbol,
      action,
      side: action === 'COVER' ? 'buy' : 'sell',
      brokerId: this._firstNonEmptyString(trade?.brokerId, this.ctx.config?.brokerId),
      executionRoute: this._firstNonEmptyString(trade?.executionRoute),
      executionVenue: this._firstNonEmptyString(trade?.executionVenue, trade?.brokerId, this.ctx.config?.brokerId),
      marketDataBrokerId: this._firstNonEmptyString(trade?.marketDataBrokerId, trade?.brokerId, this.ctx.config?.brokerId),
      pendingExitIntent: trade.pendingExitIntent,
    };
  }

  async reconcilePersistedExitIntents(context = {}) {
    const activeTrades = stateManager.get('activeTrades');
    if (!(activeTrades instanceof Map)) {
      return { checked: 0, released: 0, reason: 'active_trades_not_map' };
    }
    let checked = 0;
    let released = 0;
    let halted = 0;
    for (const [tradeKey, trade] of activeTrades.entries()) {
      const tradeId = this._firstNonEmptyString(trade?.id, trade?.orderId, tradeKey);
      const symbol = this._firstNonEmptyString(trade?.symbol, this.ctx.tradingPair);
      if (trade?.pendingExitIntent?.intentId && !this._activeTradeDirection(trade)) {
        checked += 1;
        await this._haltDirectionIntegrityExitRefusal({
          symbol,
          reason: 'persisted_pending_exit_intent_active_trade_direction_unprovable',
          traceId: context.traceId || createTraceId('startup_exit_intent'),
          signalId: context.signalId || 'startup_exit_intent_reconcile',
          decisionId: context.decisionId || 'startup',
          tradeId,
          action: null,
          metadata: {
            intentId: trade.pendingExitIntent.intentId,
            tradeKey,
          },
        });
        halted += 1;
        continue;
      }
      const exitPlan = this._exitPlanFromActiveTrade(trade, tradeKey);
      if (!exitPlan) continue;
      checked += 1;
      const result = await this._reconcilePendingExitIntentForReservation({
        exitPlan,
        pendingExitIntent: trade.pendingExitIntent,
        traceId: context.traceId || createTraceId('startup_exit_intent'),
        signalId: context.signalId || 'startup_exit_intent_reconcile',
        decisionId: context.decisionId || 'startup',
        symbol: exitPlan.symbol,
        action: exitPlan.action,
      });
      if (result?.released === true) released += 1;
      if (result?.halted === true) halted += 1;
    }
    if (checked > 0) {
      console.warn(`[EXECUTION-FILL] Startup exit-intent reconciliation checked=${checked} released=${released} halted=${halted}`);
    }
    return { checked, released, halted, reason: 'startup_exit_intent_reconcile' };
  }

  async _readBrokerPositionForExit(exitPlan) {
    const router = this.ctx.orderRouter;
    if (!router || typeof router.getAllPositions !== 'function') {
      return { available: false, positions: [], matchingPosition: null, error: 'missing_get_all_positions' };
    }
    const scope = {
      symbols: [exitPlan.symbol],
      strict: true,
    };
    if (exitPlan.brokerId) {
      scope.brokerNames = [exitPlan.brokerId];
    }
    try {
      const positions = await router.getAllPositions(scope);
      const unparseablePosition = this._unparseableBrokerPositionForExit(exitPlan, positions);
      if (unparseablePosition) {
        return {
          available: false,
          positions,
          matchingPosition: null,
          error: 'broker_position_size_unparseable',
          unparseablePosition,
        };
      }
      const matchingPosition = this._matchingBrokerPositionForExit(exitPlan, positions);
      return { available: true, positions, matchingPosition, error: null };
    } catch (err) {
      return { available: false, positions: [], matchingPosition: null, error: err.message || 'broker_position_read_failed' };
    }
  }

  async _flattenAndHaltExitDesync({ exitPlan, matchingPosition, traceId, signalId, decisionId, reason }) {
    const positionSize = this._brokerPositionSize(matchingPosition);
    let flattenAttempted = false;
    let flattenOrderId = null;
    let flattenError = null;

    if (positionSize !== null && positionSize > 0 && this.ctx.orderRouter && typeof this.ctx.orderRouter.sendOrder === 'function') {
      flattenAttempted = true;
      try {
        const flattenResult = await this.ctx.orderRouter.sendOrder({
          symbol: exitPlan.symbol,
          side: exitPlan.side,
          amount: positionSize,
          type: 'market',
          traceId,
          signalId,
          decisionId,
          options: {
            quantityUnit: exitPlan.quantityUnit,
            exitReason: 'exit_rail_desync_flatten',
            sourceTradeId: exitPlan.tradeId,
          },
        });
        flattenOrderId = flattenResult?.orderId || flattenResult?.id || null;
      } catch (err) {
        flattenError = err.message;
      }
    }

    const haltReason = `EXIT-RAIL: broker position still open after confirmed full exit for ${exitPlan.symbol}`;
    await stateManager.haltSymbol(exitPlan.symbol, haltReason, {
      code: 'exit_rail_broker_desync',
      authority: 'financial_integrity',
      financialIntegrityCritical: true,
      entryBlockScope: 'symbol',
      operatorActionRequired: true,
      traceId,
      signalId,
      decisionId,
      tradeId: exitPlan.tradeId,
      brokerPositionSize: positionSize,
      flattenAttempted,
      flattenOrderId,
      flattenError,
      reason,
    });

    emitTrace(this.ctx, 'EXIT_RAIL_DESYNC_FLATTEN_HALT', {
      traceId,
      signalId,
      decisionId,
      symbol: exitPlan.symbol,
      action: exitPlan.action,
      orderId: exitPlan.tradeId,
      reason,
      brokerPositionSize: positionSize,
      flattenAttempted,
      flattenOrderId,
      flattenError,
      stateMutationSucceeded: false,
    });

    return {
      success: false,
      reason: 'exit_broker_desync_flatten_halt',
      orderId: null,
      tradeId: exitPlan.tradeId,
      orderAccepted: true,
      stateMutationSucceeded: false,
      brokerFlatVerified: false,
      brokerConfirmationPending: true,
      flattenAttempted,
      flattenOrderId,
      flattenError,
      brokerPositionSize: positionSize,
    };
  }

  async _verifyWebhookFullExitBrokerFlat({ executedExitPlan, tradeResult, traceId, signalId, decisionId }) {
    if (!this._isFullExitExecution(executedExitPlan)) return null;
    if (tradeResult?.brokerFillConfirmed !== true) return null;

    const brokerState = await this._readBrokerPositionForExit(executedExitPlan);
    if (!brokerState.available) {
      emitTrace(this.ctx, 'EXIT_PENDING_BROKER_FLAT_CONFIRMATION', {
        traceId,
        signalId,
        decisionId,
        symbol: executedExitPlan.symbol,
        action: executedExitPlan.action,
        orderId: tradeResult.orderId,
        tradeId: executedExitPlan.tradeId,
        reason: brokerState.error,
        orderAccepted: true,
        stateMutationSucceeded: false,
      });
      return {
        success: true,
        reason: 'exit_pending_broker_flat_confirmation',
        orderId: tradeResult.orderId,
        brokerOrderId: tradeResult.brokerOrderId === undefined ? tradeResult.orderId : tradeResult.brokerOrderId,
        orderAccepted: true,
        stateMutationSucceeded: false,
        brokerFlatVerified: false,
        brokerConfirmationPending: true,
        action: executedExitPlan.action,
        symbol: executedExitPlan.symbol,
        price: tradeResult.price,
        amount: executedExitPlan.sizeUsd,
        orderQuantity: executedExitPlan.orderQuantity,
        quantityUnit: executedExitPlan.quantityUnit,
        traceId,
        signalId,
      };
    }

    if (brokerState.matchingPosition) {
      return this._flattenAndHaltExitDesync({
        exitPlan: executedExitPlan,
        matchingPosition: brokerState.matchingPosition,
        traceId,
        signalId,
        decisionId,
        reason: 'broker_position_not_flat_after_full_exit',
      });
    }

    return { brokerFlatVerified: true };
  }

  _getActiveTradeById(orderId) {
    if (!orderId) return null;

    const activeTrades = stateManager.get('activeTrades');
    if (activeTrades instanceof Map) {
      return activeTrades.get(orderId) || null;
    }
    if (Array.isArray(activeTrades)) {
      const entry = activeTrades.find((item) => {
        const trade = Array.isArray(item) ? item[1] : item;
        return trade && (trade.orderId === orderId || trade.id === orderId);
      });
      return Array.isArray(entry) ? entry[1] : (entry || null);
    }
    if (activeTrades && typeof activeTrades === 'object') {
      return activeTrades[orderId] || null;
    }

    return null;
  }

  _sameSymbolHedgeBlock(action, symbol) {
    if (!this._isEntryAction(action) || typeof symbol !== 'string' || !symbol.trim()) {
      return null;
    }
    const nextDirection = action === 'BUY' ? 'long' : 'short';
    const oppositeDirection = nextDirection === 'long' ? 'short' : 'long';
    const activeTrades = typeof stateManager.getTradesBySymbol === 'function'
      ? stateManager.getTradesBySymbol(symbol)
      : [];
    if (!Array.isArray(activeTrades)) {
      throw new Error(`[ENTRY-HEDGE] StateManager.getTradesBySymbol(${symbol}) returned non-array ${Object.prototype.toString.call(activeTrades)}`);
    }
    const unknownDirectionTrade = activeTrades.find((trade) => {
      if (!trade || typeof trade !== 'object') return false;
      return this._activeTradeDirection(trade) === null;
    });
    if (unknownDirectionTrade) {
      return {
        reason: 'same_symbol_trade_direction_unknown',
        nextDirection,
        existingDirection: null,
        existingTradeId: unknownDirectionTrade.orderId || unknownDirectionTrade.id || null,
      };
    }

    const oppositeTrade = activeTrades.find((trade) => {
      if (!trade || typeof trade !== 'object') return false;
      const direction = this._activeTradeDirection(trade);
      return direction === oppositeDirection;
    });
    if (!oppositeTrade) return null;

    return {
      reason: 'same_symbol_hedge_blocked',
      nextDirection,
      existingDirection: oppositeDirection,
      existingTradeId: oppositeTrade.orderId || oppositeTrade.id || null,
    };
  }

  _activeTradeStrategy(trade) {
    return trade?.entryStrategy
      || trade?.strategyName
      || trade?.strategy
      || trade?.exitContract?.strategyName
      || trade?.decisionLedger?.exitContract?.strategyName
      || null;
  }

  _sameStrategyDirectionTrades(entryPlan) {
    const activeTrades = typeof stateManager.getTradesBySymbol === 'function'
      ? stateManager.getTradesBySymbol(entryPlan.symbol)
      : [];
    if (!Array.isArray(activeTrades)) {
      return [];
    }
    return activeTrades.filter((trade) => (
      trade &&
      typeof trade === 'object' &&
      this._activeTradeDirection(trade) === entryPlan.direction &&
      this._activeTradeStrategy(trade) === entryPlan.entryStrategy
    ));
  }

  _riskIfStoppedUsd(sizeUsd, exitContract) {
    const stopPercent = Math.abs(Number(exitContract?.stopLossPercent));
    if (!Number.isFinite(sizeUsd) || sizeUsd <= 0 || !Number.isFinite(stopPercent) || stopPercent <= 0) {
      return null;
    }
    return sizeUsd * (stopPercent / 100);
  }

  _entryConcurrencyBlock(entryPlan) {
    if (!entryPlan || !this._isEntryAction(entryPlan.action)) return null;

    const contract = entryPlan.exitContract || {};
    const maxConcurrentEntries = Number(contract.maxConcurrentEntries);
    if (!Number.isInteger(maxConcurrentEntries) || maxConcurrentEntries < 1) {
      return {
        reason: 'contract_max_concurrent_entries_invalid',
        entryStrategy: entryPlan.entryStrategy,
        maxConcurrentEntries: contract.maxConcurrentEntries,
      };
    }

    const sameStrategyTrades = this._sameStrategyDirectionTrades(entryPlan);
    if (sameStrategyTrades.length >= maxConcurrentEntries) {
      return {
        reason: 'contract_max_concurrent_entries',
        entryStrategy: entryPlan.entryStrategy,
        direction: entryPlan.direction,
        activeEntries: sameStrategyTrades.length,
        maxConcurrentEntries,
      };
    }
    if (sameStrategyTrades.length === 0 || entryPlan.entryGroupType === 'twin') {
      return null;
    }

    const scaleIn = contract.scaleIn;
    if (!scaleIn || scaleIn.enabled !== true) {
      return {
        reason: 'scale_in_disabled',
        entryStrategy: entryPlan.entryStrategy,
        direction: entryPlan.direction,
        activeEntries: sameStrategyTrades.length,
      };
    }

    const maxAdds = Number(scaleIn.maxAdds);
    if (!Number.isInteger(maxAdds) || maxAdds < 0 || sameStrategyTrades.length > maxAdds) {
      return {
        reason: 'scale_in_max_adds',
        entryStrategy: entryPlan.entryStrategy,
        activeEntries: sameStrategyTrades.length,
        maxAdds: scaleIn.maxAdds,
      };
    }

    const entryTriggerClass = typeof entryPlan.entryTriggerClass === 'string'
      ? entryPlan.entryTriggerClass.trim()
      : '';
    const addTriggerClass = typeof scaleIn.addTriggerClass === 'string'
      ? scaleIn.addTriggerClass.trim()
      : '';
    if (!addTriggerClass || addTriggerClass === entryTriggerClass) {
      return {
        reason: 'scale_in_trigger_class_invalid',
        entryStrategy: entryPlan.entryStrategy,
        entryTriggerClass,
        addTriggerClass,
      };
    }

    if (scaleIn.requireProfitConfirmation !== true) {
      return {
        reason: 'scale_in_profit_confirmation_required',
        entryStrategy: entryPlan.entryStrategy,
      };
    }

    const aggregateRiskCap = Number(scaleIn.aggregateRiskCap);
    if (!Number.isFinite(aggregateRiskCap) || aggregateRiskCap <= 0) {
      return {
        reason: 'scale_in_aggregate_risk_cap_invalid',
        entryStrategy: entryPlan.entryStrategy,
        aggregateRiskCap: scaleIn.aggregateRiskCap,
      };
    }

    const profitViolation = sameStrategyTrades.find((trade) => {
      const entryPrice = Number(trade.entryPrice ?? trade.price);
      if (!Number.isFinite(entryPrice) || entryPrice <= 0) return true;
      return entryPlan.direction === 'long'
        ? entryPlan.price <= entryPrice
        : entryPlan.price >= entryPrice;
    });
    if (profitViolation) {
      return {
        reason: 'scale_in_profit_confirmation',
        entryStrategy: entryPlan.entryStrategy,
        direction: entryPlan.direction,
        entryPrice: profitViolation.entryPrice ?? profitViolation.price ?? null,
        proposedPrice: entryPlan.price,
      };
    }

    const activeRisk = sameStrategyTrades.reduce((sum, trade) => {
      const risk = this._riskIfStoppedUsd(Number(trade.sizeUsd ?? trade.size), trade.exitContract || contract);
      return risk === null ? NaN : sum + risk;
    }, 0);
    const proposedRisk = this._riskIfStoppedUsd(entryPlan.sizeUsd, contract);
    const singleEntryRisk = this._riskIfStoppedUsd(entryPlan.baseSizeUsd, contract);
    if (
      !Number.isFinite(activeRisk) ||
      proposedRisk === null ||
      singleEntryRisk === null ||
      activeRisk + proposedRisk > singleEntryRisk * aggregateRiskCap + 1e-9
    ) {
      return {
        reason: 'scale_in_aggregate_risk_cap',
        entryStrategy: entryPlan.entryStrategy,
        activeRiskUsd: Number.isFinite(activeRisk) ? activeRisk : null,
        proposedRiskUsd: proposedRisk,
        singleEntryRiskUsd: singleEntryRisk,
        aggregateRiskCap,
      };
    }

    return null;
  }

  _dashboardTradePayload(payload, trade = {}) {
    const hasTradeRecord = trade && typeof trade === 'object' && Object.keys(trade).length > 0;
    const runtimeScope = hasTradeRecord ? {} : this._runtimeScope(trade.symbol || payload.symbol || null);
    const payloadSymbol = payload.symbol || null;
    const tradeSymbol = trade.symbol || null;
    const orderIdForMismatch = trade.orderId || trade.id || payload.orderId || payload.tradeId || null;
    const payloadOrderId = payload.orderId || payload.tradeId || null;
    const tradeOrderId = trade.orderId || trade.id || null;
    if (payloadSymbol && tradeSymbol && payloadSymbol !== tradeSymbol) {
      throw new Error(`dashboard trade symbol mismatch orderId=${orderIdForMismatch || 'unknown'} payload=${payloadSymbol} trade=${tradeSymbol}`);
    }
    if (payloadOrderId && tradeOrderId && payloadOrderId !== tradeOrderId) {
      throw new Error(`dashboard trade orderId mismatch payload=${payloadOrderId} trade=${tradeOrderId}`);
    }
    const brokerId = trade.brokerId || runtimeScope.brokerId || null;
    const accountId = trade.accountId || runtimeScope.accountId || 'default';
    const accountIdSource = trade.accountIdSource
      || (accountId && accountId !== 'default' ? 'config' : 'default');
    const assetClass = trade.assetClass || runtimeScope.assetClass || null;
    const executionMode = trade.executionMode || runtimeScope.executionMode || null;
    const timeframe = trade.timeframe || runtimeScope.timeframe || null;
    const scopeKey = trade.scopeKey || null;
    const scopeKeyVersion = typeof scopeKey === 'string' && scopeKey.split(':').length >= 6 ? 2 : 1;
    const symbol = trade.symbol || payload.symbol || null;
    const hasExplicitAccountId = Boolean(accountId && accountId !== 'default' && accountIdSource !== 'default');
    const orderId = trade.orderId || trade.id || payload.orderId || payload.tradeId || null;
    const strategy = trade.strategy
      || trade.strategyName
      || trade.entryStrategy
      || payload.strategy
      || payload.strategyName
      || null;
    const exitReason = trade.exitReason || payload.exitReason || null;

    return {
      ...payload,
      type: 'trade',
      tradeId: orderId,
      orderId,
      symbol,
      broker: brokerId,
      brokerId,
      accountId,
      accountIdSource,
      assetClass,
      executionMode,
      timeframe,
      scopeKey,
      scopeKeyVersion,
      scopeComplete: Boolean(symbol && brokerId && hasExplicitAccountId && assetClass && executionMode && timeframe && scopeKeyVersion >= 2),
      exitReason,
      strategy,
      strategyName: strategy,
      sizeUsd: trade.sizeUsd ?? trade.size ?? payload.sizeUsd ?? null,
      entryPrice: trade.entryPrice ?? payload.entryPrice ?? null
    };
  }

  _sendDashboardFrame(frame) {
    const ws = this.ctx.dashboardWs;
    if (!ws) {
      if (this.ctx.dashboardWsConnected === true || this._shouldLogMissingDashboardSocket()) {
        console.warn(`[OrderExecutor] dashboard ${frame?.type || 'unknown'} broadcast skipped: socket missing`);
      }
      return false;
    }
    if (ws.readyState !== 1) {
      console.warn(`[OrderExecutor] dashboard ${frame?.type || 'unknown'} broadcast skipped: socket not open readyState=${ws.readyState}`);
      return false;
    }

    try {
      ws.send(JSON.stringify(frame));
      return true;
    } catch (err) {
      console.error(`[OrderExecutor] dashboard ${frame?.type || 'unknown'} broadcast failed: ${err.message}`);
      return false;
    }
  }

  _shouldLogMissingDashboardSocket() {
    return this.ctx.backtestMode !== true && this.ctx.config?.enableBacktestMode !== true;
  }

  _firstPatternWithOutcomeFeatures(trade) {
    if (!trade || !Array.isArray(trade.patterns)) return null;
    for (const pattern of trade.patterns) {
      const features = this._normalizePatternFeatureVector(pattern?.features);
      if (features) {
        return { ...pattern, features };
      }
    }
    return null;
  }

  _patternOutcomeRecordingDisabled() {
    return this.ctx.config.tradingMode === 'TEST' || this.ctx.testMode === true;
  }

  _recordClosedTradePatternOutcome(trade, completeTradeResult, pnl, holdDuration) {
    const pattern = this._firstPatternWithOutcomeFeatures(trade);
    const patternName = this._firstNonEmptyString(pattern?.name, trade?.entryStrategy, trade?.strategy);

    if (!pattern) {
      console.log(`Pattern learning skipped: ${patternName || 'missing-pattern-name'} -> ${pnl.toFixed(2)}% (no entry features)`);
      return false;
    }

    if (this._patternOutcomeRecordingDisabled()) {
      console.log('TEST MODE: Would record P&L pattern but SKIPPING - pattern base protected');
      return false;
    }

    const outcomePnl = this._firstFiniteNumber(pnl);
    const outcomeHoldTimeMs = this._firstFiniteNumber(holdDuration);
    const outcomeExitReason = this._firstNonEmptyString(completeTradeResult.exitReason);
    const outcomeStrategy = this._firstNonEmptyString(trade.entryStrategy, trade.strategy);
    const missing = [];
    if (outcomePnl === null) missing.push('pnl');
    if (outcomeHoldTimeMs === null || outcomeHoldTimeMs <= 0) missing.push('holdTimeMs');
    if (!outcomeExitReason) missing.push('exitReason');
    if (!outcomeStrategy) missing.push('strategy');

    if (missing.length > 0) {
      this.patternOutcomeRejectedSinceHealth = (this.patternOutcomeRejectedSinceHealth || 0) + 1;
      console.warn(`[PATTERN][OUTCOME] skipped pattern=${patternName || 'missing-pattern-name'} tradeId=${trade.orderId || trade.id} missing=${missing.join(',')}`);
      return false;
    }

    const recorded = this.ctx.patternChecker.recordPatternResult(pattern.features, {
      pnl: outcomePnl,
      holdTimeMs: outcomeHoldTimeMs,
      exitReason: outcomeExitReason,
      strategy: outcomeStrategy,
      timestamp: Date.now(),
      symbol: trade.symbol,
      brokerId: trade.brokerId,
      accountId: trade.accountId,
      accountIdSource: trade.accountIdSource,
      assetClass: trade.assetClass,
      executionMode: trade.executionMode,
      timeframe: trade.timeframe,
      scopeKey: trade.scopeKey
    });

    if (!recorded) {
      this.patternOutcomeRejectedSinceHealth = (this.patternOutcomeRejectedSinceHealth || 0) + 1;
      console.error(`[PATTERN][OUTCOME] recordPatternResult rejected pattern=${patternName || 'missing-pattern-name'} tradeId=${trade.orderId || trade.id} scopeKey=${trade.scopeKey}`);
      return false;
    }
    console.log(`Pattern learning: ${patternName || 'missing-pattern-name'} -> ${outcomePnl.toFixed(2)}%`);
    return true;
  }

  _checkPatternOutcomeHealth() {
    this.tradeExitCount = (this.tradeExitCount || 0) + 1;
    const rejectedSinceHealth = this.patternOutcomeRejectedSinceHealth || 0;
    if ((this.tradeExitCount % 10 !== 0 && rejectedSinceHealth === 0) || this._patternOutcomeRecordingDisabled()) {
      return null;
    }

    if (!this.ctx.patternChecker?.memory || typeof this.ctx.patternChecker.memory.healthCheck !== 'function') {
      console.error('[PATTERN][OUTCOME] health check unavailable - patternChecker.memory.healthCheck missing while pattern outcomes are enabled');
      return {
        healthy: false,
        issues: ['patternChecker.memory.healthCheck missing']
      };
    }

    this.patternOutcomeRejectedSinceHealth = 0;
    const health = this.ctx.patternChecker.memory.healthCheck();
    const issues = Array.isArray(health.issues) ? [...health.issues] : [];
    if (rejectedSinceHealth > 0) {
      issues.push(`${rejectedSinceHealth} pattern outcome recording rejection(s) since last health check`);
    }
    const combinedHealth = {
      ...health,
      healthy: health.healthy && rejectedSinceHealth === 0,
      issues
    };
    if (!combinedHealth.healthy) {
      const issueText = issues.length > 0
        ? ` issues=${issues.join('; ')}`
        : '';
      console.error(`PATTERN SYSTEM UNHEALTHY - outcomes not recording correctly!${issueText}`);
    }
    return combinedHealth;
  }

  _broadcastDashboardTrade(payload, trade = {}) {
    try {
      return this._sendDashboardFrame(this._dashboardTradePayload(payload, trade));
    } catch (err) {
      console.error(`[OrderExecutor] dashboard trade frame build failed: ${err.message}`);
      return false;
    }
  }

  _broadcastBrokerOrderResult(baseFields, result = {}) {
    const response = result?.response || null;
    const sent = result?.sent === true;
    const orderId = this._extractWebhookOrderId(result);
    const brokerFlat = this._isWebhookBrokerFlatResult(baseFields.action, result);
    const acceptedWithoutOrderId = sent && !orderId && !brokerFlat;
    const ok = sent && !brokerFlat;
    const reason = result?.reason || (brokerFlat ? 'broker_flat_no_open_position' : acceptedWithoutOrderId ? 'accepted_without_order_id' : ok ? null : sent ? 'missing_webhook_order_id' : 'not_sent');
    const body = typeof response?.body === 'string' ? response.body.slice(0, 500) : null;
    const scope = this._runtimeScope(baseFields.symbol || null, baseFields, { preferOverrides: true });

    const frame = {
      type: ok ? 'broker_ack' : 'broker_reject',
      timestamp: Date.now(),
      ok,
      sent,
      route: 'webhook',
      traceId: baseFields.traceId || null,
      signalId: baseFields.signalId || null,
      decisionId: baseFields.decisionId || null,
      orderId: orderId || null,
      acceptedWithoutOrderId,
      symbol: baseFields.symbol || null,
      action: baseFields.action || null,
      positionEffect: positionEffectFromAction(baseFields.action),
      webhookAction: baseFields.webhookAction || null,
      quantity: baseFields.quantity ?? null,
      quantityUnit: baseFields.quantityUnit || null,
      orderType: baseFields.orderType || null,
      bypassThrottle: baseFields.bypassThrottle === true,
      brokerId: scope.brokerId,
      accountId: scope.accountId,
      assetClass: scope.assetClass,
      executionMode: scope.executionMode,
      timeframe: scope.timeframe,
      httpStatus: response?.status ?? null,
      reason,
      dryRun: reason === 'dry_run',
      responseBody: body,
      data: {
        ok,
        sent,
        route: 'webhook',
        traceId: baseFields.traceId || null,
        signalId: baseFields.signalId || null,
        decisionId: baseFields.decisionId || null,
        orderId: orderId || null,
        acceptedWithoutOrderId,
        symbol: baseFields.symbol || null,
        action: baseFields.action || null,
        webhookAction: baseFields.webhookAction || null,
        quantity: baseFields.quantity ?? null,
        quantityUnit: baseFields.quantityUnit || null,
        orderType: baseFields.orderType || null,
        bypassThrottle: baseFields.bypassThrottle === true,
        brokerId: scope.brokerId,
        accountId: scope.accountId,
        assetClass: scope.assetClass,
        executionMode: scope.executionMode,
        timeframe: scope.timeframe,
        httpStatus: response?.status ?? null,
        reason,
        dryRun: reason === 'dry_run',
        responseBody: body,
        brokerFlat,
      },
    };
    const sentFrame = this._sendDashboardFrame(frame);
    try { getNarrator().brokerResult(frame); } catch (_) { /* narrator is non-critical */ }
    return sentFrame;
  }

  _resolveAbsolutePositionCap() {
    const absoluteCap = ConfigLoader.get('entryLogic.sizing.absoluteCapPercent');
    if (!Number.isFinite(absoluteCap) || absoluteCap <= 0) {
      throw new Error(`[ABSOLUTE_POSITION_CAP] entryLogic.sizing.absoluteCapPercent must be a finite positive decimal; got ${absoluteCap}`);
    }
    return absoluteCap;
  }

  _feeModel() {
    return FeeModel.fromTradingConfig();
  }

  _calculateOrderFee({ notionalUsd, orderQuantity, side }) {
    return this._feeModel().calculateOrderFee({
      notionalUsd,
      quantity: orderQuantity,
      side,
    });
  }

  _calculateRoundTripFees({ entryNotionalUsd, exitNotionalUsd, entryQuantity, exitQuantity }) {
    return this._feeModel().calculateRoundTripFees({
      entryNotionalUsd,
      exitNotionalUsd,
      entryQuantity,
      exitQuantity,
    });
  }

  _ledgerDataWithEntryAnnotations(ledgerData, { riskGates = null, positionSizing = null, operationalQuarantine = null } = {}) {
    if (!ledgerData || typeof ledgerData !== 'object') return ledgerData || null;
    const hasRiskGates = Array.isArray(riskGates) && riskGates.length > 0;
    const hasPositionSizing = positionSizing && typeof positionSizing === 'object';
    const hasOperationalQuarantine = operationalQuarantine && typeof operationalQuarantine === 'object';
    if (!hasRiskGates && !hasPositionSizing && !hasOperationalQuarantine) return ledgerData;

    const annotatedLedgerData = { ...ledgerData };
    if (hasPositionSizing) annotatedLedgerData.positionSizing = positionSizing;
    if (hasOperationalQuarantine) annotatedLedgerData.operationalQuarantine = operationalQuarantine;
    if (hasRiskGates) {
      annotatedLedgerData.riskGates = [
        ...(Array.isArray(ledgerData.riskGates) ? ledgerData.riskGates : []),
        ...riskGates,
      ];
    }
    return annotatedLedgerData;
  }

  _buildExitIntentId(exitPlan, decision) {
    if (!exitPlan || !decision) {
      throw new Error('[EXECUTION-FILL] exit intent requires exitPlan and decision');
    }
    const tradeId = this._firstNonEmptyString(exitPlan.tradeId);
    const decisionId = this._firstNonEmptyString(decision.decisionId);
    if (!tradeId || !decisionId) {
      throw new Error(`[EXECUTION-FILL] cannot build exit intent id without tradeId and decisionId; tradeId=${tradeId} decisionId=${decisionId}`);
    }
    return `exit:${tradeId}:${decisionId}`;
  }

  _resolveContractStopPercent(exitContract) {
    if (typeof exitContract !== 'object' || exitContract === null) {
      throw new Error(`[ORDER-CONTRACT] exitContract invalid (got ${typeof exitContract}) - refusing entry without contracted stop`);
    }
    assertExplicitExitOwnership(exitContract, 'OrderExecutor._resolveContractStopPercent');

    const rawStopLossPercent = Number(exitContract.stopLossPercent);
    if (!Number.isFinite(rawStopLossPercent) || rawStopLossPercent === 0) {
      throw new Error(`[ORDER-CONTRACT] exitContract.stopLossPercent missing/invalid (got ${exitContract.stopLossPercent}) - refusing entry without contracted stop`);
    }
    if (rawStopLossPercent > 0) {
      throw new Error(`[ORDER-CONTRACT] exitContract.stopLossPercent must be negative risk distance (got ${exitContract.stopLossPercent})`);
    }

    const stopPercent = -rawStopLossPercent / 100;
    if (!Number.isFinite(stopPercent) || stopPercent <= 0 || stopPercent >= 1) {
      throw new Error(`[ORDER-CONTRACT] exitContract.stopLossPercent out of range (got ${exitContract.stopLossPercent})`);
    }

    return stopPercent;
  }

  _buildExecutionFill({ exitPlan, executedExitPlan, tradeResult, fillPrice, fee, exitIntent, lifecycleState, confirmedAtMs, eventTimeMs, simulated }) {
    const tradeId = this._firstNonEmptyString(executedExitPlan?.tradeId, exitPlan?.tradeId);
    const intentId = this._firstNonEmptyString(exitIntent?.intentId);
    const brokerOrderId = this._firstNonEmptyString(tradeResult?.orderId);
    const sourceEventId = this._firstNonEmptyString(exitIntent?.sourceEventId);
    if (!tradeId || !intentId || !brokerOrderId || !sourceEventId) {
      throw new Error(`[EXECUTION-FILL] missing required fill identity tradeId=${tradeId} intentId=${intentId} brokerOrderId=${brokerOrderId} sourceEventId=${sourceEventId}`);
    }

    const filledQuantity = Number(executedExitPlan?.orderQuantity);
    const remainingBefore = Number(exitPlan?.remainingOrderQuantity);
    const numericFillPrice = Number(fillPrice);
    const numericFee = Number(fee);
    if (!Number.isFinite(filledQuantity) || filledQuantity <= 0) {
      throw new Error(`[EXECUTION-FILL] filledQuantity must be positive for ${tradeId}; got ${executedExitPlan?.orderQuantity}`);
    }
    if (!Number.isFinite(remainingBefore) || remainingBefore <= 0) {
      throw new Error(`[EXECUTION-FILL] remainingOrderQuantity must be positive for ${tradeId}; got ${exitPlan?.remainingOrderQuantity}`);
    }
    if (!Number.isFinite(numericFillPrice) || numericFillPrice <= 0) {
      throw new Error(`[EXECUTION-FILL] fillPrice must be positive for ${tradeId}; got ${fillPrice}`);
    }
    if (!Number.isFinite(numericFee) || numericFee < 0) {
      throw new Error(`[EXECUTION-FILL] fee must be finite and non-negative for ${tradeId}; got ${fee}`);
    }

    const remainingQuantity = Math.max(0, remainingBefore - filledQuantity);
    const tolerance = 1e-9;
    const expectedExitQuantity = Number(exitPlan.orderQuantity);
    const resolvedLifecycleState = lifecycleState
      || (Number.isFinite(expectedExitQuantity) && filledQuantity + tolerance < expectedExitQuantity ? 'partial_fill' : 'full_fill');
    return {
      fillId: `${brokerOrderId}:${intentId}:${filledQuantity}`,
      brokerOrderId,
      tradeId,
      intentId,
      sourceEventId,
      lifecycleState: resolvedLifecycleState,
      positionEffect: positionEffectFromAction(exitPlan?.action),
      exitReason: this._firstNonEmptyString(executedExitPlan?.exitReason, exitPlan?.exitReason, exitPlan?.reason),
      triggeredBy: this._firstNonEmptyString(exitPlan?.triggeredBy, exitPlan?.source, 'OrderExecutor.executeTrade'),
      filledQuantity,
      filledQuantityUnit: executedExitPlan.quantityUnit,
      filledSizeUsd: filledQuantity * numericFillPrice,
      fillPrice: numericFillPrice,
      fee: numericFee,
      expectedQuantity: Number(exitPlan.orderQuantity),
      remainingQuantity,
      submittedAtMs: exitIntent.submittedAtMs,
      confirmedAtMs,
      eventTimeMs,
      expectedTradeRevision: exitIntent.tradeRevision,
      executionMode: executedExitPlan.executionMode,
      simulated,
    };
  }

  _percentDistanceDecimal(value, label) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric === 0) {
      throw new Error(`[ENTRY-SHARE-RANGE] ${label} must be a finite non-zero percent-form distance; got ${value}`);
    }
    return Math.abs(numeric) / 100;
  }

  _positiveConfigNumber(path) {
    const value = Number(ConfigLoader.get(path));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  _entryProfitDistanceDecimal(exitContract) {
    const distances = [];
    const finalTier = this._positiveConfigNumber('exits.profitTiers.final');
    if (finalTier !== null) {
      distances.push(finalTier > 1 ? finalTier / 100 : finalTier);
    }
    if (exitContract && exitContract.takeProfitPercent !== undefined) {
      distances.push(this._percentDistanceDecimal(exitContract.takeProfitPercent, 'exitContract.takeProfitPercent'));
    }
    const positiveDistances = distances.filter(value => Number.isFinite(value) && value > 0);
    if (positiveDistances.length === 0) {
      throw new Error('[ENTRY-SHARE-RANGE] no positive profit distance configured for consistency cap');
    }
    return Math.max(...positiveDistances);
  }

  _entryStopDistanceDecimal(exitContract) {
    if (!exitContract || exitContract.stopLossPercent === undefined) {
      return null;
    }
    return this._percentDistanceDecimal(exitContract.stopLossPercent, 'exitContract.stopLossPercent');
  }

  _applyStockShareRange({ orderQuantity, price, exitContract }) {
    const range = {
      enabled: ConfigLoader.get('entryLogic.sizing.stockShareRange.enabled'),
      minShares: ConfigLoader.get('entryLogic.sizing.stockShareRange.minShares'),
      maxShares: ConfigLoader.get('entryLogic.sizing.stockShareRange.maxShares'),
      maxNotionalUsd: ConfigLoader.get('entryLogic.sizing.stockShareRange.maxNotionalUsd'),
      consistencyCapBuffer: ConfigLoader.get('entryLogic.sizing.stockShareRange.consistencyCapBuffer'),
      dailyLossRiskFraction: ConfigLoader.get('entryLogic.sizing.stockShareRange.dailyLossRiskFraction'),
    };
    if (!range || range.enabled !== true) {
      return {
        orderQuantity,
        adjusted: false,
        bounds: null,
        blockReason: null,
      };
    }

    const configuredMinShares = Number(range.minShares);
    if (!Number.isFinite(configuredMinShares) || configuredMinShares < 0) {
      throw new Error(`[ENTRY-SHARE-RANGE] minShares must be a finite non-negative number; got ${range.minShares}`);
    }

    const minShares = Math.ceil(configuredMinShares);
    const caps = [];
    const reasons = [];

    const configuredMaxShares = Number(range.maxShares);
    if (Number.isFinite(configuredMaxShares) && configuredMaxShares > 0) {
      caps.push(Math.floor(configuredMaxShares));
      reasons.push('config_max_shares');
    }

    const maxNotionalUsd = Number(range.maxNotionalUsd);
    if (Number.isFinite(maxNotionalUsd) && maxNotionalUsd > 0) {
      caps.push(Math.floor(maxNotionalUsd / price));
      reasons.push('config_max_notional');
    }

    const profitTargetDollars = this._positiveConfigNumber('evalRules.ttp.consistency.profitTargetDollars');
    const maxPositionProfitRatio = this._positiveConfigNumber('evalRules.ttp.consistency.maxPositionProfitRatio');
    const consistencyCapBuffer = Number(range.consistencyCapBuffer);
    if (profitTargetDollars !== null || maxPositionProfitRatio !== null) {
      if (profitTargetDollars === null || maxPositionProfitRatio === null) {
        throw new Error('[ENTRY-SHARE-RANGE] TTP consistency cap requires both profitTargetDollars and maxPositionProfitRatio');
      }
      if (!Number.isFinite(consistencyCapBuffer) || consistencyCapBuffer <= 0 || consistencyCapBuffer > 1) {
        throw new Error(`[ENTRY-SHARE-RANGE] consistencyCapBuffer must be > 0 and <= 1; got ${range.consistencyCapBuffer}`);
      }
      const profitDistance = this._entryProfitDistanceDecimal(exitContract);
      const maxProfitDollars = profitTargetDollars * maxPositionProfitRatio * consistencyCapBuffer;
      caps.push(Math.floor(maxProfitDollars / (price * profitDistance)));
      reasons.push('ttp_consistency_profit_cap');
    }

    const dailyLossDollars = this._positiveConfigNumber('evalRules.ttp.accountLimits.dailyLossDollars');
    const dailyLossRiskFraction = Number(range.dailyLossRiskFraction);
    const stopDistance = this._entryStopDistanceDecimal(exitContract);
    if (dailyLossDollars !== null && stopDistance !== null) {
      if (!Number.isFinite(dailyLossRiskFraction) || dailyLossRiskFraction <= 0 || dailyLossRiskFraction > 1) {
        throw new Error(`[ENTRY-SHARE-RANGE] dailyLossRiskFraction must be > 0 and <= 1; got ${range.dailyLossRiskFraction}`);
      }
      caps.push(Math.floor((dailyLossDollars * dailyLossRiskFraction) / (price * stopDistance)));
      reasons.push('ttp_daily_loss_risk');
    }

    const finiteCaps = caps.filter(value => Number.isFinite(value));
    const maxShares = finiteCaps.length > 0 ? Math.min(...finiteCaps) : Infinity;
    if (Number.isFinite(maxShares) && maxShares < minShares) {
      return {
        orderQuantity: 0,
        adjusted: true,
        bounds: { minShares, maxShares, reasons },
        blockReason: `stock_share_range_impossible:min=${minShares}:max=${maxShares}`,
      };
    }

    const wholeShareQuantity = Math.floor(Number(orderQuantity));
    let boundedQuantity = wholeShareQuantity;
    if (minShares > 0 && boundedQuantity < minShares) {
      boundedQuantity = minShares;
    }
    if (Number.isFinite(maxShares) && boundedQuantity > maxShares) {
      boundedQuantity = maxShares;
    }

    return {
      orderQuantity: boundedQuantity,
      adjusted: boundedQuantity !== orderQuantity,
      bounds: { minShares, maxShares, reasons },
      blockReason: boundedQuantity > 0 ? null : 'stock_share_range_zero_quantity',
    };
  }

  _stockShareRangeFillViolation(entryPlan, executedEntryPlan) {
    if (!entryPlan?.stockShareRange || entryPlan.quantityUnit !== 'shares') {
      return null;
    }
    const orderQuantity = Number(executedEntryPlan?.orderQuantity);
    if (!Number.isFinite(orderQuantity) || orderQuantity <= 0) {
      return null;
    }

    const { minShares, maxShares } = entryPlan.stockShareRange;
    if (Number.isFinite(minShares) && minShares > 0 && orderQuantity < minShares) {
      return `stock_share_range_fill_below_min:min=${minShares}:accepted=${orderQuantity}`;
    }
    if (Number.isFinite(maxShares) && orderQuantity > maxShares) {
      return `stock_share_range_fill_above_max:max=${maxShares}:accepted=${orderQuantity}`;
    }
    return null;
  }

  async _handleStockShareRangeFillViolation({ entryPlan, executedEntryPlan, traceId, signalId, symbol, action }) {
    const violation = this._stockShareRangeFillViolation(entryPlan, executedEntryPlan);
    if (!violation) return null;

    const haltReason = `[RISK-ENTRY-SHARE-RANGE] ${violation}`;
    console.error(`[ENTRY-SHARE-RANGE] Broker accepted ${executedEntryPlan.orderQuantity} shares for ${symbol} outside configured bounds after order acceptance; recording broker truth without persisting a symbol entry halt`);
    emitTrace(this.ctx, 'ORDER_ACCEPTED_OUTSIDE_SHARE_RANGE', {
      traceId,
      signalId,
      symbol,
      action,
      positionEffect: positionEffectFromAction(action),
      reason: haltReason,
      plannedOrderQuantity: entryPlan.orderQuantity,
      acceptedOrderQuantity: executedEntryPlan.orderQuantity,
      quantityUnit: executedEntryPlan.quantityUnit,
      stockShareRange: entryPlan.stockShareRange,
      stateMutationSucceeded: true,
    });
    return haltReason;
  }

  _buildEntryPlan({ decision, symbol, price, positionSize, currentBalance, currentEquity, tradeConfidence, confidenceMultiplier, orchResult, entryVolatility, absoluteCapPercent, forceWholeShares = false }) {
    if (!this._isEntryAction(decision.action)) return null;

    const entryStrategy = orchResult.winnerStrategy;
    const sizingMultiplier = orchResult?.sizingMultiplier ?? 1.0;
    const exitContract = orchResult.exitContract;
    assertExplicitExitOwnership(exitContract, 'OrderExecutor._buildEntryPlan');
    const frozenExitPolicy = PolicyBuilder.buildForTrade({
      strategyName: entryStrategy,
      exitContract,
      nowMs: Date.now(),
      volatility: entryVolatility,
      confidence: tradeConfidence,
      marketCondition: 'normal',
      entryDirection: decision.action === 'BUY' ? 'long' : 'short',
      mtfConfluenceSnapshot: orchResult.mtfConfluenceSnapshot || null,
    });
    const scope = this._runtimeScope(symbol);
    const capPercent = absoluteCapPercent ?? this._resolveAbsolutePositionCap();
    const requestedSizeUsd = positionSize * sizingMultiplier;
    const absoluteCapSizeUsd = currentBalance * capPercent;
    const cappedByAbsoluteCap = requestedSizeUsd > absoluteCapSizeUsd;
    const sizeUsd = cappedByAbsoluteCap ? absoluteCapSizeUsd : requestedSizeUsd;
    if (cappedByAbsoluteCap) {
      console.log(`Position absolute-capped final size: $${requestedSizeUsd.toFixed(2)} -> $${sizeUsd.toFixed(2)} (${(capPercent * 100).toFixed(2)}% ABSOLUTE_POSITION_CAP)`);
    }
    const quantityUnit = this._orderQuantityUnit(scope);
    let orderQuantity = this._orderQuantityFromSizeUsd(sizeUsd, price, scope, { forceWholeShares });
    let shareRange = null;
    if (quantityUnit === 'shares') {
      shareRange = this._applyStockShareRange({
        orderQuantity,
        price,
        exitContract,
      });
      orderQuantity = shareRange.orderQuantity;
    }
    let plannedSizeUsd = sizeUsd;
    if (quantityUnit === 'shares' && (forceWholeShares || shareRange?.adjusted)) {
      plannedSizeUsd = orderQuantity * price;
    }

    const entryPlan = {
      traceId: decision.traceId || null,
      signalId: decision.signalId || decision.decisionId || null,
      decisionId: decision.decisionId || null,
      action: decision.action,
      side: this._entrySide(decision.action),
      direction: decision.action === 'BUY' ? 'long' : 'short',
      positionEffect: positionEffectFromAction(decision.action),
      symbol,
      brokerId: scope.brokerId,
      marketDataBrokerId: scope.brokerId,
      accountId: scope.accountId,
      accountIdSource: scope.accountIdSource,
      assetClass: scope.assetClass,
      executionMode: scope.executionMode,
      timeframe: scope.timeframe,
      price,
      accountBalance: currentBalance,
      currentEquity,
      baseSizeUsd: positionSize,
      requestedSizeUsd,
      sizeUsd: plannedSizeUsd,
      absoluteCapPercent: capPercent,
      absoluteCapSizeUsd,
      cappedByAbsoluteCap,
      stockShareRange: shareRange?.bounds || null,
      stockShareRangeBlockReason: shareRange?.blockReason || null,
      confidence: decision.confidence,
      tradeConfidence,
      confidenceMultiplier,
      entryVolatility,
      sizingMultiplier,
      entryGroupType: orchResult.entryGroupType || decision.entryGroupType || null,
      entryGroupId: orchResult.entryGroupId || decision.entryGroupId || null,
      fanoutIndex: Number.isInteger(orchResult.fanoutIndex) ? orchResult.fanoutIndex : null,
      fanoutCount: Number.isInteger(orchResult.fanoutCount) ? orchResult.fanoutCount : null,
      entryTriggerClass: orchResult.entryTriggerClass || decision.entryTriggerClass || null,
      orderQuantity,
      quantityUnit,
      entryStrategy,
      exitContract,
      frozenExitPolicy
    };
    return entryPlan;
  }

  _findExitTrade(decision, symbol) {
    const openAction = decision.action === 'SELL' ? 'BUY' : 'SELL_SHORT';
    const trades = stateManager.getTradesBySymbol(symbol)
      .filter(t => t.action === openAction)
      .sort((a, b) => a.entryTime - b.entryTime);
    if (trades.length === 0) return null;
    if (decision.tradeId) {
      const matched = trades.find(t => t.orderId === decision.tradeId || t.id === decision.tradeId);
      if (matched) return matched;
      const candidateTradeIds = trades
        .map(t => t.orderId || t.id || null)
        .filter(Boolean);
      emitTrace(this.ctx, 'EXIT_TRADE_ID_MISS_REFUSAL', {
        traceId: decision.traceId || null,
        signalId: decision.signalId || decision.decisionId || null,
        decisionId: decision.decisionId || null,
        symbol,
        action: decision.action,
        positionEffect: positionEffectFromAction(decision.action),
        requestedTradeId: decision.tradeId,
        openAction,
        candidateTradeIds,
        candidateCount: trades.length,
        reason: 'exit_trade_id_not_found',
      });
      console.error(`[ORDER-PLAN] Refusing ${decision.action} ${symbol}: requested tradeId=${decision.tradeId} matched no open ${openAction} trade; candidates=${candidateTradeIds.join(',') || 'none'}`);
      return null;
    }
    return trades[0];
  }

  _buildExitPlan({ decision, symbol, price, forceWholeShares = false }) {
    if (!this._isExitAction(decision.action)) return null;

    const trade = this._findExitTrade(decision, symbol);
    if (!trade) return null;

    const scope = {
      symbol,
      brokerId: trade.brokerId,
      accountId: trade.accountId || 'default',
      accountIdSource: trade.accountIdSource || (trade.accountId && trade.accountId !== 'default' ? 'config' : 'default'),
      assetClass: trade.assetClass,
      executionMode: trade.executionMode,
      timeframe: trade.timeframe,
    };
    const missingStoredScope = [];
    const hasText = (value) => value !== null && value !== undefined && String(value).trim() !== '';
    if (!hasText(scope.brokerId)) missingStoredScope.push('brokerId');
    if (!hasText(scope.accountId)) missingStoredScope.push('accountId');
    if (!hasText(scope.assetClass)) missingStoredScope.push('assetClass');
    if (!hasText(scope.executionMode)) missingStoredScope.push('executionMode');
    if (!hasText(scope.timeframe)) missingStoredScope.push('timeframe');
    if (missingStoredScope.length > 0) {
      throw new Error(`[ORDER-PLAN] active trade ${trade.orderId || trade.id || 'unknown'} missing immutable scope field(s): ${missingStoredScope.join(', ')} - refusing to plan exit against current SessionRouter scope`);
    }
    const fullSizeUsd = this._resolveStoredSizeUsd(trade, 'exit');
    const exitFractionWasProvided = decision.exitFraction !== undefined && decision.exitFraction !== null;
    const exitFraction = exitFractionWasProvided ? Number(decision.exitFraction) : 1;
    if (!Number.isFinite(exitFraction) || exitFraction <= 0 || exitFraction > 1) {
      throw new Error(`[ORDER-PLAN] exitFraction must be finite and inside (0,1] for ${trade.orderId || trade.id || 'unknown'}; got ${JSON.stringify(decision.exitFraction)}`);
    }
    const quantityUnit = this._orderQuantityUnit(scope);
    const remainingOrderQuantity = this._tradeRemainingOrderQuantity(trade);
    if (remainingOrderQuantity === null) {
      throw new Error(`[ORDER-PLAN] active trade ${trade.orderId || trade.id || 'unknown'} missing remainingOrderQuantity; refusing to recalc live exit quantity from current price`);
    }
    const storedRemainingUnit = this._firstNonEmptyString(trade.remainingOrderQuantityUnit, trade.entryOrderQuantityUnit);
    if (!storedRemainingUnit) {
      throw new Error(`[ORDER-PLAN] active trade ${trade.orderId || trade.id || 'unknown'} missing stored quantity unit; refusing to infer from current route`);
    }
    const remainingOrderQuantityUnit = storedRemainingUnit;
    if (remainingOrderQuantityUnit !== quantityUnit) {
      throw new Error(`[ORDER-PLAN] active trade ${trade.orderId || trade.id || 'unknown'} quantity unit mismatch: stored=${remainingOrderQuantityUnit} planned=${quantityUnit}`);
    }
    const rawOrderQuantity = remainingOrderQuantity * exitFraction;
    const orderQuantity = this._normalizeOrderQuantity(rawOrderQuantity, scope, {
      forceWholeShares,
      allowMinimumShare: true,
      remainingOrderQuantity,
    });
    if (
      quantityUnit === 'shares'
      && Number.isFinite(rawOrderQuantity)
      && rawOrderQuantity > 0
      && rawOrderQuantity < 1
      && orderQuantity === 1
    ) {
      emitTrace(this.ctx, 'EXIT_MIN_SHARE_PROMOTION', {
        traceId: decision.traceId || null,
        signalId: decision.signalId || decision.decisionId || null,
        decisionId: decision.decisionId || null,
        symbol,
        action: decision.action,
        tradeId: trade.orderId || trade.id,
        remainingOrderQuantity,
        requestedExitFraction: exitFraction,
        rawOrderQuantity,
        promotedOrderQuantity: orderQuantity,
        stateExitFraction: Math.min(1, orderQuantity / remainingOrderQuantity),
      });
      console.warn(`[ORDER-PLAN] Promoted ${decision.action} ${symbol} exit quantity from ${rawOrderQuantity} to 1 share for broker whole-share minimum`);
    }
    if (!Number.isFinite(orderQuantity) || orderQuantity <= 0) {
      throw new Error(`[ORDER-PLAN] active trade ${trade.orderId || trade.id || 'unknown'} planned non-positive exit quantity ${orderQuantity} from remaining=${remainingOrderQuantity} fraction=${exitFraction}`);
    }
    const stateExitFraction = Math.min(1, orderQuantity / remainingOrderQuantity);
    const sizeUsd = fullSizeUsd * stateExitFraction;

    return {
      traceId: decision.traceId || null,
      signalId: decision.signalId || decision.decisionId || null,
      decisionId: decision.decisionId || null,
      action: decision.action,
      side: this._exitSide(decision.action),
      direction: 'close',
      positionEffect: positionEffectFromAction(decision.action),
      symbol,
      brokerId: scope.brokerId,
      executionRoute: trade.executionRoute || null,
      executionVenue: trade.executionVenue || trade.brokerId || null,
      marketDataBrokerId: trade.marketDataBrokerId || trade.brokerId || null,
      accountId: scope.accountId,
      accountIdSource: scope.accountIdSource,
      assetClass: scope.assetClass,
      executionMode: scope.executionMode,
      timeframe: scope.timeframe,
      price,
      sizeUsd,
      orderQuantity,
      quantityUnit,
      remainingOrderQuantity,
      tradeId: trade.orderId || trade.id,
      exitFraction,
      stateExitFraction,
      exitReason: decision.exitReason || null
    };
  }

  _resolveExecutedExitPlan(exitPlan, tradeResult) {
    if (!exitPlan) return null;

    const orderQuantity = Number(tradeResult?.orderQuantity ?? exitPlan.orderQuantity);
    if (!Number.isFinite(orderQuantity) || orderQuantity <= 0) {
      throw new Error(`[ORDER-PLAN] accepted exit quantity invalid for ${exitPlan.symbol}: ${orderQuantity}`);
    }
    if (!Number.isFinite(exitPlan.remainingOrderQuantity) || exitPlan.remainingOrderQuantity <= 0) {
      throw new Error(`[ORDER-PLAN] remaining exit quantity invalid for ${exitPlan.symbol}: ${exitPlan.remainingOrderQuantity}`);
    }
    if (!Number.isFinite(exitPlan.stateExitFraction) || exitPlan.stateExitFraction <= 0) {
      throw new Error(`[ORDER-PLAN] planned exit fraction invalid for ${exitPlan.symbol}: ${exitPlan.stateExitFraction}`);
    }

    const stateExitFraction = Math.min(1, orderQuantity / exitPlan.remainingOrderQuantity);
    if (!Number.isFinite(stateExitFraction) || stateExitFraction <= 0) {
      throw new Error(`[ORDER-PLAN] executed exit fraction invalid for ${exitPlan.symbol}: ${stateExitFraction}`);
    }

    const fullSizeUsd = exitPlan.sizeUsd / exitPlan.stateExitFraction;
    if (!Number.isFinite(fullSizeUsd) || fullSizeUsd <= 0) {
      throw new Error(`[ORDER-PLAN] full exit USD invalid for ${exitPlan.symbol}: ${fullSizeUsd}`);
    }

    return {
      ...exitPlan,
      plannedOrderQuantity: exitPlan.orderQuantity,
      orderQuantity,
      sizeUsd: fullSizeUsd * stateExitFraction,
      stateExitFraction,
    };
  }

  _resolveExecutedEntryPlan(entryPlan, tradeResult) {
    if (!entryPlan) return null;

    const orderQuantity = Number(tradeResult?.orderQuantity ?? entryPlan.orderQuantity);
    const sizeUsd = Number(tradeResult?.amount ?? entryPlan.sizeUsd);
    if (!Number.isFinite(orderQuantity) || orderQuantity <= 0) {
      throw new Error(`[ORDER-PLAN] accepted entry quantity invalid for ${entryPlan.symbol}: ${orderQuantity}`);
    }
    if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) {
      throw new Error(`[ORDER-PLAN] accepted entry USD invalid for ${entryPlan.symbol}: ${sizeUsd}`);
    }

    return {
      ...entryPlan,
      plannedOrderQuantity: entryPlan.orderQuantity,
      orderQuantity,
      sizeUsd,
      quantityUnit: tradeResult?.quantityUnit || entryPlan.quantityUnit,
    };
  }

  async _runPreOrderEntryGate(entryPlan) {
    if (!entryPlan) return { allowed: true, reason: 'not_entry' };

    const gate = this.ctx.preOrderEntryGate || this.ctx.evalRuleEngine;
    if (!gate) return { allowed: true, reason: 'no_gate_configured' };

    const result = typeof gate === 'function'
      ? await gate(entryPlan)
      : await gate.check(entryPlan);

    if (!result || result.allowed !== false) {
      return result || { allowed: true };
    }

    return result;
  }

  _emitWebhookOrderWithResult(action, signal, traceFields = {}) {
    const expectedWebhookAction = this._expectedWebhookAction(action);
    const baseFields = {
      traceId: traceFields.traceId || null,
      signalId: traceFields.signalId || null,
      decisionId: traceFields.decisionId || null,
      symbol: signal?.symbol || traceFields.symbol || null,
      action,
      positionEffect: positionEffectFromAction(action),
      webhookAction: signal?.action || null,
      quantity: signal?.quantity ?? null,
      quantityUnit: signal?.quantityUnit || null,
      orderType: signal?.orderType || null,
      bypassThrottle: signal?.bypassThrottle === true,
      brokerId: traceFields.brokerId || signal?.brokerId || null,
      accountId: traceFields.accountId || signal?.accountId || null,
      accountIdSource: traceFields.accountIdSource || signal?.accountIdSource || null,
      assetClass: traceFields.assetClass || signal?.assetClass || null,
      executionMode: traceFields.executionMode || signal?.executionMode || null,
      timeframe: traceFields.timeframe || signal?.timeframe || null,
      executionRoute: traceFields.executionRoute || null,
      executionVenue: traceFields.executionVenue || null,
      marketDataBrokerId: traceFields.marketDataBrokerId || traceFields.brokerId || null,
    };

    if (signal?.action !== expectedWebhookAction) {
      const result = {
        sent: false,
        reason: 'webhook_action_mismatch',
        rejected: true,
        expectedWebhookAction,
        actualWebhookAction: signal?.action || null,
      };
      console.warn(`[WebhookOrder] ${action} blocked before emit: expected webhook action ${expectedWebhookAction}, got ${signal?.action || 'missing'}`);
      emitTrace(this.ctx, 'WEBHOOK_ORDER_RESULT', {
        ...baseFields,
        success: false,
        sent: false,
        reason: result.reason,
        rejected: true,
        expectedWebhookAction,
        actualWebhookAction: signal?.action || null,
      });
      this._broadcastBrokerOrderResult(baseFields, result);
      return Promise.resolve(result);
    }

    emitTrace(this.ctx, 'WEBHOOK_ORDER_DISPATCH', baseFields);

    let emitPromise;
    try {
      emitPromise = this.ctx.webhookAdapter.emit(signal);
    } catch (err) {
      const message = err?.message || String(err);
      const result = { sent: false, reason: message, thrown: true };
      console.warn(`[WebhookOrder] ${action} emit failed: ${message}`);
      emitTrace(this.ctx, 'WEBHOOK_ORDER_RESULT', {
        ...baseFields,
        success: false,
        sent: false,
        reason: message,
        thrown: true,
      });
      this._broadcastBrokerOrderResult(baseFields, result);
      return Promise.resolve(result);
    }

    return Promise.resolve(emitPromise)
      .then(result => {
        const normalizedResult = result || { sent: false, reason: 'missing_webhook_result' };
        const orderId = this._extractWebhookOrderId(normalizedResult);
        const resultForTrace = orderId
          ? { ...normalizedResult, orderId }
          : normalizedResult;
        const response = result?.response || null;
        emitTrace(this.ctx, 'WEBHOOK_ORDER_RESULT', {
          ...baseFields,
          success: normalizedResult?.sent === true,
          sent: normalizedResult?.sent === true,
          reason: normalizedResult?.reason || null,
          orderId: orderId || null,
          httpStatus: response?.status ?? null,
          responseBody: typeof response?.body === 'string' ? response.body.slice(0, 500) : null,
          dryRun: normalizedResult?.reason === 'dry_run',
        });
        this._broadcastBrokerOrderResult(baseFields, resultForTrace);
        return resultForTrace;
      })
      .catch(err => {
        const message = err?.message || String(err);
        const result = { sent: false, reason: message, rejected: true };
        console.warn(`[WebhookOrder] ${action} emit failed: ${message}`);
        emitTrace(this.ctx, 'WEBHOOK_ORDER_RESULT', {
          ...baseFields,
          success: false,
          sent: false,
          reason: message,
          rejected: true,
        });
        this._broadcastBrokerOrderResult(baseFields, result);
        return result;
      });
  }

  _emitWebhookOrder(action, signal, traceFields = {}) {
    return this._emitWebhookOrderWithResult(action, signal, traceFields)
      .then(() => undefined);
  }

  /**
   * Execute a trade. CC-C Multi-Symbol Commit 5/6: `symbol` is now a REQUIRED
   * trailing argument. Caller passes the symbol whose candle/decision is being
   * acted on; OrderExecutor uses that symbol exclusively for live-routing,
   * trade-record construction, ledger writes, and BUY/SHORT match queries via
   * stateManager.getTradesBySymbol(symbol). No implicit ctx.tradingPair
   * fallback — that path was the cross-contamination footgun for multi-broker
   * arbitrage. Throws on missing/invalid symbol so weak callers fail loud.
   */
  async executeTrade(decision, confidenceData, price, indicators, patterns, traiDecision = null, orchResult = null, symbol) {
    if (typeof symbol !== 'string' || !symbol) {
      throw new Error(
        `OrderExecutor.executeTrade requires explicit non-empty symbol; got ${JSON.stringify(symbol)}`
      );
    }
    if (!SUPPORTED_ACTIONS.has(decision?.action)) {
      throw new Error(
        `[ENTRY-ACTION] OrderExecutor.executeTrade unsupported action ${JSON.stringify(decision?.action)} for ${symbol} - refusing to route order`
      );
    }
    const isEntryAction = this._isEntryAction(decision.action);
    const isExitAction = this._isExitAction(decision.action);
    decision.traceId = decision.traceId || createTraceId('trace');
    decision.signalId = decision.signalId || `${decision.traceId}:signal`;
    decision.decisionId = decision.decisionId || `dec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    decision.positionEffect = positionEffectFromAction(decision.action);
    const positionEffect = decision.positionEffect;
    const traceId = decision.traceId;
    const signalId = decision.signalId;
    const isWebhookExecutionRoute = !this.ctx.backtestMode && this.ctx.webhookAdapter?.enabled === true;
    const exitPlan = isExitAction
      ? this._buildExitPlan({
        decision,
        symbol,
        price,
        forceWholeShares: isWebhookExecutionRoute,
      })
      : null;
    const executionScope = exitPlan
      ? {
          brokerId: exitPlan.brokerId,
          accountId: exitPlan.accountId,
          accountIdSource: exitPlan.accountIdSource,
          assetClass: exitPlan.assetClass,
          executionMode: exitPlan.executionMode,
          timeframe: exitPlan.timeframe,
        }
      : (isEntryAction ? this._runtimeScope(symbol) : {
          brokerId: null,
          accountId: null,
          accountIdSource: null,
          assetClass: null,
          executionMode: null,
          timeframe: null,
        });
    const executionRoute = isWebhookExecutionRoute
      ? 'webhook'
      : (this.ctx.backtestMode || this.ctx.paperTrading ? 'simulated' : 'broker');
    const executionVenue = isWebhookExecutionRoute
      ? 'signalstack_ttp'
      : executionScope.brokerId;
    const marketDataBrokerId = executionScope.brokerId;
    const executionReturn = (success, details = {}) => ({
      success,
      reason: success ? null : (details.reason || null),
      traceId,
      signalId,
      decisionId: decision.decisionId,
      symbol,
      action: decision.action,
      positionEffect,
      brokerId: executionScope.brokerId,
      accountId: executionScope.accountId,
      assetClass: executionScope.assetClass,
      executionMode: executionScope.executionMode,
      timeframe: executionScope.timeframe,
      executionRoute,
      executionVenue,
      marketDataBrokerId,
      ...details,
    });
    const blockedReturn = (reason, details = {}) => executionReturn(false, { reason, ...details });
    emitTrace(this.ctx, 'ORDER_EXECUTE_START', {
      traceId,
      signalId,
      decisionId: decision.decisionId,
      symbol,
      action: decision.action,
      positionEffect,
      price,
      confidencePct: decision.confidence,
      brokerId: executionScope.brokerId,
      assetClass: executionScope.assetClass,
      executionMode: executionScope.executionMode,
    });
    if (isEntryAction) {
      const missingScope = [];
      const hasText = (value) => value !== null && value !== undefined && String(value).trim() !== '';
      if (!hasText(executionScope.brokerId)) missingScope.push('brokerId');
      if (!hasText(executionScope.assetClass)) missingScope.push('assetClass');
      if (!hasText(executionScope.timeframe)) missingScope.push('timeframe');
      const executionMode = executionScope.executionMode;
      if (!hasText(executionMode)) missingScope.push('executionMode');
      if (missingScope.length > 0) {
        throw new Error(`[ENTRY-SCOPE] ${decision.action} for ${symbol} missing immutable trade scope field(s): ${missingScope.join(', ')} - refusing to route order before state identity is complete`);
      }
      if (executionMode === 'backtest' && this.ctx.backtestMode !== true) {
        throw new Error(`[ENTRY-MODE] ${decision.action} for ${symbol} resolved executionMode=backtest while runtime backtestMode is false - refusing to bypass paused-state entry gate`);
      }
      if (executionMode !== 'backtest' && stateManager.get('isTrading') === false) {
        const pauseReason = stateManager.get('pauseReason') || stateManager.get('lastError') || 'StateManager.isTrading=false';
        console.error(`[ENTRY] Refusing ${decision.action} for ${symbol}: trading paused (${pauseReason})`);
        emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, positionEffect, reason: 'trading_paused', detail: pauseReason });
        return blockedReturn('trading_paused', { detail: pauseReason });
      }
      const globalHaltReason = stateManager.isHalted() ? stateManager.getHaltReason() : null;
      const symbolHaltReason = stateManager.isSymbolHalted(symbol) ? stateManager.getSymbolHaltReason(symbol) : null;
      const symbolHaltCode = symbolHaltReason && typeof stateManager.getSymbolHaltCode === 'function'
        ? stateManager.getSymbolHaltCode(symbol)
        : null;
      if (globalHaltReason || symbolHaltReason) {
        console.error(`[ENTRY] Refusing ${decision.action} for ${symbol}: ${globalHaltReason || symbolHaltReason}`);
        const blockReason = symbolHaltCode || 'halted';
        emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, positionEffect, reason: blockReason, detail: globalHaltReason || symbolHaltReason });
        if (blockReason === 'symbol_cooldown') {
          this._emitSymbolCooldownGateEvent({
            traceId,
            signalId,
            symbol,
            action: decision.action,
            reason: blockReason,
            detail: symbolHaltReason,
            executionScope,
          });
        }
        return blockedReturn(blockReason, { detail: globalHaltReason || symbolHaltReason });
      }
      const hedgeBlock = this._sameSymbolHedgeBlock(decision.action, symbol);
      if (hedgeBlock) {
        console.error(`[ENTRY] Refusing ${decision.action} for ${symbol}: same-symbol hedge blocked existing=${hedgeBlock.existingDirection} trade=${hedgeBlock.existingTradeId || 'unknown'} next=${hedgeBlock.nextDirection}`);
        emitTrace(this.ctx, 'ORDER_BLOCKED', {
          traceId,
          signalId,
          symbol,
          action: decision.action,
          positionEffect,
          reason: hedgeBlock.reason,
          existingDirection: hedgeBlock.existingDirection,
          existingTradeId: hedgeBlock.existingTradeId,
          nextDirection: hedgeBlock.nextDirection,
        });
        return blockedReturn(hedgeBlock.reason, hedgeBlock);
      }
    }
    // Log trade execution
    console.log("*** EXECUTE_TRADE_REACHED ***");
    const confidenceDisplay = Number.isFinite(decision.confidence)
      ? `${decision.confidence.toFixed(1)}%`
      : 'n/a';
    console.log(`\n${decision.action} SIGNAL @ $${price.toFixed(2)} | Confidence: ${confidenceDisplay}`);

    // CHECKPOINT 1: Entry
    console.log(`CP1: executeTrade ENTRY - Balance: $${stateManager.get('balance')}, Position: ${stateManager.get('position')}`);

    // FIX 2026-03-28: Use available capital (equity minus reserved in open trades)
    // This prevents sizing off full equity while positions are open
    // CRIT-01: Phantom $10K capital. getAvailableCapital() returns 0 when all
    // equity is reserved in open trades. The old `|| 10000` upgraded that to
    // phantom $10K and the bot sized as if the account were fully flush.
    // Pre-money: halt the entry instead. No fabricated capital.
    const currentEquity = stateManager.getEquity(price);
    const currentBalance = stateManager.getAvailableCapital(price);
    if (isEntryAction && currentBalance <= 0) {
      console.error('[HALT] No available capital — refusing entry');
      emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, positionEffect, reason: 'no_available_capital', availableCapital: currentBalance });
      return blockedReturn('no_available_capital', { availableCapital: currentBalance });
    }
    // CHANGE 2026-02-28: Use ConfigLoader for position sizing
    // NOTE: DynamicPositionSizer.js exists in core/ but is NOT WIRED - needs tuning first
    let basePositionPercent = 0;

    // TUNE 2026-02-27: Confidence-scaled position sizing
    // 50% confidence = 0.5x, 75% = 1.5x, 90%+ = 2.5x (cap)
    const rawConfidence = decision.confidence;
    // CRIT-02: Phantom 50% confidence. Previously trailing `|| 0.5` upgraded
    // 0/null/undefined/NaN to 50% conviction, so zero-conviction signals
    // fired with 50% confidence and got phantom multipliers. Spec asks for
    // `=== 0 || == null` reject; extended to `!isFinite || <= 0` to also
    // catch NaN, undefined, and negative values (root-cause coverage).
    if (isEntryAction && (!Number.isFinite(rawConfidence) || rawConfidence <= 0)) {
      console.error(`[HALT] Invalid confidence: ${rawConfidence} — skipping trade`);
      emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, positionEffect, reason: 'invalid_confidence', confidencePct: rawConfidence });
      return blockedReturn('invalid_confidence', { confidencePct: rawConfidence });
    }
    // decision.confidence comes as percentage (e.g., 75 = 75%), convert to decimal
    const tradeConfidence = Number.isFinite(rawConfidence) && rawConfidence > 0
      ? (rawConfidence > 1 ? rawConfidence / 100 : rawConfidence)
      : null;
    if (isEntryAction) {
      const configuredMinConfidence = ConfigLoader.get('confidence.minTradeConfidence');
      const minTradeConfidence = configuredMinConfidence > 1
        ? configuredMinConfidence / 100
        : configuredMinConfidence;
      if (!Number.isFinite(minTradeConfidence) || minTradeConfidence < 0 || minTradeConfidence > 1) {
        throw new Error(`[ENTRY-CONFIDENCE] Invalid minTradeConfidence ${configuredMinConfidence} for ${decision.action} ${symbol}`);
      }
      if (tradeConfidence < minTradeConfidence) {
        console.error(`[ENTRY] Refusing ${decision.action} for ${symbol}: confidence ${(tradeConfidence * 100).toFixed(1)}% below minimum ${(minTradeConfidence * 100).toFixed(1)}%`);
        emitTrace(this.ctx, 'ORDER_BLOCKED', {
          traceId,
          signalId,
          symbol,
          action: decision.action,
          positionEffect,
          reason: 'low_confidence',
          confidencePct: rawConfidence,
          minConfidencePct: minTradeConfidence * 100,
        });
        return blockedReturn('low_confidence', {
          confidencePct: rawConfidence,
          minConfidencePct: minTradeConfidence * 100,
        });
      }
    }
    const dynamicSizingEnabled = ConfigLoader.get('features.enableDynamicSizing', true) !== false;
    let confidenceMultiplier = 1.0;
    if (isEntryAction) {
      basePositionPercent = ConfigLoader.get('positionSizing.maxPositionSize');
    }
    if (isEntryAction && dynamicSizingEnabled) {
      // Linear scale: confidence 0.5 -> multiplier 0.5, confidence 1.0 -> multiplier 2.5
      confidenceMultiplier = Math.max(0.5, Math.min(2.5,
        0.5 + (tradeConfidence - 0.5) * 4.0
      ));
      basePositionPercent = basePositionPercent * confidenceMultiplier;
    }

    // FIX 2026-03-06: ENFORCE MAX_POSITION_SIZE cap after confidence multiplier
    const maxPositionPercent = ConfigLoader.get('positionSizing.maxPositionSize') * (dynamicSizingEnabled ? 2.5 : 1);
    if (isEntryAction && basePositionPercent > maxPositionPercent) {
      console.log(`Position capped: ${(basePositionPercent * 100).toFixed(2)}% -> ${(maxPositionPercent * 100).toFixed(2)}% (MAX_POSITION_SIZE limit)`);
      basePositionPercent = maxPositionPercent;
    }
    // ABSOLUTE_POSITION_CAP lives at entryLogic.sizing.absoluteCapPercent and
    // is enforced again inside _buildEntryPlan after confluence sizing.
    const absoluteCap = isEntryAction ? this._resolveAbsolutePositionCap() : null;
    if (isEntryAction && Number.isFinite(absoluteCap) && absoluteCap > 0 && basePositionPercent > absoluteCap) {
      console.log(`Position absolute-capped: ${(basePositionPercent * 100).toFixed(2)}% -> ${(absoluteCap * 100).toFixed(2)}% (ABSOLUTE_POSITION_CAP)`);
      basePositionPercent = absoluteCap;
    }
    if (isEntryAction) {
      console.log(`Confidence sizing: ${(tradeConfidence * 100).toFixed(0)}% -> ${confidenceMultiplier.toFixed(1)}x -> ${(basePositionPercent * 100).toFixed(2)}% of balance${dynamicSizingEnabled ? '' : ' (flat profile)'}`);
    }

    // Phase 4 REWRITE: AGGRESSIVE_LEARNING_MODE removed - use ConfigLoader for all sizing
    const baseSizeUSD = isEntryAction ? currentBalance * basePositionPercent : 0;

    // FIX 2026-03-28: Position size stays in USD (no BTC conversion for stocks)
    const positionSize = baseSizeUSD;

    if (isEntryAction) {
      console.log(`Position sizing: Balance=$${currentBalance.toFixed(2)}, Percent=${(basePositionPercent*100).toFixed(1)}%, USD=$${positionSize.toFixed(2)}`);
    }

    // CHECKPOINT 2: Position sizing
    if (isEntryAction) {
      console.log(`[CP2] Position size calculated: $${positionSize.toFixed(2)} USD`);
    }

    if (decision.action === 'BUY') {
      if (!orchResult) {
        console.error('[HALT] orchResult absent on BUY — refusing entry (no winner strategy, no exit contract)');
        emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, positionEffect, reason: 'missing_orch_result' });
        return blockedReturn('missing_orch_result');
      }
      if (!orchResult.winnerStrategy) {
        throw new Error('[HIGH-08] BUY entry: orchResult.winnerStrategy missing — orchestrator regression');
      }
      if (!orchResult.exitContract) {
        throw new Error('[HIGH-08] BUY entry: orchResult.exitContract missing — Fix 7 regression or orchestrator upstream bug');
      }
    }
    if (decision.action === 'SELL_SHORT') {
      if (!orchResult) {
        console.error('[HALT] orchResult absent on SELL_SHORT — refusing entry (no winner strategy, no exit contract)');
        emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, positionEffect, reason: 'missing_orch_result' });
        return blockedReturn('missing_orch_result');
      }
      if (!orchResult.winnerStrategy) {
        throw new Error('[HIGH-08] SHORT entry: orchResult.winnerStrategy missing — orchestrator regression');
      }
      if (!orchResult.exitContract) {
        throw new Error('[HIGH-08] SHORT entry: orchResult.exitContract missing — Fix 7 regression or orchestrator upstream bug');
      }
    }
    if (isEntryAction) {
      this._resolveContractStopPercent(orchResult.exitContract);
    }

    const entryPlan = isEntryAction ? this._buildEntryPlan({
      decision,
      symbol,
      price,
      positionSize,
      currentBalance,
      currentEquity,
      tradeConfidence,
      confidenceMultiplier,
      orchResult,
      entryVolatility: indicators.volatility ?? null,
      absoluteCapPercent: absoluteCap,
      forceWholeShares: isWebhookExecutionRoute
    }) : null;
    if (entryPlan && entryPlan.orderQuantity <= 0) {
      const blockReason = entryPlan.stockShareRangeBlockReason || 'non_positive_order_quantity';
      console.warn(`[ENTRY-PLAN] Refusing ${entryPlan.action} for ${symbol}: planned ${entryPlan.quantityUnit} quantity=${entryPlan.orderQuantity} from sizeUsd=$${entryPlan.sizeUsd.toFixed(2)} at price=$${price.toFixed(2)} (${blockReason})`);
      emitTrace(this.ctx, 'ORDER_BLOCKED', {
        traceId,
        signalId,
        symbol,
        action: decision.action,
        positionEffect,
        reason: blockReason,
        quantityUnit: entryPlan.quantityUnit,
        orderQuantity: entryPlan.orderQuantity,
        sizeUsd: entryPlan.sizeUsd,
        stockShareRange: entryPlan.stockShareRange,
      });
      return blockedReturn(blockReason, {
        quantityUnit: entryPlan.quantityUnit,
        orderQuantity: entryPlan.orderQuantity,
        sizeUsd: entryPlan.sizeUsd,
        stockShareRange: entryPlan.stockShareRange,
      });
    }
    if (entryPlan) {
      const concurrencyBlock = this._entryConcurrencyBlock(entryPlan);
      if (concurrencyBlock) {
        console.warn(`[ENTRY-CONCURRENCY] Refusing ${entryPlan.action} ${symbol}: ${concurrencyBlock.reason}`);
        emitTrace(this.ctx, 'ORDER_BLOCKED', {
          traceId,
          signalId,
          symbol,
          action: entryPlan.action,
          positionEffect,
          ...concurrencyBlock,
        });
        return blockedReturn(concurrencyBlock.reason, concurrencyBlock);
      }
    }
    if (entryPlan) {
      emitTrace(this.ctx, 'ORDER_PLAN', {
        traceId,
        signalId,
        symbol,
        action: entryPlan.action,
        positionEffect,
        side: entryPlan.side,
        sizeUsd: entryPlan.sizeUsd,
        orderQuantity: entryPlan.orderQuantity,
        quantityUnit: entryPlan.quantityUnit,
        stockShareRange: entryPlan.stockShareRange,
        entryStrategy: entryPlan.entryStrategy,
        riskGates: [],
      });
      const gateResult = await this._runPreOrderEntryGate(entryPlan);
      entryPlan.gateResult = gateResult;
      const evalQuarantineRiskGates = this._buildEvalQuarantineRiskGates(gateResult);
      if (evalQuarantineRiskGates.length > 0) {
        this._emitTtpQuarantineGateEvent({
          traceId,
          signalId,
          symbol,
          action: entryPlan.action,
          riskGates: evalQuarantineRiskGates,
          executionScope,
        });
      }
      entryPlan.riskGates = evalQuarantineRiskGates;
      entryPlan.operationalQuarantine = this._buildOperationalQuarantine(gateResult, evalQuarantineRiskGates);
      emitTrace(this.ctx, 'EVAL_RULE_CHECK', {
        traceId,
        signalId,
        symbol,
        action: entryPlan.action,
        positionEffect,
        allowed: gateResult?.allowed !== false,
        failedRules: Array.isArray(gateResult?.failedRules) ? gateResult.failedRules.map(rule => rule.ruleId || rule) : [],
        passedRules: gateResult?.passedRules || [],
        inputs: gateResult?.inputs || null,
        riskGates: evalQuarantineRiskGates,
      });
      if (gateResult && gateResult.allowed === false) {
        const failed = Array.isArray(gateResult.failedRules) && gateResult.failedRules.length > 0
          ? gateResult.failedRules.map(rule => rule.ruleId || rule).join(',')
          : (gateResult.reason || 'pre_order_entry_gate');
        console.warn(`[ENTRY-GATE] BLOCKED ${entryPlan.action} ${symbol} before broker/webhook/state side effects: ${failed}`);
        emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: entryPlan.action, positionEffect, reason: 'eval_rule_gate', failedRules: failed });
        return blockedReturn('eval_rule_gate', { failedRules: failed });
      }
    }
    const isLiveBrokerRoute = !this.ctx.backtestMode && !this.ctx.paperTrading && !isWebhookExecutionRoute;
    const shouldPlanWebhookExit = !this.ctx.backtestMode
      && this.ctx.webhookAdapter?.enabled === true
      && isExitAction;
    if (isExitAction && !exitPlan) {
      const haltReason = decision.action === 'SELL'
        ? 'KILL-5: SELL with no matching BUY'
        : 'KILL-5: COVER with no matching SELL_SHORT';
      const routeName = isLiveBrokerRoute ? 'broker' : (shouldPlanWebhookExit ? 'webhook' : 'execution');
      console.error(`[ORDER-PLAN] ${haltReason} for ${symbol} before ${routeName} route`);
      console.error(`[ORDER-PLAN] ${haltReason} is telemetry-only; not persisting a symbol entry halt`);
      emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, positionEffect, reason: haltReason });
      return blockedReturn(haltReason);
    }
    const brokerOrderPlan = entryPlan || exitPlan;
    if (isWebhookExecutionRoute) {
      const webhookBlockReason = this._webhookExecutionBlockReason(brokerOrderPlan, decision.action);
      if (webhookBlockReason) {
        console.warn(`[WebhookOrder] BLOCKED ${decision.action} ${symbol} before execution/state side effects: ${webhookBlockReason}`);
        emitTrace(this.ctx, 'ORDER_BLOCKED', {
          traceId,
          signalId,
          symbol,
          action: decision.action,
          positionEffect,
          reason: webhookBlockReason,
          route: 'webhook',
          orderQuantity: brokerOrderPlan?.orderQuantity ?? null,
          quantityUnit: brokerOrderPlan?.quantityUnit ?? null,
          sizeUsd: brokerOrderPlan?.sizeUsd ?? null,
        });
        return blockedReturn(webhookBlockReason, {
          route: 'webhook',
          orderAccepted: false,
          stateMutationSucceeded: false,
          orderQuantity: brokerOrderPlan?.orderQuantity ?? null,
          quantityUnit: brokerOrderPlan?.quantityUnit ?? null,
          sizeUsd: brokerOrderPlan?.sizeUsd ?? null,
        });
      }
    }

    let exitIntent = null;
    let reservationBlockOverride = null;
    if (exitPlan) {
      const submittedAtMs = Date.now();
      const intentId = this._buildExitIntentId(exitPlan, decision);
      const expectedRemainingQuantity = Math.max(0, exitPlan.remainingOrderQuantity - exitPlan.orderQuantity);
      let reserved = await stateManager.reserveExitSlot(exitPlan.tradeId, intentId, {
        submittedAtMs,
        sourceEventId: decision.decisionId,
        exitFraction: exitPlan.stateExitFraction,
        expectedRemainingQuantity,
        stateKey: decision.exitIntent?.stateKey || null,
        tierIndex: decision.exitIntent?.tierIndex,
        targetQuantity: exitPlan.orderQuantity,
      });
      if (reserved?.reason === 'exit_already_pending' && reserved.pendingExitIntent) {
        const staleResult = await this._reconcilePendingExitIntentForReservation({
          exitPlan,
          pendingExitIntent: reserved.pendingExitIntent,
          traceId,
          signalId,
          decisionId: decision.decisionId,
          symbol,
          action: decision.action,
        });
        if (staleResult?.released === true) {
          reserved = await stateManager.reserveExitSlot(exitPlan.tradeId, intentId, {
            submittedAtMs,
            sourceEventId: decision.decisionId,
            exitFraction: exitPlan.stateExitFraction,
            expectedRemainingQuantity,
            stateKey: decision.exitIntent?.stateKey || null,
            tierIndex: decision.exitIntent?.tierIndex,
            targetQuantity: exitPlan.orderQuantity,
          });
        } else if (staleResult?.halted === true || staleResult?.reason === 'exit_intent_reconciliation_required') {
          reservationBlockOverride = staleResult;
        }
      }
      if (!reserved || reserved.success !== true || reserved.reserved !== true) {
        const reason = reservationBlockOverride?.reason || reserved?.reason || reserved?.error || 'exit_intent_not_reserved';
        console.error(`[EXECUTION-FILL] Refusing ${decision.action} ${symbol}: exit intent not reserved (${reason})`);
        emitTrace(this.ctx, 'ORDER_BLOCKED', {
          traceId,
          signalId,
          symbol,
          action: decision.action,
          positionEffect,
          reason: 'exit_intent_not_reserved',
          detail: reason,
          tradeId: exitPlan.tradeId,
          intentId,
          pendingExitIntent: reserved?.pendingExitIntent || null,
          reconciliation: reservationBlockOverride || null,
        });
        return blockedReturn(reservationBlockOverride?.reason || 'exit_intent_not_reserved', {
          detail: reason,
          tradeId: exitPlan.tradeId,
          intentId,
          stateMutationSucceeded: false,
          reconciliation: reservationBlockOverride || null,
        });
      }
      exitIntent = {
        ...reserved.pendingExitIntent,
        intentId,
        submittedAtMs,
        sourceEventId: decision.decisionId,
      };
    }

    // Change 587: SafetyNet DISABLED - too restrictive
    // Was blocking legitimate trades with overly conservative limits
    // We already have sufficient risk management through:
    // - RiskManager pre-trade validation
    // - TRAI veto power for risky trades
    // - MIN_TRADE_CONFIDENCE threshold (35%)
    // - Position sizing limits (1% per trade)

    try {
      // CHECKPOINT 3: Before ExecutionLayer call
      console.log(`CP3: Calling ExecutionLayer.executeTrade with USD=$${positionSize.toFixed(2)}`);

      // Phase 4 REWRITE: Circuit breaker removed (tradingBrain deleted in Phase 2)

      // decisionId generated before pre-order gates so every trace line shares the
      // same forensic join key.
      const decisionId = decision.decisionId;

      // Phase 4 REWRITE: executionLayer deleted - use orderRouter for live, simulate for backtest/paper
      let tradeResult;
      if (isWebhookExecutionRoute) {
        const webhookSignal = this._webhookSignalForOrderPlan(decision.action, brokerOrderPlan);
        const webhookResult = await this._emitWebhookOrderWithResult(decision.action, webhookSignal, {
          traceId,
          signalId,
          decisionId,
          ...brokerOrderPlan,
          executionRoute,
          executionVenue,
          marketDataBrokerId,
        });
        const webhookOrderId = this._extractWebhookOrderId(webhookResult);
        const webhookFillProof = this._extractWebhookFillProof(decision.action, webhookResult);
        if (webhookResult?.sent !== true) {
          const webhookReason = webhookResult?.reason || 'not_sent';
          tradeResult = {
            success: false,
            reason: `webhook_${webhookReason}`,
            traceId,
            signalId,
          };
          emitTrace(this.ctx, 'ORDER_BLOCKED', {
            traceId,
            signalId,
            symbol,
            action: decision.action,
            positionEffect,
            reason: tradeResult.reason,
            route: 'webhook',
            stateMutationSucceeded: false,
          });
        } else if (!webhookOrderId && this._isWebhookBrokerFlatResult(decision.action, webhookResult)) {
          const responseBody = this._webhookResponseBody(webhookResult).slice(0, 500);
          const reconciled = await stateManager.reconcileBrokerFlat(exitPlan.tradeId, {
            traceId,
            signalId,
            decisionId,
            symbol,
            action: decision.action,
            positionEffect,
            reason: 'broker_flat_no_open_position',
            responseBody,
          });
          if (reconciled?.success === true) {
            tradeResult = {
              success: false,
              reason: 'broker_flat_reconciled',
              traceId,
              signalId,
              stateMutationSucceeded: true,
              brokerFlatReconciled: true,
            };
            emitTrace(this.ctx, 'STATE_MUTATION', {
              traceId,
              signalId,
              symbol,
              action: decision.action,
              positionEffect,
              success: true,
              operation: 'reconcileBrokerFlat',
              orderId: exitPlan.tradeId,
              reason: 'broker_flat_no_open_position',
              stateMutationSucceeded: true,
            });
          } else {
            tradeResult = {
              success: false,
              reason: 'broker_flat_reconcile_failed',
              traceId,
              signalId,
              stateMutationSucceeded: false,
            };
            emitTrace(this.ctx, 'STATE_MUTATION', {
              traceId,
              signalId,
              symbol,
              action: decision.action,
              positionEffect,
              success: false,
              operation: 'reconcileBrokerFlat',
              orderId: exitPlan.tradeId,
              reason: reconciled?.error || 'broker_flat_reconcile_failed',
              stateMutationSucceeded: false,
            });
          }
        } else if (isExitAction && !webhookFillProof) {
          const localOrderId = webhookOrderId
            || this._webhookCorrelationOrderId(decision.action, brokerOrderPlan, decisionId);
          const responseBody = this._webhookResponseBody(webhookResult).slice(0, 500);
          const acceptedIntent = exitIntent && typeof stateManager.markExitSlotAccepted === 'function'
            ? await stateManager.markExitSlotAccepted(exitPlan.tradeId, exitIntent.intentId, {
              brokerOrderId: localOrderId,
              acceptedAtMs: Date.now(),
            })
            : null;
          if (acceptedIntent?.success === true && acceptedIntent.accepted === true) {
            exitIntent = {
              ...acceptedIntent.pendingExitIntent,
              intentId: exitIntent.intentId,
              sourceEventId: exitIntent.sourceEventId,
            };
          }
          emitTrace(this.ctx, 'EXIT_PENDING_BROKER_CONFIRMATION', {
            traceId,
            signalId,
            decisionId,
            symbol,
            action: decision.action,
            positionEffect,
            orderId: localOrderId,
            route: 'webhook',
            responseBody,
            brokerOrderIdPresent: Boolean(webhookOrderId),
            pendingExitIntent: exitIntent || null,
            orderAccepted: true,
            stateMutationSucceeded: false,
            intentAccepted: acceptedIntent?.accepted === true,
            intentAcceptReason: acceptedIntent?.reason || null,
          });
          return {
            success: true,
            reason: 'exit_pending_broker_confirmation',
            orderId: localOrderId,
            brokerOrderId: webhookOrderId || null,
            webhookOrderIdMissing: !webhookOrderId,
            webhookAcceptedWithoutOrderId: !webhookOrderId,
            brokerConfirmationPending: true,
            brokerFillConfirmed: false,
            brokerFillStatus: null,
            responseBody,
            action: decision.action,
            positionEffect,
            symbol,
            price,
            amount: brokerOrderPlan.sizeUsd,
            orderQuantity: brokerOrderPlan.orderQuantity,
            quantityUnit: brokerOrderPlan.quantityUnit,
            traceId,
            signalId,
            orderAccepted: true,
            stateMutationSucceeded: false,
          };
        } else if (!webhookOrderId) {
          const localOrderId = this._webhookCorrelationOrderId(decision.action, brokerOrderPlan, decisionId);
          tradeResult = {
            success: true,
            orderId: localOrderId,
            brokerOrderId: null,
            webhookOrderIdMissing: true,
            webhookAcceptedWithoutOrderId: true,
            responseBody: this._webhookResponseBody(webhookResult).slice(0, 500),
            price,
            amount: brokerOrderPlan.sizeUsd,
            orderQuantity: webhookFillProof?.filledQuantity ?? brokerOrderPlan.orderQuantity,
            quantityUnit: brokerOrderPlan.quantityUnit,
            brokerFillConfirmed: Boolean(webhookFillProof),
            brokerFillStatus: webhookFillProof?.status || null,
            traceId,
            signalId,
          };
          emitTrace(this.ctx, 'WEBHOOK_ACCEPTED_WITHOUT_ORDER_ID', {
            traceId,
            signalId,
            decisionId,
            symbol,
            action: decision.action,
            positionEffect,
            localOrderId,
            route: 'webhook',
            responseBody: tradeResult.responseBody,
          });
        } else {
          tradeResult = {
            success: true,
            orderId: webhookOrderId,
            price,
            amount: brokerOrderPlan.sizeUsd,
            orderQuantity: webhookFillProof?.filledQuantity ?? brokerOrderPlan.orderQuantity,
            quantityUnit: brokerOrderPlan.quantityUnit,
            brokerFillConfirmed: Boolean(webhookFillProof),
            brokerFillStatus: webhookFillProof?.status || null,
            traceId,
            signalId,
          };
        }
      } else if (this.ctx.backtestMode || this.ctx.paperTrading) {
        // Backtest/Paper: Simulate trade execution with slippage
        if (this.ctx.paperTrading) console.log('PAPER MODE: Simulating order (no real execution)');

        // FIX 2026-03-26 Bug 7: Apply slippage to simulated fills
        // BUY/COVER pay more, SELL/SELL_SHORT receive less
        // HIGH-06: throw on missing/non-finite slippage rather than fall back
        // to a hardcoded 0.05% (crypto-tuned, wrong for stocks). ConfigLoader
        // already supplies 0.0005 as the env-default for FEE_SLIPPAGE so this
        // throw catches genuinely malformed config, not unset env.
        const slippagePercent = ConfigLoader.get('fees.slippage');
        if (!Number.isFinite(slippagePercent) || slippagePercent < 0) {
          throw new Error(`[HIGH-06] ConfigLoader.fees.slippage non-finite or negative (got ${slippagePercent})`);
        }
        const isBuyAction = decision.action === 'BUY' || decision.action === 'COVER';
        const fillPrice = isBuyAction
          ? price * (1 + slippagePercent)   // BUY/COVER: pay more
          : price * (1 - slippagePercent);  // SELL/SELL_SHORT: receive less

        tradeResult = {
          success: true,
          orderId: `SIM_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          price: fillPrice,
          amount: brokerOrderPlan?.sizeUsd ?? positionSize,
          orderQuantity: brokerOrderPlan?.orderQuantity ?? null,
          quantityUnit: brokerOrderPlan?.quantityUnit ?? null,
          traceId,
          signalId
        };

        // Use slippage-adjusted price for position tracking
        price = fillPrice;
      } else {
        // Live: Route through OrderRouter to exchange.
        // `symbol` is the required executeTrade param — entry-check at the top
        // of this method already guarantees it's a non-empty string, so the
        // historical `if (!symbol)` HALT is unreachable and removed here. The
        // CRIT-03 wrong-market hazard (defaulting missing tradingPair to
        // BTC-USD) is structurally prevented by the param requirement.
        const side = brokerOrderPlan.side; // 'buy' or 'sell'
        let brokerOrderAcceptedBeforeValidation = false;
        let brokerOrderId = null;
        try {
          emitTrace(this.ctx, 'BROKER_ORDER_REQUEST', {
            traceId,
            signalId,
            symbol,
            action: decision.action,
            positionEffect,
            side,
            amount: brokerOrderPlan.orderQuantity,
            quantityUnit: brokerOrderPlan.quantityUnit,
            sizeUsd: brokerOrderPlan.sizeUsd,
          });
          const orderResult = await this.ctx.orderRouter.sendOrder({
            symbol,
            side,
            amount: brokerOrderPlan.orderQuantity,
            type: 'market',
            traceId,
            signalId,
            decisionId,
            options: {
              sizeUsd: brokerOrderPlan.sizeUsd,
              quantityUnit: brokerOrderPlan.quantityUnit
            }
          });
          brokerOrderId = orderResult?.orderId || orderResult?.id;
          if (!brokerOrderId) {
            throw new Error(`missing_broker_order_id for ${side} ${symbol}`);
          }
          brokerOrderAcceptedBeforeValidation = true;
          const acceptedOrderQuantity = this._acceptedOrderQuantity(orderResult, brokerOrderPlan.orderQuantity);
          const acceptedSizeUsd = this._acceptedOrderSizeUsd(brokerOrderPlan, acceptedOrderQuantity);
          tradeResult = {
            success: true,
            orderId: brokerOrderId,
            price: orderResult.price ?? price,
            amount: acceptedSizeUsd,
            orderQuantity: acceptedOrderQuantity,
            quantityUnit: brokerOrderPlan.quantityUnit,
            traceId,
            signalId
          };
          emitTrace(this.ctx, 'BROKER_ORDER_RESULT', {
            traceId,
            signalId,
            symbol,
            action: decision.action,
            positionEffect,
            success: true,
            orderId: tradeResult.orderId,
            orderAccepted: true,
            stateMutationSucceeded: null,
            acceptedOrderQuantity: tradeResult.orderQuantity,
            quantityUnit: tradeResult.quantityUnit,
            amount: tradeResult.amount,
            sizeUsd: tradeResult.amount,
          });
        } catch (orderErr) {
          if (brokerOrderAcceptedBeforeValidation) {
            await this._haltDirectionIntegrityExitRefusal({
              symbol,
              reason: 'post_send_broker_order_reconciliation_failed',
              traceId,
              signalId,
              decisionId,
              tradeId: exitPlan?.tradeId || null,
              action: decision.action,
              metadata: {
                brokerOrderId,
                side,
                route: 'broker',
                postSendError: orderErr.message,
              },
            });
            emitTrace(this.ctx, 'BROKER_ORDER_POST_SEND_RECONCILIATION_FAILED', {
              traceId,
              signalId,
              decisionId,
              symbol,
              action: decision.action,
              positionEffect,
              brokerOrderId,
              side,
              orderAccepted: true,
              stateMutationSucceeded: false,
              reason: orderErr.message,
            });
            throw orderErr;
          }
          console.error(`Order execution failed: ${orderErr.message}`);
          tradeResult = { success: false, reason: orderErr.message, traceId, signalId };
          emitTrace(this.ctx, 'BROKER_ORDER_RESULT', {
            traceId,
            signalId,
            symbol,
            action: decision.action,
            positionEffect,
            success: false,
            orderAccepted: false,
            stateMutationSucceeded: null,
            reason: orderErr.message,
          });
        }
      }

      // CHECKPOINT 4: After order execution
      console.log(`CP4: Order result:`, tradeResult ? `success=${tradeResult.success}` : 'NULL');

      if (tradeResult && tradeResult.success) {
        console.log(`CP4.5: Trade SUCCESS confirmed, creating unified result`);
        if (!tradeResult.orderId) {
          throw new Error(`[EXECUTION-FILL] successful_trade_result_missing_order_id for ${decision.action} ${symbol}`);
        }
        const executedExitPlan = exitPlan
          ? this._resolveExecutedExitPlan(exitPlan, tradeResult)
          : null;
        const executedEntryPlan = entryPlan
          ? this._resolveExecutedEntryPlan(entryPlan, tradeResult)
          : null;
        if (executedExitPlan) {
          tradeResult.amount = executedExitPlan.sizeUsd;
          tradeResult.orderQuantity = executedExitPlan.orderQuantity;
          tradeResult.quantityUnit = executedExitPlan.quantityUnit;
        }
        if (executedEntryPlan) {
          tradeResult.amount = executedEntryPlan.sizeUsd;
          tradeResult.orderQuantity = executedEntryPlan.orderQuantity;
          tradeResult.quantityUnit = executedEntryPlan.quantityUnit;
        }
        // Change 588: Create unified tradeResult format
        const unifiedResult = {
          orderId: tradeResult.orderId,
          action: decision.action,
          positionEffect,
          traceId,
          signalId,
          decisionId,
          entryPrice: price,
          entryTime: this.ctx.marketData?.timestamp ?? Date.now(),
          size: tradeResult.amount ?? positionSize,
          confidence: decision.confidence,
          // CHANGE 648: Store full pattern objects with signatures for learning
          // BUGFIX 2026-02-01: Include features array for pattern outcome recording!
          // Without features, recordPatternResult at trade close fails with "empty features array"
          patterns: patterns?.map(p => ({
            name: p.name || p.type,
            signature: p.signature || p.id || `${p.name || p.type}_${Date.now()}`,
            confidence: p.confidence || 0,
            features: this._normalizePatternFeatureVector(p.features) || []  // CRITICAL: Required for pattern learning!
          })) || [],
          indicators: {
            rsi: indicators.rsi,
            macd: indicators.macd?.macd ?? null,  // CHANGE 646: Fix property access - was ?.value
            macdSignal: indicators.macd?.signal ?? null,
            trend: indicators.trend,
            volatility: indicators.volatility ?? null
          }
        };

        console.log(`CP4.6: Unified result created with orderId: ${unifiedResult.orderId}`);

        // FIX 2026-02-16: REMOVED redundant updateActiveTrade() call
        // openPosition() already adds trade to activeTrades atomically via updateState()
        // Having BOTH caused race condition: updateActiveTrade saved {position:0, activeTrades:[trade]}
        // before openPosition could update position, creating zombie trades
        // See: ZOMBIE-RACE-CONDITION-FIX.md in ledger
        if (false && decision.action === 'BUY') { // DISABLED - openPosition handles this
          console.log(`CP4.7: About to call stateManager.updateActiveTrade (BUY only)`);
          try {
            stateManager.updateActiveTrade(unifiedResult.orderId, unifiedResult);
            console.log(`CP4.8: updateActiveTrade completed successfully`);
          } catch (error) {
            console.error(`CP4.8 ERROR: updateActiveTrade failed:`, error.message);
            console.error(`   Full error:`, error);
          }
        } else {
          console.log(`CP4.7: updateActiveTrade disabled - openPosition() handles activeTrades storage for ${decision.action}`);
        }

        // FIX 2026-02-14: Store TRAI decision for learning feedback loop
        // Non-blocking observer decisions need an explicit order correlation id
        // before they can safely feed outcome learning.
        const traiDecisionToStore = traiDecision;
        const traiDecisionMatchesOrder = unifiedResult.orderId
          && this._shouldStoreTraiDecisionForOrder(traiDecisionToStore, decision, symbol);
        if (traiDecisionMatchesOrder) {
          this.pendingTraiDecisions.set(unifiedResult.orderId, {
            decisionId: traiDecisionToStore.id,
            originalConfidence: traiDecisionToStore.originalConfidence,
            traiConfidence: traiDecisionToStore.traiConfidence,
            traiRecommendation: traiDecisionToStore.traiRecommendation,
            timestamp: Date.now()
          });
          this.ctx._lastTraiDecision = null;  // Clear after storing
          console.log(`[TRAI] Decision stored for learning (orderId: ${unifiedResult.orderId})`);
        } else if (this.ctx._lastTraiDecision) {
          this.ctx._lastTraiDecision = null;
          console.warn(`[TRAI] Skipped async observer decision learning for orderId: ${unifiedResult.orderId || 'unknown'} until order correlation is explicit`);
        }
        // Update position tracking
        if (decision.action === 'BUY') {
          // ═══ PHASE 9: Gates moved to EntryDecider (BEFORE execution) ═══
          // Previously gates ran HERE (after order filled) - BUG!
          // Now handled by this.ctx.entryDecider.decide() before executionLayer.executeTrade()

          // CHECKPOINT 5: Before position update
          const stateBefore = stateManager.getState();
          console.log(`CP5: BEFORE BUY - Position: ${stateBefore.position}, Balance: $${stateBefore.balance}`);

          // CHANGE 2025-12-11: Use StateManager for atomic position updates
          // CHANGE 2025-12-11 FIX: orderId was undefined - use unifiedResult.orderId
          // FIX 2026-02-02: Attach patterns + indicators for learning feedback at exit
          // CHANGE 2026-02-13: Attach signalBreakdown for comprehensive trade logging

          // CHANGE 2026-02-21: Use orchestrator's winning strategy and exit contract
          // The StrategyOrchestrator already determined the winner and created the exit contract
          // Phase 3 REWRITE: orchResult is now passed directly from TradingLoop
          const entryStrategy = entryPlan.entryStrategy;
          const sizingMultiplier = entryPlan.sizingMultiplier;
          const exitContract = entryPlan.exitContract;
          const frozenExitPolicy = entryPlan.frozenExitPolicy;
          const adjustedPositionSize = executedEntryPlan.sizeUsd;

          // PERMANENT TRADE RECEIPT - shows actual dollars/percent on EVERY trade (live, paper, backtest)
          // FIX 2026-03-28: adjustedPositionSize is already USD, no multiplication needed
          const actualDollars = adjustedPositionSize;
          const actualPercent = currentBalance > 0 ? (actualDollars / currentBalance) * 100 : 0;
          console.log(`[TRADE-RECEIPT] $${actualDollars.toFixed(2)} / $${currentBalance.toFixed(2)} = ${actualPercent.toFixed(1)}% of account | Conf: ${(tradeConfidence * 100).toFixed(0)}% | Confluence: ${sizingMultiplier}x | Strategy: ${entryStrategy}`);

          console.log(`[ORCHESTRATOR-ENTRY] Winner: ${entryStrategy} | Sizing: ${sizingMultiplier}x | SL=${exitContract.stopLossPercent}%, TP=${exitContract.takeProfitPercent}%`);

          // L4: Enrich ledger with actual computed position sizing
          let ledgerPositionSizing = null;
          if (decision.ledgerData) {
            const baseP = ConfigLoader.get('positionSizing.maxPositionSize');
            ledgerPositionSizing = {
              basePercent: baseP,
              confidenceMultiplier,
              confidencePercent: baseP * confidenceMultiplier,
              confluenceMultiplier: sizingMultiplier,
              finalPercent: currentBalance > 0 ? adjustedPositionSize / currentBalance : 0,
              accountBalance: currentBalance,
              finalSizeUsd: adjustedPositionSize,
              formula: `${(baseP*100).toFixed(1)}% base × ${confidenceMultiplier.toFixed(2)} conf × ${sizingMultiplier.toFixed(2)} confluence = ${actualPercent.toFixed(2)}% of $${currentBalance.toFixed(0)} = $${adjustedPositionSize.toFixed(2)}`,
            };
          }

          const entryOrderQuantity = tradeResult.orderQuantity ?? entryPlan.orderQuantity;
          const entryOrderQuantityUnit = tradeResult.quantityUnit ?? entryPlan.quantityUnit;
          const positionResult = await stateManager.openPosition(adjustedPositionSize, price, {
            orderId: unifiedResult.orderId,
            action: 'BUY',
            direction: 'long',
            positionEffect,
            confidence: decision.confidence,
            patterns: patterns || [],
            entryIndicators: indicators,
            entryTime: this.ctx.marketData?.timestamp ?? Date.now(),
            signalBreakdown: orchResult?.signalBreakdown ?? null,
            bullishScore: orchResult?.bullishScore ?? 0,
            bearishScore: orchResult?.bearishScore || 0,
            reasoning: orchResult?.reasoning || '',
            entryStrategy: entryStrategy,
            entryGroupType: entryPlan.entryGroupType,
            entryGroupId: entryPlan.entryGroupId,
            fanoutIndex: entryPlan.fanoutIndex,
            fanoutCount: entryPlan.fanoutCount,
            entryTriggerClass: entryPlan.entryTriggerClass,
            exitContract: exitContract,
            frozenExitPolicy,
            riskGates: entryPlan.riskGates || [],
            ledgerData: this._ledgerDataWithEntryAnnotations(decision.ledgerData, {
              riskGates: entryPlan.riskGates,
              positionSizing: ledgerPositionSizing,
              operationalQuarantine: entryPlan.operationalQuarantine,
            }),
            traceId,
            signalId,
            decisionId,
            brokerOrderId: tradeResult.brokerOrderId === undefined ? tradeResult.orderId : tradeResult.brokerOrderId,
            webhookOrderIdMissing: tradeResult.webhookOrderIdMissing === true,
            webhookAcceptedWithoutOrderId: tradeResult.webhookAcceptedWithoutOrderId === true,
            // CC-A Change 2: stamp indicator state at entry on trade record
            atrAtEntry: decision.atrAtEntry ?? null,
            regimeAtEntry: decision.regimeAtEntry ?? null,
            rsiAtEntry: decision.rsiAtEntry ?? null,
            brokerId: entryPlan.brokerId,
            executionRoute,
            executionVenue,
            marketDataBrokerId,
            accountId: entryPlan.accountId,
            accountIdSource: entryPlan.accountIdSource,
            assetClass: entryPlan.assetClass,
            executionMode: entryPlan.executionMode,
            timeframe: entryPlan.timeframe,
            symbol,
            entryOrderQuantity,
            entryOrderQuantityUnit,
            remainingOrderQuantity: entryOrderQuantity,
            remainingOrderQuantityUnit: entryOrderQuantityUnit,
          });

          // CHANGE 2025-12-12: Validate StateManager.openPosition() success
          if (!positionResult.success) {
            console.error('StateManager.openPosition failed:', positionResult.error);
            // CHANGE 2025-12-13: Remove from StateManager (single source of truth)
            stateManager.removeActiveTrade(unifiedResult.orderId);
	          emitTrace(this.ctx, 'STATE_MUTATION', {
	            traceId,
	            signalId,
	            symbol,
	            action: decision.action,
              positionEffect,
              success: false,
              operation: 'openPosition',
              error: positionResult.error,
            });
            return blockedReturn('state_open_failed', {
              operation: 'openPosition',
              orderId: unifiedResult.orderId,
              orderAccepted: true,
              stateMutationSucceeded: false,
              error: positionResult.error,
            });
          }

          // CHANGE 2025-12-13: No longer sync to local balance - read from StateManager
          const stateAfter = stateManager.getState();

          // CHECKPOINT 6: After position update
          console.log(`CP6: AFTER BUY - Position: ${stateAfter.position}, Balance: $${stateAfter.balance} (spent $${adjustedPositionSize})`);
          emitTrace(this.ctx, 'STATE_MUTATION', {
            traceId,
            signalId,
            symbol,
            action: decision.action,
            positionEffect,
            success: true,
            operation: 'openPosition',
            orderId: unifiedResult.orderId,
            price,
            sizeUsd: adjustedPositionSize,
            orderQuantity: entryOrderQuantity,
            quantityUnit: entryOrderQuantityUnit,
            position: stateAfter.position,
            balance: stateAfter.balance,
          });
          tradeResult.stockShareRangeFillViolation = await this._handleStockShareRangeFillViolation({
            entryPlan,
            executedEntryPlan,
            traceId,
            signalId,
            symbol,
            action: decision.action,
          });

          // CHANGE 2026-02-01: Send Telegram notification for trade
          // Skip notifications during fast backtest
          if (!this.ctx.backtestFast) {
            this.ctx.notifyTrade({
              action: 'BUY',
              direction: 'long',
              asset: symbol,
              price: price,
              size: adjustedPositionSize / stateAfter.balance,
              confidence: decision.confidence / 100
            }).catch(err => console.warn(`Telegram notify failed: ${err.message}`));

            // CHANGE 2026-02-01: Re-enable Discord notifications (broken since v7)
            this.ctx.discordNotifier.notifyTrade('buy', price, adjustedPositionSize);

          }

          // Start pattern exit tracking (shadow mode or active)
          if (this.ctx.patternExitModel) {
            const exitTracking = this.ctx.patternExitModel.startTracking({
              entryPrice: price,
              direction: 'long',
              size: adjustedPositionSize,
              patterns: patterns || [],
              confidence: decision.confidence / 100,
              entryTime: this.ctx.marketData?.timestamp ?? Date.now()
            });

            if (this.ctx.patternExitShadowMode) {
              console.log(`[SHADOW] Pattern Exit Tracking Started:`);
              console.log(`   Pattern Target: ${(exitTracking.patternTarget * 100).toFixed(2)}%`);
              console.log(`   Pattern Stop: ${(exitTracking.patternStop * 100).toFixed(2)}%`);
            }
          }

          // Phase 4 REWRITE: executionLayer.trades deleted - backtestRecorder handles trade recording

          // CHANGE 2026-01-23: Broadcast BUY trade to dashboard
          {
            const openedTrade = this._getActiveTradeById(unifiedResult.orderId);
            const sentDashboardTrade = this._broadcastDashboardTrade({
              action: 'BUY',
              direction: 'long',
              positionEffect,
              symbol,
              price: price,
              pnl: 0,  // No P&L on entry
              timestamp: Date.now(),
              confidence: decision.confidence
            }, openedTrade || { orderId: unifiedResult.orderId, symbol });
            if (sentDashboardTrade) {
              console.log(`Broadcast BUY trade to dashboard at $${price.toFixed(2)}`);
            }
          }

          // CHANGE 2026-01-25: Log trade for website proof
          // CC-SPEC-EVAL-CAPTURE (2/3): forensic identity for entry/exit pairing
          TradingProofLogger.trade({
            action: 'BUY',
            positionEffect,
            symbol,
            price: price,
            size: adjustedPositionSize,
            // FIX VALUE-USD-DOUBLE-MULT 2026-05-13: adjustedPositionSize is already USD
            // (see line 109). Prior code multiplied USD × price, producing nonsense values
            // (e.g. $250 TSLA position recorded as $106,250; $1452 BTC position recorded
            // as $117M). Internal P&L was correct because StateManager uses the proper
            // formula independently; this was a display-layer bug.
            value_usd: adjustedPositionSize,
            fees: this._calculateOrderFee({
              notionalUsd: adjustedPositionSize,
              orderQuantity: entryOrderQuantity,
              side: 'entry',
            }),
            reason: unifiedResult.patterns?.map(p => p.name).join(' + ') || 'Signal-based entry',
            confidence: decision.confidence,
            traceId,
            signalId,
            decisionId,
            indicators: unifiedResult.indicators,
            pattern: unifiedResult.patterns?.[0]?.name || null,
            tradeId: unifiedResult.orderId,
            orderId: unifiedResult.orderId,
            entryPrice: price
          });

        } else if (decision.action === 'SELL_SHORT') {
          // ═══ SELL_SHORT: Open a short position ═══
          const stateBefore = stateManager.getState();
          console.log(`[CP5-SHORT] BEFORE SHORT - Position: ${stateBefore.position}, Balance: $${stateBefore.balance}`);

          const entryStrategy = entryPlan.entryStrategy;
          const sizingMultiplier = entryPlan.sizingMultiplier;
          const exitContract = entryPlan.exitContract;
          const frozenExitPolicy = entryPlan.frozenExitPolicy;
          const adjustedPositionSize = executedEntryPlan.sizeUsd;

          // FIX 2026-03-28: adjustedPositionSize is already USD, no multiplication needed
          const actualDollars = adjustedPositionSize;
          const actualPercent = currentBalance > 0 ? (actualDollars / currentBalance) * 100 : 0;
          console.log(`[TRADE-RECEIPT] SHORT $${actualDollars.toFixed(2)} / $${currentBalance.toFixed(2)} = ${actualPercent.toFixed(1)}% of account | Conf: ${(tradeConfidence * 100).toFixed(0)}% | Confluence: ${sizingMultiplier}x | Strategy: ${entryStrategy}`);

          console.log(`[ORCHESTRATOR-ENTRY] SHORT Winner: ${entryStrategy} | Sizing: ${sizingMultiplier}x | SL=${exitContract.stopLossPercent}%, TP=${exitContract.takeProfitPercent}%`);

          // L4: Enrich ledger with actual computed position sizing (short path)
          let ledgerPositionSizing = null;
          if (decision.ledgerData) {
            const baseP = ConfigLoader.get('positionSizing.maxPositionSize');
            ledgerPositionSizing = {
              basePercent: baseP,
              confidenceMultiplier,
              confidencePercent: baseP * confidenceMultiplier,
              confluenceMultiplier: sizingMultiplier,
              finalPercent: currentBalance > 0 ? adjustedPositionSize / currentBalance : 0,
              accountBalance: currentBalance,
              finalSizeUsd: adjustedPositionSize,
              formula: `${(baseP*100).toFixed(1)}% base × ${confidenceMultiplier.toFixed(2)} conf × ${sizingMultiplier.toFixed(2)} confluence = ${actualPercent.toFixed(2)}% of $${currentBalance.toFixed(0)} = $${adjustedPositionSize.toFixed(2)}`,
            };
          }

          const entryOrderQuantity = tradeResult.orderQuantity ?? entryPlan.orderQuantity;
          const entryOrderQuantityUnit = tradeResult.quantityUnit ?? entryPlan.quantityUnit;
          const positionResult = await stateManager.openPosition(adjustedPositionSize, price, {
            orderId: unifiedResult.orderId,
            confidence: decision.confidence,
            direction: 'short',
            action: 'SELL_SHORT',
            positionEffect,
            patterns: patterns || [],
            entryIndicators: indicators,
            entryTime: this.ctx.marketData?.timestamp ?? Date.now(),
            signalBreakdown: orchResult?.signalBreakdown ?? null,
            bullishScore: orchResult?.bullishScore ?? 0,
            bearishScore: orchResult?.bearishScore || 0,
            reasoning: orchResult?.reasoning || '',
            entryStrategy: entryStrategy,
            entryGroupType: entryPlan.entryGroupType,
            entryGroupId: entryPlan.entryGroupId,
            fanoutIndex: entryPlan.fanoutIndex,
            fanoutCount: entryPlan.fanoutCount,
            entryTriggerClass: entryPlan.entryTriggerClass,
            exitContract: exitContract,
            frozenExitPolicy,
            riskGates: entryPlan.riskGates || [],
            ledgerData: this._ledgerDataWithEntryAnnotations(decision.ledgerData, {
              riskGates: entryPlan.riskGates,
              positionSizing: ledgerPositionSizing,
              operationalQuarantine: entryPlan.operationalQuarantine,
            }),
            traceId,
            signalId,
            decisionId,
            brokerOrderId: tradeResult.brokerOrderId === undefined ? tradeResult.orderId : tradeResult.brokerOrderId,
            webhookOrderIdMissing: tradeResult.webhookOrderIdMissing === true,
            webhookAcceptedWithoutOrderId: tradeResult.webhookAcceptedWithoutOrderId === true,
            // CC-A Change 2: stamp indicator state at entry on trade record
            atrAtEntry: decision.atrAtEntry ?? null,
            regimeAtEntry: decision.regimeAtEntry ?? null,
            rsiAtEntry: decision.rsiAtEntry ?? null,
            brokerId: entryPlan.brokerId,
            executionRoute,
            executionVenue,
            marketDataBrokerId,
            accountId: entryPlan.accountId,
            accountIdSource: entryPlan.accountIdSource,
            assetClass: entryPlan.assetClass,
            executionMode: entryPlan.executionMode,
            timeframe: entryPlan.timeframe,
            symbol,
            entryOrderQuantity,
            entryOrderQuantityUnit,
            remainingOrderQuantity: entryOrderQuantity,
            remainingOrderQuantityUnit: entryOrderQuantityUnit,
          });

          if (!positionResult.success) {
            console.error('StateManager.openPosition (SHORT) failed:', positionResult.error);
            stateManager.removeActiveTrade(unifiedResult.orderId);
	          emitTrace(this.ctx, 'STATE_MUTATION', {
	            traceId,
	            signalId,
	            symbol,
	            action: decision.action,
              positionEffect,
              success: false,
              operation: 'openPosition',
              error: positionResult.error,
            });
            return blockedReturn('state_open_failed', {
              operation: 'openPosition',
              orderId: unifiedResult.orderId,
              orderAccepted: true,
              stateMutationSucceeded: false,
              error: positionResult.error,
            });
          }

          const stateAfter = stateManager.getState();
          console.log(`CP6-SHORT: AFTER SHORT - Position: ${stateAfter.position}, Balance: $${stateAfter.balance}`);
          emitTrace(this.ctx, 'STATE_MUTATION', {
            traceId,
            signalId,
            symbol,
            action: decision.action,
            positionEffect,
            success: true,
            operation: 'openPosition',
            orderId: unifiedResult.orderId,
            price,
            sizeUsd: adjustedPositionSize,
            orderQuantity: entryOrderQuantity,
            quantityUnit: entryOrderQuantityUnit,
	            position: stateAfter.position,
	            balance: stateAfter.balance,
	          });
	          tradeResult.stockShareRangeFillViolation = await this._handleStockShareRangeFillViolation({
	            entryPlan,
	            executedEntryPlan,
	            traceId,
	            signalId,
	            symbol,
	            action: decision.action,
	          });

          // Notifications
          if (!this.ctx.backtestFast) {
            this.ctx.notifyTrade({
              action: 'SELL_SHORT',
              direction: 'short',
              asset: symbol,
              price: price,
              size: adjustedPositionSize / stateAfter.balance,
              confidence: decision.confidence / 100
            }).catch(err => console.warn(`Telegram notify failed: ${err.message}`));

            this.ctx.discordNotifier.notifyTrade('sell_short', price, adjustedPositionSize);

          }

          // Pattern exit tracking for shorts
          if (this.ctx.patternExitModel) {
            const exitTracking = this.ctx.patternExitModel.startTracking({
              entryPrice: price,
              direction: 'short',
              size: adjustedPositionSize,
              patterns: patterns || [],
              confidence: decision.confidence / 100,
              entryTime: this.ctx.marketData?.timestamp ?? Date.now()
            });

            if (this.ctx.patternExitShadowMode) {
              console.log(`[SHADOW] Pattern Exit Tracking Started (SHORT):`);
              console.log(`   Pattern Target: ${(exitTracking.patternTarget * 100).toFixed(2)}%`);
              console.log(`   Pattern Stop: ${(exitTracking.patternStop * 100).toFixed(2)}%`);
            }
          }

          // Dashboard broadcast for SHORT
          {
            const openedTrade = this._getActiveTradeById(unifiedResult.orderId);
            const sentDashboardTrade = this._broadcastDashboardTrade({
              action: 'SELL_SHORT',
              direction: 'short',
              positionEffect,
              symbol,
              price: price,
              pnl: 0,
              timestamp: Date.now(),
              confidence: decision.confidence
            }, openedTrade || { orderId: unifiedResult.orderId, symbol });
            if (sentDashboardTrade) {
              console.log(`Broadcast SHORT trade to dashboard at $${price.toFixed(2)}`);
            }
          }

          // Proof logger for SHORT
          // CC-SPEC-EVAL-CAPTURE (2/3): forensic identity for entry/exit pairing
          TradingProofLogger.trade({
            action: 'SELL_SHORT',
            positionEffect,
            symbol,
            price: price,
            size: adjustedPositionSize,
            // FIX VALUE-USD-DOUBLE-MULT 2026-05-13: adjustedPositionSize is already USD
            // (see line 109). Prior code multiplied USD × price, producing nonsense values
            // (e.g. $250 TSLA position recorded as $106,250; $1452 BTC position recorded
            // as $117M). Internal P&L was correct because StateManager uses the proper
            // formula independently; this was a display-layer bug.
            value_usd: adjustedPositionSize,
            fees: this._calculateOrderFee({
              notionalUsd: adjustedPositionSize,
              orderQuantity: entryOrderQuantity,
              side: 'entry',
            }),
            reason: unifiedResult.patterns?.map(p => p.name).join(' + ') || 'Signal-based short entry',
            confidence: decision.confidence,
            traceId,
            signalId,
            decisionId,
            indicators: unifiedResult.indicators,
            pattern: unifiedResult.patterns?.[0]?.name || null,
            tradeId: unifiedResult.orderId,
            orderId: unifiedResult.orderId,
            entryPrice: price
          });

        } else if (decision.action === 'SELL') {
          // CHECKPOINT 7: SELL execution (close long)
          // FIX 2026-04-16: Hoist variables to SELL scope so post-block cleanup can see them
          let isPartialClose = false;
          let buyTrade = null;
          let pnl = 0;
          const currentState = stateManager.getState();
          console.log(`CP7: SELL PATH - Position: ${currentState.position}, Balance: $${currentState.balance}`);

          // Change 589: Complete post-trade integrations
          // Find the matching BUY trade FOR THIS SYMBOL ONLY.
          // CC-C Commit 5: getTradesBySymbol filters strict — no more
          // cross-symbol contamination where a SELL of TSLA could match
          // a BUY of BTC because both lived in the same activeTrades map.
          const buyTrades = stateManager.getTradesBySymbol(symbol)
            .filter(t => t.action === 'BUY')
            .sort((a, b) => a.entryTime - b.entryTime);

          // CHANGE 644: Add error handling for SELL with no matching BUY
          if (buyTrades.length === 0) {
            console.error(`CRITICAL: SELL signal for ${symbol} but no matching BUY trade found for this symbol!`);
            console.log('   Current position:', currentState.position);
            // Diagnostic: dump trades for THIS symbol so the operator can
            // see what's actually open under this symbol's bucket. Account-
            // wide dump would mask a true cross-symbol mismatch as noise.
            const symbolTrades = stateManager.getTradesBySymbol(symbol);
            console.log(`   Active trades count for ${symbol}:`, symbolTrades.length);
            console.log(`   Active trades for ${symbol}:`, symbolTrades.map(t => ({
              id: t.orderId,
              action: t.action,
              price: t.entryPrice
            })));

            const haltReason = 'KILL-5: SELL with no matching BUY';
            console.error(`[KILL-5-MITIGATION] ${haltReason} for ${symbol}; not persisting a symbol entry halt`);
            emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, positionEffect, reason: haltReason });
            return blockedReturn(haltReason);
          }

          if (buyTrades.length > 0) {
            // buyTrade hoisted to SELL scope above
            if (decision.tradeId) {
              buyTrade = buyTrades.find(t => t.orderId === decision.tradeId || t.id === decision.tradeId);
            }
            if (!buyTrade) {
              // FIX P2-B: surface the fallback. Single-position mode: buyTrades[0] is the only trade, fallback benign.
              // Multi-position mode: silently mis-attributes exit to oldest trade instead of orchestrator-targeted one.
              console.warn(`[OrderExecutor] WARN P2-B: tradeId '${decision.tradeId}' not found in ${buyTrades.length} active trades for ${symbol}. Falling back to oldest (${buyTrades[0]?.orderId || buyTrades[0]?.id}). Exit may attribute to wrong position.`);
              buyTrade = buyTrades[0];
            }
            pnl = ((price - buyTrade.entryPrice) / buyTrade.entryPrice) * 100;
            const exitTimestamp = this.ctx.marketData?.timestamp || Date.now();
            const holdDuration = exitTimestamp - buyTrade.entryTime;
            const longExitSizeUsd = this._firstFiniteNumber(executedExitPlan?.sizeUsd) ?? this._resolveStoredSizeUsd(buyTrade, 'BUY exit');
            const longExitOrderQuantity = executedExitPlan?.orderQuantity ?? exitPlan?.orderQuantity ?? null;
            const longExitQuantityUnit = executedExitPlan?.quantityUnit ?? exitPlan?.quantityUnit ?? buyTrade.entryOrderQuantityUnit ?? null;
            const longEntryFeeQuantity = longExitOrderQuantity
              ?? buyTrade.entryOrderQuantity
              ?? (buyTrade.entryPrice > 0 ? longExitSizeUsd / buyTrade.entryPrice : null);
            const longExitFeeQuantity = longExitOrderQuantity
              ?? (price > 0 ? longExitSizeUsd / price : null);
            const stateExitFraction = executedExitPlan?.stateExitFraction ?? 1;
            const statePartialClose = executedExitPlan ? stateExitFraction < 1 : false;

            if (isWebhookExecutionRoute && !statePartialClose) {
              const brokerFlatCheck = await this._verifyWebhookFullExitBrokerFlat({
                executedExitPlan,
                tradeResult,
                traceId,
                signalId,
                decisionId,
              });
              if (brokerFlatCheck && brokerFlatCheck.brokerFlatVerified !== true) {
                return brokerFlatCheck;
              }
              if (brokerFlatCheck?.brokerFlatVerified === true) {
                tradeResult.brokerFlatVerified = true;
              }
            }

            // Create complete trade result
            // FIX 2026-02-23: Use actual exitReason from decision (was hardcoded to 'signal')
            const completeTradeResult = {
              ...buyTrade,
              traceId,
              signalId,
              decisionId,
              size: longExitSizeUsd,
              sizeUsd: longExitSizeUsd,
              exitPrice: price,
              exitTime: exitTimestamp,
              pnl: pnl,
              // FIX 2026-03-28: USD position × percentage change = USD profit
              // MED-02: throw on non-positive entryPrice. CRIT-01 halts on
              // zero capital and CRIT-09 halts on missing price, so this throw
              // catches genuine state corruption (BUY trade record with bad
              // entryPrice). Halt-class — refuses to silently log $0 P&L
              // which corrupts win-rate stats downstream.
              pnlDollars: (() => {
                if (!(buyTrade.entryPrice > 0)) {
                  throw new Error(`[MED-02] BUY exit: buyTrade.entryPrice non-positive (got ${buyTrade.entryPrice}) — refusing to log phantom \$0 P&L`);
                }
                return longExitSizeUsd * ((price - buyTrade.entryPrice) / buyTrade.entryPrice);
              })(),
              holdDuration: holdDuration,
              exitReason: this._firstNonEmptyString(decision.exitReason)
            };

            // CHANGE 2026-02-23: Record trade in BacktestRecorder (with fees, running balance)
            if (this.ctx.backtestRecorder) {
              this.ctx.backtestRecorder.recordTrade({
                tradeId: buyTrade.orderId || buyTrade.id || decision.tradeId || null,
                positionEffect,
                entryTime: buyTrade.entryTime ? new Date(buyTrade.entryTime).toISOString() : '',
                exitTime: exitTimestamp ? new Date(exitTimestamp).toISOString() : '',
                direction: 'long',
                entryPrice: buyTrade.entryPrice,
                exitPrice: price,
                stopLoss: this._firstFiniteNumber(buyTrade.exitContract?.stopLossPercent),
                takeProfit: this._firstFiniteNumber(buyTrade.exitContract?.takeProfitPercent),
                size: longExitSizeUsd,
                entryOrderQuantity: buyTrade.entryOrderQuantity,
                entryOrderQuantityUnit: buyTrade.entryOrderQuantityUnit,
                remainingOrderQuantityBeforeExit: buyTrade.remainingOrderQuantity,
                remainingOrderQuantityUnit: buyTrade.remainingOrderQuantityUnit,
                exitOrderQuantity: longExitOrderQuantity,
                exitOrderQuantityUnit: longExitQuantityUnit,
                closedOrderQuantity: longExitOrderQuantity,
                quantityUnit: longExitQuantityUnit,
                entryFeeQuantity: longEntryFeeQuantity,
                exitFeeQuantity: longExitFeeQuantity,
                // MED-03: throw when buyTrade.entryStrategy missing at exit time.
                // Set at trade open from orchResult.winnerStrategy (HIGH-08 covers
                // missing-at-open). Missing AT EXIT means the trade record lost
                // entryStrategy between open and close — state-corruption signal.
                ...(buyTrade.entryStrategy ? {} : (() => { throw new Error(`[MED-03] BUY exit: trade record missing entryStrategy (orderId=${buyTrade.orderId}) — state corruption between open and close`); })()),
                strategyName: buyTrade.entryStrategy,
                confidence: this._firstFiniteNumber(buyTrade.confidence),
                signalBreakdown: buyTrade.signalBreakdown ?? null,
                mtfConfluenceSnapshot: buyTrade.frozenExitPolicy?.mtfConfluenceSnapshot ?? null,
                riskGates: Array.isArray(buyTrade.riskGates) ? buyTrade.riskGates : null,
                maxFavorableExcursionPercent: this._firstFiniteNumber(
                  buyTrade.maxFavorableExcursionPercent,
                  buyTrade.maxProfitPercent
                ),
                maxAdverseExcursionPercent: this._firstFiniteNumber(buyTrade.maxAdverseExcursionPercent),
                isPartialClose: statePartialClose,
                partialFraction: statePartialClose ? stateExitFraction : null,
                exitReason: completeTradeResult.exitReason,
                reason: this._firstNonEmptyString(buyTrade.reason),
                holdTimeMinutes: holdDuration / 60000,
                exitContract: buyTrade.exitContract,
                frozenExitPolicy: buyTrade.frozenExitPolicy ?? null,
                // CC-A Change 2: passthrough indicator state stamped on trade at entry
                atrAtEntry: buyTrade.atrAtEntry ?? null,
                regimeAtEntry: buyTrade.regimeAtEntry ?? null,
                rsiAtEntry: buyTrade.rsiAtEntry ?? null,
                // CC-C Commit 5: drop the historical `?? buyTrade.tradingPair ??
                // this.ctx.tradingPair ?? null` chain. Trade objects carry
                // top-level `symbol` since StateManager:417 (2026-05-05); the
                // chain was rotted scaffolding that masked weak openPosition
                // calls. With executeTrade's `symbol` param required and
                // openPosition stamping it on the trade record, buyTrade.symbol
                // is the single source of truth here.
                symbol: buyTrade.symbol,
                brokerId: buyTrade.brokerId,
                accountId: buyTrade.accountId,
                accountIdSource: buyTrade.accountIdSource,
                assetClass: buyTrade.assetClass,
                executionMode: buyTrade.executionMode,
                timeframe: buyTrade.timeframe,
                scopeKey: buyTrade.scopeKey,
                scopeKeyVersion: buyTrade.scopeKeyVersion,
                traceId,
                signalId,
                decisionId
              });
              const loggedStrategy = this._firstNonEmptyString(buyTrade.entryStrategy, buyTrade.strategy) ?? 'missing';
              const loggedConfidence = this._firstFiniteNumber(buyTrade.confidence);
              const loggedExitReason = this._firstNonEmptyString(completeTradeResult.exitReason) ?? 'missing';
              console.log(`[TRADE-LOG] Strategy: ${loggedStrategy} | Conf: ${loggedConfidence === null ? 'missing' : `${loggedConfidence.toFixed(1)}%`} | Size: ${longExitSizeUsd} | Exit: ${loggedExitReason}`);
            }

            console.log(`Trade closed: ${pnl >= 0 ? 'PASS' : 'FAIL'} ${pnl.toFixed(2)}% | Hold: ${(holdDuration/60000).toFixed(1)}min`);

            isPartialClose = statePartialClose;
            const longFillFee = this._calculateOrderFee({
              notionalUsd: longExitOrderQuantity * price,
              orderQuantity: longExitOrderQuantity,
              side: 'exit',
            });
            const confirmedAtMs = Date.now();
            const closeResult = await stateManager.applyFill(this._buildExecutionFill({
              exitPlan,
              executedExitPlan,
              tradeResult,
              fillPrice: price,
              fee: longFillFee,
              exitIntent,
              confirmedAtMs,
              eventTimeMs: exitTimestamp,
              simulated: this.ctx.backtestMode === true || this.ctx.paperTrading === true || isWebhookExecutionRoute,
            }));

            // Confirmed execution fill is the only active-trade mutation path.
            if (!closeResult.success) {
              console.error('StateManager.applyFill failed:', closeResult.error);
              if (exitIntent) {
                await this._releaseExitIntentWithTrace({
                  exitPlan,
                  pendingExitIntent: exitIntent,
                  reason: 'apply_fill_failed',
                  traceId,
                  signalId,
                  decisionId,
                  symbol,
                  action: decision.action,
                  positionEffect,
                });
              }
              emitTrace(this.ctx, 'STATE_MUTATION', {
                traceId,
                signalId,
                symbol,
                action: decision.action,
                positionEffect,
                success: false,
                operation: 'applyFill',
                orderId: buyTrade.orderId,
                intentId: exitIntent?.intentId || null,
                error: closeResult.error,
              });
              return blockedReturn('state_close_failed', {
                operation: 'applyFill',
                orderId: buyTrade.orderId,
                intentId: exitIntent?.intentId || null,
                orderAccepted: true,
                stateMutationSucceeded: false,
                error: closeResult.error,
              });
            }

            // Get updated state after close
            // CHANGE 2025-12-13: No local balance sync needed - read from StateManager
            const afterSellState = stateManager.getState();
            emitTrace(this.ctx, 'STATE_MUTATION', {
              traceId,
              signalId,
              symbol,
              action: decision.action,
              positionEffect,
              success: true,
              operation: 'applyFill',
              orderId: buyTrade.orderId,
              intentId: exitIntent?.intentId || null,
              fillId: closeResult.fillId || null,
              price,
              pnlDollars: completeTradeResult.pnlDollars ?? closeResult.pnl ?? null,
              exitReason: completeTradeResult.exitReason ?? null,
              closed: Number.isFinite(Number(closeResult.remainingOrderQuantity))
                ? Number(closeResult.remainingOrderQuantity) <= 0
                : null,
              filledQuantity: closeResult.filledQuantity ?? null,
              remainingOrderQuantity: closeResult.remainingOrderQuantity ?? null,
              position: afterSellState.position,
              balance: afterSellState.balance,
            });

            // Calculate display values
            // FIX VALUE-USD-DOUBLE-MULT 2026-05-13: usdAmount IS USD per L756 comment.
            // Prior code computed sellValue = usdAmount × price and entryValue = usdAmount
            // × entryPrice, then profitLoss = sellValue - entryValue = usdAmount × (price -
            // entryPrice). Units: USD × $. The bot balance was correct because StateManager
            // computes P&L independently; this profitLoss was display-only and read by
            // notifyTradeClose/Discord/explanation strings (all paths skipped under
            // BACKTEST_FAST or with TRAI disabled, which is why anchor was unaffected).
            // Correct formula for USD-denominated position: pnl = usd × (priceDelta / entry).
            const usdAmount = executedExitPlan ? executedExitPlan.sizeUsd : longExitSizeUsd;
            const sellValue = usdAmount;  // already USD — for display
            const profitLoss = buyTrade.entryPrice > 0
              ? usdAmount * ((price - buyTrade.entryPrice) / buyTrade.entryPrice)
              : 0;
            console.log(`CP8: SELL COMPLETE - New Balance: $${stateManager.get('balance')} (received $${sellValue.toFixed(2)}, P&L: $${profitLoss.toFixed(2)})`);

            // CHANGE 2026-02-01: Send notifications for trade close with P&L
            // BACKTEST_FAST: Skip notifications during backtest
            if (!this.ctx.backtestFast) {
              this.ctx.notifyTradeClose({
                pnl: profitLoss,
                entryPrice: buyTrade.entryPrice,
                exitPrice: price,
                duration: `${Math.round((Date.now() - buyTrade.entryTime) / 60000)}m`
              }).catch(err => console.warn(`Telegram notify failed: ${err.message}`));

              // CHANGE 2026-02-01: Re-enable Discord notifications for SELL
              this.ctx.discordNotifier.notifyTrade('sell', price, usdAmount, profitLoss);

            }

            // Phase 4 REWRITE: executionLayer.trades deleted - backtestRecorder handles trade recording

            // CHANGE 2026-01-23: Broadcast SELL trade to dashboard
            {
              const sentDashboardTrade = this._broadcastDashboardTrade({
                action: 'SELL',
                direction: 'long',
                positionEffect,
                symbol,
                price: price,
                pnl: completeTradeResult.pnlDollars,
                timestamp: Date.now(),
                duration: `${(holdDuration / 60000).toFixed(1)}m`,
                confidence: decision.confidence
              }, completeTradeResult);
              if (sentDashboardTrade) {
                console.log(`Broadcast SELL trade to dashboard at $${price.toFixed(2)} (P&L: $${completeTradeResult.pnlDollars.toFixed(2)})`);
              }
            }

            // CHANGE 2026-01-25: Log trade for website proof
            // CC-SPEC-EVAL-CAPTURE (2/3): forensic identity for entry/exit pairing
            TradingProofLogger.trade({
              action: 'SELL',
              positionEffect,
              symbol,
              price: price,
              size: usdAmount,
              value_usd: sellValue,
              fees: this._calculateOrderFee({
                notionalUsd: sellValue,
                orderQuantity: longExitFeeQuantity,
                side: 'exit',
              }),
              reason: completeTradeResult.exitReason,
              confidence: decision.confidence,
              traceId,
              signalId,
              decisionId,
              indicators: { rsi: indicators.rsi, macd: indicators.macd?.macd ?? null },
              pattern: buyTrade.patterns?.[0]?.name || null,
              tradeId: buyTrade.orderId,
              orderId: buyTrade.orderId,
              entryPrice: buyTrade.entryPrice,
              pnl: completeTradeResult.pnlDollars,
              pnlPercent: pnl,
              isPartialClose: statePartialClose,
              partialFraction: statePartialClose ? stateExitFraction : null,
              exitReason: completeTradeResult.exitReason
            });

            // Log P&L explanation for transparency
            TradingProofLogger.explanation({
              decision: 'SELL',
              plain_english: `Closed position at $${price.toFixed(2)} after ${(holdDuration/60000).toFixed(1)} minutes. ${pnl >= 0 ? 'Profit' : 'Loss'} of ${pnl.toFixed(2)}% ($${profitLoss.toFixed(2)}).`,
              factors: [
                `Entry: $${buyTrade.entryPrice.toFixed(2)}`,
                `Exit: $${price.toFixed(2)}`,
                `Hold time: ${(holdDuration/60000).toFixed(1)} min`,
                `RSI at exit: ${indicators.rsi?.toFixed(1) || 'N/A'}`
              ]
            });

            // 1. SafetyNet DISABLED - too restrictive
            // this.ctx.safetyNet.updateTradeResult(completeTradeResult);

            // 2. Record pattern outcome for learning.
            // Outcome recording uses the first clean feature vector captured at
            // entry, not necessarily patterns[0]. Candlestick labels often lack
            // features while the same entry-time pattern array can carry a
            // later array element with the learning feature vector.
            this._recordClosedTradePatternOutcome(buyTrade, completeTradeResult, pnl, holdDuration);

            // FIX 2026-02-26: Run health check every 10 trade exits to detect broken pattern recording
            this._checkPatternOutcomeHealth();

            // 3. Update PerformanceAnalyzer (using processTrade, not recordTrade)
            this.ctx.performanceAnalyzer.processTrade(completeTradeResult);

            // 3.5 CHANGE 2026-02-14: Wire RiskManager trade tracking (was NEVER CALLED)
            // Updates RiskManager's own-fill realized P&L ledger for Trey drawdown-law reporting.
            const longResultPnlDollars = this._firstFiniteNumber(completeTradeResult.pnlDollars);
            const longResultPnlPercent = this._firstFiniteNumber(completeTradeResult.pnl);
            const longResultHoldDuration = this._firstFiniteNumber(completeTradeResult.holdDuration);
            const longResultExitReason = this._firstNonEmptyString(completeTradeResult.exitReason);
            const longResultStrategy = this._firstNonEmptyString(buyTrade.entryStrategy, buyTrade.strategy);

            if (this.ctx.riskManager && longResultPnlDollars !== null) {
	              this.ctx.riskManager.recordTradeResult({
	                success: pnl >= 0,
	                pnl: longResultPnlDollars,
	                pnlPercent: longResultPnlPercent,
	                symbol,
	                strategy: longResultStrategy,
	                venue: buyTrade.executionVenue || buyTrade.venue || buyTrade.brokerId || null,
	                timestamp: new Date().toISOString()
	              });
            } else if (this.ctx.riskManager) {
              console.warn('[RISK] Skipped trade result update: missing finite P&L dollars');
            }

            // 3.6 FIX 2026-03-29: Wire SMS daily loss tracking (was NEVER CALLED)
            // Updates dailyLosses counter so 3-loss-per-day limit works
            if (this.ctx.strategyOrchestrator && longResultStrategy && longResultPnlDollars !== null) {
              this.ctx.strategyOrchestrator.recordTradeResult(
                longResultStrategy,
                longResultPnlDollars,
                symbol
              );
            } else if (this.ctx.strategyOrchestrator) {
              console.warn('[STRATEGY] Skipped trade result update: missing strategy or finite P&L dollars');
            }

            // 3.7 FIX 2026-04-05: Wire PID Controller for adaptive parameter optimization
            // Updates position sizing, regime boosts, trailing stops based on performance
            try {
              if (
                longResultStrategy &&
                longResultPnlDollars !== null &&
                longResultPnlPercent !== null &&
                longResultExitReason &&
                longResultHoldDuration !== null
              ) {
                const pidController = getPIDController();
                pidController.onTradeClose({
                  strategyName: longResultStrategy,
                  netPnlDollars: longResultPnlDollars,
                  netPnlPercent: longResultPnlPercent,
                  exitReason: longResultExitReason,
                  maxProfitPercent: this._firstFiniteNumber(buyTrade.maxProfitPercent),
                  maxFavorableExcursion: this._firstFiniteNumber(buyTrade.maxFavorableExcursion),
                  holdDuration: longResultHoldDuration,
                });
              } else {
                console.warn('[PID] Skipped onTradeClose: missing strategy, P&L, exit reason, or hold duration');
              }
            } catch (err) {
              // PID is optional - don't break trade flow if it fails
              console.warn(`[PID] onTradeClose failed: ${err.message}`);
            }

            const traiLearningIndicators = this._buildTraiLearningIndicators(buyTrade);
            const traiLearningTrend = buyTrade.entryIndicators?.trend ?? buyTrade.indicators?.trend ?? null;
            const traiLearningVolatility = this._firstFiniteNumber(
              buyTrade.entryIndicators?.volatility,
              buyTrade.indicators?.volatility
            );

            // 4. CHANGE 2026-02-13: Re-enable TradeLogger with comprehensive breakdown
            try {
              this.ctx.logTrade({
                // Basic trade info
                type: 'SELL',
                action: 'SELL',
                positionEffect,
                orderId: buyTrade.orderId,
                tradeId: buyTrade.orderId,
                direction: 'long',
                symbol,
                strategyName: buyTrade.entryStrategy,
                entryPrice: buyTrade.entryPrice || buyTrade.price,
                exitPrice: price,
                currentPrice: price,
                size: longExitSizeUsd,

                // Financial results
                pnl: completeTradeResult.pnlDollars,
                pnlPercent: pnl,
                fees: this._calculateRoundTripFees({
                  entryNotionalUsd: longExitSizeUsd,
                  exitNotionalUsd: sellValue,
                  entryQuantity: longEntryFeeQuantity,
                  exitQuantity: longExitFeeQuantity,
                }),

                // Timing
                entryTime: new Date(buyTrade.entryTime).toISOString(),
                exitTime: new Date().toISOString(),
                holdTime: holdDuration,

                // Account
                balanceBefore: longResultPnlDollars === null ? null : stateManager.get('balance') - longResultPnlDollars,
                balanceAfter: stateManager.get('balance'),

                // Technical indicators at entry
                rsi: traiLearningIndicators.rsi,
                macd: traiLearningIndicators.macd,
                macdSignal: traiLearningIndicators.macdSignal,
                trend: traiLearningTrend,
                volatility: traiLearningVolatility,

                // CHANGE 2026-02-13: Decision reasoning breakdown
                confidence: this._firstFiniteNumber(buyTrade.confidence),
                signalBreakdown: buyTrade.signalBreakdown ?? null,
                bullishScore: this._firstFiniteNumber(buyTrade.bullishScore),
                bearishScore: this._firstFiniteNumber(buyTrade.bearishScore),
                entryReason: this._firstNonEmptyString(buyTrade.reasoning, buyTrade.reason),

                // Exit analysis
                exitReason: completeTradeResult.exitReason,
                reason: completeTradeResult.exitReason,
                exitIndicators: {
                  rsi: indicators.rsi,
                  macd: indicators.macd?.macd ?? null,
                  macdSignal: indicators.macd?.signal ?? null,
                  trend: indicators.trend,
                  volatility: indicators.volatility ?? null
                },

                // Pattern data
                patternType: buyTrade.patterns?.[0]?.name || null,
                patternConfidence: this._firstFiniteNumber(buyTrade.patterns?.[0]?.confidence),

                // Risk management
                positionSize: longExitSizeUsd,
                riskPercent: (() => {
                  const balance = Number(stateManager.get('balance'));
                  return Number.isFinite(balance) && balance > 0
                    ? (Math.abs(completeTradeResult.pnlDollars) / balance) * 100
                    : null;
                })(),

                // Session context
                totalTrades: stateManager.get('tradeCount') ?? null,
                winRate: this.ctx.performanceAnalyzer?.getWinRate?.() ?? null
              });
            } catch (logErr) {
              console.warn(`TradeLogger error: ${logErr.message}`);
            }

            // 5. TRAI learning — feed PatternMemoryBank for promotion/quarantine
            // FIX 2026-02-14: Pass complete trade object matching PatternMemoryBank schema
            // recordTradeOutcome() takes ONE arg. extractPattern() needs .indicators and .trend
            if (this.ctx.trai && this.pendingTraiDecisions?.has(buyTrade.orderId)) {
              const traiDecisionData = this.pendingTraiDecisions.get(buyTrade.orderId);
              const traiEntryFeatures = this._entryPatternFeaturesForTrai(buyTrade);
              const traiRecorded = this.ctx.trai.recordTradeOutcome({
                tradeId: buyTrade.orderId,
                decisionId: traiDecisionData.decisionId,
                symbol,
                brokerId: buyTrade.brokerId,
                accountId: buyTrade.accountId,
                accountIdSource: buyTrade.accountIdSource,
                assetClass: buyTrade.assetClass,
                executionMode: buyTrade.executionMode,
                timeframe: buyTrade.timeframe,
                scopeKey: buyTrade.scopeKey,
                strategy: buyTrade.entryStrategy,
                exitReason: completeTradeResult.exitReason,
                profitLoss: profitLoss,
                profitLossPercent: pnl,
                holdDuration: holdDuration,
                features: traiEntryFeatures,
                entry: {
                  price: buyTrade.entryPrice || buyTrade.price,
                  timestamp: buyTrade.entryTime,
                  features: traiEntryFeatures,
                  indicators: traiLearningIndicators,
                  trend: traiLearningTrend,
                  volatility: traiLearningVolatility
                },
                exit: {
                  price: price,
                  timestamp: Date.now(),
                  indicators: {
                    rsi: indicators.rsi,
                    macd: indicators.macd?.macd ?? null,
                    macdHistogram: indicators.macd?.histogram ?? null
                  },
                  trend: indicators.trend ?? null,
                  reason: completeTradeResult.exitReason
                },
                indicators: traiLearningIndicators,
                trend: traiLearningTrend,
                volatility: traiLearningVolatility,
                traiConfidence: traiDecisionData.traiConfidence,
                originalConfidence: traiDecisionData.originalConfidence
              });
              this.pendingTraiDecisions.delete(buyTrade.orderId);
              if (traiRecorded) {
                console.log(`[TRAI] Learning from ${pnl >= 0 ? 'WIN' : 'LOSS'}: ${pnl.toFixed(2)}% ($${profitLoss.toFixed(2)})`);
              } else {
                console.warn(`[TRAI] Learning skipped for ${buyTrade.orderId}: pattern outcome was not recorded`);
              }
            }
          }

          // Stop pattern exit tracking
          if (this.ctx.patternExitModel) {
            this.ctx.patternExitModel.stopTracking({
              pnl: pnl,
              exitReason: 'manual_sell'
            });
            if (this.ctx.patternExitShadowMode) {
              console.log(`[SHADOW] Pattern Exit tracking stopped`);
            }
          }

        } else if (decision.action === 'COVER') {
          // ═══ COVER: Close a short position ═══
          const currentState = stateManager.getState();
          console.log(`CP7-COVER: COVER PATH - Position: ${currentState.position}, Balance: $${currentState.balance}`);

          // Find matching SELL_SHORT trade FOR THIS SYMBOL ONLY.
          // CC-C Commit 5: same strict filter rationale as the SELL path —
          // no cross-symbol BUY/SHORT contamination when activeTrades holds
          // positions across multiple symbols/brokers simultaneously.
          const shortTrades = stateManager.getTradesBySymbol(symbol)
            .filter(t => t.action === 'SELL_SHORT')
            .sort((a, b) => a.entryTime - b.entryTime);

          if (shortTrades.length === 0) {
            console.error(`CRITICAL: COVER signal for ${symbol} but no matching SELL_SHORT trade found for this symbol!`);
            console.log('   Current position:', currentState.position);
            const symbolTrades = stateManager.getTradesBySymbol(symbol);
            console.log(`   Active trades for ${symbol}:`, symbolTrades.map(t => ({ id: t.orderId, action: t.action, price: t.entryPrice })));
            const haltReason = 'KILL-5: COVER with no matching SELL_SHORT';
            console.error(`[KILL-5-MITIGATION] ${haltReason} for ${symbol}; not persisting a symbol entry halt`);
            emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, positionEffect, reason: haltReason });
            return blockedReturn(haltReason);
          }

          let shortTrade = null;
          if (decision.tradeId) {
            shortTrade = shortTrades.find(t => t.orderId === decision.tradeId || t.id === decision.tradeId);
          }
          if (!shortTrade) {
            if (decision.tradeId) {
              console.warn(`[OrderExecutor] WARN P2-B: tradeId '${decision.tradeId}' not found in ${shortTrades.length} active short trades for ${symbol}. Falling back to oldest (${shortTrades[0]?.orderId || shortTrades[0]?.id}). Exit may attribute to wrong position.`);
            }
            shortTrade = shortTrades[0];
          }
          // SHORT PnL: profit when price goes DOWN (entry - exit)
          const pnl = ((shortTrade.entryPrice - price) / shortTrade.entryPrice) * 100;
          const exitTimestamp = this.ctx.marketData?.timestamp || Date.now();
          const holdDuration = exitTimestamp - shortTrade.entryTime;
          const coverExitSizeUsd = this._firstFiniteNumber(executedExitPlan?.sizeUsd) ?? this._resolveStoredSizeUsd(shortTrade, 'SHORT exit');
          const coverExitOrderQuantity = executedExitPlan?.orderQuantity ?? exitPlan?.orderQuantity ?? null;
          const coverExitQuantityUnit = executedExitPlan?.quantityUnit ?? exitPlan?.quantityUnit ?? shortTrade.entryOrderQuantityUnit ?? null;
          const shortEntryFeeQuantity = coverExitOrderQuantity
            ?? shortTrade.entryOrderQuantity
            ?? (shortTrade.entryPrice > 0 ? coverExitSizeUsd / shortTrade.entryPrice : null);
          const shortExitFeeQuantity = coverExitOrderQuantity
            ?? (price > 0 ? coverExitSizeUsd / price : null);
          const coverStateExitFraction = executedExitPlan?.stateExitFraction ?? 1;
          const coverPartialClose = executedExitPlan ? coverStateExitFraction < 1 : false;

          if (isWebhookExecutionRoute && !coverPartialClose) {
            const brokerFlatCheck = await this._verifyWebhookFullExitBrokerFlat({
              executedExitPlan,
              tradeResult,
              traceId,
              signalId,
              decisionId,
            });
            if (brokerFlatCheck && brokerFlatCheck.brokerFlatVerified !== true) {
              return brokerFlatCheck;
            }
            if (brokerFlatCheck?.brokerFlatVerified === true) {
              tradeResult.brokerFlatVerified = true;
            }
          }

          const completeTradeResult = {
            ...shortTrade,
            traceId,
            signalId,
            decisionId,
            size: coverExitSizeUsd,
            sizeUsd: coverExitSizeUsd,
            exitPrice: price,
            exitTime: exitTimestamp,
            pnl: pnl,
            // FIX 2026-03-28: USD position × percentage change = USD profit
            // MED-02: SHORT exit — symmetric halt to BUY exit at :641-651.
            pnlDollars: (() => {
              if (!(shortTrade.entryPrice > 0)) {
                throw new Error(`[MED-02] SHORT exit: shortTrade.entryPrice non-positive (got ${shortTrade.entryPrice}) — refusing to log phantom \$0 P&L`);
              }
              return coverExitSizeUsd * ((shortTrade.entryPrice - price) / shortTrade.entryPrice);
            })(),
            holdDuration: holdDuration,
            exitReason: this._firstNonEmptyString(decision.exitReason)
          };
          const shortResultPnlDollars = this._firstFiniteNumber(completeTradeResult.pnlDollars);
          const shortResultPnlPercent = this._firstFiniteNumber(completeTradeResult.pnl);
          const shortResultHoldDuration = this._firstFiniteNumber(completeTradeResult.holdDuration);
          const shortResultExitReason = this._firstNonEmptyString(completeTradeResult.exitReason);
          const shortResultStrategy = this._firstNonEmptyString(shortTrade.entryStrategy, shortTrade.strategy);

          // Record trade
          if (this.ctx.backtestRecorder) {
            this.ctx.backtestRecorder.recordTrade({
              tradeId: shortTrade.orderId || shortTrade.id || decision.tradeId || null,
              positionEffect,
              entryTime: shortTrade.entryTime ? new Date(shortTrade.entryTime).toISOString() : '',
              exitTime: exitTimestamp ? new Date(exitTimestamp).toISOString() : '',
              direction: 'short',
              entryPrice: shortTrade.entryPrice,
              exitPrice: price,
              stopLoss: this._firstFiniteNumber(shortTrade.exitContract?.stopLossPercent),
              takeProfit: this._firstFiniteNumber(shortTrade.exitContract?.takeProfitPercent),
              size: coverExitSizeUsd,
              entryOrderQuantity: shortTrade.entryOrderQuantity,
              entryOrderQuantityUnit: shortTrade.entryOrderQuantityUnit,
              remainingOrderQuantityBeforeExit: shortTrade.remainingOrderQuantity,
              remainingOrderQuantityUnit: shortTrade.remainingOrderQuantityUnit,
              exitOrderQuantity: coverExitOrderQuantity,
              exitOrderQuantityUnit: coverExitQuantityUnit,
              closedOrderQuantity: coverExitOrderQuantity,
              quantityUnit: coverExitQuantityUnit,
              entryFeeQuantity: shortEntryFeeQuantity,
              exitFeeQuantity: shortExitFeeQuantity,
              // MED-03: SHORT exit symmetric warn — same state-persistence
              // concern as BUY exit at :669-675.
              ...(shortTrade.entryStrategy ? {} : (() => { throw new Error(`[MED-03] SHORT exit: trade record missing entryStrategy (orderId=${shortTrade.orderId}) — state corruption between open and close`); })()),
              strategyName: shortTrade.entryStrategy,
              confidence: this._firstFiniteNumber(shortTrade.confidence),
              signalBreakdown: shortTrade.signalBreakdown ?? null,
              mtfConfluenceSnapshot: shortTrade.frozenExitPolicy?.mtfConfluenceSnapshot ?? null,
              riskGates: Array.isArray(shortTrade.riskGates) ? shortTrade.riskGates : null,
              maxFavorableExcursionPercent: this._firstFiniteNumber(
                shortTrade.maxFavorableExcursionPercent,
                shortTrade.maxProfitPercent
              ),
              maxAdverseExcursionPercent: this._firstFiniteNumber(shortTrade.maxAdverseExcursionPercent),
              isPartialClose: false,
              partialFraction: null,
              exitReason: completeTradeResult.exitReason,
              reason: this._firstNonEmptyString(shortTrade.reason),
              holdTimeMinutes: holdDuration / 60000,
              exitContract: shortTrade.exitContract,
              frozenExitPolicy: shortTrade.frozenExitPolicy ?? null,
              // CC-A Change 2: passthrough indicator state stamped on trade at entry
              atrAtEntry: shortTrade.atrAtEntry ?? null,
              regimeAtEntry: shortTrade.regimeAtEntry ?? null,
              rsiAtEntry: shortTrade.rsiAtEntry ?? null,
              // CC-C Commit 5: drop the historical bandaid chain — see the
              // matching note on the SELL path. shortTrade.symbol is the
              // single source of truth (stamped at openPosition time).
              symbol: shortTrade.symbol,
              brokerId: shortTrade.brokerId,
              accountId: shortTrade.accountId,
              accountIdSource: shortTrade.accountIdSource,
              assetClass: shortTrade.assetClass,
              executionMode: shortTrade.executionMode,
              timeframe: shortTrade.timeframe,
              scopeKey: shortTrade.scopeKey,
              scopeKeyVersion: shortTrade.scopeKeyVersion,
              traceId,
              signalId,
              decisionId
            });
            const loggedStrategy = this._firstNonEmptyString(shortTrade.entryStrategy, shortTrade.strategy) ?? 'missing';
            const loggedExitReason = this._firstNonEmptyString(completeTradeResult.exitReason) ?? 'missing';
            console.log(`[TRADE-LOG] SHORT Strategy: ${loggedStrategy} | Exit: ${loggedExitReason}`);
          }

          console.log(`SHORT closed: ${pnl >= 0 ? 'PASS' : 'FAIL'} ${pnl.toFixed(2)}% | Hold: ${(holdDuration/60000).toFixed(1)}min`);

          const shortSize = coverExitSizeUsd;
          const coverFillFee = this._calculateOrderFee({
            notionalUsd: coverExitOrderQuantity * price,
            orderQuantity: coverExitOrderQuantity,
            side: 'exit',
          });
          const coverConfirmedAtMs = Date.now();
          const closeResult = await stateManager.applyFill(this._buildExecutionFill({
            exitPlan,
            executedExitPlan,
            tradeResult,
            fillPrice: price,
            fee: coverFillFee,
            exitIntent,
            confirmedAtMs: coverConfirmedAtMs,
            eventTimeMs: exitTimestamp,
            simulated: this.ctx.backtestMode === true || this.ctx.paperTrading === true || isWebhookExecutionRoute,
          }));

          if (!closeResult.success) {
            console.error('StateManager.applyFill (COVER) failed:', closeResult.error);
            if (exitIntent) {
              await this._releaseExitIntentWithTrace({
                exitPlan,
                pendingExitIntent: exitIntent,
                reason: 'apply_fill_failed',
                traceId,
                signalId,
                decisionId,
                symbol,
                action: decision.action,
                positionEffect,
              });
            }
            emitTrace(this.ctx, 'STATE_MUTATION', {
              traceId,
              signalId,
              symbol,
              action: decision.action,
              positionEffect,
              success: false,
              operation: 'applyFill',
              orderId: shortTrade.orderId,
              intentId: exitIntent?.intentId || null,
              error: closeResult.error,
            });
            return blockedReturn('state_close_failed', {
              operation: 'applyFill',
              orderId: shortTrade.orderId,
              intentId: exitIntent?.intentId || null,
              orderAccepted: true,
              stateMutationSucceeded: false,
              error: closeResult.error,
            });
          }

          const afterCoverState = stateManager.getState();
          emitTrace(this.ctx, 'STATE_MUTATION', {
            traceId,
            signalId,
            symbol,
            action: decision.action,
            positionEffect,
            success: true,
            operation: 'applyFill',
            orderId: shortTrade.orderId,
            intentId: exitIntent?.intentId || null,
            fillId: closeResult.fillId || null,
            price,
            pnlDollars: completeTradeResult.pnlDollars ?? closeResult.pnl ?? null,
            exitReason: completeTradeResult.exitReason ?? null,
            closed: Number.isFinite(Number(closeResult.remainingOrderQuantity))
              ? Number(closeResult.remainingOrderQuantity) <= 0
              : null,
            filledQuantity: closeResult.filledQuantity ?? null,
            remainingOrderQuantity: closeResult.remainingOrderQuantity ?? null,
            position: afterCoverState.position,
            balance: afterCoverState.balance,
          });
          const profitLoss = completeTradeResult.pnlDollars;
          console.log(`CP8-COVER: COVER COMPLETE - New Balance: $${afterCoverState.balance} (P&L: $${profitLoss.toFixed(2)})`);

          // Notifications
          if (!this.ctx.backtestFast) {
            this.ctx.notifyTradeClose({
              pnl: profitLoss,
              entryPrice: shortTrade.entryPrice,
              exitPrice: price,
              duration: `${Math.round((Date.now() - shortTrade.entryTime) / 60000)}m`,
              direction: 'short'
            }).catch(err => console.warn(`Telegram notify failed: ${err.message}`));

            this.ctx.discordNotifier.notifyTrade('cover', price, shortSize, profitLoss);

          }

          // Dashboard broadcast for COVER
          {
            const sentDashboardTrade = this._broadcastDashboardTrade({
              action: 'COVER',
              direction: 'short',
              positionEffect,
              symbol,
              price: price,
              pnl: completeTradeResult.pnlDollars,
              timestamp: Date.now(),
              duration: `${(holdDuration / 60000).toFixed(1)}m`,
              confidence: decision.confidence
            }, completeTradeResult);
            if (sentDashboardTrade) {
              console.log(`Broadcast COVER trade to dashboard at $${price.toFixed(2)} (P&L: $${completeTradeResult.pnlDollars.toFixed(2)})`);
            }
          }

          try {
            this.ctx.logTrade({
              type: 'COVER',
              action: 'COVER',
              positionEffect,
              orderId: shortTrade.orderId,
              tradeId: shortTrade.orderId,
              direction: 'short',
              symbol,
              strategyName: shortTrade.entryStrategy,
              entryPrice: shortTrade.entryPrice || shortTrade.price,
              exitPrice: price,
              currentPrice: price,
              size: shortSize,
              pnl: completeTradeResult.pnlDollars,
              pnlPercent: pnl,
              fees: this._calculateRoundTripFees({
                entryNotionalUsd: shortSize,
                exitNotionalUsd: shortSize,
                entryQuantity: shortEntryFeeQuantity,
                exitQuantity: shortExitFeeQuantity,
              }),
              entryTime: new Date(shortTrade.entryTime).toISOString(),
              exitTime: new Date().toISOString(),
              holdTime: holdDuration,
              balanceBefore: shortResultPnlDollars === null ? null : stateManager.get('balance') - shortResultPnlDollars,
              balanceAfter: stateManager.get('balance'),
              confidence: this._firstFiniteNumber(shortTrade.confidence),
              entryReason: this._firstNonEmptyString(shortTrade.reasoning, shortTrade.reason),
              exitReason: completeTradeResult.exitReason,
              reason: completeTradeResult.exitReason,
              exitIndicators: {
                rsi: indicators.rsi,
                macd: indicators.macd?.macd ?? null,
                macdSignal: indicators.macd?.signal ?? null,
                trend: indicators.trend,
                volatility: indicators.volatility ?? null
              },
              patternType: shortTrade.patterns?.[0]?.name || null,
              patternConfidence: shortTrade.patterns?.[0]?.confidence ?? null,
              positionSize: shortSize,
              riskPercent: (() => {
                const balance = Number(stateManager.get('balance'));
                return Number.isFinite(balance) && balance > 0
                  ? (Math.abs(completeTradeResult.pnlDollars) / balance) * 100
                  : null;
              })(),
              totalTrades: stateManager.get('tradeCount') ?? null,
              winRate: this.ctx.performanceAnalyzer?.getWinRate?.() ?? null
            });
          } catch (logErr) {
            console.warn(`TradeLogger error: ${logErr.message}`);
          }

          // Proof logger for COVER
          // CC-SPEC-EVAL-CAPTURE (2/3): forensic identity for entry/exit pairing.
          // NOTE: COVER always full-closes in current code (TradingLoop emits exitFraction
          // for COVER but OrderExecutor's COVER branch ignores it — separate trading-pipeline
          // bug). isPartialClose:false reflects actual behavior; revisit when that bug is fixed.
          TradingProofLogger.trade({
            action: 'COVER',
            positionEffect,
            symbol,
            price: price,
            size: shortSize,
            // FIX VALUE-USD-DOUBLE-MULT 2026-05-13: shortSize is already USD.
            value_usd: shortSize,
            fees: this._calculateOrderFee({
              notionalUsd: shortSize,
              orderQuantity: shortExitFeeQuantity,
              side: 'exit',
            }),
            reason: completeTradeResult.exitReason,
            confidence: decision.confidence,
            traceId,
            signalId,
            decisionId,
            indicators: { rsi: indicators.rsi, macd: indicators.macd?.macd ?? null },
            pattern: shortTrade.patterns?.[0]?.name || null,
            tradeId: shortTrade.orderId,
            orderId: shortTrade.orderId,
            entryPrice: shortTrade.entryPrice,
            pnl: completeTradeResult.pnlDollars,
            pnlPercent: pnl,
            isPartialClose: false,
            partialFraction: null,
            exitReason: completeTradeResult.exitReason
          });

          // Risk manager update
          this._recordClosedTradePatternOutcome(shortTrade, completeTradeResult, pnl, holdDuration);
          this._checkPatternOutcomeHealth();

          if (this.ctx.riskManager && shortResultPnlDollars !== null) {
	            this.ctx.riskManager.recordTradeResult({
	              success: pnl >= 0,
	              pnl: shortResultPnlDollars,
	              pnlPercent: this._firstFiniteNumber(completeTradeResult.pnl),
	              symbol,
	              strategy: shortResultStrategy,
	              venue: shortTrade.executionVenue || shortTrade.venue || shortTrade.brokerId || null,
	              timestamp: new Date().toISOString()
	            });
          } else if (this.ctx.riskManager) {
            console.warn('[RISK] Skipped short trade result update: missing finite P&L dollars');
          }

          // FIX 2026-03-29: Wire SMS daily loss tracking for shorts
          if (this.ctx.strategyOrchestrator && shortResultStrategy && shortResultPnlDollars !== null) {
            this.ctx.strategyOrchestrator.recordTradeResult(
              shortResultStrategy,
              shortResultPnlDollars,
              symbol
            );
          } else if (this.ctx.strategyOrchestrator) {
            console.warn('[STRATEGY] Skipped short trade result update: missing strategy or finite P&L dollars');
          }

          // FIX 2026-04-05: Wire PID Controller for short exits
          try {
            if (
              shortResultStrategy &&
              shortResultPnlDollars !== null &&
              shortResultPnlPercent !== null &&
              shortResultExitReason &&
              shortResultHoldDuration !== null
            ) {
              const pidController = getPIDController();
              pidController.onTradeClose({
                strategyName: shortResultStrategy,
                netPnlDollars: shortResultPnlDollars,
                netPnlPercent: shortResultPnlPercent,
                exitReason: shortResultExitReason,
                maxProfitPercent: this._firstFiniteNumber(shortTrade.maxProfitPercent),
                maxFavorableExcursion: this._firstFiniteNumber(shortTrade.maxFavorableExcursion),
                holdDuration: shortResultHoldDuration,
              });
            } else {
              console.warn('[PID] Skipped short onTradeClose: missing strategy, P&L, exit reason, or hold duration');
            }
          } catch (err) {
            console.warn(`[PID] onTradeClose (short) failed: ${err.message}`);
          }

          // TRAI learning — mirror SELL path for short trade outcomes
          if (this.ctx.trai && this.pendingTraiDecisions?.has(shortTrade.orderId)) {
            const traiDecisionData = this.pendingTraiDecisions.get(shortTrade.orderId);
            const traiLearningIndicators = this._buildTraiLearningIndicators(shortTrade);
            const traiLearningTrend = shortTrade.entryIndicators?.trend ?? shortTrade.indicators?.trend ?? null;
            const traiLearningVolatility = this._firstFiniteNumber(
              shortTrade.entryIndicators?.volatility,
              shortTrade.indicators?.volatility
            );
            const traiEntryFeatures = this._entryPatternFeaturesForTrai(shortTrade);
            const traiRecorded = this.ctx.trai.recordTradeOutcome({
              tradeId: shortTrade.orderId,
              decisionId: traiDecisionData.decisionId,
              symbol,
              brokerId: shortTrade.brokerId,
              accountId: shortTrade.accountId,
              accountIdSource: shortTrade.accountIdSource,
              assetClass: shortTrade.assetClass,
              executionMode: shortTrade.executionMode,
              timeframe: shortTrade.timeframe,
              scopeKey: shortTrade.scopeKey,
              strategy: shortTrade.entryStrategy,
              exitReason: completeTradeResult.exitReason,
              profitLoss: profitLoss,
              profitLossPercent: pnl,
              holdDuration: holdDuration,
              features: traiEntryFeatures,
              entry: {
                price: shortTrade.entryPrice || shortTrade.price,
                timestamp: shortTrade.entryTime,
                features: traiEntryFeatures,
                indicators: traiLearningIndicators,
                trend: traiLearningTrend,
                volatility: traiLearningVolatility
              },
              exit: {
                price: price,
                timestamp: Date.now(),
                indicators: {
                  rsi: indicators.rsi,
                  macd: indicators.macd?.macd ?? null,
                  macdHistogram: indicators.macd?.histogram ?? null
                },
                trend: indicators.trend ?? null,
                reason: completeTradeResult.exitReason
              },
              indicators: traiLearningIndicators,
              trend: traiLearningTrend,
              volatility: traiLearningVolatility,
              traiConfidence: traiDecisionData.traiConfidence,
              originalConfidence: traiDecisionData.originalConfidence
            });
            this.pendingTraiDecisions.delete(shortTrade.orderId);
            if (traiRecorded) {
              console.log(`[TRAI] Learning from SHORT ${pnl >= 0 ? 'WIN' : 'LOSS'}: ${pnl.toFixed(2)}% ($${profitLoss.toFixed(2)})`);
            } else {
              console.warn(`[TRAI] Learning skipped for SHORT ${shortTrade.orderId}: pattern outcome was not recorded`);
            }
          }

          // Pattern exit model
          if (this.ctx.patternExitModel && typeof this.ctx.patternExitModel.stopTracking === 'function') {
            this.ctx.patternExitModel.stopTracking({
              pnl: pnl,
              exitReason: 'cover'
            });
          }
        }

        // Record in performance analyzer
        const performanceData = {
          type: decision.action,
          positionEffect,
          price,
          size: tradeResult.amount ?? positionSize,
          confidence: decision.confidence,
          timestamp: Date.now(),
          result: tradeResult
        };

        this.ctx.performanceAnalyzer.processTrade(performanceData);

        // CHANGE 650: REMOVED DUPLICATE TRAI STORAGE - Already properly stored at line 853-861
        // This was overwriting the complete data with incomplete data

        console.log(`${decision.action} executed: ${tradeResult.orderId || 'SIMULATED'} | Size: $${(tradeResult.amount ?? positionSize).toFixed(2)}\n`);
        return executionReturn(true, {
          orderId: tradeResult.orderId,
          brokerOrderId: tradeResult.brokerOrderId === undefined ? tradeResult.orderId : tradeResult.brokerOrderId,
          webhookOrderIdMissing: tradeResult.webhookOrderIdMissing === true,
          webhookAcceptedWithoutOrderId: tradeResult.webhookAcceptedWithoutOrderId === true,
	          brokerFillConfirmed: tradeResult.brokerFillConfirmed === true,
	          brokerFillStatus: tradeResult.brokerFillStatus || null,
	          brokerFlatVerified: tradeResult.brokerFlatVerified === true,
	          orderAccepted: true,
	          stateMutationSucceeded: true,
          price: tradeResult.price ?? price,
	          amount: tradeResult.amount ?? positionSize,
	          orderQuantity: tradeResult.orderQuantity ?? null,
	          quantityUnit: tradeResult.quantityUnit || null,
	          stockShareRangeFillViolation: tradeResult.stockShareRangeFillViolation || null,
	        });
      } else {
        const blockReason = tradeResult?.reason || 'trade_result_not_successful_without_reason';
        if (exitIntent && tradeResult?.brokerFlatReconciled !== true) {
          const released = await stateManager.releaseExitSlot(exitPlan.tradeId, exitIntent.intentId, {
            reason: blockReason,
          });
          if (!released || released.success !== true || released.released !== true) {
            const releaseReason = released?.reason || released?.error || 'release_failed';
            console.error(`[EXECUTION-FILL] Failed to release exit intent ${exitIntent.intentId} after unaccepted ${decision.action}: ${releaseReason}`);
            emitTrace(this.ctx, 'STATE_MUTATION', {
              traceId,
              signalId,
              symbol,
              action: decision.action,
              positionEffect,
              success: false,
              operation: 'releaseExitSlot',
              orderId: exitPlan.tradeId,
              intentId: exitIntent.intentId,
              error: releaseReason,
            });
            return blockedReturn('exit_intent_release_failed', {
              detail: releaseReason,
              tradeId: exitPlan.tradeId,
              intentId: exitIntent.intentId,
              orderAccepted: false,
              stateMutationSucceeded: false,
            });
          }
        }
        console.log(`Trade blocked: ${blockReason}\n`);
        emitTrace(this.ctx, 'ORDER_BLOCKED', {
          traceId,
          signalId,
          symbol,
          action: decision.action,
          positionEffect,
          reason: blockReason,
        });
        return blockedReturn(blockReason, {
          orderId: tradeResult?.orderId || null,
          orderAccepted: false,
          stateMutationSucceeded: tradeResult?.stateMutationSucceeded ?? false,
          brokerFlatReconciled: tradeResult?.brokerFlatReconciled === true,
        });
      }

    } catch (error) {
      if (exitIntent) {
        await this._releaseExitIntentWithTrace({
          exitPlan,
          pendingExitIntent: exitIntent,
          reason: 'order_exception',
          traceId,
          signalId,
          decisionId: decision?.decisionId || null,
          symbol,
          action: decision?.action || null,
        });
      }
      // FIX TIER-2-EXECUTE-CATCH: audit-prefixed throws are intentional halts on bad state.
      // Without this differentiation, the wrapper
      // turns every "fail-loud" spec into fail-silent behavior. Re-throw audit prefixes
      // so they reach run-empire-v2's promise-rejection handler (operator-visible).
      const isAuditThrow = error.message && /^\[[A-Z][A-Z-]*\]/.test(error.message);
      if (isAuditThrow) {
        console.error(`[FAIL-LOUD] ${error.message}`);
        emitTrace(this.ctx, 'ORDER_EXCEPTION', {
          traceId,
          signalId,
          symbol,
          action: decision?.action || null,
          positionEffect,
          message: error.message,
          failLoud: true,
        });
        throw error;
      }

      console.error(`Trade execution failed at checkpoint between CP3 and CP4`);
      console.error(`   Error message: ${error.message}`);
      console.error(`   Stack trace:`, error.stack);
      console.error(`   Decision: ${decision?.action}, Confidence: ${decision?.confidence}`);
      console.error(`   Position size: ${positionSize}`);
      emitTrace(this.ctx, 'ORDER_EXCEPTION', {
        traceId,
        signalId,
        symbol,
        action: decision?.action || null,
        positionEffect,
        message: error.message,
      });
      return blockedReturn('order_exception', { message: error.message, orderAccepted: false });

      // Phase 4 REWRITE: tradingBrain.errorHandler deleted - error logging above is sufficient
    }
  }
}

module.exports = OrderExecutor;
