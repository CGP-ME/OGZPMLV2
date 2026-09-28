'use strict';
// Synthetic counters and intercepted HTTPS: never fill RAM/disk or send a notification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '../../../../../..');
const { measureDisk, measureMemory, checkHost, publish } = require(path.join(root, 'scripts/vps-disk-alarm'));
const disk = n => measureDisk({ blocks: 1000n, bfree: BigInt(n), bavail: BigInt(n), bsize: 4096n });
const ram = n => measureMemory(`MemTotal: 1000 kB\nMemAvailable: ${n} kB\n`);
const observations = [];
async function check(label, availableDisk, availableRam, previous, now, options = {}) {
  const sent = [];
  const result = await checkHost({ disk: disk(availableDisk), ram: ram(availableRam), previous,
    now, hostname: 'fixture-host', ...options, notify: async message => {
      sent.push(message);
      return options.delivery ? options.delivery(message) : { ok: true, statusCode: 200 };
    } });
  observations.push({ label, sent: sent.map(m => m.title), result });
  return { result, sent };
}
(async () => {
  for (const measure of [disk, ram]) {
    assert.equal(measure(101).critical, false);
    assert.equal(measure(100).critical, true);
    assert.equal(measure(0).critical, true);
  }
  assert.equal(measureMemory('MemTotal: 1000 kB\nMemFree: 10 kB\n').ok, false);
  assert.equal(measureMemory('MemTotal: 1000 kB\nMemAvailable: 10 kB\nMemAvailable: 10 kB\n').ok, false);
  assert.equal(ram(1001).ok, false);
  assert.equal(disk(1001).ok, false);
  assert.equal(measureDisk({ blocks: 1000n, bfree: 190n, bavail: 90n, bsize: 4096n }).critical, true);
  let observation = await check('healthy', 101, 101, null, 1000000);
  assert.equal(observation.sent.length, 0);
  observation = await check('disk-only-critical', 100, 101, observation.result.nextState, 1000001);
  assert.equal(observation.sent.length, 1);
  assert.match(observation.sent[0].title, /DISK SPACE/);
  observation = await check('ram-independent-while-disk-suppressed', 99, 100, observation.result.nextState, 1000002);
  assert.equal(observation.sent.length, 1);
  assert.match(observation.sent[0].title, /RAM/);
  observation = await check('both-suppressed', 99, 99, observation.result.nextState, 1000003);
  assert.equal(observation.sent.length, 0);
  observation = await check('independent-repeat-disk', 99, 99, observation.result.nextState, 1900001);
  assert.equal(observation.sent.length, 1);
  observation = await check('independent-repeat-ram', 99, 99, observation.result.nextState, 1900002);
  assert.equal(observation.sent.length, 1);
  observation = await check('recover-both', 101, 101, observation.result.nextState, 1900003);
  assert.equal(observation.sent.length, 0);
  observation = await check('rearm-both', 100, 100, observation.result.nextState, 1900004);
  assert.equal(observation.sent.length, 2);
  const state = observation.result.nextState;
  observation = await check('clock-regression', 100, 100, state, 1000000);
  assert.equal(observation.sent.length, 2);
  observation = await check('test-does-not-mutate-suppression', 500, 500, state, 1900005, { testAlert: true });
  assert.equal(observation.result.nextState, null);
  assert.equal(observation.sent.length, 2);
  assert.ok(observation.sent.every(m => m.title.startsWith('TEST:')));
  observation = await check('disk-rejected-ram-delivered', 100, 100, null, 2000000,
    { delivery: m => m.title.includes('DISK') ? { ok: false, statusCode: 429 } : { ok: true, statusCode: 200 } });
  assert.equal(observation.sent.length, 2);
  assert.equal(observation.result.ok, false);
  assert.equal(observation.result.nextState.disk, null);
  assert.equal(observation.result.nextState.ram.lastSentAt, 2000000);
  observation = await check('retry-only-undelivered-disk', 100, 100, observation.result.nextState, 2000001);
  assert.equal(observation.sent.length, 1);
  observation = await check('failed-disk-measurement-does-not-hide-ram', 100, 100, null, 2000002,
    { disk: { ok: false, error: 'filesystem_read_failed' } });
  assert.equal(observation.result.ok, false);
  assert.equal(observation.sent.length, 1);
  observation = await check('failed-ram-measurement-does-not-hide-disk', 100, 100, null, 2000003,
    { ram: { ok: false, error: 'memory_read_failed' } });
  assert.equal(observation.result.ok, false);
  assert.equal(observation.sent.length, 1);
  const originalRequest = https.request;
  const wire = [];
  try {
    https.request = (url, options, callback) => {
      const request = new EventEmitter();
      request.end = body => {
        wire.push({ method: options.method, priority: options.headers.Priority, title: options.headers.Title, body });
        const response = new EventEmitter();
        response.statusCode = 200;
        response.resume = () => {};
        callback(response);
        queueMicrotask(() => response.emit('end'));
      };
      return request;
    };
    const result = await checkHost({ disk: disk(100), ram: ram(100), previous: null,
      now: 3000000, hostname: 'fixture-host', notify: message => publish('synthetic-topic', message) });
    assert.equal(result.ok, true);
    assert.equal(wire.length, 2);
    assert.ok(wire.every(m => m.method === 'POST' && m.priority === 'max' && m.body.includes('90.00% used')));
    let attempts = 0;
    https.request = () => { attempts++; throw new Error('synthetic transport construction failure'); };
    const failure = await checkHost({ disk: disk(100), ram: ram(100), previous: null,
      now: 3000001, hostname: 'fixture-host', notify: message => publish('synthetic-topic', message) });
    assert.equal(attempts, 2);
    assert.equal(failure.ok, false);
    assert.equal(failure.nextState.disk, null);
    assert.equal(failure.nextState.ram, null);
    const badEndpoint = await publish('https://user:secret@example.invalid/topic', { title: 'test', message: 'test' });
    assert.equal(badEndpoint.ok, false);
    assert.equal(attempts, 2);
    for (const failureMode of ['request-error', 'response-error', 'http-rejection']) {
      https.request = (url, options, callback) => {
        const request = new EventEmitter();
        request.end = () => queueMicrotask(() => {
          if (failureMode === 'request-error') return request.emit('error', new Error('synthetic failure'));
          const response = new EventEmitter();
          response.resume = () => {};
          response.statusCode = 429;
          callback(response);
          response.emit(failureMode === 'response-error' ? 'error' : 'end', new Error('synthetic failure'));
        });
        return request;
      };
      const response = await publish('synthetic-topic', { title: 'test', message: 'test' });
      assert.equal(response.ok, false, failureMode);
    }
  } finally { https.request = originalRequest; }
  const receipt = { at: new Date().toISOString(), observations, interceptedWire: wire,
    realDisk: measureDisk(fs.statfsSync('/', { bigint: true })),
    realRam: measureMemory(fs.readFileSync('/proc/meminfo', 'utf8')),
    limit: 'No real capacity exhaustion or phone delivery exercised.' };
  fs.writeFileSync(path.join(__dirname, '../combined-consumer-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ passed: observations.map(o => o.label),
    interceptedWire: wire, realDisk: receipt.realDisk, realRam: receipt.realRam }));
})().catch(error => { console.error(error); process.exitCode = 1; });
