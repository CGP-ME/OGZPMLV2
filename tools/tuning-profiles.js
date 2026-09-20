'use strict';

const ConfigLoader = require('../foundation/ConfigLoader');

function listTuningProfileNames() {
  return ConfigLoader.listTuningProfileNames();
}

function resolveTuningProfile(profileName = ConfigLoader.DEFAULT_TUNING_PROFILE) {
  const profile = ConfigLoader.resolveTuningProfile(profileName);
  return Object.freeze({
    name: profile.name,
    launchProfile: profile.launchProfile,
    description: profile.description,
    evidence: Object.freeze([...(profile.evidence || [])]),
    overrides: ConfigLoader.buildTuningProfileOverrides(profile.name),
  });
}

function summarizeTuningProfile(profile) {
  const resolved = resolveTuningProfile(typeof profile === 'object' ? profile.name : profile);
  return {
    name: resolved.name,
    launchProfile: resolved.launchProfile,
    description: resolved.description,
    evidence: [...resolved.evidence],
    overrides: { ...resolved.overrides },
  };
}

module.exports = {
  DEFAULT_TUNING_PROFILE: ConfigLoader.DEFAULT_TUNING_PROFILE,
  PROFILE_DEFINITIONS: Object.freeze(Object.fromEntries(
    ConfigLoader.listTuningProfileNames().map(name => [name, resolveTuningProfile(name)])
  )),
  listTuningProfileNames,
  resolveTuningProfile,
  summarizeTuningProfile,
};
