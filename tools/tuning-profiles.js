'use strict';

const TradingConfig = require('../core/TradingConfig');

function listTuningProfileNames() {
  return TradingConfig.listTuningProfileNames();
}

function resolveTuningProfile(profileName = TradingConfig.DEFAULT_TUNING_PROFILE) {
  return TradingConfig.resolveTuningProfile(profileName);
}

function summarizeTuningProfile(profile) {
  return TradingConfig.summarizeTuningProfile(profile);
}

module.exports = {
  DEFAULT_TUNING_PROFILE: TradingConfig.DEFAULT_TUNING_PROFILE,
  PROFILE_DEFINITIONS: TradingConfig.getTuningProfileDefinitions(),
  PROFILE_FORBIDDEN_ENV_KEYS: TradingConfig.PROFILE_FORBIDDEN_ENV_KEYS,
  listTuningProfileNames,
  resolveTuningProfile,
  summarizeTuningProfile,
};
