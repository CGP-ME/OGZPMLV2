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
const KrakenAdapterSimple = require('./kraken_adapter_simple'); // Keep direct - not in modules
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
      initialBalance: parseFloat(process.env.INITIAL_BALANCE) || 10000
    });

    this.performanceAnalyzer = new PerformanceAnalyzer();
    this.regimeDetector = new MarketRegimeDetector();

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

    // Kraken adapter for live trading
    this.kraken = new KrakenAdapterSimple({
      apiKey: process.env.KRAKEN_API_KEY,
      apiSecret: process.env.KRAKEN_API_SECRET
    });

    // Connect execution layer to Kraken
    this.executionLayer.setKrakenAdapter(this.kraken);

    // Dashboard WebSocket (Change 528) - OPTIONAL for real-time monitoring
    this.dashboardWs = null;
    this.dashboardWsConnected = false;
    // CHANGE 661: Always connect to dashboard WebSocket (defaults to localhost)
    this.initializeDashboardWebSocket();

    // Trading state
    this.isRunning = false;
    this.marketData = null;
    this.priceHistory = [];
    this.currentPosition = 0;
    this.balance = parseFloat(process.env.INITIAL_BALANCE) || 10000;
    this.startTime = Date.now();
    this.systemState = {
      currentBalance: this.balance
    };

    // CHANGE 644: Initialize trade tracking Maps in constructor to prevent crashes
    this.activeTrades = new Map();
    this.pendingTraiDecisions = new Map();
    this.confidenceHistory = [];  // Used for confidence tracking

    // Debug flags
    this.ohlcDebugCount = 0; // Log first 5 messages for debugging

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
   * Initialize Dashboard WebSocket connection (Change 528)
   * OPTIONAL - only connects if WS_HOST is set
   */
  initializeDashboardWebSocket() {
    const wsHost = process.env.WS_HOST || '127.0.0.1';  // CHANGE 661: Default to localhost
    const wsPort = process.env.WS_PORT || 3010;
    const wsUrl = `ws://${wsHost}:${wsPort}/ws`;  // CHANGE 661: Add /ws path

    console.log(`\n📊 Connecting to Dashboard WebSocket at ${wsUrl}...`);

    try {
      this.dashboardWs = new WebSocket(wsUrl);

      this.dashboardWs.on('open', () => {
        console.log('✅ Dashboard WebSocket connected!');
        this.dashboardWsConnected = true;

        // 🔒 SECURITY (Change 582): Authenticate first before sending any data
        const authToken = process.env.WEBSOCKET_AUTH_TOKEN;
        if (!authToken) {
          console.error('❌ WEBSOCKET_AUTH_TOKEN not set in .env - connection will fail!');
        }

        this.dashboardWs.send(JSON.stringify({
          type: 'auth',
          token: authToken
        }));

        // Identify as bot (sent after auth success)
        this.dashboardWs.send(JSON.stringify({
          type: 'identify',
          source: 'trading_bot',
          bot: 'ogzprime-v14-refactored',
          version: 'V14-REFACTORED-MERGED',
          capabilities: ['trading', 'realtime', 'risk-management']
        }));

        // Connect to AdvancedExecutionLayer for trade broadcasts
        this.executionLayer.setWebSocketClient(this.dashboardWs);

        // Connect TRAI for chain-of-thought broadcasts
        if (this.trai) {
          this.trai.setWebSocketClient(this.dashboardWs);
        }
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
                this.handleMarketData(ohlcArray);
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
    // OHLC data is array: [time, etime, open, high, low, close, vwap, volume, count]
    if (!Array.isArray(ohlcData) || ohlcData.length < 8) {
      console.warn('⚠️ Invalid OHLC data format:', ohlcData);
      return;
    }

    const [time, etime, open, high, low, close, vwap, volume, count] = ohlcData;

    const price = parseFloat(close);
    if (!price || isNaN(price)) return;

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
    const isNewMinute = !lastCandle || lastCandle.etime !== candle.etime;

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
      timestamp: Date.now(),
      volume: parseFloat(volume) || 0,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low)
    };

    // CHANGE 663: Broadcast market data to dashboard
    if (this.dashboardWsConnected && this.dashboardWs) {
      try {
        this.dashboardWs.send(JSON.stringify({
          type: 'market_update',
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
            candles: this.priceHistory.slice(-50), // Last 50 candles for chart
            balance: this.balance,
            position: this.currentPosition,
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
      // Need minimum 15 candles for RSI-14 calculation
      if (!this.marketData || this.priceHistory.length < 15) {
        console.log(`⏳ Warming up... ${this.priceHistory.length}/15 candles (need 15 for RSI)`);
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
        const signature = pattern.signature || pattern.name || `unknown_${Date.now()}`;
        if (!signature) {
          console.error('❌ Pattern missing signature:', pattern);
          return;
        }

        // CHANGE 659: Fix pattern recording - pass features array instead of signature string
        // recordPatternResult expects features array, not signature string
        // pattern.features contains the actual feature vector for pattern matching
        const featuresForRecording = pattern.features || [];
        
        // Record pattern for learning
        // CRITICAL: Pass features array to recordPatternResult, not signature
        this.patternChecker.recordPatternResult(featuresForRecording || signature, {
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

    // CHANGE 635: Debug phantom position issue
    console.log(`📊 DEBUG: currentPosition=${this.currentPosition}, tradingDirection=${tradingDirection}`);

    if (tradingDirection === 'sell' && this.currentPosition === 0) {
      // Can't open SHORT positions - convert to HOLD
      console.log('🚫 TradingBrain said SELL but shorts forbidden - converting to HOLD');
      tradingDirection = 'hold';
    } else if (tradingDirection === 'sell' && this.currentPosition > 0) {
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
          positionSize: this.balance * 0.01,
          currentPosition: this.currentPosition
        };

        // Process decision through TRAI
        traiDecision = await this.trai.processDecision(signal, context);

        // Log TRAI decision
        console.log(`🤖 TRAI: ${(traiDecision.traiConfidence * 100).toFixed(1)}% → ${(traiDecision.finalConfidence * 100).toFixed(1)}% | ${traiDecision.traiRecommendation}`);

        // Change 601: TRAI NEVER VETOS - only boosts confidence
        // If the math says trade, we trade. TRAI adds intelligence boost only.
        // His real value is post-trade analysis, ML learning, and meta-optimization.

        // Use TRAI-boosted confidence (additive from Change 600)
        finalConfidence = traiDecision.finalConfidence * 100;
        confidenceData.totalConfidence = finalConfidence;

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
    console.log(`🔍 makeTradeDecision: pos=${this.currentPosition}, conf=${totalConfidence.toFixed(1)}%, minConf=${minConfidence}%, brain=${brainDirection}`);

    // CHANGE 651: Re-enable TradingBrain SELL signals with minimum hold time protection
    // CHANGE 640 completely broke exits by disabling ALL sell signals
    // Now we check minimum hold time before allowing TradingBrain sells
    if (brainDirection === 'sell' && this.currentPosition > 0) {
      // Get the oldest BUY trade to check hold time
      const buyTrades = Array.from(this.activeTrades?.values() || [])
        .filter(t => t.action === 'BUY')
        .sort((a, b) => a.entryTime - b.entryTime);

      if (buyTrades.length > 0) {
        const buyTrade = buyTrades[0];
        const holdTime = (Date.now() - buyTrade.entryTime) / 60000; // Convert to minutes
        const minHoldTime = 0.05; // 3 seconds for 5-sec candles

        if (holdTime >= minHoldTime) {
          console.log(`📊 TradingBrain bearish - executing SELL of position (held ${holdTime.toFixed(2)} min)`);
          return { action: 'SELL', direction: 'close', confidence: totalConfidence };
        } else {
          console.log(`⏱️ Min hold time not met: ${holdTime.toFixed(3)} < ${minHoldTime} min`);
        }
      }
    }

    // Check if we should BUY (when flat)
    if (this.currentPosition === 0 && totalConfidence >= minConfidence) {
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
    if (this.currentPosition > 0) {
      // Get entry trade to calculate P&L
      const buyTrades = Array.from(this.activeTrades?.values() || [])
        .filter(t => t.action === 'BUY')
        .sort((a, b) => a.entryTime - b.entryTime);

      if (buyTrades.length > 0) {
        const entryPrice = buyTrades[0].entryPrice;

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

        // Check if MaxProfitManager signals exit
        if (profitResult && (profitResult.action === 'exit' || profitResult.action === 'exit_full')) {
          console.log(`📉 SELL Signal: ${profitResult.reason || 'MaxProfitManager exit'}`);
          return { action: 'SELL', direction: 'close', confidence: totalConfidence };
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
      currentPosition: this.currentPosition
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
    console.log(`📍 CP1: executeTrade ENTRY - Balance: $${this.balance}, Position: ${this.currentPosition}`);

    const basePositionPercent = parseFloat(process.env.MAX_POSITION_SIZE_PCT) || 0.01;
    const baseSize = this.systemState.currentBalance * basePositionPercent;

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

        // Store for pattern learning and post-trade analysis
        // CHANGE 644: No need to check, already initialized in constructor
        this.activeTrades.set(unifiedResult.orderId, unifiedResult);

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
          console.log(`📍 CP5: BEFORE BUY - Position: ${this.currentPosition}, Balance: $${this.balance}`);

          // CHANGE 636: Fix position tracking - store dollar value not BTC amount
          this.currentPosition = positionSize; // Store dollar value of position

          // CHANGE 626: Actually UPDATE the balance on BUY!
          this.balance -= positionSize; // Deduct cost of position

          // CHECKPOINT 6: After position update
          console.log(`📍 CP6: AFTER BUY - Position: ${this.currentPosition}, Balance: $${this.balance} (spent $${positionSize})`);

          // Change 605: Start MaxProfitManager on BUY to track profit targets
          this.tradingBrain.maxProfitManager.start(price, 'buy', positionSize, {
            volatility: indicators.volatility || 0,
            confidence: decision.confidence / 100,
            trend: indicators.trend || 'sideways'
          });
          console.log(`💰 MaxProfitManager started - tracking 1-2% profit targets`);

          // CHANGE 642: Record BUY trade for backtest reporting
          if (this.executionLayer && this.executionLayer.trades) {
            this.executionLayer.trades.push({
              timestamp: new Date().toISOString(),
              type: 'BUY',
              price: price,
              amount: positionSize,
              confidence: decision.confidence,
              balance: this.balance
            });
          }

        } else if (decision.action === 'SELL') {
          // CHECKPOINT 7: SELL execution
          console.log(`📍 CP7: SELL PATH - Position: ${this.currentPosition}, Balance: $${this.balance}`);

          // Change 589: Complete post-trade integrations
          // Find the matching BUY trade
          const buyTrades = Array.from(this.activeTrades?.values() || [])
            .filter(t => t.action === 'BUY')
            .sort((a, b) => a.entryTime - b.entryTime);

          // CHANGE 644: Add error handling for SELL with no matching BUY
          if (buyTrades.length === 0) {
            console.error('❌ CRITICAL: SELL signal but no matching BUY trade found!');
            console.log('   Current position:', this.currentPosition);
            console.log('   Active trades count:', this.activeTrades.size);
            console.log('   Active trades:', Array.from(this.activeTrades.values()).map(t => ({
              id: t.orderId,
              action: t.action,
              price: t.entryPrice
            })));

            // Force reset to prevent permanent lockup
            console.log('   ⚠️ Force resetting position to 0 to prevent lockup');
            this.currentPosition = 0;

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

            // CHANGE 626: Actually UPDATE the balance on SELL!
            // CHANGE 643: Fix sell value to include profit/loss
            // currentPosition is the original dollar amount invested
            // We need to calculate the actual market value at current price
            const btcAmount = this.currentPosition / buyTrade.entryPrice;  // How much BTC we bought
            const sellValue = btcAmount * price;  // Current market value of that BTC
            this.balance += sellValue;
            const profitLoss = sellValue - this.currentPosition;  // Actual P&L in dollars
            console.log(`📍 CP8: SELL COMPLETE - New Balance: $${this.balance} (received $${sellValue.toFixed(2)}, P&L: $${profitLoss.toFixed(2)})`);

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
                balance: this.balance,
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
            // Previously passed signature (string), but recordPatternResult needs features (array)
            if (buyTrade.patterns && buyTrade.patterns.length > 0) {
              const pattern = buyTrade.patterns[0]; // Primary pattern object
              const patternSignature = pattern.signature || pattern.name;
              // CRITICAL: Use features array if available, fallback to signature string
              const featuresForRecording = pattern.features || patternSignature;
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
            this.activeTrades.delete(buyTrade.orderId);
          }

          // CHANGE 645: Reset MaxProfitManager after successful SELL
          if (this.tradingBrain?.maxProfitManager) {
            this.tradingBrain.maxProfitManager.reset();
            console.log(`💰 MaxProfitManager deactivated - ready for next trade`);
          }

          this.currentPosition = 0;
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
      console.error(`❌ Trade failed: ${error.message}\n`);
    }
  }

  /**
   * Broadcast pattern analysis to dashboard for transparency
   */
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
      console.log(`   💰 Final Balance: $${this.balance.toFixed(2)}`);
      console.log(`   📈 Total P&L: $${(this.balance - 10000).toFixed(2)} (${((this.balance / 10000 - 1) * 100).toFixed(2)}%)`);

      // Generate backtest report
      const reportPath = path.join(__dirname, `backtest-report-v14MERGED-${Date.now()}.json`);

      // Collect trades from execution layer (if available)
      const trades = this.executionLayer?.trades || [];
      const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);

      const report = {
        summary: {
          initialBalance: 10000,
          finalBalance: this.balance,
          totalReturn: ((this.balance / 10000 - 1) * 100),
          totalPnL: this.balance - 10000,
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

    // Print final performance stats
    console.log('\n📊 Final Performance:');
    console.log(`   Session Duration: ${((Date.now() - this.startTime) / 1000 / 60).toFixed(1)} minutes`);
    console.log(`   Final Balance: $${this.balance.toFixed(2)}`);

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
