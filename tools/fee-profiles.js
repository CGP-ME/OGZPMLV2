'use strict';

const TradingConfig = require('../core/TradingConfig');

function listFeeProfileNames() {
  return TradingConfig.listFeeProfileNames();
}

function resolveFeeProfile(profileName) {
  return TradingConfig.resolveFeeProfile(profileName);
}

function summarizeFeeProfile(profile) {
  return TradingConfig.summarizeFeeProfile(profile);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function buildShellExports(profileName) {
  const profile = resolveFeeProfile(profileName);
  const keys = [
    'FEE_MODEL',
    'FEE_MAKER',
    'FEE_TAKER',
    'FEE_TOTAL_ROUNDTRIP',
    'FEE_SAFETY_BUFFER',
    'FEE_SLIPPAGE',
    'FEE_PER_SHARE',
    'FEE_MIN_ORDER',
  ];
  const lines = [
    `export BACKTEST_FEE_PROFILE=${shellQuote(profile.name)}`,
    ...keys.map((key) => `unset ${key}`),
  ];
  for (const [key, value] of Object.entries(profile.env)) {
    lines.push(`export ${key}=${shellQuote(value)}`);
  }
  return lines.join('\n');
}

if (require.main === module) {
  const [, , command, profileName] = process.argv;
  try {
    if (command === 'shell-export') {
      process.stdout.write(`${buildShellExports(profileName)}\n`);
    } else if (command === 'list') {
      process.stdout.write(`${listFeeProfileNames().join('\n')}\n`);
    } else {
      process.stderr.write(`Usage: node tools/fee-profiles.js shell-export <${listFeeProfileNames().join('|')}>\n`);
      process.exit(1);
    }
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  buildShellExports,
  listFeeProfileNames,
  resolveFeeProfile,
  summarizeFeeProfile,
};
