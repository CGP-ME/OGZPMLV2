'use strict';

const DEFAULT_TUNING_PROFILE = 'current-eval';

function freezeProfile(profile) {
  return Object.freeze({
    ...profile,
    env: Object.freeze({ ...profile.env }),
  });
}

const PROFILE_DEFINITIONS = Object.freeze({
  'current-eval': freezeProfile({
    name: 'current-eval',
    description: 'Current explicit TSLA stock-eval posture; freezes the repo .env values that workers previously inherited implicitly.',
    evidence: [
      '.env:236-269',
      'core/TradingConfig.js:88-90',
      'tools/backtest-worker-env.js canonical worker defaults',
    ],
    env: {
      ENABLE_DYNAMIC_SIZING: 'true',
      BASE_POSITION_SIZE: '0.01',
      MAX_POSITION_SIZE_PCT: '0.05',
      BASE_POSITION_PCT: '0.01',
      MAX_POSITION_PCT: '0.05',
      ABSOLUTE_POSITION_CAP: '0.15',
      STOP_LOSS_PERCENT: '0.8',
      TAKE_PROFIT_PERCENT: '1.0',
      TRAILING_STOP_PERCENT: '0.6',
      TRAILING_ACTIVATION: '0.8',
      TIER1_TARGET: '0.007',
      TIER2_TARGET: '0.010',
      TIER3_TARGET: '0.015',
      FINAL_TARGET: '0.025',
      TIER1_EXIT_FRACTION: '0.30',
      TIER2_EXIT_FRACTION: '0.30',
      TIER3_EXIT_FRACTION: '0.20',
      ACCOUNT_DRAWDOWN_BYPASS: 'true',
      RISK_MANAGER_BYPASS: 'true',
      EXIT_SYSTEM: 'legacy',
      FEE_SLIPPAGE: '0.0005',
    },
  }),

  'legacy-wide': freezeProfile({
    name: 'legacy-wide',
    description: 'Wide-target historical posture from .env.gates; useful for testing whether tight MPM tiers are choking winners.',
    evidence: [
      '.env.gates:69-72',
      '.env.gates:239-272',
    ],
    env: {
      ENABLE_DYNAMIC_SIZING: 'true',
      BASE_POSITION_SIZE: '0.01',
      MAX_POSITION_SIZE_PCT: '0.05',
      BASE_POSITION_PCT: '0.01',
      MAX_POSITION_PCT: '0.05',
      ABSOLUTE_POSITION_CAP: '0.15',
      STOP_LOSS_PERCENT: '1.5',
      TAKE_PROFIT_PERCENT: '2.0',
      TRAILING_STOP_PERCENT: '3.0',
      TRAILING_ACTIVATION: '2.5',
      TIER1_TARGET: '0.020',
      TIER2_TARGET: '0.040',
      TIER3_TARGET: '0.060',
      FINAL_TARGET: '0.100',
      TIER1_EXIT_FRACTION: '0.30',
      TIER2_EXIT_FRACTION: '0.30',
      TIER3_EXIT_FRACTION: '0.20',
      ACCOUNT_DRAWDOWN_BYPASS: 'true',
      RISK_MANAGER_BYPASS: 'true',
      EXIT_SYSTEM: 'legacy',
      FEE_SLIPPAGE: '0.0005',
    },
  }),

});

function listTuningProfileNames() {
  return Object.keys(PROFILE_DEFINITIONS);
}

function resolveTuningProfile(profileName = DEFAULT_TUNING_PROFILE) {
  const normalized = String(profileName || DEFAULT_TUNING_PROFILE).trim();
  const profile = PROFILE_DEFINITIONS[normalized];
  if (!profile) {
    throw new Error(`Unknown tuning profile '${normalized}'. Available: ${listTuningProfileNames().join(', ')}`);
  }
  return profile;
}

function summarizeTuningProfile(profile) {
  const resolved = typeof profile === 'string' || !profile
    ? resolveTuningProfile(profile)
    : profile;

  return {
    name: resolved.name,
    description: resolved.description,
    evidence: resolved.evidence,
    env: { ...resolved.env },
  };
}

module.exports = {
  DEFAULT_TUNING_PROFILE,
  PROFILE_DEFINITIONS,
  listTuningProfileNames,
  resolveTuningProfile,
  summarizeTuningProfile,
};
