/**
 * ResilientWebSocket.js — broker-agnostic WS lifecycle library
 * ============================================================
 *
 * Wraps a `ws` WebSocket with everything an exchange-grade data feed
 * needs:
 *
 *   - Exponential-backoff reconnect (1s, 2s, 4s, 8s, 16s, capped, infinite)
 *   - Auth handshake on every (re)connect with caller-supplied predicate
 *   - First-open vs reconnect semantics — caller's onAuthenticated() gets
 *     told via {isReconnect} which path it's on
 *   - Heartbeat ping with pong timeout → forces reconnect on half-open sockets
 *   - Data-silence watchdog → forces reconnect when socket appears OPEN but
 *     no messages arrive for `dataWatchdogMs` (the zombie pattern PM2 misses)
 *   - Intentional `.stop()` does NOT trigger reconnect (graceful shutdown)
 *   - All state observable via events: ready / closed / reconnecting /
 *     reconnected / data-stale / pong-timeout / error
 *
 * Adapters provide:
 *   - url + authMessage + authSuccessPredicate
 *   - onMessage(parsed) — they parse their own protocol
 *   - onAuthenticated({isReconnect}) — they send subscribe payloads
 *
 * Adapters do NOT touch:
 *   - Reconnect timing
 *   - Backoff math
 *   - Heartbeat/pong logic
 *   - Data-watchdog state
 *
 * Spec: ogz-meta/specs/resilience-and-supervision.md (Layer 1)
 *
 * @date 2026-04-26
 */

'use strict';

const EventEmitter = require('events');
const WebSocket = require('ws');

const DEFAULTS = Object.freeze({
  // Backoff caps at 30s by default. Adapters can override (Kraken used 5min).
  maxBackoffMs:    30000,
  // Heartbeat tick — adapter usually maps this to a protocol-level ping.
  // Set to 0 to disable.
  heartbeatPingMs: 30000,
  // Pong overdue threshold — fires `pong-timeout` event and force-closes
  // the socket. Set to 0 to disable.
  pongTimeoutMs:   10000,
  // No-message-received-for-N-ms = data-stale + force-close + reconnect.
  // Catches half-open sockets where TCP is alive but the server stopped
  // sending. Set to 0 to disable.
  dataWatchdogMs:  60000,
  // Hard cap on incoming WS frame size. Default 1 MB; broker frames are
  // typically <1 KB. Bounds memory exposure to malformed/hostile servers.
  maxPayload:      1024 * 1024,
  // Mercury Audit A Task 1A follow-up (2026-04-27): per-second byte-rate cap.
  // maxPayload only bounds a SINGLE message size. A flood of sub-cap frames
  // can still grow memory unboundedly inside the ws library's queue if
  // _onMessage cannot drain fast enough. This is the circuit-breaker — when
  // exceeded, force-close the socket (reconnect path takes over). Default
  // 10 MB/s; broker peak rates are well under 1 MB/s, so 10x headroom for
  // legitimate market-event bursts. Set to 0 to disable.
  maxBytesPerSecond: 10 * 1024 * 1024,
});

class ResilientWebSocket extends EventEmitter {
  /**
   * @param {Object} config
   * @param {string} config.url — WebSocket URL
   * @param {Object|string} config.authMessage — sent immediately after open.
   *   If object, JSON.stringified. If string, sent verbatim. If null/undefined,
   *   skip auth and treat onopen as authenticated immediately.
   * @param {(msg: any) => boolean} [config.authSuccessPredicate] — given the
   *   PARSED inbound message, returns true when the server confirms auth.
   *   If absent and authMessage is null, fires onAuthenticated immediately.
   * @param {(msg: any) => void} config.onMessage — every parsed inbound msg
   * @param {({isReconnect: boolean}) => void} config.onAuthenticated —
   *   fires once per (re)connect after auth-success. isReconnect=false on
   *   the very first connect; true on every reconnect after.
   * @param {(raw: any) => any} [config.parseMessage] — parser for raw frames.
   *   Default: JSON.parse on string, no-op on object. Throws-and-discards
   *   bad frames to prevent crash on malformed input.
   * @param {(rws: ResilientWebSocket) => void} [config.sendHeartbeat] —
   *   callback to send a protocol-level ping. If absent, uses ws.ping()
   *   (RFC 6455 PING frame).
   * @param {Object} [config.options] — backoff/heartbeat/watchdog overrides
   * @param {string} [config.label] — log prefix (e.g., '[Alpaca]')
   */
  constructor(config) {
    super();
    if (!config || !config.url) {
      throw new Error('ResilientWebSocket: config.url is required');
    }
    this.url = config.url;
    this.authMessage = config.authMessage || null;
    this.authSuccessPredicate = config.authSuccessPredicate || null;
    this.onMessageCb = config.onMessage || (() => {});
    this.onAuthenticatedCb = config.onAuthenticated || (() => {});
    this.parseMessageFn = config.parseMessage || ResilientWebSocket._defaultParse;
    this.sendHeartbeatFn = config.sendHeartbeat || null;
    this.label = config.label || '[ResilientWS]';

    const opts = Object.assign({}, DEFAULTS, config.options || {});
    this.maxBackoffMs    = opts.maxBackoffMs;
    this.heartbeatPingMs = opts.heartbeatPingMs;
    this.pongTimeoutMs   = opts.pongTimeoutMs;
    this.dataWatchdogMs  = opts.dataWatchdogMs;
    this.maxPayload      = opts.maxPayload;
    this.maxBytesPerSecond = opts.maxBytesPerSecond;
    // Token-bucket byte-rate limiter — refills at maxBytesPerSecond bytes/sec,
    // capped at maxBytesPerSecond. Closes Mercury Audit A 1A (memory exposure
    // from sub-cap-frame floods) AND closes Mercury Audit A re-attack
    // Breakage 1 (fixed-window boundary evasion: 2x-rate via two bursts
    // straddling a window reset). Refills continuously, no boundary cliff.
    this._byteWindow = { tokens: opts.maxBytesPerSecond, lastRefillMs: 0 };
    // Mercury Audit A re-attack Breakage 2 fix: when the byte-rate cap trips
    // and ws.terminate() is called, frames already queued in the OS/ws-library
    // buffer can still fire _onMessage between trigger and _onClose. This
    // guard drops stragglers cleanly. Reset on every _open().
    this._capTripped = false;

    /* Lifecycle state */
    this.ws = null;
    this.started = false;
    this.intentionalStop = false;
    this.isAuthenticated = false;
    this.reconnectAttempts = 0;

    /* Timer handles */
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.pongTimer = null;
    this.dataWatchdogTimer = null;

    /* Last activity stamps (for diagnostics + watchdog) */
    this.lastConnectedAt = 0;
    this.lastMessageAt = 0;
    this.lastPongAt = 0;
  }

  /**
   * Default frame parser — JSON-decode strings + Buffers, pass through
   * plain objects. Bug-fix 2026-04-26: Buffer is typeof 'object' in
   * Node, so the Buffer check MUST come before the generic object
   * passthrough. Original ordering left ws library's Buffer frames
   * unparsed, causing authSuccessPredicate to silently fail to match.
   */
  static _defaultParse(raw) {
    if (raw == null) return null;
    if (Buffer.isBuffer(raw)) raw = raw.toString();
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); }
      catch (e) { return null; }  // discard malformed frames
    }
    if (typeof raw === 'object') return raw;
    return raw;
  }

  /** Begin connecting. Idempotent — calling twice is a no-op. */
  start() {
    if (this.started) return;
    this.started = true;
    this.intentionalStop = false;
    this._open();
  }

  /**
   * Stop and DO NOT reconnect. Idempotent. Use this for graceful shutdown.
   * Cancels any pending reconnect, clears all timers, closes the socket.
   */
  stop() {
    this.intentionalStop = true;
    this.started = false;
    this._clearAllTimers();
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    this.isAuthenticated = false;
    this.emit('stopped');
  }

  /** Send a payload on the socket. Throws if not currently OPEN. */
  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`${this.label} send() called when socket not OPEN`);
    }
    const frame = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.ws.send(frame);
  }

  /** True iff the socket is open AND auth has completed. */
  isReady() {
    return !!(this.ws && this.ws.readyState === WebSocket.OPEN && this.isAuthenticated);
  }

  /** Diagnostic snapshot — used by Supervisor.getHealth() consumers. */
  getStatus() {
    return {
      url: this.url,
      readyState: this.ws ? this.ws.readyState : -1,
      isAuthenticated: this.isAuthenticated,
      intentionalStop: this.intentionalStop,
      reconnectAttempts: this.reconnectAttempts,
      lastConnectedAt: this.lastConnectedAt,
      lastMessageAt: this.lastMessageAt,
      lastPongAt: this.lastPongAt,
      msSinceMessage: this.lastMessageAt ? (Date.now() - this.lastMessageAt) : null,
    };
  }

  /**
   * Phase 8 health protocol — returns the standardized shape Supervisor
   * consumes:
   *   { status, timestamp, details, lastSuccessAt, failureReason }
   *
   * Status mapping:
   *   - HEALTHY    : socket OPEN + authenticated + last message recent (< dataWatchdogMs)
   *   - DEGRADED   : socket OPEN + authenticated but last message stale (≥ dataWatchdogMs)
   *   - UNHEALTHY  : reconnecting (socket not OPEN) but trying
   *   - DEAD       : intentional stop (caller asked us to be down)
   *
   * Spec: ogz-meta/specs/resilience-and-supervision.md (Layer 1.5 — health protocol)
   */
  getHealth() {
    const now = Date.now();
    const status = this.getStatus();
    const open = status.readyState === WebSocket.OPEN;
    const stale = this.dataWatchdogMs > 0
      && status.lastMessageAt > 0
      && (now - status.lastMessageAt) >= this.dataWatchdogMs;

    let healthStatus;
    let failureReason = null;
    if (this.intentionalStop) {
      healthStatus = 'DEAD';
      failureReason = 'intentional stop';
    } else if (!open || !this.isAuthenticated) {
      healthStatus = 'UNHEALTHY';
      failureReason = !open
        ? `socket readyState=${status.readyState} (not OPEN), reconnect attempts=${status.reconnectAttempts}`
        : 'authenticated=false';
    } else if (stale) {
      healthStatus = 'DEGRADED';
      failureReason = `no message for ${status.msSinceMessage}ms (watchdog ${this.dataWatchdogMs}ms)`;
    } else {
      healthStatus = 'HEALTHY';
    }

    return {
      status: healthStatus,
      timestamp: now,
      details: {
        url: status.url,
        isAuthenticated: status.isAuthenticated,
        reconnectAttempts: status.reconnectAttempts,
        msSinceMessage: status.msSinceMessage,
        msSincePong: status.lastPongAt ? (now - status.lastPongAt) : null,
      },
      lastSuccessAt: status.lastMessageAt,
      failureReason,
    };
  }

  // =========================================================================
  // Internal — open + lifecycle wiring
  // =========================================================================

  _open() {
    if (this.intentionalStop) return;

    this._clearAllTimers();
    this.isAuthenticated = false;
    // Mercury Audit A re-attack Breakage 2 fix: reset cap-tripped flag on
    // every reconnect so the new socket starts clean. Token bucket also
    // resets to full so the reconnect doesn't immediately re-trip.
    this._capTripped = false;
    this._byteWindow.tokens = this.maxBytesPerSecond;
    this._byteWindow.lastRefillMs = 0;

    let ws;
    try {
      ws = new WebSocket(this.url, { maxPayload: this.maxPayload });
    } catch (err) {
      // URL invalid or constructor threw — schedule reconnect anyway so
      // transient DNS issues don't kill the loop.
      console.error(`${this.label} WS construct error:`, err.message);
      this._scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on('open', () => this._onOpen());
    ws.on('message', (raw) => this._onMessage(raw));
    ws.on('close', (code, reason) => this._onClose(code, reason));
    ws.on('error', (err) => this._onError(err));
    ws.on('pong', () => this._onPong());
  }

  _onOpen() {
    this.lastConnectedAt = Date.now();
    this.lastMessageAt = Date.now();  // arm the watchdog from "now"

    // Send auth message if configured. Skip if absent and treat onopen
    // as authenticated immediately (no auth handshake protocols).
    if (this.authMessage) {
      try {
        const frame = typeof this.authMessage === 'string'
          ? this.authMessage
          : JSON.stringify(this.authMessage);
        this.ws.send(frame);
      } catch (err) {
        console.error(`${this.label} failed to send auth message:`, err.message);
        // close fires next; reconnect path handles it.
        return;
      }

      // Auth-success now requires a matching message via authSuccessPredicate.
      // Until that arrives, isAuthenticated stays false; data watchdog and
      // heartbeat are not yet armed.
    } else {
      // No auth required — fire onAuthenticated immediately.
      this._fireAuthenticated();
    }
  }

  _onMessage(raw) {
    // Mercury Audit A re-attack Breakage 2 fix: drop stragglers after the
    // cap has tripped and terminate() has been called. The ws library may
    // still emit frames already in its queue between terminate() and
    // _onClose. Without this guard, _byteWindow keeps growing and we waste
    // CPU/memory on a doomed socket. Cleared on next _open().
    if (this._capTripped) return;

    const nowMs = Date.now();
    this.lastMessageAt = nowMs;

    // Mercury Audit A Task 1A + re-attack Breakage 1 fix (2026-04-27):
    // token-bucket byte-rate cap. maxPayload bounds individual frames; this
    // bounds bursts. Fixed-window counters were vulnerable to 2x-rate evasion
    // via boundary-straddling bursts; token-bucket refills continuously so
    // there is no window-reset cliff to exploit.
    if (this.maxBytesPerSecond > 0) {
      const elapsed = nowMs - this._byteWindow.lastRefillMs;
      if (elapsed > 0) {
        const refill = (elapsed / 1000) * this.maxBytesPerSecond;
        this._byteWindow.tokens = Math.min(
          this.maxBytesPerSecond,
          this._byteWindow.tokens + refill
        );
        this._byteWindow.lastRefillMs = nowMs;
      }
      const frameSize = Buffer.byteLength(raw);
      if (frameSize > this._byteWindow.tokens) {
        console.warn(`${this.label} byte-rate exceeded ${this.maxBytesPerSecond}/s (frame=${frameSize} tokens=${this._byteWindow.tokens.toFixed(0)}) — force-close`);
        this._capTripped = true;
        if (this.ws) try { this.ws.terminate(); } catch (_) {}
        return;
      }
      this._byteWindow.tokens -= frameSize;
    }

    let parsed;
    try {
      parsed = this.parseMessageFn(raw);
    } catch (err) {
      // Parser threw — discard frame, don't propagate
      return;
    }
    if (parsed == null) return;

    // Auth-success detection: only check the predicate while NOT yet authed.
    if (!this.isAuthenticated && this.authSuccessPredicate) {
      let matched = false;
      try { matched = !!this.authSuccessPredicate(parsed); }
      catch (_) { matched = false; }
      if (matched) {
        this._fireAuthenticated();
        return;  // auth message itself does not propagate as a data frame
      }
    }

    // Forward to caller's onMessage. Don't let their throw take down the WS.
    try { this.onMessageCb(parsed); }
    catch (err) {
      console.error(`${this.label} onMessage handler threw:`, err.message);
    }
  }

  _onClose(code, reason) {
    const reasonStr = reason ? reason.toString() : '';
    this.isAuthenticated = false;
    this._clearTimer('heartbeatTimer');
    this._clearTimer('pongTimer');
    this._clearTimer('dataWatchdogTimer');

    this.emit('closed', { code, reason: reasonStr });

    if (this.intentionalStop) {
      // Graceful shutdown via stop() — do not reconnect.
      this.ws = null;
      return;
    }

    this._scheduleReconnect();
  }

  _onError(err) {
    // 'ws' library convention: 'error' fires THEN 'close'. The close handler
    // is what schedules reconnect. We just surface the error here.
    this.emit('error', err);
  }

  _onPong() {
    this.lastPongAt = Date.now();
    this._clearTimer('pongTimer');  // pong arrived, cancel timeout
  }

  // =========================================================================
  // Auth-success path
  // =========================================================================

  _fireAuthenticated() {
    const isReconnect = this.reconnectAttempts > 0;
    this.isAuthenticated = true;
    this.lastMessageAt = Date.now();  // reset watchdog clock

    // Reset reconnect counter on successful (re)connect
    if (isReconnect) {
      this.reconnectAttempts = 0;
      this.emit('reconnected');
    } else {
      this.emit('ready');
    }

    // Now safe to arm heartbeat + data watchdog
    if (this.heartbeatPingMs > 0) this._armHeartbeat();
    if (this.dataWatchdogMs > 0) this._armDataWatchdog();

    // Caller's hook — adapter typically sends initial subscribe payload
    // OR replays subscriptions on reconnect.
    try { this.onAuthenticatedCb({ isReconnect }); }
    catch (err) {
      console.error(`${this.label} onAuthenticated handler threw:`, err.message);
    }
  }

  // =========================================================================
  // Reconnect with exponential backoff (capped, infinite retries)
  // =========================================================================

  _scheduleReconnect() {
    if (this.intentionalStop) return;

    const delayMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxBackoffMs);
    this.reconnectAttempts++;

    this.emit('reconnecting', { attempt: this.reconnectAttempts, delayMs });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._open();
    }, delayMs);
  }

  // =========================================================================
  // Heartbeat (RFC 6455 PING frame or caller-supplied protocol ping)
  // =========================================================================

  _armHeartbeat() {
    this._clearTimer('heartbeatTimer');
    this.heartbeatTimer = setInterval(() => this._tickHeartbeat(), this.heartbeatPingMs);
  }

  _tickHeartbeat() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Send the ping (protocol-specific or RFC PING)
    try {
      if (this.sendHeartbeatFn) {
        this.sendHeartbeatFn(this);
      } else {
        this.ws.ping();  // RFC 6455 frame; pong arrives on ws.on('pong')
      }
    } catch (err) {
      console.error(`${this.label} heartbeat send failed:`, err.message);
      return;
    }

    // Arm pong-timeout. If pong doesn't arrive in pongTimeoutMs, declare
    // half-open and force-close. The on('close') handler reconnects.
    if (this.pongTimeoutMs > 0) {
      this._clearTimer('pongTimer');
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        this.emit('pong-timeout');
        // Force-close — reconnect path takes over
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try { this.ws.terminate(); } catch (_) {}
        }
      }, this.pongTimeoutMs);
    }
  }

  // =========================================================================
  // Data-silence watchdog
  // =========================================================================

  _armDataWatchdog() {
    this._clearTimer('dataWatchdogTimer');
    // Poll every dataWatchdogMs/2 to detect overdue messages with reasonable
    // resolution. Could also use a single setTimeout that re-arms on
    // each message; setInterval is simpler and the periodic wake cost
    // is trivial.
    const checkMs = Math.max(1000, Math.floor(this.dataWatchdogMs / 2));
    this.dataWatchdogTimer = setInterval(() => this._tickDataWatchdog(), checkMs);
  }

  _tickDataWatchdog() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const silentFor = Date.now() - this.lastMessageAt;
    if (silentFor > this.dataWatchdogMs) {
      this.emit('data-stale', { silentForMs: silentFor });
      // Force-close — reconnect path takes over
      try { this.ws.terminate(); } catch (_) {}
    }
  }

  // =========================================================================
  // Timer plumbing
  // =========================================================================

  _clearTimer(name) {
    const handle = this[name];
    if (handle) {
      // Both setTimeout and setInterval handles have .ref()/.unref(), but
      // we just need to clear them; clearTimeout works for both kinds in
      // Node since they both produce Timeout objects.
      clearTimeout(handle);
      clearInterval(handle);
      this[name] = null;
    }
  }

  _clearAllTimers() {
    this._clearTimer('reconnectTimer');
    this._clearTimer('heartbeatTimer');
    this._clearTimer('pongTimer');
    this._clearTimer('dataWatchdogTimer');
  }
}

module.exports = ResilientWebSocket;
