#!/usr/bin/env node
/**
 * supervisor-daemon.js — PM2 entry point for the system supervisor
 * ================================================================
 *
 * Runs as a separate PM2 process named `ogz-supervisor`. Lives outside
 * the bot's failure domain — if the bot zombies or crashes, the
 * supervisor remains available to notify the operator about a stopped bot.
 *
 * Subsystems monitored (MVP — Phase 5):
 *   1. ssl-server     — HTTP GET /api/health on the bot's SSL endpoint
 *   2. pm2-bot        — pm2 jlist parsed for ogz-prime-v2 status
 *   3. pm2-relay      — pm2 jlist parsed for ogz-websocket status
 *
 * Future (Phase 8):
 *   - In-process broker WS state via dedicated /api/health/brokers
 *   - Data freshness via /api/health/feed
 *   - Pattern memory write success
 *   - Decision ledger growth rate
 *
 * Spec: ogz-meta/specs/resilience-and-supervision.md
 *
 * Config is resolved by ConfigLoader. Static service behavior comes from
 * config/internals.json; the optional deadman capability comes from .env.
 *
 * @date 2026-04-26
 */

'use strict';

const RuntimeAuditSink = require('../core/RuntimeAuditSink');
const runtimeAuditSink = new RuntimeAuditSink({
  processRole: 'ogz-supervisor',
  phase: 'configuration_source',
});

function captureSupervisorFailure(eventType, input, extra = {}) {
  return runtimeAuditSink.capture(eventType, input, {
    processRole: 'ogz-supervisor',
    phase: runtimeAuditSink.phase,
    runtimeScope: runtimeAuditSink.phase,
    extra,
  });
}

const earlyUncaughtException = (error) => {
  captureSupervisorFailure('uncaughtException', error);
  console.error('[Supervisor] Bootstrap exception:', runtimeAuditSink.redactForOutput(error));
  process.exit(1);
};
const earlyUnhandledRejection = (reason, promise) => {
  captureSupervisorFailure('unhandledRejection', reason, {
    promise: Object.prototype.toString.call(promise),
  });
  console.error(
    '[Supervisor] Bootstrap rejection:',
    runtimeAuditSink.redactForOutput(reason),
    `promise=${Object.prototype.toString.call(promise)}`
  );
  process.exit(1);
};
process.on('uncaughtException', earlyUncaughtException);
process.on('unhandledRejection', earlyUnhandledRejection);

const { execFile } = require('child_process');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');
const { load: loadConfig } = require('../foundation/ConfigLoader');
const supervisorConfigSnapshot = loadConfig({ silent: true, role: 'supervisor' });
runtimeAuditSink.bindConfiguration(supervisorConfigSnapshot);
const runtimeConfig = supervisorConfigSnapshot.config;
const supervisorConfig = runtimeConfig.services.supervisor;
const notificationConfig = runtimeConfig.services.notifications;
const { Supervisor, STATES } = require('../core/Supervisor');
runtimeAuditSink.setPhase('service_initialization');

const HEALTH_URL = supervisorConfig.healthUrl;
const BOT_PROCESS = supervisorConfig.botProcess;
const RELAY_PROCESS = supervisorConfig.relayProcess;
const DEADMAN_URL = supervisorConfig.deadmanUrl;
const LEDGER_PATH = supervisorConfig.ledgerPath;
const POLL_MS = supervisorConfig.pollMs;
const DEGRADE_MS = supervisorConfig.degradeMs;
const HEAL_ATTEMPTS = supervisorConfig.healAttempts;
const HEALTH_REQUEST_TIMEOUT_MS = supervisorConfig.healthRequestTimeoutMs;
const PM2_LIST_TIMEOUT_MS = supervisorConfig.pm2ListTimeoutMs;
const PM2_RESTART_TIMEOUT_MS = supervisorConfig.pm2RestartTimeoutMs;
const SHUTDOWN_DELAY_MS = supervisorConfig.shutdownDelayMs;

/* ===== HTTP fetch with timeout =========================================== */

function httpJsonGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    // For self-signed local certs (the SSL server uses one), accept insecure.
    // The supervisor calling localhost via TLS isn't a security boundary —
    // it's an intra-host healthcheck. Don't fail health on cert validation.
    const opts = url.startsWith('https') ? { rejectUnauthorized: false } : {};
    const req = lib.get(url, opts, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`bad JSON: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout ${timeoutMs}ms`)));
  });
}

/* ===== PM2 process query ================================================= */

function pm2List() {
  return new Promise((resolve, reject) => {
    execFile('pm2', ['jlist'], { timeout: PM2_LIST_TIMEOUT_MS, env: { ...process.env, PM2_HOME: supervisorConfig.pm2Home } }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(stdout)); }
      catch (e) { reject(new Error(`pm2 jlist parse: ${e.message}`)); }
    });
  });
}

function pm2RestartRelay() {
  // ConfigLoader accepts only literal application names here. An anchored PM2
  // name pattern cannot fall back to a namespace, numeric ID, or "all" selector.
  const name = `/^${RELAY_PROCESS}$/`;
  return new Promise((resolve, reject) => {
    execFile('pm2', ['restart', name], { timeout: PM2_RESTART_TIMEOUT_MS, env: { ...process.env, PM2_HOME: supervisorConfig.pm2Home } }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`pm2 restart ${name}: ${err.message}`));
      resolve({ stdout, stderr });
    });
  });
}

/* ===== subsystem definitions ============================================= */

function buildSslServerSubsystem() {
  return {
    name: 'ssl-server',
    async getHealth() {
      try {
        const data = await httpJsonGet(HEALTH_URL, HEALTH_REQUEST_TIMEOUT_MS);
        // Expect at least { status: 'healthy' | 'ok', uptime, memory }.
        // Tolerate any 200-OK body with status field — the ogzprime-ssl-server
        // returns { status: 'healthy', uptime, memory, websockets, timestamp }.
        const ok = data && (data.status === 'healthy' || data.status === 'ok');
        return {
          status: ok ? STATES.HEALTHY : STATES.UNHEALTHY,
          timestamp: Date.now(),
          details: data,
          lastSuccessAt: ok ? Date.now() : 0,
          failureReason: ok ? null : `unexpected health body status=${data?.status}`,
        };
      } catch (err) {
        return {
          status: STATES.UNHEALTHY,
          timestamp: Date.now(),
          details: { url: HEALTH_URL },
          lastSuccessAt: 0,
          failureReason: err.message,
        };
      }
    },
    // No selfHeal for SSL server — restart is the only path
    async escalate() {
      try {
        await pm2RestartRelay();
        return true;
      } catch (err) {
        console.error(`[Supervisor] escalate ssl-server failed:`, err.message);
        return false;
      }
    },
  };
}

function buildPm2ProcessSubsystem(name, processName, recovery = null) {
  let lastObservedRestarts = null;
  let restartObservationStartedAt = null;
  let observedRestarts = [];
  return {
    name,
    async getHealth() {
      try {
        const list = await pm2List();
        const proc = list.find(p => p.name === processName);
        if (recovery) recovery.observe(proc);
        if (!proc) {
          return {
            status: STATES.DEAD,
            timestamp: Date.now(),
            details: { processName },
            lastSuccessAt: 0,
            failureReason: `process ${processName} not in pm2 list`,
          };
        }
        const status = proc.pm2_env?.status;
        const restarts = proc.pm2_env?.restart_time || 0;
        const uptime = proc.pm2_env?.pm_uptime ? (Date.now() - proc.pm2_env.pm_uptime) : 0;
        const observedAt = Number(process.hrtime.bigint() / 1000000n);
        // The first poll establishes a baseline; PM2 does not timestamp historical restarts.
        if (restartObservationStartedAt === null) restartObservationStartedAt = Date.now();
        if (lastObservedRestarts !== null && restarts > lastObservedRestarts) {
          observedRestarts.push({ at: observedAt, count: restarts - lastObservedRestarts });
        }
        lastObservedRestarts = restarts;
        observedRestarts = observedRestarts.filter(sample => (
          observedAt - sample.at < supervisorConfig.flappingUptimeWindowMs
        ));
        const recentRestarts = observedRestarts.reduce((count, sample) => count + sample.count, 0);
        const ok = status === 'online';
        // PM2's lifetime counter is not a count of restarts inside this window.
        const flapping = recentRestarts > supervisorConfig.flappingRestartThreshold
          && uptime < supervisorConfig.flappingUptimeWindowMs;
        return {
          status: ok ? (flapping ? STATES.DEGRADED : STATES.HEALTHY) : STATES.UNHEALTHY,
          timestamp: Date.now(),
          details: { pm2Status: status, restarts, recentRestarts, restartObservationStartedAt, uptimeMs: uptime },
          lastSuccessAt: ok ? Date.now() : 0,
          failureReason: ok
            ? (flapping ? `${recentRestarts} observed restarts inside configured flapping window; lifetime=${restarts}` : null)
            : `pm2 status=${status}`,
        };
      } catch (err) {
        return {
          status: STATES.UNHEALTHY,
          timestamp: Date.now(),
          details: { processName },
          lastSuccessAt: 0,
          failureReason: `pm2 query failed: ${err.message}`,
        };
      }
    },
    async escalate() {
      if (recovery) {
        try { return await recovery.request(); }
        catch (error) {
          console.error('[Supervisor] Bot notice failed:', runtimeAuditSink.redactForOutput(error));
          return { skipped: true, reason: 'bot_notice_failed' };
        }
      }
      try {
        const list = await pm2List();
        const proc = list.find(p => p.name === processName);
        // Restart history can raise an alert, but cannot justify restarting an online process.
        if (proc?.pm2_env?.status === 'online') {
          return { skipped: true, reason: `${processName} is online in fresh PM2 status` };
        }
        await pm2RestartRelay();
        return true;
      } catch (err) {
        console.error(`[Supervisor] escalate ${processName} failed:`, err.message);
        return false;
      }
    },
  };
}

/* ===== alert hook (config-gated) ========================================= */

function loadAlertHook() {
  const hookPath = supervisorConfig.alertHookPath;
  if (!hookPath) {
    return (name, event) => {
      console.log(`[Supervisor] ALERT (no hook configured): ${name} ${event.from} -> ${event.to}`);
      return { loggedOnly: true, reason: 'no_alert_hook' };
    };
  }
  try {
    const resolved = path.resolve(hookPath);
    const mod = require(resolved);
    if (typeof mod === 'function') return mod;
    if (typeof mod.onAlert === 'function') return mod.onAlert;
    throw new Error(`alert hook module must export a function or {onAlert}`);
  } catch (err) {
    captureSupervisorFailure('optionalServiceInitializationFailed', err, {
      service: 'alert_hook',
      continued: true,
      hookPath,
    });
    console.error('[Supervisor] Alert hook load failed:', runtimeAuditSink.redactForOutput(err));
    return (name, event) => {
      console.log(`[Supervisor] ALERT (hook failed to load): ${name} ${event.from} -> ${event.to}`);
      return { loggedOnly: true, reason: 'alert_hook_load_failed' };
    };
  }
}

/* ===== Advisory notices for a stopped bot =========================== */

function botProcessIdentity(proc) {
  if (!proc) return null;
  const env = proc.pm2_env || {};
  return {
    name: proc.name, id: proc.pm_id, script: env.pm_exec_path, cwd: env.pm_cwd,
    createdAt: env.created_at, startedAt: env.pm_uptime, restarts: env.restart_time,
  };
}

function botNeedsManualStart(proc) {
  const env = proc?.pm2_env;
  // PM2 7.0.3 clears created_at when restart attempts are exhausted, then its
  // delay handling can overwrite "errored" with "waiting restart" even though
  // it schedules no restart. An ordinary delayed recovery keeps created_at.
  return !!proc && Number.isInteger(proc.pm_id) && !proc.pid
    && (['stopped', 'errored'].includes(env?.status)
      || (env?.status === 'waiting restart' && env.created_at === null));
}

function sendRecoveryNotification(channel, request) {
  const config = notificationConfig;
  if (config.enabled !== true) return Promise.resolve({ status: 'disabled_by_config' });
  const url = new URL(supervisorConfig.recovery.dashboardUrl);
  url.searchParams.set('recovery', request.id);
  const text = `${BOT_PROCESS} is down (PM2: ${request.pm2Status}). `
    + 'Start it manually only if you intend to bring it back. The supervisor cannot start it. '
    + 'Review and acknowledge this notice in the authenticated dashboard. Notice: ' + request.id;
  let endpoint, body, headers, timeoutMs;
  if (channel === 'telegram') {
    if (!config.telegramBotToken || !config.telegramChatId) return Promise.resolve({ status: 'unconfigured' });
    endpoint = new URL(`https://${config.telegramTransport.hostname}:${config.telegramTransport.port}/bot${config.telegramBotToken}/sendMessage`);
    body = JSON.stringify({ chat_id: config.telegramChatId, text,
      reply_markup: { inline_keyboard: [[{ text: 'Review stopped-bot notice', url: url.href }]] } });
    headers = { 'Content-Type': 'application/json' };
    timeoutMs = config.telegram.requestTimeoutMs;
  } else {
    if (!config.ntfyTopic) return Promise.resolve({ status: 'unconfigured' });
    endpoint = new URL(config.ntfyTopic.includes('://') ? config.ntfyTopic
      : `${config.ntfyTransport.defaultOrigin}/${encodeURIComponent(config.ntfyTopic)}`);
    body = text;
    headers = { 'Content-Type': 'text/plain; charset=utf-8', Title: 'Bot is down; manual start required',
      Click: url.href, Actions: `view, Review stopped-bot notice, ${url.href}` };
    timeoutMs = config.ntfy.requestTimeoutMs;
  }
  return new Promise(resolve => {
    let finished = false;
    const finish = result => { if (!finished) { finished = true; clearTimeout(deadline); resolve(result); } };
    let deadline;
    const req = (endpoint.protocol === 'https:' ? https : http).request(endpoint, { method: 'POST', headers }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        data += chunk;
        if (data.length > supervisorConfig.recovery.maximumBodyBytes) {
          finish({ status: 'failed', error: 'response_too_large' }); req.destroy();
        }
      });
      res.on('error', () => finish({ status: 'failed', error: 'response_interrupted' }));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300)
          return finish({ status: 'failed', error: `http_${res.statusCode}` });
        let response;
        try { response = JSON.parse(data); }
        catch (_) { return finish({ status: 'failed', error: 'response_not_json' }); }
        if (channel === 'telegram' && response.ok !== true)
          return finish({ status: 'failed', error: 'telegram_rejected' });
        if (channel === 'ntfy' && response.event !== 'message')
          return finish({ status: 'failed', error: 'ntfy_not_accepted' });
        finish({ status: 'accepted_by_provider', messageId: channel === 'telegram'
          ? response.result?.message_id : response.id });
      });
    });
    // A provider response confirms acceptance, never that a human saw it.
    req.on('error', () => finish({ status: 'failed', error: 'transport_failed' }));
    deadline = setTimeout(() => { finish({ status: 'failed', error: 'timeout' }); req.destroy(); }, timeoutMs);
    req.end(body);
  });
}

function buildBotRecovery(sv) {
  const restored = sv.readBotStartRequest();
  let current = restored.request || null;
  let ledgerError = restored.error || null;
  let notifying = false;
  const identityMatches = proc => JSON.stringify(botProcessIdentity(proc)) === JSON.stringify(current?.identity);
  const save = next => {
    if (!sv.recordBotStartRequest(next)) {
      ledgerError = 'bot_start_receipt_write_failed';
      console.error('[Supervisor] Bot notice receipt failed; acknowledgment is unavailable.');
      return false;
    }
    current = next;
    return true;
  };

  async function notify() {
    if (notifying || ledgerError || !current || current.status !== 'pending') return;
    notifying = true;
    const id = current.id;
    try {
      for (const channel of ['telegram', 'ntfy']) {
        if (current.id !== id || current.status !== 'pending') break;
        const prior = current.notifications[channel];
        if (prior?.status === 'accepted_by_provider') continue;
        if (prior?.attemptedAt && Date.now() - prior.attemptedAt < supervisorConfig.deadCooldownMs) continue;
        const attemptedAt = Date.now();
        let result;
        try { result = await sendRecoveryNotification(channel, current); }
        catch (_) { result = { status: 'failed', error: 'notification_configuration_or_transport_failed' }; }
        if (current.id !== id) break;
        if (!save({ ...current, notifications: { ...current.notifications, [channel]: { ...result, attemptedAt } } })) break;
        console.log(`[Supervisor] Bot notice ${id}: ${channel} ${result.status}`);
      }
    } finally { notifying = false; }
  }

  function observe(proc) {
    if (!current || ledgerError || current.status === 'recovered') return;
    if (proc?.pm2_env?.status === 'online') {
      save({ ...current, status: 'recovered', observedPid: proc.pid, updatedAt: Date.now() });
    }
  }

  async function request() {
    if (ledgerError) return { skipped: true, reason: ledgerError };
    const list = await pm2List();
    const proc = list.find(p => p.name === BOT_PROCESS);
    observe(proc);
    if (proc && !botNeedsManualStart(proc)) return { skipped: true, reason: `bot_not_stopped:${proc.pm2_env?.status}` };
    if (!current || current.status === 'recovered' || !identityMatches(proc)) {
      const request = { id: crypto.randomUUID(), processName: BOT_PROCESS, identity: botProcessIdentity(proc),
        pm2Status: proc?.pm2_env?.status || 'missing', advisory: true,
        status: 'pending', createdAt: Date.now(),
        notifications: { dashboard: { status: 'available' } } };
      if (!save(request)) return { skipped: true, reason: ledgerError };
    }
    await notify();
    return { skipped: true, reason: `bot_start_request:${current.id}:${current.status}` };
  }

  function acknowledge(id) {
    if (ledgerError) return { statusCode: 503, error: ledgerError };
    if (!current || current.id !== id || current.status !== 'pending')
      return { statusCode: 409, error: 'notice_not_pending', request: current };
    if (!save({ ...current, status: 'acknowledged', acknowledgmentSource: 'dashboard_session', acknowledgedAt: Date.now() }))
      return { statusCode: 503, error: ledgerError };
    return { statusCode: 200, request: current };
  }
  return { request, observe, acknowledge, get: () => ({ request: current, error: ledgerError, pollMs: POLL_MS }) };
}

async function startRecoveryControlServer(recovery) {
  const config = supervisorConfig.recovery;
  const socketPath = path.resolve(config.socketPath);
  fs.mkdirSync(path.dirname(socketPath), { recursive: true, mode: 0o700 });
  // A crashed process can leave a socket inode. Never unlink a live listener,
  // another file type, or a socket owned by another user.
  try {
    const stat = fs.lstatSync(socketPath);
    const stale = stat.isSocket() && stat.uid === process.getuid() && await new Promise(resolve => {
      const probe = net.connect(socketPath);
      probe.once('connect', () => { probe.destroy(); resolve(false); });
      probe.once('error', error => resolve(error.code === 'ECONNREFUSED'));
      probe.setTimeout(config.requestTimeoutMs, () => { probe.destroy(); resolve(false); });
    });
    if (stale) fs.unlinkSync(socketPath);
  } catch (error) { if (error.code !== 'ENOENT') return Promise.reject(error); }

  const server = http.createServer((req, res) => {
    const send = (status, body) => {
      if (res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/recovery') return send(200, recovery.get());
    const match = /^\/recovery\/([a-f0-9-]{36})$/.exec(req.url);
    if (req.method !== 'POST' || !match) return send(404, { error: 'not_found' });
    let body = '';
    let oversized = false;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > config.maximumBodyBytes) { oversized = true; req.destroy(); }
    });
    req.on('error', () => { oversized = true; });
    req.on('end', () => {
      if (oversized) return;
      let decision;
      try { decision = JSON.parse(body).decision; }
      catch (_) { return send(400, { error: 'invalid_json' }); }
      if (decision !== 'acknowledge') return send(400, { error: 'acknowledgment_only' });
      const result = recovery.acknowledge(match[1]);
      send(result.statusCode, result);
    });
  });
  server.requestTimeout = config.requestTimeoutMs;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => { fs.chmodSync(socketPath, 0o600); resolve(); });
  });
  return server;
}

/* ===== bootstrap ========================================================= */

async function main() {
  console.log('[Supervisor] daemon booting');
  console.log(`[Supervisor] config: poll=${POLL_MS}ms degrade=${DEGRADE_MS}ms healAttempts=${HEAL_ATTEMPTS}`);
  console.log(`[Supervisor] health URL: ${HEALTH_URL}`);
  console.log(`[Supervisor] processes: bot=${BOT_PROCESS} relay=${RELAY_PROCESS}`);
  console.log(`[Supervisor] deadman: ${DEADMAN_URL ? 'enabled' : 'disabled'}`);
  console.log(`[Supervisor] ledger: ${LEDGER_PATH}`);

  const sv = new Supervisor({
    label: '[Supervisor]',
    onAlert: loadAlertHook(),
    options: {
      pollIntervalMs: POLL_MS,
      degradeThresholdMs: DEGRADE_MS,
      unhealthyHealAttempts: HEAL_ATTEMPTS,
      healCooldownMs: supervisorConfig.healCooldownMs,
      deadCooldownMs: supervisorConfig.deadCooldownMs,
      maxRestartsIn10min: supervisorConfig.maxRestartsIn10min,
      restartWindowMs: supervisorConfig.restartWindowMs,
      healthTimeoutMs: supervisorConfig.healthTimeoutMs,
      alertTimeoutMs: supervisorConfig.alertTimeoutMs,
      ledgerPath: LEDGER_PATH,
      deadmanHeartbeatUrl: DEADMAN_URL,
      deadmanHeartbeatMs: supervisorConfig.deadmanHeartbeatMs,
      deadmanRequestTimeoutMs: supervisorConfig.deadmanRequestTimeoutMs,
    },
  });

  const recovery = buildBotRecovery(sv);
  const controlServer = await startRecoveryControlServer(recovery);

  // Register subsystems
  sv.register(buildSslServerSubsystem());
  sv.register(buildPm2ProcessSubsystem('pm2-bot', BOT_PROCESS, recovery));
  sv.register(buildPm2ProcessSubsystem('pm2-relay', RELAY_PROCESS));

  // Lifecycle: graceful shutdown on SIGTERM/SIGINT
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Supervisor] received ${signal}, shutting down`);
    sv.stop();
    controlServer.close();
    setTimeout(() => process.exit(0), SHUTDOWN_DELAY_MS);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.removeListener('uncaughtException', earlyUncaughtException);
  process.removeListener('unhandledRejection', earlyUnhandledRejection);
  runtimeAuditSink.setPhase('runtime');

  // Surface uncaught errors but don't exit — PM2 will restart on actual exit
  process.on('uncaughtException', (err) => {
    captureSupervisorFailure('uncaughtException', err);
    console.error('[Supervisor] uncaughtException:', runtimeAuditSink.redactForOutput(err));
  });
  process.on('unhandledRejection', (reason, promise) => {
    captureSupervisorFailure('unhandledRejection', reason, {
      promise: Object.prototype.toString.call(promise),
    });
    console.error('[Supervisor] unhandledRejection:', runtimeAuditSink.redactForOutput(reason));
  });

  sv.start();
  console.log('[Supervisor] daemon running');
}

if (require.main === module) main().catch(earlyUncaughtException);
module.exports = { buildBotRecovery, buildPm2ProcessSubsystem, startRecoveryControlServer };
