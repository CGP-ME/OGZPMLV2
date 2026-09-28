'use strict';

// Host disk/RAM notification only. No bot imports, PM2 actions or file cleanup.
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');

const REPEAT_MS = 15 * 60 * 1000;

function measureDisk(stats) {
  const { blocks, bfree, bavail, bsize } = stats || {};
  if (![blocks, bfree, bavail, bsize].every(n => typeof n === 'bigint')
      || blocks <= 0n || bsize <= 0n || bfree < 0n || bfree > blocks
      || bavail < 0n || bavail > bfree) {
    return { ok: false, error: 'filesystem_counters_invalid' };
  }
  const used = blocks - bfree;
  const usable = used + bavail;
  if (usable <= 0n) return { ok: false, error: 'filesystem_capacity_unavailable' };
  return {
    ok: true,
    critical: bavail * 10n <= usable,
    usedPercent: Number(used * 10000n / usable) / 100,
    availableBytes: (bavail * bsize).toString(),
    totalBytes: (blocks * bsize).toString(),
  };
}

function measureMemory(meminfo) {
  if (typeof meminfo !== 'string') return { ok: false, error: 'memory_counters_unavailable' };
  const totals = [...meminfo.matchAll(/^MemTotal:\s+(\d+) kB\s*$/gm)];
  const available = [...meminfo.matchAll(/^MemAvailable:\s+(\d+) kB\s*$/gm)];
  if (totals.length !== 1 || available.length !== 1) {
    return { ok: false, error: 'memory_counters_missing_or_duplicated' };
  }
  const totalKiB = BigInt(totals[0][1]), availableKiB = BigInt(available[0][1]);
  if (totalKiB <= 0n || availableKiB > totalKiB) return { ok: false, error: 'memory_counters_invalid' };
  return {
    ok: true,
    critical: availableKiB * 10n <= totalKiB,
    usedPercent: Number((totalKiB - availableKiB) * 10000n / totalKiB) / 100,
    availableBytes: (availableKiB * 1024n).toString(),
    totalBytes: (totalKiB * 1024n).toString(),
  };
}

function publish(topic, notification) {
  return new Promise(resolve => {
    let endpoint;
    try {
      endpoint = /^https:\/\//i.test(topic) ? new URL(topic)
        : new URL(`https://ntfy.sh/${encodeURIComponent(topic)}`);
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
        resolve({ ok: false, error: 'ntfy_url_credentials_not_supported' });
        return;
      }
    } catch {
      resolve({ ok: false, error: 'ntfy_endpoint_invalid' });
      return;
    }
    const body = notification.message;
    let request;
    try {
      request = https.request(endpoint, {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'text/plain; charset=utf-8',
          'Content-Length': Buffer.byteLength(body), Title: notification.title, Priority: 'max' },
      }, response => {
        response.resume();
        response.on('end', () => resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          statusCode: response.statusCode,
        }));
        response.on('error', () => resolve({ ok: false, error: 'ntfy_response_failed' }));
      });
      request.on('error', () => resolve({ ok: false, error: 'ntfy_request_failed' }));
      request.end(body);
    } catch {
      resolve({ ok: false, error: 'ntfy_request_failed' });
    }
  });
}

async function checkResource({ resource, measurement, previous, now, hostname, notify, testAlert = false }) {
  if (!measurement.ok) return { ...measurement, [resource]: measurement };
  const recordedAt = previous?.lastSentAt;
  const repeatDue = !Number.isFinite(recordedAt) || recordedAt > now || now - recordedAt >= REPEAT_MS;
  const due = testAlert || (measurement.critical && (previous?.critical !== true || repeatDue));
  let delivery = null;
  if (due) {
    const availableGiB = (Number(measurement.availableBytes) / (1024 ** 3)).toFixed(2);
    const label = resource === 'disk' ? 'DISK SPACE' : 'RAM';
    const target = resource === 'disk' ? '/' : 'RAM (MemAvailable, including reclaimable cache)';
    delivery = await notify({
      title: `${testAlert ? 'TEST: ' : ''}OGZ VPS ${label} ALARM`,
      message: `${testAlert ? 'TEST ONLY - real current reading. ' : ''}${hostname}: ${target} is ${measurement.usedPercent.toFixed(2)}% used, ${availableGiB} GiB available. Alarm threshold: 90% used. No files deleted; no bot or service stopped.`,
    });
    if (!delivery.ok) return { ok: false, [resource]: measurement, delivery, error: `${resource}_alarm_delivery_failed` };
  }
  return {
    ok: true, [resource]: measurement, delivery, testAlert,
    // A delivery test must never suppress the next real capacity alarm.
    nextState: testAlert ? null : { critical: measurement.critical,
      lastSentAt: measurement.critical ? (due ? now : recordedAt) : null },
  };
}

function checkDisk({ stats, ...options }) {
  return checkResource({ ...options, resource: 'disk', measurement: measureDisk(stats) });
}

async function checkHost({ disk, ram, previous, ...options }) {
  // A failed measurement or rejected notification for one resource must not
  // suppress the other. Each retains its own last successful delivery time.
  const diskResult = await checkResource({ ...options, resource: 'disk', measurement: disk, previous: previous?.disk });
  const ramResult = await checkResource({ ...options, resource: 'ram', measurement: ram, previous: previous?.ram });
  return {
    ok: diskResult.ok && ramResult.ok, disk: diskResult, ram: ramResult,
    nextState: options.testAlert ? null : {
      disk: diskResult.nextState || previous?.disk || null,
      ram: ramResult.nextState || previous?.ram || null,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const testAlert = args[0] === '--test-alert';
  if (args.length !== 1 || (!testAlert && args[0] !== '--check')) {
    console.error('Usage: node scripts/vps-disk-alarm.js --check|--test-alert');
    process.exitCode = 1;
    return;
  }
  const root = path.resolve(__dirname, '..');
  const credentials = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
  const topic = typeof credentials.NTFY_TOPIC === 'string' ? credentials.NTFY_TOPIC.trim() : '';
  if (!topic) {
    console.error('CAPACITY ALARM UNAVAILABLE: NTFY_TOPIC missing from repository credential source');
    process.exitCode = 1;
    return;
  }
  const stateFile = '/var/lib/ogz-disk-alarm/state.json';
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('CAPACITY ALARM: prior notification state unreadable; repeat suppression unavailable');
  }
  let disk, ram;
  try { disk = measureDisk(fs.statfsSync('/', { bigint: true })); }
  catch (error) { disk = { ok: false, error: 'filesystem_read_failed', code: error.code || error.name }; }
  try { ram = measureMemory(fs.readFileSync('/proc/meminfo', 'utf8')); }
  catch (error) { ram = { ok: false, error: 'memory_read_failed', code: error.code || error.name }; }
  // Keep a local reading even when notification transport cannot complete.
  console.log(JSON.stringify({ at: new Date().toISOString(), event: 'capacity_reading', disk, ram }));
  const result = await checkHost({ disk, ram, previous,
    now: Date.now(), hostname: os.hostname(), testAlert, notify: notification => publish(topic, notification) });
  console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
  if (result.nextState) {
    const temporary = `${stateFile}.next`;
    fs.writeFileSync(temporary, JSON.stringify(result.nextState) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, stateFile);
  }
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) main().catch(error => {
  // Never print credential values, request URLs or raw provider response bodies.
  console.error(JSON.stringify({ at: new Date().toISOString(), error: 'capacity_alarm_check_failed', code: error.code || error.name }));
  process.exitCode = 1;
});

module.exports = { measureDisk, measureMemory, checkDisk, checkHost, publish };
