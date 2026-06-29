#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PM2_PROCESS = 'ogz-prime-v2';
const WEBSOCKET_PROCESS = 'ogz-websocket';
const RUNTIME_DEPLOY_PATHS = Object.freeze([
  'run-empire-v2.js',
  'ecosystem.config.js',
  'config',
  'core',
  'modules',
  'foundation',
  'brokers',
  'strategies',
]);

function currentNewYorkDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function run(command, args, options = {}) {
  process.stdout.write(`[eval-live-deploy] ${command} ${args.join(' ')}\n`);
  return execFileSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    ...options,
  });
}

function capture(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function isGitRepo() {
  try {
    return capture('git', ['rev-parse', '--is-inside-work-tree']).trim() === 'true';
  } catch (_) {
    return false;
  }
}

function runtimeStatusLines() {
  if (!isGitRepo()) return [];
  const output = capture('git', [
    'status',
    '--short',
    '--untracked-files=all',
    '--',
    ...RUNTIME_DEPLOY_PATHS,
  ]);
  return output.split('\n').filter(Boolean);
}

function writeRuntimeSnapshot(statusLines) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotDir = path.join(REPO_ROOT, 'ogz-meta', 'cognition-history', 'deploy-snapshots');
  fs.mkdirSync(snapshotDir, { recursive: true });

  const statusPath = path.join(snapshotDir, `${stamp}-eval-live-runtime-status.txt`);
  fs.writeFileSync(statusPath, `${statusLines.join('\n')}\n`, 'utf8');

  const diff = capture('git', ['diff', '--binary', '--', ...RUNTIME_DEPLOY_PATHS]);
  if (diff.trim()) {
    const patchPath = path.join(snapshotDir, `${stamp}-eval-live-runtime-tracked.patch`);
    fs.writeFileSync(patchPath, diff, 'utf8');
  }

  return stamp;
}

function quarantineRuntimeChanges() {
  if (!isGitRepo()) {
    process.stdout.write('[eval-live-deploy] git metadata unavailable; runtime quarantine skipped\n');
    return { quarantined: false, statusLines: [] };
  }

  const statusLines = runtimeStatusLines();
  if (statusLines.length === 0) {
    process.stdout.write('[eval-live-deploy] runtime path clean\n');
    return { quarantined: false, statusLines };
  }

  const stamp = writeRuntimeSnapshot(statusLines);
  const stashMessage = `eval-live-deploy-runtime-quarantine-${stamp}`;
  run('git', [
    'stash',
    'push',
    '--include-untracked',
    '-m',
    stashMessage,
    '--',
    ...RUNTIME_DEPLOY_PATHS,
  ]);
  process.stdout.write(`[eval-live-deploy] quarantined runtime changes in stash: ${stashMessage}\n`);
  return { quarantined: true, statusLines, stashMessage };
}

function evalLiveEnv(baseEnv = process.env, today = currentNewYorkDate()) {
  return {
    ...baseEnv,
    TTP_ACCOUNT_START_OF_DAY_DATE: today,
  };
}

function parseCli(argv) {
  const args = { withWebsocket: false };
  for (const arg of argv) {
    if (arg === '--with-websocket') {
      args.withWebsocket = true;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  return args;
}

function deploy(argv = process.argv.slice(2)) {
  const args = parseCli(argv);
  const today = currentNewYorkDate();
  const env = evalLiveEnv(process.env, today);

  process.stdout.write(`[eval-live-deploy] eval date ${today} America/New_York\n`);
  quarantineRuntimeChanges();

  if (args.withWebsocket) {
    run('pm2', ['startOrReload', 'ecosystem.config.js', '--only', WEBSOCKET_PROCESS, '--update-env'], { env });
  }
  run('pm2', ['startOrReload', 'ecosystem.config.js', '--only', PM2_PROCESS, '--update-env'], { env });
  run('node', ['ogz-meta/gates/eval-live-posture-gate.js', '--pm2', PM2_PROCESS], { env });
}

if (require.main === module) {
  try {
    deploy();
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  RUNTIME_DEPLOY_PATHS,
  currentNewYorkDate,
  evalLiveEnv,
  parseCli,
  quarantineRuntimeChanges,
};
