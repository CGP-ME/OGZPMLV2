// ═══════════════════════════════════════════════════════════════════
// PATCH: TradingConfig.js — SmartMoneySweep Configuration
// ═══════════════════════════════════════════════════════════════════
//
// FILE: core/TradingConfig.js
//
// ── CHANGE 1: Add exit contract ──
// Add this block inside exitContracts: { ... } section,
// BEFORE the closing brace of exitContracts.
// IMPORTANT: Must be an EXACT key match 'SmartMoneySweep' to avoid
// the partial-match fallback in ExitContractManager that would
// incorrectly map to LiquiditySweep via the 'sweep' substring.

    SmartMoneySweep: {
      stopLossPercent: -0.3,          // maxLossPct from PineScript (hard cap, lose fast)
      takeProfitPercent: 1.5,         // High conviction ATR target
      trailingStopPercent: 0.5,       // Trail after 0.5 R:R (Fabio: risk-free in 1 minute)
      trailingActivation: 0.5,
      maxHoldTimeMinutes: 900,        // 60 candles x 15 min
      useStructuralExits: true,       // Strategy provides SL/TP via overrideLevels
      invalidationConditions: ['sweep_absorbed'],
    },

// ── CHANGE 2: Add pipeline toggle ──
// Add this line inside the pipeline: { ... } section,
// after the enableOpeningRangeBreakout line:

    enableSmartMoneySweep: envBool('ENABLE_SMS', false),  // NEW: Disabled by default until validated

// ── CHANGE 3: Add strategy parameters ──
// Add this block inside the strategies: { ... } section:

    SmartMoneySweep: {
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
    },
