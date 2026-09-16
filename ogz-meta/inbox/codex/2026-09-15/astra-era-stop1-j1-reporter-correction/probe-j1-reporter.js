#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');

const packetDir = __dirname;
const repoRoot = path.resolve(packetDir, '..', '..', '..', '..', '..');
const RuntimeAuditSink = require(path.join(repoRoot, 'core', 'RuntimeAuditSink'));
const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-j1-reporter-'));
const canary = 'INVENTED_J1_REDACTION_CANARY_9Q7';
const baseSha = '0a7ba844885208cfb277aaf81df3245a8f52ff2c';
const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : null;

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeFixture(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, 'utf8');
}

function readIfPresent(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function parseJsonLines(raw) {
  return raw.trim() ? raw.trim().split('\n').map((line) => JSON.parse(line)) : [];
}

function makeSinkFixture(label, env = {}) {
  const cwd = path.join(scratchRoot, 'sink', label);
  fs.mkdirSync(cwd, { recursive: true });
  const stderrPath = path.join(cwd, 'stderr.log');
  const stderrFd = fs.openSync(stderrPath, 'w');
  const sink = new RuntimeAuditSink({
    cwd,
    env,
    stderrFd,
    processRole: 'fixture-role',
    phase: 'fixture-phase',
    sourceReceiptId: 'fixture-receipt',
  });
  return { cwd, sink, stderrFd, stderrPath };
}

function finishSinkFixture(fixture) {
  fs.closeSync(fixture.stderrFd);
  return readIfPresent(fixture.stderrPath);
}

function runSinkCases() {
  const results = [];
  const artifacts = [];
  for (const [label, text, env] of [
    ['known_ambient_control', canary, { ALPACA_API_KEY: canary }],
    ['prefixed_assignment_file_only', `ALPACA_API_KEY=${canary}`, {}],
    ['quoted_json_key_file_only', JSON.stringify({ apiKey: canary }), {}],
    ['ntfy_capability', `NTFY_TOPIC=${canary}`, { NTFY_TOPIC: canary }],
  ]) {
    const fixture = makeSinkFixture(label, env);
    const error = new Error(text);
    error.stack = `FixtureError: ${text}`;
    const captured = fixture.sink.capture('fixture', error);
    const diagnostic = fixture.sink.redactForOutput(error);
    const jsonl = readIfPresent(fixture.sink.filePath);
    const stderr = finishSinkFixture(fixture);
    assert.equal(captured.success, true, label);
    assert.equal(jsonl.includes(canary), false, `${label} JSONL redaction`);
    assert.equal(diagnostic.includes(canary), false, `${label} diagnostic redaction`);
    assert.equal(stderr.includes(canary), false, `${label} stderr redaction`);
    results.push({
      case: label,
      captured: captured.success,
      jsonlCanaryAbsent: !jsonl.includes(canary),
      diagnosticCanaryAbsent: !diagnostic.includes(canary),
    });
    artifacts.push({ case: label, jsonl, diagnostic, stderr });
  }

  {
    const fixture = makeSinkFixture('mixed_error_object_cycle');
    const error = new Error('outer');
    error.stack = 'FixtureError: outer';
    error.cause = { parent: error };
    const captured = fixture.sink.capture('fixture', error);
    const diagnostic = fixture.sink.redactForOutput(error);
    const stderr = finishSinkFixture(fixture);
    assert.equal(captured.success, true);
    assert.equal(stderr, '');
    assert.match(JSON.stringify(captured.record), /circular/);
    results.push({
      case: 'mixed_error_object_cycle',
      captured: captured.success,
      recordPresent: captured.record !== null,
      formattingReturned: typeof diagnostic === 'string',
      circularBounded: JSON.stringify(captured.record).includes('circular'),
    });
    artifacts.push({ case: 'mixed_error_object_cycle', record: captured.record, diagnostic, stderr });
  }

  {
    const fixture = makeSinkFixture('ordinary_cause_control');
    const inner = new Error('inner');
    inner.stack = 'FixtureError: inner';
    inner.code = 'INNER_CODE';
    const outer = new Error('outer', { cause: inner });
    outer.stack = 'FixtureError: outer';
    outer.code = 'OUTER_CODE';
    const captured = fixture.sink.capture('fixture', outer);
    finishSinkFixture(fixture);
    assert.equal(captured.success, true);
    assert.equal(captured.record.code, 'OUTER_CODE');
    assert.equal(captured.record.cause.code, 'INNER_CODE');
    results.push({ case: 'ordinary_cause_control', captured: true, outerAndCauseCodesRetained: true });
  }

  {
    const fixture = makeSinkFixture('append_failure_with_writable_stderr');
    fs.mkdirSync(fixture.sink.filePath, { recursive: true });
    const inner = new Error('inner');
    inner.stack = 'FixtureError: inner';
    inner.code = 'INNER_CODE';
    const outer = new Error('outer', { cause: inner });
    outer.stack = 'FixtureError: outer';
    outer.code = 'OUTER_CODE';
    const captured = fixture.sink.capture('fixture', outer, { runtimeScope: 'fixture-runtime' });
    const stderr = finishSinkFixture(fixture);
    const prefix = '[FATAL-AUDIT-FAILED] ';
    assert.ok(stderr.startsWith(prefix));
    const fallback = JSON.parse(stderr.slice(prefix.length));
    const retainedFields = ['processRole', 'phase', 'sourceReceiptId', 'code', 'cause', 'runtimeScope']
      .filter((key) => Object.hasOwn(fallback, key) && fallback[key] !== null);
    assert.equal(captured.success, false);
    assert.deepEqual(retainedFields, ['processRole', 'phase', 'sourceReceiptId', 'code', 'cause', 'runtimeScope']);
    assert.equal(fallback.code, 'OUTER_CODE');
    assert.equal(fallback.cause.code, 'INNER_CODE');
    results.push({
      case: 'append_failure_with_writable_stderr',
      captured: false,
      stderrReceiptPresent: true,
      retainedFields,
      outerAndCauseCodesRetained: true,
    });
    artifacts.push({ case: 'append_failure_with_writable_stderr', stderr, fallback });
  }

  {
    const fixture = makeSinkFixture('throwing_code_accessor');
    const error = new Error('outer');
    error.stack = 'FixtureError: outer';
    Object.defineProperty(error, 'code', {
      get() {
        throw new Error('accessor failed');
      },
    });
    const captured = fixture.sink.capture('fixture', error);
    const diagnostic = fixture.sink.redactForOutput(error);
    finishSinkFixture(fixture);
    assert.equal(captured.success, true);
    assert.equal(captured.record.code, '[accessor]');
    assert.equal(typeof diagnostic, 'string');
    results.push({
      case: 'throwing_code_accessor',
      captured: true,
      formattingReturned: true,
      accessorNotInvoked: true,
    });
  }

  return { results, artifacts };
}

function runLoaderCases() {
  const loader = require(path.join(repoRoot, 'core', 'ModuleAutoLoader'));
  const moduleDir = path.join(scratchRoot, 'loader', 'modules');
  fs.mkdirSync(moduleDir, { recursive: true });
  writeFixture(
    path.join(moduleDir, 'optional.js'),
    "const error=new Error('optional');error.cause={parent:error};throw error;\n"
  );
  writeFixture(
    path.join(moduleDir, 'required.js'),
    "const error=new Error('required');Object.defineProperty(error,'name',{get(){throw new Error('name getter');}});throw error;\n"
  );
  loader.paths.j1_fixture = moduleDir;
  const sink = new RuntimeAuditSink({
    cwd: path.join(scratchRoot, 'loader'),
    env: {},
    processRole: 'loader-fixture',
    phase: 'module_autoload',
    sourceReceiptId: 'loader-fixture-receipt',
  });
  loader.setFailureReporter((eventType, error, context) => sink.capture(eventType, error, {
    processRole: 'loader-fixture',
    phase: 'module_autoload',
    extra: context,
  }));

  const optionalResult = loader.loadDirectory('j1_fixture', { required: [] });
  assert.equal(typeof optionalResult, 'object');

  let requiredCode = null;
  try {
    loader.loadDirectory('j1_fixture', { required: ['required'] });
  } catch (error) {
    requiredCode = error.code;
  }
  assert.equal(requiredCode, 'REQUIRED_MODULE_LOAD_FAILED');

  loader.setFailureReporter(() => {
    const reporterError = new Error('reporter');
    Object.defineProperty(reporterError, 'name', {
      get() {
        throw new Error('name getter');
      },
    });
    throw reporterError;
  });
  let throwingReporterCode = null;
  try {
    loader.loadDirectory('j1_fixture', { required: ['required'] });
  } catch (error) {
    throwingReporterCode = error.code;
  }
  assert.equal(throwingReporterCode, 'REQUIRED_MODULE_LOAD_FAILED');

  loader.setFailureReporter((eventType, error, context) => sink.capture(eventType, error, {
    processRole: 'loader-fixture',
    phase: 'module_autoload',
    extra: context,
  }));
  loader.paths.j1_absent = path.join(scratchRoot, 'loader', 'absent');
  const absentResult = loader.loadDirectory('j1_absent');
  assert.deepEqual(absentResult, {});

  loader.modules.j1_missing = {};
  let missingRequiredThrew = false;
  try {
    loader.validateModules({ j1_missing: ['missing'] });
  } catch (_error) {
    missingRequiredThrew = true;
  }
  assert.equal(missingRequiredThrew, true);

  const jsonl = readIfPresent(sink.filePath);
  return {
    results: {
      optionalContinued: true,
      requiredCode,
      throwingReporterCode,
      absentDirectoryReturnedExistingEmptyResult: true,
      missingRequiredThrew,
    },
    jsonl,
  };
}

const preloadPath = path.join(scratchRoot, 'entry-preload.js');
writeFixture(preloadPath, String.raw`
'use strict';
const fs = require('fs');
const Module = require('module');
const path = require('path');
const mode = process.env.J1_PROBE_MODE;
const repoRoot = process.env.J1_PROBE_REPO;
const probeRoot = process.env.J1_PROBE_ROOT;
const orderFile = process.env.J1_PROBE_ORDER;
const marker = process.env.J1_PROBE_CANARY;
const originalLoad = Module._load;

function appendOrder(value) {
  if (orderFile) fs.appendFileSync(orderFile, value + '\n');
}
function fixtureError(label) {
  const inner = new Error('inner');
  inner.stack = 'FixtureError: inner';
  inner.code = 'FIXTURE_INNER';
  const error = new Error(label + ' ALPACA_API_KEY=' + marker + ' https://fixture.invalid/capability/' + marker, { cause: inner });
  error.stack = 'FixtureError: ' + error.message;
  error.code = 'FIXTURE_OUTER';
  return error;
}
function expressStub() {
  const app = { use() {}, post() {}, get() {}, listen() {} };
  const express = () => app;
  express.json = () => function jsonMiddleware() {};
  express.static = () => function staticMiddleware() {};
  express.urlencoded = () => function urlencodedMiddleware() {};
  return express;
}

Module._load = function interceptedLoad(request, parent, isMain) {
  const parentFile = parent && parent.filename ? parent.filename : '';
  const botEntry = path.join(repoRoot, 'run-empire-v2.js');
  const dashboardEntry = path.join(repoRoot, 'ogzprime-ssl-server.js');
  const checkoutEntry = path.join(repoRoot, 'public', 'stripe-checkout.js');
  const supervisorEntry = path.join(repoRoot, 'scripts', 'supervisor-daemon.js');

  if (mode === 'entry-bot' && parentFile === botEntry && request === './foundation/ConfigLoader') {
    throw fixtureError('bot configuration source failed');
  }
  if (mode === 'entry-dashboard' && parentFile === dashboardEntry && request === 'dotenv') {
    throw fixtureError('dashboard configuration source failed');
  }
  if (mode === 'entry-checkout' && parentFile === checkoutEntry) {
    if (request === 'express') return expressStub();
    if (request === 'cors') return () => function corsMiddleware() {};
    if (request === 'dotenv') throw fixtureError('checkout configuration source failed');
  }
  if (mode === 'entry-supervisor' && parentFile === supervisorEntry && request === '../core/Supervisor') {
    throw fixtureError('supervisor service import failed');
  }

  if ((mode === 'dotenv-return-dashboard' || mode === 'dotenv-return-checkout') && request === 'dotenv') {
    return { config() { return { error: fixtureError('dotenv returned error') }; } };
  }
  if (mode === 'dotenv-return-dashboard' && parentFile === dashboardEntry && request === 'express') {
    throw new Error('fixture stop after dotenv receipt');
  }
  if (mode === 'dotenv-return-checkout' && parentFile === checkoutEntry) {
    if (request === 'express') return expressStub();
    if (request === 'cors') return () => function corsMiddleware() {};
    if (request === 'stripe') throw new Error('fixture stop after dotenv receipt');
  }

  if (mode === 'checkout-import' && parentFile === checkoutEntry) {
    if (request === 'express') return expressStub();
    if (request === 'cors') return () => function corsMiddleware() {};
    if (request === 'dotenv') return { config() { return {}; } };
    if (request === 'stripe') return () => ({ checkout: { sessions: {} } });
  }

  if (mode === 'sentry-order' && parentFile === botEntry) {
    if (request === './core/RuntimeAuditSink') {
      const Audit = originalLoad.call(this, request, parent, isMain);
      if (!Audit.prototype.__j1ProbeWrapped) {
        const originalCapture = Audit.prototype.capture;
        Audit.prototype.capture = function captureWithOrder(...args) {
          appendOrder('application-reporter');
          return originalCapture.apply(this, args);
        };
        Object.defineProperty(Audit.prototype, '__j1ProbeWrapped', { value: true });
      }
      return Audit;
    }
    if (request === './foundation/ConfigLoader') {
      return { load() { return { fingerprint: 'fixture-fingerprint', config: { paths: { dataDir: probeRoot, envFile: '/fixture/.env' }, backtest: { fast: false, silent: false, verbose: false }, mode: { backtest: false }, broker: {} } }; } };
    }
    if (request === './core/trai_llm_config') return { resolveTraiLlmConfig() { return {}; } };
    if (request === './instrument.js') {
      process.on('uncaughtException', function instrumentationUncaughtException() {
        appendOrder('instrumentation-callback');
      });
      process.on('unhandledRejection', function instrumentationUnhandledRejection() {});
      return {};
    }
    if (request === './core/TraceSpine') {
      appendOrder('unhandled-listeners:' + process.listeners('unhandledRejection').map((listener) => listener.name).join(','));
      throw fixtureError('fixture stop after instrumentation');
    }
  }

  if (mode === 'supervisor-runtime' && parentFile === supervisorEntry && request === '../core/Supervisor') {
    class SupervisorStub {
      register() {}
      stop() {}
      start() {
        const error = fixtureError('supervisor runtime fixture');
        error.cause = { parent: error };
        process.emit('uncaughtException', error);
        process.emit('unhandledRejection', error, Promise.resolve());
        appendOrder('continued-after-runtime-events');
      }
    }
    return { Supervisor: SupervisorStub, STATES: {} };
  }

  return originalLoad.call(this, request, parent, isMain);
};
`);

function runChild(mode, entry, args = []) {
  const cwd = path.join(scratchRoot, 'entrypoints', mode);
  fs.mkdirSync(cwd, { recursive: true });
  const orderFile = path.join(cwd, 'order.txt');
  const stdoutPath = path.join(cwd, 'stdout.log');
  const stderrPath = path.join(cwd, 'stderr.log');
  const stdoutFd = fs.openSync(stdoutPath, 'w');
  const stderrFd = fs.openSync(stderrPath, 'w');
  let child;
  try {
    child = childProcess.spawnSync(
      process.execPath,
      ['--require', preloadPath, entry, ...args],
      {
        cwd,
        stdio: ['ignore', stdoutFd, stderrFd],
        env: {
          PATH: process.env.PATH || '/usr/bin:/bin',
          J1_PROBE_MODE: mode,
          J1_PROBE_REPO: repoRoot,
          J1_PROBE_ROOT: cwd,
          J1_PROBE_ORDER: orderFile,
          J1_PROBE_CANARY: canary,
        },
      }
    );
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
  }
  if (child.error) {
    throw child.error;
  }
  const stdout = readIfPresent(stdoutPath);
  const stderr = readIfPresent(stderrPath);
  const jsonl = [
    path.join(cwd, 'data', 'runtime-audit', 'fatal-events.jsonl'),
    path.join(cwd, 'runtime-audit', 'fatal-events.jsonl'),
  ].map(readIfPresent).find(Boolean) || '';
  const order = readIfPresent(orderFile).trim().split('\n').filter(Boolean);
  assert.equal(stdout.includes(canary), false, `${mode} stdout redaction`);
  assert.equal(stderr.includes(canary), false, `${mode} stderr redaction`);
  assert.equal(jsonl.includes(canary), false, `${mode} JSONL redaction`);
  return {
    mode,
    status: child.status,
    signal: child.signal,
    stdout,
    stderr,
    jsonl,
    records: parseJsonLines(jsonl),
    order,
  };
}

function runCheckoutImportCase() {
  const checkoutPath = path.join(repoRoot, 'public', 'stripe-checkout.js');
  const originalLoad = Module._load;
  const express = () => ({ use() {}, post() {}, get() {}, listen() {} });
  express.json = () => function jsonMiddleware() {};
  const before = [
    process.listenerCount('uncaughtException'),
    process.listenerCount('unhandledRejection'),
  ];
  try {
    Module._load = function interceptedCheckoutImport(request, parent, isMain) {
      if (parent?.filename === checkoutPath) {
        if (request === 'express') return express;
        if (request === 'cors') return () => function corsMiddleware() {};
        if (request === 'dotenv') return { config() { return {}; } };
        if (request === 'stripe') return () => ({ checkout: { sessions: {} } });
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[require.resolve(checkoutPath)];
    require(checkoutPath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(checkoutPath)];
  }
  const after = [
    process.listenerCount('uncaughtException'),
    process.listenerCount('unhandledRejection'),
  ];
  assert.deepEqual(after, before);
  return { status: 0, signal: null, records: [], order: [], listenerReceipt: { before, after } };
}

function runEntrypointCases() {
  const entries = {
    'entry-bot': path.join(repoRoot, 'run-empire-v2.js'),
    'entry-dashboard': path.join(repoRoot, 'ogzprime-ssl-server.js'),
    'entry-checkout': path.join(repoRoot, 'public', 'stripe-checkout.js'),
    'entry-supervisor': path.join(repoRoot, 'scripts', 'supervisor-daemon.js'),
  };
  const expectedEarlyDiagnostic = {
    'entry-bot': '[FATAL] Uncaught Exception:',
    'entry-dashboard': '[Dashboard] Uncaught exception:',
    'entry-checkout': '[Checkout] Uncaught exception:',
    'entry-supervisor': '[Supervisor] Bootstrap exception:',
  };
  const results = {};
  for (const [mode, entry] of Object.entries(entries)) {
    const child = runChild(mode, entry);
    assert.equal(child.status, 1, mode);
    assert.equal(child.records.length, 1, mode);
    const [record] = child.records;
    assert.equal(record.processRole.startsWith('ogz-'), true, mode);
    assert.equal(record.phase, 'configuration_source', mode);
    assert.equal(typeof record.sourceReceiptId, 'string', mode);
    assert.equal(record.code, 'FIXTURE_OUTER', mode);
    assert.equal(record.cause.code, 'FIXTURE_INNER', mode);
    assert.ok(child.stderr.includes(expectedEarlyDiagnostic[mode]), `${mode} diagnostic present`);
    assert.ok(child.stderr.includes('[REDACTED]'), `${mode} assignment redacted`);
    assert.ok(child.stderr.includes('[REDACTED_URL]'), `${mode} URL redacted`);
    results[mode] = child;
  }

  for (const mode of ['dotenv-return-dashboard', 'dotenv-return-checkout']) {
    const entry = mode.endsWith('dashboard')
      ? path.join(repoRoot, 'ogzprime-ssl-server.js')
      : path.join(repoRoot, 'public', 'stripe-checkout.js');
    const child = runChild(mode, entry);
    assert.equal(child.status, 1, mode);
    const sourceRecord = child.records.find((record) => record.eventType === 'configurationSourceUnavailable');
    assert.ok(sourceRecord, mode);
    assert.equal(sourceRecord.context.source, 'dotenv', mode);
    assert.equal(sourceRecord.context.continued, true, mode);
    assert.equal(sourceRecord.code, 'FIXTURE_OUTER', mode);
    assert.ok(JSON.stringify(sourceRecord).includes('[REDACTED]'), `${mode} source assignment redacted`);
    assert.ok(JSON.stringify(sourceRecord).includes('[REDACTED_URL]'), `${mode} source URL redacted`);
    const diagnosticPrefix = mode.endsWith('dashboard')
      ? '[Dashboard] Uncaught exception:'
      : '[Checkout] Uncaught exception:';
    assert.ok(child.stderr.includes(diagnosticPrefix), `${mode} stop diagnostic present`);
    results[mode] = child;
  }

  const sentryOrder = runChild('sentry-order', path.join(repoRoot, 'run-empire-v2.js'));
  assert.equal(sentryOrder.status, 1);
  assert.deepEqual(sentryOrder.order, [
    'unhandled-listeners:instrumentationUnhandledRejection,terminateOnUnhandledRejection',
    'instrumentation-callback',
    'application-reporter',
  ]);
  assert.ok(sentryOrder.stderr.includes('[FATAL] Uncaught Exception:'), 'sentry-order diagnostic present');
  assert.ok(sentryOrder.stderr.includes('[REDACTED]'), 'sentry-order assignment redacted');
  assert.ok(sentryOrder.stderr.includes('[REDACTED_URL]'), 'sentry-order URL redacted');
  results['sentry-order'] = sentryOrder;

  const supervisorRuntime = runChild('supervisor-runtime', path.join(repoRoot, 'scripts', 'supervisor-daemon.js'));
  assert.equal(supervisorRuntime.status, 0);
  assert.deepEqual(supervisorRuntime.order, ['continued-after-runtime-events']);
  assert.deepEqual(
    supervisorRuntime.records.map((record) => record.eventType),
    ['uncaughtException', 'unhandledRejection']
  );
  assert.ok(supervisorRuntime.stdout.includes('[Supervisor] daemon booting'), 'supervisor boot diagnostic present');
  assert.ok(supervisorRuntime.stdout.includes('[Supervisor] daemon running'), 'supervisor running diagnostic present');
  assert.ok(supervisorRuntime.stderr.includes('[Supervisor] uncaughtException:'), 'supervisor uncaught diagnostic present');
  assert.ok(supervisorRuntime.stderr.includes('[Supervisor] unhandledRejection:'), 'supervisor rejection diagnostic present');
  assert.ok(supervisorRuntime.stderr.includes('[REDACTED]'), 'supervisor assignment redacted');
  assert.ok(supervisorRuntime.stderr.includes('[REDACTED_URL]'), 'supervisor URL redacted');
  results['supervisor-runtime'] = supervisorRuntime;

  results['checkout-import'] = runCheckoutImportCase();

  return results;
}

const sink = runSinkCases();
const loader = runLoaderCases();
const entrypoints = runEntrypointCases();
const receipt = {
  baseSha,
  node: process.version,
  sourceFiles: Object.fromEntries([
    path.join(repoRoot, 'core', 'RuntimeAuditSink.js'),
    path.join(repoRoot, 'core', 'ModuleAutoLoader.js'),
    path.join(repoRoot, 'run-empire-v2.js'),
    __filename,
  ].map((filePath) => [path.relative(repoRoot, filePath), sha256File(filePath)])),
  operations: 'Local RuntimeAuditSink, ModuleAutoLoader, and intercepted entrypoint probes only; invented inputs; no Jest, SDK, provider, broker, notification, network, PM2, or successful service boot.',
  result: 'PASS',
  sink: sink.results,
  loader: loader.results,
  entrypoints: Object.fromEntries(Object.entries(entrypoints).map(([name, child]) => [name, {
    status: child.status,
    signal: child.signal,
    recordTypes: child.records.map((record) => record.eventType),
    order: child.order,
    listenerReceipt: child.listenerReceipt || null,
  }])),
  capturedOutputs: {
    sink: sink.artifacts,
    loaderJsonl: loader.jsonl,
    entrypoints: Object.fromEntries(Object.entries(entrypoints).map(([name, child]) => [name, {
      stdout: child.stdout || '',
      stderr: child.stderr || '',
      jsonl: child.jsonl || '',
      order: child.order,
    }])),
  },
};

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify({
  result: receipt.result,
  baseSha: receipt.baseSha,
  node: receipt.node,
  sinkCases: receipt.sink.length,
  loader: receipt.loader,
  entrypoints: receipt.entrypoints,
  receiptPath: outputPath,
}, null, 2));
