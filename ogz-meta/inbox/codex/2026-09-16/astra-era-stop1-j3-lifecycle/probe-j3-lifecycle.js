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
const originalBaseSha = '31f150f9744021f8a092787f755f8123b3abf0a5';
const correctionBaseSha = 'b7bf511e4d8fc12af48de200cea4f166a5548dc4';
const runnerPath = path.join(repoRoot, 'run-empire-v2.js');
const singletonPath = path.join(repoRoot, 'core', 'SingletonLock.js');
const backtestRunnerPath = path.join(repoRoot, 'core', 'BacktestRunner.js');
const sessionRouterPath = path.join(repoRoot, 'core', 'SessionRouter.js');
const pipelineSnapshotPath = path.join(repoRoot, 'core', 'PipelineSnapshot.js');
const webSocketManagerPath = path.join(repoRoot, 'core', 'WebSocketManager.js');
const patternMemoryPath = path.join(repoRoot, 'core', 'UnifiedPatternMemory.js');
const enhancedPatternPath = path.join(repoRoot, 'core', 'EnhancedPatternRecognition.js');
const tradeJournalPath = path.join(repoRoot, 'core', 'TradeJournal.js');
const tradeJournalBridgePath = path.join(repoRoot, 'core', 'TradeJournalBridge.js');
const resilientWebSocketPath = path.join(repoRoot, 'foundation', 'ResilientWebSocket.js');
const alpacaAdapterPath = path.join(repoRoot, 'brokers', 'AlpacaAdapter.js');
const krakenAdapterPath = path.join(repoRoot, 'kraken_adapter_simple.js');
const krakenWrapperPath = path.join(repoRoot, 'brokers', 'KrakenIBrokerAdapter.js');
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

function classFromMethods(parsed, className, methodNames, bindings = {}) {
  const methodSources = methodNames.map((methodName) => classMethodSource(parsed, className, methodName));
  const bindingNames = Object.keys(bindings);
  return new Function(
    ...bindingNames,
    `'use strict'; return class ${className}Fixture {\n${methodSources.join('\n')}\n};`
  )(...bindingNames.map((name) => bindings[name]));
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

function makeShutdownFixture(
  runnerParsed,
  calls,
  auditEvents,
  exitCodes,
  stateSaveResult = { success: true },
  singletonOverride = null
) {
  const trackSource = classMethodSource(runnerParsed, 'OGZPrimeV14Bot', '_trackRuntimeOperation');
  const settleSource = classMethodSource(runnerParsed, 'OGZPrimeV14Bot', '_settleRuntimeOperations');
  const closeSocketSource = classMethodSource(runnerParsed, 'OGZPrimeV14Bot', '_closeSocketForShutdown');
  const shutdownSource = classMethodSource(runnerParsed, 'OGZPrimeV14Bot', 'shutdown');
  const performSource = classMethodSource(runnerParsed, 'OGZPrimeV14Bot', '_performShutdown');
  const singletonLock = singletonOverride || {
    ownershipState: 'owned',
    hasLock: () => true,
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
    'WebSocket',
    `'use strict'; return class ShutdownFixture {\n${trackSource}\n${settleSource}\n${closeSocketSource}\n${shutdownSource}\n${performSource}\n};`
  )(captureRuntimeFatal, runtimeAuditSink, singletonLock, { CLOSED: 3 });

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const kraken = {
    id: 'kraken',
    async disconnect() {
      calls.push('kraken.disconnect.start');
      await wait(2);
      calls.push('kraken.disconnect.end');
      return { success: true };
    },
  };
  const alpaca = {
    id: 'alpaca',
    async disconnect() {
      calls.push('alpaca.disconnect.start');
      await wait(2);
      calls.push('alpaca.disconnect.end');
      return { success: true };
    },
  };
  const bot = new Fixture();
  Object.assign(bot, {
    startTime: Date.now() - 60_000,
    isRunning: true,
    _runtimeOperations: new Map(),
    _shutdownRequested: false,
    sessionRouter: {
      krakenAdapter: kraken,
      alpacaAdapter: alpaca,
      stop: async () => { calls.push('sessionRouter.stop'); return { success: true }; },
    },
    kraken,
    pipelineSnapshot: { stop: () => { calls.push('pipeline.stop'); return { success: true }; } },
    tradingInterval: setInterval(() => {}, 60_000),
    livenessCheckInterval: setInterval(() => {}, 60_000),
    heartbeatInterval: setInterval(() => {}, 60_000),
    dataWatchdogInterval: setInterval(() => {}, 60_000),
    botStateInterval: setInterval(() => {}, 60_000),
    dashboardDepthCoalescer: { clear: () => calls.push('depth.clear') },
    _unsubscribeNtfyTrace: () => calls.push('ntfy.unsubscribe'),
    ws: null,
    webSocketManager: { stop: async () => { calls.push('dashboard.stop'); return { success: true }; } },
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
    assert.ok(calls.indexOf('kraken.disconnect.end') < calls.indexOf('dashboard.stop'));
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function runInflightSettlementCase(runnerParsed) {
  const calls = [];
  const auditEvents = [];
  const exitCodes = [];
  const originalExit = process.exit;
  process.exit = (code) => exitCodes.push(code);
  try {
    const { bot } = makeShutdownFixture(runnerParsed, calls, auditEvents, exitCodes);
    const work = deferred();
    bot._trackRuntimeOperation('broker_order_ack', async () => {
      calls.push('work.start');
      await work.promise;
      calls.push('work.finish');
    });
    await new Promise((resolve) => setImmediate(resolve));
    const shutdownPromise = bot.shutdown(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.includes('state.save'), false, 'persistence waits for dispatched work');
    work.resolve();
    const receipt = await shutdownPromise;
    assert.equal(receipt.failures.length, 0);
    assert.ok(calls.indexOf('work.finish') < calls.indexOf('state.save'));
    assert.deepEqual(exitCodes, [0]);
    return { dispatchedWorkSettledBeforePersistence: true };
  } finally {
    process.exit = originalExit;
  }
}

async function runCleanupIsolationCase(runnerParsed) {
  const calls = [];
  const auditEvents = [];
  const exitCodes = [];
  const originalExit = process.exit;
  process.exit = (code) => exitCodes.push(code);
  try {
    const { bot } = makeShutdownFixture(runnerParsed, calls, auditEvents, exitCodes);
    bot.sessionRouter.krakenAdapter.disconnect = async () => {
      calls.push('kraken.disconnect.failed');
      throw Object.assign(new Error('kraken fixture disconnect failed'), { code: 'KRAKEN_FIXTURE_FAILED' });
    };
    const receipt = await bot.shutdown(0);
    assert.deepEqual(exitCodes, [1]);
    assert.ok(calls.includes('kraken.disconnect.failed'));
    assert.ok(calls.includes('alpaca.disconnect.end'), 'later adapter cleanup still ran');
    assert.ok(calls.includes('state.save'), 'persistence still ran');
    assert.ok(calls.includes('singleton.release'), 'lock cleanup still ran');
    assert.equal(receipt.failures.some((failure) => failure.name.startsWith('broker_disconnect_')), true);
    return { failedServiceDidNotSkipLaterCleanup: true };
  } finally {
    process.exit = originalExit;
  }
}

async function runSkippedLockShutdownCase(runnerParsed) {
  const { OGZSingletonLock } = require(singletonPath);
  const scratchRoot = fs.mkdtempSync(path.join(repoRoot, 'data', '.ogz-j3-skip-'));
  const previous = {
    DATA_DIR: process.env.DATA_DIR,
    CANDLE_SOURCE: process.env.CANDLE_SOURCE,
    EXECUTION_MODE: process.env.EXECUTION_MODE,
    BACKTEST_SILENT: process.env.BACKTEST_SILENT,
  };
  const lockName = 'j3-skipped-lock-probe';
  const lockFile = path.join(scratchRoot, `.${lockName}.lock`);
  const foreignRecord = `${JSON.stringify({ pid: process.pid, token: 'foreign-owner', startTime: 1 })}\n`;
  fs.writeFileSync(lockFile, foreignRecord, { mode: 0o600 });
  process.env.DATA_DIR = scratchRoot;
  process.env.CANDLE_SOURCE = 'file';
  process.env.EXECUTION_MODE = 'backtest';
  process.env.BACKTEST_SILENT = 'true';
  const lock = new OGZSingletonLock(lockName);
  assert.equal(lock.acquireLock(), true);
  assert.equal(lock.ownershipState, 'skipped');

  const calls = [];
  const auditEvents = [];
  const exitCodes = [];
  const originalExit = process.exit;
  process.exit = (code) => exitCodes.push(code);
  try {
    const { bot } = makeShutdownFixture(
      runnerParsed,
      calls,
      auditEvents,
      exitCodes,
      { success: true },
      lock
    );
    const receipt = await bot.shutdown(0);
    assert.deepEqual(exitCodes, [0]);
    assert.equal(receipt.failures.length, 0);
    assert.equal(fs.readFileSync(lockFile, 'utf8'), foreignRecord);
    return { skippedAcquisitionExitedZero: true, foreignOwnerPreserved: true };
  } finally {
    process.exit = originalExit;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
}

async function runBacktestDispatchCases(runnerParsed) {
  const dispatchSource = classMethodSource(runnerParsed, 'OGZPrimeV14Bot', 'loadHistoricalDataAndBacktest');
  const trackSource = classMethodSource(runnerParsed, 'OGZPrimeV14Bot', '_trackRuntimeOperation');
  const Fixture = new Function(
    'resolvedConfig',
    `'use strict'; return class BacktestDispatchFixture {\n${trackSource}\n${dispatchSource}\n};`
  )({ config: { mode: { backtest: true } } });

  const runCase = async (backtestResult) => {
    const bot = new Fixture();
    bot._runtimeOperations = new Map();
    bot._shutdownRequested = false;
    bot.priceHistory = [];
    bot.storeTimeframeCandle = () => {};
    bot.handleMarketData = () => {};
    bot.run15mTradingCycle = () => {};
    bot.tradingPair = 'BTC-USD';
    bot.candleTimeframe = '15m';
    bot.config = { enableBacktestMode: true };
    const shutdownCodes = [];
    bot.shutdown = async (code) => { shutdownCodes.push(code); return { exitCode: code }; };
    bot.backtestRunner = {
      ctx: {},
      loadHistoricalDataAndBacktest: async () => backtestResult,
    };
    const returned = await bot.loadHistoricalDataAndBacktest();
    return { returned, shutdownCodes };
  };

  const success = await runCase({ success: true, exitCode: 0 });
  const failure = await runCase({ success: false, exitCode: 1, error: 'fixture failure' });
  assert.deepEqual(success.shutdownCodes, [0]);
  assert.deepEqual(failure.shutdownCodes, [1]);
  assert.equal(success.returned.success, true);
  assert.equal(failure.returned.error, 'fixture failure');
  return { successAndFailureReachRunnerShutdown: true, originalFailurePreserved: true };
}

async function runSignalChild(runnerParsed, signal) {
  const keepAlive = setInterval(() => {}, 60_000);
  const lifecycle = { bot: null };
  const diagnostics = {
    instrumentationException: () => {},
    instrumentationRejection: () => {},
  };
  const { install } = buildRuntimeHandlerInstaller(
    runnerParsed,
    process,
    lifecycle,
    [],
    diagnostics
  );
  let shutdownPromise = null;
  install({
    shutdown() {
      if (shutdownPromise) return shutdownPromise;
      process.stdout.write('cleanup-start\n');
      shutdownPromise = new Promise((resolve) => {
        setTimeout(() => {
          clearInterval(keepAlive);
          process.stdout.write('cleanup-finished\n');
          resolve({ exitCode: 0 });
          process.exit(0);
        }, 150);
      });
      return shutdownPromise;
    },
  });
  process.stdout.write('ready\n');
  setImmediate(() => {
    process.kill(process.pid, signal);
    setTimeout(() => process.kill(process.pid, signal), 20);
  });
}

async function runRepeatedOsSignalCase(signal) {
  const child = childProcess.spawnSync(process.execPath, [__filename, '--signal-child', signal], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.deepEqual(
    { code: child.status, signal: child.signal },
    { code: 0, signal: null },
    `${signal} repeated signal must not bypass cleanup: ${child.stdout} ${child.stderr}`
  );
  assert.match(child.stdout, /ready/);
  assert.match(child.stdout, /cleanup-start/);
  assert.match(child.stdout, /cleanup-finished/);
  assert.equal(child.stderr, '');
  return { signal, cleanupFinished: true, defaultSignalTerminationPrevented: true };
}

async function runRepeatedOsSignalCases() {
  return {
    sigint: await runRepeatedOsSignalCase('SIGINT'),
    sigterm: await runRepeatedOsSignalCase('SIGTERM'),
  };
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
  assert.deepEqual(shutdownCodes, [1, 0, 0], 'repeated SIGINT reuses the runner shutdown owner');
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
  const monitorErrors = [];
  try {
    const lock = new OGZSingletonLock('j3-lifecycle-probe', {
      onIntegrityFailure: (error) => failures.push({ code: error.lockCode, message: error.message }),
      onMonitorError: (error) => monitorErrors.push({ code: error.lockCode, message: error.message }),
    });
    assert.equal(lock.acquireLock(), true);
    const afterAcquire = Object.fromEntries(watchedEvents.map((event) => [event, process.listenerCount(event)]));
    assert.deepEqual(afterAcquire, before, 'SingletonLock installs no process lifecycle listeners');
    const ownedRecord = fs.readFileSync(lock.lockFile, 'utf8');
    fs.writeFileSync(lock.lockFile, '{invalid-json', 'utf8');
    assert.equal(lock.checkLockIntegrity(), true);
    assert.deepEqual(monitorErrors.map((failure) => failure.code), ['SINGLETON_LOCK_MONITOR_FAILED']);
    assert.deepEqual(failures, [], 'read/parse monitoring error has no terminal authority');
    assert.equal(lock.ownershipState, 'owned');
    fs.writeFileSync(lock.lockFile, ownedRecord, 'utf8');
    fs.unlinkSync(lock.lockFile);
    assert.equal(lock.checkLockIntegrity(), true);
    assert.deepEqual(failures.map((failure) => failure.code), ['SINGLETON_LOCK_MISSING']);
    assert.equal(lock.releaseLock(), true);
    return {
      processListenerCountsUnchanged: true,
      monitorReadErrorReportedWithoutTerminalAuthority: true,
      integrityFailureReportedToOwner: true,
      singletonDidNotTerminateProcess: true,
    };
  } finally {
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
}

function closableSocket() {
  const socket = new EventEmitter();
  socket.readyState = 1;
  socket.closeCalls = 0;
  socket.close = () => { socket.closeCalls += 1; };
  return socket;
}

async function runServiceTeardownCases() {
  const SessionRouter = classFromMethods(parseSource(sessionRouterPath), 'SessionRouter', ['stop']);
  const PipelineSnapshot = classFromMethods(parseSource(pipelineSnapshotPath), 'PipelineSnapshot', ['stop']);
  const WebSocketManager = classFromMethods(
    parseSource(webSocketManagerPath),
    'WebSocketManager',
    ['stop'],
    { WebSocket: { CLOSED: 3 } }
  );
  const ResilientWebSocket = classFromMethods(
    parseSource(resilientWebSocketPath),
    'ResilientWebSocket',
    ['stop'],
    { WebSocket: { CLOSED: 3 } }
  );
  const AlpacaAdapter = classFromMethods(
    parseSource(alpacaAdapterPath),
    'AlpacaAdapter',
    ['disconnect'],
    { WebSocket: { CLOSED: 3 } }
  );
  const KrakenAdapterSimple = classFromMethods(
    parseSource(krakenAdapterPath),
    'KrakenAdapterSimple',
    ['disconnect'],
    { WebSocket: { CLOSED: 3 } }
  );
  const KrakenIBrokerAdapter = classFromMethods(
    parseSource(krakenWrapperPath),
    'KrakenIBrokerAdapter',
    ['disconnect']
  );

  const sessionWork = deferred();
  let detachCalls = 0;
  const sessionRouter = {
    stopping: false,
    intervalId: setInterval(() => {}, 60_000),
    activeOperations: new Set([sessionWork.promise]),
    _detachActiveOhlcCallback: () => { detachCalls += 1; },
  };
  let sessionSettled = false;
  const sessionStop = SessionRouter.prototype.stop.call(sessionRouter).then((result) => {
    sessionSettled = true;
    return result;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sessionSettled, false);
  assert.equal(sessionRouter.stopping, true);
  assert.equal(sessionRouter.intervalId, null);
  sessionWork.resolve({ success: true });
  assert.deepEqual(await sessionStop, { success: true });
  assert.equal(detachCalls, 2);

  let initialCaptureFired = false;
  let repeatingCaptureFired = false;
  const pipeline = {
    initialCaptureTimer: setTimeout(() => { initialCaptureFired = true; }, 20),
    timer: setInterval(() => { repeatingCaptureFired = true; }, 20),
    snapshotCount: 0,
  };
  assert.deepEqual(PipelineSnapshot.prototype.stop.call(pipeline), { success: true });
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(initialCaptureFired, false);
  assert.equal(repeatingCaptureFired, false);

  const dashboardSocket = closableSocket();
  const dashboardCtx = {
    dashboardWs: dashboardSocket,
    dashboardWsConnected: true,
    dashboardReconnectTimeout: setTimeout(() => assert.fail('dashboard reconnect fired'), 60_000),
    heartbeatInterval: setInterval(() => {}, 60_000),
    dataWatchdogInterval: setInterval(() => {}, 60_000),
    botStateInterval: setInterval(() => {}, 60_000),
  };
  let dashboardSettled = false;
  const dashboardStop = WebSocketManager.prototype.stop.call({ ctx: dashboardCtx }).then((result) => {
    dashboardSettled = true;
    return result;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dashboardSettled, false);
  assert.equal(dashboardSocket.closeCalls, 1);
  assert.equal(dashboardCtx.dashboardReconnectTimeout, null);
  dashboardSocket.emit('close');
  assert.deepEqual(await dashboardStop, { success: true });

  const resilient = new ResilientWebSocket();
  const resilientSocket = closableSocket();
  const resilientEvents = [];
  resilient.ws = resilientSocket;
  resilient.started = true;
  resilient.emit = (eventName) => resilientEvents.push(eventName);
  resilient._clearAllTimers = () => {};
  let resilientSettled = false;
  const resilientStop = resilient.stop().then((result) => {
    resilientSettled = true;
    return result;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resilientSettled, false);
  assert.equal(resilientSocket.closeCalls, 1);
  resilientSocket.emit('close');
  assert.deepEqual(await resilientStop, { success: true });
  assert.deepEqual(resilientEvents, ['stopped']);

  const krakenSocket = closableSocket();
  const krakenPending = deferred();
  const kraken = new KrakenAdapterSimple();
  Object.assign(kraken, {
    connected: true,
    reconnectTimeout: setTimeout(() => assert.fail('kraken reconnect fired'), 60_000),
    subscriptionImmediate: setImmediate(() => assert.fail('kraken subscription fired')),
    pingInterval: setInterval(() => {}, 60_000),
    dataWatchdogInterval: setInterval(() => {}, 60_000),
    processQueueInterval: setInterval(() => {}, 60_000),
    queueBackoffTimeout: setTimeout(() => assert.fail('kraken backoff fired'), 60_000),
    queueProcessing: true,
    pendingPrivateRequests: new Set([krakenPending.promise]),
    depthLiveSymbolTimestamps: new Map([['BTC-USD', Date.now()]]),
    bookSubscriptions: new Set(['BTC-USD']),
    ws: krakenSocket,
  });
  let krakenSettled = false;
  const krakenStop = kraken.disconnect().then((result) => {
    krakenSettled = true;
    return result;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(krakenSettled, false);
  assert.equal(krakenSocket.closeCalls, 0, 'Kraken transport waits for owned REST work');
  kraken.pendingPrivateRequests.delete(krakenPending.promise);
  krakenPending.resolve({ success: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(krakenSocket.closeCalls, 1);
  assert.equal(krakenSettled, false);
  krakenSocket.emit('close');
  assert.deepEqual(await krakenStop, { success: true });

  const wrapperCalls = [];
  const wrapperResult = await KrakenIBrokerAdapter.prototype.disconnect.call({
    kraken: { ws: null, disconnect: async () => { wrapperCalls.push('disconnect'); return { success: true }; } },
    connected: true,
  });
  assert.deepEqual(wrapperCalls, ['disconnect']);
  assert.deepEqual(wrapperResult, { success: true });

  const rwsWork = deferred();
  const accountSocket = closableSocket();
  const alpaca = new AlpacaAdapter();
  Object.assign(alpaca, {
    intentionalDisconnect: false,
    connected: true,
    rws: { stop: () => rwsWork.promise },
    accountWs: accountSocket,
  });
  let alpacaSettled = false;
  const alpacaStop = alpaca.disconnect().then((result) => {
    alpacaSettled = true;
    return result;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(alpacaSettled, false);
  assert.equal(accountSocket.closeCalls, 0, 'Alpaca account close waits for data-stream stop');
  rwsWork.resolve({ success: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(accountSocket.closeCalls, 1);
  accountSocket.emit('close');
  assert.deepEqual(await alpacaStop, { success: true });

  return {
    sessionOperationsSettled: true,
    startupSnapshotCancelled: true,
    dashboardReconnectAndCloseSettled: true,
    resilientSocketCloseSettled: true,
    krakenRestAndSocketSettled: true,
    krakenWrapperAlwaysDelegated: true,
    alpacaStreamsSettled: true,
  };
}

async function runPersistenceOutcomeCases() {
  const UnifiedPatternMemory = classFromMethods(
    parseSource(patternMemoryPath),
    'UnifiedPatternMemory',
    ['save']
  );
  const EnhancedPatternChecker = classFromMethods(
    parseSource(enhancedPatternPath),
    'EnhancedPatternChecker',
    ['cleanup']
  );
  const TradeJournal = classFromMethods(parseSource(tradeJournalPath), 'TradeJournal', ['destroy']);
  const TradeJournalBridge = classFromMethods(
    parseSource(tradeJournalBridgePath),
    'TradeJournalBridge',
    ['destroy']
  );

  const patternOwner = new UnifiedPatternMemory();
  patternOwner.config = { persistToDisk: true };
  patternOwner.saveOrThrow = () => {
    const error = new Error('fixture pattern write failed');
    error.code = 'EIO';
    throw error;
  };
  const patternFailure = patternOwner.save();
  assert.equal(patternFailure.success, false);
  assert.equal(patternFailure.code, 'PATTERN_MEMORY_SAVE_FAILED');

  const patternChecker = new EnhancedPatternChecker();
  patternChecker.memory = { cleanup: async () => patternFailure };
  const propagatedPatternFailure = await patternChecker.cleanup();
  assert.strictEqual(propagatedPatternFailure, patternFailure);

  const journal = new TradeJournal();
  journal._autoSaveTimer = null;
  journal._saveStatsCache = () => ({
      success: false,
      code: 'TRADE_JOURNAL_STATS_SAVE_FAILED',
      reason: 'fixture stats write failed',
  });
  const journalFailure = journal.destroy();
  assert.equal(journalFailure.success, false);

  const journalCalls = [];
  const journalBridge = new TradeJournalBridge();
  journalBridge._broadcastTimer = null;
  journalBridge._dashboardHookTimer = null;
  journalBridge._allJournalBundles = () => [
      { journal: { destroy: () => { journalCalls.push('first'); return journalFailure; } } },
      { journal: { destroy: () => { journalCalls.push('second'); throw new Error('fixture second journal failed'); } } },
  ];
  const bridgeFailure = journalBridge.destroy();
  assert.deepEqual(journalCalls, ['first', 'second']);
  assert.equal(bridgeFailure.success, false);
  assert.equal(bridgeFailure.failures.length, 2);
  return {
    patternFailurePropagated: true,
    journalFailurePropagated: true,
    everyJournalAttempted: true,
  };
}

function runSourceOwnershipChecks(singletonParsed, runnerParsed, backtestParsed) {
  assert.equal(processCallCount(singletonParsed, 'on'), 0);
  assert.equal(processCallCount(singletonParsed, 'once'), 0);
  assert.equal(processCallCount(singletonParsed, 'exit'), 0);
  assert.equal(processCallCount(backtestParsed, 'exit'), 0);
  const backtestSource = backtestParsed.source;
  assert.match(backtestSource, /return \{ success: true, exitCode: 0 \}/);
  assert.match(backtestSource, /success: false,\s+exitCode: 1/);
  assert.doesNotMatch(backtestSource, /patternChecker\?\.cleanup/);
  assert.match(runnerParsed.source, /'backtest_run'/);
  assert.match(runnerParsed.source, /await this\.shutdown\(result\?\.exitCode === 0 \? 0 : 1\)/);
  assert.match(runnerParsed.source, /`candle_analysis:\$\{sym\}:\$\{traceId\}`,[\s\S]*?this\.run15mTradingCycle\(sym, traceId\)/);
  assert.match(runnerParsed.source, /'exit_monitor',[\s\S]*?this\._runExitMonitorCycle\(\)/);
  assert.match(runnerParsed.source, /'pattern_persistence',[\s\S]*?this\.patternChecker\?\.cleanup\?\.\(\)/);
  assert.equal(processCallCount(runnerParsed, 'exit'), 2, 'only pre-runtime and orderly runner owners terminate');
  return {
    singletonProcessHandlers: 0,
    singletonProcessExits: 0,
    backtestProcessExits: 0,
    runnerTerminalExitSites: 2,
    actualTradingDispatchPathsTracked: true,
    singleFinalPatternPersistenceOwner: true,
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
    originalBaseSha,
    correctionBaseSha,
    node: process.version,
    sourceFiles: Object.fromEntries([
      runnerPath,
      singletonPath,
      backtestRunnerPath,
      sessionRouterPath,
      pipelineSnapshotPath,
      webSocketManagerPath,
      patternMemoryPath,
      enhancedPatternPath,
      tradeJournalPath,
      tradeJournalBridgePath,
      resilientWebSocketPath,
      alpacaAdapterPath,
      krakenAdapterPath,
      krakenWrapperPath,
      j2ProbePath,
      __filename,
    ].map((filePath) => [path.relative(repoRoot, filePath), sha256File(filePath)])),
    operations: 'Offline source-exact lifecycle functions, controlled service-owner methods, real SingletonLock, repeated child-process OS signals, persistence outcome propagation, and J2 child-process contention only; no bot boot, Jest, provider, broker, notification, network, PM2, or trading operation.',
    result: 'PASS',
    sourceOwnership: runSourceOwnershipChecks(singletonParsed, runnerParsed, backtestParsed),
    singletonOwnership: runSingletonOwnershipCase(),
    runtimeHandlers: runRuntimeHandlerCases(runnerParsed),
    preRuntimeShutdown: await runPreRuntimeShutdownCase(runnerParsed),
    orderlyShutdown: await runShutdownSuccessCase(runnerParsed),
    cleanupFailure: await runShutdownFailureCase(runnerParsed),
    inflightSettlement: await runInflightSettlementCase(runnerParsed),
    cleanupIsolation: await runCleanupIsolationCase(runnerParsed),
    skippedLockShutdown: await runSkippedLockShutdownCase(runnerParsed),
    backtestDispatch: await runBacktestDispatchCases(runnerParsed),
    repeatedOsSignals: await runRepeatedOsSignalCases(),
    serviceTeardown: await runServiceTeardownCases(),
    persistenceOutcomes: await runPersistenceOutcomeCases(),
    j2Regression: runJ2Regression(),
  };
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(receipt, null, 2));
}

if (process.argv[2] === '--signal-child') {
  runSignalChild(parseSource(runnerPath), process.argv[3]).catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
} else {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
