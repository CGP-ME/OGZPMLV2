#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const childProcess = require('child_process');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const packetDir = __dirname;
const repoRoot = path.resolve(packetDir, '..', '..', '..', '..', '..');
const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
const baseSha = '31f150f9744021f8a092787f755f8123b3abf0a5';
const runnerPath = path.join(repoRoot, 'run-empire-v2.js');
const singletonPath = path.join(repoRoot, 'core', 'SingletonLock.js');
const backtestRunnerPath = path.join(repoRoot, 'core', 'BacktestRunner.js');
const j2ProbePath = path.join(
  repoRoot,
  'ogz-meta',
  'inbox',
  'codex',
  '2026-09-16',
  'astra-era-stop1-j2-singleton',
  'probe-j2-singleton.js'
);

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseSource(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return {
    source,
    ast: acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      allowHashBang: true,
    }),
  };
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}

function classMethodSource(parsed, className, methodName) {
  const classNode = parsed.ast.body.find((node) => (
    node.type === 'ClassDeclaration' && node.id?.name === className
  ));
  assert.ok(classNode, `class ${className} exists`);
  const method = classNode.body.body.find((node) => (
    node.type === 'MethodDefinition'
    && !node.computed
    && node.key?.name === methodName
  ));
  assert.ok(method, `${className}.${methodName} exists`);
  return parsed.source.slice(method.start, method.end);
}

function functionSource(parsed, functionName) {
  const fn = parsed.ast.body.find((node) => (
    node.type === 'FunctionDeclaration' && node.id?.name === functionName
  ));
  assert.ok(fn, `function ${functionName} exists`);
  return parsed.source.slice(fn.start, fn.end);
}

function processCallCount(parsed, methodName) {
  let count = 0;
  walk(parsed.ast, (node) => {
    if (
      node.type === 'CallExpression'
      && node.callee?.type === 'MemberExpression'
      && node.callee.object?.name === 'process'
      && node.callee.property?.name === methodName
    ) {
      count += 1;
    }
  });
  return count;
}

function makeShutdownFixture(runnerParsed, calls, auditEvents, exitCodes, stateSaveResult = { success: true }) {
  const shutdownSource = classMethodSource(runnerParsed, 'OGZPrimeV14Bot', 'shutdown');
  const performSource = classMethodSource(runnerParsed, 'OGZPrimeV14Bot', '_performShutdown');
  const singletonLock = {
    releaseLock() {
      calls.push('singleton.release');
      return true;
    },
  };
  const runtimeAuditSink = {
    redactForOutput(error) {
      return error?.message || String(error);
    },
  };
  const captureRuntimeFatal = (eventType, error, scope, extra) => {
    auditEvents.push({ eventType, code: error?.code || null, scope, cleanup: extra?.cleanup || null });
    return { success: true };
  };
  const Fixture = new Function(
    'captureRuntimeFatal',
    'runtimeAuditSink',
    'singletonLock',
    `'use strict'; return class ShutdownFixture {\n${shutdownSource}\n${performSource}\n};`
  )(captureRuntimeFatal, runtimeAuditSink, singletonLock);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const kraken = {
    async disconnect() {
      calls.push('kraken.disconnect.start');
      await wait(2);
      calls.push('kraken.disconnect.end');
    },
  };
  const alpaca = {
    async disconnect() {
      calls.push('alpaca.disconnect.start');
      await wait(2);
      calls.push('alpaca.disconnect.end');
    },
  };
  const bot = new Fixture();
  Object.assign(bot, {
    startTime: Date.now() - 60_000,
    isRunning: true,
    sessionRouter: {
      krakenAdapter: kraken,
      alpacaAdapter: alpaca,
      stop: () => calls.push('sessionRouter.stop'),
    },
    kraken,
    pipelineSnapshot: { stop: () => calls.push('pipeline.stop') },
    tradingInterval: setInterval(() => {}, 60_000),
    livenessCheckInterval: setInterval(() => {}, 60_000),
    heartbeatInterval: setInterval(() => {}, 60_000),
    dataWatchdogInterval: setInterval(() => {}, 60_000),
    botStateInterval: setInterval(() => {}, 60_000),
    dashboardDepthCoalescer: { clear: () => calls.push('depth.clear') },
    _unsubscribeNtfyTrace: () => calls.push('ntfy.unsubscribe'),
    ws: {
      removeAllListeners: () => calls.push('marketWs.removeListeners'),
      close: () => calls.push('marketWs.close'),
    },
    dashboardWs: {
      removeAllListeners: () => calls.push('dashboardWs.removeListeners'),
      close: () => calls.push('dashboardWs.close'),
    },
    dashboardWsConnected: true,
    mtfAdapter: { destroy: () => calls.push('mtf.destroy') },
    emaCrossover: { destroy: () => calls.push('ema.destroy') },
    maDynamicSR: { destroy: () => calls.push('masr.destroy') },
    liquiditySweep: { destroy: () => calls.push('liquidity.destroy') },
    trai: { traiCore: { shutdown: () => calls.push('trai.shutdown') } },
    riskManager: { shutdown: () => calls.push('risk.shutdown') },
    stateManager: {
      save: () => {
        calls.push('state.save');
        return stateSaveResult;
      },
    },
    patternChecker: {
      async cleanup() {
        calls.push('pattern.cleanup.start');
        await wait(2);
        calls.push('pattern.cleanup.end');
      },
    },
    journalBridge: { destroy: () => calls.push('journal.destroy') },
  });
  return { bot, exitCodes };
}

async function runShutdownSuccessCase(runnerParsed) {
  const calls = [];
  const auditEvents = [];
  const exitCodes = [];
  const originalExit = process.exit;
  process.exit = (code) => {
    calls.push(`process.exit:${code}`);
    exitCodes.push(code);
  };
  try {
    const { bot } = makeShutdownFixture(runnerParsed, calls, auditEvents, exitCodes);
    const first = bot.shutdown(0);
    const second = bot.shutdown(1);
    assert.strictEqual(first, second, 'concurrent shutdown calls share one promise');
    const receipt = await first;
    assert.equal(exitCodes.length, 1);
    assert.equal(exitCodes[0], 1, 'later fatal request upgrades terminal status');
    assert.equal(calls.filter((entry) => entry === 'singleton.release').length, 1);
    assert.equal(receipt.failures.length, 0);
    assert.equal(receipt.completed.includes('state_persistence'), true);
    assert.equal(receipt.completed.includes('pattern_persistence'), true);
    assert.equal(receipt.completed.includes('journal_persistence'), true);
    assert.equal(receipt.completed.at(-1), 'singleton_lock');
    assert.ok(calls.indexOf('kraken.disconnect.end') < calls.indexOf('dashboardWs.close'));
    assert.ok(calls.indexOf('state.save') < calls.indexOf('pattern.cleanup.start'));
    assert.ok(calls.indexOf('pattern.cleanup.end') < calls.indexOf('journal.destroy'));
    assert.ok(calls.indexOf('journal.destroy') < calls.indexOf('singleton.release'));
    assert.ok(calls.indexOf('singleton.release') < calls.indexOf('process.exit:1'));
    assert.equal(auditEvents.length, 0);
    return {
      oneShutdownPromise: true,
      exitCodeUpgradedToFailure: true,
      statePatternJournalLockOrder: true,
      servicesAwaitedBeforePersistence: true,
      singletonReleasedOnceAndLast: true,
    };
  } finally {
    process.exit = originalExit;
  }
}

async function runShutdownFailureCase(runnerParsed) {
  const calls = [];
  const auditEvents = [];
  const exitCodes = [];
  const originalExit = process.exit;
  process.exit = (code) => {
    calls.push(`process.exit:${code}`);
    exitCodes.push(code);
  };
  try {
    const { bot } = makeShutdownFixture(
      runnerParsed,
      calls,
      auditEvents,
      exitCodes,
      { success: false, code: 'STATE_FIXTURE_FAILED', error: 'fixture state write failed' }
    );
    const receipt = await bot.shutdown(0);
    assert.deepEqual(exitCodes, [1]);
    assert.deepEqual(receipt.failures.map((entry) => entry.name), ['state_persistence']);
    assert.equal(auditEvents.some((event) => event.cleanup === 'state_persistence'), true);
    assert.ok(calls.indexOf('state.save') < calls.indexOf('pattern.cleanup.start'));
    assert.ok(calls.indexOf('journal.destroy') < calls.indexOf('singleton.release'));
    assert.ok(calls.indexOf('singleton.release') < calls.indexOf('process.exit:1'));
    return {
      cleanupFailureReported: true,
      laterCleanupStillCompleted: true,
      terminalStatusNonzero: true,
      lockReleasedAfterFailure: true,
    };
  } finally {
    process.exit = originalExit;
  }
}

function buildRuntimeHandlerInstaller(runnerParsed, fakeProcess, lifecycle, audits, diagnostics) {
  const source = functionSource(runnerParsed, 'installRuntimeLifecycleHandlers');
  const captureRuntimeFatal = (eventType, error, scope, extra) => {
    audits.push({ eventType, message: error?.message || String(error), scope, promise: extra?.promise || null });
  };
  const runtimeAuditSink = {
    redactForOutput: (input) => input?.message || String(input),
  };
  const terminateOnUncaughtException = function terminateOnUncaughtException() {};
  const terminateOnUnhandledRejection = function terminateOnUnhandledRejection() {};
  fakeProcess.on('uncaughtException', diagnostics.instrumentationException);
  fakeProcess.on('unhandledRejection', diagnostics.instrumentationRejection);
  fakeProcess.on('uncaughtException', terminateOnUncaughtException);
  fakeProcess.on('unhandledRejection', terminateOnUnhandledRejection);
  const install = new Function(
    'process',
    'runtimeLifecycle',
    'captureRuntimeFatal',
    'runtimeAuditSink',
    'terminateOnUncaughtException',
    'terminateOnUnhandledRejection',
    `${source}; return installRuntimeLifecycleHandlers;`
  )(
    fakeProcess,
    lifecycle,
    captureRuntimeFatal,
    runtimeAuditSink,
    terminateOnUncaughtException,
    terminateOnUnhandledRejection
  );
  return { install, terminateOnUncaughtException, terminateOnUnhandledRejection };
}

function runRuntimeHandlerCases(runnerParsed) {
  const fakeProcess = new EventEmitter();
  const lifecycle = { bot: null };
  const audits = [];
  const shutdownCodes = [];
  const diagnostics = {
    instrumentationException: () => {},
    instrumentationRejection: () => {},
  };
  const { install, terminateOnUncaughtException, terminateOnUnhandledRejection } = buildRuntimeHandlerInstaller(
    runnerParsed,
    fakeProcess,
    lifecycle,
    audits,
    diagnostics
  );
  const bot = { shutdown: (code) => shutdownCodes.push(code) };
  install(bot);

  assert.equal(fakeProcess.listeners('uncaughtException').includes(terminateOnUncaughtException), false);
  assert.equal(fakeProcess.listeners('unhandledRejection').includes(terminateOnUnhandledRejection), false);
  assert.equal(fakeProcess.listeners('uncaughtException').includes(diagnostics.instrumentationException), true);
  assert.equal(fakeProcess.listeners('unhandledRejection').includes(diagnostics.instrumentationRejection), true);
  assert.equal(fakeProcess.listenerCount('SIGINT'), 1);
  assert.equal(fakeProcess.listenerCount('SIGTERM'), 1);
  assert.equal(lifecycle.bot, bot);

  fakeProcess.emit('unhandledRejection', new Error('fixture rejection'), Promise.resolve());
  assert.deepEqual(shutdownCodes, [], 'reported rejection does not acquire shutdown authority');
  fakeProcess.emit('uncaughtException', new Error('fixture exception'));
  assert.deepEqual(shutdownCodes, [1]);
  fakeProcess.emit('SIGINT');
  assert.deepEqual(shutdownCodes, [1, 0]);
  fakeProcess.emit('SIGINT');
  assert.deepEqual(shutdownCodes, [1, 0], 'SIGINT handler is single-use');
  assert.deepEqual(audits.map((event) => event.eventType), ['unhandledRejection', 'uncaughtException']);

  return {
    bootstrapFatalListenersRemoved: true,
    instrumentationListenersPreserved: true,
    sigintAndSigtermOwnedByRunner: true,
    uncaughtExceptionRequestsFailureShutdown: true,
    unhandledRejectionReportedWithoutShutdown: true,
  };
}

async function runPreRuntimeShutdownCase(runnerParsed) {
  const source = functionSource(runnerParsed, 'requestRuntimeShutdown');
  const runCase = async (ownsLock) => {
    const calls = [];
    const fakeProcess = { exit: (code) => calls.push(`exit:${code}`) };
    const runtimeLifecycle = {
      bot: null,
      shutdownPromise: null,
      singletonLock: {
        hasLock: () => ownsLock,
        releaseLock: () => { calls.push('release'); return true; },
      },
    };
    const request = new Function(
      'process',
      'runtimeLifecycle',
      'captureRuntimeFatal',
      `${source}; return requestRuntimeShutdown;`
    )(fakeProcess, runtimeLifecycle, () => assert.fail('successful pre-runtime shutdown must not report cleanup failure'));
    await request(1);
    return calls;
  };

  const ownedCalls = await runCase(true);
  const unownedCalls = await runCase(false);
  assert.deepEqual(ownedCalls, ['release', 'exit:1']);
  assert.deepEqual(unownedCalls, ['exit:1']);
  return {
    ownedLockReleasedBeforeExit: true,
    unownedLockLeftUntouched: true,
    exitCode: 1,
  };
}

function runSingletonOwnershipCase() {
  const { OGZSingletonLock } = require(singletonPath);
  const scratchRoot = fs.mkdtempSync(path.join(repoRoot, 'data', '.ogz-j3-lifecycle-'));
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = scratchRoot;
  const watchedEvents = ['exit', 'SIGINT', 'SIGTERM', 'SIGQUIT', 'uncaughtException', 'unhandledRejection'];
  const before = Object.fromEntries(watchedEvents.map((event) => [event, process.listenerCount(event)]));
  const failures = [];
  try {
    const lock = new OGZSingletonLock('j3-lifecycle-probe', {
      onIntegrityFailure: (error) => failures.push({ code: error.lockCode, message: error.message }),
    });
    assert.equal(lock.acquireLock(), true);
    const afterAcquire = Object.fromEntries(watchedEvents.map((event) => [event, process.listenerCount(event)]));
    assert.deepEqual(afterAcquire, before, 'SingletonLock installs no process lifecycle listeners');
    fs.unlinkSync(lock.lockFile);
    assert.equal(lock.checkLockIntegrity(), true);
    assert.deepEqual(failures.map((failure) => failure.code), ['SINGLETON_LOCK_MISSING']);
    assert.equal(lock.releaseLock(), true);
    return {
      processListenerCountsUnchanged: true,
      integrityFailureReportedToOwner: true,
      singletonDidNotTerminateProcess: true,
    };
  } finally {
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
}

function runSourceOwnershipChecks(singletonParsed, runnerParsed, backtestParsed) {
  assert.equal(processCallCount(singletonParsed, 'on'), 0);
  assert.equal(processCallCount(singletonParsed, 'once'), 0);
  assert.equal(processCallCount(singletonParsed, 'exit'), 0);
  assert.equal(processCallCount(backtestParsed, 'exit'), 0);
  const backtestSource = backtestParsed.source;
  assert.match(backtestSource, /await this\.ctx\.shutdown\(0\)/);
  assert.match(backtestSource, /await this\.ctx\.shutdown\(1\)/);
  assert.equal(processCallCount(runnerParsed, 'exit'), 2, 'only pre-runtime and orderly runner owners terminate');
  return {
    singletonProcessHandlers: 0,
    singletonProcessExits: 0,
    backtestProcessExits: 0,
    runnerTerminalExitSites: 2,
  };
}

function runJ2Regression() {
  const output = path.join('/tmp', `j2-from-j3-${process.pid}.json`);
  const result = childProcess.spawnSync(process.execPath, [j2ProbePath, output], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const receipt = JSON.parse(fs.readFileSync(output, 'utf8'));
  fs.unlinkSync(output);
  return {
    result: receipt.result,
    freshRounds: receipt.freshContention.rounds,
    staleRounds: receipt.staleOwnerContention.rounds,
    everyFreshRoundExactlyOneWinner: receipt.freshContention.everyRoundExactlyOneWinner,
    everyStaleRoundExactlyOneWinner: receipt.staleOwnerContention.everyRoundExactlyOneWinner,
    everyLoserRefused: receipt.freshContention.everyLoserRefused && receipt.staleOwnerContention.everyLoserRefused,
  };
}

async function main() {
  const runnerParsed = parseSource(runnerPath);
  const singletonParsed = parseSource(singletonPath);
  const backtestParsed = parseSource(backtestRunnerPath);
  const receipt = {
    baseSha,
    node: process.version,
    sourceFiles: Object.fromEntries([
      runnerPath,
      singletonPath,
      backtestRunnerPath,
      j2ProbePath,
      __filename,
    ].map((filePath) => [path.relative(repoRoot, filePath), sha256File(filePath)])),
    operations: 'Local source-exact lifecycle functions, fake services, real SingletonLock, and J2 child-process contention only; no bot boot, Jest, provider, broker, notification, network, PM2, or trading operation.',
    result: 'PASS',
    sourceOwnership: runSourceOwnershipChecks(singletonParsed, runnerParsed, backtestParsed),
    singletonOwnership: runSingletonOwnershipCase(),
    runtimeHandlers: runRuntimeHandlerCases(runnerParsed),
    preRuntimeShutdown: await runPreRuntimeShutdownCase(runnerParsed),
    orderlyShutdown: await runShutdownSuccessCase(runnerParsed),
    cleanupFailure: await runShutdownFailureCase(runnerParsed),
    j2Regression: runJ2Regression(),
  };
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
