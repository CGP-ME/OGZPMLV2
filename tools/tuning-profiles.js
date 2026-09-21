'use strict';

const ConfigLoader = require('../foundation/ConfigLoader');

function listTuningProfileNames() {
  return ConfigLoader.listTuningProfileNames();
}

function resolveTuningProfile(profileName = ConfigLoader.DEFAULT_TUNING_PROFILE) {
  return ConfigLoader.resolveTuningProfile(profileName);
}

function summarizeTuningProfile(profile) {
  return ConfigLoader.summarizeTuningProfile(profile);
}

module.exports = {
  DEFAULT_TUNING_PROFILE: ConfigLoader.DEFAULT_TUNING_PROFILE,
  PROFILE_DEFINITIONS: ConfigLoader.getTuningProfileDefinitions(),
  PROFILE_FORBIDDEN_ENV_KEYS: ConfigLoader.PROFILE_FORBIDDEN_ENV_KEYS,
  listTuningProfileNames,
  resolveTuningProfile,
  summarizeTuningProfile,
};
