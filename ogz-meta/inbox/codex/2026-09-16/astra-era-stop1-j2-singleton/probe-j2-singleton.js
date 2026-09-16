#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const packetDir = __dirname;
const repoRoot = path.resolve(packetDir, '..', '..', '..', '..', '..');
const scratchParent = process.env.J2_PROBE_SCRATCH_PARENT
  ? path.resolve(process.env.J2_PROBE_SCRATCH_PARENT)
  : path.join(repoRoot, 'data');
fs.mkdirSync(scratchParent, { recursive: true });
const scratchRoot = fs.mkdtempSync(path.join(scratchParent, '.ogz-j2-singleton-'));
const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
const botName = 'j2-probe';
const lockBasename = `.${botName}.lock`;
const baseSha = '8fa8d2b472a7ed63d1e3910c5930b8bb79ecc33f';

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeFixture(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFile(filePath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return;
    await wait(10);
  }
  throw new Error(`Timed out waiting for fixture file: ${filePath}`);
}

const workerPath = path.join(scratchRoot, 'worker.js');
writeFixture(workerPath, String.raw`
'use strict';
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { OGZSingletonLock } = require(process.env.J2_SINGLETON_MODULE);
const action = process.env.J2_ACTION;
const dataDir = process.env.DATA_DIR;
const botName = process.env.J2_BOT_NAME;

if (action === 'release-only') {
  const lock = new OGZSingletonLock(botName);
  lock.releaseLock();
  process.exit(0);
}

if (action === 'hold-reclaim-mutex') {
  const reclaimFile = path.join(dataDir, '.' + botName + '.lock.reclaim-mutex');
  const fd = fs.openSync(reclaimFile, 'a+', 0o600);
  const flock = childProcess.spawnSync('/usr/bin/flock', ['--nonblock', '3'], {
    stdio: ['ignore', 'ignore', 'pipe', fd]
  });
  if (flock.status !== 0) process.exit(2);
  fs.writeFileSync(process.env.J2_RESULT_PATH, JSON.stringify({ mutexHeld: true, pid: process.pid }));
  setInterval(() => {}, 1000);
} else {

const startAt = Number(process.env.J2_START_AT || Date.now());
const waitArray = new Int32Array(new SharedArrayBuffer(4));
while (Date.now() < startAt) {
  Atomics.wait(waitArray, 0, 0, Math.min(10, startAt - Date.now()));
}

const lock = new OGZSingletonLock(botName);
const acquired = lock.acquireLock();
const lockFile = path.join(dataDir, '.' + botName + '.lock');
const snapshot = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, 'utf8')) : null;
const resultPath = process.env.J2_RESULT_PATH;
fs.writeFileSync(resultPath, JSON.stringify({
  acquired,
  hasLock: lock.hasLock(),
  pid: process.pid,
  snapshotMatchesOwner: snapshot?.pid === process.pid && snapshot?.token === lock.lockToken,
  lockExists: fs.existsSync(lockFile)
}));

setTimeout(() => {
  lock.releaseLock();
  process.exit(0);
}, Number(process.env.J2_HOLD_MS || 300));
}
`);

function spawnWorker({ dataDir, action = 'acquire', startAt = Date.now(), holdMs = 300, extraEnv = {} }) {
  const resultPath = path.join(dataDir, `result-${crypto.randomUUID()}.json`);
  const stdoutPath = `${resultPath}.stdout`;
  const stderrPath = `${resultPath}.stderr`;
  const stdoutFd = fs.openSync(stdoutPath, 'w');
  const stderrFd = fs.openSync(stderrPath, 'w');
  let child;
  try {
    child = childProcess.spawn(process.execPath, [workerPath], {
      cwd: repoRoot,
      stdio: ['ignore', stdoutFd, stderrFd],
      env: {
        PATH: process.env.PATH || '/usr/bin:/bin',
        DATA_DIR: dataDir,
        J2_ACTION: action,
        J2_BOT_NAME: botName,
        J2_HOLD_MS: String(holdMs),
        J2_RESULT_PATH: resultPath,
        J2_SINGLETON_MODULE: path.join(repoRoot, 'core', 'SingletonLock.js'),
        J2_START_AT: String(startAt),
        ...extraEnv,
      },
    });
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
  }

  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status, signal) => {
      resolve({
        status,
        signal,
        stdout: fs.readFileSync(stdoutPath, 'utf8'),
        stderr: fs.readFileSync(stderrPath, 'utf8'),
        resultPath,
        result: fs.existsSync(resultPath) ? readJson(resultPath) : null,
      });
    });
  });

  return { child, resultPath, completed };
}

function listTransientLockArtifacts(dataDir) {
  return fs.readdirSync(dataDir).filter((name) =>
    name.startsWith(lockBasename) && name !== `${lockBasename}.reclaim-mutex`
  );
}

async function runRace(label, withStaleOwner) {
  const dataDir = path.join(scratchRoot, label);
  fs.mkdirSync(dataDir, { recursive: true });
  const lockFile = path.join(dataDir, lockBasename);
  if (withStaleOwner) {
    fs.writeFileSync(lockFile, `${JSON.stringify({
      pid: 2147483646,
      botName,
      startTime: 1,
      token: `stale-${label}`,
      hostname: 'fixture',
      nodeVersion: process.version,
      platform: process.platform,
    }, null, 2)}\n`, { mode: 0o600 });
  }

  const startAt = Date.now() + 500;
  const workers = Array.from({ length: 6 }, () => spawnWorker({ dataDir, startAt, holdMs: 350 }));
  const outcomes = await Promise.all(workers.map((worker) => worker.completed));
  const winners = outcomes.filter((outcome) => outcome.status === 0 && outcome.result?.acquired === true);
  const losers = outcomes.filter((outcome) => outcome.status === 1 && outcome.result === null);

  assert.equal(winners.length, 1, `${label}: exactly one winner`);
  assert.equal(losers.length, workers.length - 1, `${label}: every other contender refused`);
  assert.equal(winners[0].result.hasLock, true, `${label}: winner observed ownership`);
  assert.equal(winners[0].result.snapshotMatchesOwner, true, `${label}: published metadata belongs to winner`);
  assert.equal(outcomes.every((outcome) => !outcome.stderr.includes('SyntaxError')), true, `${label}: no partial JSON observed`);
  assert.deepEqual(listTransientLockArtifacts(dataDir), [], `${label}: release removed lock and transient files`);
  assert.equal(
    fs.existsSync(path.join(dataDir, `${lockBasename}.reclaim-mutex`)),
    withStaleOwner,
    `${label}: reclaim mutex persistence matches exercised path`
  );

  return {
    contenders: workers.length,
    winners: winners.length,
    refused: losers.length,
    winnerOwnedPublishedMetadata: winners[0].result.snapshotMatchesOwner,
    noPartialJsonObserved: true,
    artifactsAfterRelease: [],
    persistentReclaimMutex: withStaleOwner,
  };
}

async function runOwnerReleaseCase() {
  const dataDir = path.join(scratchRoot, 'owner-release');
  fs.mkdirSync(dataDir, { recursive: true });
  const ownerResultPath = path.join(dataDir, 'owner.json');
  const owner = spawnWorker({ dataDir, startAt: Date.now() + 200, holdMs: 1200 });
  owner.child.once('error', () => {});

  await waitForFile(owner.resultPath);
  fs.copyFileSync(owner.resultPath, ownerResultPath);
  const ownerResult = readJson(ownerResultPath);
  const lockFile = path.join(dataDir, lockBasename);
  const before = readJson(lockFile);

  const nonOwner = spawnWorker({ dataDir, action: 'release-only' });
  const nonOwnerOutcome = await nonOwner.completed;
  assert.equal(nonOwnerOutcome.status, 0);
  assert.equal(fs.existsSync(lockFile), true, 'non-owner release kept owner lock');
  const after = readJson(lockFile);
  assert.equal(after.pid, ownerResult.pid);
  assert.equal(after.token, before.token);

  const ownerOutcome = await owner.completed;
  assert.equal(ownerOutcome.status, 0);
  assert.equal(fs.existsSync(lockFile), false, 'owner release removed lock');

  const reacquire = spawnWorker({ dataDir, startAt: Date.now(), holdMs: 50 });
  const reacquireOutcome = await reacquire.completed;
  assert.equal(reacquireOutcome.status, 0);
  assert.equal(reacquireOutcome.result?.acquired, true);
  assert.equal(fs.existsSync(lockFile), false);

  return {
    nonOwnerStatus: nonOwnerOutcome.status,
    nonOwnerPreservedOwnerIdentity: true,
    ownerReleased: true,
    reacquiredAfterRelease: true,
  };
}

async function runBacktestSkipCase() {
  const dataDir = path.join(scratchRoot, 'backtest-skip');
  fs.mkdirSync(dataDir, { recursive: true });
  const worker = spawnWorker({
    dataDir,
    holdMs: 20,
    extraEnv: {
      CANDLE_SOURCE: 'file',
      EXECUTION_MODE: 'backtest',
      BACKTEST_SILENT: 'true',
    },
  });
  const outcome = await worker.completed;
  assert.equal(outcome.status, 0);
  assert.equal(outcome.result?.acquired, true);
  assert.equal(outcome.result?.hasLock, false);
  assert.equal(outcome.result?.lockExists, false);
  assert.deepEqual(listTransientLockArtifacts(dataDir), []);
  return { status: outcome.status, skippedWithoutLockFile: true };
}

async function runUnreadableOwnerCase() {
  const dataDir = path.join(scratchRoot, 'unreadable-owner');
  fs.mkdirSync(dataDir, { recursive: true });
  const lockFile = path.join(dataDir, lockBasename);
  const original = '{incomplete-owner-evidence';
  fs.writeFileSync(lockFile, original, { mode: 0o600 });
  const worker = spawnWorker({ dataDir, holdMs: 20 });
  const outcome = await worker.completed;
  assert.equal(outcome.status, 1);
  assert.equal(outcome.result, null);
  assert.equal(fs.readFileSync(lockFile, 'utf8'), original);
  assert.match(outcome.stderr, /existing lock metadata is unreadable/);
  return { status: outcome.status, ambiguousOwnerPreserved: true, noAcquisitionClaimed: true };
}

async function runKilledReclaimerCase() {
  const label = 'killed-reclaimer';
  const dataDir = path.join(scratchRoot, label);
  fs.mkdirSync(dataDir, { recursive: true });
  const holder = spawnWorker({ dataDir, action: 'hold-reclaim-mutex' });
  await waitForFile(holder.resultPath);
  assert.equal(readJson(holder.resultPath).mutexHeld, true);
  holder.child.kill('SIGKILL');
  const holderOutcome = await holder.completed;
  assert.equal(holderOutcome.signal, 'SIGKILL');

  const recovery = await runRace(label, true);
  assert.equal(recovery.winners, 1);
  assert.equal(recovery.refused, recovery.contenders - 1);
  assert.equal(recovery.persistentReclaimMutex, true);
  return {
    killedHolderSignal: holderOutcome.signal,
    kernelMutexReleasedAfterHolderDeath: true,
    recoveryWinnerCount: recovery.winners,
    recoveryRefusedCount: recovery.refused,
  };
}

async function main() {
  const flockVersionResult = childProcess.spawnSync('/usr/bin/flock', ['--version'], { encoding: 'utf8' });
  assert.equal(flockVersionResult.status, 0, 'target host provides /usr/bin/flock');
  const freshRaces = [];
  const staleRaces = [];
  for (let index = 0; index < 8; index += 1) {
    freshRaces.push(await runRace(`fresh-${index}`, false));
    staleRaces.push(await runRace(`stale-${index}`, true));
  }

  const receipt = {
    baseSha,
    node: process.version,
    filesystem: {
      platform: process.platform,
      scratchParent,
      device: fs.statSync(scratchParent).dev,
      sameDirectoryPublish: true,
      flockPath: '/usr/bin/flock',
      flockVersion: flockVersionResult.stdout.trim(),
    },
    sourceFiles: Object.fromEntries([
      path.join(repoRoot, 'core', 'SingletonLock.js'),
      path.join(repoRoot, 'core', 'AtomicWrite.js'),
      path.join(repoRoot, 'run-empire-v2.js'),
      __filename,
    ].map((filePath) => [path.relative(repoRoot, filePath), sha256File(filePath)])),
    operations: 'Local child-process SingletonLock contention only; no bot entrypoint, Jest, provider, broker, notification, network, PM2, or trading operation.',
    result: 'PASS',
    freshContention: {
      rounds: freshRaces.length,
      contendersPerRound: freshRaces[0].contenders,
      everyRoundExactlyOneWinner: freshRaces.every((round) => round.winners === 1),
      everyLoserRefused: freshRaces.every((round) => round.refused === round.contenders - 1),
      everyWinnerOwnedPublishedMetadata: freshRaces.every((round) => round.winnerOwnedPublishedMetadata),
      noPartialJsonObserved: freshRaces.every((round) => round.noPartialJsonObserved),
      noArtifactsAfterRelease: freshRaces.every((round) => round.artifactsAfterRelease.length === 0),
    },
    staleOwnerContention: {
      rounds: staleRaces.length,
      contendersPerRound: staleRaces[0].contenders,
      everyRoundExactlyOneWinner: staleRaces.every((round) => round.winners === 1),
      everyLoserRefused: staleRaces.every((round) => round.refused === round.contenders - 1),
      everyWinnerOwnedPublishedMetadata: staleRaces.every((round) => round.winnerOwnedPublishedMetadata),
      noPartialJsonObserved: staleRaces.every((round) => round.noPartialJsonObserved),
      noArtifactsAfterRelease: staleRaces.every((round) => round.artifactsAfterRelease.length === 0),
    },
    ownerRelease: await runOwnerReleaseCase(),
    backtestSkip: await runBacktestSkipCase(),
    unreadableOwner: await runUnreadableOwnerCase(),
    killedReclaimer: await runKilledReclaimerCase(),
  };

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify({ ...receipt, sourceFiles: receipt.sourceFiles }, null, 2));
  fs.rmSync(scratchRoot, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
