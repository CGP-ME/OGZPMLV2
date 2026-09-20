#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  buildBacktestWorkerEnv,
  removeBacktestRunDescriptor,
  summarizeWorkerEnv,
} = require('./backtest-worker-env');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RUNNER = path.join(PROJECT_ROOT, 'run-empire-v2.js');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    dataFile: null,
    feeProfileName: null,
    profileName: null,
    directionFilter: null,
    soloFilter: null,
    name: 'single',
    outputDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const readValue = flag => {
      if (argument.startsWith(`${flag}=`)) return argument.slice(flag.length + 1);
      if (argument === flag && argv[index + 1]) return argv[++index];
      return null;
    };
    const dataFile = readValue('--data');
    if (dataFile !== null) options.dataFile = dataFile;
    else {
      const solo = readValue('--solo');
      if (solo !== null) options.soloFilter = solo.split(',').map(value => value.trim()).filter(Boolean);
      else {
        const direction = readValue('--direction');
        if (direction !== null) options.directionFilter = direction;
        else {
          const profile = readValue('--profile');
          if (profile !== null) options.profileName = profile;
          else {
            const feeProfile = readValue('--fee-profile');
            if (feeProfile !== null) options.feeProfileName = feeProfile;
            else {
              const name = readValue('--name');
              if (name !== null) options.name = name;
              else {
                const outputDir = readValue('--output-dir');
                if (outputDir !== null) options.outputDir = path.resolve(outputDir);
                else if (argument === '--help') options.help = true;
                else throw new Error(`Unknown or incomplete argument: ${argument}`);
              }
            }
          }
        }
      }
    }
  }

  return options;
}

function printHelp() {
  console.log(`
OGZPrime single backtest runner

Usage:
  node tools/single-backtest.js --data FILE --solo NAMES [options]

Options:
  --name NAME             Report/state label (default: single)
  --data FILE             Candle data file (required)
  --solo A,B              Canonical strategy soloFilter (required)
  --direction VALUE       both, long_only, or short_only (required)
  --profile NAME          Canonical tuning profile (required)
  --fee-profile NAME      Canonical verified fee profile (required)
  --output-dir PATH       Report directory (required)

The child process receives only BACKTEST_RUN_DESCRIPTOR_PATH plus operating-
system necessities. Trading behavior is resolved by ConfigLoader before boot.
`);
}

function safeLabel(value) {
  return String(value || 'single').replace(/[^A-Za-z0-9_.-]/g, '_');
}

function removeFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function runSingleBacktest(options) {
  if (!options.dataFile) throw new Error('--data is required');
  if (options.soloFilter === null) throw new Error('--solo is required');
  if (!options.directionFilter) throw new Error('--direction is required');
  if (!options.profileName) throw new Error('--profile is required');
  if (!options.feeProfileName) throw new Error('--fee-profile is required');
  if (!options.outputDir) throw new Error('--output-dir is required');
  if (!['both', 'long_only', 'short_only'].includes(options.directionFilter)) {
    throw new Error('--direction must be both, long_only, or short_only');
  }

  const runId = `${safeLabel(options.name)}-${Date.now()}-${process.pid}`;
  const stateFile = path.join(PROJECT_ROOT, 'data', `state-backtest-${runId}.json`);
  const dataDir = path.join(PROJECT_ROOT, 'data', 'backtest');
  const descriptorPath = `${stateFile}.run.json`;
  const overrides = {
    'strategies.soloFilter': [...options.soloFilter],
    'pipeline.directionFilter': options.directionFilter,
  };
  const env = buildBacktestWorkerEnv({
    sourceEnv: process.env,
    projectRoot: PROJECT_ROOT,
    dataFile: options.dataFile,
    stateFile,
    dataDir,
    reportTag: runId,
    outputDir: options.outputDir,
    descriptorPath,
    freshStart: false,
    profileName: options.profileName,
    feeProfileName: options.feeProfileName,
    overrides,
  });

  const summary = summarizeWorkerEnv(env);
  console.log('[single-backtest] Resolved run descriptor');
  console.log(JSON.stringify({
    fingerprint: summary.fingerprint,
    revisions: summary.revisions,
    launchProfile: summary.launchProfile,
    identity: summary.identity,
    data: summary.data,
    report: summary.report,
    profiles: summary.profiles,
    overrides: summary.overrides,
  }, null, 2));

  let result;
  try {
    result = spawnSync(process.execPath, [RUNNER], {
      cwd: PROJECT_ROOT,
      env,
      stdio: 'inherit',
    });
  } finally {
    removeBacktestRunDescriptor(env);
    removeFile(stateFile);
  }

  if (result.error) throw result.error;
  if (result.signal) {
    throw new Error(`Backtest child terminated by ${result.signal}`);
  }
  return Number.isInteger(result.status) ? result.status : 1;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }
  return runSingleBacktest(options);
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`[single-backtest] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  runSingleBacktest,
};
