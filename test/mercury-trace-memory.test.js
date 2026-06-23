'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const config = require('../trai_brain/mercury-bridge/config');
const { shouldCaptureTrace } = require('../trai_brain/mercury-bridge/trace-memory');

describe('Mercury trace memory guard', () => {
  test('trace memory uses a fresh guarded collection', () => {
    expect(config.TRACE_MEMORY_ENABLED).toBe(true);
    expect(config.TRACE_COLLECTION).toBe('investigation_traces_guarded_v1');
    expect(config.TRACE_CAPTURE_MODE).toBe('manual');
  });

  test('trace memory rejects automatic capture mode', () => {
    const configPath = require.resolve('../trai_brain/mercury-bridge/config');
    const originalConfigFile = process.env.MERCURY_CONFIG_FILE;
    jest.resetModules();
    process.env.MERCURY_CONFIG_FILE = path.join(__dirname, 'fixtures', 'mercury-auto-capture.config.json');

    expect(() => require(configPath)).toThrow(/traceMemory\.captureMode=auto.*Use manual/);

    jest.resetModules();
    if (originalConfigFile) {
      process.env.MERCURY_CONFIG_FILE = originalConfigFile;
    } else {
      delete process.env.MERCURY_CONFIG_FILE;
    }
    require('../trai_brain/mercury-bridge/config');
  });

  test('config override fails closed outside Jest test mode', () => {
    const env = { ...process.env };
    delete env.NODE_ENV;
    env.MERCURY_CONFIG_FILE = path.join(__dirname, 'fixtures', 'mercury-auto-capture.config.json');

    const result = spawnSync(process.execPath, [
      '-e',
      "require('./trai_brain/mercury-bridge/config')",
    ], {
      cwd: path.join(__dirname, '..'),
      env,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`)
      .toMatch(/Unsupported traceMemory\.captureMode=auto.*Use manual/);
  });

  test('manual capture mode refuses successful traces without an explicit capture request', () => {
    expect(shouldCaptureTrace({
      query: 'Where is serena_blast_radius registered?',
      toolCallSequence: [{ name: 'grep', args: { query: 'serena_blast_radius' } }],
      metadata: { termination: 'answer_given' },
    })).toEqual({ capture: false, reason: 'manual_capture_not_requested' });
  });

  test('current-fix traces are not captured unless git_diff established the target', () => {
    const metadata = { termination: 'answer_given' };

    expect(shouldCaptureTrace({
      query: 'Mercury, break my fix.',
      toolCallSequence: [{ name: 'grep', args: { query: 'FIX' } }],
      metadata,
      captureRequested: true,
    })).toEqual({ capture: false, reason: 'current_fix_without_git_diff' });

    expect(shouldCaptureTrace({
      query: 'Mercury, break my fix.',
      toolCallSequence: [{ name: 'git_diff', args: { target: 'staged' } }],
      metadata,
      captureRequested: true,
    })).toEqual({ capture: true });
  });

  test('non-current investigations can teach only when manually requested', () => {
    expect(shouldCaptureTrace({
      query: 'Where is serena_blast_radius registered?',
      toolCallSequence: [{ name: 'grep', args: { query: 'serena_blast_radius' } }],
      metadata: { termination: 'answer_given' },
      captureRequested: true,
    })).toEqual({ capture: true });
  });

  test('failed investigations never teach', () => {
    expect(shouldCaptureTrace({
      query: 'Mercury, break my fix.',
      toolCallSequence: [{ name: 'git_diff', args: { target: 'staged' } }],
      metadata: { termination: 'max_iterations' },
      captureRequested: true,
    })).toEqual({ capture: false, reason: 'termination_not_successful' });
  });
});
