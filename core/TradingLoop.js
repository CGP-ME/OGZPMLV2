/**
 * TradingLoop - Clean Rewrite
 *
 * Direction-agnostic. Broker-agnostic. No legacy filters.
 * 
 * FLOW:
 *   1. Gather data (indicators, patterns, regime, orchestrator)
 *   2. Check exits on active positions
 *   3. Check entries (any direction, same logic)
 *   4. Execute
 *
 * RULES:
 *   - Direction is DATA, not a special case. Buy and sell use identical paths.
 *   - Config is the ONLY source of truth. No hardcoded strings, no buried overrides.
 *   - Exit decisions and entry decisions are INDEPENDENT. An exit does not block an entry.
 *   - All actions flow through a single decision object to OrderExecutor.
 *
 * @module core/TradingLoop
 */

'use strict';

const { c: _c, o: _o, h: _h, l: _l, v: _v, t: _t } = require('./CandleHelper');
const { getInstance: getStateManager } = require('./StateManager');
const { RegimeDetector } = require('./RegimeDetector');
const FeatureExtractor = require('./FeatureExtractor');
const FeatureFlagManager = require('./FeatureFlagManager');
const TradingConfig = require('./TradingConfig');
const { getInstance: getExitContractManager } = require('./ExitContractManager');
const CandlePatternDetector = require('./CandlePatternDetector');
const { getNarrator } = require('./TradeNarrator');
const flagManager = FeatureFlagManager.getInstance();

const candlePatternDetector = new CandlePatternDetector();
const stateManager = getStateManager();
const exitContractManager = getExitContractManager();

class TradingLoop {
  constructor(ctx) {
    this.ctx = ctx;
    this.analyzing = false;
    console.log('[TradingLoop] Initialized (clean rewrite - direction agnostic)');
  }

  /**
   * Main analysis loop. Called on every candle.
   * CC-C Commit 5/6: `symbol` is REQUIRED. No null-default fallback to
   * ctx.tradingPair — that path was the multi-broker-arbitrage single-leg-
   * liquidation footgun (Mercury Pass 3 finding G). Callers must pass the
   * symbol explicitly: single-symbol mode passes `this.tradingPair` from the
   * runner; multi-symbol mode (commit 6+) passes per-dispatch symbol from
   * the OHLC handler. Throws on missing/invalid so callers fail loud.
   */
  async analyzeAndTrade(symbol) {
    if (typeof symbol !== 'string' || !symbol) {
      throw new Error(
        `TradingLoop.analyzeAndTrade requires explicit non-empty string symbol; got ${JSON.stringify(symbol)}`
      );
    }
    // Concurrency guard — one analysis at a time
    if (this.analyzing) return;
    this.analyzing = true;

    try {
      await this._analyze(symbol);
    } finally {
      this.analyzing = false;
    }
  }

  async _analyze(symbol) {
    // CC-C Commit 5/6: `symbol` is REQUIRED. analyzeAndTrade enforces this
    // upstream; the redundant check here is defense-in-depth in case _analyze
    // is ever called from a sibling path that bypasses analyzeAndTrade.
    if (typeof symbol !== 'string' || !symbol) {
      throw new Error(
        `TradingLoop._analyze requires explicit non-empty string symbol; got ${JSON.stringify(symbol)}`
      );
    }
    // CC-C Multi-Symbol Commit 4: resolve per-symbol context if wired.
    // symCtx may be null when commit 6's per-symbol context wiring hasn't
    // been activated yet for this symbol; the per-data-type `symCtx?.X ??
    // this.ctx.X` resolvers below handle that gracefully (commit 4's surface,
    // not commit 5's — kept as-is, separate concern).
    const symCtx = this.ctx.symbolContexts?.get(symbol);
    // _gatherData re-resolves indicatorEngine/fibonacciDetector via its own
    // symCtx pass — declaring them here too was dead code (Mercury attack #4).
    const priceHistory = symCtx?.priceHistory ?? this.ctx.priceHistory;
    console.log(`[VIS][TradingLoop] analyze symbol=${symbol} route=${symCtx ? 'symbolContext' : 'global'} marketSymbol=${this.ctx.marketData?.symbol || '(missing)'} priceHistory=${priceHistory.length} broker=${this.ctx.config?.brokerId || '(missing)'} assetClass=${this.ctx.config?.assetClass || '(missing)'}`);
    if (symCtx && !this._firstAnalyzedSymbols) this._firstAnalyzedSymbols = new Set();
    if (symCtx && !this._firstAnalyzedSymbols.has(symbol)) {
      console.log(`[BOOT][TradingLoop] first analysis cycle for ${symbol} via symCtx path`);
      this._firstAnalyzedSymbols.add(symbol);
    }

    const { price } = this.ctx.marketData;

    // ─── WARMUP CHECK ───
    if (priceHistory.length < 15) return;

    // ─── GATHER DATA ───
    const { indicators, patterns, regime, tpoResult, fibLevels, nearestFibLevel, nearestStructure } = this._gatherData(price, symCtx);

    // ─── RUN ORCHESTRATOR ───
    const orchResult = this.ctx.strategyOrchestrator.evaluate(
      indicators, patterns, regime, priceHistory,
      {
        // CC-C Multi-Symbol Commit 4/6: prefer per-symbol signal outputs when
        // available (populated by CandleProcessor commit 3 onto symCtx). Fall
        // back to the legacy global runner / ctx refs for single-symbol mode.
        emaCrossoverSignal: symCtx?.emaCrossoverSignal ?? this.ctx.runner?.emaCrossoverSignal ?? this.ctx.emaCrossoverSignal,
        maDynamicSRSignal: symCtx?.maDynamicSRSignal ?? this.ctx.runner?.maDynamicSRSignal ?? this.ctx.maDynamicSRSignal,
        // 2026-05-04: breakRetestSignal removed — orchestrator now owns BreakAndRetest instance directly.
        liquiditySweepSignal: this.ctx.runner?.liquiditySweepSignal || this.ctx.liquiditySweepSignal,
        mtfAdapter: this.ctx.runner?.mtfAdapter || this.ctx.mtfAdapter,
        tpoResult,
        price,
        fibLevels,
        nearestFibLevel,
        volumeProfile: symCtx?.volumeProfile ?? this.ctx.runner?.volumeProfile ?? this.ctx.volumeProfile,
        // HIGH-16: pass timeframe so orchestrator can validate + scale SL/TP
        // per timeframe instead of falling back to '15m' silently.
        timeframe: this.ctx.candleTimeframe,
      }
    );

    const tradingDirection = orchResult.direction; // 'buy', 'sell', or 'hold'
    // HIGH-25: throw on non-finite orchestrator confidence. `undefined/100` and
    // `NaN/100` both produce NaN; `NaN < minConfidence` is false, so all entries
    // would silently block with no alert. Post-CRIT-09/CRIT-10 the orchestrator
    // always emits confidence — this throw catches future regressions visibly.
    // Caught by runner at run-empire-v2.js:1466-1471 (logs and skips tick).
    if (!Number.isFinite(orchResult.confidence)) {
      throw new Error(`[HIGH-25] orchResult.confidence non-finite (got ${orchResult.confidence}) — investigate StrategyOrchestrator output`);
    }
    if (orchResult.confidence < 0 || orchResult.confidence > 100) {
      throw new Error(`[HIGH-25] orchResult.confidence out of range 0..100 (got ${orchResult.confidence}) — investigate StrategyOrchestrator output`);
    }
    const confidence = orchResult.confidence / 100;
    const confidenceData = { totalConfidence: orchResult.confidence };

    // ─── DIRECTION FILTER (configurable, not hardcoded) ───
    // HIGH-13: throw if directionFilter is non-string. TradingConfig.js:844
    // supplies 'both' as the env-default for DIRECTION_FILTER so this throw
    // catches genuine config breakage, not unset env. Refuses to default to
    // 'both' at the consumer per Rule #1.
    const directionFilter = TradingConfig.get('pipeline.directionFilter');
    if (typeof directionFilter !== 'string') {
      throw new Error(`[HIGH-13] pipeline.directionFilter expected string, got ${typeof directionFilter} (${directionFilter})`);
    }
    if (directionFilter === 'long_only' && tradingDirection === 'sell') {
      console.log(`🚫 Direction filter: long_only — sell blocked`);
      this._broadcastAndReturn(price, indicators, patterns, regime, orchResult, confidenceData);
      return;
    }
    if (directionFilter === 'short_only' && tradingDirection === 'buy') {
      console.log(`🚫 Direction filter: short_only — buy blocked`);
      this._broadcastAndReturn(price, indicators, patterns, regime, orchResult, confidenceData);
      return;
    }

    // ─── TRAI (async observer, non-blocking) ───
    this._runTRAI(tradingDirection, orchResult, indicators, patterns, regime, price);

    // ─── LOG ───
    const cleanPrice = Math.round(price).toLocaleString();
    console.log(`\n📊 $${cleanPrice} | Conf: ${orchResult.confidence.toFixed(0)}% | RSI: ${Math.round(indicators.rsi)} | ${indicators.trend} | ${regime.currentRegime || 'analyzing'}`);
    console.log(`🔍 PRE-DECISION: direction=${tradingDirection}, conf=${orchResult.confidence.toFixed(1)}%`);

    // ─── TPO OVERRIDE ───
    let overrideSignal = null;
    let signalSource = null;
    let finalDirection = tradingDirection;

    if (tpoResult?.signal?.highProbability) {
      if (tpoResult.signal.strength > TradingConfig.get('confidence.tpoStrengthMin')) {
        overrideSignal = tpoResult.signal;
        signalSource = 'TPO';
        finalDirection = tpoResult.signal.action === 'BUY' ? 'buy' : 'sell';
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // DECISION ENGINE — Direction agnostic
    // Step 1: Check exits on ALL active positions
    // Step 2: Check if a new entry is valid
    // Step 3: Execute whatever decision was made
    // ═══════════════════════════════════════════════════════════════

    // CC-C Commit 5/6: symbol is REQUIRED at this layer (entry-checked
    // above). The prior `?? this.ctx.tradingPair` dispatch resolver was
    // ripped per Mercury Pass 3 finding G — under multi-broker arbitrage
    // a missing-symbol fallback to ctx.tradingPair could exit-check the
    // wrong leg, leaving the other broker's positions unchecked (single-
    // leg liquidation, real-money risk). All callers (runner.analyzeAndTrade,
    // run15mTradingCycle, the interval cycle, BacktestRunner) now pass
    // symbol explicitly.
    const activeTrades = stateManager.getTradesBySymbol(symbol)
      .filter(t => t.action === 'BUY' || t.action === 'SELL_SHORT');
    const maxPositions = TradingConfig.get('positionSizing.maxPositions') ?? 3;
    const minConfidence = this.ctx.config.minTradeConfidence;

    let decision = { action: 'HOLD', confidence: orchResult.confidence };

    // ─── STEP 1: EXIT CHECK ───
    // Check each active position for exit conditions
    // This is INDEPENDENT of entry signals
    const currentPosition = stateManager.get('position');
    // FIX 2026-03-29: Use activeTrades.length only - net position=0 when long+short cancel out
    const hasOpenPosition = activeTrades.length > 0;
    if (hasOpenPosition) {
      // CRIT-08-followup-C: refuse $10K phantom default in exit-check context.
      // The prior chain `?? 10000` would silently pass $10K to
      // exitContractManager.checkExitConditions if both backtestRecorder
      // and stateManager initialBalance were missing — masking a setup
      // bug while exit calculations ran against phantom capital. Pre-money
      // fail-loud, hoisted out of the for-loop (same value per iteration).
      const _initialBalance = this.ctx.backtestRecorder?.startingBalance ?? stateManager.get('initialBalance');
      if (!Number.isFinite(_initialBalance) || _initialBalance <= 0) {
        throw new Error(`TradingLoop exit-check: initialBalance unavailable from backtestRecorder.startingBalance and stateManager.get('initialBalance') (got ${_initialBalance}) — refusing $10K phantom default`);
      }
      for (const activeTrade of activeTrades) {
      exitContractManager.updateMaxProfit(activeTrade, price);

      const exitCheck = exitContractManager.checkExitConditions(activeTrade, price, {
        indicators,
        currentTime: this.ctx.marketData?.timestamp ?? Date.now(),
        // FIX 2026-04-09: Use getEquity() for live mode to get true account value
        accountBalance: this.ctx.backtestRecorder?.balance ?? stateManager.getEquity(price),
        initialBalance: _initialBalance,
        currentPosition: stateManager.get('position'),
        currentPrice: price
      });

      if (exitCheck.shouldExit) {
        console.log(`[EXIT-CONTRACT] ${exitCheck.details}`);
        // Determine correct exit action based on what we're closing
        const isClosingShort = activeTrade.direction === 'short' || activeTrade.action === 'SELL_SHORT';
        // MED-01: throw on missing exitReason. All exit checkers
        // (TakeProfitChecker/StopLossChecker/MaxHoldChecker/etc.) MUST emit
        // a specific reason. Halt-class — refuses to silently attribute the
        // exit as 'signal' when the source contract is broken.
        if (exitCheck.shouldExit && !exitCheck.exitReason) {
          throw new Error('[MED-01] exitCheck.shouldExit=true but exitCheck.exitReason missing — exit-checker contract violation');
        }
        decision = {
          action: isClosingShort ? 'COVER' : 'SELL',
          direction: 'close',
          confidence: exitCheck.confidence || 100,
          exitReason: exitCheck.exitReason,
          tradeId: activeTrade.id
        };
        break; // Exit one position per candle
      }

      // MaxProfitManager check — per-trade instance from Map
      const mpm = this.ctx.maxProfitManagers?.get(activeTrade.id);
      if (mpm?.state?.active) {
        const recentCandles = priceHistory.slice(-20);
        // HIGH-02: was `volatility: indicators.volatility || 0` — masked
        // missing volatility as 0, causing MaxProfitManager.updateTrailingStop
        // to compute zero-volatility ATR adjustments (tight trailing fires
        // immediately on minor noise). Now: preserve explicit zero with `??`,
        // log when truly missing so the silent-bypass is observable.
        if (!Number.isFinite(indicators.volatility)) {
          console.warn('[HIGH-02] indicators.volatility missing/non-finite — passing null to MaxProfitManager.update; dynamic trailing update will be skipped unless ATR is present');
        }
        const profitResult = mpm.update(price, {
          volatility: indicators.volatility ?? null,
          trend: indicators.trend || 'sideways',
          volume: this.ctx.marketData?.volume || 0,
          atr: indicators.atr,
          rsi: indicators.rsi,
          candle: priceHistory[priceHistory.length - 1],
          recentCandles,
          nearestStructure
        });

        if (profitResult && (profitResult.action === 'exit_full' || profitResult.action === 'exit_partial')) {
          const isClosingShort = activeTrade.direction === 'short' || activeTrade.action === 'SELL_SHORT';
          decision = {
            action: isClosingShort ? 'COVER' : 'SELL',
            direction: 'close',
            confidence: orchResult.confidence,
            exitSize: profitResult.exitSize,
            exitFraction: profitResult.exitFraction,
            exitReason: profitResult.reason,
            tradeId: activeTrade.id
          };
          break;
        }
      }
      } // end for (const activeTrade of activeTrades)
    } // end if (hasOpenPosition)

    // ─── STEP 2: ENTRY CHECK ───
    // Only if no exit was triggered AND we have a directional signal
    if (decision.action === 'HOLD' && finalDirection !== 'hold' && confidence >= minConfidence) {
      const globalHaltReason = stateManager.isHalted() ? stateManager.getHaltReason() : null;
      const symbolHaltReason = stateManager.isSymbolHalted(symbol) ? stateManager.getSymbolHaltReason(symbol) : null;

      // Same-direction stacking check
      const hasPositionInDirection = activeTrades.some(t => {
        if (finalDirection === 'buy') return t.direction === 'long' || t.action === 'BUY';
        if (finalDirection === 'sell') return t.direction === 'short' || t.action === 'SELL_SHORT';
        return false;
      });

      // FIX 2026-03-29: Opposite direction = close existing + open new (PineScript behavior)
      // On same ticker, don't hedge - flip the position instead
      const hasOppositePosition = activeTrades.some(t => {
        if (finalDirection === 'buy') return t.direction === 'short' || t.action === 'SELL_SHORT';
        if (finalDirection === 'sell') return t.direction === 'long' || t.action === 'BUY';
        return false;
      });

      if (globalHaltReason) {
        console.error(`[ENTRY] Blocked: new entries halted globally - ${globalHaltReason}`);
        decision = { action: 'HOLD', confidence: orchResult.confidence, blockReason: globalHaltReason };
      } else if (symbolHaltReason) {
        console.error(`[ENTRY] Blocked: ${symbol} entries halted - ${symbolHaltReason}`);
        decision = { action: 'HOLD', confidence: orchResult.confidence, blockReason: symbolHaltReason };
      } else if (hasPositionInDirection) {
        console.log(`[ENTRY] Blocked: already holding ${finalDirection === 'buy' ? 'long' : 'short'} position`);
      } else if (hasOppositePosition) {
        // Close opposite position first, then open new in next candle
        // This mimics PineScript's strategy.entry which replaces positions
        const oppositeTrade = activeTrades.find(t => {
          if (finalDirection === 'buy') return t.direction === 'short' || t.action === 'SELL_SHORT';
          if (finalDirection === 'sell') return t.direction === 'long' || t.action === 'BUY';
          return false;
        });
        if (oppositeTrade) {
          const isClosingShort = oppositeTrade.direction === 'short' || oppositeTrade.action === 'SELL_SHORT';
          console.log(`[FLIP] Closing ${isClosingShort ? 'short' : 'long'} to flip to ${finalDirection}`);
          decision = {
            action: isClosingShort ? 'COVER' : 'SELL',
            direction: 'close',
            confidence: confidence,
            exitReason: 'flip_position',
            tradeId: oppositeTrade.id
          };
          // Note: New position opens on next signal after close completes
        }
      } else if (activeTrades.length >= maxPositions) {
        console.log(`[ENTRY] Blocked: at max positions (${activeTrades.length}/${maxPositions})`);
      } else {
        // ─── RISK CHECK ───
        decision = this._checkRiskAndBuildDecision(finalDirection, orchResult, minConfidence, confidence);
        // CC-A Change 2: stamp indicator state at entry on the decision so
        // BacktestRecorder Change 1 (record.atrAtEntry / regimeAtEntry /
        // rsiAtEntry) gets real values instead of null. Read-only — no new
        // computation; just copying already-computed indicator readings.
        if (decision && decision.action !== 'HOLD') {
          decision.atrAtEntry = indicators?.atr ?? null;
          decision.regimeAtEntry = regime?.currentRegime ?? null;
          decision.rsiAtEntry = indicators?.rsi ?? null;
        }
      }
    }

    // ─── ATTACH OVERRIDE LEVELS ───
    if (overrideSignal && decision.action !== 'HOLD') {
      decision.signalSource = signalSource;
      decision.overrideSignal = overrideSignal;
      if (overrideSignal.levels) {
        decision.suggestedStopLoss = overrideSignal.levels.stopLoss || overrideSignal.stop;
        decision.suggestedTakeProfit = overrideSignal.levels.takeProfit || overrideSignal.target1;
      } else if (overrideSignal.stop && overrideSignal.target1) {
        decision.suggestedStopLoss = overrideSignal.stop;
        decision.suggestedTakeProfit = overrideSignal.target1;
      }
    }

    // ─── STORE STATE ───
    this.ctx.lastConfidence = confidenceData.totalConfidence;
    this.ctx.lastDirection = finalDirection;

    // ─── BROADCAST ───
    this._broadcastDecision(price, indicators, patterns, regime, orchResult, decision, confidenceData, minConfidence);

    // ─── EXECUTE ───
    if (decision.action !== 'HOLD') {
      // L5: Capture risk gates that were checked during entry evaluation.
      // Pre-trade gates built here (warmup, min_confidence, direction_filter, same_direction_block,
      // max_positions). RiskManager contributes its own gates (drawdown_circuit, daily/weekly/monthly
      // loss limits, recovery min_confidence) via decision.riskGates — appended below.
      const riskGates = [
        { gate: 'warmup', threshold: 15, value: priceHistory.length, passed: priceHistory.length >= 15 },
        { gate: 'min_confidence', threshold: minConfidence, value: confidence, passed: confidence >= minConfidence },
        { gate: 'direction_filter', threshold: null, value: finalDirection, passed: !(directionFilter === 'long_only' && finalDirection === 'sell') && !(directionFilter === 'short_only' && finalDirection === 'buy') },
        { gate: 'same_direction_block', threshold: null, value: finalDirection, passed: !activeTrades.some(t => (finalDirection === 'buy' && (t.direction === 'long' || t.action === 'BUY')) || (finalDirection === 'sell' && (t.direction === 'short' || t.action === 'SELL_SHORT'))) },
        { gate: 'max_positions', threshold: maxPositions, value: activeTrades.length, passed: activeTrades.length < maxPositions },
        ...(decision.riskGates || []),
      ];

      // L1+L2: Attach full ledger data to decision for StateManager.openPosition
      const allResults = orchResult.allResults || [];
      const winnerName = orchResult.winnerStrategy || null;
      decision.ledgerData = {
        candleTimestamp: this.ctx.marketData.timestamp || Date.now(),
        symbol,
        brokerId: this.ctx.config?.brokerId || null,
        assetClass: this.ctx.config?.assetClass || null,
        timeframe: this.ctx.config?.timeframe || '15m',
        executionMode: this.ctx.config?.enableBacktestMode ? 'backtest' : (this.ctx.config?.executionMode || 'paper'),
        // L2: every strategy that fired — winner AND losers with indicator values
        strategySignals: allResults.map(s => ({
          name: s.strategyName || s.name || 'unknown',
          direction: s.direction === 'buy' ? 'long' : s.direction === 'sell' ? 'short' : 'hold',
          baseConfidence: (s.confidence || 0),
          reason: s.reason || s.reasons?.join('; ') || 'signal fired',
          indicatorValues: {
            rsi: indicators.rsi,
            ema20: indicators.ema20,
            ema50: indicators.ema50,
            atr: indicators.atr,
            trend: indicators.trend,
          },
        })),
        // L2: orchestrator decision with competing strategies
        // HIGH-05: ledger honesty — `|| 0` masked legitimate zero-confidence
        // signals (HOLD path emits 0). Use `??` to preserve zero in ledger
        // attribution. HIGH-25's warn at :92 already surfaces non-finite.
        orchestratorDecision: {
          winnerStrategy: winnerName,
          finalConfidence: (orchResult.confidence ?? 0) / 100,
          reason: allResults.length > 1
            ? `${winnerName} (${(orchResult.confidence ?? 0).toFixed(1)}%) selected over ${allResults.length - 1} alternatives`
            : `${winnerName} selected at ${(orchResult.confidence ?? 0).toFixed(1)}%`,
          competingStrategies: allResults.map(r => ({
            name: r.strategyName || r.name || 'unknown',
            adjustedConfidence: (r.confidence || 0),
            rejected: (r.strategyName || r.name) !== winnerName,
            rejectReason: (r.strategyName || r.name) !== winnerName ? 'Lower confidence than winner' : null,
          })),
        },
        confluence: orchResult.confluence ? {
          // HIGH-17: ledger honesty for confluence count. Zero strategies
          // agreeing IS meaningful info; `|| 1` lied it as one. Use `??`
          // mirroring CRIT-07-followup semantics for sizingMultiplier.
          count: orchResult.confluence.count ?? 1,
          agreeingStrategies: orchResult.confluence.strategies || [],
          // CRIT-07-followup: mirror OrderExecutor's `??` semantics on the
          // ledger side. With `||` an actual sizingMultiplier of 0 would
          // be silently logged as 1.0 — diverging from the (correctly
          // CRIT-07-preserved) zero used by the actual sizing math at
          // OrderExecutor.js:274 (BUY) and :428 (SHORT).
          sizingMultiplier: orchResult.sizingMultiplier ?? 1.0,
          reason: `${orchResult.confluence.count ?? 1} strategies agree on ${orchResult.direction}`,
        } : { count: 1, sizingMultiplier: 1.0 },
        exitContract: orchResult.exitContract || null,
        // L5: risk gates checked before entry
        riskGates,
      };
      await this.ctx.executeTrade(decision, confidenceData, price, indicators, patterns, null, orchResult, symbol);
    }
  }

  /**
   * Risk check + build decision — SAME LOGIC for buy and sell.
   * The ONLY difference is the action string and direction label.
   */
  _checkRiskAndBuildDecision(direction, orchResult, minConfidence, confidence) {
    // Map direction to action/label
    const actionMap = {
      buy:  { action: 'BUY',        direction: 'long'  },
      sell: { action: 'SELL_SHORT',  direction: 'short' }
    };
    const mapped = actionMap[direction];
    if (!mapped) return { action: 'HOLD', confidence: 0 };

    if (this.ctx.riskManager) {
      // L5 observability: collect riskGates arrays from both RiskManager calls.
      // Each call returns its own array of {gate, threshold, value, passed, rejectReason}.
      // Concatenated and surfaced to caller so StateManager can attach to the trade ledger.
      const riskCheck = this.ctx.riskManager.isTradingAllowed();
      const riskGates = [...(riskCheck.riskGates || [])];
      if (!riskCheck.allowed) {
        console.log(`🛑 RISK BLOCK: ${riskCheck.reason} — ${mapped.direction} rejected`);
        return { action: 'HOLD', confidence: 0, blockReason: riskCheck.reason, riskGates };
      }

      const riskAssessment = this.ctx.riskManager.assessTradeRisk({
        confidence,
        direction
      });
      riskGates.push(...(riskAssessment.riskGates || []));

      if (!riskAssessment.approved) {
        console.log(`🛑 RISK BLOCK: ${riskAssessment.reason} — ${mapped.direction} rejected`);
        return { action: 'HOLD', confidence: 0, blockReason: riskAssessment.reason, riskGates };
      }

      console.log(`✅ ${mapped.action} DECISION: Confidence ${orchResult.confidence.toFixed(1)}% >= ${(minConfidence * 100).toFixed(0)}% | Direction: ${mapped.direction}`);
      if (riskAssessment.riskLevel !== 'LOW') {
        console.log(`   ⚠️ Risk level: ${riskAssessment.riskLevel} — ${riskAssessment.recommendation}`);
      }

      return {
        action: mapped.action,
        direction: mapped.direction,
        confidence: orchResult.confidence,
        riskLevel: riskAssessment.riskLevel,
        riskRecommendation: riskAssessment.recommendation,
        riskGates,
      };
    }

    // Fallback if no riskManager
    console.log(`✅ ${mapped.action} DECISION: Confidence ${orchResult.confidence.toFixed(1)}% >= ${(minConfidence * 100).toFixed(0)}% | Direction: ${mapped.direction}`);
    return {
      action: mapped.action,
      direction: mapped.direction,
      confidence: orchResult.confidence
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // DATA GATHERING — unchanged from original, just extracted
  // ═══════════════════════════════════════════════════════════════

  _gatherData(price, symCtx = null) {
    // CC-C Multi-Symbol Commit 4/6: same per-symbol shadowing pattern as
    // _analyze. When symCtx is passed, route data-gathering reads through it;
    // otherwise fall back to this.ctx.* for single-symbol legacy callers.
    const priceHistory       = symCtx?.priceHistory       ?? this.ctx.priceHistory;
    const indicatorEngine    = symCtx?.indicatorEngine    ?? this.ctx.indicatorEngine;
    const fibonacciDetector  = symCtx?.fibonacciDetector  ?? this.ctx.fibonacciDetector;

    // Indicators
    const dtoState = indicatorEngine.getSnapshot();
    const indicators = dtoState.indicators;
    indicators.ema12 = indicators.ema9 ?? null;
    indicators.ema26 = indicators.ema21 ?? null;
    indicators.volatility = indicators.atr ?? null;
    indicators.bbWidth = indicators.bb?.bandwidth ?? null;
    indicators.bollingerBands = indicators.bb;
    indicators.trend = indicators.superTrendDirection ?? null;

    // Patterns
    const memoryPatterns = this.ctx.patternChecker.analyzePatterns({
      candles: priceHistory,
      trend: indicators.trend,
      macd: indicators.macd?.macd ?? indicators.macd?.macdLine ?? null,
      macdSignal: indicators.macd?.signal ?? indicators.macd?.signalLine ?? null,
      rsi: indicators.rsi,
      volume: this.ctx.marketData.volume ?? null
    });
    // 2026-05-04: Re-enabled per Wolf strategy-resurrection spec.
    // Original disable (2026-03-20 ceb0ffb) cited 2000+ garbage entries in
    // pattern_performance — root cause was unbounded JSON-of-features signature
    // keying, fixed in EnhancedPatternRecognition._signatureFromFeatures().
    // Re-enable safe with quantized signatures + 70% conf filter below.
    const rawCandlePatterns = candlePatternDetector.detect(priceHistory, {
      rsi: indicators.rsi,
      trend: indicators.trend,
      macd: indicators.macd?.macd ?? null,
      volume: this.ctx.marketData?.volume ?? null
    });
    const minPatternConf = TradingConfig.get('confidence.candlePatternMinConfidence') || 0.70;
    const candlePatterns = rawCandlePatterns.filter(p => (p.confidence || 0) >= minPatternConf);
    const patterns = [...candlePatterns, ...memoryPatterns];

    // Record patterns for learning (skip in fast backtest)
    if (patterns.length > 0 && !this.ctx.backtestFast) {
      const telemetry = require('./Telemetry').getTelemetry();
      patterns.forEach(pattern => {
        // MED-08: skip telemetry record for nameless patterns instead of
        // collapsing them all into 'unknown_pattern' bucket. Detector contract
        // requires .signature OR .name; refuse to bucket-hash without either.
        const signature = pattern.signature || pattern.name;
        if (!signature) {
          return;
        }
        if (!Array.isArray(pattern.features)) {
          pattern.features = FeatureExtractor.extractArray({ indicators, candles: priceHistory });
        }
        telemetry.event('pattern_detected', { signature, confidence: pattern.confidence, price });
      });
    }
    this.ctx.broadcastPatternAnalysis(patterns, indicators);

    // Regime
    const _regimeDetector = new RegimeDetector();
    const regimeResult = _regimeDetector.detect(indicators, priceHistory);
    // MED-09: trust RegimeDetector's contract — every return path
    // (RegimeDetector.js:65, 91, 231, 239, 247, 254) supplies a .regime field.
    // Soft-warn + || 'unknown' fallback was dead defense. Throw if the
    // contract is genuinely broken instead of silently masking.
    if (!regimeResult.regime) {
      throw new Error(`[MED-09] RegimeDetector.detect returned no .regime field — detector contract violation`);
    }
    const regime = {
      currentRegime: regimeResult.regime,
      confidence: regimeResult.confidence,
      parameters: regimeResult.details || {}
    };
    this.ctx.marketRegime = regime;

    // Fibonacci
    let fibLevels = null;
    let nearestFibLevel = null;
    if (fibonacciDetector && priceHistory.length >= 30) {
      fibLevels = fibonacciDetector.update(priceHistory);
      if (fibLevels) nearestFibLevel = fibonacciDetector.getNearestLevel(price);
    }

    const rawIndicatorState = typeof indicatorEngine.getRawState === 'function'
      ? indicatorEngine.getRawState()
      : null;
    const nearestStructure = this._nearestStructure(price, nearestFibLevel, rawIndicatorState?.sr);

    // TPO
    let tpoResult = null;
    if (this.ctx.ogzTpo && priceHistory.length > 0) {
      const latestCandle = priceHistory[priceHistory.length - 1];
      tpoResult = this.ctx.ogzTpo.update({
        o: _o(latestCandle), h: _h(latestCandle), l: _l(latestCandle), c: _c(latestCandle),
        t: latestCandle.time || Date.now()
      });
      if (tpoResult?.signal) {
        console.log(`\n🎯 OGZ TPO Signal: ${tpoResult.signal.action} (${tpoResult.signal.zone}) | Strength: ${(tpoResult.signal.strength * 100).toFixed(2)}%`);
      }
    }

    return { indicators, patterns, regime, tpoResult, fibLevels, nearestFibLevel, nearestStructure };
  }

  _nearestStructure(price, nearestFibLevel = null, sr = null) {
    if (!Number.isFinite(price) || price <= 0) return null;

    const candidates = [];
    if (nearestFibLevel && Number.isFinite(nearestFibLevel.price) && Number.isFinite(nearestFibLevel.distance)) {
      candidates.push({
        type: 'fibonacci',
        level: nearestFibLevel.level,
        price: nearestFibLevel.price,
        distance: nearestFibLevel.distance,
        isGoldenZone: nearestFibLevel.isGoldenZone
      });
    }

    const addLevels = (levels, type) => {
      if (!Array.isArray(levels)) return;
      for (const levelPrice of levels) {
        if (!Number.isFinite(levelPrice) || levelPrice <= 0) continue;
        candidates.push({
          type,
          price: levelPrice,
          distance: Math.abs(price - levelPrice) / price * 100
        });
      }
    };

    addLevels(sr?.supports, 'support');
    addLevels(sr?.resistances, 'resistance');

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0];
  }

  // ═══════════════════════════════════════════════════════════════
  // TRAI — async observer, non-blocking
  // ═══════════════════════════════════════════════════════════════

  _runTRAI(direction, orchResult, indicators, patterns, regime, price) {
    const skipTRAI = this.ctx.config.enableBacktestMode && !this.ctx.traiEnableBacktest;
    if (!this.ctx.trai || skipTRAI) return;

    try {
      this.ctx.trai.processDecision(
        { action: direction.toUpperCase(), confidence: orchResult.confidence, patterns, indicators, price, timestamp: Date.now() },
        { volatility: indicators.volatility, trend: indicators.trend, volume: this.ctx.marketData.volume || 'normal', regime: regime.currentRegime || 'unknown', indicators, positionSize: stateManager.get('balance') * TradingConfig.get('positionSizing.basePositionSize'), currentPosition: stateManager.get('position') }
      ).then(d => { if (d?.id) this.ctx._lastTraiDecision = d; })
       .catch(err => console.warn('⚠️ [TRAI] Error:', err.message));
    } catch (e) {
      console.error('⚠️ TRAI error:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // DASHBOARD BROADCAST
  // ═══════════════════════════════════════════════════════════════

  _broadcastAndReturn(price, indicators, patterns, regime, orchResult, confidenceData) {
    this._broadcastDecision(price, indicators, patterns, regime, orchResult, { action: 'HOLD' }, confidenceData, 0);
  }

  _broadcastDecision(price, indicators, patterns, regime, orchResult, decision, confidenceData, minConfidence) {
    // Signal analysis broadcast
    if (this.ctx.dashboardWs && this.ctx.dashboardWs.readyState === 1) {
      try {
        const signals = orchResult?.signalBreakdown?.signals || [];
        this.ctx.dashboardWs.send(JSON.stringify({
          type: 'signal_analysis',
          timestamp: Date.now(),
          signal: {
            direction: orchResult.direction,
            confidence: orchResult.confidence,
            reasons: orchResult.reasons || [],
            meta: { signalsFired: signals.length, bullishCount: signals.filter(s => s.direction === 'buy').length, bearishCount: signals.filter(s => s.direction === 'sell').length },
            signals
          },
          modules: {
            orchestrator: orchResult ? { winner: orchResult.winnerStrategy, direction: orchResult.direction, confidence: orchResult.confidence, confluence: orchResult.confluence, sizingMultiplier: orchResult.sizingMultiplier } : null,
            regime: { regime: regime?.currentRegime || 'unknown', confidence: regime?.confidence || 0 }
          }
        }));
      } catch (e) { /* fail silently */ }
    }

    // Chain-of-thought broadcast + Strategy Winner HUD
    if (this.ctx.dashboardWsConnected && this.ctx.dashboardWs) {
      try {
        const reasoning = decision.action === 'HOLD'
          ? `Waiting: Confidence ${decision.confidence?.toFixed(1) || 0}% < ${minConfidence}% minimum`
          : `${decision.action}: Confidence ${decision.confidence?.toFixed(1)}% | ${orchResult.winnerStrategy || 'signal'}`;
        this.ctx.dashboardWs.send(JSON.stringify({
          type: 'bot_thinking',
          timestamp: Date.now(),
          message: reasoning,
          confidence: decision.confidence,
          data: { reasoning, price, regime: regime?.currentRegime || 'unknown', module: orchResult.winnerStrategy || 'orchestrator' },
          // Strategy Winner HUD: full battleground for confidence bar chart.
          // Show ALL configured strategies (zero-confidence placeholders for
          // non-firing) so the heatbar reflects the complete roster, not
          // only what produced a signal this cycle. Public `name` is
          // anonymized via TradeNarrator.labelFor() (Strategy-A/B/C);
          // `realName` is kept on the wire for internal tooling.
          strategy_stack: (() => {
            const orch = this.ctx.strategyOrchestrator;
            if (!orch || !Array.isArray(orch.strategies)) return undefined;
            const narrator = getNarrator();
            const labelOf = narrator && typeof narrator.labelFor === 'function'
              ? n => narrator.labelFor(n)
              : n => n;
            const firing = new Map((orchResult.allResults || []).map(r => [r.strategyName, r]));
            return orch.strategies
              .map(s => {
                const fired = firing.get(s.name);
                return {
                  id: s.name,
                  realName: s.name,
                  name: labelOf(s.name),
                  confidence: fired ? fired.confidence : 0,
                  direction: fired ? (fired.direction || 'hold') : 'hold'
                };
              })
              .sort((a, b) => b.confidence - a.confidence);
          })(),
          winner_id: orchResult.winnerStrategy || null
        }));
      } catch (e) { /* fail silently */ }

      // Golden Setup Emitter: proximity score + confluence matrix
      try {
        const conditions = [
          { label: 'RSI Oversold/Overbought', status: (indicators.rsi < 30 || indicators.rsi > 70) ? 'MET' : 'WAITING', weight: 0.2 },
          { label: 'EMA Trend Alignment', status: (indicators.ema20 > indicators.ema50) ? 'MET' : 'WAITING', weight: 0.2 },
          { label: 'Strategy Confluence', status: (orchResult.confluence?.count >= 2) ? 'MET' : 'WAITING', weight: 0.2 },
          { label: 'High Confidence', status: (orchResult.confidence >= 65) ? 'MET' : 'WAITING', weight: 0.2 },
          { label: 'Regime Favorable', status: (regime?.currentRegime === 'trending_up' || regime?.currentRegime === 'trending_down') ? 'MET' : 'WAITING', weight: 0.2 }
        ];
        const proximity = conditions.reduce((acc, c) => acc + (c.status === 'MET' ? c.weight : 0), 0);
        this.ctx.dashboardWs.send(JSON.stringify({
          type: 'golden_setup_state',
          proximity,
          is_golden: proximity >= 0.8,
          conditions,
          timestamp: Date.now()
        }));
      } catch (e) { /* fail silently */ }
    }
  }
}

module.exports = TradingLoop;
