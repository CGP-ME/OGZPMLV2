#!/usr/bin/env node
/**
 * supervisor-daemon.js — PM2 entry point for the system supervisor
 * ================================================================
 *
 * Runs as a separate PM2 process named `ogz-supervisor`. Lives outside
 * the bot's failure domain — if the bot zombies or crashes, the
 * supervisor is still alive to detect it and (eventually) restart it.
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
const { load: loadConfig } = require('../foundation/ConfigLoader');
const supervisorConfig = loadConfig({ silent: true, role: 'supervisor' }).config.services.supervisor;
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
    execFile('pm2', ['jlist'], { timeout: PM2_LIST_TIMEOUT_MS }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(stdout)); }
      catch (e) { reject(new Error(`pm2 jlist parse: ${e.message}`)); }
    });
  });
}

function pm2Restart(name) {
  return new Promise((resolve, reject) => {
    execFile('pm2', ['restart', name], { timeout: PM2_RESTART_TIMEOUT_MS }, (err, stdout, stderr) => {
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
        await pm2Restart(RELAY_PROCESS);
        return true;
      } catch (err) {
        console.error(`[Supervisor] escalate ssl-server failed:`, err.message);
        return false;
      }
    },
  };
}

function buildPm2ProcessSubsystem(name, processName) {
  return {
    name,
    async getHealth() {
      try {
        const list = await pm2List();
        const proc = list.find(p => p.name === processName);
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
        const ok = status === 'online';
        // Healthy-but-flapping within the configured restart/uptime bounds → DEGRADED.
        const flapping = restarts > supervisorConfig.flappingRestartThreshold
          && uptime < supervisorConfig.flappingUptimeWindowMs;
        return {
          status: ok ? (flapping ? STATES.DEGRADED : STATES.HEALTHY) : STATES.UNHEALTHY,
          timestamp: Date.now(),
          details: { pm2Status: status, restarts, uptimeMs: uptime },
          lastSuccessAt: ok ? Date.now() : 0,
          failureReason: ok
            ? (flapping ? `${restarts} restarts with uptime ${uptime}ms inside configured flapping window` : null)
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
      try {
        await pm2Restart(processName);
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
    };
  }
}

/* ===== bootstrap ========================================================= */

function main() {
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

  // Register subsystems
  sv.register(buildSslServerSubsystem());
  sv.register(buildPm2ProcessSubsystem('pm2-bot', BOT_PROCESS));
  sv.register(buildPm2ProcessSubsystem('pm2-relay', RELAY_PROCESS));

  // Lifecycle: graceful shutdown on SIGTERM/SIGINT
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Supervisor] received ${signal}, shutting down`);
    sv.stop();
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

main();
