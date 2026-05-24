#!/usr/bin/env node

// CRITICAL: ConfigLoader MUST be first - loads .env, normalizes BACKTEST_MODE, isolates state
const { load: loadConfig } = require('./foundation/ConfigLoader');
const resolvedConfig = loadConfig({ silent: true }); // Silent here, verbose logging comes later

// BACKTEST_FAST: Skip notifications, file I/O during backtest (explicit opt-in)
const BACKTEST_FAST = resolvedConfig.config.backtest.fast;
// SILENT MODE: Disable logging during backtest for 100x speed boost
if (resolvedConfig.config.backtest.silent ||
    (resolvedConfig.config.mode.backtest && !resolvedConfig.config.backtest.verbose)) {
  const originalLog = console.log;
  let lastProgress = 0;
  console.log = (...args) => {
    // Only show critical output: COMPLETE, errors, final results
    const msg = args[0]?.toString() || '';
    if (msg.includes('TRADE-RECEIPT') ||
        msg.includes('[EVAL-TRACE]') ||
        msg.includes('[SMS-') ||
        msg.includes('[BOOT]') ||
        msg.includes('BACKTEST COMPLETE') ||
        msg.includes('PATTERN LEARNING') ||
        msg.includes('Final Balance') ||
        msg.includes('Total P&L') ||
        msg.includes('âŒ Error') ||
        msg.includes('Report saved')) {
      originalLog(...args);
    }
  };
}

// SENTRY: Error monitoring (DSN configurable via SENTRY_DSN, disable via SENTRY_ENABLED=false)
require('./instrument.js');

/**
 * @fileoverview OGZ PRIME V14 - Main Trading Bot Orchestrator
 *
 * This is the main entry point and orchestration layer for the OGZ Prime trading bot.
 * It coordinates all trading components: data ingestion, analysis, decision-making,
 * and execution.
 *
 * @description
 * ARCHITECTURE OVERVIEW:
 * ```
 * â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 * â”‚                         run-empire-v2.js (ORCHESTRATOR)                 â”‚
 * â”‚                                                                         â”‚
 * â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
 * â”‚  â”‚   KRAKEN    â”‚â”€â”€â”€â–¶â”‚  INDICATORS    â”‚â”€â”€â”€â–¶â”‚  PATTERN RECOGNITION     â”‚ â”‚
 * â”‚  â”‚  WEBSOCKET  â”‚    â”‚  (RSI,MACD,BB) â”‚    â”‚  (EnhancedPatternRecog)  â”‚ â”‚
 * â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
 * â”‚         â”‚                   â”‚                        â”‚                  â”‚
 * â”‚         â–¼                   â–¼                        â–¼                  â”‚
 * â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
 * â”‚  â”‚   REGIME    â”‚â—€â”€â”€â”€â”‚  TRADING BRAIN â”‚â—€â”€â”€â”€â”‚      TRAI (AI)           â”‚ â”‚
 * â”‚  â”‚  DETECTOR   â”‚    â”‚  (Decisions)   â”‚    â”‚  (Optional co-pilot)     â”‚ â”‚
 * â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
 * â”‚                            â”‚                                            â”‚
 * â”‚                            â–¼                                            â”‚
 * â”‚                     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                                  â”‚
 * â”‚                     â”‚  RISK MANAGER  â”‚                                  â”‚
 * â”‚                     â”‚  (Pre-trade)   â”‚                                  â”‚
 * â”‚                     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                  â”‚
 * â”‚                            â”‚                                            â”‚
 * â”‚                            â–¼                                            â”‚
 * â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
 * â”‚  â”‚   STATE     â”‚â—€â”€â”€â”€â”‚  EXECUTION     â”‚â”€â”€â”€â–¶â”‚  KRAKEN API              â”‚ â”‚
 * â”‚  â”‚  MANAGER    â”‚    â”‚  LAYER         â”‚    â”‚  (Paper or Live)         â”‚ â”‚
 * â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
 * â”‚         â”‚                                                               â”‚
 * â”‚         â–¼                                                               â”‚
 * â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                                                        â”‚
 * â”‚  â”‚  DASHBOARD  â”‚  (WebSocket to browser)                               â”‚
 * â”‚  â”‚  UPDATES    â”‚                                                        â”‚
 * â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                                        â”‚
 * â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
 * ```
 *
 * MAIN TRADING LOOP (processCandle):
 * 1. Receive OHLC candle from Kraken WebSocket
 * 2. Calculate indicators (RSI, MACD, Bollinger Bands, OGZ-TPO)
 * 3. Detect patterns (EnhancedPatternRecognition)
 * 4. Get TradingBrain decision (BUY/SELL/HOLD)
 * 5. Optional: Consult TRAI for AI guidance
 * 6. Manage existing position (trailing stops, exits)
 * 7. Execute new trades if conditions met
 * 8. Broadcast updates to dashboard
 *
 * KEY METHODS:
 * - processCandle(candle): Main trading loop entry point
 * - executeTrade(decision, ...): Executes BUY/SELL orders
 * - manageExistingPosition(price, ...): Handles exits/trailing stops
 * - handleMarketData(candle): Routes incoming market data
 *
 * STATE MANAGEMENT:
 * All position/balance state is centralized in StateManager (single source of truth).
 * Local caches in TradingBrain sync FROM StateManager before decisions.
 *
 * @module run-empire-v2
 * @version 14.0.0-FINAL-MERGED
 * @date 2025-11-20
 */

// ConfigLoader already loaded at line 4 (before Sentry)
const envPath = resolvedConfig.config.paths.envFile;
const { createTraceId, emitTrace } = require('./core/TraceSpine');


// Log resolved paths for debugging
console.log('[CHECKPOINT-001] Environment loaded via ConfigLoader');
console.log(`   Fingerprint: ${resolvedConfig.fingerprint}`);
console.log(`   ENV_FILE: ${envPath}`);
console.log(`   DATA_DIR: ${resolvedConfig.config.paths.dataDir || '(default: ./data)'}`);
console.log(`   PAPER_TRADING: ${resolvedConfig.config.mode.paperTrading}`);
console.log(`   TEST_MODE: ${resolvedConfig.config.mode.testMode || false}`);

// DEBUG: Log key config toggles to verify env vars are being read
if (resolvedConfig.config.mode.backtest) {
  console.log('[CONFIG VERIFY] Backtest mode - key toggle values:');
  console.log(`   ATR_FILTER_ENABLED: ${resolvedConfig.config.filters.atrEnabled}`);
  console.log(`   RISK_MANAGER_BYPASS: ${resolvedConfig.config.risk.riskManagerBypass}`);
  console.log(`   MIN_TRADE_CONFIDENCE: ${resolvedConfig.config.confidence.minTradeConfidence}`);
  console.log(`   ACCOUNT_DRAWDOWN_BYPASS: ${resolvedConfig.config.risk.accountDrawdownBypass}`);
}

// Load feature flags configuration via unified FeatureFlagManager
const FeatureFlagManager = require('./core/FeatureFlagManager');

// FIX 2026-02-16: Use centralized candle helper for format compatibility (backtest vs live)
const { c: _c, o: _o, h: _h, l: _l, v: _v } = require('./core/CandleHelper');

// PHASE 0: ContractValidator - validates data contracts at module boundaries
// Monitor mode: logs violations but doesn't throw (zero behavioral impact)
// See: ogz-meta/REFACTOR-PLAN-2026-02-27.md
const { ContractValidator } = require('./core/ContractValidator');
const contractValidator = ContractValidator.createMonitor();

// PHASE 1: CandleStore + IndicatorCalculator - pure data and math modules
// CandleStore: stores candles by symbol/timeframe (will replace this.priceHistory)
// IndicatorCalculator: stateless indicator calculations (pure math)
// See: ogz-meta/REFACTOR-PLAN-2026-02-27.md
const { CandleStore } = require('./core/CandleStore');
const { IndicatorCalculator } = require('./core/IndicatorCalculator');
const TRAIWebContext = require('./core/TRAIWebContext');
const patternDescriptions = require('./config/pattern-descriptions.json');

// FIX 2026-03-12: IndicatorSnapshot deleted - use IndicatorEngine.getSnapshot() directly
// TradingLoop now uses getSnapshot() which returns validated DTO format

// PHASE 3: CandleAggregator + RegimeDetector - pure functions
// CandleAggregator: builds higher timeframe candles from 1m candles
// RegimeDetector: detects market regime (trending/ranging/volatile)
// See: ogz-meta/REFACTOR-PLAN-2026-02-27.md
const { CandleAggregator } = require('./core/CandleAggregator');
const { RegimeDetector } = require('./core/RegimeDetector');
const { getInstance: getMarketCalendar } = require('./foundation/MarketCalendar');

// REFACTOR Phase 4: FeatureExtractor + PatternMemoryStore
const FeatureExtractor = require('./core/FeatureExtractor');
// CHANGE 2026-03-18: PatternMemoryStore deleted - replaced by UnifiedPatternMemory

// REFACTOR Phase 5: OrderRouter for multi-broker order routing
const OrderRouter = require('./core/OrderRouter');

// REFACTOR Phase 14: OrderExecutor - exact copy of executeTrade() extracted
const OrderExecutor = require('./core/OrderExecutor');
// CC-C: Webhook order adapter (TTP via SignalStack) — side-channel emitter
const WebhookOrderAdapter = require('./core/WebhookOrderAdapter');
// CC-C Multi-Symbol Commit 2/6: per-symbol trading context container
const { SymbolTradingContext } = require('./core/SymbolTradingContext');

// CRIT-12: DynamicPositionSizer machine-toggleable env gate.
// Validated baseline WITHOUT DPS: TSLA $970, QQQ $374.
// DPS curves dropped those to $101/$50 — DPS needs curve re-tuning before
// flipping the gate. Until then OrderExecutor uses the inline confidence
// multiplier path (core/OrderExecutor.js:71-77).
//
// To unlock DPS (after curve re-tune):
//   1. ENABLE_DPS=true in env (loads the module), AND
//   2. Wire DynamicPositionSizer into OrderExecutor's sizing path
//      (replace inline confidence multiplier with DPS.size()).
// Step 1 alone loads the module but does NOT change sizing behavior.
const ENABLE_DPS = process.env.ENABLE_DPS === 'true';
const DynamicPositionSizer = ENABLE_DPS ? require('./core/DynamicPositionSizer') : null;

// Phase 4 REWRITE: MaxProfitManager standalone (was inside deleted OptimizedTradingBrain)
const MaxProfitManager = require('./core/MaxProfitManager');

// REFACTOR Phase 15: TradingLoop - exact copy of analyzeAndTrade() extracted
const TradingLoop = require('./core/TradingLoop');

// SessionRouter — sequential dual-broker switching (gated SESSION_ROUTER_ENABLED)
const SessionRouter = require('./core/SessionRouter');

// REFACTOR Phase 17: DashboardBroadcaster - edge analytics broadcasting
const DashboardBroadcaster = require('./core/DashboardBroadcaster');

// REFACTOR Phase 18: BacktestRunner - backtest simulation logic
const BacktestRunner = require('./core/BacktestRunner');

// REFACTOR Phase 19: CandleProcessor - market data handling
const CandleProcessor = require('./core/CandleProcessor');

// REFACTOR Phase 20: WebSocketManager - dashboard WebSocket handling
const WebSocketManager = require('./core/WebSocketManager');

// REFACTOR Phase 21: ModuleInitializer - configuration and module factory helpers
const ModuleInitializer = require('./core/ModuleInitializer');

const flagManager = FeatureFlagManager.getInstance();

// Legacy compatibility: Keep featureFlags object for existing code
let featureFlags = {};
try {
  featureFlags = require('./config/features.json');
  console.log('[FEATURES] Loaded via FeatureFlagManager:', flagManager.getEnabledFeatures());
} catch (err) {
  console.log('[FEATURES] No feature flags config found, using defaults');
  featureFlags = { features: {}, environment: {} };
}

// Add uncaught exception handler to catch silent failures
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  console.error('Stack:', err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// CRITICAL: ModuleAutoLoader as single source of truth
console.log('[CHECKPOINT-002] Loading ModuleAutoLoader...');
const loader = require('./core/ModuleAutoLoader');
console.log('[CHECKPOINT-003] ModuleAutoLoader ready');

// Load all modules through loader
loader.loadAll();
console.log('[CHECKPOINT-004] All modules loaded');

// Phase 2 REWRITE: TradingOptimizations deleted - PatternStatsManager unused

// CHANGE 2025-12-11: StateManager - Single source of truth for position/balance
const { getInstance: getStateManager } = require('./core/StateManager');
const stateManager = getStateManager();

// FIX 2026-02-17: ExitContractManager - Strategy-owned exit conditions
const { getInstance: getExitContractManager } = require('./core/ExitContractManager');
const exitContractManager = getExitContractManager();

// CHANGE 2026-02-28: TradingConfig - Centralized trading parameters
const TradingConfig = require('./core/TradingConfig');
const EvalRuleEngine = require('./core/EvalRuleEngine');
const TtpCutoffEnforcer = require('./core/TtpCutoffEnforcer');

// CHANGE 2025-12-11: MessageQueue - Prevent WebSocket race conditions
const MessageQueue = require('./core/MessageQueue');

// CHANGE 2025-12-23: Empire V2 IndicatorEngine - Single source of truth for indicators
const IndicatorEngine = require('./core/indicators/IndicatorEngine');
const _indicatorEngineSymbol = resolvedConfig.config.broker.tradingPair;
if (!_indicatorEngineSymbol) {
  throw new Error('[RUN-HIGH-01] IndicatorEngine init requires resolvedConfig.config.broker.tradingPair — refusing to default to BTC-USD');
}
const indicatorEngine = new IndicatorEngine({
  symbol: _indicatorEngineSymbol,
  tf: '1m',
  ogzTpoEnabled: true
});

// CHANGE 2026-01-25: Trading Proof Logger for website transparency
const { TradingProofLogger } = require('./ogz-meta/claudito-logger');

// CHANGE 2026-01-31: Axios for TRAI web search capability
const axios = require('axios');

// CHANGE 2026-02-01: Telegram notifications for mobile alerts
const { telegramNotifier, notifyTrade, notifyTradeClose, notifyAlert } = require('./utils/telegramNotifier');

// CHANGE 2026-02-01: Discord notifications (was disconnected since v7)
// CHANGE 2026-02-02: Use singleton - was creating duplicate instances causing double messages
const discordNotifier = require('./utils/discordNotifier');

// CHANGE 2026-02-02: TradeIntelligenceEngine - intelligent per-trade decision tree
const TradeIntelligenceEngine = require('./core/TradeIntelligenceEngine');

// CHANGE 2026-02-10: Modular Entry System (V2 Kraken format: c/o/h/l/v/t)
const MultiTimeframeAdapter = require('./modules/MultiTimeframeAdapter');
const EMASMACrossoverSignal = require('./modules/EMASMACrossoverSignal');
const MADynamicSR = require('./modules/MADynamicSR');
const BreakAndRetest = require('./modules/BreakAndRetest');
const LiquiditySweepDetector = require('./modules/LiquiditySweepDetector');

// CHANGE 2026-02-10: Multi-Asset Manager for asset switching
const MultiAssetManager = require('./core/MultiAssetManager');

// CHANGE 2026-02-10: Trade Journal + Instant Replay
const { TradeJournalBridge } = require('./core/TradeJournalBridge');

// CHANGE 2026-02-16: Pipeline Snapshot for 30-min state capture
const PipelineSnapshot = require('./core/PipelineSnapshot');

// CHANGE 2026-02-23: Volume Profile (Fabio Valentino / Auction Market Theory)
// Only trend follow when OUT OF BALANCE (price outside value area)
const VolumeProfile = require('./core/VolumeProfile');

// CHANGE 2026-02-21: Isolated strategy entry pipeline (replaces soupy pooled confidence)
const { StrategyOrchestrator } = require('./core/StrategyOrchestrator');
const { AdaptiveTimeframeSelector } = require('./core/AdaptiveTimeframeSelector');

// PHASE 13A: Position management with immutability guarantees
const PnLCalculator = require('./core/PnLCalculator');
const PositionSizer = require('./core/PositionSizer');
const PositionTracker = require('./core/PositionTracker');

// CHANGE 2026-02-23: BacktestRecorder for proper trade tracking with fees
const BacktestRecorder = require('./core/BacktestRecorder');

// CRITICAL: SingletonLock to prevent multiple instances
console.log('[CHECKPOINT-005] Getting SingletonLock...');
const SingletonLock = loader.get('core', 'SingletonLock') || require('./core/SingletonLock');
const { OGZSingletonLock, checkCriticalPorts } = SingletonLock;
console.log('[CHECKPOINT-006] SingletonLock obtained');
const singletonLock = new OGZSingletonLock('ogz-prime-v14');

// Acquire lock (SingletonLock handles backtest skip logic internally)
singletonLock.acquireLock();
const WebSocket = require('ws');

// Core Trading Modules - All through ModuleAutoLoader
console.log('[CHECKPOINT-007] Loading core modules...');
const EnhancedPatternRecognition = loader.get('core', 'EnhancedPatternRecognition');
console.log('  EnhancedPatternRecognition:', !!EnhancedPatternRecognition);
const { EnhancedPatternChecker } = EnhancedPatternRecognition || {};

// Phase 2 REWRITE: OptimizedTradingBrain deleted - orchestrator replaced it

const RiskManager = loader.get('core', 'RiskManager');
console.log('  RiskManager:', !!RiskManager);
// Phase 3 REWRITE: EntryDecider deleted - logic inlined to TradingLoop
// REMOVED 2026-02-20: ExecutionRateLimiter was blocking 95% of trades in backtest
// const ExecutionRateLimiter = loader.get('core', 'ExecutionRateLimiter');
// Phase 2 REWRITE: AdvancedExecutionLayer deleted - OrderRouter+OrderExecutor replaced it
const PerformanceAnalyzer = loader.get('core', 'PerformanceAnalyzer');
// Phase 2 REWRITE: TradingProfileManager, GridTradingStrategy deleted

// Change 587: Wire SafetyNet and TradeLogger into live loop
// Both removed - SafetyNet too restrictive, TradeLogger doesn't exist
// const TradingSafetyNet = require('./core/TradingSafetyNet');
// CHANGE 2026-02-13: Re-enable TradeLogger for comprehensive trade logging
const { logTrade, getTodayStats } = require('./core/tradeLogger');

// AI Co-Founder (Change 574 - Opus Architecture + Codex Fix)
const TRAIDecisionModule = loader.get('core', 'TRAIDecisionModule');

// Infrastructure
// EMPIRE V2 ARCHITECTURE: Using BrokerFactory for proper abstraction
const { createBrokerAdapter } = require('./brokers/BrokerFactory');
const { normalizeOhlc } = require('./foundation/ohlc-normalize');
const TierFeatureFlags = require('./TierFeatureFlags'); // Keep direct - in root not core
const OgzTpoIntegration = loader.get('core', 'OgzTpoIntegration');

/**
 * CHANGE 2026-01-29: Get correct display labels based on market type
 * - SPOT crypto: BUY/SELL (no shorting possible)
 * - Futures/Options/Margin: LONG/SHORT (actual directional positions)
 *
 * This prevents misleading labels like "SHORT" when we're just selling on spot.
 * @param {string} direction - 'buy' or 'sell'
 * @param {string} assetType - 'crypto', 'options', 'futures', etc.
 * @returns {string} Display label for the direction
 */
function getDirectionDisplayLabel(direction, assetType = 'crypto') {
  const isSell = direction === 'sell' || direction === 'SELL';

  // For spot crypto, use BUY/SELL (honest about what's actually happening)
  if (assetType === 'crypto') {
    return isSell ? 'SELL' : 'BUY';
  }

  // For futures/options/margin, use LONG/SHORT (actual directional positions)
  return isSell ? 'SHORT' : 'LONG';
}

function normalizeRuntimeSymbol(symbol) {
  if (typeof symbol !== 'string' || !symbol.trim()) return null;
  let normalized = symbol.trim().toUpperCase().replace('XBT', 'BTC').split('/').join('-');
  if (!normalized.includes('-') && normalized.endsWith('USD') && normalized.length === 6) {
    normalized = `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
  }
  return normalized;
}

function splitSymbols(raw) {
  if (!raw) return [];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

function describeSymbolContexts(map) {
  if (!map || map.size === 0) return '(none)';
  return Array.from(map.keys()).join(',');
}

function ohlcTimestampMs(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeOhlcForProcessor(ohlcData) {
  if (!Array.isArray(ohlcData) || ohlcData.length < 8) return null;
  const timeMs = ohlcTimestampMs(ohlcData[0]);
  const etimeMs = ohlcTimestampMs(ohlcData[1] ?? ohlcData[0]);
  if (!Number.isFinite(timeMs) || !Number.isFinite(etimeMs)) return null;

  const normalized = ohlcData.slice();
  normalized[0] = timeMs / 1000;
  normalized[1] = etimeMs / 1000;
  return normalized;
}

function candleToProcessorOhlc(candle, timeframeMs) {
  const timeMs = ohlcTimestampMs(candle?.t);
  if (!Number.isFinite(timeMs) || !Number.isFinite(timeframeMs) || timeframeMs <= 0) {
    return null;
  }
  return [
    timeMs / 1000,
    (timeMs + timeframeMs) / 1000,
    candle.o,
    candle.h,
    candle.l,
    candle.c,
    null,
    candle.v ?? 0,
    null
  ];
}

const BOOT_REST_HYDRATION_LIMIT = 60;
const LIVENESS_BACKFILL_LIMIT = 10;

/**
 * Main Trading Bot Orchestrator
 * Coordinates all modules for production trading
 */
class OGZPrimeV14Bot {
  constructor() {
    console.log('\nOGZ PRIME V14 FINAL MERGED - INITIALIZING');
    console.log('Desktop Claude (402-line) + Browser Claude (439-line) = MERGED');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    // REFACTOR Phase 21: ModuleInitializer for configuration helpers
    this.moduleInitializer = new ModuleInitializer();

    // Environment validation
    this.validateEnvironment();

    // TWO-KEY TURN SAFETY: Require double confirmation for live trading
    this.verifyTradingMode();

    // Tier configuration
    this.tier = resolvedConfig.config.misc.botTier;
    this.tierFlagManager = new TierFeatureFlags(this.tier);
    this.tierFlags = this.tierFlagManager.getTierSummary();
    console.log(`Tier: ${this.tier.toUpperCase()}`);

    // PIPELINE: Read toggles early for component initialization
    // RUN-MED-03: ?? + warn when pipeline config missing. || coerced an
    // explicit empty object (intentional "all gates off") to {} silently.
    const _pipelineCfg = TradingConfig.get('pipeline');
    if (_pipelineCfg == null) {
      console.warn('[RUN-MED-03] TradingConfig.pipeline missing — defaulting to {} (all pipeline gates off). Verify pipeline config block.');
    }
    this.pipeline = _pipelineCfg ?? {};

    // Initialize core modules
    console.log('[CHECKPOINT-008] Creating pattern checker...');
    if (!EnhancedPatternChecker) {
      console.error('âŒ EnhancedPatternChecker is undefined! Module loading failed.');
      process.exit(1);
    }
    this.patternChecker = new EnhancedPatternChecker();
    console.log('[CHECKPOINT-009] EnhancedPatternChecker created');

    // Initialize OGZ Two-Pole Oscillator (pure function implementation from V2)
    this.ogzTpo = this.tierFlagManager.isEnabled('ogzTpoEnabled')
      ? OgzTpoIntegration.fromTierFlags(this.tierFlagManager)
      : null;

    if (this.ogzTpo) {
      console.log('OGZ TPO initialized with mode:', this.tierFlagManager.getValue('ogzTpoMode'));
    }

    // CHANGE 665: Initialize TradingProfileManager for manual profile switching
    // AUTO-SWITCHING DISABLED - profiles are user-controlled only
    // Phase 2 REWRITE: TradingProfileManager, OptimizedTradingBrain, tradingOptimizations deleted
    // Profiles now in TradingConfig, orchestrator replaced brain, PatternStatsManager unused
    const initialProfile = resolvedConfig.config.misc.tradingProfile;
    console.log(`Trading Profile: ${initialProfile.toUpperCase()} (from TradingConfig)`);

    // CHANGE 2026-02-21: Isolated strategy entry pipeline (replaces soupy pooled confidence)
    // Each strategy evaluates independently. Highest confidence WINS and OWNS the trade.
    // Confluence only affects POSITION SIZING, not the entry decision.
    this.strategyOrchestrator = new StrategyOrchestrator({
      // CHANGE 2026-02-28: Use TradingConfig for minStrategyConfidence
      minStrategyConfidence: TradingConfig.get('confidence.minStrategyConfidence'),
      minConfluenceCount: 1,         // 1 = winner alone can trade
    });

    // Fibonacci level detection for strategy context (supports EMA bounce + fib confluence)
    const FibonacciDetector = require('./core/FibonacciDetector');
    this.fibonacciDetector = new FibonacciDetector({
      lookbackCandles: 100,
      strengthRequired: 3,
      proximityThreshold: 0.5,
    });

    this.riskManager = new RiskManager({
      // CHANGE 2026-02-28: Use TradingConfig
      maxDailyLoss: TradingConfig.get('risk.maxDailyLoss'),
      maxDrawdown: TradingConfig.get('risk.maxDrawdown'),
      // CHANGE 2026-03-17: Inject from ConfigLoader (no more process.env in RiskManager)
      riskManagerBypass: resolvedConfig.config.risk.riskManagerBypass,
    });

    // Phase 3 REWRITE: EntryDecider deleted - decision logic inlined to TradingLoop
    // Gate checks and exit logic now in TradingLoop + ExitContractManager

    // PHASE 13A: Position management with immutability guarantees
    this.pnlCalculator = new PnLCalculator();
    this.positionSizer = new PositionSizer();
    this.positionTracker = new PositionTracker();

    // Phase 2 REWRITE: AdvancedExecutionLayer deleted - OrderRouter+OrderExecutor handle execution

    this.performanceAnalyzer = new PerformanceAnalyzer();

    // Initialize Pattern Exit Model (shadow mode by default)
    this.patternExitModel = null;
    if (featureFlags.features.PATTERN_EXIT_MODEL?.enabled) {
      const PatternBasedExitModel = require('./core/PatternBasedExitModel');
      this.patternExitModel = new PatternBasedExitModel(featureFlags.features.PATTERN_EXIT_MODEL.settings || {});
      this.patternExitShadowMode = featureFlags.features.PATTERN_EXIT_MODEL.shadowMode !== false;
      console.log(`Pattern Exit Model: ${this.patternExitShadowMode ? 'SHADOW MODE' : 'ACTIVE'}`);
    }

    // CHANGE 2026-02-02: TradeIntelligenceEngine - intelligent per-trade evaluation
    // Each trade evaluated on 13 dimensions (regime, momentum, structure, volume, TRAI, whales, etc.)
    this.tradeIntelligence = new TradeIntelligenceEngine({
      // Profit/Loss thresholds (%)
      profitTakePartial: 1.5,
      profitTrailTight: 2.5,
      lossWarning: 0.5,
      lossCut: 1.5,
      // Time thresholds (minutes)
      minHoldTime: 2,
      staleTradeTime: 30
    });
    this.tradeIntelligenceShadowMode = resolvedConfig.config.misc.tradeIntelligenceShadow; // ACTIVE by default
    console.log(`Trade Intelligence Engine: ${this.tradeIntelligenceShadowMode ? 'SHADOW MODE' : 'ACTIVE'}`);

    // CHANGE 2026-02-10: Modular Entry System (V2 format: c/o/h/l/v/t)
    this.mtfAdapter = new MultiTimeframeAdapter({
      activeTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
    });
    this.candleAggregator = new CandleAggregator();
    this._emittedAggregatedActiveCandles = new Set();

    const runtimeCandleTimeframe = resolvedConfig.config.broker.candleTimeframe;
    if (typeof runtimeCandleTimeframe !== 'string' || !runtimeCandleTimeframe.trim()) {
      throw new Error(`[BOOT][Timeframe] broker.candleTimeframe missing/invalid (${runtimeCandleTimeframe}) - refusing to start without a real candle timeframe`);
    }
    this.candleTimeframe = runtimeCandleTimeframe.trim();

    // CHANGE 2026-02-21: Adaptive timeframe selection based on market conditions
    // Runtime analysis is pinned to broker.candleTimeframe until SymbolTradingContext
    // and CandleStore support active multi-timeframe context swaps.
    this.timeframeSelector = new AdaptiveTimeframeSelector({
      mtfAdapter: this.mtfAdapter,
      feePercent: 0.26,                            // Kraken maker/taker fee per side
      allowedTimeframes: [this.candleTimeframe],
      defaultTimeframe: this.candleTimeframe,
      minSwitchIntervalMs: 5 * 60 * 1000,          // 5 min minimum between switches
    });

    // RUN-MED-01: ?? on all strategy constructor params to preserve intentional
    // zeros (e.g., 0 decayBars = "no decay", 0 snapbackThreshold = "always
    // snap"). || coerced any 0 config value to the hardcoded default, blocking
    // intentional overrides. Same architectural class across all 6 constructors.
    const emaConfig = TradingConfig.get('strategies.EMACrossover') ?? {};
    this.emaCrossover = new EMASMACrossoverSignal({
      decayBars: emaConfig.decayBars ?? 10,
      snapbackThresholdPct: emaConfig.snapbackThreshold ?? 2.5,
      blowoffAccelThreshold: emaConfig.blowoffThreshold ?? 0.15,
    });

    const masrConfig = TradingConfig.get('strategies.MADynamicSR') ?? {};
    this.maDynamicSR = new MADynamicSR({
      entryMaPeriod: masrConfig.entryMaPeriod ?? 20,
      srMaPeriod: masrConfig.srMaPeriod ?? 200,
      touchZonePct: masrConfig.touchZonePct ?? 0.6,
      srTestCount: masrConfig.srTestCount ?? 2,
      swingLookback: masrConfig.swingLookback ?? 3,
      srZonePct: masrConfig.srZonePct ?? 1.0,
      slopeLookback: masrConfig.slopeLookback ?? 5,
      minSlopePct: masrConfig.minSlopePct ?? 0.03,
      extensionPct: masrConfig.extensionPct ?? 2.0,
      skipFirstTouch: masrConfig.skipFirstTouch ?? true,
      atrPeriod: masrConfig.atrPeriod ?? 14,
      patternPersistBars: masrConfig.patternPersistBars ?? 15,
    });

    // 2026-05-04: BreakAndRetest now owned by StrategyOrchestrator (self-contained pattern).
    // Runner-side instance removed to prevent two-instance state divergence.

    // CHANGE 2026-02-23: BacktestRecorder for proper trade tracking
    // FIX 2026-02-26: Use same INITIAL_BALANCE as StateManager (was hardcoded 25000 vs 10000 mismatch)
    if (resolvedConfig.config.mode.backtest || resolvedConfig.config.mode.execution === 'backtest' || resolvedConfig.config.mode.candleSource === 'file') {
      this.backtestRecorder = new BacktestRecorder({
        startingBalance: resolvedConfig.config.backtest.initialBalance
      });
    }

    const liqConfig = TradingConfig.get('strategies.LiquiditySweep') ?? {};
    this.liquiditySweep = new LiquiditySweepDetector({
      sweepLookbackBars: liqConfig.sweepLookbackBars ?? 50,
      sweepMinExtensionPct: liqConfig.sweepMinExtensionPct ?? 0.1,
      atrMultiplier: liqConfig.atrMultiplier ?? 0.25,
      atrPeriod: liqConfig.atrPeriod ?? 14,
      entryWindowMinutes: liqConfig.entryWindowMinutes ?? 90,
      hammerBodyMaxPct: liqConfig.hammerBodyMaxPct ?? 0.35,
      hammerWickMinRatio: liqConfig.hammerWickMinRatio ?? 2.0,
      engulfMinRatio: liqConfig.engulfMinRatio ?? 1.0,
      stopBufferPct: liqConfig.stopBufferPct ?? 0.05,
      disableSessionCheck: liqConfig.disableSessionCheck ?? true,
    });

    // CHANGE 2026-02-23: Volume Profile (Fabio Valentino / Auction Market Theory)
    // Filters out trend strategies when market is BALANCED (inside value area = chop)
    const vpConfig = TradingConfig.get('strategies.VolumeProfile') ?? {};
    this.volumeProfile = new VolumeProfile({
      sessionLookback: vpConfig.sessionLookback ?? 96,    // 96 x 15min = 24 hours
      numBins: vpConfig.numBins ?? 50,
      valueAreaPct: vpConfig.valueAreaPct ?? 0.70,
      outOfBalancePct: vpConfig.outOfBalancePct ?? 0.5,   // FIX: Was 0.1%, needs 0.5%
      recalcInterval: vpConfig.recalcInterval ?? 5,
    });

    console.log('"Š Modular Entry System: MTF + Crossovers + S/R + Liquidity initialized');

    // EXIT_SYSTEM feature flag: Only ONE exit system active at a time
    // Options: maxprofit, intelligence, pattern, brain, legacy (all active)
    // Hard stop loss + stale trade exit + confidence crash ALWAYS run regardless
    this.activeExitSystem = resolvedConfig.config.exits.exitSystem || featureFlags.features?.EXIT_SYSTEM?.settings?.activeSystem || 'maxprofit';
    console.log(`Active Exit System: ${this.activeExitSystem.toUpperCase()} (set EXIT_SYSTEM env to change)`);

    // Phase 2 REWRITE: GridTradingStrategy deleted - different trading style, feature-flagged off

    // REMOVED 2026-02-20: ExecutionRateLimiter was blocking 95% of trades in backtest
    // Rate limiting now handled by MIN_TRADE_CONFIDENCE threshold + position sizing
    this.rateLimiter = null;

    // TRAI DECISION MODULE (Change 574 - Opus Architecture + Codex Fix)
    // OPTIMIZECEPTION FIX: Skip TRAI initialization when disabled (4x faster backtests)
    // PIPELINE: Check both legacy env var AND new pipeline toggle
    if (this.pipeline.enableTRAI !== false && resolvedConfig.config.trai.enabled !== false) {
      this.trai = new TRAIDecisionModule({
        mode: resolvedConfig.config.trai.mode,  // Start conservative
        confidenceWeight: resolvedConfig.config.trai.weight,  // 20% influence
        enableVetoPower: resolvedConfig.config.trai.vetoPower,  // Disabled by default
        maxRiskTolerance: resolvedConfig.config.trai.maxRisk,
        minConfidenceOverride: resolvedConfig.config.trai.minConf,
        maxConfidenceOverride: resolvedConfig.config.trai.maxConf,
        enableLLM: true  // Full AI reasoning enabled
      });
    } else {
      this.trai = null;  // TRAI disabled for fast optimization runs
      console.log('âš¡ TRAI disabled for fast backtest mode');
    }

    // Phase 2 REWRITE: tradingBrain deleted - orchestrator handles confidence

    // Change 587: SafetyNet and TradeLogger removed
    // SafetyNet was too restrictive, blocking legitimate trades
    // TradeLogger module doesn't exist in codebase
    // We already have RiskManager + TRAI veto + confidence thresholds
    // this.safetyNet = new TradingSafetyNet(); // DISABLED - blocking everything
    // this.tradeLogger = new TradeLogger(); // Module doesn't exist

    console.log('[DEBUG] About to create ' + resolvedConfig.config.broker.id + ' adapter...');
    console.log('[DEBUG] BrokerFactory available:', typeof createBrokerAdapter);

    // BROKER SETUP — dual path gated on SESSION_ROUTER_ENABLED.
    // Default OFF: existing single-broker path runs unchanged (Phase 0 dormant).
    // ON: dual-broker SessionRouter swaps Kraken (crypto) <-> Alpaca (stocks RTH).
    const sessionRouterEnabled = process.env.SESSION_ROUTER_ENABLED === 'true';
    if (sessionRouterEnabled && resolvedConfig.config.mode.backtest) {
      throw new Error('[SessionRouter] SESSION_ROUTER_ENABLED=true is not allowed in backtest mode — refusing live feed contamination of file backtests');
    }

    if (sessionRouterEnabled) {
      console.log('[EMPIRE V2] SessionRouter ENABLED — creating Kraken + Alpaca adapters');
      const krakenAdapter = createBrokerAdapter('kraken', {
        apiKey: resolvedConfig.config.broker.apiKey,
        apiSecret: resolvedConfig.config.broker.apiSecret,
      });
      const alpacaAdapter = createBrokerAdapter('alpaca', {});

      this.orderRouter = new OrderRouter();

      const sessionsCfg = (TradingConfig.get && TradingConfig.get('sessions')) || {};
      const stockSymbols = (process.env.ALPACA_SYMBOLS
        ? process.env.ALPACA_SYMBOLS.split(',').map(s => s.trim())
        : sessionsCfg.stockSymbols);
      this.ttpCutoffSymbols = stockSymbols;

      this.sessionRouter = new SessionRouter({
        enabled: true,
        fast: process.env.SESSION_ROUTER_FAST === 'true',
        checkIntervalMs: sessionsCfg.checkIntervalMs,
        forceCloseOnSessionEnd: sessionsCfg.forceCloseOnSessionEnd,
        stockSymbols,
        cryptoSymbols: sessionsCfg.cryptoSymbols,
      });

      // OHLC handler closure — mirrors single-broker handler in subscribeToMarketData.
      // SessionRouter attaches this to whichever adapter is currently active.
      const ohlcHandler = (eventData) => {
        const tf = eventData.timeframe || '1m';
        const raw = eventData.data || eventData;
        const traceId = eventData.traceId || raw?.traceId || createTraceId('candle');
        emitTrace(this, 'CANDLE_INGRESS', {
          traceId,
          source: `sessionRouter:${this.sessionRouter?.activeSession || 'unknown'}`,
          brokerId: this.sessionRouter?.activeBroker?.id || null,
          timeframe: tf,
          payloadSymbol: eventData.symbol || raw?.symbol || raw?.S || null,
        });
        const normalizedOhlcData = normalizeOhlc(raw);
        if (!normalizedOhlcData) {
          console.warn('[OHLC] dropped unnormalizable payload from', tf);
          return;
        }
        const ohlcData = normalizeOhlcForProcessor(normalizedOhlcData);
        if (!ohlcData) {
          console.warn('[OHLC] dropped payload with invalid timestamp from', tf);
          return;
        }
        // FIX 2026-05-05: per-symbol price tracking for cross-asset equity.
        // Dual-broker emits may carry .symbol on the wrapper; if absent,
        // infer from the active session's primary symbol. Either source
        // gets normalized to dash-form before storing.
        const eventSymbol = eventData && eventData.symbol;
        const rawSymbol = raw && typeof raw === 'object' && (raw.symbol || raw.S);
        const sessionPrimary = this.sessionRouter && this.sessionRouter.activeSession === 'crypto'
          ? (this.sessionRouter.cryptoSymbols && this.sessionRouter.cryptoSymbols[0])
          : null;
        const rawSym = eventSymbol || rawSymbol || sessionPrimary;
        const symbolSource = eventSymbol ? 'event.symbol' : rawSymbol ? 'raw.symbol' : sessionPrimary ? 'sessionPrimary' : 'missing';
        const sym = normalizeRuntimeSymbol(rawSym);
        if (!sym) {
          console.error(`[VIS][OHLC][Runner] dropped ${tf} SessionRouter candle: missing symbol | session=${this.sessionRouter?.activeSession || '(none)'} contexts=${describeSymbolContexts(this.symbolContexts)}`);
          return;
        }
        emitTrace(this, 'CANDLE_NORMALIZED', {
          traceId,
          source: `sessionRouter:${this.sessionRouter?.activeSession || 'unknown'}`,
          symbol: sym,
          timeframe: tf,
          close: ohlcData[5],
          etime: ohlcData[1],
        });
        this.lastBrokerDataReceived = Date.now();
        this.lastBrokerDataSymbol = sym;
        this.lastBrokerDataTimeframe = tf;
        if (stateManager && stateManager.updateLastPrice) {
          stateManager.updateLastPrice(sym, ohlcData[5]);
        }
        const activeTf = (this.timeframeSelector && this.timeframeSelector.currentTimeframe) || this.candleTimeframe;
        this._visOhlcSeen ??= new Set();
        const visKey = `session:${this.sessionRouter?.activeSession || 'unknown'}:${sym}:${tf}`;
        if (!this._visOhlcSeen.has(visKey) || tf === activeTf) {
          this._visOhlcSeen.add(visKey);
          console.log(`[VIS][OHLC][Runner] source=sessionRouter session=${this.sessionRouter?.activeSession || '(none)'} timeframe=${tf} symbolSource=${symbolSource} payloadSymbol=${eventSymbol || rawSymbol || '(missing)'} symbol=${sym} close=${ohlcData[5]} contexts=${describeSymbolContexts(this.symbolContexts)}`);
        }
        const storedCandle = this.storeTimeframeCandle(tf, ohlcData);
        this.storeSymbolTimeframeCandle(sym, tf, ohlcData);
        if (tf === activeTf) {
          this._markActiveTimeframeData(sym, tf);
          this.handleMarketData({ data: ohlcData, symbol: sym, timeframe: tf, traceId });
        } else {
          this._feedAggregatedActiveCandle({
            symbol: sym,
            sourceTimeframe: tf,
            activeTimeframe: activeTf,
            sourceLabel: `sessionRouter:${this.sessionRouter?.activeSession || 'unknown'}`,
            traceId,
          });
        }
        if (tf === '5m' && this.timeframeSelector) {
          const tfResult = this.timeframeSelector.evaluate();
          if (tfResult.switched) {
            console.log(`Active trading timeframe: ${tfResult.timeframe} (score: ${tfResult.score.toFixed(2)})`);
          }
        }
        if (tf === activeTf && storedCandle?.isNewCandle) {
          console.log(`V2: ${activeTf} candle closed - running trading analysis`);
          this.run15mTradingCycle(sym, traceId);
        } else if (tf === activeTf && storedCandle && !storedCandle.isNewCandle) {
          const skipKey = `session:${sym}:${tf}`;
          this._visActiveTfUpdateSkipped ??= new Set();
          if (!this._visActiveTfUpdateSkipped.has(skipKey)) {
            this._visActiveTfUpdateSkipped.add(skipKey);
            console.log(`[VIS][TradingCycle] waiting for new ${tf} candle boundary before analysis | symbol=${sym} etime=${storedCandle.candle?.etime || '(missing)'}`);
          }
        }
      };

      this.sessionRouter.wire(krakenAdapter, alpacaAdapter, this.orderRouter, ohlcHandler, this);

      // Default this.kraken to alpaca; SessionRouter.start() corrects via initial
      // activation, and the transition listener keeps this.kraken in sync after.
      this.kraken = alpacaAdapter;
      this.sessionRouter.on('transition', (ev) => {
        this.kraken = this.sessionRouter.activeBroker;
        console.log(`[EMPIRE V2] Session transition: ${ev.from} -> ${ev.to}`);
      });

      console.log('[EMPIRE V2] OrderRouter initialized — SessionRouter governs subscriptions');

    } else {
      // SINGLE-BROKER PATH (Phase 0 dormant default).
      // EMPIRE V2: Create broker adapter through BrokerFactory (SINGLE SOURCE OF TRUTH)
      // NO FALLBACK - if BrokerFactory fails, bot fails. No bypasses.
      // FIX 2026-04-22: broker is env-driven (BROKER=alpaca default -> stocks paper).
      // Variable name this.kraken preserved to avoid repo-wide rename; now holds whichever
      // adapter BrokerFactory returns.
      const brokerId = resolvedConfig.config.broker.id;
      const adapterOptions = brokerId === 'kraken'
        ? { apiKey: resolvedConfig.config.broker.apiKey, apiSecret: resolvedConfig.config.broker.apiSecret }
        : {};
      this.kraken = createBrokerAdapter(brokerId, adapterOptions);
      console.log('[EMPIRE V2] Created ' + brokerId + ' adapter via BrokerFactory');
      console.log('[DEBUG] Broker adapter type:', this.kraken.constructor.name);

      // Phase 2 REWRITE: executionLayer deleted - OrderRouter handles routing directly

      // REFACTOR Phase 5: OrderRouter for multi-broker routing
      // Future: Add more brokers with orderRouter.registerBroker(adapter, symbols)
      this.orderRouter = new OrderRouter();
      // FIX 2026-04-22: symbols match broker — ALPACA_SYMBOLS env for stocks (default 'TSLA'),
      // hardcoded crypto list for Kraken. Override stocks with e.g. ALPACA_SYMBOLS='TSLA,NVDA,SPY'.
      const routedSymbols = brokerId === 'alpaca'
        ? (process.env.ALPACA_SYMBOLS || 'TSLA').split(',').map(s => s.trim())
        : ['BTC-USD', 'XBT-USD', 'ETH-USD', 'SOL-USD'];
      this.orderRouter.registerBroker(this.kraken, routedSymbols);
      this.ttpCutoffSymbols = brokerId === 'alpaca' ? routedSymbols : [];
      console.log('[EMPIRE V2] OrderRouter initialized - multi-broker ready');
    }

    // Phase 4 REWRITE: MaxProfitManager standalone (was inside deleted OptimizedTradingBrain)
    this.maxProfitManagers = new Map();
    console.log('[EMPIRE V2] MaxProfitManager Map initialized - per-trade tiered exits ready');

    // DynamicPositionSizer NOT WIRED - needs tuning. Using inline confidence multiplier.
    // See core/DynamicPositionSizer.js for the module (curves need calibration).
    this.dynamicPositionSizer = null;

    // RECONCILER REMOVED - was causing more problems than it solved

    // EVENT LOOP MONITORING: DISABLED 2026-02-04
    // Reason: Pauses trading on transient CPU spikes and never auto-resumes
    // Liveness Watchdog already covers "no data" scenario
    // const { getInstance: getEventLoopMonitor } = require('./core/EventLoopMonitor');
    // this.eventLoopMonitor = getEventLoopMonitor({
    //   warningThreshold: 100,
    //   criticalThreshold: 500,
    //   checkInterval: 1000
    // });
    this.eventLoopMonitor = null; // Disabled

    // Dashboard WebSocket (Change 528) - OPTIONAL for real-time monitoring
    this.dashboardWs = null;
    this.dashboardWsConnected = false;
    // REFACTOR Phase 20: WebSocketManager - must be instantiated before initializeDashboardWebSocket call
    this.webSocketManager = new WebSocketManager(this);
    // CHANGE 661: Connect to dashboard WebSocket (defaults to localhost)
    // PIPELINE: Skip dashboard in backtest mode for faster runs
    if (this.pipeline.enableDashboard !== false) {
      console.log('"Œ Initializing Dashboard WebSocket connection...');
      this.initializeDashboardWebSocket();
    }

    // Trading state
    this.isRunning = false;
    this.marketData = null;
    this.priceHistory = [];
    this.tradingPair = normalizeRuntimeSymbol(resolvedConfig.config.broker.tradingPair);
    if (!this.tradingPair) {
      throw new Error('[BOOT][SymbolContexts] broker.tradingPair missing/invalid — refusing to start without canonical symbol');
    }
    this._candleStore = new CandleStore({ maxCandles: 250 });  // REFACTOR: shadow priceHistory

    // CC-C Multi-Symbol Commit 2/6: per-symbol contexts
    // Each subscribed symbol gets its own SymbolTradingContext holding an
    // IndicatorEngine, signal modules, and asset metadata. priceHistory on
    // each context is a getter onto this._candleStore (single source of truth
    // per Trey directive 2026-05-08). Inert until commits 3-6 migrate
    // consumers (CandleProcessor, TradingLoop, OrderExecutor) to read from
    // these contexts. Backward compat: legacy this.priceHistory pathway
    // (initialized empty above, hydrated from CandleStore in loadCandleHistory
    // at lines ~1146) is unchanged.
    //
    // Mercury #6 fix (deferred from commit 1): try/catch wraps construction
    // so a partial-build (e.g., signal-module ctor throws) is logged + skipped
    // instead of polluting the Map with a half-initialized context.
    //
    // SymbolTradingContext must read the same timeframe CandleProcessor writes.
    // broker.candleTimeframe is the single active timeframe until active
    // multi-timeframe context swaps are implemented.
    this.symbolContexts = new Map();
    {
      const brokerId = resolvedConfig.config.broker.id;
      const sessionRouterEnabled = process.env.SESSION_ROUTER_ENABLED === 'true';
      const sessionsCfg = (TradingConfig.get && TradingConfig.get('sessions')) || {};
      const rawSymbols = sessionRouterEnabled
        ? [
            ...splitSymbols(process.env.ALPACA_SYMBOLS || (sessionsCfg.stockSymbols || []).join(',')),
            ...(sessionsCfg.cryptoSymbols || []),
          ]
        : (brokerId === 'alpaca'
            ? (splitSymbols(process.env.ALPACA_SYMBOLS).length > 0
                ? splitSymbols(process.env.ALPACA_SYMBOLS)
                : [resolvedConfig.config.broker.tradingPair])
            : [resolvedConfig.config.broker.tradingPair]);
      const symbols = [...new Set(rawSymbols.map(normalizeRuntimeSymbol).filter(Boolean))];
      const timeframe = this.candleTimeframe;
      for (const sym of symbols) {
        try {
          const ctx = new SymbolTradingContext(sym, this._candleStore, { timeframe });
          this.symbolContexts.set(sym, ctx);
          console.log(`[BOOT][SymbolContexts] registered ${sym} @ ${timeframe}`);
        } catch (err) {
          console.error(`[BOOT][SymbolContexts] FAILED to register ${sym}: ${err.message} — skipping (bot continues with successful subset)`);
        }
      }
      console.log(`[VIS][BOOT][SymbolContexts] broker=${brokerId} sessionRouter=${sessionRouterEnabled} tradingPair=${this.tradingPair} registered=${describeSymbolContexts(this.symbolContexts)} envAlpacaSymbols=${splitSymbols(process.env.ALPACA_SYMBOLS).join(',') || '(none)'}`);
    }

    this.candleSaveCounter = 0; // CHANGE 2026-01-28: Track candles for periodic save
    // CHANGE 2026-01-28: Load saved candles on startup
    // FIX 2026-04-06: Skip in backtest mode - backtest provides its own candles
    // Bug: Was loading cached BTC live data into TSLA backtests, corrupting VP calculations
    if (!resolvedConfig.config.mode.backtest &&
        resolvedConfig.config.mode.execution !== 'backtest' &&
        resolvedConfig.config.mode.candleSource !== 'file') {
      this.loadCandleHistory();
    }

    // FIX 2026-03-06: Replay saved candles through IndicatorEngine on startup
    // Bug: priceHistory loaded from disk but IndicatorEngine started empty
    // Result: RSI was null because IndicatorEngine had 0 candles while priceHistory had 16
    // Fix: Use computeBatch() to replay all saved candles through indicator calculations
    if (this.priceHistory.length > 0) {
      console.log(`Replaying ${this.priceHistory.length} saved candles through IndicatorEngine...`);
      indicatorEngine.computeBatch(this.priceHistory);
      console.log(`IndicatorEngine synced with priceHistory (RSI: ${indicatorEngine.getSnapshot().indicators?.rsi?.toFixed(1) || 'warming up'})`);
    }

    // FIX 2026-03-06: Replay saved candles through signal modules on startup
    // Same bug as IndicatorEngine - these modules are stateful and need history replayed
    // EMASMACrossoverSignal: crossoverState, prevSpreads, divergenceHistory
    // MADynamicSR: swings, srLevels, pattern123, barCount
    if (this.priceHistory.length > 0 && this.emaCrossover && this.maDynamicSR) {
      console.log(`Replaying ${this.priceHistory.length} saved candles through signal modules...`);
      for (let i = 0; i < this.priceHistory.length; i++) {
        const candle = this.priceHistory[i];
        const historyUpToNow = this.priceHistory.slice(0, i + 1);
        this.emaCrossover.update(candle, historyUpToNow);
        this.maDynamicSR.update(candle, historyUpToNow);
      }
      const emaSnap = this.emaCrossover.getSnapshot();
      const srSnap = this.maDynamicSR.getSnapshot();
      console.log(`Signal modules synced (EMA states: ${Object.values(emaSnap.crossoverState).filter(s => s.side !== 'none').length}, SR swings: ${srSnap.swings?.length || 0})`);
    }

    // CHANGE 2026-01-29: Multi-timeframe candle storage for dashboard
    // Each timeframe has its own history from native Kraken data
    this.timeframeHistories = {
      '1m': [],   // same as priceHistory
      '5m': [],
      '15m': [],
      '30m': [],
      '1h': [],
      '4h': [],   // CHANGE 2026-01-29: Added missing 4H timeframe
      '1d': []
    };
    this.symbolTimeframeHistories = new Map();
    this.dashboardTimeframe = '1m';  // Track what timeframe dashboard wants

    // Stale data tracking
    this.staleFeedPaused = false;
    this.feedRecoveryCandles = 0;
    // CHANGE 2026-01-16: Liveness watchdog - tracks last data arrival
    this.lastDataReceived = null;  // Set when handleMarketData receives data
    this.lastBrokerDataReceived = null;
    this.lastBrokerDataSymbol = null;
    this.lastBrokerDataTimeframe = null;
    this.lastActiveTimeframeDataReceived = null;
    this.lastActiveTimeframeSymbol = null;
    this.lastActiveTimeframe = null;
    this.livenessWatchdogStartedAt = null;
    this.livenessCheckInterval = null;  // Periodic check for "no data at all"
    this.marketCalendar = getMarketCalendar();
    // CHANGE 2025-12-11: Position tracking moved to StateManager (single source of truth)
    // this.currentPosition removed - use stateManager.get('position') instead
    // CHANGE 2025-12-13: STEP 1 - SINGLE SOURCE OF TRUTH
    // stateManager.get('balance') REMOVED - use stateManager.get('balance') instead
    // this.activeTrades REMOVED - use stateManager.get('activeTrades') instead
    const initialBalance = resolvedConfig.config.backtest.initialBalance;
    this.startTime = Date.now();
    this.systemState = {
      currentBalance: initialBalance
    };

    // Initialize StateManager with starting balance ONLY if not already loaded
    // CRITICAL FIX: Don't overwrite saved state on startup!
    const currentState = stateManager.getState();
    if (!currentState.balance || currentState.balance === 0) {
      console.log('Initializing fresh state with balance:', initialBalance);
      stateManager.updateState({
        balance: initialBalance,
        totalBalance: initialBalance,
        initialBalance: initialBalance,   // FIX 2026-03-14: Store for drawdown reference
        activeTrades: new Map()  // CHANGE 2025-12-13: Centralized active trades
      }, { action: 'INIT' });
    } else {
      console.log('Using existing state - Balance:', currentState.balance, 'Trades:', currentState.activeTrades?.size || 0);
      // FIX 2026-03-14: Ensure initialBalance exists on state restore
      if (!currentState.initialBalance) {
        stateManager.updateState({ initialBalance: initialBalance }, { action: 'SET_INITIAL_BALANCE' });
      }
    }

    // FIX 2026-02-26: Initialize RiskManager with balance (was never called, caused Infinity drawdown)
    // Without this, peakBalance=0, drawdown=Infinity, checkRiskLimits() blocks ALL trades
    // RUN-HIGH-02: re-read state after init/restore — DO NOT fall back to initialBalance
    // when balance is 0 (all-capital-reserved is a legitimate state distinct from missing).
    const balanceForRisk = stateManager.getState().balance;
    if (!Number.isFinite(balanceForRisk)) {
      throw new Error(`[RUN-HIGH-02] RiskManager init: stateManager.balance is non-finite (${balanceForRisk}) — refusing to anchor high-water mark to NaN/Infinity/null/string`);
    }
    this.riskManager.initializeBalance(balanceForRisk);

    // CHANGE 644: Initialize trade tracking Maps in constructor to prevent crashes
    // CHANGE 2025-12-13: MOVED TO StateManager - no longer tracked here
    this.pendingTraiDecisions = new Map();
    this.confidenceHistory = [];  // Used for confidence tracking

    // Debug flags
    this.ohlcDebugCount = 0; // Log first 5 messages for debugging

    // CHANGE 2025-12-11: MessageQueue for WebSocket race condition prevention
    this.messageQueue = new MessageQueue({
      maxQueueSize: 50,
      minProcessingGapMs: 5,
      staleThresholdMs: 3000,
      onProcess: (data) => this.handleMarketData(data),
      onError: (msg, err) => console.error('âŒ MessageQueue:', msg, err.message)
    });

    // MODE DETECTION: Paper, Live, or Backtest (MUTUAL EXCLUSION)
    // PIPELINE: Use this.pipeline set earlier in constructor

    // Support both ConfigLoader values AND new pipeline toggles
    const enableLiveTrading = resolvedConfig.config.mode.liveTrading || this.pipeline.executionMode === 'live';
    const enableBacktestMode = resolvedConfig.config.mode.backtest ||
                               this.pipeline.candleSource === 'file' ||
                               this.pipeline.executionMode === 'backtest';
    const enableTestMode = resolvedConfig.config.mode.testMode;  // Signal testing without pattern corruption

    // Enforce mutual exclusion: Only ONE mode can be active
    if (enableLiveTrading && enableBacktestMode) {
      throw new Error('âŒ FATAL: Cannot enable both LIVE trading and BACKTEST mode simultaneously!');
    }

    // Determine trading mode
    let tradingMode = 'PAPER';
    if (enableLiveTrading) tradingMode = 'LIVE';
    if (enableBacktestMode) tradingMode = 'BACKTEST';
    if (enableTestMode) {
      tradingMode = 'TEST';
      console.log('TEST MODE ACTIVATED:');
      console.log('   Patterns will NOT be saved');
      console.log('   Trades are simulated');
      console.log('   To inject signal: Set TEST_CONFIDENCE env var (0-100)');
      console.log('   Example: TEST_CONFIDENCE=75 npm start');
    }

    this.config = {
      // CHANGE 2026-02-28: Use TradingConfig for minTradeConfidence
      minTradeConfidence: TradingConfig.get('confidence.minTradeConfidence'),
      tradingPair: this.tradingPair,
      brokerId: resolvedConfig.config.broker.id,
      assetClass: resolvedConfig.config.broker.assetClass,
      executionMode: enableBacktestMode ? 'backtest' : (enableLiveTrading ? 'live' : 'paper'),
      timeframe: this.candleTimeframe,
      evalTraceEnabled: resolvedConfig.config.observability.evalTraceEnabled,
      evalTraceBacktest: resolvedConfig.config.observability.evalTraceBacktest,
      traceEventMaxBufferedBytes: resolvedConfig.config.observability.traceEventMaxBufferedBytes,
      enableShorts: TradingConfig.get('features.enableShorts'),
      enableLiveTrading,
      enableBacktestMode,
      tradingMode
    };

    console.log(`Trading Mode: ${tradingMode}`);

    // CC-C: Webhook order adapter (TTP via SignalStack). Default OFF + dry-run
    // gated; reads WEBHOOK_ORDERS_ENABLED / WEBHOOK_DRY_RUN / SIGNALSTACK_WEBHOOK_URL
    // from .env. Threaded into OrderExecutor ctx for the 4 entry/exit emit sites.
    this.webhookAdapter = new WebhookOrderAdapter();
    this.evalRuleEngine = new EvalRuleEngine({
      config: resolvedConfig.config.evalRules,
      getCandles: (symbol, timeframe) => this.getSymbolTimeframeCandles(symbol, timeframe),
    });

    // REFACTOR Phase 14: OrderExecutor - context with all dependencies
    // Phase 2 REWRITE: executionLayer, tradingBrain, tradingOptimizations deleted
    // Phase 3 REWRITE: entryDecider deleted - gate checks in TradingLoop
    // Phase 4 REWRITE: Added orderRouter + maxProfitManager
    this.orderExecutor = new OrderExecutor({
      performanceAnalyzer: this.performanceAnalyzer,
      patternChecker: this.patternChecker,
      patternExitModel: this.patternExitModel,
      patternExitShadowMode: this.patternExitShadowMode,
      backtestRecorder: this.backtestRecorder,
      riskManager: this.riskManager,
      trai: this.trai,
      config: this.config,
      pendingTraiDecisions: this.pendingTraiDecisions,
      // CRIT-05-followup-B: refuse BTC-USD phantom default in OrderExecutor ctx.
       // Both `this.tradingPair` and `resolvedConfig.config.broker.tradingPair`
       // resolve from the same source (this.tradingPair is set at :751 from
       // resolvedConfig); the original chain `|| 'BTC-USD'` was a silent fallback
       // that would poison live order routing + TRAI learning + proof-logger
       // ledger entries with the wrong asset. Pre-money fail-loud: throw.
       tradingPair: this.tradingPair || resolvedConfig.config.broker.tradingPair || (() => {
         throw new Error('OrderExecutor ctx construction: tradingPair missing from both runner and resolvedConfig — refusing to default to BTC-USD');
       })(),
      // CHANGE 2026-03-17: ConfigLoader injection (no more module-level process.env)
      backtestFast: resolvedConfig.config.backtest.fast,
      backtestMode: resolvedConfig.config.mode.backtest,
      paperTrading: resolvedConfig.config.mode.paperTrading,
      testMode: resolvedConfig.config.mode.testMode,
      // Phase 4 REWRITE: Standalone dependencies (was inside deleted modules)
      orderRouter: this.orderRouter,
      maxProfitManagers: this.maxProfitManagers,
      // CC-C: side-channel webhook emitter — read at OrderExecutor entry/exit blocks
      webhookAdapter: this.webhookAdapter,
      evalRuleEngine: this.evalRuleEngine,
      // DynamicPositionSizer NOT WIRED - using inline confidence multiplier
      // Module-level functions
      notifyTrade: notifyTrade,
      notifyTradeClose: notifyTradeClose,
      discordNotifier: discordNotifier,
      logTrade: logTrade,
      // FIX 2026-03-29: Add strategyOrchestrator for SMS daily loss tracking
      strategyOrchestrator: this.strategyOrchestrator
    });
    const isTtpStockAssetClass = ['stocks', 'stock', 'equities', 'equity', 'etfs', 'etf']
      .includes(String(this.config.assetClass || '').trim().toLowerCase());
    const stockBrokerNames = this.orderRouter?.getBrokerNamesByAssetType
      ? this.orderRouter.getBrokerNamesByAssetType(['stocks', 'stock', 'equities', 'equity', 'etfs', 'etf'])
      : [];
    const ttpCutoffBrokerNames = isTtpStockAssetClass
      ? (this.sessionRouter ? ['alpaca'] : stockBrokerNames)
      : [];
    this.ttpCutoffEnforcer = new TtpCutoffEnforcer({
      evalRuleEngine: this.evalRuleEngine,
      stateManager,
      orderRouter: this.orderRouter,
      executeTrade: this.executeTrade.bind(this),
      getExitPrice: (symbol, trade, brokerPositions) => this.getTtpExitPrice(symbol, trade, brokerPositions),
      assetClass: this.config.assetClass,
      symbols: this.ttpCutoffSymbols,
      getSymbols: () => [
        ...(Array.isArray(this.ttpCutoffSymbols) ? this.ttpCutoffSymbols : []),
        ...(Array.isArray(this.sessionRouter?.stockSymbols) ? this.sessionRouter.stockSymbols : []),
      ],
      brokerNames: ttpCutoffBrokerNames,
    });

    // REFACTOR Phase 15: TradingLoop - context with all dependencies
    // Phase 2 REWRITE: tradingBrain, executionLayer deleted - orchestrator handles decisions
    // Phase 3 REWRITE: entryDecider deleted - decision logic inlined here
    // Phase 4 REWRITE: Added maxProfitManager for tiered exits
    this.tradingLoop = new TradingLoop({
      indicatorEngine: indicatorEngine,
      contractValidator: this.contractValidator,
      marketDataAggregator: this.marketDataAggregator,
      patternChecker: this.patternChecker,
      symbolContexts: this.symbolContexts,
      config: this.config,
      evalRules: resolvedConfig.config.evalRules,
      riskManager: this.riskManager,
      pendingTraiDecisions: this.pendingTraiDecisions,
      trai: this.trai,
      backtestRecorder: this.backtestRecorder,
      orderExecutor: this.orderExecutor,
      // ConfigLoader injection - mode flags
      backtestFast: resolvedConfig.config.backtest.fast,
      testMode: resolvedConfig.config.mode.testMode,
      traiEnableBacktest: TradingConfig.get('features.traiEnableBacktest'),
      // HIGH-16: broker.candleTimeframe threaded into ctx for orchestrator validation
      candleTimeframe: this.candleTimeframe,
      // Phase 4 REWRITE: MaxProfitManager standalone
      maxProfitManagers: this.maxProfitManagers,
      // Additional context for strategy orchestration
      strategyOrchestrator: this.strategyOrchestrator,
      emaCrossoverSignal: this.emaCrossoverSignal,
      maDynamicSRSignal: this.maDynamicSRSignal,
      // 2026-05-04: breakRetestSignal removed — orchestrator owns the instance directly.
      liquiditySweepSignal: this.liquiditySweepSignal,
      mtfAdapter: this.mtfAdapter,
      volumeProfile: this.volumeProfile,
      ogzTpo: this.ogzTpo,
      fibonacciDetector: this.fibonacciDetector,
      timeframeSelector: this.timeframeSelector,
      runner: this  // Self reference for makeTradeDecision
    });

    // REFACTOR Phase 17: DashboardBroadcaster - context with dependencies
    // PIPELINE: Skip dashboard in backtest mode for faster runs
    if (this.pipeline.enableDashboard !== false) {
      this.dashboardBroadcaster = new DashboardBroadcaster({
        indicatorEngine: indicatorEngine
      });
    } else {
      this.dashboardBroadcaster = null;
    }

    // REFACTOR Phase 18: BacktestRunner - context with dependencies
    // Phase 2 REWRITE: executionLayer removed from BacktestRunner
    this.backtestRunner = new BacktestRunner({
      __dirname: __dirname,
      patternChecker: this.patternChecker,
      trai: this.trai,
      backtestRecorder: this.backtestRecorder,
      maxProfitManagers: this.maxProfitManagers  // Per-trade MPM instances for backtest mode
      // DynamicPositionSizer NOT WIRED - stats printing disabled
    });

    // REFACTOR Phase 19: CandleProcessor - context with runner self-reference
    // Attach indicatorEngine to this so CandleProcessor can access via ctx
    this.indicatorEngine = indicatorEngine;
    this.candleProcessor = new CandleProcessor(this);

    console.log('All modules initialized successfully');
    console.log(`   Risk Management: ENABLED`);
    console.log(`   Change 513 Compliance: \n`);
  }

  /**
   * Validate required environment variables
   * FIX 2026-02-18: Skip in BACKTEST_MODE for Windows local testing
   */
  validateEnvironment() {
    // Skip API key validation in backtest mode - not needed for historical data
    if (resolvedConfig.config.mode.backtest || resolvedConfig.config.mode.execution === 'backtest' || resolvedConfig.config.mode.candleSource === 'file') {
      console.log('⏭️ Skipping API key validation (BACKTEST_MODE)');
      return;
    }

    // Check required API keys via ConfigLoader (empty string = missing)
    const missing = [];
    if (!resolvedConfig.config.broker.apiKey) missing.push('KRAKEN_API_KEY');
    if (!resolvedConfig.config.broker.apiSecret) missing.push('KRAKEN_API_SECRET');
    // Note: POLYGON_API_KEY needs to be added to ConfigLoader if still required
    if (missing.length > 0) {
      console.error('âŒ Missing environment variables:', missing);
      throw new Error(`Missing required environment: ${missing.join(', ')}`);
    }
  }

  /**
   * TWO-KEY TURN SAFETY: Verify trading mode with double confirmation
   * Prevents accidental live trading activation
   */
  verifyTradingMode() {
    const enableLive = resolvedConfig.config.mode.liveTrading;
    const confirmLive = resolvedConfig.config.mode.confirmLiveTrading;

    // Check if attempting live mode
    if (enableLive) {
      if (!confirmLive) {
        console.log('\n' + '═'.repeat(70));
        console.log('[WARNING]  TWO-KEY SAFETY CHECK FAILED');
        console.log('═'.repeat(70));
        console.log('You have set LIVE_TRADING=true');
        console.log('But CONFIRM_LIVE_TRADING is not set to true');
        console.log('\nTo enable LIVE trading, you must set BOTH:');
        console.log('  LIVE_TRADING=true');
        console.log('  CONFIRM_LIVE_TRADING=true');
        console.log('\nStarting in PAPER TRADING mode for safety');
        console.log('═'.repeat(70) + '\n');

        // Force paper mode (via instance flag, config is frozen)
        this.mode = 'PAPER';
      } else {
        // BOTH keys confirmed - show BIG warning
        console.log('\n' + '═”'.repeat(70));
        console.log('═‘' + ' '.repeat(20) + '[WARNING]  LIVE TRADING MODE ACTIVE  [WARNING]' + ' '.repeat(17) + '═‘');
        console.log('═‘' + ' '.repeat(68) + '═‘');
        console.log('═‘' + ' '.repeat(20) + '    REAL MONEY AT RISK!' + ' '.repeat(25) + '═‘');
        console.log('═‘' + ' '.repeat(68) + '═‘');
        console.log('═‘' + ' '.repeat(15) + 'Two-key safety confirmed. Proceeding...' + ' '.repeat(14) + '═‘');
        console.log('═š'.repeat(70) + '\n');

        // 10-second countdown
        console.log('Starting in:');
        for (let i = 10; i > 0; i--) {
          process.stdout.write(`\r  ${i} seconds...`);
          require('child_process').execSync('sleep 1');
        }
        console.log('\r  LIVE TRADING ENGAGED!\n');

        this.mode = 'LIVE';
      }
    } else {
      // Paper mode
      console.log('PAPER TRADING MODE (safe mode)');
      this.mode = 'PAPER';
    }
  }

  /**
   * Initialize Dashboard WebSocket connection
   * REFACTOR Phase 20: Thin dispatcher to WebSocketManager
   */
  initializeDashboardWebSocket() {
    this.webSocketManager.initializeDashboardWebSocket();
  }

  /**
   * Start heartbeat ping for WebSocket connection
   * REFACTOR Phase 20: Thin dispatcher to WebSocketManager
   */
  startHeartbeatPing() {
    this.webSocketManager.startHeartbeatPing();
  }

  /**
   * Load candle history from disk on startup
   * Delegates to CandleStore.loadFromDisk
   */
  loadCandleHistory() {
    const path = require('path');
    const candleFile = path.join(__dirname, 'data', 'candle-history.json');
    // CRIT-05-followup-C: refuse BTC-USD phantom default when loading
    // saved candles. Original `|| 'BTC-USD'` would silently load the
    // wrong asset's candle history into priceHistory if resolvedConfig
    // resolution broke. ConfigLoader.js currently guarantees a value
    // (broker-conditional default), so the throw is defensive.
    const symbol = this.tradingPair || (() => {
      throw new Error('loadCandleHistory: resolvedConfig.config.broker.tradingPair missing — refusing to load candles under BTC-USD default');
    })();
    // Clear in-memory priceHistory before hydrating. Defends against
    // cross-symbol contamination if loadCandleHistory is invoked more than
    // once in a process lifetime (e.g. venue swap reload). Belt-and-suspenders
    // alongside the v2 symbol-keyed file format.
    this.priceHistory = [];
    this._candleStore.loadFromDisk(candleFile, symbol, '1m');
    this.priceHistory = this._candleStore.getCandles(symbol, '1m');
  }

  /**
   * Save candle history to disk
   * Delegates to CandleStore.saveToDisk
   */
  saveCandleHistory() {
    if (resolvedConfig.config.backtest.fast || resolvedConfig.config.mode.backtest) return;
    const path = require('path');
    const candleFile = path.join(__dirname, 'data', 'candle-history.json');
    // CRIT-05-followup-D: refuse BTC-USD phantom default in saveCandleHistory.
    // Same fail-loud pattern as the load companion. Saving under wrong asset
    // would persist mismatched candles to disk and propagate the error to
    // the next session's loadCandleHistory.
    const symbol = this.tradingPair || (() => {
      throw new Error('saveCandleHistory: resolvedConfig.config.broker.tradingPair missing — refusing to persist candles under BTC-USD default');
    })();
    // Sync priceHistory to CandleStore before saving
    this._candleStore.addCandles(symbol, '1m', this.priceHistory);
    this._candleStore.saveToDisk(candleFile, symbol, '1m', 200);
  }

  _getBootHydrationSymbols() {
    if (this.sessionRouter && this.sessionRouter.enabled) {
      if (this.sessionRouter.activeSession === 'crypto') {
        const symbol = normalizeRuntimeSymbol(this.sessionRouter.cryptoSymbols?.[0]);
        return symbol ? [symbol] : [];
      }
      if (this.sessionRouter.activeSession === 'stocks') {
        const preferred = normalizeRuntimeSymbol(this.tradingPair);
        const stocks = (this.sessionRouter.stockSymbols || []).map(normalizeRuntimeSymbol).filter(Boolean);
        if (preferred && stocks.includes(preferred)) return [preferred];
        return stocks.length > 0 ? [stocks[0]] : [];
      }
      throw new Error(`[BOOT][REST-HYDRATE] SessionRouter active but activeSession missing (${this.sessionRouter.activeSession})`);
    }

    const symbol = normalizeRuntimeSymbol(this.tradingPair);
    return symbol ? [symbol] : [];
  }

  _normalizeHydrationCandle(raw, symbol, timeframe, timeframeMs) {
    const t = ohlcTimestampMs(raw?.t ?? raw?.time ?? raw?.timestamp);
    if (!Number.isFinite(t)) return null;
    const etime = ohlcTimestampMs(raw?.etime) ?? (t + timeframeMs);
    const candle = {
      symbol,
      timeframe,
      t,
      etime,
      o: Number(raw?.o ?? raw?.open),
      h: Number(raw?.h ?? raw?.high),
      l: Number(raw?.l ?? raw?.low),
      c: Number(raw?.c ?? raw?.close),
      v: Number(raw?.v ?? raw?.volume ?? 0)
    };
    if (![candle.o, candle.h, candle.l, candle.c, candle.v].every(Number.isFinite)) {
      return null;
    }
    return candle;
  }

  async hydrateActiveTimeframeFromRest() {
    if (this.config.enableBacktestMode ||
        resolvedConfig.config.mode.backtest ||
        resolvedConfig.config.mode.execution === 'backtest' ||
        resolvedConfig.config.mode.candleSource === 'file') {
      return;
    }

    const broker = this.sessionRouter?.activeBroker || this.kraken;
    if (!broker || typeof broker.getCandles !== 'function') {
      console.warn('[BOOT][REST-HYDRATE] skipped: active broker has no getCandles()');
      return;
    }

    const timeframe = this.timeframeSelector?.currentTimeframe || this.candleTimeframe;
    const timeframeMs = this.candleAggregator?.getIntervalMs(timeframe);
    if (!Number.isFinite(timeframeMs) || timeframeMs <= 0) {
      throw new Error(`[BOOT][REST-HYDRATE] invalid active timeframe ${timeframe}`);
    }

    const symbols = this._getBootHydrationSymbols();
    if (symbols.length === 0) {
      throw new Error('[BOOT][REST-HYDRATE] no active symbols available for boot hydration');
    }

    for (const symbol of symbols) {
      const rawCandles = await broker.getCandles(symbol, timeframe, BOOT_REST_HYDRATION_LIMIT);
      const candles = (Array.isArray(rawCandles) ? rawCandles : [])
        .map(c => this._normalizeHydrationCandle(c, symbol, timeframe, timeframeMs))
        .filter(Boolean)
        .sort((a, b) => a.etime - b.etime)
        .slice(-BOOT_REST_HYDRATION_LIMIT);

      if (candles.length === 0) {
        console.warn(`[BOOT][REST-HYDRATE] no usable candles returned for ${symbol} @ ${timeframe}`);
        continue;
      }

      for (const candle of candles) {
        this.candleProcessor.processNewCandle(candle, { persist: false });
        const ohlc = candleToProcessorOhlc(candle, timeframeMs);
        if (ohlc) {
          this.storeTimeframeCandle(timeframe, ohlc);
          this.storeSymbolTimeframeCandle(symbol, timeframe, ohlc);
        }
      }

      const latest = candles[candles.length - 1];
      const marketData = {
        symbol,
        price: latest.c,
        timestamp: latest.t,
        timeframe,
        systemTime: Date.now(),
        volume: Number.isFinite(latest.v) ? latest.v : null,
        open: latest.o,
        high: latest.h,
        low: latest.l
      };
      this.marketData = marketData;
      const symCtx = this.symbolContexts?.get(symbol);
      if (symCtx) symCtx.marketData = marketData;
      if (stateManager && stateManager.updateLastPrice) {
        stateManager.updateLastPrice(symbol, latest.c);
      }
      this._markActiveTimeframeData(symbol, timeframe);

      console.log(`[BOOT][REST-HYDRATE] symbol=${symbol} timeframe=${timeframe} candles=${candles.length} latest=${new Date(latest.etime).toISOString()} close=${latest.c}`);
    }
  }

  /**
   * Start the trading bot
   */
  async start() {
    console.log('Starting OGZ Prime V14 MERGED...\n');

    // ENV FINGERPRINT — print all trading-relevant env vars for reproducibility
    console.log('═'.repeat(60));
    console.log('ENV FINGERPRINT:');
    console.log(`  SOLO_STRATEGY=${process.env.SOLO_STRATEGY || 'all'}`);
    console.log(`  EXECUTION_MODE=${process.env.EXECUTION_MODE || 'paper'}`);
    console.log(`  CANDLE_SOURCE=${process.env.CANDLE_SOURCE || 'live'}`);
    console.log(`  CANDLE_DATA_FILE=${process.env.CANDLE_DATA_FILE || 'default'}`);
    console.log(`  DIRECTION_FILTER=${process.env.DIRECTION_FILTER || 'both'}`);
    console.log(`  BACKTEST_MODE=${process.env.BACKTEST_MODE || 'false'}`);
    console.log(`  BACKTEST_FAST=${process.env.BACKTEST_FAST || 'false'}`);
    console.log(`  BACKTEST_NO_PATTERN_SAVE=${process.env.BACKTEST_NO_PATTERN_SAVE || 'false'}`);
    console.log(`  FEE_MAKER=${process.env.FEE_MAKER || 'default'}`);
    console.log(`  FEE_TAKER=${process.env.FEE_TAKER || 'default'}`);
    console.log(`  ACCOUNT_DRAWDOWN_BYPASS=${process.env.ACCOUNT_DRAWDOWN_BYPASS || 'false'}`);
    console.log(`  ENABLE_TRAI=${process.env.ENABLE_TRAI || 'true'}`);
    console.log(`  ENABLE_SHORTS=${process.env.ENABLE_SHORTS || 'false'}`);
    console.log(`  ENABLE_RSI=${process.env.ENABLE_RSI || 'true'}`);
    console.log(`  ENABLE_EMA=${process.env.ENABLE_EMA || 'true'}`);
    console.log(`  ENABLE_SMS=${process.env.ENABLE_SMS || 'false'}`);
    console.log(`  SMS_VP_RTH_ONLY=${process.env.SMS_VP_RTH_ONLY || 'true'}`);
    console.log('═'.repeat(60));
    console.log('');

    this.isRunning = true;

    // Start SessionRouter after isRunning so transitions can pause/resume cleanly.
    // start() is sync — _activate{Crypto,Stocks} runs inside it and populates
    // sessionRouter.activeBroker. We re-sync this.kraken to that broker here
    // because _activate methods do NOT emit 'transition' (only the swap methods do),
    // so without this assignment this.kraken would stay pinned to the construction-
    // time default (alpacaAdapter) until the first real RTH boundary fires.
    if (this.sessionRouter) {
      this.sessionRouter.start();
      if (this.sessionRouter.activeBroker) this.kraken = this.sessionRouter.activeBroker;
    }

    // Initialize TRAI Decision Module (Change 574)
    if (this.trai) {
      try {
        await this.trai.initialize();
        console.log('TRAI Decision Module initialized - IN THE HOT PATH!\n');
      } catch (error) {
        console.error('[WARNING] TRAI initialization failed:', error.message);
        console.log('   Bot will continue without TRAI...\n');
        this.trai = null;
      }
    }

    try {
      // FEATURE FLAG: Backtest mode uses historical data, Live/Paper use WebSocket
      if (this.config.enableBacktestMode) {
        console.log('BACKTEST MODE: Loading historical data...');
        await this.loadHistoricalDataAndBacktest();
      } else {
        console.log('"¡ LIVE/PAPER MODE: Connecting to real-time data...');
        // V2 ARCHITECTURE: Connect broker first to load asset pairs
        await this.kraken.connect();
        await this.hydrateActiveTimeframeFromRest();
        // Subscribe to broker events instead of direct connection
        this.subscribeToMarketData();

        // RECONCILER REMOVED - was blocking trades

        // EVENT LOOP MONITORING: DISABLED 2026-02-04
        // if (this.eventLoopMonitor) {
        //   console.log('âš¡ Starting event loop monitoring...');
        //   this.eventLoopMonitor.start();
        //   console.log('Event loop monitor active');
        // }

        // CHANGE 2026-02-10: Initialize Multi-Asset Manager
        this.assetManager = new MultiAssetManager(this);

        // CHANGE 2026-02-10: Initialize Trade Journal + Replay Bridge
        this.journalBridge = new TradeJournalBridge(this);

        // CHANGE 2026-02-16: Pipeline Snapshot - 30-min state capture
        this.pipelineSnapshot = new PipelineSnapshot(this);

        // Start trading cycle
        this.startTradingCycle();

        const startupEntryBlocks = [];
        if (stateManager.get('isTrading') === false) {
          startupEntryBlocks.push(stateManager.get('pauseReason') || stateManager.get('lastError') || 'StateManager.isTrading=false');
        }
        const globalHaltReason = stateManager.isHalted() ? stateManager.getHaltReason() : null;
        if (globalHaltReason) {
          startupEntryBlocks.push(`global halt: ${globalHaltReason}`);
        }
        const startupSymbol = this.tradingPair || this.config.tradingPair;
        const symbolHaltReason = startupSymbol && stateManager.isSymbolHalted(startupSymbol)
          ? stateManager.getSymbolHaltReason(startupSymbol)
          : null;
        if (symbolHaltReason) {
          startupEntryBlocks.push(`${startupSymbol} halt: ${symbolHaltReason}`);
        }
        if (startupEntryBlocks.length > 0) {
          console.warn(`[STARTUP] Bot online, but entries are blocked: ${startupEntryBlocks.join('; ')}\n`);
        } else {
          console.log('[STARTUP] Bot online and entries enabled\n');
        }
      }
    } catch (error) {
      console.error('âŒ Startup failed:', error.message);
      await this.shutdown();
    }
  }

  /**
   * V2 ARCHITECTURE: Subscribe to market data from BrokerFactory
   * Single source of truth - no direct connections
   */
  subscribeToMarketData() {
    // SessionRouter governs subscriptions when enabled — skip the single-broker
    // path so we don't double-attach OHLC listeners or subscribe to stale symbols.
    if (this.sessionRouter && this.sessionRouter.enabled) {
      console.log('V2 ARCHITECTURE: SessionRouter active — skipping manual subscription');
      return;
    }

    console.log('V2 ARCHITECTURE: Subscribing to market data from BrokerFactory...');

    if (this.kraken) {
      // Start market data subscription immediately
      const symbol = resolvedConfig.config.broker.tradingPair;
      const timeframe = resolvedConfig.config.broker.candleTimeframe;

      // Subscribe to candles if method exists
      if (this.kraken.subscribeToCandles) {
        console.log(`Starting ${symbol} ${timeframe} subscription...`);
        this.kraken.subscribeToCandles(symbol, timeframe);
      }

      // Subscribe to OHLC events from the broker
      if (this.kraken.on) {
        const trackedSymbol = normalizeRuntimeSymbol(symbol);  // closure capture for updateLastPrice
        this.kraken.on('ohlc', (eventData) => {
          // CHANGE 2026-01-29: Handle multi-timeframe OHLC data
          const timeframe = eventData.timeframe || '1m';
          const raw = eventData.data || eventData;  // Support old format too
          const traceId = eventData.traceId || raw?.traceId || createTraceId('candle');
          emitTrace(this, 'CANDLE_INGRESS', {
            traceId,
            source: `single:${resolvedConfig.config.broker.id}`,
            brokerId: resolvedConfig.config.broker.id,
            timeframe,
            payloadSymbol: eventData.symbol || raw?.symbol || raw?.S || null,
          });

          // CHANGE 2026-04-24: Broker-agnostic OHLC normalizer. Every
          // adapter (Kraken arrays, Alpaca short-object, future adapters
          // with long-name fields) converges to one canonical shape
          // before reaching CandleProcessor / indicators. New brokers
          // stay dumb — they emit their native shape and this one-liner
          // handles translation. See foundation/ohlc-normalize.js.
          const normalizedOhlcData = normalizeOhlc(raw);
          if (!normalizedOhlcData) {
            console.warn('[OHLC] dropped unnormalizable payload from', timeframe, 'broker:', raw);
            return;
          }
          const ohlcData = normalizeOhlcForProcessor(normalizedOhlcData);
          if (!ohlcData) {
            console.warn('[OHLC] dropped payload with invalid timestamp from', timeframe, 'broker:', raw);
            return;
          }

          // FIX 2026-05-05: per-symbol price tracking for cross-asset equity.
          // Single-broker mode subscribes to one symbol — pass it through.
          const eventSymbol = eventData && eventData.symbol;
          const symbolSource = eventSymbol ? 'event.symbol' : 'subscription';
          const ohlcSymbol = normalizeRuntimeSymbol(eventSymbol || trackedSymbol);
          if (!ohlcSymbol) {
            console.error(`[VIS][OHLC][Runner] dropped ${timeframe} single-broker candle: missing symbol | broker=${resolvedConfig.config.broker.id} contexts=${describeSymbolContexts(this.symbolContexts)}`);
            return;
          }
          const ohlcClose = ohlcData[5];
          emitTrace(this, 'CANDLE_NORMALIZED', {
            traceId,
            source: `single:${resolvedConfig.config.broker.id}`,
            symbol: ohlcSymbol,
            timeframe,
            close: ohlcClose,
            etime: ohlcData[1],
          });
          this.lastBrokerDataReceived = Date.now();
          this.lastBrokerDataSymbol = ohlcSymbol;
          this.lastBrokerDataTimeframe = timeframe;
          if (stateManager && stateManager.updateLastPrice) {
            stateManager.updateLastPrice(ohlcSymbol, ohlcClose);
          }
          this._visOhlcSeen ??= new Set();
          const activeTf = this.timeframeSelector?.currentTimeframe || this.candleTimeframe;
          const visKey = `single:${resolvedConfig.config.broker.id}:${ohlcSymbol}:${timeframe}`;
          if (!this._visOhlcSeen.has(visKey) || timeframe === activeTf) {
            this._visOhlcSeen.add(visKey);
            console.log(`[VIS][OHLC][Runner] source=single broker=${resolvedConfig.config.broker.id} timeframe=${timeframe} symbolSource=${symbolSource} payloadSymbol=${eventSymbol || '(missing)'} symbol=${ohlcSymbol} close=${ohlcClose} contexts=${describeSymbolContexts(this.symbolContexts)}`);
          }

          // Store in timeframe-specific history for dashboard
          const storedCandle = this.storeTimeframeCandle(timeframe, ohlcData);
          this.storeSymbolTimeframeCandle(ohlcSymbol, timeframe, ohlcData);

          // Feed only the active trading timeframe to indicators + strategy context.
          if (timeframe === activeTf) {
            this._markActiveTimeframeData(ohlcSymbol, timeframe);
            this.handleMarketData({ data: ohlcData, symbol: ohlcSymbol, timeframe, traceId });
          } else {
            this._feedAggregatedActiveCandle({
              symbol: ohlcSymbol,
              sourceTimeframe: timeframe,
              activeTimeframe: activeTf,
              sourceLabel: `single:${resolvedConfig.config.broker.id}`,
              traceId,
            });
          }

          // CHANGE 2026-02-21: Re-evaluate best timeframe on 5m candle close
          if (timeframe === '5m' && this.timeframeSelector) {
            const tfResult = this.timeframeSelector.evaluate();
            if (tfResult.switched) {
              console.log(`Active trading timeframe: ${tfResult.timeframe} (score: ${tfResult.score.toFixed(2)})`);
            }
          }

          // CHANGE 2026-02-21: Trigger trading analysis on ACTIVE timeframe candle close
          if (timeframe === activeTf && storedCandle?.isNewCandle) {
            console.log(`V2: ${activeTf} candle closed - running trading analysis`);
            this.run15mTradingCycle(ohlcSymbol, traceId);
          } else if (timeframe === activeTf && storedCandle && !storedCandle.isNewCandle) {
            const skipKey = `single:${ohlcSymbol}:${timeframe}`;
            this._visActiveTfUpdateSkipped ??= new Set();
            if (!this._visActiveTfUpdateSkipped.has(skipKey)) {
              this._visActiveTfUpdateSkipped.add(skipKey);
              console.log(`[VIS][TradingCycle] waiting for new ${timeframe} candle boundary before analysis | symbol=${ohlcSymbol} etime=${storedCandle.candle?.etime || '(missing)'}`);
            }
          }
        });

        this.kraken.on('ticker', (data) => {
          if (data && data.price) {
            console.log(`V2 Ticker: $${data.price}`);
          }
        });

        console.log('V2: Subscribed to BrokerFactory events (single source of truth)');
      }
    } else {
      console.error('âŒ Broker not initialized');
    }
  }


  storeSymbolTimeframeCandle(symbol, timeframe, ohlcData) {
    const canonicalSymbol = normalizeRuntimeSymbol(symbol);
    if (!canonicalSymbol) return { isNewCandle: false, candle: null };

    if (!this.symbolTimeframeHistories) {
      this.symbolTimeframeHistories = new Map();
    }
    if (!this.symbolTimeframeHistories.has(canonicalSymbol)) {
      this.symbolTimeframeHistories.set(canonicalSymbol, new Map());
    }

    const byTimeframe = this.symbolTimeframeHistories.get(canonicalSymbol);
    if (!byTimeframe.has(timeframe)) {
      byTimeframe.set(timeframe, []);
    }

    if (!Array.isArray(ohlcData) || ohlcData.length < 8) {
      return { isNewCandle: false, candle: null };
    }

    const [time, etime, open, high, low, close, vwap, volume] = ohlcData;
    const candle = {
      t: parseFloat(time) * 1000,
      etime: parseFloat(etime) * 1000,
      o: parseFloat(open),
      h: parseFloat(high),
      l: parseFloat(low),
      c: parseFloat(close),
      v: parseFloat(volume)
    };

    const history = byTimeframe.get(timeframe);
    const lastCandle = history[history.length - 1];
    let isNewCandle = false;

    if (lastCandle && lastCandle.etime === candle.etime) {
      history[history.length - 1] = candle;
    } else {
      isNewCandle = true;
      history.push(candle);
      if (history.length > 200) {
        byTimeframe.set(timeframe, history.slice(-200));
      }
    }

    return { isNewCandle, candle };
  }

  getSymbolTimeframeCandles(symbol, timeframe) {
    const canonicalSymbol = normalizeRuntimeSymbol(symbol);
    if (!canonicalSymbol || !this.symbolTimeframeHistories) return [];
    return this.symbolTimeframeHistories.get(canonicalSymbol)?.get(timeframe) || [];
  }

  _feedAggregatedActiveCandle({ symbol, sourceTimeframe, activeTimeframe, sourceLabel, traceId }) {
    if (!this.candleAggregator || sourceTimeframe === activeTimeframe) {
      return null;
    }

    const sourceMs = this.candleAggregator.getIntervalMs(sourceTimeframe);
    const activeMs = this.candleAggregator.getIntervalMs(activeTimeframe);
    if (!sourceMs || !activeMs || sourceMs >= activeMs) {
      return null;
    }

    const sourceHistory = this.getSymbolTimeframeCandles(symbol, sourceTimeframe);
    if (sourceHistory.length === 0) {
      return null;
    }

    const completed = this.candleAggregator
      .aggregate(sourceHistory, activeTimeframe)
      .filter(candle => candle && this.candleAggregator.isPeriodComplete(candle.t, activeTimeframe));
    if (completed.length === 0) {
      return null;
    }

    const activeCandle = completed[completed.length - 1];
    const dedupeKey = `${symbol}:${activeTimeframe}:${activeCandle.t}`;
    if (this._emittedAggregatedActiveCandles.has(dedupeKey)) {
      return null;
    }

    const activeOhlc = candleToProcessorOhlc(activeCandle, activeMs);
    if (!activeOhlc) {
      console.error(`[VIS][OHLC][Aggregate] failed to convert aggregate ${sourceTimeframe}->${activeTimeframe} for ${symbol}`);
      return null;
    }

    const storedCandle = this.storeTimeframeCandle(activeTimeframe, activeOhlc);
    this.storeSymbolTimeframeCandle(symbol, activeTimeframe, activeOhlc);
    this._markActiveTimeframeData(symbol, activeTimeframe);
    emitTrace(this, 'ACTIVE_CANDLE_AGGREGATED', {
      traceId,
      source: sourceLabel,
      symbol,
      sourceTimeframe,
      activeTimeframe,
      periodStart: activeCandle.t,
      close: activeCandle.c,
    });
    this.handleMarketData({ data: activeOhlc, symbol, timeframe: activeTimeframe, traceId });
    this._emittedAggregatedActiveCandles.add(dedupeKey);
    if (this._emittedAggregatedActiveCandles.size > 1000) {
      this._emittedAggregatedActiveCandles = new Set(Array.from(this._emittedAggregatedActiveCandles).slice(-500));
    }

    console.log(`[VIS][OHLC][Aggregate] source=${sourceLabel} from=${sourceTimeframe} to=${activeTimeframe} symbol=${symbol} periodStart=${new Date(activeCandle.t).toISOString()} periodEnd=${new Date(activeCandle.t + activeMs).toISOString()} close=${activeCandle.c} sourceCandles=${sourceHistory.length} activeCandles=${this.priceHistory.length}`);

    if (storedCandle?.isNewCandle) {
      console.log(`V2: ${activeTimeframe} aggregate closed - running trading analysis`);
      this.run15mTradingCycle(symbol, traceId);
    }

    return { storedCandle, activeCandle };
  }

  /**
   * Handle incoming market data from WebSocket
   * REFACTOR Phase 19: Thin dispatcher to CandleProcessor
   */
  handleMarketData(ohlcData, traceContext = null) {
    this.candleProcessor.handleMarketData(ohlcData, traceContext);
  }

  /**
   * CHANGE 2026-01-29: Store candle in timeframe-specific history for dashboard
   * @param {string} timeframe - '1m', '5m', '15m', '30m', '1h', '1d'
   * @param {Array} ohlcData - Kraken OHLC array [time, etime, o, h, l, c, vwap, vol, count]
   */
  storeTimeframeCandle(timeframe, ohlcData) {
    if (!this.timeframeHistories[timeframe]) {
      this.timeframeHistories[timeframe] = [];
    }

    if (!Array.isArray(ohlcData) || ohlcData.length < 8) {
      return { isNewCandle: false, candle: null };
    }

    const [time, etime, open, high, low, close, vwap, volume] = ohlcData;
    const candle = {
      t: parseFloat(time) * 1000,
      etime: parseFloat(etime) * 1000,
      o: parseFloat(open),
      h: parseFloat(high),
      l: parseFloat(low),
      c: parseFloat(close),
      v: parseFloat(volume)
    };

    const history = this.timeframeHistories[timeframe];
    const lastCandle = history[history.length - 1];

    let isNewCandle = false;

    // Update existing candle or add new one based on etime
    if (lastCandle && lastCandle.etime === candle.etime) {
      history[history.length - 1] = candle;
    } else {
      isNewCandle = true;
      history.push(candle);
      // Keep max 200 candles per timeframe
      if (history.length > 200) {
        this.timeframeHistories[timeframe] = history.slice(-200);
      }
    }

    return { isNewCandle, candle };
  }

  /**
   * CHANGE 2026-01-29: Get candles for a specific timeframe (for dashboard)
   */
  getCandlesForTimeframe(timeframe) {
    // Default to 1m if invalid timeframe
    const tf = this.timeframeHistories[timeframe] ? timeframe : '1m';
    return this.timeframeHistories[tf] || this.priceHistory;
  }

  /**
   * CHANGE 2026-01-30: Fetch historical candles from Kraken REST API and send to dashboard
   * This is the PROPER way to get historical data - REST API, not just WebSocket cache
   * @param {string} timeframe - '1m', '5m', '15m', '30m', '1h', '4h', '1d'
   * @param {number} limit - Number of candles to fetch
   */
  async fetchAndSendHistoricalCandles(timeframe, limit = 200) {
    try {
      if (!this.kraken || !this.dashboardWs) {
        console.warn('[WARNING] Cannot fetch historical candles - broker or dashboard not connected');
        return;
      }

      console.log(`Fetching ${limit} historical ${timeframe} candles from Kraken REST API...`);

      // CHANGE 2026-02-10: Use active asset from MultiAssetManager if available
      const symbol = this.assetManager
        ? this.assetManager.toSlashFormat(this.assetManager.activeAsset)
        : resolvedConfig.config.broker.tradingPair;
      const candles = await this.kraken.getCandles(symbol, timeframe, limit);

      if (candles && candles.length > 0) {
        // Update our local cache with the fetched data
        this.timeframeHistories[timeframe] = candles.slice(-200);

        // Send to dashboard
        this.dashboardWs.send(JSON.stringify({
          type: 'historical_candles',
          timeframe: timeframe,
          candles: candles
        }));

        console.log(`Sent ${candles.length} historical ${timeframe} candles to dashboard`);
      } else {
        console.warn(`[WARNING] No historical candles returned for ${timeframe}`);
        // Fall back to cached WebSocket data if available
        const cached = this.getCandlesForTimeframe(timeframe);
        if (cached.length > 0) {
          this.dashboardWs.send(JSON.stringify({
            type: 'historical_candles',
            timeframe: timeframe,
            candles: cached
          }));
          console.log(`Sent ${cached.length} cached ${timeframe} candles as fallback`);
        }
      }
    } catch (error) {
      console.error(`âŒ Failed to fetch historical ${timeframe} candles:`, error.message);
      // Fall back to cached data
      const cached = this.getCandlesForTimeframe(timeframe);
      if (cached.length > 0 && this.dashboardWs) {
        this.dashboardWs.send(JSON.stringify({
          type: 'historical_candles',
          timeframe: timeframe,
          candles: cached
        }));
      }
    }
  }

  /**
   * Exit monitor - runs on the configured interval.
   *
   * Entries are candle-close driven through run15mTradingCycle(). Backtests
   * evaluate once per candle, so live/paper must not open positions from this
   * timer between candle closes. The timer remains for open-position exit
   * protection and operational warmup status.
   */
  startTradingCycle() {
    const interval = resolvedConfig.config.broker.tradingInterval;

    this.tradingInterval = setInterval(async () => {
      try {
        await this.ttpCutoffEnforcer?.enforce();
      } catch (error) {
        console.error('[TTP_MARKET_TIME] cutoff enforcement error:', error.message);
        console.error(error.stack);
      }

      const activeTrades = stateManager.get('activeTrades');
      const exitSymbols = activeTrades instanceof Map
        ? [...new Set(Array.from(activeTrades.values())
            .map(t => normalizeRuntimeSymbol(t.symbol))
            .filter(Boolean))]
        : [];

      if (exitSymbols.length === 0) {
        const activeSymbol = normalizeRuntimeSymbol(this.tradingPair);
        const activeHistory = activeSymbol && this.symbolContexts?.has(activeSymbol)
          ? this.symbolContexts.get(activeSymbol).priceHistory
          : this.priceHistory;
        if (!this.marketData || activeHistory.length < 3) {
          console.log(`[EXIT-MONITOR] warming up ${activeHistory.length}/3 candles (${this.candleTimeframe} timeframe); entries wait for candle close`);
        }
        return;
      }

      try {
        this.tradingLoop.ctx.marketData = this.marketData;
        this.tradingLoop.ctx.priceHistory = this.priceHistory;
        this.tradingLoop.ctx.symbolContexts = this.symbolContexts;
        this.tradingLoop.ctx.dashboardWs = this.dashboardWs;
        this.tradingLoop.ctx.dashboardWsConnected = this.dashboardWsConnected;
        this.tradingLoop.ctx._lastTraiDecision = this._lastTraiDecision;
        this.tradingLoop.ctx.executeTrade = this.executeTrade.bind(this);
        for (const symbol of exitSymbols) {
          await this.tradingLoop.checkExitsOnly(symbol);
        }
      } catch (error) {
        console.error('[EXIT-MONITOR] error:', error.message);
        console.error(error.stack);
      }
    }, interval);

    console.log(`[EXIT-MONITOR] started (${interval}ms interval); entries run on candle close only`);

    // CHANGE 2026-01-16: Liveness watchdog - catches "no data at all" scenario
    this.startLivenessWatchdog();
  }

  getTtpExitPrice(symbol, trade, brokerPositions = []) {
    const normalized = normalizeRuntimeSymbol(symbol || trade?.symbol);
    if (!normalized) return null;

    const brokerPosition = Array.isArray(brokerPositions)
      ? brokerPositions.find(pos => normalizeRuntimeSymbol(pos.symbol) === normalized)
      : null;
    const brokerPrice = Number(brokerPosition?.currentPrice);
    if (Number.isFinite(brokerPrice) && brokerPrice > 0) return brokerPrice;

    const ctx = this.symbolContexts?.get(normalized);
    const ctxPrice = Number(ctx?.marketData?.close);
    if (Number.isFinite(ctxPrice) && ctxPrice > 0) return ctxPrice;

    const activeMarketSymbol = normalizeRuntimeSymbol(this.marketData?.symbol);
    const marketPrice = Number(this.marketData?.close);
    if (activeMarketSymbol === normalized && Number.isFinite(marketPrice) && marketPrice > 0) {
      return marketPrice;
    }

    const candles = this.getSymbolTimeframeCandles(normalized, this.candleTimeframe);
    const latest = Array.isArray(candles) && candles.length > 0 ? candles[candles.length - 1] : null;
    const candlePrice = Number(latest?.close ?? latest?.c);
    if (Number.isFinite(candlePrice) && candlePrice > 0) return candlePrice;

    const statePrice = Number(stateManager.getLastPrice?.(normalized));
    return Number.isFinite(statePrice) && statePrice > 0 ? statePrice : null;
  }

  /**
   * Liveness watchdog - detects when data feed goes completely silent
   * Runs every 60 seconds, pauses trading if no data received in 2 minutes
   */
  _getLivenessSymbol() {
    return normalizeRuntimeSymbol(this.sessionRouter?.activeSession === 'crypto'
      ? this.sessionRouter?.cryptoSymbols?.[0]
      : this.tradingPair);
  }

  _getLivenessTimeframe() {
    const timeframe = this.timeframeSelector?.currentTimeframe || this.candleTimeframe;
    return typeof timeframe === 'string' && timeframe.trim() ? timeframe.trim() : null;
  }

  _markActiveTimeframeData(symbol, timeframe) {
    const canonicalSymbol = normalizeRuntimeSymbol(symbol);
    const activeTimeframe = this._getLivenessTimeframe();
    if (!canonicalSymbol || timeframe !== activeTimeframe) return;
    this.lastActiveTimeframeDataReceived = Date.now();
    this.lastActiveTimeframeSymbol = canonicalSymbol;
    this.lastActiveTimeframe = activeTimeframe;
  }

  _isExpectedMarketQuiet() {
    if (this.sessionRouter?.enabled && this.sessionRouter.activeSession === 'crypto') {
      return false;
    }

    const brokerId = this.sessionRouter?.activeBroker?.id || resolvedConfig.config.broker.id;
    const assetClass = process.env.ASSET_CLASS || resolvedConfig.config.broker.assetClass || '';
    const isStockFeed = this.sessionRouter?.activeSession === 'stocks' || assetClass === 'stocks' || brokerId === 'alpaca';
    if (!isStockFeed) return false;

    const phase = this.marketCalendar.getMarketPhase(new Date());
    if (phase.isOpen) return false;

    const now = Date.now();
    if (!this._lastExpectedQuietLogAt || now - this._lastExpectedQuietLogAt > 5 * 60 * 1000) {
      this._lastExpectedQuietLogAt = now;
      console.log(`[WATCHDOG] market data quiet expected | broker=${brokerId} assetClass=${assetClass || '(missing)'} phase=${phase.phase} next=${phase.nextTransition}`);
    }
    return true;
  }

  async _attemptLivenessBackfill(symbol, timeframe) {
    const broker = this.sessionRouter?.activeBroker || this.kraken;
    if (!broker || typeof broker.getCandles !== 'function') {
      throw new Error('active broker has no getCandles()');
    }

    const rawCandles = await broker.getCandles(symbol, timeframe, LIVENESS_BACKFILL_LIMIT);
    const timeframeMs = this.candleAggregator?.getIntervalMs(timeframe);
    if (!Number.isFinite(timeframeMs) || timeframeMs <= 0) {
      throw new Error(`invalid liveness timeframe ${timeframe}`);
    }

    const candles = (Array.isArray(rawCandles) ? rawCandles : [])
      .map(c => this._normalizeHydrationCandle(c, symbol, timeframe, timeframeMs))
      .filter(Boolean)
      .sort((a, b) => a.etime - b.etime);

    if (candles.length === 0) {
      return 0;
    }

    const latest = candles[candles.length - 1];
    const maxBackfillAgeMs = timeframeMs * 2 + 60 * 1000;
    const latestAgeMs = Date.now() - latest.etime;
    if (latestAgeMs > maxBackfillAgeMs) {
      throw new Error(`latest REST candle is stale (${Math.round(latestAgeMs / 1000)}s old)`);
    }

    let applied = 0;
    for (const candle of candles) {
      const ohlc = candleToProcessorOhlc(candle, timeframeMs);
      if (!ohlc) continue;
      this.candleProcessor.processNewCandle(candle, { persist: false });
      this.storeTimeframeCandle(timeframe, ohlc);
      this.storeSymbolTimeframeCandle(symbol, timeframe, ohlc);
      applied++;
    }

    if (applied > 0) {
      const marketData = {
        symbol,
        price: latest.c,
        timestamp: latest.t,
        timeframe,
        systemTime: Date.now(),
        volume: Number.isFinite(latest.v) ? latest.v : null,
        open: latest.o,
        high: latest.h,
        low: latest.l
      };
      this.marketData = marketData;
      const symCtx = this.symbolContexts?.get(symbol);
      if (symCtx) symCtx.marketData = marketData;
      if (stateManager && stateManager.updateLastPrice) {
        stateManager.updateLastPrice(symbol, latest.c);
      }
      this._markActiveTimeframeData(symbol, timeframe);
    }

    return applied;
  }

  startLivenessWatchdog() {
    const LIVENESS_CHECK_INTERVAL = 60000;  // Check every 60 seconds
    const MAX_DATA_SILENCE = 120000;  // 2 minutes without data = dead feed
    this.livenessWatchdogStartedAt = Date.now();

    this.livenessCheckInterval = setInterval(async () => {
      if (this._isExpectedMarketQuiet()) {
        return;
      }

      const symbol = this._getLivenessSymbol();
      const timeframe = this._getLivenessTimeframe();
      const timeframeMs = timeframe ? this.candleAggregator?.getIntervalMs(timeframe) : null;
      const activeLimitMs = Number.isFinite(timeframeMs) && timeframeMs > 0
        ? Math.max(MAX_DATA_SILENCE, timeframeMs * 1.5 + 60 * 1000)
        : MAX_DATA_SILENCE;
      const brokerSilenceDuration = Date.now() - (this.lastBrokerDataReceived || this.livenessWatchdogStartedAt);
      const activeSilenceDuration = Date.now() - (this.lastActiveTimeframeDataReceived || this.lastDataReceived || this.livenessWatchdogStartedAt);
      const brokerSilent = brokerSilenceDuration > MAX_DATA_SILENCE;
      const activeTimeframeSilent = activeSilenceDuration > activeLimitMs;

      if ((brokerSilent || activeTimeframeSilent) && !this.staleFeedPaused) {
        if (!symbol || !timeframe) {
          console.error(`[CRITICAL] LIVENESS WATCHDOG: missing symbol/timeframe (symbol=${symbol || '(missing)'} timeframe=${timeframe || '(missing)'})`);
          this.staleFeedPaused = true;
          stateManager.pauseTrading('Liveness watchdog: missing symbol/timeframe');
          return;
        }

        console.warn(`[WATCHDOG] LIVENESS: brokerSilent=${brokerSilent} brokerSilence=${Math.round(brokerSilenceDuration / 1000)}s activeTimeframeSilent=${activeTimeframeSilent} activeSilence=${Math.round(activeSilenceDuration / 1000)}s activeLimit=${Math.round(activeLimitMs / 1000)}s | symbol=${symbol} timeframe=${timeframe} lastBrokerSymbol=${this.lastBrokerDataSymbol || '(none)'} lastBrokerTimeframe=${this.lastBrokerDataTimeframe || '(none)'} lastActiveSymbol=${this.lastActiveTimeframeSymbol || '(none)'} lastActiveTimeframe=${this.lastActiveTimeframe || '(none)'} - attempting REST backfill`);

        // ATTEMPT BACKFILL FIRST before halting
        try {
          const recovered = await this._attemptLivenessBackfill(symbol, timeframe);
          if (recovered > 0) {
            this.lastBrokerDataReceived = Date.now();
            this.lastBrokerDataSymbol = symbol;
            this.lastBrokerDataTimeframe = timeframe;
            console.log(`[WATCHDOG] data feed recovered via REST backfill | symbol=${symbol} timeframe=${timeframe} candles=${recovered}`);
            return; // Don't halt - we recovered
          }
        } catch (backfillError) {
          console.error(`[WATCHDOG] REST backfill failed | symbol=${symbol} timeframe=${timeframe}:`, backfillError.message);
        }

        // Backfill failed - now halt
        console.error(`[CRITICAL] LIVENESS WATCHDOG: BACKFILL FAILED - HALTING | symbol=${symbol} timeframe=${timeframe}`);
        console.error('[WATCHDOG] PAUSING TRADING - DATA FEED APPEARS DEAD');
        this.staleFeedPaused = true;

        // Notify StateManager to pause
        try {
          const { getInstance: getStateManager } = require('./core/StateManager');
          const stateManager = getStateManager();
          stateManager.pauseTrading(`Liveness watchdog: brokerSilent=${brokerSilent} activeTimeframeSilent=${activeTimeframeSilent}, backfill failed`);
        } catch (error) {
          console.error('Failed to pause via StateManager:', error.message);
        }
      }
    }, LIVENESS_CHECK_INTERVAL);

    console.log('Liveness watchdog started (checks every 60s, attempts REST backfill before halting)');
  }

  /**
   * Analyze market and execute trades
   * Core trading pipeline orchestration
   * REFACTOR Phase 15: Thin dispatcher - delegates to TradingLoop
   */
  /**
   * RUN-LOW-01: 15-minute candle close handler. Previously called at :669
   * and :1307 but never defined — TypeError on first 15m candle close in
   * live/paper mode. Defined as alias to analyzeAndTrade since the trading
   * loop doesn't differentiate timeframes.
   */
  async run15mTradingCycle(symbol = this.tradingPair, traceId = null) {
    // CC-C Commit 5/6: pass single-symbol canonical explicitly. Multi-symbol
    // mode (commit 6+) will dispatch per-symbol from the OHLC handler.
    const analysisSymbol = normalizeRuntimeSymbol(symbol);
    if (!analysisSymbol) {
      throw new Error(`run15mTradingCycle requires canonical symbol; got ${JSON.stringify(symbol)}`);
    }
    const cycleTraceId = traceId || createTraceId('candle');
    emitTrace(this, 'TRADING_CYCLE_TRIGGER', {
      traceId: cycleTraceId,
      symbol: analysisSymbol,
      timeframe: this.timeframeSelector?.currentTimeframe || this.candleTimeframe,
      defaultTradingPair: this.tradingPair,
    });
    console.log(`[VIS][TradingCycle] triggerSymbol=${analysisSymbol} defaultTradingPair=${this.tradingPair}`);
    return this.analyzeAndTrade(analysisSymbol, cycleTraceId);
  }

  async analyzeAndTrade(symbol, traceId = null) {
    // CC-C Commit 5/6: `symbol` is REQUIRED. Caller passes the symbol whose
    // candle is being acted on. TradingLoop.analyzeAndTrade enforces this
    // upstream; the redundant entry-check here keeps the runner-side contract
    // explicit too. No fallback to this.tradingPair here — the caller is
    // expected to pass the canonical value (see :1538, :1628 sites).
    if (typeof symbol !== 'string' || !symbol) {
      throw new Error(
        `OGZPrimeV14Bot.analyzeAndTrade requires explicit non-empty symbol; got ${JSON.stringify(symbol)}`
      );
    }
    // Update context with current instance state before delegating
    this.tradingLoop.ctx.marketData = this.marketData;
    this.tradingLoop.ctx.priceHistory = this.priceHistory;
    this.tradingLoop.ctx.symbolContexts = this.symbolContexts;
    this.tradingLoop.ctx.dashboardWs = this.dashboardWs;
    this.tradingLoop.ctx.dashboardWsConnected = this.dashboardWsConnected;
    this.tradingLoop.ctx._lastTraiDecision = this._lastTraiDecision;
    this.tradingLoop.ctx.executeTrade = this.executeTrade.bind(this);
    this.tradingLoop.ctx.broadcastPatternAnalysis = this.broadcastPatternAnalysis.bind(this);
    return this.tradingLoop.analyzeAndTrade(symbol, traceId || undefined);
  }


  // REMOVED 2026-02-01: calculateAutoDrawLevels() - Dead code (call was commented out)
  // ~275 lines removed - was never invoked, only definition existed

  // REMOVED Phase 16: makeTradeDecision() - Dead code (~400 lines)
  // Phase 3 REWRITE: EntryDecider deleted, logic inlined to TradingLoop


  /**
   * Execute a trade - PHASE 14 THIN DISPATCHER
   * Original logic moved to core/OrderExecutor.js
   * Phase 3 REWRITE: Renamed brainDecision → orchResult (orchestrator result)
   */
  async executeTrade(decision, confidenceData, price, indicators, patterns, traiDecision = null, orchResult = null, symbol) {
    // Update context with current runtime values
    this.orderExecutor.ctx.marketData = this.marketData;
    this.orderExecutor.ctx.dashboardWs = this.dashboardWs;
    this.orderExecutor.ctx.dashboardWsConnected = this.dashboardWsConnected;
    this.orderExecutor.ctx._lastTraiDecision = this._lastTraiDecision;

    // CC-C Commit 5/6: forward `symbol` through to OrderExecutor. Required
    // param — TradingLoop resolves it before calling, this wrapper just
    // threads it. No fallback to ctx.tradingPair here; if symbol is
    // missing OrderExecutor's entry-check throws (caller has the bug).
    return this.orderExecutor.executeTrade(decision, confidenceData, price, indicators, patterns, traiDecision, orchResult, symbol);
  }

  // REMOVED 2026-03-03: Original executeTrade() body (~810 lines) moved to core/OrderExecutor.js

  // REMOVED 2026-02-01: calculateSimpleIndicators() and calculateEMA() - Dead code
  // ~45 lines removed - never invoked, indicators come from OptimizedIndicators.js

  /**
   * Broadcast pattern analysis to dashboard for transparency
   */
  broadcastPatternAnalysis(patterns, indicators) {
    try {
      if (this.dashboardWs && this.dashboardWs.readyState === 1) {
        // Format patterns for display
        const primaryPattern = patterns && patterns.length > 0 ? patterns[0] : null;

        // Phase 2 REWRITE: profileManager deleted - profiles now in TradingConfig
        const activeProfile = resolvedConfig.config.misc.tradingProfile;

        // CHANGE 2.0.12: Include pattern memory stats in dashboard
        const patternMemoryCount = this.patternChecker?.memory?.patternCount || 0;
        const patternMemorySize = Object.keys(this.patternChecker?.memory?.memory || {}).length;

        // Generate ghost path projection when a pattern is detected with confidence > 50%
        // Refuses to project during warmup — atr null means we don't know the noise scale
        let projectionPath = undefined;
        const price = indicators.price;
        if (primaryPattern && (primaryPattern.confidence || 0) > 0.5 && indicators.atr != null && price != null) {
          const direction = primaryPattern.direction === 'bullish' ? 1 : -1;
          const currentTime = Math.floor(Date.now() / 1000);
          const atr = indicators.atr;
          projectionPath = [];
          for (let i = 1; i <= 15; i++) {
            const drift = direction * atr * 0.1 * i + (Math.random() - 0.5) * atr * 0.05;
            projectionPath.push({
              time: currentTime + (i * 900), // 15-min increments
              value: price + drift
            });
          }
        }

        const message = {
          type: 'pattern_analysis',
          timestamp: Date.now(),
          projection_path: projectionPath,
          pattern: {
            name: primaryPattern?.name || primaryPattern?.type || 'No strong pattern',
            confidence: primaryPattern?.confidence || 0,
            description: this.getPatternDescription(primaryPattern, indicators),
            allPatterns: patterns.map(p => ({
              name: p.name || p.type || 'unknown',
              confidence: p.confidence || 0
            }))
          },
          patternMemory: {
            count: patternMemoryCount,
            uniquePatterns: patternMemorySize,
            growthRate: `${(patternMemoryCount / Math.max(1, this.candleCount)).toFixed(2)} patterns/candle`,
            status: patternMemoryCount > 100 ? 'Learning Active ' : 'Building Memory '
          },
          indicators: {
            rsi: indicators.rsi,
            macd: indicators.macd?.macd ?? indicators.macd?.macdLine ?? null,
            macdSignal: indicators.macd?.signal ?? indicators.macd?.signalLine ?? null,
            trend: indicators.trend,
            volatility: indicators.volatility,
            // CHANGE 2026-01-25: Send EMA in format dashboard expects (ema[20], ema[50], ema[200])
            // Use getRawState() for dashboard compatibility with legacy format
            ema: indicatorEngine.getRawState().ema || {},
            // CHANGE 2026-01-25: Send BB and VWAP for dashboard overlays
            bb: indicatorEngine.getRawState().bb || {},
            vwap: indicatorEngine.getRawState().vwap || null
          },
          profile: {
            name: activeProfile.name,
            description: activeProfile.description,
            minConfidence: activeProfile.minConfidence,
            tradesPerDay: activeProfile.tradesPerDay
          }
        };

        this.dashboardWs.send(JSON.stringify(message));
      }
    } catch (error) {
      // Fail silently - don't let dashboard issues affect trading
      console.error('[WARNING] Pattern broadcast failed:', error.message);
    }
  }

  /**
   * BACKTEST MODE: Load historical data and run simulation
   * REFACTOR Phase 18: Thin dispatcher - delegates to BacktestRunner
   */
  async loadHistoricalDataAndBacktest() {
    // Update context with current instance state before delegating
    this.backtestRunner.ctx.priceHistory = this.priceHistory;
    this.backtestRunner.ctx.handleMarketData = this.handleMarketData.bind(this);
    // CC-C Commit 5/6: bind the single-symbol tradingPair into the closure
    // so BacktestRunner stays symbol-agnostic (it's a candle-pump loop, owns
    // no symbol state). this.tradingPair is the env-resolved single-symbol
    // canonical. Multi-symbol BacktestRunner (commit 6+) replaces this with
    // per-candle dispatch.
    const tradingPair = this.tradingPair;
    this.backtestRunner.ctx.symbol = tradingPair;
    this.backtestRunner.ctx.timeframe = this.candleTimeframe;
    this.backtestRunner.ctx.config = this.config;
    this.backtestRunner.ctx.backtestMode = resolvedConfig.config.mode.backtest;
    this.backtestRunner.ctx.analyzeAndTrade = (traceId) => this.analyzeAndTrade(tradingPair, traceId);
    return this.backtestRunner.loadHistoricalDataAndBacktest();
  }


  /**
   * Get human-readable pattern description
   */
  getPatternDescription(pattern, indicators) {
    if (!pattern) {
      return `Market scanning - RSI: ${indicators.rsi?.toFixed(1)}, Trend: ${indicators.trend}, MACD: ${(indicators.macd?.macd || 0).toFixed(4)}`;
    }
    const patternName = pattern.name || pattern.type || 'unknown';
    return patternDescriptions[patternName] || `${patternName} pattern detected with ${(pattern.confidence * 100).toFixed(1)}% confidence. Analyzing market structure and momentum.`;
  }

  /**
   * Fetch real market context from web for TRAI
   * Delegates to TRAIWebContext module
   */
  async fetchWebMarketContext(query = '') {
    try {
      return await TRAIWebContext.getMarketContext(query);
    } catch (error) {
      console.warn('[TRAI Web] Failed to fetch market context:', error.message);
      return null;
    }
  }

  /**
   * Handle TRAI chat queries from dashboard
   * Used for tech support and customer questions
   * Includes live market context for NLP-style queries
   */
  async handleTraiQuery(msg) {
    const { query, queryId, sessionId } = msg;

    try {
      // CHANGE 2026-01-31: Fetch REAL market context from web (detects asset from query)
      const webContext = await this.fetchWebMarketContext(query);

      // Build live market context for TRAI
      // Phase 2 REWRITE: executionLayer deleted - use stateManager for position info
      const lastCandle = this.priceHistory[this.priceHistory.length - 1];
      const stats = {};
      const position = stateManager.getPosition();

      const marketContext = {
        source: 'dashboard_chat',
        sessionId: sessionId,
        timestamp: Date.now(),
        // REAL market data from web (if available)
        ...(webContext && {
          currentPrice: webContext.price,
          change24h: webContext.change24h,
          change7d: webContext.change7d,
          change30d: webContext.change30d,
          high24h: webContext.high24h,
          low24h: webContext.low24h,
          ath: webContext.ath,
          athDate: webContext.athDate,
          athChangePercent: webContext.athChangePercent,
          assetType: webContext.assetType,
          assetName: webContext.assetName,
          asset: webContext.asset,
          // CHANGE 2026-02-01: Fear & Greed Index for crypto
          fearGreedIndex: webContext.fearGreedIndex || null,
          fearGreedLabel: webContext.fearGreedLabel || null,
          // CHANGE 2026-02-01: News Headlines for market context
          newsHeadlines: webContext.newsHeadlines || [],
          marketSentiment: webContext.sentimentUp > 60 ? 'BULLISH' :
                          webContext.sentimentDown > 60 ? 'BEARISH' : 'NEUTRAL'
        }),
        // Fallback to local data if web fetch failed
        ...(!webContext && {
          currentPrice: lastCandle?.c || this.currentPrice,
          priceChange24h: 'N/A (web fetch failed)',
        }),
        candleCount: this.priceHistory.length,
        // Bot status
        botMode: this.config.sandboxMode ? 'PAPER' : 'LIVE',
        isTrading: this.isRunning,
        totalTrades: stats.totalTrades || 0,
        winRate: stats.winRate || '0%',
        balance: stats.balance || '0.00',
        // Current position
        hasOpenPosition: !!position,
        positionDirection: position?.direction || null,
        positionPnL: position?.pnl?.toFixed(2) || null,
        // Indicators (if available)
        lastDecision: this.lastDecisionContext?.decision || 'HOLD',
        confidence: this.lastDecisionContext?.confidence || 0
      };

      // Process query with TRAICore (chat/queries go to core, not decision module)
      if (!this.trai.traiCore) {
        throw new Error('TRAI Core not available - LLM inference server not running');
      }
      const response = await this.trai.traiCore.processQuery(query, marketContext);

      // Send response back to dashboard
      if (this.dashboardWs && this.dashboardWs.readyState === 1) {
        this.dashboardWs.send(JSON.stringify({
          type: 'trai_response',
          queryId: queryId,
          sessionId: sessionId,
          // CHANGE 2026-01-31: Use explicit check - empty string is valid, don't fall through to whole object
          response: (response.response !== undefined && response.response !== null)
            ? response.response
            : (response.message || response.text || 'Unable to generate response'),
          timestamp: Date.now()
        }));
        console.log('[TRAI] Sent chat response');
      }
    } catch (error) {
      console.error('âŒ [TRAI] Chat query failed:', error.message);

      // Send error response
      if (this.dashboardWs && this.dashboardWs.readyState === 1) {
        this.dashboardWs.send(JSON.stringify({
          type: 'trai_response',
          queryId: queryId,
          sessionId: sessionId,
          response: 'Sorry, I encountered an issue processing your question. Please try again.',
          error: true,
          timestamp: Date.now()
        }));
      }
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('\nShutting down OGZ Prime V14 MERGED...');
    this.isRunning = false;

    // Stop SessionRouter interval before clearing other timers (memory leak fix)
    if (this.sessionRouter) this.sessionRouter.stop();

    if (this.tradingInterval) {
      clearInterval(this.tradingInterval);
    }

    // CHANGE 2026-01-21: Clear liveness watchdog interval (memory leak fix)
    if (this.livenessCheckInterval) {
      clearInterval(this.livenessCheckInterval);
      console.log('Liveness watchdog interval cleaned up');
    }

    // CHANGE 2026-01-29: Clear heartbeat interval (memory leak fix)
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('Heartbeat interval cleaned up');
    }

    // CRITICAL: Remove event listeners before closing (Change 575 - Memory leak fix)
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      console.log('Market data WebSocket cleaned up');
    }

    // CHANGE 2026-02-10: Cleanup modular entry system
    if (this.mtfAdapter) this.mtfAdapter.destroy();
    if (this.emaCrossover) this.emaCrossover.destroy();
    if (this.maDynamicSR) this.maDynamicSR.destroy();
    if (this.liquiditySweep) this.liquiditySweep.destroy();
    console.log('Modular Entry System cleaned up');

    if (this.dashboardWs) {
      this.dashboardWs.removeAllListeners();
      this.dashboardWs.close();
      console.log('Dashboard WebSocket cleaned up');
    }

    // Shutdown TRAI LLM server (Change 579)
    if (this.trai && this.trai.traiCore) {
      this.trai.traiCore.shutdown();
      console.log('TRAI Core shutdown complete');
    }

    // CHANGE 2025-12-12: Cleanup RiskManager timer leak
    if (this.riskManager) {
      this.riskManager.shutdown();
      console.log('RiskManager timers cleaned up');
    }

    // FIX 2026-02-10: Save pattern memory before exit (was never being saved!)
    // FIX 2026-02-19: Await async cleanup
    if (this.patternChecker?.cleanup) {
      await this.patternChecker.cleanup();
      console.log('Pattern memory saved to disk');
    }

    // Print final performance stats
    console.log('\nFinal Performance:');
    console.log(`   Session Duration: ${((Date.now() - this.startTime) / 1000 / 60).toFixed(1)} minutes`);
    // Final Balance removed — BacktestRecorder's BACKTEST SUMMARY is the source of truth

    console.log('\nShutdown complete\n');
    process.exit(0);
  }

  /**
   * Broadcast Edge Analytics data to dashboard
   * REFACTOR Phase 17: Thin dispatcher - delegates to DashboardBroadcaster
   */
  broadcastEdgeAnalytics(price, volume, candle) {
    this.dashboardBroadcaster.ctx.dashboardWs = this.dashboardWs;
    this.dashboardBroadcaster.ctx.priceHistory = this.priceHistory;
    return this.dashboardBroadcaster.broadcastEdgeAnalytics(price, volume, candle);
  }

  /**
   * Calculate price volatility for Fear & Greed
   * REFACTOR Phase 17: Thin dispatcher
   */
  calculateVolatility() {
    this.dashboardBroadcaster.ctx.priceHistory = this.priceHistory;
    return this.dashboardBroadcaster.calculateVolatility();
  }

  /**
   * Detect price/indicator divergences
   * REFACTOR Phase 17: Thin dispatcher
   */
  detectDivergences() {
    this.dashboardBroadcaster.ctx.priceHistory = this.priceHistory;
    return this.dashboardBroadcaster.detectDivergences();
  }

}

// Main execution
async function main() {
  const bot = new OGZPrimeV14Bot();

  // Graceful shutdown handlers
  process.on('SIGINT', () => bot.shutdown());
  process.on('SIGTERM', () => bot.shutdown());
  process.on('uncaughtException', (error) => {
    console.error('âŒ Uncaught exception:', error);
    bot.shutdown();
  });

  // CRITICAL: Handle unhandled promise rejections (Change 575)
  process.on('unhandledRejection', (reason, promise) => {
    console.error('âŒ Unhandled Promise Rejection:', reason);
    console.error('   Promise:', promise);
    // Log but don't shutdown - async failures shouldn't kill bot
    console.error('   Bot continuing despite rejection...');
  });

  await bot.start();
}

// Run bot
if (require.main === module) {
  main().catch(error => {
    console.error('âŒ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = OGZPrimeV14Bot;
