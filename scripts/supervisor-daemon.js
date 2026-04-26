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
 * Config via env:
 *   SUPERVISOR_POLL_MS                — supervisor poll cadence (default 30000)
 *   SUPERVISOR_DEGRADE_MS             — red duration before UNHEALTHY (default 120000)
 *   SUPERVISOR_HEAL_ATTEMPTS          — heal tries before DEAD (default 3)
 *   SUPERVISOR_HEALTH_URL             — SSL health endpoint (default https://localhost:443/api/health)
 *   SUPERVISOR_BOT_PROCESS            — PM2 name for bot (default ogz-prime-v2)
 *   SUPERVISOR_RELAY_PROCESS          — PM2 name for relay (default ogz-websocket)
 *   SUPERVISOR_DEADMAN_URL            — Healthchecks.io URL for external deadman (optional)
 *   SUPERVISOR_LEDGER_PATH            — JSONL output (default data/supervisor-ledger.jsonl)
 *   SUPERVISOR_ALERT_HOOK             — path to JS module exporting onAlert(name, event)
 *
 * @date 2026-04-26
 */

'use strict';

const { execFile } = require('child_process');
const https = require('https');
const http = require('http');
const path = require('path');
const { Supervisor, STATES } = require('../core/Supervisor');

const env = (key, def) => (process.env[key] !== undefined ? process.env[key] : def);
const envInt = (key, def) => {
  const v = parseInt(env(key, ''), 10);
  return Number.isFinite(v) && v > 0 ? v : def;
};

const HEALTH_URL = env('SUPERVISOR_HEALTH_URL', 'https://localhost:443/api/health');
const BOT_PROCESS = env('SUPERVISOR_BOT_PROCESS', 'ogz-prime-v2');
const RELAY_PROCESS = env('SUPERVISOR_RELAY_PROCESS', 'ogz-websocket');
const DEADMAN_URL = env('SUPERVISOR_DEADMAN_URL', null);
const LEDGER_PATH = env('SUPERVISOR_LEDGER_PATH', 'data/supervisor-ledger.jsonl');
const POLL_MS = envInt('SUPERVISOR_POLL_MS', 30000);
const DEGRADE_MS = envInt('SUPERVISOR_DEGRADE_MS', 120000);
const HEAL_ATTEMPTS = envInt('SUPERVISOR_HEAL_ATTEMPTS', 3);

/* ===== HTTP fetch with timeout =========================================== */

function httpJsonGet(url, timeoutMs = 5000) {
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
    execFile('pm2', ['jlist'], { timeout: 5000 }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(stdout)); }
      catch (e) { reject(new Error(`pm2 jlist parse: ${e.message}`)); }
    });
  });
}

function pm2Restart(name) {
  return new Promise((resolve, reject) => {
    execFile('pm2', ['restart', name], { timeout: 15000 }, (err, stdout, stderr) => {
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
        const data = await httpJsonGet(HEALTH_URL, 5000);
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
        await pm2Restart('ogz-ssl-server');
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
        // Healthy-but-flapping (restarts >5 in last hour) → DEGRADED
        const flapping = restarts > 5 && uptime < 3600_000;
        return {
          status: ok ? (flapping ? STATES.DEGRADED : STATES.HEALTHY) : STATES.UNHEALTHY,
          timestamp: Date.now(),
          details: { pm2Status: status, restarts, uptimeMs: uptime },
          lastSuccessAt: ok ? Date.now() : 0,
          failureReason: ok ? (flapping ? `${restarts} restarts in <1h` : null) : `pm2 status=${status}`,
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

/* ===== alert hook (env-gated) ============================================ */

function loadAlertHook() {
  const hookPath = env('SUPERVISOR_ALERT_HOOK', null);
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
    console.error(`[Supervisor] alert hook load failed (${hookPath}):`, err.message);
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
  console.log(`[Supervisor] deadman: ${DEADMAN_URL || '(disabled)'}`);
  console.log(`[Supervisor] ledger: ${LEDGER_PATH}`);

  const sv = new Supervisor({
    label: '[Supervisor]',
    onAlert: loadAlertHook(),
    options: {
      pollIntervalMs: POLL_MS,
      degradeThresholdMs: DEGRADE_MS,
      unhealthyHealAttempts: HEAL_ATTEMPTS,
      ledgerPath: LEDGER_PATH,
      deadmanHeartbeatUrl: DEADMAN_URL,
      deadmanHeartbeatMs: 60_000,
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
    setTimeout(() => process.exit(0), 200);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Surface uncaught errors but don't exit — PM2 will restart on actual exit
  process.on('uncaughtException', (err) => {
    console.error('[Supervisor] uncaughtException:', err.stack || err.message);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[Supervisor] unhandledRejection:', reason);
  });

  sv.start();
  console.log('[Supervisor] daemon running');
}

main();
