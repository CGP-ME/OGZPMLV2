'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const RuntimeAuditSink = require('../core/RuntimeAuditSink');

describe('RuntimeAuditSink', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-runtime-audit-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function readJsonl(filePath) {
    return fs.readFileSync(filePath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  test('appends a scoped fatal error record without process env leakage', () => {
    const sink = new RuntimeAuditSink({
      dir: tempDir,
      allowOutsideRepo: true,
      clock: () => new Date('2026-05-27T12:00:00.000Z'),
      env: {
        pm_id: '4',
        name: 'ogz-prime-v2',
        SECRET_TOKEN: 'do-not-write',
      },
      pid: 1234,
      nodeVersion: 'v22.22.2',
      cwd: '/opt/ogzprime/OGZPMLV2',
    });

    const error = new Error('boom');
    const result = sink.capture('uncaughtException', error, {
      runtimeScope: 'bootstrap',
      configFingerprint: 'abc123',
      executionMode: 'paper',
      brokerId: 'kraken',
      accountId: 'default',
      assetClass: 'crypto',
      symbol: 'BTC-USD',
      timeframe: '1m',
      scopeKey: 'paper:kraken:default:crypto:BTC-USD:1m',
      extra: { promise: '[object Promise]' },
    });

    expect(result.success).toBe(true);

    const records = readJsonl(path.join(tempDir, 'fatal-events.jsonl'));
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(expect.objectContaining({
      timestamp: '2026-05-27T12:00:00.000Z',
      eventType: 'uncaughtException',
      name: 'Error',
      message: 'boom',
      runtimeScope: 'bootstrap',
      configFingerprint: 'abc123',
    }));
    expect(records[0].stack).toContain('boom');
    expect(records[0].scope).toEqual({
      executionMode: 'paper',
      brokerId: 'kraken',
      accountId: 'default',
      assetClass: 'crypto',
      symbol: 'BTC-USD',
      timeframe: '1m',
      scopeKey: 'paper:kraken:default:crypto:BTC-USD:1m',
    });
    expect(records[0].env).toEqual({
      pid: 1234,
      nodeVersion: 'v22.22.2',
      pm2Id: '4',
      pm2Name: 'ogz-prime-v2',
      nodeAppInstance: null,
      cwd: '/opt/ogzprime/OGZPMLV2',
    });
    expect(JSON.stringify(records[0])).not.toContain('SECRET_TOKEN');
    expect(JSON.stringify(records[0])).not.toContain('do-not-write');
  });

  test('records non-Error rejection reasons with circular context safely', () => {
    const sink = new RuntimeAuditSink({
      dir: tempDir,
      allowOutsideRepo: true,
      clock: () => new Date('2026-05-27T12:01:00.000Z'),
    });
    const circular = { label: 'context' };
    circular.self = circular;

    const result = sink.capture('unhandledRejection', { reason: 'bad payload' }, {
      runtimeScope: 'main_runtime',
      extra: circular,
    });

    expect(result.success).toBe(true);

    const [record] = readJsonl(path.join(tempDir, 'fatal-events.jsonl'));
    expect(record).toEqual(expect.objectContaining({
      eventType: 'unhandledRejection',
      runtimeScope: 'main_runtime',
      message: '{"reason":"bad payload"}',
    }));
    expect(record.raw).toEqual({ reason: 'bad payload' });
    expect(record.context.self).toBe('[circular]');
  });

  test('capture returns failure instead of throwing when append fails', () => {
    const writeSyncSpy = jest.spyOn(fs, 'writeSync').mockImplementation(() => {});
    const sink = new RuntimeAuditSink({ filePath: tempDir, allowOutsideRepo: true });

    try {
      expect(() => sink.capture('mainFatal', new Error('write failed'))).not.toThrow();
      const result = sink.capture('mainFatal', new Error('write failed'));

      expect(result.success).toBe(false);
      expect(result.filePath).toBe(tempDir);
      expect(result.record).toEqual(expect.objectContaining({
        eventType: 'mainFatal',
        message: 'write failed',
      }));
      expect(result.error).toEqual(expect.any(String));
      expect(writeSyncSpy).toHaveBeenCalledWith(
        2,
        expect.stringContaining('[FATAL-AUDIT-FAILED]')
      );
      expect(writeSyncSpy.mock.calls[0][1]).toContain('"message":"write failed"');
    } finally {
      writeSyncSpy.mockRestore();
    }
  });

  test('falls back to repo-scoped audit file when outside path is not explicitly allowed', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-runtime-audit-root-'));
    try {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-runtime-audit-outside-'));
      const sink = new RuntimeAuditSink({
        cwd: repoRoot,
        dir: outsideDir,
      });

      expect(sink.filePath).toBe(path.join(repoRoot, 'data', 'runtime-audit', 'fatal-events.jsonl'));
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
