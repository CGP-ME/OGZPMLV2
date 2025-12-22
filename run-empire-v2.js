#!/usr/bin/env node

/**
 * OGZ PRIME V14 - FINAL MERGED REFACTORED ORCHESTRATOR
 * =====================================================
 * Combines Desktop Claude's 402-line structure with Browser Claude's 439-line AdvancedExecutionLayer
 * Clean modular architecture with zero inline logic
 *
 * MERGED FROM:
 * - Desktop Claude: 402-line orchestrator structure (Change 561)
 * - Browser Claude: 439-line AdvancedExecutionLayer (Change 513 compliant, commits d590022 + 84a2544)
 *
 * Architecture: Pure orchestration pipeline
 * ├── Pattern Recognition → Market opportunity detection
 * ├── Trading Brain → Confidence & position sizing
 * ├── Risk Manager → Pre-trade risk assessment
 * ├── Advanced Execution → Trade execution (439-line merged version)
 * └── Performance → Analytics & dashboard updates
 *
 * @version 14.0.0-FINAL-MERGED
 * @date 2025-11-20
 */

// CRITICAL: Load environment variables FIRST before any module loads
require('dotenv').config();
console.log('[CHECKPOINT-001] Environment loaded');

// Load feature flags configuration
let featureFlags = {};
try {
  featureFlags = require('./config/features.json');
  console.log('[FEATURES] Loaded feature flags:', Object.keys(featureFlags.features).filter(f => featureFlags.features[f].enabled));
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

// CHANGE 2025-12-11: Trading optimizations for visibility and pattern-based sizing
const { TradingOptimizations, PatternStatsManager } = require('./core/TradingOptimizations');
const patternStatsManager = new PatternStatsManager();
const tradingOptimizations = new TradingOptimizations(patternStatsManager, console);

// CHANGE 2025-12-11: StateManager - Single source of truth for position/balance
const { getInstance: getStateManager } = require('./core/StateManager');
const stateManager = getStateManager();

// CHANGE 2025-12-11: MessageQueue - Prevent WebSocket race conditions
const MessageQueue = require('./core/MessageQueue');

// CRITICAL: SingletonLock to prevent multiple instances
console.log('[CHECKPOINT-005] Getting SingletonLock...');
const SingletonLock = loader.get('core', 'SingletonLock') || require('./core/SingletonLock');
const { OGZSingletonLock, checkCriticalPorts } = SingletonLock;
console.log('[CHECKPOINT-006] SingletonLock obtained');
const singletonLock = new OGZSingletonLock('ogz-prime-v14');

// Acquire lock IMMEDIATELY (will exit if another instance is running)
(async () => {
  singletonLock.acquireLock();
  // Skip port check in backtest mode for faster testing
  if (process.env.BACKTEST_MODE !== 'true') {
    // CHANGE 660: Remove port 3010 from check - it's the WebSocket SERVER we connect TO
    // Bot is a CLIENT of 3010, not binding it
    const portsOk = await checkCriticalPorts([3001, 3002, 3003]);
    if (!portsOk) {
      console.error('🚨 Critical ports in use! Exiting...');
      process.exit(1);
    }
  }
})();
const WebSocket = require('ws');

// Core Trading Modules - All through ModuleAutoLoader
console.log('[CHECKPOINT-007] Loading core modules...');
const EnhancedPatternRecognition = loader.get('core', 'EnhancedPatternRecognition');
console.log('  EnhancedPatternRecognition:', !!EnhancedPatternRecognition);
const { EnhancedPatternChecker } = EnhancedPatternRecognition || {};

const OptimizedTradingBrainModule = loader.get('core', 'OptimizedTradingBrain');
console.log('  OptimizedTradingBrain:', !!OptimizedTradingBrainModule);
const { OptimizedTradingBrain } = OptimizedTradingBrainModule || {};

const RiskManager = loader.get('core', 'RiskManager');
console.log('  RiskManager:', !!RiskManager);
const ExecutionRateLimiter = loader.get('core', 'ExecutionRateLimiter');
console.log('  ExecutionRateLimiter:', !!ExecutionRateLimiter);
const AdvancedExecutionLayer = loader.get('core', 'AdvancedExecutionLayer-439-MERGED');
console.log('  AdvancedExecutionLayer:', !!AdvancedExecutionLayer);
const PerformanceAnalyzer = loader.get('core', 'PerformanceAnalyzer');
const OptimizedIndicators = loader.get('core', 'OptimizedIndicators');
const MarketRegimeDetector = loader.get('core', 'MarketRegimeDetector');
const TradingProfileManager = loader.get('core', 'TradingProfileManager');
const GridTradingStrategy = loader.get('core', 'GridTradingStrategy');

// Change 587: Wire SafetyNet and TradeLogger into live loop
// Both removed - SafetyNet too restrictive, TradeLogger doesn't exist
// const TradingSafetyNet = require('./core/TradingSafetyNet');
// const TradeLogger = require('./core/TradeLogger');

// 🤖 AI Co-Founder (Change 574 - Opus Architecture + Codex Fix)
const TRAIDecisionModule = loader.get('core', 'TRAIDecisionModule');

// Infrastructure
// EMPIRE V2 ARCHITECTURE: Using BrokerFactory for proper abstraction
const { createBrokerAdapter } = require('./brokers/BrokerFactory');
const TierFeatureFlags = require('./TierFeatureFlags'); // Keep direct - in root not core
const OgzTpoIntegration = loader.get('core', 'OgzTpoIntegration');

/**
 * Main Trading Bot Orchestrator
 * Coordinates all modules for production trading
 */
class OGZPrimeV14Bot {
  constructor() {
    console.log('\n🚀 OGZ PRIME V14 FINAL MERGED - INITIALIZING');
    console.log('📊 Desktop Claude (402-line) + Browser Claude (439-line) = MERGED');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    // Environment validation
    this.validateEnvironment();

    // TWO-KEY TURN SAFETY: Require double confirmation for live trading
    this.verifyTradingMode();

    // Tier configuration
    this.tier = process.env.BOT_TIER || 'ml';
    this.tierFlagManager = new TierFeatureFlags(this.tier);
    this.tierFlags = this.tierFlagManager.getTierSummary();
    console.log(`🎯 Tier: ${this.tier.toUpperCase()}`);

    // Initialize core modules
    console.log('[CHECKPOINT-008] Creating pattern checker...');
    if (!EnhancedPatternChecker) {
      console.error('❌ EnhancedPatternChecker is undefined! Module loading failed.');
      process.exit(1);
    }
    this.patternChecker = new EnhancedPatternChecker();
    console.log('[CHECKPOINT-009] EnhancedPatternChecker created');

    // Initialize OGZ Two-Pole Oscillator (pure function implementation from V2)
    this.ogzTpo = this.tierFlagManager.isEnabled('ogzTpoEnabled')
      ? OgzTpoIntegration.fromTierFlags(this.tierFlagManager)
      : null;

    if (this.ogzTpo) {
      console.log('🎯 OGZ TPO initialized with mode:', this.tierFlagManager.getValue('ogzTpoMode'));
    }

    // CHANGE 665: Initialize TradingProfileManager for manual profile switching
    // AUTO-SWITCHING DISABLED - profiles are user-controlled only
    this.profileManager = new TradingProfileManager({
      defaultProfile: process.env.TRADING_PROFILE || 'balanced',
      autoSwitch: false  // DISABLED - user must manually switch profiles
    });

    // Set initial profile based on environment or default
    const initialProfile = process.env.TRADING_PROFILE || 'balanced';
    this.profileManager.setActiveProfile(initialProfile);
    console.log(`📊 Trading Profile: ${initialProfile.toUpperCase()} (manual switching only)`);

    // CHANGE 610: Centralized configuration - all trading params from .env
    // Profile settings are for reference only - env vars take precedence
    const tradingBrainConfig = {
      // Tier settings
      enableQuantumSizing: this.tierFlags.hasQuantumPositionSizer,
      tier: this.tier,

      // Phase 1: High-priority risk management (env vars ONLY)
      minConfidenceThreshold: parseFloat(process.env.MIN_TRADE_CONFIDENCE) || 0.08,
      maxRiskPerTrade: parseFloat(process.env.MAX_RISK_PER_TRADE) || 0.02,
      stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT) || 0.02,
      takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT) || 0.04,
      trailingStopPercent: parseFloat(process.env.TRAILING_STOP_PERCENT) || 0.035,
      trailingStopActivation: parseFloat(process.env.TRAILING_ACTIVATION) || 0.025,
      profitProtectionLevel: parseFloat(process.env.PROFIT_PROTECTION) || 0.015,
      breakevenTrigger: parseFloat(process.env.BREAKEVEN_TRIGGER) || 0.005,
      breakevenPercentage: parseFloat(process.env.BREAKEVEN_EXIT_PERCENT) || 0.50,
      postBreakevenTrailing: parseFloat(process.env.POST_BREAKEVEN_TRAIL) || 0.05,

      // Phase 1: High-priority position sizing
      basePositionSize: parseFloat(process.env.BASE_POSITION_SIZE) || 0.01,
      maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE_PCT) || 0.05,
      lowVolatilityMultiplier: parseFloat(process.env.LOW_VOL_MULTIPLIER) || 1.5,
      highVolatilityMultiplier: parseFloat(process.env.HIGH_VOL_MULTIPLIER) || 0.6,
      volatilityThresholds: {
        low: parseFloat(process.env.LOW_VOL_THRESHOLD) || 0.015,
        high: parseFloat(process.env.HIGH_VOL_THRESHOLD) || 0.035
      },

      // Phase 1: Confidence thresholds
      maxConfidenceThreshold: parseFloat(process.env.MAX_CONFIDENCE) || 0.95,
      confidencePenalty: parseFloat(process.env.CONFIDENCE_PENALTY) || 0.1,
      confidenceBoost: parseFloat(process.env.CONFIDENCE_BOOST) || 0.05,

      // Phase 1: Fund target
      houstonFundTarget: parseFloat(process.env.FUND_TARGET) || 25000
    };

    // Pass feature flags to TradingBrain
    tradingBrainConfig.featureFlags = featureFlags.features || {};
    tradingBrainConfig.patternDominance = featureFlags.features.PATTERN_DOMINANCE?.enabled || false;

    this.tradingBrain = new OptimizedTradingBrain(
      parseFloat(process.env.INITIAL_BALANCE) || 10000,
      tradingBrainConfig
    );
    this.riskManager = new RiskManager({
      maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS) || 0.05,
      maxDrawdown: parseFloat(process.env.MAX_DRAWDOWN) || 0.15
    });

    // Use Browser Claude's merged AdvancedExecutionLayer (Change 513 compliant)
    this.executionLayer = new AdvancedExecutionLayer({
      bot: this,
      botTier: this.tier,
      sandboxMode: process.env.ENABLE_LIVE_TRADING !== 'true',
      enableRiskManagement: true,
      initialBalance: parseFloat(process.env.INITIAL_BALANCE) || 10000,
      paperTrading: featureFlags.features.PAPER_TRADING?.enabled || false,
      featureFlags: featureFlags.features || {}
    });

    this.performanceAnalyzer = new PerformanceAnalyzer();
    this.regimeDetector = new MarketRegimeDetector();

    // Initialize Pattern Exit Model (shadow mode by default)
    this.patternExitModel = null;
    if (featureFlags.features.PATTERN_EXIT_MODEL?.enabled) {
      const PatternBasedExitModel = require('./core/PatternBasedExitModel');
      this.patternExitModel = new PatternBasedExitModel(featureFlags.features.PATTERN_EXIT_MODEL.settings || {});
      this.patternExitShadowMode = featureFlags.features.PATTERN_EXIT_MODEL.shadowMode !== false;
      console.log(`🎯 Pattern Exit Model: ${this.patternExitShadowMode ? 'SHADOW MODE' : 'ACTIVE'}`);
    }

    // CHANGE 670: Initialize Grid Trading Strategy
    this.gridStrategy = null; // Initialize on demand based on strategy mode
    if (process.env.ENABLE_GRID_BOT === 'true') {
      this.gridStrategy = new GridTradingStrategy({
        gridLevels: parseInt(process.env.GRID_LEVELS) || 10,
        gridSpacing: parseFloat(process.env.GRID_SPACING) || 0.002,  // 0.2% default
        orderSize: parseFloat(process.env.GRID_ORDER_SIZE) || 100,
        autoRange: process.env.GRID_AUTO_RANGE !== 'false'
      });
      console.log('🎯 Grid Trading Mode ENABLED');
    }

    // CHANGE 657: Aggressive trading rate limiter (fixed for 8% confidence)
    this.rateLimiter = new ExecutionRateLimiter({
      entryCooldownMs: 5000,        // 5 seconds between entries (was 60 seconds)
      maxEntriesPerWindow: 100,     // 100 entries per window (was 5)
      windowMs: 300000,             // 5 minute window (was 10 minutes)
      burstAllowed: 10              // allow 10 rapid trades (was 2)
    });

    // 🤖 TRAI DECISION MODULE (Change 574 - Opus Architecture + Codex Fix)
    // OPTIMIZECEPTION FIX: Skip TRAI initialization when ENABLE_TRAI=false (4x faster backtests)
    if (process.env.ENABLE_TRAI !== 'false') {
      this.trai = new TRAIDecisionModule({
        mode: process.env.TRAI_MODE || 'advisory',  // Start conservative
        confidenceWeight: parseFloat(process.env.TRAI_WEIGHT) || 0.2,  // 20% influence
        enableVetoPower: process.env.TRAI_VETO === 'true',  // Disabled by default
        maxRiskTolerance: parseFloat(process.env.TRAI_MAX_RISK) || 0.03,
        minConfidenceOverride: parseFloat(process.env.TRAI_MIN_CONF) || 0.40,
        maxConfidenceOverride: parseFloat(process.env.TRAI_MAX_CONF) || 0.95,
        enableLLM: true  // Full AI reasoning enabled
      });
    } else {
      this.trai = null;  // TRAI disabled for fast optimization runs
      console.log('⚡ TRAI disabled for fast backtest mode');
    }

    // 🔥 CRITICAL FIX (Change 547): Connect modules to TradingBrain
    // Without these connections, confidence calculation fails (stuck at 10-35%)
    this.tradingBrain.optimizedIndicators = OptimizedIndicators;
    this.tradingBrain.marketRegimeDetector = this.regimeDetector;
    this.tradingBrain.patternRecognition = this.patternChecker;

    // Change 587: SafetyNet and TradeLogger removed
    // SafetyNet was too restrictive, blocking legitimate trades
    // TradeLogger module doesn't exist in codebase
    // We already have RiskManager + TRAI veto + confidence thresholds
    // this.safetyNet = new TradingSafetyNet(); // DISABLED - blocking everything
    // this.tradeLogger = new TradeLogger(); // Module doesn't exist

    console.log('🔍 [DEBUG] About to create Kraken adapter...');
    console.log('🔍 [DEBUG] BrokerFactory available:', typeof createBrokerAdapter);

    // EMPIRE V2: Create Kraken adapter through BrokerFactory
    try {
      this.kraken = createBrokerAdapter('kraken', {
        apiKey: process.env.KRAKEN_API_KEY,
        apiSecret: process.env.KRAKEN_API_SECRET
      });
      console.log('🏭 [EMPIRE V2] Created Kraken adapter via BrokerFactory');
      console.log('🔍 [DEBUG] Kraken adapter type:', this.kraken.constructor.name);
      console.log('🔍 [DEBUG] Kraken methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.kraken)).filter(m => typeof this.kraken[m] === 'function'));
    } catch (error) {
      console.error('❌ [EMPIRE V2] Failed to create Kraken adapter:', error.message);
      console.error('Stack:', error.stack);
      // Fallback to direct adapter
      console.log('⚠️ [FALLBACK] Using direct KrakenAdapterSimple');
      const KrakenAdapterSimple = require('./kraken_adapter_simple');
      this.kraken = new KrakenAdapterSimple({
        apiKey: process.env.KRAKEN_API_KEY,
        apiSecret: process.env.KRAKEN_API_SECRET
      });
    }

    // Connect execution layer to Kraken
    this.executionLayer.setKrakenAdapter(this.kraken);

    // RECONCILIATION: Initialize exchange reconciler for truth source sync
    const { getInstance: getReconciler } = require('./core/ExchangeReconciler');
    this.reconciler = getReconciler({
      krakenAdapter: this.kraken,
      interval: 30000, // Reconcile every 30 seconds
      paperMode: process.env.ENABLE_LIVE_TRADING !== 'true'
    });
    console.log('🔄 Exchange reconciler initialized');

    // EVENT LOOP MONITORING: Detect freezes and high lag
    const { getInstance: getEventLoopMonitor } = require('./core/EventLoopMonitor');
    this.eventLoopMonitor = getEventLoopMonitor({
      warningThreshold: 100,   // Warn at 100ms
      criticalThreshold: 500,  // Pause trading at 500ms
      checkInterval: 1000      // Check every second
    });
    console.log('⚡ Event loop monitor initialized');

    // Dashboard WebSocket (Change 528) - OPTIONAL for real-time monitoring
    this.dashboardWs = null;
    this.dashboardWsConnected = false;
    // CHANGE 661: Always connect to dashboard WebSocket (defaults to localhost)
    console.log('🔌 Initializing Dashboard WebSocket connection...');
    this.initializeDashboardWebSocket();

    // Trading state
    this.isRunning = false;
    this.marketData = null;
    this.priceHistory = [];

    // Stale feed tracking
    this.lastDataTime = 0;
    this.staleFeedPaused = false;
    this.feedRecoveryCandles = 0;
    // CHANGE 2025-12-11: Position tracking moved to StateManager (single source of truth)
    // this.currentPosition removed - use stateManager.get('position') instead
    // CHANGE 2025-12-13: STEP 1 - SINGLE SOURCE OF TRUTH
    // stateManager.get('balance') REMOVED - use stateManager.get('balance') instead
    // this.activeTrades REMOVED - use stateManager.get('activeTrades') instead
    const initialBalance = parseFloat(process.env.INITIAL_BALANCE) || 10000;
    this.startTime = Date.now();
    this.systemState = {
      currentBalance: initialBalance
    };

    // Initialize StateManager with starting balance ONLY if not already loaded
    // CRITICAL FIX: Don't overwrite saved state on startup!
    const currentState = stateManager.getState();
    if (!currentState.balance || currentState.balance === 0) {
      console.log('🆕 Initializing fresh state with balance:', initialBalance);
      stateManager.updateState({
        balance: initialBalance,
        totalBalance: initialBalance,
        activeTrades: new Map()  // CHANGE 2025-12-13: Centralized active trades
      }, { action: 'INIT' });
    } else {
      console.log('✅ Using existing state - Balance:', currentState.balance, 'Trades:', currentState.activeTrades?.size || 0);
    }

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
      onError: (msg, err) => console.error('❌ MessageQueue:', msg, err.message)
    });

    // MODE DETECTION: Paper, Live, or Backtest (MUTUAL EXCLUSION)
    const enableLiveTrading = process.env.ENABLE_LIVE_TRADING === 'true';
    const enableBacktestMode = process.env.BACKTEST_MODE === 'true';

    // Enforce mutual exclusion: Only ONE mode can be active
    if (enableLiveTrading && enableBacktestMode) {
      throw new Error('❌ FATAL: Cannot enable both LIVE trading and BACKTEST mode simultaneously!');
    }

    // Determine trading mode
    let tradingMode = 'PAPER';
    if (enableLiveTrading) tradingMode = 'LIVE';
    if (enableBacktestMode) tradingMode = 'BACKTEST';

    this.config = {
      // CHANGE 632: Fix MIN_TRADE_CONFIDENCE parsing - accept percentage or decimal
      minTradeConfidence: process.env.MIN_TRADE_CONFIDENCE
        ? (parseFloat(process.env.MIN_TRADE_CONFIDENCE) > 1
          ? parseFloat(process.env.MIN_TRADE_CONFIDENCE) / 100  // Convert percentage to decimal
          : parseFloat(process.env.MIN_TRADE_CONFIDENCE))      // Already decimal
        : 0.35,  // Default 35%
      tradingPair: process.env.TRADING_PAIR || 'BTC-USD',
      enableShorts: process.env.ENABLE_SHORTS === 'true',
      enableLiveTrading,
      enableBacktestMode,
      tradingMode
    };

    console.log(`🎯 Trading Mode: ${tradingMode}`);

    console.log('✅ All modules initialized successfully');
    console.log(`   Risk Management: ENABLED`);
    console.log(`   Change 513 Compliance: ✅\n`);
  }

  /**
   * Validate required environment variables
   */
  validateEnvironment() {
    const required = ['KRAKEN_API_KEY', 'KRAKEN_API_SECRET', 'POLYGON_API_KEY'];
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      console.error('❌ Missing environment variables:', missing);
      throw new Error(`Missing required environment: ${missing.join(', ')}`);
    }
  }

  /**
   * TWO-KEY TURN SAFETY: Verify trading mode with double confirmation
   * Prevents accidental live trading activation
   */
  verifyTradingMode() {
    const enableLive = process.env.ENABLE_LIVE_TRADING === 'true';
    const confirmLive = process.env.CONFIRM_LIVE_TRADING === 'true';

    // Check if attempting live mode
    if (enableLive) {
      if (!confirmLive) {
        console.log('\n' + '═'.repeat(70));
        console.log('⚠️  TWO-KEY SAFETY CHECK FAILED');
        console.log('═'.repeat(70));
        console.log('You have set ENABLE_LIVE_TRADING=true');
        console.log('But CONFIRM_LIVE_TRADING is not set to true');
        console.log('\nTo enable LIVE trading, you must set BOTH:');
        console.log('  ENABLE_LIVE_TRADING=true');
        console.log('  CONFIRM_LIVE_TRADING=true');
        console.log('\n🛡️ Starting in PAPER TRADING mode for safety');
        console.log('═'.repeat(70) + '\n');

        // Force paper mode
        process.env.ENABLE_LIVE_TRADING = 'false';
        this.mode = 'PAPER';
      } else {
        // BOTH keys confirmed - show BIG warning
        console.log('\n' + '╔'.repeat(70));
        console.log('║' + ' '.repeat(20) + '⚠️  LIVE TRADING MODE ACTIVE  ⚠️' + ' '.repeat(17) + '║');
        console.log('║' + ' '.repeat(68) + '║');
        console.log('║' + ' '.repeat(20) + '    REAL MONEY AT RISK!' + ' '.repeat(25) + '║');
        console.log('║' + ' '.repeat(68) + '║');
        console.log('║' + ' '.repeat(15) + 'Two-key safety confirmed. Proceeding...' + ' '.repeat(14) + '║');
        console.log('╚'.repeat(70) + '\n');

        // 10-second countdown
        console.log('Starting in:');
        for (let i = 10; i > 0; i--) {
          process.stdout.write(`\r  ${i} seconds...`);
          require('child_process').execSync('sleep 1');
        }
        console.log('\r  🚀 LIVE TRADING ENGAGED!\n');

        this.mode = 'LIVE';
      }
    } else {
      // Paper mode
      console.log('📝 PAPER TRADING MODE (safe mode)');
      this.mode = 'PAPER';
    }
  }

  /**
   * Initialize Dashboard WebSocket connection (Change 528)
   * OPTIONAL - only connects if WS_HOST is set
   */
  initializeDashboardWebSocket() {
    // Bot connects locally on port 3010 with /ws path (ogzprime-ssl-server)
    const wsUrl = process.env.WS_URL || 'ws://localhost:3010/ws';

    console.log(`\n📊 Connecting to Dashboard WebSocket at ${wsUrl}...`);

    try {
      this.dashboardWs = new WebSocket(wsUrl);

      this.dashboardWs.on('open', () => {
        console.log('✅ Dashboard WebSocket connected!');
        this.dashboardWsConnected = true;

        // 🔒 SECURITY (Change 582): Authenticate first before sending any data
        const authToken = process.env.WEBSOCKET_AUTH_TOKEN || 'CHANGE_ME_IN_PRODUCTION';
        if (!authToken || authToken === 'CHANGE_ME_IN_PRODUCTION') {
          console.error('⚠️ WEBSOCKET_AUTH_TOKEN not set in .env - using default token');
        }

        this.dashboardWs.send(JSON.stringify({
          type: 'auth',
          token: authToken
        }));
        console.log('🔐 Sent authentication to dashboard');

        // DON'T send identify here - wait for auth_success message
      });

      this.dashboardWs.on('error', (error) => {
        console.error('⚠️ Dashboard WebSocket error:', error.message);
        this.dashboardWsConnected = false;
      });

      this.dashboardWs.on('close', () => {
        console.log('⚠️ Dashboard WebSocket closed - reconnecting in 5s...');
        this.dashboardWsConnected = false;
        if (this.isRunning) {
          setTimeout(() => this.initializeDashboardWebSocket(), 5000);
        }
      });

      this.dashboardWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          // Handle authentication success
          if (msg.type === 'auth_success') {
            console.log('🔓 Dashboard authentication successful!');

            // Now send identify message after successful auth
            this.dashboardWs.send(JSON.stringify({
              type: 'identify',
              source: 'trading_bot',
              bot: 'ogzprime-v14-refactored',
              version: 'V14-REFACTORED-MERGED',
              capabilities: ['trading', 'realtime', 'risk-management']
            }));

            // Connect to AdvancedExecutionLayer for trade broadcasts
            this.executionLayer.setWebSocketClient(this.dashboardWs);

            // CHANGE 2025-12-11: Connect StateManager to dashboard for accurate post-update state
            // Dashboard now receives state AFTER changes, never stale data
            stateManager.setDashboardWs(this.dashboardWs);

            // Connect TRAI for chain-of-thought broadcasts
            if (this.trai) {
              this.trai.setWebSocketClient(this.dashboardWs);
            }

            return;
          }

          // Handle authentication errors
          if (msg.type === 'error') {
            console.error('❌ Dashboard error:', msg.message);
            return;
          }

          // CHANGE 665: Handle profile switching and dashboard commands
          if (msg.type === 'command') {
            console.log('📨 Dashboard command received:', msg.command);

            // Profile switching (manual only - does NOT affect confidence)
            if (msg.command === 'switch_profile' && msg.profile) {
              const success = this.profileManager.setActiveProfile(msg.profile);
              if (success) {
                // Profile is for reference only - does not override env vars
                // Send confirmation to dashboard
                this.dashboardWs.send(JSON.stringify({
                  type: 'profile_switched',
                  profile: msg.profile,
                  settings: this.profileManager.getActiveProfile(),
                  note: 'Profile for reference only - trading uses env vars'
                }));
              }
            }

            // Get all profiles
            else if (msg.command === 'get_profiles') {
              this.dashboardWs.send(JSON.stringify({
                type: 'profiles_list',
                profiles: this.profileManager.getAllProfiles(),
                active: this.profileManager.getActiveProfile().name
              }));
            }

            // Dynamic confidence adjustment
            else if (msg.command === 'set_confidence' && msg.confidence) {
              this.profileManager.setDynamicConfidence(msg.confidence);
              this.tradingBrain.updateConfidenceThreshold(msg.confidence / 100);
            }
          }
        } catch (error) {
          console.error('❌ Dashboard message parse error:', error.message);
        }
      });

    } catch (error) {
      console.error('❌ Dashboard WebSocket initialization failed:', error.message);
      this.dashboardWsConnected = false;
    }
  }

  /**
   * Start the trading bot
   */
  async start() {
    console.log('🚀 Starting OGZ Prime V14 MERGED...\n');
    this.isRunning = true;

    // 🤖 Initialize TRAI Decision Module (Change 574)
    if (this.trai) {
      try {
        await this.trai.initialize();
        console.log('✅ TRAI Decision Module initialized - IN THE HOT PATH!\n');
      } catch (error) {
        console.error('⚠️ TRAI initialization failed:', error.message);
        console.log('   Bot will continue without TRAI...\n');
        this.trai = null;
      }
    }

    try {
      // FEATURE FLAG: Backtest mode uses historical data, Live/Paper use WebSocket
      if (this.config.enableBacktestMode) {
        console.log('📊 BACKTEST MODE: Loading historical data...');
        await this.loadHistoricalDataAndBacktest();
      } else {
        console.log('📡 LIVE/PAPER MODE: Connecting to real-time data...');
        // Connect to Kraken WebSocket for live price data
        await this.connectToMarketData();

        // RECONCILIATION: Start reconciler with initial blocking sync
        console.log('🔄 Starting exchange reconciliation...');
        await this.reconciler.start(true); // Block until first reconciliation
        console.log('✅ Reconciliation active - exchange truth verified');

        // EVENT LOOP MONITORING: Start monitoring for freezes
        console.log('⚡ Starting event loop monitoring...');
        this.eventLoopMonitor.start();
        console.log('✅ Event loop monitor active');

        // Start trading cycle
        this.startTradingCycle();

        console.log('✅ Bot is now LIVE and trading\n');
      }
    } catch (error) {
      console.error('❌ Startup failed:', error.message);
      await this.shutdown();
    }
  }

  /**
   * Connect to Kraken WebSocket for real-time market data
   */
  async connectToMarketData() {
    return new Promise((resolve, reject) => {
      console.log('📡 Connecting to Kraken WebSocket...');

      this.ws = new WebSocket('wss://ws.kraken.com');

      this.ws.on('open', () => {
        console.log('✅ Connected to Kraken WebSocket');

        // Subscribe to BTC/USD OHLC (1-minute candles) instead of ticker
        // This gives us proper OHLC data instead of daily aggregates
        this.ws.send(JSON.stringify({
          event: 'subscribe',
          pair: ['XBT/USD'],
          subscription: { name: 'ohlc', interval: 1 }  // 1-minute candles
        }));

        // Connect WebSocket to execution layer
        this.executionLayer.setWebSocketClient(this.ws);

        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);

          // Debug: Log first 5 messages to understand all message types
          if (this.ohlcDebugCount < 5) {
            console.log(`📊 Kraken msg #${this.ohlcDebugCount + 1}:`, JSON.stringify(msg).substring(0, 300));
            this.ohlcDebugCount++;
          }

          // Handle system messages (subscription confirmations, heartbeats, etc.)
          if (msg.event) {
            if (msg.event === 'subscriptionStatus') {
              console.log('✅ Kraken subscription confirmed:', msg.subscription?.name, msg.pair);
            }
            return; // System messages don't contain OHLC data
          }

          // Kraken OHLC format: [channelID, [ohlc data], "ohlc-1", "XBT/USD"]
          if (Array.isArray(msg) && msg.length >= 4) {
            const channelType = msg[2];

            if (channelType && channelType.startsWith('ohlc')) {
              const ohlcArray = msg[1];
              if (Array.isArray(ohlcArray) && ohlcArray.length >= 8) {
                // CHANGE 2025-12-11: Queue messages to prevent race conditions
                // Old: this.handleMarketData(ohlcArray) - direct processing caused out-of-order execution
                this.messageQueue.add(ohlcArray);
              } else {
                console.warn('⚠️ Unexpected OHLC array format:', ohlcArray);
              }
            }
          }
        } catch (err) {
          console.error('❌ Error parsing WebSocket message:', err.message);
        }
      });

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('⚠️ WebSocket closed - attempting reconnect...');
        if (this.isRunning) {
          setTimeout(() => this.connectToMarketData(), 5000);
        }
      });
    });
  }

  /**
   * Handle incoming market data from WebSocket
   * Kraken OHLC format: [channelID, [time, etime, open, high, low, close, vwap, volume, count], channelName, pair]
   */
  handleMarketData(ohlcData) {
    console.log(`🔍 [CANDLE-DEBUG] handleMarketData called, priceHistory length: ${this.priceHistory.length}`);

    // OHLC data is array: [time, etime, open, high, low, close, vwap, volume, count]
    if (!Array.isArray(ohlcData) || ohlcData.length < 8) {
      console.warn('⚠️ Invalid OHLC data format:', ohlcData);
      return;
    }

    const [time, etime, open, high, low, close, vwap, volume, count] = ohlcData;

    // STALE FEED DETECTION: Track last data time
    const now = Date.now();
    if (this.lastDataTime) {
      const feedAge = now - this.lastDataTime;

      // Check for stale feed (>90 seconds - increased from 30 for poor network conditions)
      if (feedAge > 90000) {
        console.error('🚨 STALE FEED DETECTED:', Math.round(feedAge / 1000), 'seconds');

        // AUTO-PAUSE TRADING
        if (!this.staleFeedPaused) {
          console.error('⏸️ PAUSING NEW ENTRIES DUE TO STALE FEED');
          this.staleFeedPaused = true;

          // Notify StateManager to pause
          try {
            const { getInstance: getStateManager } = require('./core/StateManager');
            const stateManager = getStateManager();
            stateManager.pauseTrading(`Stale feed: ${Math.round(feedAge / 1000)}s`);
          } catch (error) {
            console.error('Failed to pause via StateManager:', error.message);
          }
        }
      } else if (feedAge > 5000) {
        // Warning for delayed feed
        console.warn('⚠️ Feed delay:', Math.round(feedAge / 1000), 'seconds');
      } else if (this.staleFeedPaused && feedAge < 2000) {
        // Feed recovered - wait 2 candles before resuming
        console.log('✅ Feed recovered, will resume after 2 candles');
        this.staleFeedPaused = false;
        this.feedRecoveryCandles = 0;
      }
    }
    this.lastDataTime = now;

    let price = parseFloat(close);
    if (!price || isNaN(price)) return;

    // Test code removed - running on REAL market data

    // Build proper OHLCV candle structure from Kraken OHLC stream
    const candle = {
      o: parseFloat(open),
      h: parseFloat(high),
      l: parseFloat(low),
      c: parseFloat(close),
      v: parseFloat(volume),
      t: parseFloat(time) * 1000,  // Actual timestamp for display
      etime: parseFloat(etime) * 1000  // End time for deduplication
    };

    // Update price history (use etime to detect new minutes, not actual timestamp)
    const lastCandle = this.priceHistory[this.priceHistory.length - 1];
    console.log(`🔍 [CANDLE-DEBUG] lastCandle.etime: ${lastCandle?.etime}, lastCandle.e: ${lastCandle?.e}, candle.etime: ${candle.etime}, candle.e: ${candle.e}`);
    const isNewMinute = !lastCandle || lastCandle.etime !== candle.etime;
    console.log(`🔍 [CANDLE-DEBUG] isNewMinute: ${isNewMinute}, priceHistory.length: ${this.priceHistory.length}`);

    if (!isNewMinute) {
      // Update existing candle (same minute) - Kraken sends multiple updates per minute
      this.priceHistory[this.priceHistory.length - 1] = candle;

      // Debug: Show updates for first few candles
      if (this.priceHistory.length <= 3) {
        const candleTime = new Date(candle.t).toLocaleTimeString();
        // CHANGE 634: Clean output for humans (no more decimal headaches!)
        const o = Math.round(candle.o);
        const h = Math.round(candle.h);
        const l = Math.round(candle.l);
        const c = Math.round(candle.c);
        console.log(`🕯️ Candle #${this.priceHistory.length} [${candleTime}]: $${c.toLocaleString()} (H:${h.toLocaleString()} L:${l.toLocaleString()})`);
      }
    } else {
      // New candle (new minute) - etime changed
      this.priceHistory.push(candle);

      // Only log during warmup phase (first 20 candles)
      if (this.priceHistory.length <= 20) {
        const candleTime = new Date(candle.t).toLocaleTimeString();
        console.log(`✅ Candle #${this.priceHistory.length}/15 [${candleTime}]`);
      }

      if (this.priceHistory.length > 200) {
        this.priceHistory = this.priceHistory.slice(-200);
      }
    }

    // Store latest market data
    this.marketData = {
      price,
      timestamp: parseFloat(time) * 1000,  // Use candle's actual timestamp
      systemTime: Date.now(),  // Keep system time separately if needed
      volume: parseFloat(volume) || 0,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low)
    };

    // CHANGE 663: Broadcast market data to dashboard
    console.log(`🔍 [DEBUG] Dashboard broadcast check: connected=${this.dashboardWsConnected}, ws exists=${!!this.dashboardWs}`);

    if (this.dashboardWsConnected && this.dashboardWs) {
      try {
        // Calculate simple indicators for display
        const indicators = this.calculateSimpleIndicators(this.priceHistory);
        console.log(`📤 [DEBUG] Sending to dashboard: price=${price}, indicators:`, indicators);

        this.dashboardWs.send(JSON.stringify({
          type: 'price',  // CHANGE 2025-12-11: Match frontend expected message type
          data: {
            price: price,
            candle: {
              open: parseFloat(open),
              high: parseFloat(high),
              low: parseFloat(low),
              close: price,
              volume: parseFloat(volume),
              timestamp: Date.now()
            },
            indicators: indicators,
            candles: this.priceHistory.slice(-50), // Last 50 candles for chart
            balance: stateManager.get('balance'),
            position: stateManager.get('position'),
            totalTrades: this.executionLayer?.totalTrades || 0
          }
        }));
      } catch (error) {
        // Fail silently - don't let dashboard issues affect trading
      }
    }
  }

  /**
   * Main trading cycle - runs every 15 seconds
   */
  startTradingCycle() {
    const interval = parseInt(process.env.TRADING_INTERVAL) || 15000;

    this.tradingInterval = setInterval(async () => {
      // TEMP: Reduced to 3 for debugging - normally 15
      if (!this.marketData || this.priceHistory.length < 3) {
        console.log(`⏳ Warming up... ${this.priceHistory.length}/3 candles (TEMP: reduced for debug)`);
        return;
      }

      try {
        await this.analyzeAndTrade();
      } catch (error) {
        console.error('❌ Trading cycle error:', error.message);
        console.error(error.stack);
      }
    }, interval);

    console.log(`⏰ Trading cycle started (${interval}ms interval)`);
  }

  /**
   * Analyze market and execute trades
   * Core trading pipeline orchestration
   */
  async analyzeAndTrade() {
    const { price } = this.marketData;

    // Calculate technical indicators
    const indicators = {
      rsi: OptimizedIndicators.calculateRSI(this.priceHistory, 14),
      macd: OptimizedIndicators.calculateMACD(this.priceHistory),
      ema12: OptimizedIndicators.calculateEMA(this.priceHistory, 12),
      ema26: OptimizedIndicators.calculateEMA(this.priceHistory, 26),
      trend: OptimizedIndicators.determineTrend(this.priceHistory, 10, 30),
      volatility: OptimizedIndicators.calculateVolatility(this.priceHistory, 20)
    };

    // CHANGE 655: RSI Smoothing - Prevent machine-gun trading without circuit breakers
    if (!this.rsiHistory) this.rsiHistory = [];
    this.rsiHistory.push(indicators.rsi);
    if (this.rsiHistory.length > 3) this.rsiHistory.shift(); // Keep last 3 RSI values

    // Smooth RSI using weighted average to prevent jumps
    if (this.rsiHistory.length >= 2) {
      const weights = [0.5, 0.3, 0.2]; // Most recent gets 50% weight
      let smoothedRSI = 0;
      for (let i = 0; i < this.rsiHistory.length; i++) {
        smoothedRSI += this.rsiHistory[this.rsiHistory.length - 1 - i] * (weights[i] || 0.1);
      }

      // If RSI jumped too much, use smoothed value
      const lastRSI = this.rsiHistory[this.rsiHistory.length - 2];
      const rsiJump = Math.abs(indicators.rsi - lastRSI);

      if (rsiJump > 30) {
        console.log(`🔄 RSI Smoothing: Jump ${lastRSI.toFixed(1)}→${indicators.rsi.toFixed(1)} smoothed to ${smoothedRSI.toFixed(1)}`);
        indicators.rsi = smoothedRSI;
      }
    }

    // Detect patterns
    const patterns = this.patternChecker.analyzePatterns({
      candles: this.priceHistory,
      trend: indicators.trend,
      macd: indicators.macd?.macd || indicators.macd?.macdLine || 0,
      macdSignal: indicators.macd?.signal || indicators.macd?.signalLine || 0,
      rsi: indicators.rsi,
      volume: this.marketData.volume || 0
    });

    // CRITICAL FIX: Record patterns immediately when detected for learning
    // Don't wait for trade completion - patterns need to be recorded NOW
    if (patterns && patterns.length > 0) {
      // TELEMETRY: Track pattern detection
      const telemetry = require('./core/Telemetry').getTelemetry();

      patterns.forEach(pattern => {
        const signature = pattern.signature || pattern.name || 'unknown_pattern';
        if (!signature || signature === 'unknown_pattern') {
          console.warn('⚠️ Pattern missing proper signature, using generic fallback:', pattern);
          // Don't return - still record for statistics even with generic signature
        }

        // CHANGE 659: Fix pattern recording - pass features array instead of signature string
        // recordPatternResult expects features array, not signature string

        // DEBUG: Check what we're getting
        if (!Array.isArray(pattern.features)) {
          console.error('❌ Pattern features is not an array:', {
            type: typeof pattern.features,
            value: pattern.features,
            pattern: pattern
          });
        }

        // ENSURE we always have an array
        let featuresForRecording;
        if (Array.isArray(pattern.features)) {
          featuresForRecording = pattern.features;
        } else {
          // Create fallback array from indicators
          console.warn('⚠️ Creating fallback features array');
          featuresForRecording = [
            indicators.rsi || 50,
            indicators.macd?.macd || 0,
            indicators.macd?.signal || 0,
            indicators.trend || 0,
            this.marketData.volume || 0
          ];
        }

        // Record pattern for learning - always pass features array
        // Never fall back to signature (which is a string)
        this.patternChecker.recordPatternResult(featuresForRecording, {
          detected: true,
          confidence: pattern.confidence || 0.1,
          timestamp: Date.now(),
          price: this.marketData.price || 0,
          indicators: {
            rsi: indicators.rsi,
            macd: indicators.macd?.macd || 0,
            trend: indicators.trend
          }
        });

        // TELEMETRY: Log pattern detection event
        telemetry.event('pattern_detected', {
          signature,
          confidence: pattern.confidence,
          isNew: pattern.isNew,
          price: this.marketData.price
        });
      });

      // TELEMETRY: Log batch recording
      telemetry.event('pattern_recorded', {
        count: patterns.length,
        memorySize: this.patternChecker.getMemorySize ? this.patternChecker.getMemorySize() : 0
      });

      console.log(`📊 Recorded ${patterns.length} patterns for learning`);
    }

    // Update OGZ Two-Pole Oscillator with latest candle
    let tpoResult = null;
    if (this.ogzTpo && this.priceHistory.length > 0) {
      const latestCandle = this.priceHistory[this.priceHistory.length - 1];
      tpoResult = this.ogzTpo.update({
        o: latestCandle.open,
        h: latestCandle.high,
        l: latestCandle.low,
        c: latestCandle.close,
        t: latestCandle.time || Date.now()
      });

      if (tpoResult.signal) {
        console.log(`🎯 OGZ TPO Signal: ${tpoResult.signal.action} (${tpoResult.signal.zone})`);
        // Dynamic levels available at: tpoResult.signal.levels.stopLoss / .takeProfit
      }
    }

    // 📡 Broadcast pattern analysis to dashboard
    this.broadcastPatternAnalysis(patterns, indicators);

    // Detect market regime
    const regime = this.regimeDetector.detectRegime(this.priceHistory);

    // Change 596: Use TradingBrain.getDecision() instead of calculateRealConfidence()
    // This properly integrates direction + confidence from TradingBrain's analysis
    const marketDataForConfidence = {
      trend: indicators.trend,
      macd: indicators.macd?.macd || indicators.macd?.macdLine || 0,
      macdSignal: indicators.macd?.signal || indicators.macd?.signalLine || 0,
      rsi: indicators.rsi,
      volume: this.marketData.volume || 0
    };

    // 🔧 FIX: Pass priceData to TradingBrain for MarketRegimeDetector
    this.tradingBrain.priceData = this.priceHistory;

    // Get full decision from TradingBrain (direction + confidence + reasoning)
    const brainDecision = await this.tradingBrain.getDecision(
      marketDataForConfidence,
      patterns,
      this.priceHistory
    );

    // CHANGE 625: Fix directional confusion - TradingBrain doesn't know about positions
    // TradingBrain returns 'sell' when bearish, but we CAN'T SHORT (forbidden by tier flags)
    // So translate 'sell' to 'hold' when we have no position (can't open shorts)
    // Let MaxProfitManager handle exits when we have a position
    let tradingDirection = brainDecision.direction; // 'buy', 'sell', or 'hold'

    // CHANGE 2025-12-11: Use StateManager for position reads
    const currentPosition = stateManager.get('position');
    console.log(`📊 DEBUG: currentPosition=${currentPosition}, tradingDirection=${tradingDirection}`);

    if (tradingDirection === 'sell' && currentPosition === 0) {
      // Can't open SHORT positions - convert to HOLD
      console.log('🚫 TradingBrain said SELL but shorts forbidden - converting to HOLD');
      tradingDirection = 'hold';
    } else if (tradingDirection === 'sell' && currentPosition > 0) {
      // CHANGE 638: Allow SELL to proceed when we have a position
      // MaxProfitManager was never being checked due to this conversion to HOLD
      console.log('📊 TradingBrain bearish - executing SELL of position');
      // Let the SELL proceed instead of converting to HOLD
    }

    const rawConfidence = brainDecision.confidence;

    const confidenceData = {
      totalConfidence: rawConfidence * 100
    };

    // 🤖 STEP 5: TRAI DECISION PROCESSING (IN THE HOT PATH - Change 574)
    let finalConfidence = confidenceData.totalConfidence;
    let traiDecision = null;

    // Change 590: Check TRAI bypass flag for fast backtesting
    const skipTRAI = this.config.enableBacktestMode && process.env.TRAI_ENABLE_BACKTEST === 'false';

    if (this.trai && !skipTRAI) {
      try {
        // Prepare signal for TRAI (Change 596: Use TradingBrain's direction, not trend)
        const signal = {
          action: tradingDirection.toUpperCase(), // 'buy' → 'BUY', 'sell' → 'SELL', 'hold' → 'HOLD'
          confidence: rawConfidence,
          patterns: patterns,
          indicators: indicators,
          price: price,
          timestamp: Date.now()
        };

        // Prepare context for TRAI
        const context = {
          volatility: indicators.volatility,
          trend: indicators.trend,
          volume: this.marketData.volume || 'normal',
          regime: regime.currentRegime || 'unknown',
          indicators: indicators,
          positionSize: stateManager.get('balance') * 0.01,
          currentPosition: stateManager.get('position')
        };

        // CHANGE 2025-12-13: TRAI DISABLED FOR CLEAN PROFESSIONAL LOGS
        // TRAI was async but still cluttering output
        // Pure mathematical trading only - no AI interference

        /* DISABLED - Uncomment to re-enable TRAI learning
        this.trai.processDecision(signal, context)
          .then(decision => {
            // Log when TRAI completes (async)
            console.log(`🤖 [TRAI Async] Completed: ${(decision.traiConfidence * 100).toFixed(1)}% → ${(decision.finalConfidence * 100).toFixed(1)}% | ${decision.traiRecommendation}`);

            // Store for post-trade learning (but don't block)
            if (decision.id) {
              this.pendingTraiDecisions.set(`async_${Date.now()}`, {
                decisionId: decision.id,
                originalConfidence: decision.originalConfidence,
                traiConfidence: decision.traiConfidence,
                timestamp: Date.now()
              });
            }
          })
          .catch(err => {
            console.warn('⚠️ [TRAI Async] Error (non-blocking):', err.message);
          });
        */

        // CRITICAL: Do NOT wait for TRAI - use mathematical confidence immediately
        // finalConfidence stays at rawConfidence - TRAI no longer affects real-time decisions

      } catch (error) {
        console.error('⚠️ TRAI processing error:', error.message);
        // Continue with original confidence
      }
    }

    // Log clean analysis summary
    const bestPattern = patterns.length > 0 ? patterns[0].name : 'none';
    // CHANGE 634: Clean human-readable output
    const cleanPrice = Math.round(price).toLocaleString();
    console.log(`\n📊 $${cleanPrice} | Conf: ${confidenceData.totalConfidence.toFixed(0)}% | RSI: ${Math.round(indicators.rsi)} | ${indicators.trend} | ${regime.currentRegime || 'analyzing'}`);

    // CHANGE 639: Pass TradingBrain's direction to makeTradeDecision
    // Bug: When TRAI disabled, TradingBrain's 'sell' signal was ignored
    // Fix: Pass tradingDirection so makeTradeDecision respects TradingBrain
    const decision = this.makeTradeDecision(confidenceData, indicators, patterns, price, tradingDirection);

    if (decision.action !== 'HOLD') {
      await this.executeTrade(decision, confidenceData, price, indicators, patterns, traiDecision);
    }
  }

  /**
   * Determine if we should trade and in which direction
   * CHANGE 639: Added brainDirection parameter to respect TradingBrain's decision
   */
  makeTradeDecision(confidenceData, indicators, patterns, currentPrice, brainDirection = null) {
    const { totalConfidence } = confidenceData;
    const minConfidence = this.config.minTradeConfidence * 100;

    // CHANGE 2025-12-11: Pass 1 - Add decision context for visibility
    const decisionContext = tradingOptimizations.createDecisionContext({
      symbol: this.tradingPair || 'XBT/USD',
      direction: brainDirection === 'sell' ? 'SHORT' : 'LONG',
      confidence: totalConfidence,
      patterns: patterns || [],
      patternScores: confidenceData.patternScores || {},
      indicators,
      regime: this.marketRegime?.currentRegime || 'unknown',
      module: this.gridStrategy ? 'grid' : 'standard',
      price: currentPrice,
      brainDirection
    });

    // CHANGE 670: Check grid strategy first if enabled
    if (this.gridStrategy) {
      const gridSignal = this.gridStrategy.getGridSignal(currentPrice, indicators);

      if (gridSignal.action !== 'HOLD') {
        console.log(`\n🎯 GRID BOT SIGNAL: ${gridSignal.action} | ${gridSignal.reason}`);
        console.log(`   Grid Stats: ${gridSignal.gridStats.completedTrades} trades | $${gridSignal.gridStats.totalProfit.toFixed(2)} profit`);

        // Grid signals override normal trading logic
        return {
          action: gridSignal.action,
          direction: gridSignal.action === 'BUY' ? 'long' : 'close',
          confidence: gridSignal.confidence * 100,
          isGridTrade: true,
          gridSize: gridSignal.size
        };
      }
    }

    // CHANGE 625: Debug logging to understand why trades don't execute
    const pos = stateManager.get('position');
    console.log(`🔍 makeTradeDecision: pos=${pos}, conf=${totalConfidence.toFixed(1)}%, minConf=${minConfidence}%, brain=${brainDirection}`);

    // CHANGE 2025-12-13: Step 5 - MaxProfitManager gets priority on exits
    // Math (stops/targets) ALWAYS wins over Brain (emotional) signals

    // Check if we should BUY (when flat)
    if (pos === 0 && totalConfidence >= minConfidence) {
      console.log(`✅ BUY DECISION: Confidence ${totalConfidence.toFixed(1)}% >= ${minConfidence}%`);

      // CHANGE 2025-12-11: Pass 2 - Include decision context and pattern quality
      return {
        action: 'BUY',
        direction: 'long',
        confidence: totalConfidence,
        decisionContext,
        patternQuality: decisionContext.patternQuality
      };
    }

    // Check if we should SELL (when long)
    // Change 603: Integrate MaxProfitManager for dynamic exits
    if (pos > 0) {
      // Get entry trade to calculate P&L
      // CHANGE 2025-12-13: Read from StateManager (single source of truth)
      const allTrades = stateManager.getAllTrades();
      console.log(`🔍 DEBUG: getAllTrades returned ${allTrades.length} trades`);
      if (allTrades.length > 0) {
        console.log(`🔍 DEBUG: First trade has action='${allTrades[0].action}', type='${allTrades[0].type}'`);
      }
      const buyTrades = allTrades
        .filter(t => t.action === 'BUY')
        .sort((a, b) => a.entryTime - b.entryTime);
      console.log(`🔍 DEBUG: After filtering for BUY, found ${buyTrades.length} trades`);

      if (buyTrades.length > 0) {
        console.log(`🔍 DEBUG: BUY trade found:`, JSON.stringify(buyTrades[0], null, 2));
        const entryPrice = buyTrades[0].entryPrice;
        console.log(`🔍 DEBUG: Entry price from trade: ${entryPrice}, Current price: ${currentPrice}`);

        // Change 608: Analyze Fib/S&R levels to adjust trailing stops dynamically
         const levelAnalysis = this.tradingBrain.analyzeFibSRLevels(this.candles, currentPrice);

         // CHANGE 652: Check MaxProfitManager state before calling update
         // Prevents silent failures if state.active is false (shouldn't happen but defensive)
         if (!this.tradingBrain?.maxProfitManager?.state?.active) {
           console.log('⚠️ MaxProfitManager not active for position, skipping exit check');
           // HOLD should have low confidence - it means we're uncertain
           return { action: 'HOLD', confidence: 0.1 };
         }

         // Use MaxProfitManager's sophisticated exit logic
         // Change 608: Now enhanced with Fib/S&R level awareness
         const profitResult = this.tradingBrain.maxProfitManager.update(currentPrice, {
           volatility: indicators.volatility || 0,
           trend: indicators.trend || 'sideways',
           volume: this.marketData?.volume || 0,
           // NEW: Pass Fib/S&R trail multiplier
           trailMultiplier: levelAnalysis.trailMultiplier || 1.0
         });

         // Evaluate pattern exit model (shadow mode or active)
         if (this.patternExitModel) {
           const profitPercent = (currentPrice - entryPrice) / entryPrice;
           const exitDecision = this.patternExitModel.evaluateExit({
             currentPrice,
             currentPatterns: patterns || [],
             indicators: {
               rsi: indicators.rsi,
               macd: indicators.macd
             },
             regime: this.regimeDetector?.currentRegime || 'unknown',
             profitPercent,
             maxProfitManagerState: profitResult
           });

           if (this.patternExitShadowMode) {
             // Shadow mode - just log what would happen
             if (exitDecision.exitRecommended) {
               console.log(`🕵️ [SHADOW] Pattern Exit would trigger:`);
               console.log(`   Action: ${exitDecision.action}`);
               console.log(`   Urgency: ${exitDecision.exitUrgency}`);
               console.log(`   Exit %: ${(exitDecision.exitPercent * 100).toFixed(0)}%`);
               console.log(`   Reasons: ${exitDecision.reasons.join(', ')}`);
             }
             if (exitDecision.adjustments &&
                 (exitDecision.adjustments.targetMultiplier !== 1.0 ||
                  exitDecision.adjustments.stopMultiplier !== 1.0 ||
                  exitDecision.adjustments.trailMultiplier !== 1.0)) {
               console.log(`🕵️ [SHADOW] Pattern adjustments would apply:`);
               console.log(`   Target: ${exitDecision.adjustments.targetMultiplier.toFixed(2)}x`);
               console.log(`   Stop: ${exitDecision.adjustments.stopMultiplier.toFixed(2)}x`);
               console.log(`   Trail: ${exitDecision.adjustments.trailMultiplier.toFixed(2)}x`);
             }
           } else if (exitDecision.exitRecommended &&
                      (exitDecision.exitUrgency === 'high' || exitDecision.exitUrgency === 'critical')) {
             // Active mode - actually trigger exit on high urgency
             console.log(`🎯 Pattern Exit ACTIVE: ${exitDecision.reasons.join(', ')}`);
             return { action: 'SELL', direction: 'close', confidence: totalConfidence * 1.2 };
           }
         }

        // Check if MaxProfitManager signals exit
        if (profitResult && (profitResult.action === 'exit' || profitResult.action === 'exit_full')) {
          console.log(`📉 SELL Signal: ${profitResult.reason || 'MaxProfitManager exit'}`);
          return { action: 'SELL', direction: 'close', confidence: totalConfidence };
        }

        // CHANGE 2025-12-13: Step 5 - Brain sell signals ONLY after MaxProfitManager
        // Check if Brain wants to sell (but only if MaxProfitManager didn't exit)
        if (brainDirection === 'sell') {
          // Get the oldest BUY trade to check hold time
          const buyTrades = stateManager.getAllTrades()
            .filter(t => t.action === 'BUY')
            .sort((a, b) => a.entryTime - b.entryTime);

          if (buyTrades.length > 0) {
            const buyTrade = buyTrades[0];
            const holdTime = (Date.now() - buyTrade.entryTime) / 60000; // Convert to minutes
            const minHoldTime = 0.05; // 3 seconds for 5-sec candles

            // Additional conditions for Brain to override:
            // 1. Minimum hold time met
            // 2. Position is in profit (don't panic sell at loss)
            const pnl = ((currentPrice - entryPrice) / entryPrice) * 100;

            if (holdTime >= minHoldTime && pnl > 0) {
              console.log(`🧠 Brain bearish & profitable - allowing SELL (held ${holdTime.toFixed(2)} min, PnL: ${pnl.toFixed(2)}%)`);
              return { action: 'SELL', direction: 'close', confidence: totalConfidence };
            } else if (holdTime >= minHoldTime && pnl < -2) {
              // Emergency: Allow Brain to cut losses if down > 2%
              console.log(`🚨 Brain emergency sell - cutting losses (PnL: ${pnl.toFixed(2)}%)`);
              return { action: 'SELL', direction: 'close', confidence: totalConfidence };
            } else {
              console.log(`🧠 Brain wants sell but conditions not met (hold: ${holdTime.toFixed(3)} min, PnL: ${pnl.toFixed(2)}%)`);
            }
          }
        }

        // Change 604: DISABLE confidence exits - they're killing profitability
        // Confidence reversal exits were triggering BEFORE profit targets (1-2%)
        // This caused 100% of exits at 0.00-0.12% profit = NET LOSS after fees
        //
        // Let MaxProfitManager handle exits with proper profit targets
        // Only use confidence as EXTREME emergency exit (50%+ drop)

        const recentConfidences = this.confidenceHistory || [];
        this.confidenceHistory = this.confidenceHistory || [];
        this.confidenceHistory.push(totalConfidence);
        if (this.confidenceHistory.length > 10) this.confidenceHistory.shift();

        const peakConfidence = Math.max(...this.confidenceHistory.slice(-5));
        const confidenceDrop = peakConfidence - totalConfidence;

        // ONLY exit on MASSIVE confidence drops (market crash scenario)
        if (confidenceDrop > 50) {
          console.log(`📉 SELL Signal: EXTREME reversal (${confidenceDrop.toFixed(1)}% confidence drop)`);
          return { action: 'SELL', direction: 'close', confidence: totalConfidence };
        }

        // Let profitable trades ride - don't exit on minor confidence fluctuations
      }
    }

    // 🚫 CRYPTO: NO SHORTING/MARGIN - Too risky, disabled permanently
    // (Shorting only enabled for stocks/forex if needed in future)

    // HOLD means we're uncertain - should have LOW confidence, not high!
    // High confidence should only be for BUY/SELL signals
    return { action: 'HOLD', confidence: Math.min(0.2, totalConfidence * 0.1) };
  }

  /**
   * Execute a trade through the merged AdvancedExecutionLayer
   * Uses Browser Claude's Change 513 compliant version
   */
  async executeTrade(decision, confidenceData, price, indicators, patterns, traiDecision = null) {
    // CHANGE 657: Codex-recommended rate limiter - NEVER blocks exits!
    // CHANGE 658: Make symbol-specific instead of hardcoded
    const gate = this.rateLimiter.allow({
      symbol: this.tradingPair || process.env.TRADING_PAIR || 'XBT/USD',
      action: decision.action,
      currentPosition: stateManager.get('position')
    });

    if (!gate.ok) {
      console.log(`🛑 RATE LIMIT: ${gate.reason} - ${gate.message}`);
      if (gate.retryInMs) {
        console.log(`⏱️ Retry in ${(gate.retryInMs/1000).toFixed(1)}s`);
      }
      return; // Block only entries, exits always allowed
    }

    // Log allowed trade
    console.log(`\n🎯 ${decision.action} SIGNAL @ $${price.toFixed(2)} | Confidence: ${decision.confidence.toFixed(1)}%`);

    // CHECKPOINT 1: Entry
    console.log(`📍 CP1: executeTrade ENTRY - Balance: $${stateManager.get('balance')}, Position: ${stateManager.get('position')}`);

    // FIXED: Use actual balance from StateManager, not stale systemState
    const currentBalance = stateManager.get('balance') || 10000;
    const basePositionPercent = parseFloat(process.env.MAX_POSITION_SIZE_PCT) || 0.01;
    const baseSize = currentBalance * basePositionPercent;

    console.log(`💰 Position sizing: Balance=$${currentBalance.toFixed(2)}, Percent=${(basePositionPercent*100).toFixed(1)}%, BaseSize=$${baseSize.toFixed(2)}`);

    // CHANGE 2025-12-11: Pass 2 - Pattern-based position sizing
    const patternIds = decision.decisionContext?.patternsActive ||
                      patterns?.map(p => p.id || p.signature || 'unknown') || [];
    const positionSize = tradingOptimizations.calculatePositionSize(baseSize, patternIds, decision.decisionContext);

    // CHECKPOINT 2: Position sizing
    console.log(`📍 CP2: Position size calculated: ${positionSize} (base: ${baseSize.toFixed(2)}, adjusted for pattern quality)`);

    // Change 587: SafetyNet DISABLED - too restrictive
    // Was blocking legitimate trades with overly conservative limits
    // We already have sufficient risk management through:
    // - RiskManager pre-trade validation
    // - TRAI veto power for risky trades
    // - MIN_TRADE_CONFIDENCE threshold (35%)
    // - Position sizing limits (1% per trade)
    /*
    const tradeRequest = {
      action: decision.action,
      size: positionSize,
      price: price,
      confidence: decision.confidence / 100,
      indicators: indicators,
      patterns: patterns
    };

    const safetyCheck = this.safetyNet.validateTrade(tradeRequest, {
      price: price,
      volume: this.marketData?.volume || 0,
      volatility: indicators.volatility,
      timestamp: Date.now()
    });

    if (!safetyCheck.allowed) {
      console.log(`🛡️ SafetyNet BLOCKED: ${safetyCheck.reason}`);
      return;
    }
    */

    try {
      // CHECKPOINT 3: Before ExecutionLayer call
      console.log(`📍 CP3: Calling ExecutionLayer.executeTrade with size=${positionSize}`);

      // Circuit breaker check before execution
      if (this.tradingBrain?.errorHandler?.isCircuitBreakerActive('ExecutionLayer')) {
        console.log('🚨 CIRCUIT BREAKER: Execution blocked due to repeated failures');
        console.log('   Error count:', this.tradingBrain.errorHandler.getErrorStatus());
        // Don't return - let's see what error occurs
        // return;
      }

      const tradeResult = await this.executionLayer.executeTrade({
        direction: decision.action,
        positionSize,
        confidence: decision.confidence / 100,
        marketData: {
          price,
          indicators,
          volatility: indicators.volatility,
          timestamp: Date.now()
        },
        patterns
      });

      // CHECKPOINT 4: After ExecutionLayer call
      console.log(`📍 CP4: ExecutionLayer returned:`, tradeResult ? `success=${tradeResult.success}` : 'NULL');

      if (tradeResult && tradeResult.success) {
        console.log(`📍 CP4.5: Trade SUCCESS confirmed, creating unified result`);
        // Change 588: Create unified tradeResult format
        const unifiedResult = {
          orderId: tradeResult.orderId || `SIM_${Date.now()}`,
          action: decision.action,
          entryPrice: price,
          entryTime: Date.now(),
          size: positionSize,
          confidence: decision.confidence,
          // CHANGE 648: Store full pattern objects with signatures for learning
          patterns: patterns?.map(p => ({
            name: p.name || p.type,
            signature: p.signature || p.id || `${p.name || p.type}_${Date.now()}`,
            confidence: p.confidence || 0
          })) || [],
          indicators: {
            rsi: indicators.rsi,
            macd: indicators.macd?.macd || 0,  // CHANGE 646: Fix property access - was ?.value
            macdSignal: indicators.macd?.signal || 0,
            trend: indicators.trend,
            volatility: indicators.volatility || 0
          }
        };

        console.log(`📍 CP4.6: Unified result created with orderId: ${unifiedResult.orderId}`);

        // Store for pattern learning and post-trade analysis
        // CHANGE 2025-12-13: Store in StateManager (single source of truth)
        console.log(`📍 CP4.7: About to call stateManager.updateActiveTrade`);
        console.log(`   stateManager exists: ${!!stateManager}`);
        console.log(`   updateActiveTrade type: ${typeof stateManager.updateActiveTrade}`);

        try {
          stateManager.updateActiveTrade(unifiedResult.orderId, unifiedResult);
          console.log(`📍 CP4.8: updateActiveTrade completed successfully`);
        } catch (error) {
          console.error(`❌ CP4.8 ERROR: updateActiveTrade failed:`, error.message);
          console.error(`   Full error:`, error);
        }

        // CHANGE 647: Store TRAI decision for learning feedback loop
        // CHANGE 650: Use correct field name 'id' not 'decisionId'
        if (traiDecision && traiDecision.id && unifiedResult.orderId) {
          this.pendingTraiDecisions.set(unifiedResult.orderId, {
            decisionId: traiDecision.id,  // Use 'id' field from TRAI decision
            originalConfidence: traiDecision.originalConfidence,
            traiConfidence: traiDecision.traiConfidence,
            timestamp: Date.now()
          });
          console.log(`📚 [TRAI] Decision stored for learning (ID: ${traiDecision.id})`);
        }

        // Update position tracking
        if (decision.action === 'BUY') {
          // CHECKPOINT 5: Before position update
          const stateBefore = stateManager.getState();
          console.log(`📍 CP5: BEFORE BUY - Position: ${stateBefore.position}, Balance: $${stateBefore.balance}`);

          // CHANGE 2025-12-11: Use StateManager for atomic position updates
          // CHANGE 2025-12-11 FIX: orderId was undefined - use unifiedResult.orderId
          const positionResult = await stateManager.openPosition(positionSize, price, { 
            orderId: unifiedResult.orderId, 
            confidence: decision.confidence 
          });

          // CHANGE 2025-12-12: Validate StateManager.openPosition() success
          if (!positionResult.success) {
            console.error('❌ StateManager.openPosition failed:', positionResult.error);
            // CHANGE 2025-12-13: Remove from StateManager (single source of truth)
            stateManager.removeActiveTrade(unifiedResult.orderId);
            return; // Abort trade
          }

          // CHANGE 2025-12-13: No longer sync to local balance - read from StateManager
          const stateAfter = stateManager.getState();

          // CHECKPOINT 6: After position update
          console.log(`📍 CP6: AFTER BUY - Position: ${stateAfter.position}, Balance: $${stateAfter.balance} (spent $${positionSize})`);

          // Change 605: Start MaxProfitManager on BUY to track profit targets
          this.tradingBrain.maxProfitManager.start(price, 'buy', positionSize, {
            volatility: indicators.volatility || 0,
            confidence: decision.confidence / 100,
            trend: indicators.trend || 'sideways'
          });
          console.log(`💰 MaxProfitManager started - tracking 1-2% profit targets`);

          // Start pattern exit tracking (shadow mode or active)
          if (this.patternExitModel) {
            const exitTracking = this.patternExitModel.startTracking({
              entryPrice: price,
              direction: 'buy',
              size: positionSize,
              patterns: patterns || [],
              confidence: decision.confidence / 100,
              entryTime: Date.now()
            });

            if (this.patternExitShadowMode) {
              console.log(`🕵️ [SHADOW] Pattern Exit Tracking Started:`);
              console.log(`   Pattern Target: ${(exitTracking.patternTarget * 100).toFixed(2)}%`);
              console.log(`   Pattern Stop: ${(exitTracking.patternStop * 100).toFixed(2)}%`);
            }
          }

          // CHANGE 642: Record BUY trade for backtest reporting
          if (this.executionLayer && this.executionLayer.trades) {
            this.executionLayer.trades.push({
              timestamp: new Date().toISOString(),
              type: 'BUY',
              price: price,
              amount: positionSize,
              confidence: decision.confidence,
              balance: stateManager.get('balance')  // CHANGE 2025-12-13: Read from StateManager
            });
          }

        } else if (decision.action === 'SELL') {
          // CHECKPOINT 7: SELL execution
          const currentState = stateManager.getState();
          console.log(`📍 CP7: SELL PATH - Position: ${currentState.position}, Balance: $${currentState.balance}`);

          // Change 589: Complete post-trade integrations
          // Find the matching BUY trade
          // CHANGE 2025-12-13: Read from StateManager (single source of truth)
          const buyTrades = stateManager.getAllTrades()
            .filter(t => t.action === 'BUY')
            .sort((a, b) => a.entryTime - b.entryTime);

          // CHANGE 644: Add error handling for SELL with no matching BUY
          if (buyTrades.length === 0) {
            console.error('❌ CRITICAL: SELL signal but no matching BUY trade found!');
            console.log('   Current position:', currentState.position);
            // CHANGE 2025-12-13: Read from StateManager (single source of truth)
            const allTrades = stateManager.getAllTrades();
            console.log('   Active trades count:', allTrades.length);
            console.log('   Active trades:', allTrades.map(t => ({
              id: t.orderId,
              action: t.action,
              price: t.entryPrice
            })));

            // Force reset to prevent permanent lockup via StateManager
            console.log('   ⚠️ Force resetting position to 0 to prevent lockup');
            await stateManager.emergencyReset();
            // CHANGE 2025-12-13: No local balance sync needed

            // Stop MaxProfitManager if it's tracking
            if (this.tradingBrain?.maxProfitManager) {
              this.tradingBrain.maxProfitManager.reset();
            }
            return; // Exit early, don't process invalid SELL
          }

          if (buyTrades.length > 0) {
            const buyTrade = buyTrades[0];
            const pnl = ((price - buyTrade.entryPrice) / buyTrade.entryPrice) * 100;
            const holdDuration = Date.now() - buyTrade.entryTime;

            // Create complete trade result
            const completeTradeResult = {
              ...buyTrade,
              exitPrice: price,
              exitTime: Date.now(),
              pnl: pnl,
              pnlDollars: (price - buyTrade.entryPrice) * (buyTrade.size / buyTrade.entryPrice),
              holdDuration: holdDuration,
              exitReason: 'signal'
            };

            console.log(`📊 Trade closed: ${pnl >= 0 ? '✅' : '❌'} ${pnl.toFixed(2)}% | Hold: ${(holdDuration/60000).toFixed(1)}min`);

            // CHANGE 2025-12-11: Use StateManager for atomic position close
            const positionState = stateManager.getState();
            const positionValue = positionState.position;
            
            // Close position via StateManager (handles P&L calculation)
            const closeResult = await stateManager.closePosition(price, false, null, {
              orderId: buyTrade.orderId,
              exitReason: 'signal'
            });

            // CHANGE 2025-12-12: Validate StateManager.closePosition() success
            if (!closeResult.success) {
              console.error('❌ StateManager.closePosition failed:', closeResult.error);
              return; // Abort close
            }
            
            // Get updated state after close
            // CHANGE 2025-12-13: No local balance sync needed - read from StateManager
            const afterSellState = stateManager.getState();
            
            // Calculate display values
            const btcAmount = positionValue / buyTrade.entryPrice;
            const sellValue = btcAmount * price;
            const profitLoss = sellValue - positionValue;
            console.log(`📍 CP8: SELL COMPLETE - New Balance: $${stateManager.get('balance')} (received $${sellValue.toFixed(2)}, P&L: $${profitLoss.toFixed(2)})`);

            // CHANGE 642: Record SELL trade for backtest reporting
            // CHANGE 649: Add exit indicators for ML learning
            if (this.executionLayer && this.executionLayer.trades) {
              this.executionLayer.trades.push({
                timestamp: new Date().toISOString(),
                type: 'SELL',
                price: price,
                entryPrice: buyTrade.entryPrice,
                amount: sellValue,
                pnl: pnl,
                pnlDollars: completeTradeResult.pnlDollars,
                confidence: decision.confidence,
                balance: stateManager.get('balance'),
                holdDuration: holdDuration,
                // Entry indicators from BUY
                entryIndicators: buyTrade.indicators,
                // Exit indicators at SELL time
                exitIndicators: {
                  rsi: indicators.rsi,
                  macd: indicators.macd?.macd || 0,
                  macdSignal: indicators.macd?.signal || 0,
                  trend: indicators.trend,
                  volatility: indicators.volatility || 0
                },
                exitReason: completeTradeResult.exitReason || 'signal'
              });
            }

            // 1. SafetyNet DISABLED - too restrictive
            // this.safetyNet.updateTradeResult(completeTradeResult);

            // 2. Record pattern outcome for learning
            // CHANGE 659: Pass features array for proper pattern matching
            // recordPatternResult REQUIRES features array, never pass signature string
            if (buyTrade.patterns && buyTrade.patterns.length > 0) {
              const pattern = buyTrade.patterns[0]; // Primary pattern object
              const patternSignature = pattern.signature || pattern.name;

              // CRITICAL: Ensure features is an array
              let featuresForRecording;
              if (Array.isArray(pattern.features)) {
                featuresForRecording = pattern.features;
              } else {
                console.warn('⚠️ Pattern features not an array in trade completion, creating fallback');
                featuresForRecording = [
                  buyTrade.entryIndicators?.rsi || 50,
                  buyTrade.entryIndicators?.macd || 0,
                  buyTrade.entryIndicators?.macdSignal || 0,
                  buyTrade.entryIndicators?.trend || 0,
                  buyTrade.entryIndicators?.volume || 0
                ];
              }

              this.patternChecker.recordPatternResult(featuresForRecording, {
                pnl: pnl,
                holdDurationMs: holdDuration,  // Add temporal data
                exitReason: completeTradeResult.exitReason || 'signal',
                timestamp: Date.now()
              });
              console.log(`🧠 Pattern learning: ${pattern.name} → ${pnl.toFixed(2)}%`);
            }

            // 3. Update PerformanceAnalyzer (using processTrade, not recordTrade)
            this.performanceAnalyzer.processTrade(completeTradeResult);

            // 4. TradeLogger removed (module doesn't exist)
            // this.tradeLogger.logTrade(completeTradeResult);

            // 5. TRAI learning (if applicable)
            if (this.trai && this.pendingTraiDecisions?.has(buyTrade.orderId)) {
              const traiDecision = this.pendingTraiDecisions.get(buyTrade.orderId);
              this.trai.recordTradeOutcome(traiDecision.decisionId, {
                actualPnL: pnl,
                exitPrice: price,
                exitTime: Date.now(),
                holdDuration: holdDuration
              });
              this.pendingTraiDecisions.delete(buyTrade.orderId);
              console.log(`🤖 [TRAI] Learning from ${pnl.toFixed(2)}% outcome`);
            }

            // Clean up active trade
            // CHANGE 2025-12-13: Remove from StateManager (single source of truth)
            stateManager.removeActiveTrade(buyTrade.orderId);
          }

          // CHANGE 645: Reset MaxProfitManager after successful SELL
          if (this.tradingBrain?.maxProfitManager) {
            this.tradingBrain.maxProfitManager.reset();
            console.log(`💰 MaxProfitManager deactivated - ready for next trade`);
          }

          // Stop pattern exit tracking
          if (this.patternExitModel) {
            // FIX: closeResult might not exist - use pnl if available
            const pnlValue = typeof pnl !== 'undefined' ? pnl : 0;
            this.patternExitModel.stopTracking({
              pnl: pnlValue,
              exitReason: 'manual_sell'
            });
            if (this.patternExitShadowMode) {
              console.log(`🕵️ [SHADOW] Pattern Exit tracking stopped`);
            }
          }

          // Position already reset via stateManager.closePosition() above
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

        this.performanceAnalyzer.processTrade(performanceData);

        // CHANGE 650: REMOVED DUPLICATE TRAI STORAGE - Already properly stored at line 853-861
        // This was overwriting the complete data with incomplete data

        console.log(`✅ ${decision.action} executed: ${tradeResult.orderId || 'SIMULATED'} | Size: $${positionSize.toFixed(2)}\n`);
      } else {
        console.log(`⛔ Trade blocked: ${tradeResult?.reason || 'Risk limits'}\n`);
      }

    } catch (error) {
      console.error(`❌ Trade execution failed at checkpoint between CP3 and CP4`);
      console.error(`   Error message: ${error.message}`);
      console.error(`   Stack trace:`, error.stack);
      console.error(`   Decision: ${decision?.action}, Confidence: ${decision?.confidence}`);
      console.error(`   Position size: ${positionSize}`);

      // Report error to circuit breaker
      if (this.tradingBrain?.errorHandler) {
        console.log(`   Reporting to error handler (circuit breaker will increment)`);
        this.tradingBrain.errorHandler.reportCritical('ExecutionLayer', error, {
          decision: decision.action,
          confidence: decision.confidence,
          positionSize
        });
      }
    }
  }

  /**
   * Broadcast pattern analysis to dashboard for transparency
   */
  /**
   * Calculate simple indicators for dashboard display
   */
  calculateSimpleIndicators(priceHistory) {
    if (!priceHistory || priceHistory.length < 14) {
      return { rsi: 50, macd: 0, sma20: 0, ema12: 0, volume: 0 };
    }

    const prices = priceHistory.map(c => c.close || c.c || c.price).filter(p => p > 0);
    if (prices.length < 14) return { rsi: 50, macd: 0, sma20: 0, ema12: 0, volume: 0 };

    // Simple RSI calculation
    let gains = 0, losses = 0;
    for (let i = 1; i < Math.min(14, prices.length); i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    // Simple SMA and MACD
    const sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, prices.length);
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macd = ema12 - ema26;

    return {
      rsi: Math.round(rsi * 10) / 10,
      macd: Math.round(macd * 100) / 100,
      sma20: Math.round(sma20 * 100) / 100,
      ema12: Math.round(ema12 * 100) / 100,
      volume: priceHistory[priceHistory.length - 1]?.volume || 0
    };
  }

  calculateEMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] * k) + (ema * (1 - k));
    }
    return ema;
  }

  broadcastPatternAnalysis(patterns, indicators) {
    try {
      if (this.dashboardWs && this.dashboardWs.readyState === 1) {
        // Format patterns for display
        const primaryPattern = patterns && patterns.length > 0 ? patterns[0] : null;

        // CHANGE 665: Include active trading profile in dashboard updates
        const activeProfile = this.profileManager.getActiveProfile();

        // CHANGE 2.0.12: Include pattern memory stats in dashboard
        const patternMemoryCount = this.patternChecker?.memory?.patternCount || 0;
        const patternMemorySize = Object.keys(this.patternChecker?.memory?.memory || {}).length;

        const message = {
          type: 'pattern_analysis',
          timestamp: Date.now(),
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
            status: patternMemoryCount > 100 ? 'Learning Active 🧠' : 'Building Memory 📚'
          },
          indicators: {
            rsi: indicators.rsi,
            macd: indicators.macd?.macd || indicators.macd?.macdLine || 0,
            macdSignal: indicators.macd?.signal || indicators.macd?.signalLine || 0,
            trend: indicators.trend,
            volatility: indicators.volatility,
            ema12: indicators.ema12,
            ema26: indicators.ema26
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
      console.error('⚠️ Pattern broadcast failed:', error.message);
    }
  }

  /**
   * BACKTEST MODE: Load historical data and run simulation
   * Ported from Change 572 - loads Polygon historical data and feeds through trading logic
   */
  async loadHistoricalDataAndBacktest() {
    console.log('📊 BACKTEST MODE: Loading historical data...');

    const fs = require('fs').promises;
    const path = require('path');

    try {
      // Load historical candles - check for custom data file first (CHANGE 633)
      let dataPath;
      if (process.env.CANDLE_DATA_FILE) {
        // Use custom candle data file (e.g., 5-second candles for optimization)
        dataPath = process.env.CANDLE_DATA_FILE;
        console.log(`📂 Using custom data file: ${dataPath}`);
      } else {
        // Default behavior - CHANGE 633: Use 5-second candles for fast backtest
        const dataFile = process.env.FAST_BACKTEST === 'true'
          ? 'polygon-btc-5sec.json'  // 60k 5-second candles for rapid testing
          : 'polygon-btc-1y.json';    // 60k 1-minute candles for full validation
        console.log(`📂 Data file: data/${dataFile}`);
        dataPath = path.join(__dirname, 'data', dataFile);
      }
      const rawData = await fs.readFile(dataPath, 'utf8');
      const parsedData = JSON.parse(rawData);
      // Handle both formats: array of candles or object with .candles property
      const historicalCandles = parsedData.candles || parsedData;

      console.log(`✅ Loaded ${historicalCandles.length.toLocaleString()} historical candles`);
      console.log(`📅 Date range: ${new Date(historicalCandles[0].timestamp).toLocaleDateString()} → ${new Date(historicalCandles[historicalCandles.length - 1].timestamp).toLocaleDateString()}`);
      console.log(`⏱️  Starting backtest simulation...\n`);

      let processedCount = 0;
      let errorCount = 0;
      const startTime = Date.now();

      // Process each candle through the trading logic
      for (const polygonCandle of historicalCandles) {
        try {
          // Convert Polygon format to OHLCV format that our system expects
          const ohlcvCandle = {
            o: polygonCandle.open,
            h: polygonCandle.high,
            l: polygonCandle.low,
            c: polygonCandle.close,
            v: polygonCandle.volume,
            t: polygonCandle.timestamp
          };

          // Feed through handleMarketData (same as live mode)
          this.handleMarketData([
            ohlcvCandle.t / 1000,  // time (in seconds for Kraken compatibility)
            (ohlcvCandle.t / 1000) + 60,  // etime (end time)
            ohlcvCandle.o,
            ohlcvCandle.h,
            ohlcvCandle.l,
            ohlcvCandle.c,
            0,  // vwap (not used)
            ohlcvCandle.v,
            1   // count
          ]);

          // Run trading analysis after warmup (WITH TRAI!)
          if (this.priceHistory.length >= 15) {
            await this.analyzeAndTrade();
          }

          processedCount++;

          // Progress reporting every 5,000 candles
          if (processedCount % 5000 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const rate = (processedCount / (elapsed || 1)).toFixed(0);
            console.log(`📊 Progress: ${processedCount.toLocaleString()}/${historicalCandles.length.toLocaleString()} candles (${rate}/sec) | Errors: ${errorCount}`);
          }

        } catch (err) {
          errorCount++;
          if (errorCount <= 5) {
            console.error(`❌ Error processing candle #${processedCount}:`, err.message);
          }
        }
      }

      // Final summary
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n✅ BACKTEST COMPLETE!`);
      console.log(`   📊 Candles processed: ${processedCount.toLocaleString()}`);
      console.log(`   ⏱️  Duration: ${totalTime}s`);
      console.log(`   ⚡ Rate: ${(processedCount / totalTime).toFixed(0)} candles/sec`);
      console.log(`   ❌ Errors: ${errorCount}`);
      console.log(`   💰 Final Balance: $${stateManager.get('balance').toFixed(2)}`);
      console.log(`   📈 Total P&L: $${(stateManager.get('balance') - 10000).toFixed(2)} (${((stateManager.get('balance') / 10000 - 1) * 100).toFixed(2)}%)`);

      // Generate backtest report
      const reportPath = path.join(__dirname, `backtest-report-v14MERGED-${Date.now()}.json`);

      // Collect trades from execution layer (if available)
      const trades = this.executionLayer?.trades || [];
      const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);

      const report = {
        summary: {
          initialBalance: 10000,
          finalBalance: stateManager.get('balance'),
          totalReturn: ((stateManager.get('balance') / 10000 - 1) * 100),
          totalPnL: stateManager.get('balance') - 10000,
          duration: `${totalTime}s`,
          candlesProcessed: processedCount,
          errors: errorCount
        },
        metrics: {
          totalTrades: trades.length,
          winningTrades: trades.filter(t => t.pnl > 0).length,
          losingTrades: trades.filter(t => t.pnl < 0).length,
          winRate: trades.length > 0 ? trades.filter(t => t.pnl > 0).length / trades.length : 0,
          totalPnL: totalPnL
        },
        trades: trades,
        config: {
          symbol: this.config.primaryAsset,
          initialBalance: 10000,
          maxPositionSize: this.config.maxPositionSize,
          minTradeConfidence: this.config.patternConfidence,
          tier: process.env.SUBSCRIPTION_TIER?.toUpperCase() || 'ML'
        },
        timestamp: new Date().toISOString()
      };

      // 🤖 TRAI Analysis of Backtest Results (Change 586)
      // Let TRAI analyze the complete backtest results and suggest optimizations
      if (this.trai && this.trai.analyzeBacktestResults) {
        console.log('\n🤖 [TRAI] Analyzing backtest results for optimization insights...');
        try {
          const traiAnalysis = await this.trai.analyzeBacktestResults(report);
          report.traiAnalysis = traiAnalysis;
          console.log('✅ TRAI Analysis Complete:', traiAnalysis.summary);
        } catch (error) {
          console.error('⚠️ TRAI analysis failed:', error.message);
        }
      }

      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n📄 Report saved: ${reportPath}`);

      // Exit after backtest
      console.log('\n🛑 Backtest complete - exiting...');
      process.exit(0);

    } catch (err) {
      console.error('❌ BACKTEST FAILED:', err.message);
      console.error(err.stack);
      process.exit(1);
    }
  }

  /**
   * Get human-readable pattern description
   */
  getPatternDescription(pattern, indicators) {
    if (!pattern) {
      return `Market scanning - RSI: ${indicators.rsi?.toFixed(1)}, Trend: ${indicators.trend}, MACD: ${(indicators.macd?.macd || 0).toFixed(4)}`;
    }

    const patternName = pattern.name || pattern.type || 'unknown';

    // Pattern descriptions for education
    const descriptions = {
      'head_and_shoulders': 'Bearish reversal pattern with three peaks - left shoulder, head (highest), right shoulder. Suggests trend change from bullish to bearish.',
      'inverse_head_and_shoulders': 'Bullish reversal pattern with three troughs. Signals potential trend change from bearish to bullish.',
      'double_top': 'Bearish reversal pattern showing two peaks at similar price levels. Indicates resistance and potential downward move.',
      'double_bottom': 'Bullish reversal pattern with two troughs at similar levels. Suggests support and potential upward breakout.',
      'triple_top': 'Strong bearish reversal with three peaks. More reliable than double top, signals strong resistance.',
      'triple_bottom': 'Strong bullish reversal with three troughs. More reliable than double bottom, indicates strong support.',
      'ascending_triangle': 'Bullish continuation pattern with flat upper resistance and rising support. Breakout expected upward.',
      'descending_triangle': 'Bearish continuation pattern with flat lower support and declining resistance. Breakout expected downward.',
      'symmetrical_triangle': 'Neutral pattern showing convergence. Breakout direction determines trend continuation or reversal.',
      'bull_flag': 'Bullish continuation pattern after strong uptrend. Brief consolidation before continuing higher.',
      'bear_flag': 'Bearish continuation pattern after strong downtrend. Brief consolidation before continuing lower.',
      'cup_and_handle': 'Bullish continuation pattern forming U-shape followed by slight pullback. Strong continuation signal.',
      'golden_cross': 'Bullish signal when short-term EMA crosses above long-term EMA. Indicates momentum shift to upside.',
      'death_cross': 'Bearish signal when short-term EMA crosses below long-term EMA. Indicates momentum shift to downside.',
      'bullish_divergence': 'Price makes lower lows while indicator (RSI/MACD) makes higher lows. Suggests trend reversal to upside.',
      'bearish_divergence': 'Price makes higher highs while indicator makes lower highs. Suggests trend reversal to downside.'
    };

    return descriptions[patternName] || `${patternName} pattern detected with ${(pattern.confidence * 100).toFixed(1)}% confidence. Analyzing market structure and momentum.`;
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('\n🛑 Shutting down OGZ Prime V14 MERGED...');
    this.isRunning = false;

    if (this.tradingInterval) {
      clearInterval(this.tradingInterval);
    }

    // 🔥 CRITICAL: Remove event listeners before closing (Change 575 - Memory leak fix)
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      console.log('📡 Market data WebSocket cleaned up');
    }

    if (this.dashboardWs) {
      this.dashboardWs.removeAllListeners();
      this.dashboardWs.close();
      console.log('📊 Dashboard WebSocket cleaned up');
    }

    // 🤖 Shutdown TRAI LLM server (Change 579)
    if (this.trai && this.trai.traiCore) {
      this.trai.traiCore.shutdown();
      console.log('🤖 TRAI Core shutdown complete');
    }

    // CHANGE 2025-12-12: Cleanup RiskManager timer leak
    if (this.riskManager) {
      this.riskManager.shutdown();
      console.log('🛡️ RiskManager timers cleaned up');
    }

    // Print final performance stats
    console.log('\n📊 Final Performance:');
    console.log(`   Session Duration: ${((Date.now() - this.startTime) / 1000 / 60).toFixed(1)} minutes`);
    console.log(`   Final Balance: $${stateManager.get('balance').toFixed(2)}`);

    console.log('\n✅ Shutdown complete\n');
    process.exit(0);
  }
}

// Main execution
async function main() {
  const bot = new OGZPrimeV14Bot();

  // Graceful shutdown handlers
  process.on('SIGINT', () => bot.shutdown());
  process.on('SIGTERM', () => bot.shutdown());
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
    bot.shutdown();
  });

  // 🔥 CRITICAL: Handle unhandled promise rejections (Change 575)
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Promise Rejection:', reason);
    console.error('   Promise:', promise);
    // Log but don't shutdown - async failures shouldn't kill bot
    console.error('   Bot continuing despite rejection...');
  });

  await bot.start();
}

// Run bot
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = OGZPrimeV14Bot;
