/**
 * TradingConfig.js - CENTRALIZED TRADING CONFIGURATION
 * =====================================================
 * SINGLE SOURCE OF TRUTH for ALL trading parameters.
 *
 * RULES:
 * 1. ConfigLoader owns dotenv loading; this file reads already-loaded process.env values for trading params
 * 2. All other files import from TradingConfig, NEVER from process.env directly
 * 3. If you find parseFloat(process.env.TRADING_PARAM) anywhere else, it's a bug
 * 4. Use setOverrides() for backtest/dashboard temporary config changes
 *
 * Created: 2026-02-28
 * Purpose: Eliminate scattered hardcoded values across 15+ files
 */

const tradingConfigFile = require('../config/trading.config.json');

// Helper to parse env vars with fallback
const env = (key, fallback) => {
  const val = process.env[key];
  if (val === undefined || val === '') return fallback;
  const num = parseFloat(val);
  return isNaN(num) ? val : num;
};

// FIX 28: Strict numeric env reader — returns Number, throws on non-numeric.
// Used by Fix 20 (DTS/UPM/DLL env-read centralization) to surface bad config
// loudly rather than silently coerce strings/NaN through to risk math.
// NOTE: module.exports attachment for this function is in a separate str_replace
// pair below — must be attached AFTER the module.exports = TradingConfig line
// at ~1130, otherwise the late reassignment wipes the attachment.
const envNumber = (key, fallback) => {
  const val = process.env[key];
  if (val === undefined || val === '') return fallback;
  const num = Number(val);
  if (!Number.isFinite(num)) {
    throw new Error(`[FIX-28] envNumber: ${key}="${val}" is not a finite number`);
  }
  return num;
};

const envBool = (key, fallback) => {
  const val = process.env[key];
  if (val === undefined || val === '') return fallback;
  return val === 'true' || val === '1';
};

function requiredConfigNumber(configPath) {
  const value = configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), tradingConfigFile);
  if (!Number.isFinite(value)) {
    throw new Error(`[TradingConfig] config/trading.config.json ${configPath} must be a finite number`);
  }
  return value;
}

const PROFILE_FORBIDDEN_ENV_KEYS = Object.freeze([
  'EXECUTION_MODE',
  'CANDLE_SOURCE',
  'BACKTEST_MODE',
  'TEST_MODE',
  'BACKTEST_NO_PATTERN_SAVE',
  'PAPER_TRADING',
  'NODE_ENV',
  'STOP_LOSS_PERCENT',
  'TAKE_PROFIT_PERCENT',
  'TRAILING_STOP_PERCENT',
  'TRAILING_ACTIVATION',
]);

const PROFILE_ENV_CONFIG_PATHS = Object.freeze({
  INITIAL_BALANCE: Object.freeze(['startingBalance']),
  MIN_TRADE_CONFIDENCE: Object.freeze(['confidence.minTradeConfidence']),
  ENABLE_DYNAMIC_SIZING: Object.freeze(['features.enableDynamicSizing']),
  BASE_POSITION_SIZE: Object.freeze(['positionSizing.basePositionSize']),
  MAX_POSITION_SIZE_PCT: Object.freeze(['positionSizing.maxPositionSize']),
  BASE_POSITION_PCT: Object.freeze(['entryLogic.sizing.basePositionPercent']),
  MAX_POSITION_PCT: Object.freeze(['entryLogic.sizing.maxPositionPercent']),
  ABSOLUTE_POSITION_CAP: Object.freeze(['entryLogic.sizing.absoluteCapPercent']),
  ENTRY_STOCK_SHARE_RANGE_ENABLED: Object.freeze(['entryLogic.sizing.stockShareRange.enabled']),
  ENTRY_MIN_STOCK_SHARES: Object.freeze(['entryLogic.sizing.stockShareRange.minShares']),
  ENTRY_MAX_STOCK_SHARES: Object.freeze(['entryLogic.sizing.stockShareRange.maxShares']),
  ENTRY_MAX_STOCK_NOTIONAL: Object.freeze(['entryLogic.sizing.stockShareRange.maxNotionalUsd']),
  ENTRY_CONSISTENCY_CAP_BUFFER: Object.freeze(['entryLogic.sizing.stockShareRange.consistencyCapBuffer']),
  ENTRY_DAILY_LOSS_RISK_FRACTION: Object.freeze(['entryLogic.sizing.stockShareRange.dailyLossRiskFraction']),
  TIER1_TARGET: Object.freeze(['exits.profitTiers.tier1']),
  TIER2_TARGET: Object.freeze(['exits.profitTiers.tier2']),
  TIER3_TARGET: Object.freeze(['exits.profitTiers.tier3']),
  FINAL_TARGET: Object.freeze(['exits.profitTiers.final']),
  TIER1_EXIT_FRACTION: Object.freeze(['exitLogic.tieredExit.tier1ExitFraction']),
  TIER2_EXIT_FRACTION: Object.freeze(['exitLogic.tieredExit.tier2ExitFraction']),
  TIER3_EXIT_FRACTION: Object.freeze(['exitLogic.tieredExit.tier3ExitFraction']),
  MAX_DRAWDOWN: Object.freeze(['risk.maxDrawdown']),
  MAX_DAILY_LOSS: Object.freeze(['risk.maxDailyLoss']),
  MAX_WEEKLY_LOSS: Object.freeze(['risk.maxWeeklyLoss']),
  MAX_MONTHLY_LOSS: Object.freeze(['risk.maxMonthlyLoss']),
  ACCOUNT_DRAWDOWN_BYPASS: Object.freeze([
    'risk.accountDrawdownBypass',
    'exitLogic.safety.accountDrawdownBypass',
    'universalLimits.accountDrawdownBypass',
  ]),
  ACCOUNT_DRAWDOWN_PCT: Object.freeze([
    'exitLogic.safety.accountDrawdownPercent',
    'universalLimits.accountDrawdownPercent',
  ]),
  RISK_MANAGER_BYPASS: Object.freeze(['risk.riskManagerBypass']),
  ATR_FILTER_ENABLED: Object.freeze(['filters.atrEnabled']),
  ATR_MIN_PERCENT: Object.freeze(['filters.atrMinPercent']),
  EXIT_SYSTEM: Object.freeze(['exits.exitSystem']),
  FEE_MODEL: Object.freeze(['fees.model']),
  FEE_MAKER: Object.freeze(['fees.makerFee']),
  FEE_TAKER: Object.freeze(['fees.takerFee']),
  FEE_TOTAL_ROUNDTRIP: Object.freeze(['fees.totalRoundTrip']),
  FEE_SAFETY_BUFFER: Object.freeze(['fees.safetyBuffer']),
  FEE_SLIPPAGE: Object.freeze(['fees.slippage']),
  FEE_PER_SHARE: Object.freeze(['fees.perShare']),
  FEE_MIN_ORDER: Object.freeze(['fees.minOrderFee']),
  TTP_DAILY_LOSS_LIMIT_DOLLARS: Object.freeze(['evalRules.ttp.accountLimits.dailyLossDollars']),
  TTP_MAX_LOSS_THRESHOLD_EQUITY: Object.freeze(['evalRules.ttp.accountLimits.maxLossThresholdEquity']),
  TTP_PROFIT_TARGET_DOLLARS: Object.freeze(['evalRules.ttp.consistency.profitTargetDollars']),
  TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO: Object.freeze(['evalRules.ttp.consistency.maxPositionProfitRatio']),
  TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO: Object.freeze(['evalRules.ttp.consistency.maxProfitTargetInitialBalanceRatio']),
});

const PROFILE_BOOLEAN_ENV_KEYS = Object.freeze(new Set([
  'ENABLE_DYNAMIC_SIZING',
  'ENTRY_STOCK_SHARE_RANGE_ENABLED',
  'ACCOUNT_DRAWDOWN_BYPASS',
  'RISK_MANAGER_BYPASS',
  'ATR_FILTER_ENABLED',
]));

const PROFILE_STRING_ENV_KEYS = Object.freeze(new Set([
  'EXIT_SYSTEM',
  'FEE_MODEL',
]));

const PROFILE_RUNTIME_SNAPSHOT_ENV_KEYS = Object.freeze(new Set([
  'INITIAL_BALANCE',
  'MIN_TRADE_CONFIDENCE',
  'RISK_MANAGER_BYPASS',
  'ACCOUNT_DRAWDOWN_PCT',
  'MAX_DRAWDOWN',
  'MAX_DAILY_LOSS',
  'MAX_WEEKLY_LOSS',
  'MAX_MONTHLY_LOSS',
  'EXIT_SYSTEM',
  'TTP_DAILY_LOSS_LIMIT_DOLLARS',
  'TTP_MAX_LOSS_THRESHOLD_EQUITY',
  'TTP_PROFIT_TARGET_DOLLARS',
  'TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO',
  'TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO',
]));

const PROFILE_SNAPSHOT_MISSING = Symbol('profile_snapshot_missing');

function assertProfileEnvIsHonest(profile) {
  const forbidden = PROFILE_FORBIDDEN_ENV_KEYS.filter(key => (
    Object.prototype.hasOwnProperty.call(profile.env || {}, key)
  ));
  if (forbidden.length > 0) {
    throw new Error(
      `Tuning profile '${profile.name}' includes non-profile env key(s): ${forbidden.join(', ')}. ` +
      'Runtime mode, pattern-write protection, and locked strategy exit contracts must stay owned by their dedicated layers.'
    );
  }

  const unmapped = Object.keys(profile.env || {}).filter(key => !PROFILE_ENV_CONFIG_PATHS[key]);
  if (unmapped.length > 0) {
    throw new Error(
      `Tuning profile '${profile.name}' includes unmapped config key(s): ${unmapped.join(', ')}. ` +
      'Add an explicit PROFILE_ENV_CONFIG_PATHS mapping before the profile can own the value.'
    );
  }
}

function freezeTuningProfile(profile) {
  assertProfileEnvIsHonest(profile);
  return Object.freeze({
    ...profile,
    evidence: Object.freeze([...(profile.evidence || [])]),
    env: Object.freeze({ ...profile.env }),
  });
}

function buildTuningProfilesConfig() {
  const tuningProfiles = tradingConfigFile.tuningProfiles;
  if (!tuningProfiles || typeof tuningProfiles !== 'object' || Array.isArray(tuningProfiles)) {
    throw new Error('[TradingConfig] config/trading.config.json must define tuningProfiles');
  }

  const { defaultProfile, definitions } = tuningProfiles;
  if (typeof defaultProfile !== 'string' || defaultProfile.trim() === '') {
    throw new Error('[TradingConfig] tuningProfiles.defaultProfile must be a non-empty string');
  }
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) {
    throw new Error('[TradingConfig] tuningProfiles.definitions must be an object');
  }
  if (!Object.prototype.hasOwnProperty.call(definitions, defaultProfile)) {
    throw new Error(`[TradingConfig] tuningProfiles.defaultProfile '${defaultProfile}' is missing from definitions`);
  }

  const frozenDefinitions = {};
  for (const [profileName, profile] of Object.entries(definitions)) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new Error(`[TradingConfig] tuningProfiles.definitions.${profileName} must be an object`);
    }
    if (profile.name !== profileName) {
      throw new Error(`[TradingConfig] tuning profile key '${profileName}' must match profile.name '${profile.name}'`);
    }
    frozenDefinitions[profileName] = freezeTuningProfile(profile);
  }

  return Object.freeze({
    defaultProfile,
    definitions: Object.freeze(frozenDefinitions),
  });
}

function freezeStringMap(values) {
  return Object.freeze({ ...values });
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreezePlain(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreezePlain(child);
  }
  return value;
}

function buildRuntimeProfilesConfig() {
  const profiles = tradingConfigFile.profiles;
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
    throw new Error('[TradingConfig] config/trading.config.json must define profiles');
  }

  for (const [profileName, profile] of Object.entries(profiles)) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new Error(`[TradingConfig] profiles.${profileName} must be an object`);
    }

    const requiredKeys = ['minConfidence', 'maxPositionSize', 'riskPercent', 'maxHoldMinutes'];
    const missing = requiredKeys.filter(key => !Number.isFinite(Number(profile[key])));
    if (missing.length > 0) {
      throw new Error(`[TradingConfig] profiles.${profileName} has invalid numeric key(s): ${missing.join(', ')}`);
    }
  }

  return deepFreezePlain(clonePlain(profiles));
}

function sameConfigValue(left, right) {
  return Object.is(left, right);
}

// =============================================================================
// BASE CONFIGURATION - Read from .env with sensible defaults
// =============================================================================

const BASE_CONFIG = {
  // =========================================================================
  // CONFIDENCE THRESHOLDS
  // =========================================================================
  confidence: {
    minTradeConfidence: env('MIN_TRADE_CONFIDENCE', requiredConfigNumber('confidence.minTradeConfidence')),
    maxConfidence: env('MAX_CONFIDENCE', requiredConfigNumber('confidence.maxConfidence')),
    minStrategyConfidence: env('MIN_STRATEGY_CONFIDENCE', requiredConfigNumber('confidence.minStrategyConfidence')),
    candlePatternMinConfidence: env('CANDLE_PATTERN_MIN_CONFIDENCE', requiredConfigNumber('confidence.candlePatternMinConfidence')),
    regimeMinConfidence: env('REGIME_MIN_CONFIDENCE', requiredConfigNumber('confidence.regimeMinConfidence')),
    confluenceMinScore: env('CONFLUENCE_MIN_SCORE', requiredConfigNumber('confidence.confluenceMinScore')),
    tpoStrengthMin: env('TPO_STRENGTH_MIN', requiredConfigNumber('confidence.tpoStrengthMin')),
  },

  // =========================================================================
  // RISK MANAGEMENT
  // =========================================================================
  risk: {
    maxRiskPerTrade: env('MAX_RISK_PER_TRADE', 0.02),           // 2% max risk per trade
    accountDrawdownBypass: envBool('ACCOUNT_DRAWDOWN_BYPASS', false),
    // RiskManager circuit limits are startup-owned by ConfigLoader/RiskManagerConfig.
    // Profiles may still write risk.* startup overrides, but BASE_CONFIG must not carry stale defaults.

    // Recovery mode (after losses)
    recoveryModeReduction: 0.50,                                  // 50% size reduction in recovery
    counterTrendReduction: 0.30,                                  // 30% reduction against trend
    lowConfidenceReduction: 0.25,                                 // 25% reduction on weak signals
    highConfidenceBoost: 1.30,                                    // 1.3x on strong signals
  },

  // =========================================================================
  // PATTERN MEMORY
  // =========================================================================
  patternMemory: {
    minSamples: 10,
    successThreshold: 0.65,
    failureThreshold: 0.35,
    maxAgeDays: 90,
    decayHalflifeDays: 30,
    maxPatterns: 10000,
    dtwThreshold: 0.62,
    featureWeights: Object.freeze([
      0.25,
      0.15,
      0.15,
      0.10,
      0.05,
      0.05,
      0.15,
      0.05,
      0.05,
    ]),
    persistToDisk: true,
    saveIntervalMs: 300000,
    bank: Object.freeze({
      minTradesSample: 10,
      successThreshold: 0.65,
      failureThreshold: 0.35,
      maxPatternAgeMs: 7776000000,
      promoteMinSamples: 30,
      quarantineMinSamples: 15,
      promoteMinWinRate: 0.55,
      promoteMinAvgR: 0.15,
      quarantineMaxWinRate: 0.45,
      maxPatterns: 10000,
    }),
  },

  // =========================================================================
  // POSITION SIZING
  // =========================================================================
  positionSizing: {
    basePositionSize: env('BASE_POSITION_SIZE', 0.01),           // 1% base position
    maxPositionSize: env('MAX_POSITION_SIZE_PCT', 0.05),         // 5% max position
    maxPositions: env('MAX_POSITIONS', 3),                        // Max concurrent positions

    // Volatility-based scaling
    lowVolMultiplier: env('LOW_VOL_MULTIPLIER', 1.5),            // 1.5x in calm markets
    highVolMultiplier: env('HIGH_VOL_MULTIPLIER', 0.6),          // 0.6x in choppy markets
    lowVolThreshold: env('LOW_VOL_THRESHOLD', 0.015),            // 1.5% = low volatility
    highVolThreshold: env('HIGH_VOL_THRESHOLD', 0.035),          // 3.5% = high volatility

    // Confidence-scaled sizing (from engine tuning)
    confidenceSizeMin: 0.5,                                       // 50% base at low confidence
    confidenceSizeMax: 2.5,                                       // 250% base at high confidence
    confidenceSizeSlope: 4.0,                                     // scaling factor

    // Confluence multipliers
    confluenceMultipliers: {
      1: 1.0,   // 1 strategy = base size
      2: 1.5,   // 2 strategies agree = 1.5x
      3: 2.0,   // 3 strategies agree = 2x
      4: 2.5,   // 4+ strategies = capped at 2.5x
    },
  },

  // =========================================================================
  // REGIME-BASED STRATEGY BOOSTING (for matrix sweep optimization)
  // =========================================================================
  // FIX 2026-04-05: Multipliers applied during confidence evaluation
  // Trend strategies boosted in trending markets, suppressed in ranging
  // IMPORTANT 2026-04-16: Multipliers MUTATE result.confidence in-place
  // (StrategyOrchestrator.js:772). This affects winner selection AND
  // the MIN_TRADE_CONFIDENCE gate — not only position sizing.
  // A strategy whose raw confidence is below threshold can pass the gate
  // after regime boost. A raw-higher strategy can lose winner selection
  // to a raw-lower strategy with more favorable regime boost.
  regimeBoosts: {
    trending: {
      EMASMACrossover: env('REGIME_TREND_EMA', 1.15),
      MADynamicSR: env('REGIME_TREND_MASR', 1.15),
      RSI: env('REGIME_TREND_RSI', 0.85),
      LiquiditySweep: env('REGIME_TREND_SWEEP', 1.00),
      SmartMoneySweep: env('REGIME_TREND_SMS', 1.00),
    },
    ranging: {
      EMASMACrossover: env('REGIME_RANGE_EMA', 0.85),
      MADynamicSR: env('REGIME_RANGE_MASR', 0.85),
      RSI: env('REGIME_RANGE_RSI', 1.15),
      LiquiditySweep: env('REGIME_RANGE_SWEEP', 1.00),
      SmartMoneySweep: env('REGIME_RANGE_SMS', 1.10),
    },
    volatile: {
      EMASMACrossover: env('REGIME_VOL_EMA', 0.70),
      MADynamicSR: env('REGIME_VOL_MASR', 0.70),
      RSI: env('REGIME_VOL_RSI', 1.10),
      LiquiditySweep: env('REGIME_VOL_SWEEP', 1.20),
      SmartMoneySweep: env('REGIME_VOL_SMS', 1.15),
      _positionSizeMultiplier: env('REGIME_VOL_POS_MULT', 0.60),
    },
    dead: {
      EMASMACrossover: env('REGIME_DEAD_EMA', 0.60),
      MADynamicSR: env('REGIME_DEAD_MASR', 0.70),
      RSI: env('REGIME_DEAD_RSI', 0.70),
      LiquiditySweep: env('REGIME_DEAD_SWEEP', 0.50),
      SmartMoneySweep: env('REGIME_DEAD_SMS', 0.50),
      _positionSizeMultiplier: env('REGIME_DEAD_POS_MULT', 0.50),
    },
    unknown: {},
  },

  // VOLUME PROFILE BOOSTS (Auction Market Theory - Fabio Valentino)
  // =========================================================================
  // FIX 2026-04-05: Multipliers based on price position relative to VP levels
  // aboveVAH = breakout zone (boost trend), atPOC = mean reversion zone, inLVN = unpredictable
  volumeProfileBoosts: {
    aboveVAH: {  // Price broke above Value Area High = bullish breakout
      EMASMACrossover: env('VP_ABOVE_VAH_EMA', 1.20),
      MADynamicSR: env('VP_ABOVE_VAH_MASR', 1.20),
      RSI: env('VP_ABOVE_VAH_RSI', 0.80),
      LiquiditySweep: env('VP_ABOVE_VAH_SWEEP', 1.10),
      SmartMoneySweep: env('VP_ABOVE_VAH_SMS', 1.10),
    },
    belowVAL: {  // Price broke below Value Area Low = bearish breakdown
      EMASMACrossover: env('VP_BELOW_VAL_EMA', 1.20),
      MADynamicSR: env('VP_BELOW_VAL_MASR', 1.20),
      RSI: env('VP_BELOW_VAL_RSI', 0.80),
      LiquiditySweep: env('VP_BELOW_VAL_SWEEP', 1.10),
      SmartMoneySweep: env('VP_BELOW_VAL_SMS', 1.10),
    },
    atPOC: {  // Price at Point of Control = mean reversion zone
      EMASMACrossover: env('VP_AT_POC_EMA', 0.85),
      MADynamicSR: env('VP_AT_POC_MASR', 0.85),
      RSI: env('VP_AT_POC_RSI', 1.25),
      LiquiditySweep: env('VP_AT_POC_SWEEP', 0.90),
      SmartMoneySweep: env('VP_AT_POC_SMS', 0.90),
    },
    inLVN: {  // Price in Low Volume Node = unpredictable air pocket
      _allStrategies: env('VP_IN_LVN_ALL', 0.90),
    },
    inValueArea: {  // Inside VA but not at POC = neutral/slight mean reversion
      EMASMACrossover: env('VP_IN_VA_EMA', 0.95),
      MADynamicSR: env('VP_IN_VA_MASR', 0.95),
      RSI: env('VP_IN_VA_RSI', 1.10),
      LiquiditySweep: env('VP_IN_VA_SWEEP', 1.00),
      SmartMoneySweep: env('VP_IN_VA_SMS', 1.00),
    },
  },

  // PID CONTROLLER — Adaptive Parameter Optimization
  // =========================================================================
  // FIX 2026-04-05: Meta-controller that self-tunes system parameters
  // Runs every N trades, adjusts position size, regime boosts, trailing stops
  // All Kp/Ki/Kd gains sweepable via matrix for optimal feedback response
  pid: {
    enabled: env('PID_ENABLED', true),
    updateInterval: env('PID_UPDATE_INTERVAL', 10),      // Run every N trades
    warmupTrades: env('PID_WARMUP_TRADES', 50),          // Min trades before active
    windowSize: env('PID_WINDOW_SIZE', 20),              // Rolling trade window

    // Loop 1: Position Sizing - equity slope -> size multiplier
    positionKp: env('PID_POSITION_KP', 0.30),            // Proportional gain
    positionKi: env('PID_POSITION_KI', 0.05),            // Integral gain
    positionKd: env('PID_POSITION_KD', 0.10),            // Derivative gain
    targetEquitySlope: env('PID_TARGET_SLOPE', 0.005),   // Target equity curve slope

    // Loop 2: Regime Boost Adaptation - per-strategy P&L -> boost adjustment
    regimeKp: env('PID_REGIME_KP', 0.02),
    regimeKi: env('PID_REGIME_KI', 0.005),
    regimeKd: env('PID_REGIME_KD', 0.01),

    // Loop 3: Trailing Stop Adaptation - MFE capture -> ATR multiplier
    trailKp: env('PID_TRAIL_KP', 0.15),
    trailKi: env('PID_TRAIL_KI', 0.03),
    trailKd: env('PID_TRAIL_KD', 0.05),
    targetMFERatio: env('PID_TARGET_MFE', 0.60),         // Target: capture 60% of max profit
  },

  // =========================================================================
  // STOP LOSS / TAKE PROFIT - Defaults (strategies override via EXIT_CONTRACTS)
  // =========================================================================
  // NOTE: All percentages in PERCENT form (1.5 = 1.5%, not 0.015)
  // This matches .env and ExitContractManager convention
  // LOCKED 2026-03-20: Validated across 7/8 tickers with zero retuning
  exits: {
    stopLossPercent: env('STOP_LOSS_PERCENT', 0.8),              // 0.8% default SL - VALIDATED
    takeProfitPercent: env('TAKE_PROFIT_PERCENT', 1.0),          // 1.0% default TP - VALIDATED
    trailingStopPercent: env('TRAILING_STOP_PERCENT', 0.6),      // 0.6% trailing - tight exits work
    trailingActivation: env('TRAILING_ACTIVATION', 0.8),         // 0.8% profit before trailing kicks in
    exitSystem: env('EXIT_SYSTEM', 'maxprofit'),

    // Breakeven system (percent form)
    breakevenTrigger: env('BREAKEVEN_TRIGGER', 0.5),             // 0.5% profit triggers BE
    breakevenExitPercent: env('BREAKEVEN_EXIT_PERCENT', 50),     // 50% position exits at BE
    postBreakevenTrail: env('POST_BREAKEVEN_TRAIL', 5.0),        // 5% trail after BE withdrawal
    profitProtectionLevel: env('PROFIT_PROTECTION', 1.5),        // 1.5% min profit to lock in

    // Tiered profit targets (for MaxProfitManager)
    // FIX 2026-03-16: All tiers must clear 0.65% round-trip fees
    profitTiers: {
      tier1: env('TIER1_TARGET', 0.015),                         // 1.5% first tier (was 0.7% - below fees!)
      tier2: env('TIER2_TARGET', 0.020),                         // 2.0% second tier
      tier3: env('TIER3_TARGET', 0.030),                         // 3.0% third tier
      final: env('FINAL_TARGET', 0.050),                         // 5.0% final target
    },

    // Trail distances
    normalTrailDistance: env('TRAIL_DISTANCE', 0.025),           // 2.5% normal trail
    tightTrailDistance: env('TIGHT_TRAIL_DISTANCE', 0.015),      // 1.5% tight trail

    // FIX 2026-03-19: Extracted from ExitContractManager hardcodes
    // Volatility-based stop widening
    volatilityThreshold: env('EXIT_VOL_THRESHOLD', 5.0),         // ATR > 5% triggers widening
    volatilitySlMultiplier: env('EXIT_VOL_SL_MULT', 1.15),       // Widen SL by 15% in high vol
    volatilityTpMultiplier: env('EXIT_VOL_TP_MULT', 1.20),       // Widen TP by 20% in high vol
  },

  // =========================================================================
  // STRATEGY-SPECIFIC EXIT CONTRACTS
  // =========================================================================
  // FIX 2026-03-16: Load validated production config from tuning-summary.json (March 3rd)
  // All strategies: SL -2.0%, TP 2.5%
  exitContracts: {
    // ╔═══════════════════════════════════════════════════════════════════════════╗
    // ║  EMASMACrossover - LOCKED CONFIG - DO NOT CHANGE WITHOUT RE-VALIDATION   ║
    // ║  Walk-forward validated 2026-03-20 on TSLA 15m                            ║
    // ║  Train (Year 1+2): +$738, Test (Year 2): +$275                            ║
    // ╚═══════════════════════════════════════════════════════════════════════════╝
    EMASMACrossover: {
      stopLossPercent: -0.5,          // LOCKED - validated SL
      takeProfitPercent: 1.0,         // LOCKED - validated TP
      trailingStopPercent: 0.8,
      trailingActivation: 1.0,
      maxHoldTimeMinutes: 300,
      useStructuralExits: false,
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: ['ema_cross_reversal'],
      _validated: '2026-03-20',
    },
    // ╔═══════════════════════════════════════════════════════════════════════════╗
    // ║  LiquiditySweep - LOCKED CONFIG - DO NOT CHANGE WITHOUT RE-VALIDATION    ║
    // ║  Walk-forward validated 2026-03-20 on TSLA 15m                            ║
    // ║  Train: +$221, Test: +$72 (uses structural exits, ignores SL/TP)         ║
    // ╚═══════════════════════════════════════════════════════════════════════════╝
    LiquiditySweep: {
      stopLossPercent: -2.0,          // Fallback only - sweep uses structural exits
      takeProfitPercent: 2.5,         // Fallback only - sweep uses structural exits
      trailingStopPercent: 0.5,
      trailingActivation: 0.7,
      maxHoldTimeMinutes: 180,
      useStructuralExits: true,       // LOCKED - uses sweep-specific exit logic
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: ['liquidity_absorbed'],
      _validated: '2026-03-20',
    },
    BreakRetest: {
      stopLossPercent: -2.0,          // Fallback only - strategy provides structural overrideLevels
      takeProfitPercent: 2.5,         // Fallback only - strategy provides structural overrideLevels
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 240,
      useStructuralExits: true,
      minConfidence: null,
      atrMinPercent: null,
      invalidationConditions: ['break_retest_invalidated'],
      _validated: null,
    },
    // ╔═══════════════════════════════════════════════════════════════════════════╗
    // ║  RSI - LOCKED CONFIG - DO NOT CHANGE WITHOUT RE-VALIDATION               ║
    // ║  Walk-forward validated 2026-03-20 on TSLA 15m                            ║
    // ║  Train (Year 1): +$334, 223 trades, 56.5% WR                              ║
    // ║  Test (Year 2):  +$282, 119 trades, 58.8% WR                              ║
    // ║  CHANGING THESE VALUES WILL BREAK THE VALIDATED EDGE                      ║
    // ╚═══════════════════════════════════════════════════════════════════════════╝
    RSI: {
      stopLossPercent: -0.8,    // LOCKED - validated SL
      takeProfitPercent: 1.0,   // LOCKED - validated TP (tight mean-reversion)
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 240,
      useStructuralExits: false,
      minConfidence: 0.60,      // LOCKED - 60% gate filters garbage signals
      atrMinPercent: null,      // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: [],
      _validated: '2026-03-20', // Fingerprint - triggers warning if changed
    },
    // ╔═══════════════════════════════════════════════════════════════════════════╗
    // ║  MADynamicSR - LOCKED CONFIG - DO NOT CHANGE WITHOUT RE-VALIDATION       ║
    // ║  Walk-forward validated 2026-03-20 on TSLA 15m                            ║
    // ║  Train (Year 1+2): +$724, Test (Year 2): +$429                            ║
    // ╚═══════════════════════════════════════════════════════════════════════════╝
    MADynamicSR: {
      stopLossPercent: -0.8,          // LOCKED - validated SL
      takeProfitPercent: 1.0,         // LOCKED - validated TP
      trailingStopPercent: 0.5,
      trailingActivation: 0.7,
      maxHoldTimeMinutes: 180,
      useStructuralExits: false,
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: ['sr_break'],
      _validated: '2026-03-20',
    },
    // CandlePattern - uses validated baseline exits
    CandlePattern: {
      stopLossPercent: -0.8,          // Use validated baseline
      takeProfitPercent: 1.0,         // Use validated baseline
      trailingStopPercent: 0.5,
      trailingActivation: 0.7,
      maxHoldTimeMinutes: 150,
      useStructuralExits: false,
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: ['pattern_invalidated'],
    },
    // MarketRegime - uses validated baseline exits
    MarketRegime: {
      stopLossPercent: -0.8,          // Use validated baseline
      takeProfitPercent: 1.0,         // Use validated baseline
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 360,
      useStructuralExits: false,
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: ['regime_change'],
    },
    MultiTimeframe: {
      stopLossPercent: -2.0,
      takeProfitPercent: 2.5,
      trailingStopPercent: 0.8,
      trailingActivation: 1.0,
      maxHoldTimeMinutes: 300,
      useStructuralExits: false,
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: [],
    },
    OGZTPO: {
      stopLossPercent: -2.0,
      takeProfitPercent: 2.5,
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 240,
      useStructuralExits: false,
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: [],
    },
    OpeningRangeBreakout: {
      stopLossPercent: -2.0,
      takeProfitPercent: 2.5,
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 180,
      useStructuralExits: true,
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: ['fvg_filled', 'or_break_reversal'],
    },
    SmartMoneySweep: {
      stopLossPercent: -0.3,          // maxLossPct from PineScript (hard cap, lose fast)
      takeProfitPercent: 1.5,         // High conviction ATR target
      trailingStopPercent: 0.5,       // Trail after 0.5 R:R (Fabio: risk-free in 1 minute)
      trailingActivation: 0.5,
      maxHoldTimeMinutes: 900,        // 60 candles x 15 min
      useStructuralExits: true,       // Strategy provides SL/TP via overrideLevels
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: ['sweep_absorbed'],
    },
    DonchianBreakout: {
      stopLossPercent: -2.5,
      takeProfitPercent: 12.0,
      trailingStopPercent: 1.5,
      trailingActivation: 1.0,
      maxHoldTimeMinutes: 10080,
      useStructuralExits: false,
      minConfidence: null,
      atrMinPercent: null,
      invalidationConditions: ['regime_change'],
      _validated: null,
    },
    PropSafeEMAPullback: {
      stopLossPercent: -1.1,
      takeProfitPercent: 3.3,
      trailingStopPercent: 1.1,
      trailingActivation: 1.65,
      maxHoldTimeMinutes: 240,
      useStructuralExits: false,
      minConfidence: 0.68,
      atrMinPercent: null,
      invalidationConditions: ['ema_pullback_invalidated'],
      _validated: null,
    },
    EMATrendRetest: {
      stopLossPercent: -1.0,
      takeProfitPercent: 3.0,
      trailingStopPercent: 1.0,
      trailingActivation: 1.5,
      maxHoldTimeMinutes: 240,
      useStructuralExits: false,
      minConfidence: 0.70,
      atrMinPercent: null,
      invalidationConditions: ['ema_retest_failed'],
      _validated: null,
    },
    RSI2MeanReversion: {
      stopLossPercent: -1.0,
      takeProfitPercent: 1.5,
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 240,
      useStructuralExits: false,
      minConfidence: 0.62,
      atrMinPercent: null,
      invalidationConditions: ['regime_change'],
      _validated: null,
    },
    TimeSeriesMomentum: {
      stopLossPercent: -2.0,
      takeProfitPercent: 4.0,
      trailingStopPercent: 1.0,
      trailingActivation: 1.5,
      maxHoldTimeMinutes: 240,
      useStructuralExits: false,
      minConfidence: 0.60,
      atrMinPercent: null,
      invalidationConditions: ['regime_change'],
      _validated: null,
    },
    // 2026-04-28 — NoWickImbalance (Wolf spec). Structural exits via
    // module's overrideLevels (1:1 RR computed from swing structure).
    // Fallbacks below are safety nets only — strategy's overrideLevels win.
    // Unvalidated — needs sweep + walk-forward before _validated set.
    NoWickImbalance: {
      stopLossPercent: -1.5,
      takeProfitPercent: 1.5,
      trailingStopPercent: null,      // No trailing — fixed 1:1 RR
      trailingActivation: null,
      maxHoldTimeMinutes: 240,        // 4 hours max — if 1:1 hasn't hit, thesis broken
      minConfidence: null,            // Sweep will find the right gate
      useStructuralExits: true,       // Strategy provides SL/TP via overrideLevels
      atrMinPercent: null,            // Use global ATR filter
      invalidationConditions: [],
      _validated: null,
    },
    default: {
      stopLossPercent: -2.0,
      takeProfitPercent: 2.5,
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 240,
      useStructuralExits: false,
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: [],
    },
  },

  // =========================================================================
  // EXIT LOGIC CONFIGURATION (read by MaxProfitManager - the sole exit authority)
  // All values overridable via env vars for matrix sweep tuning
  // =========================================================================
  exitLogic: {
    // ─── Break-Even Scale-Out (PATCH 1: the 50% sell at BE) ───
    beScaleOut: {
      enabled: envBool('BE_SCALEOUT_ENABLED', true),
      triggerType: env('BE_SCALEOUT_TRIGGER', 'one_to_one_r'),  // 'one_to_one_r' | 'fixed_percent'
      fixedPercentTrigger: parseFloat(env('BE_SCALEOUT_TRIGGER_PCT', 0.5)),  // if triggerType=fixed_percent, fire at 0.5%
      scaleOutFraction: parseFloat(env('BE_SCALEOUT_FRACTION', 0.5)),  // sell 50% by default
      feeBufferPercent: parseFloat(env('BE_SCALEOUT_FEE_BUFFER', 0.05)),  // -0.05% below entry for fees
    },

    breakEvenStop: {
      enabled: envBool('BREAKEVEN_STOP_ENABLED', false),
      triggerPercent: parseFloat(env('BREAKEVEN_STOP_TRIGGER_PCT', 0.2)),
    },

    // ─── Tiered Exit Scale-Out (MPM multi-tier profit taking) ───
    // Lifted from MaxProfitManager constructor hardcodes 2026-04-16
    // All values env-backed for matrix sweep tuning
    tieredExit: {
      enabled: envBool('TIERED_EXIT_ENABLED', true),
      // Relative tier weights. MaxProfitManager rebalances open tiers against
      // the current remaining runner after any earlier partial exit.
      tier1ExitFraction: parseFloat(env('TIER1_EXIT_FRACTION', 0.30)),
      tier2ExitFraction: parseFloat(env('TIER2_EXIT_FRACTION', 0.30)),
      tier3ExitFraction: parseFloat(env('TIER3_EXIT_FRACTION', 0.20)),
      // Tier 4 (final) fraction is computed: 1.0 - (tier1 + tier2 + tier3) = 0.20 default

      // Market regime target multipliers (applied when enableMarketAdaptation=true)
      enableMarketAdaptation: envBool('TIER_MARKET_ADAPTATION_ENABLED', true),
      trendingTargetMultiplier: parseFloat(env('TIER_TREND_MULT', 1.3)),
      rangingTargetMultiplier: parseFloat(env('TIER_RANGE_MULT', 0.8)),

      // Confidence-based target adjustment
      highConfidenceThreshold: parseFloat(env('TIER_HIGH_CONF_THRESHOLD', 0.8)),
      highConfidenceMultiplier: parseFloat(env('TIER_HIGH_CONF_MULT', 1.2)),
      lowConfidenceThreshold: parseFloat(env('TIER_LOW_CONF_THRESHOLD', 0.6)),
      lowConfidenceMultiplier: parseFloat(env('TIER_LOW_CONF_MULT', 0.8)),
    },

    maxProfitManager: {
      trackPerformance: envBool('MPM_TRACK_PERFORMANCE', true),
      logLevel: env('MPM_LOG_LEVEL', 'info'),
    },

    // ─── Dynamic Trailing Stop (lifted from DynamicTrailingStop.js into MPM) ───
    trail: {
      enabled: envBool('TRAIL_ENABLED', true),
      minActivationPercent: parseFloat(env('TRAIL_MIN_ACTIVATION', 0.5)),  // % profit before trail arms
      atrMultiplier: parseFloat(env('TRAIL_ATR_MULTIPLIER', 2.0)),
      trendWidenMultiplier: parseFloat(env('TRAIL_TREND_WIDEN', 1.5)),
      structureTightenMultiplier: parseFloat(env('TRAIL_STRUCTURE_TIGHTEN', 0.5)),
      structureDistanceThreshold: parseFloat(env('TRAIL_STRUCTURE_DIST', 1.0)),  // % from structure
      profitRatchetThreshold: parseFloat(env('TRAIL_RATCHET_THRESHOLD', 3.0)),  // tighten past 3% profit
      profitRatchetRate: parseFloat(env('TRAIL_RATCHET_RATE', 0.1)),  // 10% tighter per 1% above threshold
      profitRatchetFloor: parseFloat(env('TRAIL_RATCHET_FLOOR', 0.6)),  // never tighter than 60% of base
      minTrailPercent: parseFloat(env('TRAIL_MIN_PCT', 0.3)),
      maxTrailPercent: parseFloat(env('TRAIL_MAX_PCT', 3.0)),
      feeBufferPercent: parseFloat(env('TRAIL_FEE_BUFFER', 0.65)),  // round-trip fee threshold
      roundNumberProximity: parseFloat(env('TRAIL_ROUND_PROXIMITY', 0.5)),
      roundNumberTighten: parseFloat(env('TRAIL_ROUND_TIGHTEN', 0.7)),
    },

    volatilityAdjustment: {
      enabled: envBool('MPM_VOLATILITY_ADJUSTMENT_ENABLED', false),
      lowThresholdPercent: parseFloat(env('MPM_LOW_VOLATILITY_THRESHOLD', 0.5)),
      highThresholdPercent: parseFloat(env('MPM_HIGH_VOLATILITY_THRESHOLD', 2.0)),
      lookbackPeriods: parseFloat(env('MPM_VOLATILITY_LOOKBACK_PERIODS', 20)),
    },

    // ─── Profit Floor Ladder (lifted from PatternBasedExitModel) ───
    // As profit grows, raise the stop to lock in this fraction of peak profit
    profitFloor: {
      enabled: envBool('PROFIT_FLOOR_ENABLED', true),
      tiers: [
        { profit: parseFloat(env('PROFIT_FLOOR_T1_AT', 0.5)), protect: parseFloat(env('PROFIT_FLOOR_T1_LOCK', 0.30)) },
        { profit: parseFloat(env('PROFIT_FLOOR_T2_AT', 1.0)), protect: parseFloat(env('PROFIT_FLOOR_T2_LOCK', 0.50)) },
        { profit: parseFloat(env('PROFIT_FLOOR_T3_AT', 1.5)), protect: parseFloat(env('PROFIT_FLOOR_T3_LOCK', 0.70)) },
        { profit: parseFloat(env('PROFIT_FLOOR_T4_AT', 2.0)), protect: parseFloat(env('PROFIT_FLOOR_T4_LOCK', 0.85)) },
      ],
    },

    // ─── Chart Reversal Detection (lifted from PatternBasedExitModel) ───
    reversalDetection: {
      enabled: envBool('REVERSAL_DETECT_ENABLED', true),
      minProfitRequired: parseFloat(env('REVERSAL_MIN_PROFIT', 0.3)),  // only act on reversals if in profit
      patterns: [
        'double_top', 'double_bottom', 'head_shoulders', 'inv_head_shoulders',
        'evening_star', 'morning_star', 'bearish_engulfing', 'bullish_engulfing',
        'shooting_star', 'hammer', 'doji_star', 'dark_cloud', 'piercing_line',
      ],
      exitFraction: parseFloat(env('REVERSAL_EXIT_FRACTION', 1.0)),  // close 100% on reversal by default
    },

    // ─── Universal safety limits (read by ExitContractManager — circuit breakers only) ───
    // These are absolute kill-switches, not strategy-specific
    safety: {
      hardStopLossPercent: parseFloat(env('UNIVERSAL_HARD_STOP', -3.0)),  // never let any single trade lose more than 3%
      accountDrawdownPercent: parseFloat(env('ACCOUNT_DRAWDOWN_PCT', -5.0)),  // Apex 5% wall
      accountDrawdownBypass: envBool('ACCOUNT_DRAWDOWN_BYPASS', false),
      maxHoldTimeMinutes: parseInt(env('UNIVERSAL_MAX_HOLD_MIN', 480), 10),  // 8 hours absolute max
    },
  },

  // =========================================================================
  // ENTRY LOGIC CONFIGURATION (read by DynamicPositionSizer + StrategyOrchestrator)
  // =========================================================================
  entryLogic: {
    // ─── Dynamic position sizing curves ───
    sizing: {
      enabled: envBool('DYNAMIC_SIZING_ENABLED', true),
      basePositionPercent: parseFloat(env('BASE_POSITION_PCT', 0.01)),
      maxPositionPercent: parseFloat(env('MAX_POSITION_PCT', 0.05)),
      absoluteCapPercent: parseFloat(env('ABSOLUTE_POSITION_CAP', 0.15)),  // hard ceiling even with all multipliers
      stockShareRange: {
        enabled: envBool('ENTRY_STOCK_SHARE_RANGE_ENABLED', false),
        minShares: env('ENTRY_MIN_STOCK_SHARES', 0),
        maxShares: env('ENTRY_MAX_STOCK_SHARES', 0),
        maxNotionalUsd: env('ENTRY_MAX_STOCK_NOTIONAL', 0),
        consistencyCapBuffer: env('ENTRY_CONSISTENCY_CAP_BUFFER', 0.98),
        dailyLossRiskFraction: env('ENTRY_DAILY_LOSS_RISK_FRACTION', 1.0),
      },
      confidenceCurve: [
        { confidence: 0.00, multiplier: 0.25 },
        { confidence: 0.50, multiplier: 0.50 },
        { confidence: 0.60, multiplier: 1.00 },
        { confidence: 0.75, multiplier: 1.50 },
        { confidence: 0.90, multiplier: 2.50 },
        { confidence: 1.00, multiplier: 2.50 },
      ],
      volatilityCurve: [
        { atrPercent: 0.00, multiplier: 1.50 },
        { atrPercent: 0.15, multiplier: 1.20 },
        { atrPercent: 0.30, multiplier: 1.00 },
        { atrPercent: 0.60, multiplier: 0.80 },
        { atrPercent: 1.00, multiplier: 0.60 },
        { atrPercent: 2.00, multiplier: 0.40 },
      ],
      patternMultipliers: {
        promoted:    parseFloat(env('PATTERN_MULT_PROMOTED', 1.50)),
        neutral:     parseFloat(env('PATTERN_MULT_NEUTRAL', 1.00)),
        learning:    parseFloat(env('PATTERN_MULT_LEARNING', 1.00)),
        quarantined: parseFloat(env('PATTERN_MULT_QUARANTINED', 0.25)),
        unknown:     parseFloat(env('PATTERN_MULT_UNKNOWN', 1.00)),
      },
      confluenceMultipliers: [1.0, 1.0, 1.25, 1.5, 1.75, 2.0],  // by confluence count
    },
  },

  // =========================================================================
  // STRATEGY-SPECIFIC PARAMETERS (per STRATEGY-REWRITE-SPEC.md)
  // =========================================================================
  strategies: {
    MADynamicSR: {
      // Trader DNA CORRECTED - 20 MA for trend/entry, 200 MA for S/R level
      entryMaPeriod: env('MASR_ENTRY_MA', 20),         // 20 MA — trend + entry line
      srMaPeriod: env('MASR_SR_MA', 200),              // 200 MA — support/resistance level (NOT trend)
      touchZonePct: env('MASR_TOUCH_ZONE', 0.6),       // % distance to count as "touching"
      srTestCount: env('MASR_SR_TESTS', 2),            // Min S/R zone touches
      swingLookback: env('MASR_SWING_LOOKBACK', 3),    // Bars to confirm a swing
      srZonePct: env('MASR_SR_ZONE_PCT', 1.0),         // Zone width as % of price
      slopeLookback: env('MASR_SLOPE_LOOKBACK', 5),    // Bars to compare 20 MA slope
      minSlopePct: env('MASR_MIN_SLOPE', 0.03),        // Min slope % to count as trending
      extensionPct: env('MASR_EXTENSION_PCT', 2.0),    // Max distance from 20 MA (%)
      skipFirstTouch: true,                            // Skip first touch after extension
      atrPeriod: env('MASR_ATR_PERIOD', 14),           // ATR for SL buffer
      patternPersistBars: env('MASR_PATTERN_PERSIST', 15),
      enabled: true,
    },
    EMACrossover: {
      // EMA/SMA crossover with snapback detection
      decayBars: env('EMA_DECAY_BARS', 10),            // Signal decay (bars until fade)
      snapbackThreshold: env('EMA_SNAPBACK_PCT', 2.5), // % spread for snapback signal
      blowoffThreshold: env('EMA_BLOWOFF_ACCEL', 0.15),// Acceleration threshold
      enabled: true,
    },
    LiquiditySweep: {
      // Marco-style liquidity grabs (24/7 crypto)
      sweepLookbackBars: env('LIQSWEEP_LOOKBACK', 50),         // Was lookbackCandles — renamed to match constructor
      sweepMinExtensionPct: env('LIQSWEEP_WICK_MIN', 0.1),     // Was sweepWickMinPct — renamed to match constructor
      atrMultiplier: env('LIQSWEEP_ATR_MULT', 0.25),           // NEW — was only hardcoded default
      atrPeriod: env('LIQSWEEP_ATR_PERIOD', 14),               // NEW
      entryWindowMinutes: env('LIQSWEEP_ENTRY_WINDOW_MIN', 90),  // 90 min entry window
      hammerBodyMaxPct: env('LIQSWEEP_HAMMER_BODY', 0.35),     // NEW
      hammerWickMinRatio: env('LIQSWEEP_HAMMER_WICK', 2.0),    // NEW
      engulfMinRatio: env('LIQSWEEP_ENGULF_RATIO', 1.0),       // NEW
      stopBufferPct: env('LIQSWEEP_STOP_BUFFER', 0.05),        // NEW
      disableSessionCheck: true,                                 // 24/7 crypto — no session filter
      enabled: true,
    },
    RSI: {
      // RSI mean reversion on extremes
      period: 14,                                       // Standard RSI period
      oversoldLevel: env('RSI_OVERSOLD', 30),          // Oversold threshold (widened from 25)
      overboughtLevel: env('RSI_OVERBOUGHT', 70),      // Overbought threshold (widened from 75)
      enabled: true,
    },
    VolumeProfile: {
      // Fabio Valentino - Auction Market Theory
      sessionLookback: env('VP_SESSION_LOOKBACK', 96), // 24h of 15m candles
      numBins: env('VP_NUM_BINS', 50),                 // Price bins for profile
      valueAreaPct: env('VP_VALUE_AREA_PCT', 0.70),    // 70% value area
      outOfBalancePct: env('VP_OUT_OF_BALANCE_PCT', 0.5), // Was 0.1%, needs 0.5%
      recalcInterval: env('VP_RECALC_INTERVAL', 5),    // Candles between recalc
      enabled: true,
    },
    SmartMoneySweep: {
      // Fabio + Marco composite - institutional sweep detection
      vpDays: env('SMS_VP_DAYS', 5),
      vpBins: env('SMS_VP_BINS', 50),
      valueAreaPct: env('SMS_VA_PCT', 70),
      bodyWeightPct: env('SMS_BODY_WEIGHT', 70),
      lvnPctile: env('SMS_LVN_PCTILE', 20),
      ivbMinutes: env('SMS_IVB_MINUTES', 30),
      volAvgLen: env('SMS_VOL_AVG_LEN', 20),
      absorbBodyPct: env('SMS_ABSORB_BODY', 35),
      absorbWickPct: env('SMS_ABSORB_WICK', 60),
      absorbVolMult: env('SMS_ABSORB_VOL_MULT', 1.2),
      initBodyPct: env('SMS_INIT_BODY', 60),
      absorbBodyProgPct: env('SMS_ABSORB_BODY_PROG', 50),
      absorbWickProgPct: env('SMS_ABSORB_WICK_PROG', 40),
      absorbVolProgMult: env('SMS_ABSORB_VOL_PROG_MULT', 0.9),
      initBodyProgPct: env('SMS_INIT_BODY_PROG', 45),
      cvdDivLen: env('SMS_CVD_DIV_LEN', 10),
      atrLen: env('SMS_ATR_LEN', 14),
      lowConvATRMult: env('SMS_LOW_CONV_ATR', 0.5),
      midConvATRMult: env('SMS_MID_CONV_ATR', 1.0),
      highConvATRMult: env('SMS_HIGH_CONV_ATR', 1.5),
      slBufferPct: env('SMS_SL_BUFFER', 0.15),
      maxLossPct: env('SMS_MAX_LOSS', 0.3),
      maxHoldBars: env('SMS_MAX_HOLD', 60),
      maxDailyLosses: env('SMS_MAX_DAILY_LOSSES', 3),
      vpRthOnly: envBool('SMS_VP_RTH_ONLY', true),
      vpLookbackBars: env('SMS_VP_LOOKBACK_BARS', 0),
      sweepMaxOffset: env('SMS_SWEEP_MAX_OFFSET', 3),
      enabled: true,
    },
    DonchianBreakout: {
      entryPeriod: env('DONCHIAN_ENTRY_PERIOD', 20),
      atrPeriod: env('DONCHIAN_ATR_PERIOD', 20),
      atrStopMult: env('DONCHIAN_ATR_STOP_MULT', 2.5),
      allowShorts: envBool('DONCHIAN_ALLOW_SHORTS', false),
      takeProfitPercent: env('DONCHIAN_TAKE_PROFIT_PERCENT', 12.0),
      trailingStopPercent: env('DONCHIAN_TRAILING_STOP_PERCENT', 1.5),
      trailingActivation: env('DONCHIAN_TRAILING_ACTIVATION', 1.0),
      maxHoldTimeMinutes: env('DONCHIAN_MAX_HOLD_MINUTES', 10080),
      invalidationConditions: ['regime_change'],
      enabled: true,
    },
    PropSafeEMAPullback: {
      fastEmaPeriod: env('PROPSAFE_EMA_FAST_PERIOD', 9),
      pullbackEmaPeriod: env('PROPSAFE_EMA_PULLBACK_PERIOD', 21),
      trendEmaPeriod: env('PROPSAFE_EMA_TREND_PERIOD', 50),
      atrPeriod: env('PROPSAFE_EMA_ATR_PERIOD', 14),
      crossLookbackBars: env('PROPSAFE_EMA_CROSS_LOOKBACK', 3),
      pullbackLookbackBars: env('PROPSAFE_EMA_PULLBACK_LOOKBACK', 4),
      pullbackMinAtr: env('PROPSAFE_EMA_PULLBACK_MIN_ATR', 0.4),
      pullbackMaxAtr: env('PROPSAFE_EMA_PULLBACK_MAX_ATR', 1.0),
      atrStopMult: env('PROPSAFE_EMA_ATR_STOP_MULT', 1.1),
      targetRR: env('PROPSAFE_EMA_TARGET_RR', 3.0),
      trailActivationR: env('PROPSAFE_EMA_TRAIL_ACTIVATION_R', 1.5),
      trailDistanceR: env('PROPSAFE_EMA_TRAIL_DISTANCE_R', 1.0),
      maxHoldTimeMinutes: env('PROPSAFE_EMA_MAX_HOLD_MINUTES', 240),
      confidenceBase: env('PROPSAFE_EMA_CONFIDENCE_BASE', 0.62),
      confidenceTrendBonus: env('PROPSAFE_EMA_CONFIDENCE_TREND_BONUS', 0.06),
      confidencePullbackBonus: env('PROPSAFE_EMA_CONFIDENCE_PULLBACK_BONUS', 0.08),
      confidenceConfirmationBonus: env('PROPSAFE_EMA_CONFIDENCE_CONFIRMATION_BONUS', 0.08),
      confidenceFreshCrossBonus: env('PROPSAFE_EMA_CONFIDENCE_FRESH_CROSS_BONUS', 0.06),
      maxConfidence: env('PROPSAFE_EMA_MAX_CONFIDENCE', 0.90),
      requireRth: envBool('PROPSAFE_EMA_REQUIRE_RTH', true),
      rthStartET: env('PROPSAFE_EMA_RTH_START_ET', '09:30'),
      rthEndET: env('PROPSAFE_EMA_RTH_END_ET', '16:00'),
      sessionTimeZone: env('PROPSAFE_EMA_SESSION_TIMEZONE', 'America/New_York'),
      allowShorts: envBool('PROPSAFE_EMA_ALLOW_SHORTS', false),
      enabled: true,
    },
    EMATrendRetest: {
      emaPeriods: env('EMA_TREND_RETEST_PERIODS', '9,20,21,50,100,200'),
      atrPeriod: env('EMA_TREND_RETEST_ATR_PERIOD', 14),
      slopeLookbackBars: env('EMA_TREND_RETEST_SLOPE_LOOKBACK', 5),
      minSlopePct: env('EMA_TREND_RETEST_MIN_SLOPE_PCT', 0.03),
      retestLookbackBars: env('EMA_TREND_RETEST_LOOKBACK', 4),
      touchZoneAtr: env('EMA_TREND_RETEST_TOUCH_ZONE_ATR', 0.35),
      closeAwayAtr: env('EMA_TREND_RETEST_CLOSE_AWAY_ATR', 0.12),
      maxExtensionAtr: env('EMA_TREND_RETEST_MAX_EXTENSION_ATR', 2.5),
      confidenceBase: env('EMA_TREND_RETEST_CONFIDENCE_BASE', 0.58),
      confidenceSlopeBonus: env('EMA_TREND_RETEST_CONFIDENCE_SLOPE_BONUS', 0.08),
      confidenceRetestBonus: env('EMA_TREND_RETEST_CONFIDENCE_RETEST_BONUS', 0.12),
      confidenceConfirmationBonus: env('EMA_TREND_RETEST_CONFIDENCE_CONFIRMATION_BONUS', 0.08),
      maxConfidence: env('EMA_TREND_RETEST_MAX_CONFIDENCE', 0.88),
      atrStopMult: env('EMA_TREND_RETEST_ATR_STOP_MULT', 1.0),
      targetRR: env('EMA_TREND_RETEST_TARGET_RR', 3.0),
      trailActivationR: env('EMA_TREND_RETEST_TRAIL_ACTIVATION_R', 1.5),
      trailDistanceR: env('EMA_TREND_RETEST_TRAIL_DISTANCE_R', 1.0),
      maxHoldTimeMinutes: env('EMA_TREND_RETEST_MAX_HOLD_MINUTES', 240),
      requireRth: envBool('EMA_TREND_RETEST_REQUIRE_RTH', true),
      rthStartET: env('EMA_TREND_RETEST_RTH_START_ET', '09:30'),
      rthEndET: env('EMA_TREND_RETEST_RTH_END_ET', '16:00'),
      sessionTimeZone: env('EMA_TREND_RETEST_SESSION_TIMEZONE', 'America/New_York'),
      allowShorts: envBool('EMA_TREND_RETEST_ALLOW_SHORTS', false),
      enabled: true,
    },
    RSI2MeanReversion: {
      rsiPeriod: env('RSI2_MR_RSI_PERIOD', 2),
      rsiEntry: env('RSI2_MR_ENTRY', 5),
      rsiEntryOB: env('RSI2_MR_ENTRY_OB', 95),
      trendPeriod: env('RSI2_MR_TREND_PERIOD', 200),
      allowShorts: envBool('RSI2_MR_ALLOW_SHORTS', false),
      stopLossPercent: env('RSI2_MR_STOP_LOSS_PERCENT', -1.0),
      takeProfitPercent: env('RSI2_MR_TAKE_PROFIT_PERCENT', 1.5),
      trailingStopPercent: env('RSI2_MR_TRAILING_STOP_PERCENT', 0.6),
      trailingActivation: env('RSI2_MR_TRAILING_ACTIVATION', 0.8),
      maxHoldTimeMinutes: env('RSI2_MR_MAX_HOLD_MINUTES', 240),
      confidenceBase: env('RSI2_MR_CONFIDENCE_BASE', 0.50),
      confidenceDepthMultiplier: env('RSI2_MR_CONFIDENCE_DEPTH_MULT', 0.40),
      maxConfidence: env('RSI2_MR_MAX_CONFIDENCE', 0.90),
      invalidationConditions: ['regime_change'],
      enabled: true,
    },
    TimeSeriesMomentum: {
      lookback: env('TSMOM_LOOKBACK', 100),
      trendPeriod: env('TSMOM_TREND_PERIOD', 200),
      minReturn: env('TSMOM_MIN_RETURN', 0),
      allowShorts: envBool('TSMOM_ALLOW_SHORTS', false),
      stopLossPercent: env('TSMOM_STOP_LOSS_PERCENT', -2.0),
      takeProfitPercent: env('TSMOM_TAKE_PROFIT_PERCENT', 4.0),
      trailingStopPercent: env('TSMOM_TRAILING_STOP_PERCENT', 1.0),
      trailingActivation: env('TSMOM_TRAILING_ACTIVATION', 1.5),
      maxHoldTimeMinutes: env('TSMOM_MAX_HOLD_MINUTES', 240),
      confidenceBase: env('TSMOM_CONFIDENCE_BASE', 0.50),
      confidenceReturnMultiplier: env('TSMOM_CONFIDENCE_RETURN_MULT', 4.0),
      maxConfidence: env('TSMOM_MAX_CONFIDENCE', 0.85),
      invalidationConditions: ['regime_change'],
      enabled: true,
    },
    OpeningRangeBreakout: {
      // ICT-style Opening Range + FVG entry (Trey's approach)
      sessionOpenHourUTC: env('ORB_SESSION_OPEN_HOUR', 14),  // legacy crypto path: 9am EST = 14:00 UTC
      // 2026-05-04: NYSE-aware session detection. When sessionOpenET is set, ORB uses
      // Intl.DateTimeFormat('America/New_York') for DST-aware open detection. Takes
      // precedence over sessionOpenHourUTC. Default 09:30 ET = NYSE regular open.
      sessionOpenET: env('ORB_SESSION_OPEN_ET', '09:30'),
      sessionTimeZone: env('ORB_SESSION_TIMEZONE', 'America/New_York'),
      orDurationMinutes: env('ORB_DURATION_MIN', 15),        // First 15 min defines OR
      fvgScanBars: env('ORB_FVG_SCAN_BARS', 10),             // Bars to scan for FVG after breakout
      minFVGPercent: env('ORB_MIN_FVG_PCT', 0.05),           // Minimum FVG size %
      maxFVGPercent: env('ORB_MAX_FVG_PCT', 2.0),            // Maximum FVG size %
      entryLevel: env('ORB_ENTRY_LEVEL', 'top'),             // 'top', 'middle', 'bottom' of FVG
      stopBufferPct: env('ORB_STOP_BUFFER_PCT', 0.05),       // Stop buffer beyond first candle
      targetRR: env('ORB_TARGET_RR', 2.0),                   // Risk:Reward ratio
      enabled: true,
    },
  },

  // =========================================================================
  // STRATEGY ORCHESTRATOR SETTINGS
  // FIX 2026-03-19: Extracted hardcoded values from StrategyOrchestrator
  // =========================================================================
  orchestrator: {
    // Minimum candle history required for each strategy
    minCandlesEMA: env('MIN_CANDLES_EMA', 20),              // EMACrossover needs 20 candles
    minCandlesMASR: env('MIN_CANDLES_MASR', 50),            // MADynamicSR needs 50 candles (200 MA)
    minCandlesSweep: env('MIN_CANDLES_SWEEP', 20),          // LiquiditySweep needs 20 candles
    minCandlesMTF: env('MIN_CANDLES_MTF', 30),              // MultiTimeframe needs 30 candles
    minCandlesTPO: env('MIN_CANDLES_TPO', 30),              // OGZTPO needs 30 candles

    // Fibonacci level boost thresholds
    fibDistanceEMA: env('FIB_DISTANCE_EMA', 0.5),           // 0.5% distance for EMA fib boost
    fibDistanceMASR: env('FIB_DISTANCE_MASR', 0.5),         // 0.5% distance for MASR fib boost
    fibDistanceSweep: env('FIB_DISTANCE_SWEEP', 0.8),       // 0.8% distance for Sweep fib boost
    fibBoostNormal: env('FIB_BOOST_NORMAL', 0.10),          // 10% confidence boost at fib level
    fibBoostGolden: env('FIB_BOOST_GOLDEN', 0.15),          // 15% confidence boost at golden zone

    // TPO strength scaling
    tpoStrengthMultiplier: env('TPO_STRENGTH_MULT', 10),    // Scale 0.03-0.1 -> 0.3-1.0

    // MTF timeframes (comma-separated in .env)
    mtfTimeframes: process.env.MTF_TIMEFRAMES?.split(',') || ['1m', '5m', '15m', '1h', '4h'],
    mtfConfluenceBooster: {
      enabled: envBool('ENABLE_MTF_CONFLUENCE_BOOSTER', false),
      minScore: env('MTF_BOOSTER_MIN_SCORE', 0.30),
      minConfidence: env('MTF_BOOSTER_MIN_CONFIDENCE', 0.50),
      strengthMultiplier: env('MTF_BOOSTER_STRENGTH_MULT', 0.20),
      maxMultiplier: env('MTF_BOOSTER_MAX_MULT', 1.15),
      conflictMultiplier: env('MTF_BOOSTER_CONFLICT_MULT', 0.85),
      penalizeConflicts: envBool('MTF_BOOSTER_PENALIZE_CONFLICTS', true),
      boostMtfCandidate: envBool('MTF_BOOSTER_BOOST_MTF_CANDIDATE', false),
    },
  },

  // =========================================================================
  // UNIVERSAL CIRCUIT BREAKERS (override strategy contracts)
  // =========================================================================
  universalLimits: {
    hardStopLossPercent: -5.0,                                    // -5% absolute max loss (was -2%, too tight for BTC)
    accountDrawdownPercent: -10.0,                                // -10% force close all
    maxHoldTimeMinutes: 360,                                      // 6 hours max hold (matches MarketRegime)
    accountDrawdownBypass: envBool('ACCOUNT_DRAWDOWN_BYPASS', false), // Skip drawdown check (for parallel backtester)
  },

  // =========================================================================
  // MAX HOLD TIMES
  // =========================================================================
  holdTimes: {
    defaultMaxHold: 180,                                          // 3 hours default
    enableTimeBasedAdjustments: envBool('MPM_TIME_BASED_ADJUSTMENTS_ENABLED', false),
    minHoldTimeMinutes: parseFloat(env('MIN_HOLD_TIME_MINUTES', 0.0)), // 0 = no minimum (scalping)

    // Time-based trail tightening (for MaxProfitManager)
    tighteningSchedule: [
      { minutes: 30, trailFactor: 1.0 },
      { minutes: 60, trailFactor: 0.8 },
      { minutes: 120, trailFactor: 0.6 },
      { minutes: 180, trailFactor: 0.4 },
    ],
  },

  // =========================================================================
  // FEE CONFIGURATION
  // =========================================================================
  fees: {
    model: env('FEE_MODEL', 'percent'),
    makerFee: env('FEE_MAKER', 0.0025),                          // 0.25% maker (Kraken actual)
    takerFee: env('FEE_TAKER', 0.0040),                          // 0.40% taker (Kraken actual)
    slippage: env('FEE_SLIPPAGE', 0.0005),                       // 0.05% slippage
    totalRoundTrip: env('FEE_TOTAL_ROUNDTRIP', 0.0065),          // 0.65% total (maker 0.25% + taker 0.40%)
    safetyBuffer: env('FEE_SAFETY_BUFFER', 0.001),               // 0.10% buffer
    perShare: env('FEE_PER_SHARE', 0),
    minOrderFee: env('FEE_MIN_ORDER', 0),

    // Computed: minimum profit to be a "winner" after fees
    get minProfitAfterFees() {
      return this.totalRoundTrip + this.safetyBuffer;            // ~0.52%
    },
  },

  // =========================================================================
  // FILTERS (for StrategyOrchestrator)
  // =========================================================================
  filters: {
    atrEnabled: envBool('ATR_FILTER_ENABLED', false),             // Skip trades in dead markets
    atrMinPercent: env('ATR_MIN_PERCENT', 0.15),                  // Minimum ATR % to allow trades
  },

  // =========================================================================
  // SESSIONS (SessionRouter — dual-broker crypto/stocks switching)
  // =========================================================================
  // Gated by SESSION_ROUTER_ENABLED env (default false). Dash-form symbols
  // only — slash form is a path-traversal hazard at filename interpolation.
  sessions: {
    routerEnabled: envBool('SESSION_ROUTER_ENABLED', false),
    cryptoSymbols: ['BTC-USD','ETH-USD','SOL-USD'],
    checkIntervalMs: 60000,
    forceCloseOnSessionEnd: true,
  },

  // =========================================================================
  // EVAL RULE NUMBERS (ConfigLoader owns rule execution; TradingConfig exposes
  // the same env-owned values for entry sizing math that must not silently miss
  // live TTP caps.)
  // =========================================================================
  evalRules: {
    ttp: {
      accountLimits: {
        dailyLossDollars: env('TTP_DAILY_LOSS_LIMIT_DOLLARS', null),
        maxLossThresholdEquity: env('TTP_MAX_LOSS_THRESHOLD_EQUITY', null),
      },
      consistency: {
        profitTargetDollars: env('TTP_PROFIT_TARGET_DOLLARS', null),
        maxPositionProfitRatio: env('TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO', null),
        maxProfitTargetInitialBalanceRatio: env('TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO', null),
      },
    },
  },

  // =========================================================================
  // TIMEFRAME-SPECIFIC ADJUSTMENTS
  // =========================================================================
  timeframeConfig: {
    '1m':  { trailPct: 0.003, maxHoldMin: 15,   slPct: 0.005, tpPct: 0.008 },
    '5m':  { trailPct: 0.006, maxHoldMin: 60,   slPct: 0.010, tpPct: 0.018 },
    '15m': { trailPct: 0.010, maxHoldMin: 120,  slPct: 0.015, tpPct: 0.025 },
    '30m': { trailPct: 0.015, maxHoldMin: 240,  slPct: 0.020, tpPct: 0.035 },
    '1h':  { trailPct: 0.020, maxHoldMin: 480,  slPct: 0.025, tpPct: 0.045 },
    '4h':  { trailPct: 0.030, maxHoldMin: 1440, slPct: 0.035, tpPct: 0.070 },
    '1d':  { trailPct: 0.040, maxHoldMin: 4320, slPct: 0.050, tpPct: 0.100 },
  },

  // =========================================================================
  // MARKET REGIME MULTIPLIERS
  // =========================================================================
  regimeMultipliers: {
    strong_uptrend:   { slMultiplier: 1.5, tpMultiplier: 2.0 },
    mild_uptrend:     { slMultiplier: 1.2, tpMultiplier: 1.5 },
    trading_range:    { slMultiplier: 0.8, tpMultiplier: 1.0 },
    accumulation:     { slMultiplier: 2.0, tpMultiplier: 1.5 },
    volatile_spike:   { slMultiplier: 0.5, tpMultiplier: 0.8 },
    breakout:         { slMultiplier: 1.0, tpMultiplier: 3.0 },
    consolidation:    { slMultiplier: 1.0, tpMultiplier: 2.0 },
  },

  // =========================================================================
  // TRADING PROFILES (for profile-based trading)
  // =========================================================================
  profiles: buildRuntimeProfilesConfig(),

  // =========================================================================
  // SCALPER-SPECIFIC CONFIG
  // =========================================================================
  scalper: {
    microProfitTarget: env('SCALPER_MICRO_PROFIT', 0.005),       // 0.5%
    quickProfitTarget: env('SCALPER_QUICK_PROFIT', 0.008),       // 0.8%
    momentumShiftExit: env('SCALPER_MOMENTUM_SHIFT', 0.15),      // 15% momentum loss = exit
    stopMultiplier: env('SCALPER_STOP_MULTIPLIER', 0.5),         // 50% tighter stops
    maxHoldTime: env('SCALPER_MAX_HOLD_TIME', 300000),           // 5 minutes in ms
  },

  // =========================================================================
  // DASHBOARD RUNTIME CONTRACT
  // =========================================================================
  dashboard: {
    stateUpdateHeartbeatMs: env('DASHBOARD_STATE_UPDATE_HEARTBEAT_MS', 30000),
  },

  // =========================================================================
  // BACKTEST WORKER ENV CONTRACT
  // =========================================================================
  backtestWorkerEnv: {
    canonical: freezeStringMap({
      EXECUTION_MODE: 'backtest',
      CANDLE_SOURCE: 'file',
      BACKTEST_MODE: 'true',
      BACKTEST_SILENT: 'true',
      BACKTEST_VERBOSE: 'false',
      BACKTEST_FAST: 'true',
      INITIAL_BALANCE: '10000',
      PAPER_TRADING: 'true',
      LIVE_TRADING: 'false',
      ENABLE_LIVE_TRADING: 'false',
      CONFIRM_LIVE_TRADING: 'false',
      TEST_MODE: 'false',
      BACKTEST_NO_PATTERN_SAVE: 'true',
      SKIP_CSV_EXPORT: 'true',
      ENABLE_DASHBOARD: 'false',
      WEBHOOK_ORDERS_ENABLED: 'false',
      WEBHOOK_DRY_RUN: 'true',
      EVAL_RULES_ENABLED: 'false',
      TTP_RULES_ENABLED: 'false',
      SENTRY_DSN: '',
      NODE_ENV: 'test',
      DIRECTION_FILTER: 'both',
      ACCOUNT_DRAWDOWN_BYPASS: 'true',
      RISK_MANAGER_BYPASS: 'true',
      MAX_DRAWDOWN: '5',
      MAX_DAILY_LOSS: '1',
      MAX_WEEKLY_LOSS: '5',
      MAX_MONTHLY_LOSS: '5',
      EXIT_SYSTEM: 'legacy',
      FEE_MAKER: '0.0025',
      FEE_TAKER: '0.0040',
      FEE_TOTAL_ROUNDTRIP: '0.0065',
      FEE_SAFETY_BUFFER: '0.001',
      FEE_SLIPPAGE: '0.0005',
    }),
    stockZeroFee: freezeStringMap({
      FEE_MAKER: '0',
      FEE_TAKER: '0',
      FEE_TOTAL_ROUNDTRIP: '0',
      FEE_SAFETY_BUFFER: '0',
    }),
  },

  // =========================================================================
  // PARALLEL BACKTEST RUNNER CONFIG
  // =========================================================================
  parallelBacktest: deepFreezePlain({
    defaultData: 'tuning/tsla-15m-2y.json',
    dataShortcuts: {
      tsla: 'tuning/tsla-15m-2y.json',
      'tsla-train': 'tuning/tsla-15m-train.json',
      'tsla-test': 'tuning/tsla-15m-test.json',
      'tsla-unseen': 'tuning/tsla-15m-unseen.json',
      spy: 'tuning/spy-15m-2y.json',
      qqq: 'tuning/qqq-15m-2y.json',
      btc: 'data/polygon-btc-1y.json',
      'btc-5sec': 'data/polygon-btc-5sec.json',
    },
    stockDataShortcutKeys: [
      'tsla',
      'tsla-train',
      'tsla-test',
      'tsla-unseen',
      'spy',
      'qqq',
    ],
    strategies: [
      'RSI',
      'EMASMACrossover',
      'MADynamicSR',
      'LiquiditySweep',
      'SmartMoneySweep',
      'MultiTimeframe',
      'OGZTPO',
      'OpeningRangeBreakout',
      'CandlePattern',
      'NoWickImbalance',
      'BreakRetest',
      'DonchianBreakout',
      'PropSafeEMAPullback',
      'EMATrendRetest',
      'RSI2MeanReversion',
      'TimeSeriesMomentum',
    ],
    sweepPresets: {
      real: [
        { name: 'baseline', env: {} },
        { name: 'atr-off', env: { ATR_FILTER_ENABLED: 'false' } },
        { name: 'atr-015', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.15' } },
        { name: 'atr-025', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.25' } },
        { name: 'size-3pct', env: { MAX_POSITION_SIZE_PCT: '0.03' } },
        { name: 'size-5pct', env: { MAX_POSITION_SIZE_PCT: '0.05' } },
        { name: 'size-7pct', env: { MAX_POSITION_SIZE_PCT: '0.07' } },
        { name: 'tiers-tight', env: { TIER1_TARGET: '0.010', TIER2_TARGET: '0.015', TIER3_TARGET: '0.020' } },
        { name: 'tiers-wide', env: { TIER1_TARGET: '0.015', TIER2_TARGET: '0.025', TIER3_TARGET: '0.040' } },
        { name: 'risk-on', env: { RISK_MANAGER_BYPASS: 'false', ACCOUNT_DRAWDOWN_BYPASS: 'false' } },
        { name: 'risk-bypass', env: { RISK_MANAGER_BYPASS: 'true', ACCOUNT_DRAWDOWN_BYPASS: 'true' } },
      ],
      atr: [
        { name: 'atr-off', env: { ATR_FILTER_ENABLED: 'false' } },
        { name: 'atr-010', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.10' } },
        { name: 'atr-015', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.15' } },
        { name: 'atr-020', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.20' } },
        { name: 'atr-025', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.25' } },
        { name: 'atr-030', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.30' } },
        { name: 'atr-035', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.35' } },
        { name: 'atr-040', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.40' } },
      ],
      sizing: [
        { name: 'size-2pct', env: { MAX_POSITION_SIZE_PCT: '0.02' } },
        { name: 'size-3pct', env: { MAX_POSITION_SIZE_PCT: '0.03' } },
        { name: 'size-4pct', env: { MAX_POSITION_SIZE_PCT: '0.04' } },
        { name: 'size-5pct', env: { MAX_POSITION_SIZE_PCT: '0.05' } },
        { name: 'size-7pct', env: { MAX_POSITION_SIZE_PCT: '0.07' } },
        { name: 'size-10pct', env: { MAX_POSITION_SIZE_PCT: '0.10' } },
      ],
      tiers: [
        { name: 'tiers-tight', env: { TIER1_TARGET: '0.005', TIER2_TARGET: '0.008', TIER3_TARGET: '0.012' } },
        { name: 'tiers-configD', env: { TIER1_TARGET: '0.007', TIER2_TARGET: '0.010', TIER3_TARGET: '0.015' } },
        { name: 'tiers-above-fees', env: { TIER1_TARGET: '0.010', TIER2_TARGET: '0.015', TIER3_TARGET: '0.020' } },
        { name: 'tiers-wide', env: { TIER1_TARGET: '0.015', TIER2_TARGET: '0.020', TIER3_TARGET: '0.030' } },
        { name: 'tiers-no-early', env: { TIER1_TARGET: '0.020', TIER2_TARGET: '0.030', TIER3_TARGET: '0.050' } },
      ],
      risk: [
        { name: 'all-bypass', env: { RISK_MANAGER_BYPASS: 'true', ACCOUNT_DRAWDOWN_BYPASS: 'true' } },
        { name: 'risk-on-dd-bypass', env: { RISK_MANAGER_BYPASS: 'false', ACCOUNT_DRAWDOWN_BYPASS: 'true' } },
        { name: 'risk-bypass-dd-on', env: { RISK_MANAGER_BYPASS: 'true', ACCOUNT_DRAWDOWN_BYPASS: 'false' } },
        { name: 'all-on', env: { RISK_MANAGER_BYPASS: 'false', ACCOUNT_DRAWDOWN_BYPASS: 'false' } },
      ],
      strategySweep: [
        { name: 'RSI-only', env: { SOLO_STRATEGY: 'RSI' } },
        { name: 'EMA-only', env: { SOLO_STRATEGY: 'EMASMACrossover' } },
        { name: 'MASR-only', env: { SOLO_STRATEGY: 'MADynamicSR' } },
        { name: 'Sweep-only', env: { SOLO_STRATEGY: 'LiquiditySweep' } },
        { name: 'SMS-only', env: { SOLO_STRATEGY: 'SmartMoneySweep' } },
        { name: 'MTF-only', env: { SOLO_STRATEGY: 'MultiTimeframe' } },
        { name: 'TPO-only', env: { SOLO_STRATEGY: 'OGZTPO' } },
        { name: 'ORB-only', env: { SOLO_STRATEGY: 'OpeningRangeBreakout' } },
        { name: 'Candle-only', env: { SOLO_STRATEGY: 'CandlePattern' } },
        { name: 'NoWick-only', env: { SOLO_STRATEGY: 'NoWickImbalance' } },
        { name: 'BreakRetest-only', env: { SOLO_STRATEGY: 'BreakRetest' } },
        { name: 'Donchian-only', env: { SOLO_STRATEGY: 'DonchianBreakout' } },
        { name: 'PropEMA-only', env: { SOLO_STRATEGY: 'PropSafeEMAPullback' } },
        { name: 'EMARetest-only', env: { SOLO_STRATEGY: 'EMATrendRetest' } },
        { name: 'RSI2MR-only', env: { SOLO_STRATEGY: 'RSI2MeanReversion' } },
        { name: 'TSMOM-only', env: { SOLO_STRATEGY: 'TimeSeriesMomentum' } },
      ],
    },
    rsiSweep: {
      oversoldLevels: [15, 20, 25, 30, 35],
      overboughtLevels: [65, 70, 75, 80, 85],
      minSpread: 30,
    },
    gauntlet: {
      atrValues: [0, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40],
    },
  }),

  // =========================================================================
  // MATRIX SWEEP RUNNER CONFIG
  // =========================================================================
  matrixSweep: deepFreezePlain({
    defaultData: 'tuning/tsla-15m-2y.json',
    dataShortcuts: {
      tsla: 'tuning/tsla-15m-2y.json',
      'tsla-train': 'tuning/tsla-15m-train.json',
      'tsla-test': 'tuning/tsla-15m-test.json',
      'tsla-unseen': 'tuning/tsla-15m-unseen.json',
      spy: 'tuning/spy-15m-2y.json',
      qqq: 'tuning/qqq-15m-2y.json',
      nvda: 'tuning/nvda-15m-2y.json',
      riot: 'tuning/riot-15m-2y.json',
      mara: 'tuning/mara-15m-2y.json',
      coin: 'tuning/coin-15m-2y.json',
      btc: 'data/polygon-btc-1y.json',
    },
    stockTickers: [
      'tsla',
      'spy',
      'qqq',
      'nvda',
      'riot',
      'mara',
      'coin',
      'tsla-train',
      'tsla-test',
      'tsla-unseen',
    ],
    validatedStrategies: [
      'RSI',
      'EMASMACrossover',
      'MADynamicSR',
      'LiquiditySweep',
      'SmartMoneySweep',
    ],
    exploratoryStrategies: [
      'MultiTimeframe',
      'OGZTPO',
      'OpeningRangeBreakout',
      'CandlePattern',
      'NoWickImbalance',
      'BreakRetest',
      'DonchianBreakout',
      'PropSafeEMAPullback',
      'EMATrendRetest',
      'RSI2MeanReversion',
      'TimeSeriesMomentum',
    ],
    grid: {
      full: {
        tierPresets: [
          { t1: 0.005, t2: 0.010, t3: 0.015, label: 'tight' },
          { t1: 0.007, t2: 0.010, t3: 0.015, label: 'default' },
          { t1: 0.010, t2: 0.015, t3: 0.020, label: 'wide' },
          { t1: 0.015, t2: 0.020, t3: 0.030, label: 'ultra-wide' },
        ],
        confidence: [0.30, 0.40, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75],
      },
      quick: {
        tierPresets: [
          { t1: 0.005, t2: 0.010, t3: 0.015, label: 'tight' },
          { t1: 0.007, t2: 0.010, t3: 0.015, label: 'default' },
          { t1: 0.010, t2: 0.015, t3: 0.020, label: 'wide' },
        ],
        confidence: [0.40, 0.55, 0.70],
      },
      exits: {
        tierGrid: [0.005, 0.0075, 0.010, 0.0125, 0.015, 0.0175, 0.020, 0.0225, 0.025, 0.0275],
        confidence: [0.60],
      },
      conf: {
        tierPresets: null,
        confidence: [0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80],
      },
    },
  }),

  // =========================================================================
  // TUNING PROFILES (single source for backtest/runtime profile tunables)
  // =========================================================================
  tuningProfiles: buildTuningProfilesConfig(),

  // =========================================================================
  // FEATURE FLAGS
  // =========================================================================
  features: {
    enableDynamicSizing: envBool('ENABLE_DYNAMIC_SIZING', true),
    enableVolatilityScaling: envBool('ENABLE_VOLATILITY_SCALING', true),
    enableLearning: envBool('ENABLE_LEARNING', true),
    enableArbitrage: envBool('ENABLE_ARBITRAGE', true),
    enableHedging: envBool('ENABLE_HEDGING', true),
    enableShorts: envBool('ENABLE_SHORTS', false),               // DISABLED - no margin
  },

  // =========================================================================
  // PIPELINE TOGGLES - Component enable/disable for testing
  // =========================================================================
  pipeline: {
    // Strategy toggles
    enableRSI: envBool('ENABLE_RSI', true),
    enableMADynamicSR: envBool('ENABLE_MASR', true),
    enableEMACrossover: envBool('ENABLE_EMA', true),
    enableLiquiditySweep: envBool('ENABLE_LIQSWEEP', true),
    enableCandlePattern: envBool('ENABLE_CANDLEPATTERN', true),
    enableBreakRetest: envBool('ENABLE_BREAKRETEST', true),
    enableMarketRegime: envBool('ENABLE_REGIME', false),  // DEPRECATED: now orchestrator pre-filter
    enableMultiTimeframe: envBool('ENABLE_MTF', true),
    enableOGZTPO: envBool('ENABLE_TPO', true),
    enableOpeningRangeBreakout: envBool('ENABLE_ORB', true),
    enableSmartMoneySweep: envBool('ENABLE_SMS', true),
    enableNoWickImbalance: envBool('ENABLE_NOWICK', true),
    enableDonchianBreakout: envBool('ENABLE_DONCHIAN', true),
    enablePropSafeEMAPullback: envBool('ENABLE_PROPSAFE_EMA', true),
    enableEMATrendRetest: envBool('ENABLE_EMA_TREND_RETEST', true),
    enableRSI2MeanReversion: envBool('ENABLE_RSI2_MR', true),
    enableTimeSeriesMomentum: envBool('ENABLE_TSMOM', true),

    // Component toggles
    enableRiskManager: envBool('ENABLE_RISK', true),
    enableTRAI: envBool('ENABLE_TRAI', true),
    traiEnableBacktest: envBool('TRAI_ENABLE_BACKTEST', true),  // Skip TRAI in backtest if false
    enableDashboard: envBool('ENABLE_DASHBOARD', true),
    enableNotifications: envBool('ENABLE_NOTIFICATIONS', true),

    // Execution mode: 'live' | 'paper' | 'backtest'
    executionMode: env('EXECUTION_MODE', 'paper'),

    // Candle source: 'live' | 'file'
    candleSource: env('CANDLE_SOURCE', 'live'),
    candleFile: env('CANDLE_FILE', 'tuning/full-45k.json'),

    // Direction filter: 'long_only' | 'both'
    directionFilter: env('DIRECTION_FILTER', 'both'),

    // Position mode: 'single' | 'multi'
    positionMode: env('POSITION_MODE', 'single'),
  },

  // =========================================================================
  // FUND TARGET
  // =========================================================================
  fundTarget: env('FUND_TARGET', 25000),
  startingBalance: env('STARTING_BALANCE', 10000),
};

// =============================================================================
// RUNTIME STATE
// =============================================================================

let activeOverrides = {};
let configFrozen = false;
let activeTuningProfile = null;
let activeTuningProfileAppliedAt = null;
let activeTuningProfileSource = null;
let activeTuningProfileOverridePaths = new Set();

function isLiveRuntimeEnv() {
  return process.env.LIVE_TRADING === 'true' ||
    process.env.LIVE_TRADING === '1' ||
    process.env.EXECUTION_MODE === 'live' ||
    process.env.TRADING_MODE === 'live' ||
    process.env.ENABLE_LIVE_TRADING === 'true';
}

function assertLiveConfidenceOverrideAllowed(flatOverrides, source) {
  if (!isLiveRuntimeEnv()) return;
  if (!Object.prototype.hasOwnProperty.call(flatOverrides, 'confidence.minTradeConfidence')) return;

  const expected = requiredConfigNumber('confidence.minTradeConfidence');
  const actual = flatOverrides['confidence.minTradeConfidence'];
  if (!Number.isFinite(actual) || actual !== expected) {
    throw new Error(
      `[TradingConfig] Live runtime refuses ${source} override for confidence.minTradeConfidence: ` +
      `expected configured floor ${expected}, got ${actual}`
    );
  }
}

function normalizeTuningProfileName(profileName) {
  const fallback = BASE_CONFIG.tuningProfiles.defaultProfile;
  return String(profileName || fallback).trim();
}

function getTuningProfileDefinitions() {
  return BASE_CONFIG.tuningProfiles.definitions;
}

function coerceProfileEnvValue(envKey, rawValue) {
  if (PROFILE_BOOLEAN_ENV_KEYS.has(envKey)) {
    if (rawValue === true || rawValue === false) return rawValue;
    const normalized = String(rawValue).trim();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    throw new Error(`[TradingConfig] Tuning profile env key ${envKey} requires a boolean value; got '${rawValue}'`);
  }

  if (PROFILE_STRING_ENV_KEYS.has(envKey)) {
    const value = String(rawValue || '').trim();
    if (!value) {
      throw new Error(`[TradingConfig] Tuning profile env key ${envKey} requires a non-empty string`);
    }
    return value;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`[TradingConfig] Tuning profile env key ${envKey} requires a finite numeric value; got '${rawValue}'`);
  }
  return value;
}

function flattenProfileOverrides(profile) {
  const overrides = {};
  for (const [envKey, rawValue] of Object.entries(profile.env)) {
    const configPaths = PROFILE_ENV_CONFIG_PATHS[envKey];
    if (!configPaths) {
      throw new Error(`[TradingConfig] Tuning profile '${profile.name}' has unmapped env key '${envKey}'`);
    }

    const value = coerceProfileEnvValue(envKey, rawValue);
    for (const configPath of configPaths) {
      overrides[configPath] = value;
    }
  }
  return overrides;
}

function captureOverrideSnapshot(paths) {
  const snapshot = {};
  for (const path of paths) {
    snapshot[path] = Object.prototype.hasOwnProperty.call(activeOverrides, path)
      ? activeOverrides[path]
      : PROFILE_SNAPSHOT_MISSING;
  }
  return snapshot;
}

function restoreOverrideSnapshot(snapshot) {
  const nextOverrides = { ...activeOverrides };
  for (const [path, value] of Object.entries(snapshot)) {
    if (value === PROFILE_SNAPSHOT_MISSING) {
      delete nextOverrides[path];
    } else {
      nextOverrides[path] = value;
    }
  }
  activeOverrides = nextOverrides;
}

function assertFlatProfileState(flatState) {
  if (typeof flatState === 'function') {
    return assertFlatProfileState(flatState());
  }

  if (flatState === true) {
    return { flat: true };
  }

  if (!flatState || typeof flatState !== 'object') {
    throw new Error('[TradingConfig] Flat-state tuning profile apply requires an explicit flatState probe result');
  }

  if (flatState.flat !== true) {
    const reason = flatState.reason || 'state_not_flat';
    throw new Error(`[TradingConfig] Refusing tuning profile apply while state is not flat: ${reason}`);
  }

  return flatState;
}

// =============================================================================
// TRADING CONFIG CLASS
// =============================================================================

class TradingConfig {
  /**
   * Get a config value by path (e.g., 'confidence.minTradeConfidence')
   * Overrides take precedence over base config
   */
  static get(path, defaultValue = undefined) {
    // Check overrides first
    if (activeOverrides[path] !== undefined) {
      return activeOverrides[path];
    }

    // Navigate nested path
    const parts = path.split('.');
    let value = BASE_CONFIG;

    for (const part of parts) {
      if (value === undefined || value === null) {
        return defaultValue;
      }
      value = value[part];
    }

    return value !== undefined ? value : defaultValue;
  }

  /**
   * Get entire section (e.g., 'confidence', 'exits', 'exitContracts')
   */
  static getSection(section) {
    const base = BASE_CONFIG[section];
    if (!base) return undefined;

    // Merge any overrides for this section
    const result = { ...base };
    for (const [key, val] of Object.entries(activeOverrides)) {
      if (key.startsWith(`${section}.`)) {
        const subKey = key.slice(section.length + 1);
        result[subKey] = val;
      }
    }

    return result;
  }

  /**
   * Get exit contract for a strategy
   */
  static getExitContract(strategyName) {
    const contracts = BASE_CONFIG.exitContracts;
    return contracts[strategyName] || contracts.default;
  }

  /**
   * Get timeframe-specific config
   */
  static getTimeframeConfig(timeframe) {
    return BASE_CONFIG.timeframeConfig[timeframe] || BASE_CONFIG.timeframeConfig['15m'];
  }

  /**
   * Get regime multipliers
   */
  static getRegimeMultipliers(regime) {
    return BASE_CONFIG.regimeMultipliers[regime] || { slMultiplier: 1.0, tpMultiplier: 1.0 };
  }

  /**
   * Get trading profile
   */
  static getProfile(profileName) {
    const normalized = typeof profileName === 'string' ? profileName.trim() : '';
    const profile = normalized ? BASE_CONFIG.profiles[normalized] : undefined;

    if (!profile) {
      throw new Error(
        `[TradingConfig] Unknown trading profile '${profileName}'. Available: ${Object.keys(BASE_CONFIG.profiles).join(', ')}`
      );
    }

    return profile;
  }

  static listTuningProfileNames() {
    return Object.keys(getTuningProfileDefinitions());
  }

  static resolveTuningProfile(profileName = BASE_CONFIG.tuningProfiles.defaultProfile) {
    const normalized = normalizeTuningProfileName(profileName);
    const profile = getTuningProfileDefinitions()[normalized];
    if (!profile) {
      throw new Error(`[TradingConfig] Unknown tuning profile '${normalized}'. Available: ${this.listTuningProfileNames().join(', ')}`);
    }
    return deepFreezePlain(clonePlain(profile));
  }

  static summarizeTuningProfile(profileOrName = BASE_CONFIG.tuningProfiles.defaultProfile) {
    const profile = typeof profileOrName === 'string' || !profileOrName
      ? this.resolveTuningProfile(profileOrName)
      : this.resolveTuningProfile(profileOrName.name);

    return {
      name: profile.name,
      description: profile.description,
      evidence: [...profile.evidence],
      env: { ...profile.env },
      configPaths: this.getTuningProfileConfigPaths(profile.name),
      runtimeSnapshotEnvKeys: this.getTuningProfileRuntimeSnapshotKeys(profile.name),
    };
  }

  static getTuningProfileDefinitions() {
    return deepFreezePlain(clonePlain(getTuningProfileDefinitions()));
  }

  static getBacktestWorkerEnvDefaults() {
    return Object.freeze({ ...BASE_CONFIG.backtestWorkerEnv.canonical });
  }

  static getBacktestStockZeroFeeEnv() {
    return Object.freeze({ ...BASE_CONFIG.backtestWorkerEnv.stockZeroFee });
  }

  static getParallelBacktestConfig() {
    return deepFreezePlain(clonePlain(BASE_CONFIG.parallelBacktest));
  }

  static getMatrixSweepConfig() {
    return deepFreezePlain(clonePlain(BASE_CONFIG.matrixSweep));
  }

  static getTuningProfileConfigPaths(profileName = BASE_CONFIG.tuningProfiles.defaultProfile) {
    const profile = this.resolveTuningProfile(profileName);
    return Object.freeze([
      ...new Set(Object.keys(flattenProfileOverrides(profile)).sort()),
    ]);
  }

  static getTuningProfileRuntimeSnapshotKeys(profileName = BASE_CONFIG.tuningProfiles.defaultProfile) {
    const profile = this.resolveTuningProfile(profileName);
    return Object.freeze(
      Object.keys(profile.env)
        .filter(key => PROFILE_RUNTIME_SNAPSHOT_ENV_KEYS.has(key))
        .sort()
    );
  }

  static buildTuningProfileOverrides(profileName = BASE_CONFIG.tuningProfiles.defaultProfile) {
    const profile = this.resolveTuningProfile(profileName);
    return Object.freeze({ ...flattenProfileOverrides(profile) });
  }

  static getTuningProfileStatus() {
    return {
      activeProfile: activeTuningProfile,
      activeProfileAppliedAt: activeTuningProfileAppliedAt,
      activeProfileSource: activeTuningProfileSource,
      profiles: this.listTuningProfileNames(),
      profileOverrideCount: activeTuningProfileOverridePaths.size,
    };
  }

  static applyTuningProfile(profileName = BASE_CONFIG.tuningProfiles.defaultProfile, options = {}) {
    if (configFrozen) {
      throw new Error('[TradingConfig] Config is frozen; refusing tuning profile apply');
    }

    const {
      requireFlat = false,
      flatState,
      phase = 'startup',
      replaceActiveProfile = false,
      source = 'unknown',
    } = options;

    let flatStateVerified = false;
    if (requireFlat) {
      assertFlatProfileState(flatState);
      flatStateVerified = true;
    }

    const profile = this.resolveTuningProfile(profileName);
    if (activeTuningProfile && activeTuningProfile !== profile.name && !replaceActiveProfile) {
      throw new Error(
        `[TradingConfig] Tuning profile '${profile.name}' cannot replace active profile '${activeTuningProfile}' without replaceActiveProfile=true and flat-state proof`
      );
    }

    const runtimeSnapshotKeys = this.getTuningProfileRuntimeSnapshotKeys(profile.name);
    if (phase !== 'startup' && runtimeSnapshotKeys.length > 0) {
      throw new Error(
        `[TradingConfig] Tuning profile '${profile.name}' includes startup-snapshot key(s) ${runtimeSnapshotKeys.join(', ')}; ` +
        `phase '${phase}' would not update constructed runtime objects`
      );
    }

    const overrides = this.buildTuningProfileOverrides(profile.name);
    const paths = Object.keys(overrides);
    assertLiveConfidenceOverrideAllowed(overrides, `tuning profile '${profile.name}'`);
    const previousProfilePaths = replaceActiveProfile
      ? Array.from(activeTuningProfileOverridePaths)
      : [];
    const replaceSnapshotPaths = [
      ...new Set([...previousProfilePaths, ...paths]),
    ];
    const snapshot = captureOverrideSnapshot(replaceSnapshotPaths);
    const conflicts = [];

    for (const path of paths) {
      if (!Object.prototype.hasOwnProperty.call(activeOverrides, path)) continue;
      if (sameConfigValue(activeOverrides[path], overrides[path])) continue;
      conflicts.push(`${path}: active=${activeOverrides[path]} profile=${overrides[path]}`);
    }

    if (conflicts.length > 0 && !replaceActiveProfile) {
      throw new Error(
        `[TradingConfig] Tuning profile '${profile.name}' would overwrite active config path(s): ${conflicts.join('; ')}. ` +
        'Pass replaceActiveProfile=true only after proving state is flat and the caller intends a profile swap.'
      );
    }

    if (conflicts.length > 0 && replaceActiveProfile) {
      if (!flatStateVerified) {
        assertFlatProfileState(flatState);
        flatStateVerified = true;
      }
    }

    if (replaceActiveProfile && !flatStateVerified) {
      assertFlatProfileState(flatState);
    }

    const nextOverrides = { ...activeOverrides };
    if (replaceActiveProfile) {
      for (const path of previousProfilePaths) {
        delete nextOverrides[path];
      }
    }
    const previousProfile = activeTuningProfile;
    const previousAppliedAt = activeTuningProfileAppliedAt;
    const previousSource = activeTuningProfileSource;
    const previousOverridePaths = new Set(activeTuningProfileOverridePaths);

    activeOverrides = {
      ...nextOverrides,
      ...overrides,
    };
    activeTuningProfile = profile.name;
    activeTuningProfileAppliedAt = new Date().toISOString();
    activeTuningProfileSource = source;
    activeTuningProfileOverridePaths = new Set(paths);

    try {
      for (const [path, expected] of Object.entries(overrides)) {
        const actual = this.get(path);
        if (!sameConfigValue(actual, expected)) {
          throw new Error(
            `[TradingConfig] Tuning profile '${profile.name}' verification failed for ${path}: expected ${expected}, got ${actual}`
          );
        }
      }
    } catch (err) {
      restoreOverrideSnapshot(snapshot);
      activeTuningProfile = previousProfile;
      activeTuningProfileAppliedAt = previousAppliedAt;
      activeTuningProfileSource = previousSource;
      activeTuningProfileOverridePaths = previousOverridePaths;
      throw err;
    }

    return {
      profile: profile.name,
      source,
      phase,
      appliedAt: activeTuningProfileAppliedAt,
      overrideCount: paths.length,
      configPaths: paths.sort(),
      runtimeSnapshotEnvKeys: runtimeSnapshotKeys,
    };
  }

  static async runWithTuningProfile(profileName, callback, options = {}) {
    if (typeof callback !== 'function') {
      throw new Error('[TradingConfig] runWithTuningProfile requires a callback');
    }

    const profile = this.resolveTuningProfile(profileName);
    const overrides = this.buildTuningProfileOverrides(profile.name);
    const paths = Object.keys(overrides);
    const snapshot = captureOverrideSnapshot([
      ...new Set([...Array.from(activeTuningProfileOverridePaths), ...paths]),
    ]);
    const previousProfile = activeTuningProfile;
    const previousAppliedAt = activeTuningProfileAppliedAt;
    const previousSource = activeTuningProfileSource;
    const previousOverridePaths = new Set(activeTuningProfileOverridePaths);

    this.applyTuningProfile(profile.name, {
      ...options,
      replaceActiveProfile: true,
    });

    try {
      return await callback(this.getTuningProfileStatus());
    } finally {
      restoreOverrideSnapshot(snapshot);
      activeTuningProfile = previousProfile;
      activeTuningProfileAppliedAt = previousAppliedAt;
      activeTuningProfileSource = previousSource;
      activeTuningProfileOverridePaths = previousOverridePaths;
    }
  }

  /**
   * Set temporary overrides (for backtest/dashboard)
   * Does NOT modify .env - values only persist until clearOverrides() or process restart
   */
  static setOverrides(overrides) {
    if (configFrozen) {
      console.warn('[TradingConfig] Config is frozen, ignoring setOverrides()');
      return;
    }

    // Flatten nested objects to dot notation
    const flatten = (obj, prefix = '') => {
      const result = {};
      for (const [key, val] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          Object.assign(result, flatten(val, fullKey));
        } else {
          result[fullKey] = val;
        }
      }
      return result;
    };

    const flatOverrides = flatten(overrides);
    assertLiveConfidenceOverrideAllowed(flatOverrides, 'setOverrides');
    activeOverrides = { ...activeOverrides, ...flatOverrides };
    for (const path of Object.keys(flatOverrides)) {
      activeTuningProfileOverridePaths.delete(path);
    }

    console.log(`[TradingConfig] Overrides set: ${Object.keys(flatOverrides).join(', ')}`);
  }

  /**
   * Clear all overrides (restore to base config)
   */
  static clearOverrides() {
    activeOverrides = {};
    activeTuningProfile = null;
    activeTuningProfileAppliedAt = null;
    activeTuningProfileSource = null;
    activeTuningProfileOverridePaths = new Set();
    console.log('[TradingConfig] Overrides cleared');
  }

  /**
   * Freeze config (prevent further overrides - use in production)
   */
  static freeze() {
    configFrozen = true;
    console.log('[TradingConfig] Config frozen');
  }

  /**
   * Unfreeze config (allow overrides again)
   */
  static unfreeze() {
    configFrozen = false;
    console.log('[TradingConfig] Config unfrozen');
  }

  /**
   * Get all current config (base + overrides merged)
   */
  static getAll() {
    const result = JSON.parse(JSON.stringify(BASE_CONFIG));

    // Apply overrides
    for (const [path, val] of Object.entries(activeOverrides)) {
      const parts = path.split('.');
      let target = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!target[parts[i]]) target[parts[i]] = {};
        target = target[parts[i]];
      }
      target[parts[parts.length - 1]] = val;
    }

    return result;
  }

  /**
   * Print current config summary (for debugging)
   */
  static printSummary() {
    const conf = this.getSection('confidence');
    const risk = this.getSection('risk');
    const pos = this.getSection('positionSizing');
    const exits = this.getSection('exits');
    const fees = this.getSection('fees');

    console.log('\n=== TRADING CONFIG SUMMARY ===');
    // Confidence/risk/position are decimal form (0.50 = 50%), multiply by 100
    console.log(`Min Trade Confidence: ${(conf.minTradeConfidence * 100).toFixed(1)}%`);
    console.log(`Max Risk Per Trade:   ${(risk.maxRiskPerTrade * 100).toFixed(1)}%`);
    console.log(`Base Position Size:   ${(pos.basePositionSize * 100).toFixed(1)}%`);
    console.log(`Max Position Size:    ${(pos.maxPositionSize * 100).toFixed(1)}%`);
    // Exits are already in percent form (1.5 = 1.5%), no multiplication needed
    console.log(`Stop Loss:            ${exits.stopLossPercent.toFixed(2)}%`);
    console.log(`Take Profit:          ${exits.takeProfitPercent.toFixed(2)}%`);
    console.log(`Trailing Stop:        ${exits.trailingStopPercent.toFixed(2)}%`);
    console.log(`Round-trip Fees:      ${(fees.totalRoundTrip * 100).toFixed(2)}%`);
    console.log(`Active Overrides:     ${Object.keys(activeOverrides).length}`);
    console.log('==============================\n');
  }

  /**
   * Validate config (check for obviously bad values)
   */
  static validate() {
    const errors = [];

    const conf = this.getSection('confidence');
    const exits = this.getSection('exits');
    const pos = this.getSection('positionSizing');

    // Confidence checks
    if (conf.minTradeConfidence < 0.1) {
      errors.push(`minTradeConfidence too low (${conf.minTradeConfidence}) - likely to enter bad trades`);
    }
    if (conf.minTradeConfidence > 0.9) {
      errors.push(`minTradeConfidence too high (${conf.minTradeConfidence}) - will rarely trade`);
    }

    // Exit checks
    if (Math.abs(exits.stopLossPercent) > Math.abs(exits.takeProfitPercent)) {
      errors.push(`SL (${exits.stopLossPercent}) is wider than TP (${exits.takeProfitPercent}) - negative R:R`);
    }

    // Position sizing checks
    if (pos.maxPositionSize > 0.25) {
      errors.push(`maxPositionSize (${pos.maxPositionSize}) > 25% - very high risk`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDATED CONFIG PROTECTION - SCREAM IF LOCKED VALUES CHANGED
    // ═══════════════════════════════════════════════════════════════════════
    const rsi = BASE_CONFIG.exitContracts.RSI;
    if (rsi._validated) {
      const lockedValues = { sl: -0.8, tp: 1.0, conf: 0.60 };
      if (rsi.stopLossPercent !== lockedValues.sl) {
        console.error('\nRSI STOP LOSS CHANGED FROM VALIDATED VALUE');
        console.error(`   Expected: ${lockedValues.sl}%, Got: ${rsi.stopLossPercent}%`);
        console.error('   This config was walk-forward validated on 2026-03-20');
        console.error('   RE-VALIDATE BEFORE DEPLOYING\n');
      }
      if (rsi.takeProfitPercent !== lockedValues.tp) {
        console.error('\nRSI TAKE PROFIT CHANGED FROM VALIDATED VALUE');
        console.error(`   Expected: ${lockedValues.tp}%, Got: ${rsi.takeProfitPercent}%`);
        console.error('   This config was walk-forward validated on 2026-03-20');
        console.error('   RE-VALIDATE BEFORE DEPLOYING\n');
      }
      if (rsi.minConfidence !== lockedValues.conf) {
        console.error('\nRSI MIN CONFIDENCE CHANGED FROM VALIDATED VALUE');
        console.error(`   Expected: ${lockedValues.conf}, Got: ${rsi.minConfidence}`);
        console.error('   This config was walk-forward validated on 2026-03-20');
        console.error('   RE-VALIDATE BEFORE DEPLOYING\n');
      }
    }

    if (errors.length > 0) {
      console.warn('\nTRADING CONFIG VALIDATION WARNINGS:');
      errors.forEach(e => console.warn(`   - ${e}`));
      console.warn('');
    }

    return errors;
  }
}

// =============================================================================
// CONVENIENCE EXPORTS (for quick access to common values)
// =============================================================================

module.exports = TradingConfig;
module.exports.BASE_CONFIG = BASE_CONFIG;
module.exports.envNumber = envNumber;  // FIX 28: attached AFTER late reassignment
module.exports.DEFAULT_TUNING_PROFILE = BASE_CONFIG.tuningProfiles.defaultProfile;
module.exports.PROFILE_FORBIDDEN_ENV_KEYS = PROFILE_FORBIDDEN_ENV_KEYS;
module.exports.PROFILE_ENV_CONFIG_PATHS = PROFILE_ENV_CONFIG_PATHS;
module.exports.PROFILE_RUNTIME_SNAPSHOT_ENV_KEYS = PROFILE_RUNTIME_SNAPSHOT_ENV_KEYS;

// Quick accessors for the most commonly used values
module.exports.MIN_CONFIDENCE = () => TradingConfig.get('confidence.minTradeConfidence');
module.exports.MAX_RISK = () => TradingConfig.get('risk.maxRiskPerTrade');
module.exports.FEES_ROUND_TRIP = () => TradingConfig.get('fees.totalRoundTrip');
