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
const TradingConfig = require('./TradingConfig');
const exitContractManager = require('./ExitContractManager');
const MaxProfitManager = require('./MaxProfitManager');
// Phase 4 REWRITE: FeatureFlagManager removed - AGGRESSIVE_LEARNING_MODE deleted
const { TradingProofLogger } = require('../ogz-meta/claudito-logger');
const { getInstance: getUnifiedPatternMemory } = require('./UnifiedPatternMemory');  // CHANGE 2026-03-18: Unified pattern store
const { getPIDController } = require('./PIDController');  // FIX 2026-04-05: Adaptive parameter optimization
const { createTraceId, emitTrace } = require('./TraceSpine');

const stateManager = getStateManager();
const SUPPORTED_ACTIONS = new Set(['BUY', 'SELL_SHORT', 'SELL', 'COVER']);

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

  _orderQuantityUnit() {
    const assetClass = String(this.ctx.config?.assetClass || '').trim().toLowerCase();
    if (['stocks', 'stock', 'equities', 'equity', 'etfs', 'etf'].includes(assetClass)) {
      return 'shares';
    }
    if (['crypto', 'cryptos', 'cryptocurrency', 'forex', 'fx', 'futures', 'future'].includes(assetClass)) {
      return 'base';
    }
    throw new Error(`[ORDER-PLAN] unsupported assetClass ${JSON.stringify(this.ctx.config?.assetClass)} for broker quantity planning`);
  }

  _orderQuantityFromSizeUsd(sizeUsd, price) {
    if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) {
      throw new Error(`[ORDER-PLAN] invalid sizeUsd ${sizeUsd}`);
    }
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`[ORDER-PLAN] invalid price ${price}`);
    }

    const rawQuantity = sizeUsd / price;
    return this._orderQuantityUnit() === 'shares'
      ? Math.floor(rawQuantity)
      : rawQuantity;
  }

  _acceptedOrderQuantity(orderResult, plannedQuantity) {
    const brokerQuantity = Number(orderResult?.amount ?? orderResult?.qty ?? orderResult?.quantity);
    if (Number.isFinite(brokerQuantity) && brokerQuantity > 0) {
      return brokerQuantity;
    }
    return plannedQuantity;
  }

  _tradeRemainingOrderQuantity(trade) {
    const quantity = Number(trade?.remainingOrderQuantity);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
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

  _dashboardTradePayload(payload, trade = {}) {
    const brokerId = trade.brokerId || this.ctx.config?.brokerId || null;
    const accountId = trade.accountId || this.ctx.config?.accountId || 'default';
    const accountIdSource = trade.accountIdSource
      || (accountId && accountId !== 'default' ? 'config' : 'default');
    const assetClass = trade.assetClass || this.ctx.config?.assetClass || null;
    const executionMode = trade.executionMode
      || (this.ctx.config?.enableBacktestMode ? 'backtest' : this.ctx.config?.executionMode)
      || null;
    const timeframe = trade.timeframe || this.ctx.config?.timeframe || null;
    const scopeKey = trade.scopeKey || null;
    const scopeKeyVersion = typeof scopeKey === 'string' && scopeKey.split(':').length >= 6 ? 2 : 1;
    const symbol = trade.symbol || payload.symbol || null;
    const hasExplicitAccountId = Boolean(accountId && accountId !== 'default' && accountIdSource !== 'default');
    const orderId = trade.orderId || trade.id || payload.orderId || payload.tradeId || null;

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
      sizeUsd: trade.sizeUsd ?? trade.size ?? payload.sizeUsd ?? null,
      entryPrice: trade.entryPrice ?? payload.entryPrice ?? null
    };
  }

  _buildEntryPlan({ decision, symbol, price, positionSize, currentBalance, currentEquity, tradeConfidence, confidenceMultiplier, orchResult }) {
    if (!this._isEntryAction(decision.action)) return null;

    const entryStrategy = orchResult.winnerStrategy;
    const sizingMultiplier = orchResult?.sizingMultiplier ?? 1.0;
    const exitContract = orchResult.exitContract;
    const sizeUsd = positionSize * sizingMultiplier;
    const orderQuantity = this._orderQuantityFromSizeUsd(sizeUsd, price);
    const quantityUnit = this._orderQuantityUnit();

    return {
      traceId: decision.traceId || null,
      signalId: decision.signalId || decision.decisionId || null,
      decisionId: decision.decisionId || null,
      action: decision.action,
      side: this._entrySide(decision.action),
      direction: decision.action === 'BUY' ? 'long' : 'short',
      symbol,
      assetClass: this.ctx.config?.assetClass || null,
      brokerId: this.ctx.config?.brokerId || null,
      executionMode: this.ctx.config?.enableBacktestMode ? 'backtest' : this.ctx.config?.executionMode,
      timeframe: this.ctx.config?.timeframe || null,
      price,
      accountBalance: currentBalance,
      currentEquity,
      baseSizeUsd: positionSize,
      sizeUsd,
      confidence: decision.confidence,
      tradeConfidence,
      confidenceMultiplier,
      sizingMultiplier,
      orderQuantity,
      quantityUnit,
      entryStrategy,
      exitContract
    };
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
    }
    return trades[0];
  }

  _buildExitPlan({ decision, symbol, price }) {
    if (!this._isExitAction(decision.action)) return null;

    const trade = this._findExitTrade(decision, symbol);
    if (!trade) return null;

    const fullSizeUsd = Math.abs(trade.sizeUsd || trade.size || 0);
    const exitFraction = typeof decision.exitFraction === 'number' && decision.exitFraction > 0 && decision.exitFraction < 1
      ? decision.exitFraction
      : 1;
    const quantityUnit = this._orderQuantityUnit();
    const remainingOrderQuantity = this._tradeRemainingOrderQuantity(trade);
    if (remainingOrderQuantity === null) {
      throw new Error(`[ORDER-PLAN] active trade ${trade.orderId || trade.id || 'unknown'} missing remainingOrderQuantity; refusing to recalc live exit quantity from current price`);
    }
    const remainingOrderQuantityUnit = trade.remainingOrderQuantityUnit || trade.entryOrderQuantityUnit || quantityUnit;
    if (remainingOrderQuantityUnit !== quantityUnit) {
      throw new Error(`[ORDER-PLAN] active trade ${trade.orderId || trade.id || 'unknown'} quantity unit mismatch: stored=${remainingOrderQuantityUnit} planned=${quantityUnit}`);
    }
    const rawOrderQuantity = remainingOrderQuantity * exitFraction;
    const orderQuantity = quantityUnit === 'shares'
      ? Math.floor(rawOrderQuantity)
      : rawOrderQuantity;
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
      symbol,
      assetClass: this.ctx.config?.assetClass || null,
      brokerId: this.ctx.config?.brokerId || null,
      executionMode: this.ctx.config?.enableBacktestMode ? 'backtest' : this.ctx.config?.executionMode,
      timeframe: this.ctx.config?.timeframe || null,
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

  _emitWebhookOrder(action, signal, traceFields = {}) {
    const baseFields = {
      traceId: traceFields.traceId || null,
      signalId: traceFields.signalId || null,
      decisionId: traceFields.decisionId || null,
      symbol: signal?.symbol || traceFields.symbol || null,
      action,
      webhookAction: signal?.action || null,
      quantity: signal?.quantity ?? null,
      orderType: signal?.orderType || null,
      bypassThrottle: signal?.bypassThrottle === true,
    };

    emitTrace(this.ctx, 'WEBHOOK_ORDER_DISPATCH', baseFields);

    let emitPromise;
    try {
      emitPromise = this.ctx.webhookAdapter.emit(signal);
    } catch (err) {
      const message = err?.message || String(err);
      console.warn(`[WebhookOrder] ${action} emit failed: ${message}`);
      emitTrace(this.ctx, 'WEBHOOK_ORDER_RESULT', {
        ...baseFields,
        success: false,
        sent: false,
        reason: message,
        thrown: true,
      });
      return Promise.resolve();
    }

    return Promise.resolve(emitPromise)
      .then(result => {
        const response = result?.response || null;
        emitTrace(this.ctx, 'WEBHOOK_ORDER_RESULT', {
          ...baseFields,
          success: result?.sent === true,
          sent: result?.sent === true,
          reason: result?.reason || null,
          httpStatus: response?.status ?? null,
          responseBody: typeof response?.body === 'string' ? response.body.slice(0, 500) : null,
          dryRun: result?.reason === 'dry_run',
        });
      })
      .catch(err => {
        const message = err?.message || String(err);
        console.warn(`[WebhookOrder] ${action} emit failed: ${message}`);
        emitTrace(this.ctx, 'WEBHOOK_ORDER_RESULT', {
          ...baseFields,
          success: false,
          sent: false,
          reason: message,
          rejected: true,
        });
      });
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
    decision.traceId = decision.traceId || createTraceId('trace');
    decision.signalId = decision.signalId || `${decision.traceId}:signal`;
    decision.decisionId = decision.decisionId || `dec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const traceId = decision.traceId;
    const signalId = decision.signalId;
    emitTrace(this.ctx, 'ORDER_EXECUTE_START', {
      traceId,
      signalId,
      decisionId: decision.decisionId,
      symbol,
      action: decision.action,
      price,
      confidencePct: decision.confidence,
      brokerId: this.ctx.config?.brokerId || null,
      assetClass: this.ctx.config?.assetClass || null,
      executionMode: this.ctx.config?.enableBacktestMode ? 'backtest' : this.ctx.config?.executionMode,
    });
    if (this._isEntryAction(decision.action)) {
      const missingScope = [];
      const hasText = (value) => value !== null && value !== undefined && String(value).trim() !== '';
      if (!hasText(this.ctx.config?.brokerId)) missingScope.push('brokerId');
      if (!hasText(this.ctx.config?.assetClass)) missingScope.push('assetClass');
      if (!hasText(this.ctx.config?.timeframe)) missingScope.push('timeframe');
      const executionMode = this.ctx.config?.enableBacktestMode ? 'backtest' : this.ctx.config?.executionMode;
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
        emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, reason: 'trading_paused', detail: pauseReason });
        return null;
      }
      const globalHaltReason = stateManager.isHalted() ? stateManager.getHaltReason() : null;
      const symbolHaltReason = stateManager.isSymbolHalted(symbol) ? stateManager.getSymbolHaltReason(symbol) : null;
      if (globalHaltReason || symbolHaltReason) {
        console.error(`[ENTRY] Refusing ${decision.action} for ${symbol}: ${globalHaltReason || symbolHaltReason}`);
        emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, reason: 'halted', detail: globalHaltReason || symbolHaltReason });
        return null;
      }
    }
    // Log trade execution
    console.log("*** EXECUTE_TRADE_REACHED ***");
    console.log(`\n${decision.action} SIGNAL @ $${price.toFixed(2)} | Confidence: ${decision.confidence.toFixed(1)}%`);

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
    if (currentBalance <= 0) {
      console.error('[HALT] No available capital — refusing entry');
      emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, reason: 'no_available_capital', availableCapital: currentBalance });
      return null;
    }
    // CHANGE 2026-02-28: Use TradingConfig for position sizing
    // NOTE: DynamicPositionSizer.js exists in core/ but is NOT WIRED - needs tuning first
    let basePositionPercent = TradingConfig.get('positionSizing.maxPositionSize');

    // TUNE 2026-02-27: Confidence-scaled position sizing
    // 50% confidence = 0.5x, 75% = 1.5x, 90%+ = 2.5x (cap)
    const rawConfidence = decision.confidence;
    // CRIT-02: Phantom 50% confidence. Previously trailing `|| 0.5` upgraded
    // 0/null/undefined/NaN to 50% conviction, so zero-conviction signals
    // fired with 50% confidence and got phantom multipliers. Spec asks for
    // `=== 0 || == null` reject; extended to `!isFinite || <= 0` to also
    // catch NaN, undefined, and negative values (root-cause coverage).
    if (!Number.isFinite(rawConfidence) || rawConfidence <= 0) {
      console.error(`[HALT] Invalid confidence: ${rawConfidence} — skipping trade`);
      emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, reason: 'invalid_confidence', confidencePct: rawConfidence });
      return null;
    }
    // decision.confidence comes as percentage (e.g., 75 = 75%), convert to decimal
    const tradeConfidence = rawConfidence > 1 ? rawConfidence / 100 : rawConfidence;
    // Linear scale: confidence 0.5 → multiplier 0.5, confidence 1.0 → multiplier 2.5
    const confidenceMultiplier = Math.max(0.5, Math.min(2.5,
      0.5 + (tradeConfidence - 0.5) * 4.0
    ));
    basePositionPercent = basePositionPercent * confidenceMultiplier;

    // FIX 2026-03-06: ENFORCE MAX_POSITION_SIZE cap after confidence multiplier
    const maxPositionPercent = TradingConfig.get('positionSizing.maxPositionSize') * 2.5;
    if (basePositionPercent > maxPositionPercent) {
      console.log(`⚠️ Position capped: ${(basePositionPercent * 100).toFixed(2)}% → ${(maxPositionPercent * 100).toFixed(2)}% (MAX_POSITION_SIZE limit)`);
      basePositionPercent = maxPositionPercent;
    }
    // FIX TIER-4-ABSOLUTE-CAP: enforce absoluteCapPercent. Cap existed in
    // TradingConfig.js:497 but had no consumer — peak single-trade was
    // theoretically 31.25% (5% × 2.5 conf × 2.5 confluence) with no actual ceiling.
    const absoluteCap = TradingConfig.get('positionSizing.absoluteCapPercent');
    if (Number.isFinite(absoluteCap) && absoluteCap > 0 && basePositionPercent > absoluteCap) {
      console.log(`⚠️ Position absolute-capped: ${(basePositionPercent * 100).toFixed(2)}% → ${(absoluteCap * 100).toFixed(2)}% (ABSOLUTE_POSITION_CAP)`);
      basePositionPercent = absoluteCap;
    }
    console.log(`📏 Confidence sizing: ${(tradeConfidence * 100).toFixed(0)}% → ${confidenceMultiplier.toFixed(1)}x → ${(basePositionPercent * 100).toFixed(2)}% of balance`);

    // Phase 4 REWRITE: AGGRESSIVE_LEARNING_MODE removed - use TradingConfig for all sizing
    const baseSizeUSD = currentBalance * basePositionPercent;

    // FIX 2026-03-28: Position size stays in USD (no BTC conversion for stocks)
    const positionSize = baseSizeUSD;

    console.log(`💰 Position sizing: Balance=$${currentBalance.toFixed(2)}, Percent=${(basePositionPercent*100).toFixed(1)}%, USD=$${positionSize.toFixed(2)}`);

    // CHECKPOINT 2: Position sizing
    console.log(`[CP2] Position size calculated: $${positionSize.toFixed(2)} USD`);

    if (decision.action === 'BUY') {
      if (!orchResult) {
        console.error('[HALT] orchResult absent on BUY — refusing entry (no winner strategy, no exit contract)');
        emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, reason: 'missing_orch_result' });
        return null;
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
        emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, reason: 'missing_orch_result' });
        return null;
      }
      if (!orchResult.winnerStrategy) {
        throw new Error('[HIGH-08] SHORT entry: orchResult.winnerStrategy missing — orchestrator regression');
      }
      if (!orchResult.exitContract) {
        throw new Error('[HIGH-08] SHORT entry: orchResult.exitContract missing — Fix 7 regression or orchestrator upstream bug');
      }
    }

    const entryPlan = this._buildEntryPlan({
      decision,
      symbol,
      price,
      positionSize,
      currentBalance,
      currentEquity,
      tradeConfidence,
      confidenceMultiplier,
      orchResult
    });
    if (entryPlan && entryPlan.orderQuantity <= 0 && !this.ctx.backtestMode && !this.ctx.paperTrading) {
      console.warn(`[ENTRY-PLAN] Refusing ${entryPlan.action} for ${symbol}: planned ${entryPlan.quantityUnit} quantity=${entryPlan.orderQuantity} from sizeUsd=$${entryPlan.sizeUsd.toFixed(2)} at price=$${price.toFixed(2)}`);
      emitTrace(this.ctx, 'ORDER_BLOCKED', {
        traceId,
        signalId,
        symbol,
        action: decision.action,
        reason: 'non_positive_order_quantity',
        quantityUnit: entryPlan.quantityUnit,
        orderQuantity: entryPlan.orderQuantity,
        sizeUsd: entryPlan.sizeUsd,
      });
      return null;
    }
    if (entryPlan) {
      emitTrace(this.ctx, 'ORDER_PLAN', {
        traceId,
        signalId,
        symbol,
        action: entryPlan.action,
        side: entryPlan.side,
        sizeUsd: entryPlan.sizeUsd,
        orderQuantity: entryPlan.orderQuantity,
        quantityUnit: entryPlan.quantityUnit,
        entryStrategy: entryPlan.entryStrategy,
      });
      const gateResult = await this._runPreOrderEntryGate(entryPlan);
      entryPlan.gateResult = gateResult;
      emitTrace(this.ctx, 'EVAL_RULE_CHECK', {
        traceId,
        signalId,
        symbol,
        action: entryPlan.action,
        allowed: gateResult?.allowed !== false,
        failedRules: Array.isArray(gateResult?.failedRules) ? gateResult.failedRules.map(rule => rule.ruleId || rule) : [],
        passedRules: gateResult?.passedRules || [],
        inputs: gateResult?.inputs || null,
      });
      if (gateResult && gateResult.allowed === false) {
        const failed = Array.isArray(gateResult.failedRules) && gateResult.failedRules.length > 0
          ? gateResult.failedRules.map(rule => rule.ruleId || rule).join(',')
          : (gateResult.reason || 'pre_order_entry_gate');
        console.warn(`[ENTRY-GATE] BLOCKED ${entryPlan.action} ${symbol} before broker/webhook/state side effects: ${failed}`);
        emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: entryPlan.action, reason: 'eval_rule_gate', failedRules: failed });
        return null;
      }
    }
    const isLiveBrokerRoute = !this.ctx.backtestMode && !this.ctx.paperTrading;
    const exitPlan = isLiveBrokerRoute ? this._buildExitPlan({ decision, symbol, price }) : null;
    if (isLiveBrokerRoute && this._isExitAction(decision.action) && !exitPlan) {
      const haltReason = decision.action === 'SELL'
        ? 'KILL-5: SELL with no matching BUY'
        : 'KILL-5: COVER with no matching SELL_SHORT';
      console.error(`[ORDER-PLAN] ${haltReason} for ${symbol} before broker route`);
      await stateManager.haltSymbol(symbol, haltReason);
      emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, reason: haltReason });
      return null;
    }
    const brokerOrderPlan = entryPlan || exitPlan;

    // Change 587: SafetyNet DISABLED - too restrictive
    // Was blocking legitimate trades with overly conservative limits
    // We already have sufficient risk management through:
    // - RiskManager pre-trade validation
    // - TRAI veto power for risky trades
    // - MIN_TRADE_CONFIDENCE threshold (35%)
    // - Position sizing limits (1% per trade)

    try {
      // CHECKPOINT 3: Before ExecutionLayer call
      console.log(`📍 CP3: Calling ExecutionLayer.executeTrade with USD=$${positionSize.toFixed(2)}`);

      // Phase 4 REWRITE: Circuit breaker removed (tradingBrain deleted in Phase 2)

      // decisionId generated before pre-order gates so every trace line shares the
      // same forensic join key.
      const decisionId = decision.decisionId;

      // Phase 4 REWRITE: executionLayer deleted - use orderRouter for live, simulate for backtest/paper
      let tradeResult;
      if (this.ctx.backtestMode || this.ctx.paperTrading) {
        // Backtest/Paper: Simulate trade execution with slippage
        if (this.ctx.paperTrading) console.log('📝 PAPER MODE: Simulating order (no real execution)');

        // FIX 2026-03-26 Bug 7: Apply slippage to simulated fills
        // BUY/COVER pay more, SELL/SELL_SHORT receive less
        // HIGH-06: throw on missing/non-finite slippage rather than fall back
        // to a hardcoded 0.05% (crypto-tuned, wrong for stocks). TradingConfig
        // already supplies 0.0005 as the env-default for FEE_SLIPPAGE so this
        // throw catches genuinely malformed config, not unset env.
        const slippagePercent = TradingConfig.get('fees.slippage');
        if (!Number.isFinite(slippagePercent) || slippagePercent < 0) {
          throw new Error(`[HIGH-06] TradingConfig.fees.slippage non-finite or negative (got ${slippagePercent})`);
        }
        const isBuyAction = decision.action === 'BUY' || decision.action === 'COVER';
        const fillPrice = isBuyAction
          ? price * (1 + slippagePercent)   // BUY/COVER: pay more
          : price * (1 - slippagePercent);  // SELL/SELL_SHORT: receive less

        tradeResult = {
          success: true,
          orderId: `SIM_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          price: fillPrice,
          amount: positionSize,
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
        try {
          emitTrace(this.ctx, 'BROKER_ORDER_REQUEST', {
            traceId,
            signalId,
            symbol,
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
          tradeResult = {
            success: true,
            orderId: orderResult.orderId || orderResult.id || `LIVE_${Date.now()}`,
            price: orderResult.price || price,
            amount: positionSize,
            orderQuantity: this._acceptedOrderQuantity(orderResult, brokerOrderPlan.orderQuantity),
            quantityUnit: brokerOrderPlan.quantityUnit,
            traceId,
            signalId
          };
          emitTrace(this.ctx, 'BROKER_ORDER_RESULT', {
            traceId,
            signalId,
            symbol,
            success: true,
            orderId: tradeResult.orderId,
            acceptedOrderQuantity: tradeResult.orderQuantity,
            quantityUnit: tradeResult.quantityUnit,
          });
        } catch (orderErr) {
          console.error(`❌ Order execution failed: ${orderErr.message}`);
          tradeResult = { success: false, reason: orderErr.message, traceId, signalId };
          emitTrace(this.ctx, 'BROKER_ORDER_RESULT', {
            traceId,
            signalId,
            symbol,
            success: false,
            reason: orderErr.message,
          });
        }
      }

      // CHECKPOINT 4: After order execution
      console.log(`📍 CP4: Order result:`, tradeResult ? `success=${tradeResult.success}` : 'NULL');

      if (tradeResult && tradeResult.success) {
        console.log(`📍 CP4.5: Trade SUCCESS confirmed, creating unified result`);
        // Change 588: Create unified tradeResult format
        const unifiedResult = {
          orderId: tradeResult.orderId || `SIM_${Date.now()}`,
          action: decision.action,
          traceId,
          signalId,
          decisionId,
          entryPrice: price,
          entryTime: this.ctx.marketData?.timestamp ?? Date.now(),
          size: positionSize,
          confidence: decision.confidence,
          // CHANGE 648: Store full pattern objects with signatures for learning
          // BUGFIX 2026-02-01: Include features array for pattern outcome recording!
          // Without features, recordPatternResult at trade close fails with "empty features array"
          patterns: patterns?.map(p => ({
            name: p.name || p.type,
            signature: p.signature || p.id || `${p.name || p.type}_${Date.now()}`,
            confidence: p.confidence || 0,
            features: p.features || []  // CRITICAL: Required for pattern learning!
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
        // Use _lastTraiDecision from async observer OR traiDecision param
        const traiDecisionToStore = traiDecision || this.ctx._lastTraiDecision;
        if (traiDecisionToStore && traiDecisionToStore.id && unifiedResult.orderId) {
          this.pendingTraiDecisions.set(unifiedResult.orderId, {
            decisionId: traiDecisionToStore.id,
            originalConfidence: traiDecisionToStore.originalConfidence,
            traiConfidence: traiDecisionToStore.traiConfidence,
            traiRecommendation: traiDecisionToStore.traiRecommendation,
            timestamp: Date.now()
          });
          this.ctx._lastTraiDecision = null;  // Clear after storing
          console.log(`[TRAI] Decision stored for learning (orderId: ${unifiedResult.orderId})`);
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
          const adjustedPositionSize = entryPlan.sizeUsd;

          // PERMANENT TRADE RECEIPT - shows actual dollars/percent on EVERY trade (live, paper, backtest)
          // FIX 2026-03-28: adjustedPositionSize is already USD, no multiplication needed
          const actualDollars = adjustedPositionSize;
          const actualPercent = currentBalance > 0 ? (actualDollars / currentBalance) * 100 : 0;
          console.log(`[TRADE-RECEIPT] $${actualDollars.toFixed(2)} / $${currentBalance.toFixed(2)} = ${actualPercent.toFixed(1)}% of account | Conf: ${(tradeConfidence * 100).toFixed(0)}% | Confluence: ${sizingMultiplier}x | Strategy: ${entryStrategy}`);

          console.log(`[ORCHESTRATOR-ENTRY] Winner: ${entryStrategy} | Sizing: ${sizingMultiplier}x | SL=${exitContract.stopLossPercent}%, TP=${exitContract.takeProfitPercent}%`);

          // L4: Enrich ledger with actual computed position sizing
          if (decision.ledgerData) {
            const baseP = TradingConfig.get('positionSizing.maxPositionSize');
            decision.ledgerData.positionSizing = {
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
            patterns: patterns || [],
            entryIndicators: indicators,
            entryTime: this.ctx.marketData?.timestamp ?? Date.now(),
            signalBreakdown: orchResult?.signalBreakdown ?? null,
            bullishScore: orchResult?.bullishScore ?? 0,
            bearishScore: orchResult?.bearishScore || 0,
            reasoning: orchResult?.reasoning || '',
            entryStrategy: entryStrategy,
            exitContract: exitContract,
            ledgerData: decision.ledgerData || null,
            traceId,
            signalId,
            decisionId,
            // CC-A Change 2: stamp indicator state at entry on trade record
            atrAtEntry: decision.atrAtEntry ?? null,
            regimeAtEntry: decision.regimeAtEntry ?? null,
            rsiAtEntry: decision.rsiAtEntry ?? null,
            brokerId: this.ctx.config.brokerId,
            accountId: this.ctx.config.accountId || 'default',
            accountIdSource: this.ctx.config.accountId && this.ctx.config.accountId !== 'default' ? 'config' : 'default',
            assetClass: this.ctx.config.assetClass,
            executionMode: this.ctx.config.enableBacktestMode ? 'backtest' : this.ctx.config.executionMode,
            timeframe: this.ctx.config.timeframe,
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
              success: false,
              operation: 'openPosition',
              error: positionResult.error,
            });
            return; // Abort trade
          }

          // CHANGE 2025-12-13: No longer sync to local balance - read from StateManager
          const stateAfter = stateManager.getState();

          // CHECKPOINT 6: After position update
          console.log(`CP6: AFTER BUY - Position: ${stateAfter.position}, Balance: $${stateAfter.balance} (spent $${positionSize})`);
          emitTrace(this.ctx, 'STATE_MUTATION', {
            traceId,
            signalId,
            symbol,
            action: decision.action,
            success: true,
            operation: 'openPosition',
            orderId: unifiedResult.orderId,
            position: stateAfter.position,
            balance: stateAfter.balance,
          });

          // Change 605: Start MaxProfitManager on BUY to track profit targets
          // Phase 4 REWRITE: Access maxProfitManager directly (was inside deleted tradingBrain)
          const mpmInstance = new MaxProfitManager();
          mpmInstance.start(price, 'buy', adjustedPositionSize, {
            volatility: indicators.volatility ?? null,
            confidence: decision.confidence / 100,
            trend: indicators.trend || 'sideways'
          });
          this.ctx.maxProfitManagers.set(unifiedResult.orderId, mpmInstance);
          console.log(`💰 MaxProfitManager started for trade ${unifiedResult.orderId} - tracking profit targets`);

          // CHANGE 2026-02-01: Send Telegram notification for trade
          // Skip notifications during fast backtest
          if (!this.ctx.backtestFast) {
            this.ctx.notifyTrade({
              direction: 'BUY',
              asset: this.ctx.config.symbol || 'BTC',
              price: price,
              size: positionSize / stateAfter.balance,
              confidence: decision.confidence / 100
            }).catch(err => console.warn(`📱 Telegram notify failed: ${err.message}`));

            // CHANGE 2026-02-01: Re-enable Discord notifications (broken since v7)
            this.ctx.discordNotifier.notifyTrade('buy', price, positionSize);

            // CC-C: SignalStack webhook emit (TTP via IBKR). Fire-and-forget —
            // a slow/failed webhook must never stall the trading loop. BUY opens
            // a long; broker-side action is 'buy'. Quantity uses adjustedPositionSize
            // (post-confluence) divided by fill price, floored to integer shares.
            if (this.ctx.webhookAdapter) {
              const shares = entryPlan.orderQuantity;
              if (shares < 1) {
                // FIX WEBHOOK-FRACTIONAL: skip emit on known-bad signal. Drift between
                // internal position and broker is real (operator must know) but emitting
                // quantity=0 just generates ValidationError without changing the outcome.
                console.warn(`[WebhookOrder] DRIFT BLOCKED: BUY entry qty=${shares} (positionSize=$${adjustedPositionSize.toFixed(2)} / price=$${price.toFixed(2)}) — webhook not sent. Bot opened internally; TTP won't see this entry. INVESTIGATE: position size too small for asset price, or wrong asset class for strategy.`);
              } else {
                this._emitWebhookOrder('BUY', {
                  action: 'buy',
                  symbol,
                  quantity: shares,
                  orderType: 'market',
                }, { traceId, signalId, decisionId, symbol });
              }
            }
          }

          // Start pattern exit tracking (shadow mode or active)
          if (this.ctx.patternExitModel) {
            const exitTracking = this.ctx.patternExitModel.startTracking({
              entryPrice: price,
              direction: 'buy',
              size: positionSize,
              patterns: patterns || [],
              confidence: decision.confidence / 100,
              entryTime: this.ctx.marketData?.timestamp ?? Date.now()
            });

            if (this.ctx.patternExitShadowMode) {
              console.log(`🕵️ [SHADOW] Pattern Exit Tracking Started:`);
              console.log(`   Pattern Target: ${(exitTracking.patternTarget * 100).toFixed(2)}%`);
              console.log(`   Pattern Stop: ${(exitTracking.patternStop * 100).toFixed(2)}%`);
            }
          }

          // Phase 4 REWRITE: executionLayer.trades deleted - backtestRecorder handles trade recording

          // CHANGE 2026-01-23: Broadcast BUY trade to dashboard
          if (this.ctx.dashboardWsConnected && this.ctx.dashboardWs && this.ctx.dashboardWs.readyState === 1) {
            const openedTrade = this._getActiveTradeById(unifiedResult.orderId);
            this.ctx.dashboardWs.send(JSON.stringify(this._dashboardTradePayload({
              action: 'BUY',
              direction: 'long',
              symbol,
              price: price,
              pnl: 0,  // No P&L on entry
              timestamp: Date.now(),
              confidence: decision.confidence
            }, openedTrade || { orderId: unifiedResult.orderId, symbol })));
            console.log(`📡 Broadcast BUY trade to dashboard at $${price.toFixed(2)}`);
          }

          // CHANGE 2026-01-25: Log trade for website proof
          // CC-SPEC-EVAL-CAPTURE (2/3): forensic identity for entry/exit pairing
          TradingProofLogger.trade({
            action: 'BUY',
            symbol,
            price: price,
            size: adjustedPositionSize,
            // FIX VALUE-USD-DOUBLE-MULT 2026-05-13: adjustedPositionSize is already USD
            // (see line 109). Prior code multiplied USD × price, producing nonsense values
            // (e.g. $250 TSLA position recorded as $106,250; $1452 BTC position recorded
            // as $117M). Internal P&L was correct because StateManager uses the proper
            // formula independently; this was a display-layer bug.
            value_usd: adjustedPositionSize,
            fees: adjustedPositionSize * TradingConfig.get('fees.makerFee', 0.0025),
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
          const adjustedPositionSize = entryPlan.sizeUsd;

          // FIX 2026-03-28: adjustedPositionSize is already USD, no multiplication needed
          const actualDollars = adjustedPositionSize;
          const actualPercent = currentBalance > 0 ? (actualDollars / currentBalance) * 100 : 0;
          console.log(`[TRADE-RECEIPT] SHORT $${actualDollars.toFixed(2)} / $${currentBalance.toFixed(2)} = ${actualPercent.toFixed(1)}% of account | Conf: ${(tradeConfidence * 100).toFixed(0)}% | Confluence: ${sizingMultiplier}x | Strategy: ${entryStrategy}`);

          console.log(`[ORCHESTRATOR-ENTRY] SHORT Winner: ${entryStrategy} | Sizing: ${sizingMultiplier}x | SL=${exitContract.stopLossPercent}%, TP=${exitContract.takeProfitPercent}%`);

          // L4: Enrich ledger with actual computed position sizing (short path)
          if (decision.ledgerData) {
            const baseP = TradingConfig.get('positionSizing.maxPositionSize');
            decision.ledgerData.positionSizing = {
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
            patterns: patterns || [],
            entryIndicators: indicators,
            entryTime: this.ctx.marketData?.timestamp ?? Date.now(),
            signalBreakdown: orchResult?.signalBreakdown ?? null,
            bullishScore: orchResult?.bullishScore ?? 0,
            bearishScore: orchResult?.bearishScore || 0,
            reasoning: orchResult?.reasoning || '',
            entryStrategy: entryStrategy,
            exitContract: exitContract,
            ledgerData: decision.ledgerData || null,
            traceId,
            signalId,
            decisionId,
            // CC-A Change 2: stamp indicator state at entry on trade record
            atrAtEntry: decision.atrAtEntry ?? null,
            regimeAtEntry: decision.regimeAtEntry ?? null,
            rsiAtEntry: decision.rsiAtEntry ?? null,
            brokerId: this.ctx.config.brokerId,
            accountId: this.ctx.config.accountId || 'default',
            accountIdSource: this.ctx.config.accountId && this.ctx.config.accountId !== 'default' ? 'config' : 'default',
            assetClass: this.ctx.config.assetClass,
            executionMode: this.ctx.config.enableBacktestMode ? 'backtest' : this.ctx.config.executionMode,
            timeframe: this.ctx.config.timeframe,
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
              success: false,
              operation: 'openPosition',
              error: positionResult.error,
            });
            return;
          }

          const stateAfter = stateManager.getState();
          console.log(`CP6-SHORT: AFTER SHORT - Position: ${stateAfter.position}, Balance: $${stateAfter.balance}`);
          emitTrace(this.ctx, 'STATE_MUTATION', {
            traceId,
            signalId,
            symbol,
            action: decision.action,
            success: true,
            operation: 'openPosition',
            orderId: unifiedResult.orderId,
            position: stateAfter.position,
            balance: stateAfter.balance,
          });

          // MaxProfitManager for short direction
          const mpmShortInstance = new MaxProfitManager();
          mpmShortInstance.start(price, 'sell', adjustedPositionSize, {
            volatility: indicators.volatility ?? null,
            confidence: decision.confidence / 100,
            trend: indicators.trend || 'sideways'
          });
          this.ctx.maxProfitManagers.set(unifiedResult.orderId, mpmShortInstance);
          console.log(`💰 MaxProfitManager started (SHORT) for trade ${unifiedResult.orderId} - tracking profit targets`);

          // Notifications
          if (!this.ctx.backtestFast) {
            this.ctx.notifyTrade({
              direction: 'SELL_SHORT',
              asset: this.ctx.config.symbol || 'BTC',
              price: price,
              size: positionSize / stateAfter.balance,
              confidence: decision.confidence / 100
            }).catch(err => console.warn(`📱 Telegram notify failed: ${err.message}`));

            this.ctx.discordNotifier.notifyTrade('sell_short', price, positionSize);

            // CC-C: SignalStack webhook emit (TTP via IBKR). Fire-and-forget.
            // SELL_SHORT opens a short; broker-side action is 'sell'.
            if (this.ctx.webhookAdapter) {
              const shares = entryPlan.orderQuantity;
              if (shares < 1) {
                // FIX WEBHOOK-FRACTIONAL: skip emit on known-bad signal. Drift between
                // internal position and broker is real (operator must know) but emitting
                // quantity=0 just generates ValidationError without changing the outcome.
                console.warn(`[WebhookOrder] DRIFT BLOCKED: SELL_SHORT entry qty=${shares} (positionSize=$${adjustedPositionSize.toFixed(2)} / price=$${price.toFixed(2)}) — webhook not sent. Bot opened internally; TTP won't see this entry. INVESTIGATE: position size too small for asset price, or wrong asset class for strategy.`);
              } else {
                this._emitWebhookOrder('SELL_SHORT', {
                  action: 'sell',
                  symbol,
                  quantity: shares,
                  orderType: 'market',
                }, { traceId, signalId, decisionId, symbol });
              }
            }
          }

          // Pattern exit tracking for shorts
          if (this.ctx.patternExitModel) {
            const exitTracking = this.ctx.patternExitModel.startTracking({
              entryPrice: price,
              direction: 'sell',
              size: positionSize,
              patterns: patterns || [],
              confidence: decision.confidence / 100,
              entryTime: this.ctx.marketData?.timestamp ?? Date.now()
            });

            if (this.ctx.patternExitShadowMode) {
              console.log(`🕵️ [SHADOW] Pattern Exit Tracking Started (SHORT):`);
              console.log(`   Pattern Target: ${(exitTracking.patternTarget * 100).toFixed(2)}%`);
              console.log(`   Pattern Stop: ${(exitTracking.patternStop * 100).toFixed(2)}%`);
            }
          }

          // Dashboard broadcast for SHORT
          if (this.ctx.dashboardWsConnected && this.ctx.dashboardWs && this.ctx.dashboardWs.readyState === 1) {
            const openedTrade = this._getActiveTradeById(unifiedResult.orderId);
            this.ctx.dashboardWs.send(JSON.stringify(this._dashboardTradePayload({
              action: 'SELL_SHORT',
              direction: 'short',
              symbol,
              price: price,
              pnl: 0,
              timestamp: Date.now(),
              confidence: decision.confidence
            }, openedTrade || { orderId: unifiedResult.orderId, symbol })));
            console.log(`📡 Broadcast SHORT trade to dashboard at $${price.toFixed(2)}`);
          }

          // Proof logger for SHORT
          // CC-SPEC-EVAL-CAPTURE (2/3): forensic identity for entry/exit pairing
          TradingProofLogger.trade({
            action: 'SELL_SHORT',
            symbol,
            price: price,
            size: adjustedPositionSize,
            // FIX VALUE-USD-DOUBLE-MULT 2026-05-13: adjustedPositionSize is already USD
            // (see line 109). Prior code multiplied USD × price, producing nonsense values
            // (e.g. $250 TSLA position recorded as $106,250; $1452 BTC position recorded
            // as $117M). Internal P&L was correct because StateManager uses the proper
            // formula independently; this was a display-layer bug.
            value_usd: adjustedPositionSize,
            fees: adjustedPositionSize * TradingConfig.get('fees.makerFee', 0.0025),
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
          let fraction = null;
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
            console.error(`[KILL-5-MITIGATION] Halting new entries for ${symbol}: ${haltReason}`);
            await stateManager.haltSymbol(symbol, haltReason);
            emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, reason: haltReason });
            return; // Exit early, don't process invalid SELL
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

            // Create complete trade result
            // FIX 2026-02-23: Use actual exitReason from decision (was hardcoded to 'signal')
            const completeTradeResult = {
              ...buyTrade,
              traceId,
              signalId,
              decisionId,
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
                return buyTrade.size * ((price - buyTrade.entryPrice) / buyTrade.entryPrice);
              })(),
              holdDuration: holdDuration,
              exitReason: decision.exitReason || 'signal'
            };

            // CHANGE 2026-02-23: Record trade in BacktestRecorder (with fees, running balance)
            if (this.ctx.backtestRecorder) {
              this.ctx.backtestRecorder.recordTrade({
                entryTime: buyTrade.entryTime ? new Date(buyTrade.entryTime).toISOString() : '',
                exitTime: exitTimestamp ? new Date(exitTimestamp).toISOString() : '',
                direction: 'long',
                entryPrice: buyTrade.entryPrice,
                exitPrice: price,
                stopLoss: buyTrade.exitContract?.stopLossPercent || 0,
                takeProfit: buyTrade.exitContract?.takeProfitPercent || 0,
                size: buyTrade.size || 1,
                // MED-03: throw when buyTrade.entryStrategy missing at exit time.
                // Set at trade open from orchResult.winnerStrategy (HIGH-08 covers
                // missing-at-open). Missing AT EXIT means the trade record lost
                // entryStrategy between open and close — state-corruption signal.
                ...(buyTrade.entryStrategy ? {} : (() => { throw new Error(`[MED-03] BUY exit: trade record missing entryStrategy (orderId=${buyTrade.orderId}) — state corruption between open and close`); })()),
                strategyName: buyTrade.entryStrategy,
                confidence: buyTrade.confidence || 0,
                exitReason: completeTradeResult.exitReason || 'signal',
                reason: buyTrade.reason || '',
                holdTimeMinutes: holdDuration / 60000,
                exitContract: buyTrade.exitContract,
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
                traceId,
                signalId,
                decisionId
              });
              console.log(`📋 [TRADE-LOG] Strategy: ${buyTrade.entryStrategy || 'unknown'} | Conf: ${(buyTrade.confidence || 0).toFixed(1)}% | Size: ${buyTrade.size || 0} | Exit: ${completeTradeResult.exitReason || 'unknown'}`);
            }

            console.log(`📊 Trade closed: ${pnl >= 0 ? '✅' : '❌'} ${pnl.toFixed(2)}% | Hold: ${(holdDuration/60000).toFixed(1)}min`);

            // CHANGE 2025-12-11: Use StateManager for atomic position close
            const positionState = stateManager.getState();
            const positionAmount = positionState.position;  // Position in USD

            // Close position via StateManager (handles P&L calculation)
            // FIX 2026-04-16: Route partial exits to reducePosition, full exits to closePosition
            // (isPartialClose/fraction hoisted to SELL-block scope above for MPM cleanup access)
            if (typeof decision.exitFraction === 'number' && decision.exitFraction > 0 && decision.exitFraction < 1) {
              isPartialClose = true;
              fraction = decision.exitFraction;
            }
            let closeResult;
            const stateExitFraction = exitPlan?.stateExitFraction ?? fraction;
            if (isPartialClose) {
              closeResult = await stateManager.reducePosition(buyTrade.orderId, stateExitFraction, price, {
                orderId: buyTrade.orderId,
                exitReason: decision.exitReason || 'signal',
                orderQuantity: exitPlan?.orderQuantity,
                quantityUnit: exitPlan?.quantityUnit,
                traceId,
                signalId,
                decisionId
              });
            } else {
              closeResult = await stateManager.closePosition(price, false, null, {
                orderId: buyTrade.orderId,
                exitReason: decision.exitReason || 'signal',
                traceId,
                signalId,
                decisionId
              });
            }

            // CHANGE 2025-12-12: Validate StateManager.closePosition() success
            if (!closeResult.success) {
              console.error('❌ StateManager.closePosition failed:', closeResult.error);
              emitTrace(this.ctx, 'STATE_MUTATION', {
                traceId,
                signalId,
                symbol,
                action: decision.action,
                success: false,
                operation: isPartialClose ? 'reducePosition' : 'closePosition',
                orderId: buyTrade.orderId,
                error: closeResult.error,
              });
              return; // Abort close
            }

            // Get updated state after close
            // CHANGE 2025-12-13: No local balance sync needed - read from StateManager
            const afterSellState = stateManager.getState();
            emitTrace(this.ctx, 'STATE_MUTATION', {
              traceId,
              signalId,
              symbol,
              action: decision.action,
              success: true,
              operation: isPartialClose ? 'reducePosition' : 'closePosition',
              orderId: buyTrade.orderId,
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
            const usdAmount = positionAmount;
            const sellValue = usdAmount;  // already USD — for display
            const profitLoss = buyTrade.entryPrice > 0
              ? usdAmount * ((price - buyTrade.entryPrice) / buyTrade.entryPrice)
              : 0;
            console.log(`📍 CP8: SELL COMPLETE - New Balance: $${stateManager.get('balance')} (received $${sellValue.toFixed(2)}, P&L: $${profitLoss.toFixed(2)})`);

            // CHANGE 2026-02-01: Send notifications for trade close with P&L
            // BACKTEST_FAST: Skip notifications during backtest
            if (!this.ctx.backtestFast) {
              this.ctx.notifyTradeClose({
                pnl: profitLoss,
                entryPrice: buyTrade.entryPrice,
                exitPrice: price,
                duration: `${Math.round((Date.now() - buyTrade.entryTime) / 60000)}m`
              }).catch(err => console.warn(`📱 Telegram notify failed: ${err.message}`));

              // CHANGE 2026-02-01: Re-enable Discord notifications for SELL
              this.ctx.discordNotifier.notifyTrade('sell', price, usdAmount, profitLoss);

              // CC-C: SignalStack webhook emit (TTP via IBKR). Fire-and-forget.
              // SELL closes a long; broker-side action is 'sell'. Partial-aware:
              // emit the REDUCED USD when reducePosition handled a partial close.
              if (this.ctx.webhookAdapter) {
                const exitUsd = isPartialClose ? positionAmount * stateExitFraction : positionAmount;
                const shares = exitPlan ? exitPlan.orderQuantity : Math.floor(exitUsd / price);
                if (shares < 1) {
                  // FIX WEBHOOK-FRACTIONAL: skip emit on known-bad signal. Drift between
                  // internal position and broker is real (operator must know) but emitting
                  // quantity=0 just generates ValidationError without changing the outcome.
                  console.warn(`[WebhookOrder] DRIFT BLOCKED: SELL ${isPartialClose ? 'partial' : 'full'} exit qty=${shares} (exitUsd=$${exitUsd.toFixed(2)} / price=$${price.toFixed(2)}) — webhook not sent. Bot reduced position internally; TTP long position will diverge until next viable emit. INVESTIGATE: exit USD too small for asset price, or partial-close fraction too aggressive.`);
                } else {
                  this._emitWebhookOrder('SELL', {
                    action: 'sell',
                    symbol,
                    quantity: shares,
                    orderType: 'market',
                    bypassThrottle: true,  // exits MUST go through; vendor-side throttle is TTP's concern
                  }, { traceId, signalId, decisionId, symbol });
                }
              }
            }

            // Phase 4 REWRITE: executionLayer.trades deleted - backtestRecorder handles trade recording

            // CHANGE 2026-01-23: Broadcast SELL trade to dashboard
            if (this.ctx.dashboardWsConnected && this.ctx.dashboardWs && this.ctx.dashboardWs.readyState === 1) {
              this.ctx.dashboardWs.send(JSON.stringify(this._dashboardTradePayload({
                action: 'SELL',
                direction: 'long',
                symbol,
                price: price,
                pnl: completeTradeResult.pnlDollars,
                timestamp: Date.now(),
                duration: `${(holdDuration / 60000).toFixed(1)}m`,
                confidence: decision.confidence
              }, completeTradeResult)));
              console.log(`📡 Broadcast SELL trade to dashboard at $${price.toFixed(2)} (P&L: $${completeTradeResult.pnlDollars.toFixed(2)})`);
            }

            // CHANGE 2026-01-25: Log trade for website proof
            // CC-SPEC-EVAL-CAPTURE (2/3): forensic identity for entry/exit pairing
            TradingProofLogger.trade({
              action: 'SELL',
              symbol,
              price: price,
              size: usdAmount,
              value_usd: sellValue,
              fees: sellValue * TradingConfig.get('fees.takerFee', 0.004),
              reason: completeTradeResult.exitReason || 'Signal exit',
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
              isPartialClose: isPartialClose,
              partialFraction: isPartialClose ? fraction : null,
              exitReason: completeTradeResult.exitReason || 'signal'
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

            // 2. Record pattern outcome for learning
            // FIX 2026-03-14: ALWAYS record pattern results - don't skip if buyTrade.patterns is empty
            // Previous bug: 90% of patterns had pnl=0 because this block was skipped when patterns array was missing
            // CHANGE 659: Pass features array for proper pattern matching
            // recordPatternResult REQUIRES features array, never pass signature string
            {
              const pattern = buyTrade.patterns?.[0]; // Primary pattern object (may be undefined)
              const patternName = pattern?.name || buyTrade.entryStrategy || 'unknown';

              // HIGH-09/10/11/12: pattern feature recording — only on clean features.
              // Old code fabricated a 9-element vector from synthetic neutrals
              // (rsi=0.5, macd=0, trend=0, bbWidth=0.02, vol=0.01) when pattern.features
              // was missing. Two patterns with different REAL features but the same
              // missing-fields collapsed into the same pattern hash, poisoning
              // PatternMemoryBank statistics. Per spec Rule #1: skip the record entirely
              // rather than substitute fabricated values.
              let featuresForRecording = null;
              if (pattern && Array.isArray(pattern.features) && pattern.features.length > 0) {
                featuresForRecording = pattern.features;
              }

              // SAFE TEST MODE CHECK - Never corrupt patterns in test
              if (featuresForRecording && this.ctx.config.tradingMode !== 'TEST' && !this.ctx.testMode) {
                this.ctx.patternChecker.recordPatternResult(featuresForRecording, {
                  pnl: pnl,
                  holdDurationMs: holdDuration,  // Add temporal data
                  exitReason: completeTradeResult.exitReason || 'signal',
                  timestamp: Date.now()
                });
              } else if (this.ctx.config.tradingMode === 'TEST') {
                console.log('🧪 TEST MODE: Would record P&L pattern but SKIPPING - pattern base protected');
              }
              console.log(`🧠 Pattern learning: ${patternName} → ${pnl.toFixed(2)}%`);

              // REMOVED 2026-04-16: Direct UnifiedPatternMemory call was double-counting.
              // TRAI.recordTradeOutcome (below) is the sole recording path — it calls
              // UnifiedPatternMemory.recordOutcome internally via trai_core.recordTradeResult.
            }

            // FIX 2026-02-26: Run health check every 10 trade exits to detect broken pattern recording
            this.tradeExitCount = (this.tradeExitCount || 0) + 1;
            if (this.tradeExitCount % 10 === 0 && this.ctx.patternChecker?.memory) {
              const health = this.ctx.patternChecker.memory.healthCheck();
              if (!health.healthy) {
                console.error('🚨 PATTERN SYSTEM UNHEALTHY - outcomes not recording correctly!');
              }
            }

            // 3. Update PerformanceAnalyzer (using processTrade, not recordTrade)
            this.ctx.performanceAnalyzer.processTrade(completeTradeResult);

            // 3.5 CHANGE 2026-02-14: Wire RiskManager trade tracking (was NEVER CALLED)
            // Updates daily/weekly/monthly loss limits, drawdown, streaks, recovery mode
            if (this.ctx.riskManager) {
              this.ctx.riskManager.recordTradeResult({
                success: pnl >= 0,
                pnl: completeTradeResult.pnlDollars || 0
              });
            }

            // 3.6 FIX 2026-03-29: Wire SMS daily loss tracking (was NEVER CALLED)
            // Updates dailyLosses counter so 3-loss-per-day limit works
            if (this.ctx.strategyOrchestrator && buyTrade.entryStrategy) {
              this.ctx.strategyOrchestrator.recordTradeResult(
                buyTrade.entryStrategy,
                completeTradeResult.pnlDollars || 0
              );
            }

            // 3.7 FIX 2026-04-05: Wire PID Controller for adaptive parameter optimization
            // Updates position sizing, regime boosts, trailing stops based on performance
            try {
              const pidController = getPIDController();
              pidController.onTradeClose({
                strategyName: buyTrade.entryStrategy || buyTrade.strategy || 'unknown',
                netPnlDollars: completeTradeResult.pnlDollars || 0,
                netPnlPercent: completeTradeResult.pnl || 0,
                exitReason: completeTradeResult.exitReason || 'signal',
                maxProfitPercent: buyTrade.maxProfitPercent || 0,
                maxFavorableExcursion: buyTrade.maxFavorableExcursion || 0,
                holdDuration: completeTradeResult.holdDuration || 0,
              });
            } catch (err) {
              // PID is optional - don't break trade flow if it fails
              console.warn(`[PID] onTradeClose failed: ${err.message}`);
            }

            // 4. CHANGE 2026-02-13: Re-enable TradeLogger with comprehensive breakdown
            try {
              this.ctx.logTrade({
                // Basic trade info
                type: completeTradeResult.action || 'BUY',
                entryPrice: buyTrade.entryPrice || buyTrade.price,
                exitPrice: price,
                currentPrice: price,
                size: buyTrade.size,

                // Financial results
                pnl: completeTradeResult.pnlDollars || 0,
                pnlPercent: pnl || 0,
                fees: (buyTrade.size * price) * TradingConfig.get('fees.totalRoundTrip'),  // From TradingConfig

                // Timing
                entryTime: new Date(buyTrade.entryTime).toISOString(),
                exitTime: new Date().toISOString(),
                holdTime: holdDuration,

                // Account
                balanceBefore: stateManager.get('balance') - (completeTradeResult.pnlDollars || 0),
                balanceAfter: stateManager.get('balance'),

                // Technical indicators at entry
                rsi: buyTrade.entryIndicators?.rsi || buyTrade.indicators?.rsi || 0,
                macd: buyTrade.entryIndicators?.macd?.macd || buyTrade.indicators?.macd || 0,
                macdSignal: buyTrade.entryIndicators?.macd?.signal || buyTrade.indicators?.macdSignal || 0,
                trend: buyTrade.entryIndicators?.trend || buyTrade.indicators?.trend || 'unknown',
                volatility: buyTrade.entryIndicators?.volatility || buyTrade.indicators?.volatility || 0,

                // CHANGE 2026-02-13: Decision reasoning breakdown
                confidence: buyTrade.confidence || 0,
                signalBreakdown: buyTrade.signalBreakdown ?? null,
                bullishScore: buyTrade.bullishScore ?? 0,
                bearishScore: buyTrade.bearishScore || 0,
                entryReason: buyTrade.reasoning || 'no reason stored',

                // Exit analysis
                exitReason: completeTradeResult.exitReason || 'signal',
                exitIndicators: {
                  rsi: indicators.rsi,
                  macd: indicators.macd?.macd ?? null,
                  macdSignal: indicators.macd?.signal ?? null,
                  trend: indicators.trend,
                  volatility: indicators.volatility ?? null
                },

                // Pattern data
                patternType: buyTrade.patterns?.[0]?.name || null,
                patternConfidence: buyTrade.patterns?.[0]?.confidence || 0,

                // Risk management
                positionSize: buyTrade.size * buyTrade.entryPrice,
                riskPercent: (Math.abs(completeTradeResult.pnlDollars || 0) / (stateManager.get('balance') || 1)) * 100,

                // Session context
                totalTrades: stateManager.get('tradeCount') || 0,
                winRate: this.ctx.performanceAnalyzer?.getWinRate?.() || 0
              });
            } catch (logErr) {
              console.warn(`⚠️ TradeLogger error: ${logErr.message}`);
            }

            // 5. TRAI learning — feed PatternMemoryBank for promotion/quarantine
            // FIX 2026-02-14: Pass complete trade object matching PatternMemoryBank schema
            // recordTradeOutcome() takes ONE arg. extractPattern() needs .indicators and .trend
            if (this.ctx.trai && this.pendingTraiDecisions?.has(buyTrade.orderId)) {
              const traiDecisionData = this.pendingTraiDecisions.get(buyTrade.orderId);
              this.ctx.trai.recordTradeOutcome({
                tradeId: buyTrade.orderId,
                decisionId: traiDecisionData.decisionId,
                symbol,
                profitLoss: profitLoss,
                profitLossPercent: pnl,
                holdDuration: holdDuration,
                entry: {
                  price: buyTrade.entryPrice || buyTrade.price,
                  timestamp: buyTrade.entryTime,
                  indicators: {
                    rsi: buyTrade.entryIndicators?.rsi,
                    macd: buyTrade.entryIndicators?.macd?.macd || buyTrade.entryIndicators?.macd || 0,
                    macdHistogram: buyTrade.entryIndicators?.macd?.histogram || 0,
                    primaryPattern: buyTrade.patterns?.[0]?.name || 'none'
                  },
                  trend: buyTrade.entryIndicators?.trend || 'neutral',
                  volatility: buyTrade.entryIndicators?.volatility || 0
                },
                exit: {
                  price: price,
                  timestamp: Date.now(),
                  indicators: {
                    rsi: indicators.rsi,
                    macd: indicators.macd?.macd ?? null,
                    macdHistogram: indicators.macd?.histogram ?? null
                  },
                  trend: indicators.trend || 'neutral'
                },
                indicators: {
                  rsi: buyTrade.entryIndicators?.rsi,
                  macd: buyTrade.entryIndicators?.macd?.macd || buyTrade.entryIndicators?.macd || 0,
                  macdHistogram: buyTrade.entryIndicators?.macd?.histogram || 0,
                  primaryPattern: buyTrade.patterns?.[0]?.name || 'none'
                },
                trend: buyTrade.entryIndicators?.trend || 'neutral',
                volatility: buyTrade.entryIndicators?.volatility || 0,
                traiConfidence: traiDecisionData.traiConfidence,
                originalConfidence: traiDecisionData.originalConfidence
              });
              this.pendingTraiDecisions.delete(buyTrade.orderId);
              console.log(`🤖 [TRAI] Learning from ${pnl >= 0 ? 'WIN' : 'LOSS'}: ${pnl.toFixed(2)}% ($${profitLoss.toFixed(2)})`);
            }
            // Clean up active trade
            // CHANGE 2025-12-13: Remove from StateManager (single source of truth)
            if (!isPartialClose) {
              stateManager.removeActiveTrade(buyTrade.orderId);
            }
          }

          // CHANGE 645: Reset MaxProfitManager after successful SELL
          // Only reset and remove per-trade MPM on full close
          if (!isPartialClose && this.ctx.maxProfitManagers) {
            const mpm = this.ctx.maxProfitManagers.get(buyTrade.orderId);
            if (mpm) {
              mpm.reset();
              this.ctx.maxProfitManagers.delete(buyTrade.orderId);
              console.log(`💰 MaxProfitManager removed for trade ${buyTrade.orderId}`);
            }
          }

          // Stop pattern exit tracking
          if (this.ctx.patternExitModel) {
            this.ctx.patternExitModel.stopTracking({
              pnl: pnl,
              exitReason: 'manual_sell'
            });
            if (this.ctx.patternExitShadowMode) {
              console.log(`🕵️ [SHADOW] Pattern Exit tracking stopped`);
            }
          }

          // Position already reset via stateManager.closePosition() above
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
            console.error(`[KILL-5-MITIGATION] Halting new entries for ${symbol}: ${haltReason}`);
            await stateManager.haltSymbol(symbol, haltReason);
            emitTrace(this.ctx, 'ORDER_BLOCKED', { traceId, signalId, symbol, action: decision.action, reason: haltReason });
            return;
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

          const completeTradeResult = {
            ...shortTrade,
            traceId,
            signalId,
            decisionId,
            exitPrice: price,
            exitTime: exitTimestamp,
            pnl: pnl,
            // FIX 2026-03-28: USD position × percentage change = USD profit
            // MED-02: SHORT exit — symmetric halt to BUY exit at :641-651.
            pnlDollars: (() => {
              if (!(shortTrade.entryPrice > 0)) {
                throw new Error(`[MED-02] SHORT exit: shortTrade.entryPrice non-positive (got ${shortTrade.entryPrice}) — refusing to log phantom \$0 P&L`);
              }
              return shortTrade.size * ((shortTrade.entryPrice - price) / shortTrade.entryPrice);
            })(),
            holdDuration: holdDuration,
            exitReason: decision.exitReason || 'signal'
          };

          // Record trade
          if (this.ctx.backtestRecorder) {
            this.ctx.backtestRecorder.recordTrade({
              entryTime: shortTrade.entryTime ? new Date(shortTrade.entryTime).toISOString() : '',
              exitTime: exitTimestamp ? new Date(exitTimestamp).toISOString() : '',
              direction: 'short',
              entryPrice: shortTrade.entryPrice,
              exitPrice: price,
              stopLoss: shortTrade.exitContract?.stopLossPercent || 0,
              takeProfit: shortTrade.exitContract?.takeProfitPercent || 0,
              size: shortTrade.size || 1,
              // MED-03: SHORT exit symmetric warn — same state-persistence
              // concern as BUY exit at :669-675.
              ...(shortTrade.entryStrategy ? {} : (() => { throw new Error(`[MED-03] SHORT exit: trade record missing entryStrategy (orderId=${shortTrade.orderId}) — state corruption between open and close`); })()),
              strategyName: shortTrade.entryStrategy,
              confidence: shortTrade.confidence || 0,
              exitReason: completeTradeResult.exitReason || 'signal',
              reason: shortTrade.reason || '',
              holdTimeMinutes: holdDuration / 60000,
              exitContract: shortTrade.exitContract,
              // CC-A Change 2: passthrough indicator state stamped on trade at entry
              atrAtEntry: shortTrade.atrAtEntry ?? null,
              regimeAtEntry: shortTrade.regimeAtEntry ?? null,
              rsiAtEntry: shortTrade.rsiAtEntry ?? null,
              // CC-C Commit 5: drop the historical bandaid chain — see the
              // matching note on the SELL path. shortTrade.symbol is the
              // single source of truth (stamped at openPosition time).
              symbol: shortTrade.symbol,
              traceId,
              signalId,
              decisionId
            });
            console.log(`📋 [TRADE-LOG] SHORT Strategy: ${shortTrade.entryStrategy || 'unknown'} | Exit: ${completeTradeResult.exitReason || 'unknown'}`);
          }

          console.log(`📊 SHORT closed: ${pnl >= 0 ? '✅' : '❌'} ${pnl.toFixed(2)}% | Hold: ${(holdDuration/60000).toFixed(1)}min`);

          // Close position
          const positionState = stateManager.getState();
          const shortSize = Math.abs(positionState.position);
          const closeResult = await stateManager.closePosition(price, false, null, {
            orderId: shortTrade.orderId,
            exitReason: decision.exitReason || 'signal',
            direction: 'short',
            traceId,
            signalId,
            decisionId
          });

          if (!closeResult.success) {
            console.error('❌ StateManager.closePosition (COVER) failed:', closeResult.error);
            emitTrace(this.ctx, 'STATE_MUTATION', {
              traceId,
              signalId,
              symbol,
              action: decision.action,
              success: false,
              operation: 'closePosition',
              orderId: shortTrade.orderId,
              error: closeResult.error,
            });
            return;
          }

          const afterCoverState = stateManager.getState();
          emitTrace(this.ctx, 'STATE_MUTATION', {
            traceId,
            signalId,
            symbol,
            action: decision.action,
            success: true,
            operation: 'closePosition',
            orderId: shortTrade.orderId,
            position: afterCoverState.position,
            balance: afterCoverState.balance,
          });
          const profitLoss = shortSize * (shortTrade.entryPrice - price);
          console.log(`📍 CP8-COVER: COVER COMPLETE - New Balance: $${afterCoverState.balance} (P&L: $${profitLoss.toFixed(2)})`);

          // Notifications
          if (!this.ctx.backtestFast) {
            this.ctx.notifyTradeClose({
              pnl: profitLoss,
              entryPrice: shortTrade.entryPrice,
              exitPrice: price,
              duration: `${Math.round((Date.now() - shortTrade.entryTime) / 60000)}m`,
              direction: 'short'
            }).catch(err => console.warn(`📱 Telegram notify failed: ${err.message}`));

            this.ctx.discordNotifier.notifyTrade('cover', price, shortSize, profitLoss);

            // CC-C: SignalStack webhook emit (TTP via IBKR). Fire-and-forget —
            // a slow/failed webhook must never stall the trading loop. COVER closes
            // a short, so the broker-side action is 'buy'.
            if (this.ctx.webhookAdapter) {
              const shares = exitPlan ? exitPlan.orderQuantity : Math.floor(shortSize / price);
              if (shares < 1) {
                // FIX WEBHOOK-FRACTIONAL: skip emit on known-bad signal. Drift between
                // internal position and broker is real (operator must know) but emitting
                // quantity=0 just generates ValidationError without changing the outcome.
                console.warn(`[WebhookOrder] DRIFT BLOCKED: COVER qty=${shares} (shortSize=$${shortSize.toFixed(2)} / price=$${price.toFixed(2)}) — webhook not sent. Bot covered internally; TTP short position will diverge until next viable emit. INVESTIGATE: short USD too small for asset price.`);
              } else {
                this._emitWebhookOrder('COVER', {
                  action: 'buy',
                  symbol,
                  quantity: shares,
                  orderType: 'market',
                  bypassThrottle: true,  // exits MUST go through; vendor-side throttle is TTP's concern
                }, { traceId, signalId, decisionId, symbol });
              }
            }
          }

          // Dashboard broadcast for COVER
          if (this.ctx.dashboardWsConnected && this.ctx.dashboardWs && this.ctx.dashboardWs.readyState === 1) {
            this.ctx.dashboardWs.send(JSON.stringify(this._dashboardTradePayload({
              action: 'COVER',
              direction: 'short',
              symbol,
              price: price,
              pnl: completeTradeResult.pnlDollars,
              timestamp: Date.now(),
              duration: `${(holdDuration / 60000).toFixed(1)}m`,
              confidence: decision.confidence
            }, completeTradeResult)));
            console.log(`📡 Broadcast COVER trade to dashboard at $${price.toFixed(2)} (P&L: $${completeTradeResult.pnlDollars.toFixed(2)})`);
          }

          // Proof logger for COVER
          // CC-SPEC-EVAL-CAPTURE (2/3): forensic identity for entry/exit pairing.
          // NOTE: COVER always full-closes in current code (TradingLoop emits exitFraction
          // for COVER but OrderExecutor's COVER branch ignores it — separate trading-pipeline
          // bug). isPartialClose:false reflects actual behavior; revisit when that bug is fixed.
          TradingProofLogger.trade({
            action: 'COVER',
            symbol,
            price: price,
            size: shortSize,
            // FIX VALUE-USD-DOUBLE-MULT 2026-05-13: shortSize is already USD.
            value_usd: shortSize,
            fees: shortSize * TradingConfig.get('fees.takerFee', 0.004),
            reason: completeTradeResult.exitReason || 'Short cover',
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
            exitReason: completeTradeResult.exitReason || 'signal'
          });

          // Risk manager update
          if (this.ctx.riskManager) {
            this.ctx.riskManager.recordTradeResult({
              success: pnl >= 0,
              pnl: completeTradeResult.pnlDollars || 0
            });
          }

          // FIX 2026-03-29: Wire SMS daily loss tracking for shorts
          if (this.ctx.strategyOrchestrator && shortTrade.entryStrategy) {
            this.ctx.strategyOrchestrator.recordTradeResult(
              shortTrade.entryStrategy,
              completeTradeResult.pnlDollars || 0
            );
          }

          // FIX 2026-04-05: Wire PID Controller for short exits
          try {
            const pidController = getPIDController();
            pidController.onTradeClose({
              strategyName: shortTrade.entryStrategy || shortTrade.strategy || 'unknown',
              netPnlDollars: completeTradeResult.pnlDollars || 0,
              netPnlPercent: completeTradeResult.pnl || 0,
              exitReason: completeTradeResult.exitReason || 'signal',
              maxProfitPercent: shortTrade.maxProfitPercent || 0,
              maxFavorableExcursion: shortTrade.maxFavorableExcursion || 0,
              holdDuration: completeTradeResult.holdDuration || 0,
            });
          } catch (err) {
            console.warn(`[PID] onTradeClose (short) failed: ${err.message}`);
          }

          // TRAI learning — mirror SELL path for short trade outcomes
          if (this.ctx.trai && this.pendingTraiDecisions?.has(shortTrade.orderId)) {
            const traiDecisionData = this.pendingTraiDecisions.get(shortTrade.orderId);
            this.ctx.trai.recordTradeOutcome({
              tradeId: shortTrade.orderId,
              decisionId: traiDecisionData.decisionId,
              symbol,
              profitLoss: profitLoss,
              profitLossPercent: pnl,
              holdDuration: holdDuration,
              entry: {
                price: shortTrade.entryPrice || shortTrade.price,
                timestamp: shortTrade.entryTime,
                indicators: {
                  rsi: shortTrade.entryIndicators?.rsi,
                  macd: shortTrade.entryIndicators?.macd?.macd || shortTrade.entryIndicators?.macd || 0,
                  macdHistogram: shortTrade.entryIndicators?.macd?.histogram || 0,
                  primaryPattern: shortTrade.patterns?.[0]?.name || 'none'
                },
                trend: shortTrade.entryIndicators?.trend || 'neutral',
                volatility: shortTrade.entryIndicators?.volatility || 0
              },
              exit: {
                price: price,
                timestamp: Date.now(),
                indicators: {
                  rsi: indicators.rsi,
                  macd: indicators.macd?.macd ?? null,
                  macdHistogram: indicators.macd?.histogram ?? null
                },
                trend: indicators.trend || 'neutral'
              },
              indicators: {
                rsi: shortTrade.entryIndicators?.rsi,
                macd: shortTrade.entryIndicators?.macd?.macd || shortTrade.entryIndicators?.macd || 0,
                macdHistogram: shortTrade.entryIndicators?.macd?.histogram || 0,
                primaryPattern: shortTrade.patterns?.[0]?.name || 'none'
              },
              trend: shortTrade.entryIndicators?.trend || 'neutral',
              volatility: shortTrade.entryIndicators?.volatility || 0,
              traiConfidence: traiDecisionData.traiConfidence,
              originalConfidence: traiDecisionData.originalConfidence
            });
            this.pendingTraiDecisions.delete(shortTrade.orderId);
            console.log(`🤖 [TRAI] Learning from SHORT ${pnl >= 0 ? 'WIN' : 'LOSS'}: ${pnl.toFixed(2)}% ($${profitLoss.toFixed(2)})`);
          }

          // Pattern exit model
          if (this.ctx.patternExitModel && this.ctx.patternExitModel.isTracking) {
            this.ctx.patternExitModel.endTracking(price, {
              pnl: pnl,
              exitReason: 'cover'
            });
          }
        }

        // Record in performance analyzer
        const performanceData = {
          type: decision.action,
          price,
          size: positionSize,
          confidence: decision.confidence,
          timestamp: Date.now(),
          result: tradeResult
        };

        this.ctx.performanceAnalyzer.processTrade(performanceData);

        // CHANGE 650: REMOVED DUPLICATE TRAI STORAGE - Already properly stored at line 853-861
        // This was overwriting the complete data with incomplete data

        console.log(`✅ ${decision.action} executed: ${tradeResult.orderId || 'SIMULATED'} | Size: $${positionSize.toFixed(2)}\n`);
      } else {
        console.log(`⛔ Trade blocked: ${tradeResult?.reason || 'Risk limits'}\n`);
        emitTrace(this.ctx, 'ORDER_BLOCKED', {
          traceId,
          signalId,
          symbol,
          action: decision.action,
          reason: tradeResult?.reason || 'Risk limits',
        });
      }

    } catch (error) {
      // FIX TIER-2-EXECUTE-CATCH: audit-prefixed throws (CRIT/HIGH/MED/RUN/EXIT/MOD/TRAI/PNLC/RISK/BTR/SESSION/DPS/PS)
      // are intentional halts on bad state. Without this differentiation, the wrapper
      // turns every "fail-loud" spec into fail-silent behavior. Re-throw audit prefixes
      // so they reach run-empire-v2's promise-rejection handler (operator-visible).
      // Also re-throw MaxProfitManager.start errors (no audit prefix but explicit halt).
      const isAuditThrow = error.message && /^\[(?:CRIT|HIGH|MED|RUN|EXIT|MOD|TRAI|PNLC|RISK|BTR|SESSION|DPS|PS)-/.test(error.message);
      const isMpmHalt = error.message && error.message.startsWith('MaxProfitManager.start:');
      if (isAuditThrow || isMpmHalt) {
        console.error(`[FAIL-LOUD] ${error.message}`);
        emitTrace(this.ctx, 'ORDER_EXCEPTION', {
          traceId,
          signalId,
          symbol,
          action: decision?.action || null,
          message: error.message,
          failLoud: true,
        });
        throw error;
      }

      console.error(`❌ Trade execution failed at checkpoint between CP3 and CP4`);
      console.error(`   Error message: ${error.message}`);
      console.error(`   Stack trace:`, error.stack);
      console.error(`   Decision: ${decision?.action}, Confidence: ${decision?.confidence}`);
      console.error(`   Position size: ${positionSize}`);
      emitTrace(this.ctx, 'ORDER_EXCEPTION', {
        traceId,
        signalId,
        symbol,
        action: decision?.action || null,
        message: error.message,
      });

      // Phase 4 REWRITE: tradingBrain.errorHandler deleted - error logging above is sufficient
    }
  }
}

module.exports = OrderExecutor;
