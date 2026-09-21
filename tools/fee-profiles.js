'use strict';

const ConfigLoader = require('../foundation/ConfigLoader');

function listFeeProfileNames() {
  return ConfigLoader.listFeeProfileNames();
}

function resolveFeeProfile(profileName) {
  const profile = ConfigLoader.resolveFeeProfile(profileName);
  return Object.freeze({
    name: profile.name,
    description: profile.description,
    assetClasses: Object.freeze([...(profile.assetClasses || [])]),
    overrides: ConfigLoader.buildFeeProfileOverrides(profile.name),
  });
}

function summarizeFeeProfile(profile) {
  const resolved = resolveFeeProfile(typeof profile === 'object' ? profile.name : profile);
  return {
    name: resolved.name,
    description: resolved.description,
    assetClasses: [...resolved.assetClasses],
    overrides: { ...resolved.overrides },
  };
}

if (require.main === module) {
  const [, , command, profileName] = process.argv;
  try {
    if (command === 'show') {
      process.stdout.write(`${JSON.stringify(summarizeFeeProfile(profileName), null, 2)}\n`);
    } else if (command === 'list') {
      process.stdout.write(`${listFeeProfileNames().join('\n')}\n`);
    } else {
      process.stderr.write(`Usage: node tools/fee-profiles.js <list|show> [${listFeeProfileNames().join('|')}]\n`);
      process.exit(1);
    }
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  listFeeProfileNames,
  resolveFeeProfile,
  summarizeFeeProfile,
};
