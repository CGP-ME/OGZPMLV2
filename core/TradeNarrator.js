/**
 * TradeNarrator — structured trade-lifecycle narration for OGZprime.
 *
 * PURPOSE
 * -------
 *   Walks the operator (and optionally the customer) through every phase of
 *   a trade: pattern spotted → strategies evaluated → position sized → entry
 *   filled → tiered exits → final close. Output is surgical: exact numbers
 *   for ARCHITECT mode (operator), sanitized / anonymized for USER mode
 *   (dashboard, customer-facing).
 *
 * DESIGN TENETS
 * -------------
 *   1. OFF BY DEFAULT. Both narrators read env vars at construction. If
 *      neither is enabled, every public method becomes a cheap branch
 *      (`if (!this.enabled) return`). Zero allocation, zero stdout, zero
 *      WebSocket traffic in the default path. Phase 0 regression tests
 *      must produce byte-identical output vs. pre-narrator code.
 *
 *   2. NEVER THROWS. All public methods are wrapped in a try/catch that
 *      swallows formatting / type errors so a narrator bug can never take
 *      down a trading pipeline.
 *
 *   3. NO READS OF LIVE STATE. The narrator is a pure sink: callers push
 *      structured events in, the narrator formats and emits them. It does
 *      NOT reach back into StateManager / trades / balances. Keeps it
 *      impossible for a narrator regression to corrupt trading math.
 *
 *   4. USER MODE HIDES "THE SAUCE".
 *        • Strategy names are replaced with session-seeded anonymous
 *          labels ("Strategy-A", "Strategy-B" …). Deterministic within a
 *          run (via NARRATOR_LABEL_SEED), opaque across runs.
 *        • Raw confidence → qualitative bucket ("Low / Medium / High / Peak").
 *        • Pattern win rate / sample count → qualitative buckets.
 *        • Exact SL / TP percents → rounded to one decimal (cosmetic only).
 *        • No internal parameter values, no gate reasons, no config echoes.
 *
 * ENV VARS (documented in ogz-meta/BACKTEST-OPS.md)
 * -------------------------------------------------
 *   ARCHITECT_NARRATOR   — '1' / 'true' / 'on' enables detailed stdout
 *                          meant only for the operator / bot console.
 *   USER_NARRATOR        — '1' / 'true' / 'on' enables sanitized stdout
 *                          AND WebSocket broadcast to the dashboard as
 *                          'narrator_event' messages (scope: 'USER').
 *   NARRATOR_LABEL_SEED  — optional string; if set, strategy anonymization
 *                          uses this seed. If unset, a random per-process
 *                          seed is generated so USER labels shuffle on
 *                          every restart (maximizes opacity).
 *
 * WIRE-UP
 * -------
 *   const { getNarrator } = require('./TradeNarrator');
 *   const narrator = getNarrator();
 *   if (narrator.enabled) narrator.patternSpotted(patterns);
 *
 *   // In WebSocketManager after dashboard auth_success:
 *   getNarrator().setWebSocketClient(this.ctx.dashboardWs);
 *
 * @module core/TradeNarrator
 */

'use strict';

const crypto = require('crypto');

// ─── Env flag parsing ─────────────────────────────────────────────────────
function envFlag(name) {
  const v = process.env[name];
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'on' || s === 'yes';
}

// ─── Label shuffler (deterministic per seed) ──────────────────────────────
function makeLabelMap(seed) {
  const buckets = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const hash = (s) => crypto.createHash('sha256').update(s).digest();

  const assignments = new Map();
  return function labelFor(strategyName) {
    if (!strategyName) return 'Strategy-?';
    if (assignments.has(strategyName)) return assignments.get(strategyName);

    // Pick a bucket deterministically, fall back to numeric if collision
    const h = hash(`${seed}::${strategyName}`);
    let idx = h[0] % buckets.length;
    let label = `Strategy-${buckets[idx]}`;
    let taken = new Set(assignments.values());
    let spin = 1;
    while (taken.has(label) && spin < buckets.length * 2) {
      idx = (idx + 1) % buckets.length;
      label = `Strategy-${buckets[idx]}`;
      spin++;
    }
    if (taken.has(label)) {
      label = `Strategy-${assignments.size + 1}`;
    }
    assignments.set(strategyName, label);
    return label;
  };
}

// ─── Qualitative bucketers ────────────────────────────────────────────────
function confidenceBucket(conf) {
  const c = typeof conf === 'number' ? conf : 0;
  // Accept both 0-1 and 0-100 inputs (orchestrator flips between them)
  const pct = c > 1 ? c : c * 100;
  if (pct < 40) return 'Low';
  if (pct < 60) return 'Medium';
  if (pct < 80) return 'High';
  return 'Peak';
}

function winRateBucket(winRate, samples) {
  const n = samples || 0;
  if (n < 10) return 'Learning';
  const r = winRate > 1 ? winRate / 100 : (winRate || 0);
  if (r < 0.45) return 'Underperforming';
  if (r < 0.55) return 'Emerging';
  if (r < 0.65) return 'Validated';
  return 'Proven';
}

function sampleBucket(samples) {
  const n = samples || 0;
  if (n < 10) return 'New';
  if (n < 50) return 'Emerging';
  if (n < 200) return 'Established';
  return 'Mature';
}

function slTpBucket(pct) {
  const p = Math.abs(pct || 0);
  if (p < 0.7) return 'Tight';
  if (p < 1.8) return 'Standard';
  if (p < 3.5) return 'Wide';
  return 'Generous';
}

// Combined-multiplier bucket for sizing stance. Input is the product of
// confidence × volatility × pattern × confluence multipliers (≈1.0 is
// "normal size"; below = defensive, above = aggressive).
function stanceBucket(combinedMult) {
  const m = typeof combinedMult === 'number' ? combinedMult : 1;
  if (m < 0.7) return 'Conservative';
  if (m < 1.3) return 'Standard';
  if (m < 2.0) return 'Aggressive';
  return 'Max Allocation';
}

// ─── Formatting helpers ───────────────────────────────────────────────────
function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function fmtPct(v, digits = 2) {
  if (typeof v !== 'number' || !isFinite(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

function fmtUsd(v, digits = 2) {
  if (typeof v !== 'number' || !isFinite(v)) return '—';
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toFixed(digits)}`;
}

function fmtPrice(v) {
  if (typeof v !== 'number' || !isFinite(v)) return '—';
  return `$${v.toFixed(2)}`;
}

function fmtMs(ms) {
  const n = Math.max(0, ms | 0);
  const s = Math.floor(n / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ─── Core class ───────────────────────────────────────────────────────────
class TradeNarrator {
  constructor() {
    this.architect = envFlag('ARCHITECT_NARRATOR');
    this.user = envFlag('USER_NARRATOR');
    this.enabled = this.architect || this.user;

    // Per-session seed for anonymization; keeps USER labels stable within
    // one run but opaque across restarts unless explicitly pinned via env.
    //
    // Empty-seed semantics (decided after Mercury pass-1/pass-4 contradiction):
    //   An empty seed packet holds no seeds — you can't plant nothing and
    //   expect a plant. NARRATOR_LABEL_SEED='' is treated the same as unset:
    //   fall through to a random per-process seed. This keeps users safe
    //   from a common foot-gun: `export NARRATOR_LABEL_SEED=` (empty due to
    //   typo or env-file bug) still produces opaque, non-reproducible labels
    //   rather than a deterministic-but-empty-seeded mapping the user never
    //   asked for. To get deterministic labels, set a non-empty string.
    const seed = process.env.NARRATOR_LABEL_SEED
      || crypto.randomBytes(8).toString('hex');
    this._labelFor = makeLabelMap(seed);

    // WebSocket client for USER-mode broadcast (set via setWebSocketClient).
    this._ws = null;

    // Small LRU of recent trade contexts so we can enrich closed() with
    // strategy / entry info without asking the caller to re-supply everything.
    // Never touches StateManager — pure in-memory cache, narrator-local.
    this._ctx = new Map();
    this._ctxMax = 200;

    if (this.enabled) {
      const modes = [
        this.architect ? 'ARCHITECT' : null,
        this.user ? 'USER' : null,
      ].filter(Boolean).join('+');
      // eslint-disable-next-line no-console
      console.log(`🎙️  [Narrator] Enabled mode=${modes} seed=${seed.slice(0, 8)}…`);
    }
  }

  /**
   * Wire up the dashboard WebSocket for USER-mode broadcasts.
   * Called from WebSocketManager after dashboard auth_success.
   * @param {WebSocket|null} ws
   */
  setWebSocketClient(ws) {
    this._ws = ws || null;
    if (this.user && ws) {
      try {
        // Announce narrator presence so the dashboard can light up the
        // chain-of-thought banner. Errors are swallowed — broadcast is
        // never allowed to impact the bot.
        this._broadcast({
          type: 'narrator_event',
          scope: 'USER',
          event: 'ready',
          timestamp: Date.now(),
          text: 'Narrator online.',
        });
      } catch (_) { /* noop */ }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Lifecycle hooks — every hook is a cheap no-op when !this.enabled.
  // ═══════════════════════════════════════════════════════════════════════

  patternSpotted(patterns) {
    if (!this.enabled) return;
    try {
      if (!Array.isArray(patterns) || patterns.length === 0) return;

      // Take top-3 by confidence for readable output
      const top = [...patterns]
        .filter(p => p && (p.name || p.type))
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, 3);
      if (top.length === 0) return;

      if (this.architect) {
        const lines = top.map(p => {
          const name = p.name || p.type || 'unknown';
          const conf = p.confidence != null ? fmtPct((p.confidence || 0) * (p.confidence > 1 ? 1 : 100), 0) : '—';
          const sig = p.signature || p.id || '';
          return `   • ${pad(name, 22)} ${pad(conf, 6)} ${sig ? `sig=${String(sig).slice(0, 10)}` : ''}`;
        });
        this._emitArchitect(
          '🧭 PATTERN SPOTTED',
          lines.join('\n')
        );
      }

      if (this.user) {
        const names = top.map(p => this._safePatternName(p.name || p.type));
        const best = top[0];
        const payload = {
          type: 'narrator_event',
          scope: 'USER',
          event: 'pattern_spotted',
          timestamp: Date.now(),
          patterns: names,
          conviction: confidenceBucket(best.confidence || 0),
          maturity: sampleBucket(best.samples || best.stats?.total || 0),
        };
        this._emitUser(
          `📐 Spotted ${names.join(', ')} — conviction ${payload.conviction}, maturity ${payload.maturity}.`,
          payload
        );
      }
    } catch (_) { /* swallow */ }
  }

  strategyEval(results, winner) {
    if (!this.enabled) return;
    try {
      if (!Array.isArray(results) || results.length === 0) return;

      const sorted = [...results]
        .filter(r => r && r.strategyName)
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      if (sorted.length === 0) return;

      if (this.architect) {
        const lines = sorted.slice(0, 6).map(r => {
          const crown = winner && r.strategyName === winner.strategyName ? '🏆' : '  ';
          const dir = (r.direction || '—').toUpperCase();
          const conf = fmtPct((r.confidence || 0) * 100, 1);
          const reason = r.reason ? String(r.reason).slice(0, 60) : '';
          return `   ${crown} ${pad(r.strategyName, 22)} ${pad(dir, 5)} ${pad(conf, 8)} ${reason}`;
        });
        this._emitArchitect(
          '🧪 STRATEGY EVAL',
          lines.join('\n')
        );
      }

      if (this.user) {
        const visible = sorted.slice(0, 5).map(r => ({
          label: this._labelFor(r.strategyName),
          direction: (r.direction || 'hold').toLowerCase(),
          conviction: confidenceBucket(r.confidence || 0),
        }));
        const winnerLabel = winner
          ? this._labelFor(winner.strategyName)
          : (visible[0] && visible[0].label);
        const winnerDir = winner
          ? String(winner.direction || '').toLowerCase()
          : (visible[0] && visible[0].direction);
        const payload = {
          type: 'narrator_event',
          scope: 'USER',
          event: 'strategy_eval',
          timestamp: Date.now(),
          winner: { label: winnerLabel, direction: winnerDir },
          field: visible,
        };
        this._emitUser(
          `🧠 Field evaluated (${visible.length} strategies) — ${winnerLabel} leads with a ${winnerDir} bias.`,
          payload
        );
      }
    } catch (_) { /* swallow */ }
  }

  sizing(result) {
    if (!this.enabled) return;
    try {
      if (!result) return;
      const {
        sizeUSD = 0,
        sizePercent = 0,
        multipliers = {},
        patternStatus = 'unknown',
        patternWinRate = null,
        capped = false,
        reason = '',
      } = result;

      if (this.architect) {
        const mLines = [
          `confidence  ${(multipliers.confidence || 1).toFixed(2)}x`,
          `volatility  ${(multipliers.volatility || 1).toFixed(2)}x`,
          `pattern     ${(multipliers.pattern || 1).toFixed(2)}x  (${patternStatus})`,
          `confluence  ${(multipliers.confluence || 1).toFixed(2)}x`,
          `combined    ${(multipliers.combined || 1).toFixed(2)}x`,
        ].map(l => `   • ${l}`).join('\n');
        const cap = capped ? '   ⚠ capped to max position percent' : '';
        this._emitArchitect(
          '📏 POSITION SIZING',
          `   Final: ${fmtUsd(sizeUSD)}  (${fmtPct(sizePercent * 100, 2)} of balance)\n${mLines}${cap ? '\n' + cap : ''}${reason ? `\n   reason: ${reason}` : ''}`
        );
      }

      if (this.user) {
        // NO raw percents, NO dollar-of-balance ratios, NO multipliers
        // leaked. Just a qualitative read on how the sizer feels about
        // this trade. Stance bucket is derived from the COMBINED multiplier
        // product (confidence × volatility × pattern × confluence) — where
        // ~1.0 is a "standard" size and above 1.3x means aggressive.
        const stance = capped
          ? 'Max Allocation'
          : stanceBucket(multipliers.combined);
        const patternRead = patternWinRate != null
          ? winRateBucket(patternWinRate, 999)
          : 'Learning';
        const payload = {
          type: 'narrator_event',
          scope: 'USER',
          event: 'sizing',
          timestamp: Date.now(),
          stance,
          pattern_read: patternRead,
        };
        this._emitUser(
          `⚖️  Sizing stance: ${payload.stance} — pattern read ${payload.pattern_read}.`,
          payload
        );
      }
    } catch (_) { /* swallow */ }
  }

  entered(ctx) {
    if (!this.enabled) return;
    try {
      if (!ctx) return;
      const {
        tradeId,
        strategy,
        direction,
        price,
        sizeUsd,
        confidence,
        exitContract,
        confluence,
        timestamp,
      } = ctx;

      // Cache context so closed() can enrich without asking caller
      if (tradeId) {
        this._rememberCtx(tradeId, {
          strategy,
          direction,
          entryPrice: price,
          sizeUsd,
          confidence,
          enteredAt: timestamp || Date.now(),
          exitContract: exitContract ? {
            stopLossPercent: exitContract.stopLossPercent,
            takeProfitPercent: exitContract.takeProfitPercent,
          } : null,
        });
      }

      if (this.architect) {
        const sl = exitContract && exitContract.stopLossPercent != null
          ? fmtPct(exitContract.stopLossPercent, 2)
          : '—';
        const tp = exitContract && exitContract.takeProfitPercent != null
          ? fmtPct(exitContract.takeProfitPercent, 2)
          : '—';
        const confluenceStr = confluence && typeof confluence.count === 'number'
          ? `${confluence.count}x`
          : '—';
        const body = [
          `   tradeId:    ${tradeId || '—'}`,
          `   strategy:   ${strategy || '—'}`,
          `   direction:  ${(direction || '—').toUpperCase()}`,
          `   entry:      ${fmtPrice(price)}  size ${fmtUsd(sizeUsd)}`,
          `   confidence: ${fmtPct((confidence || 0) * (confidence > 1 ? 1 : 100), 1)}`,
          `   confluence: ${confluenceStr}`,
          `   SL / TP:    ${sl} / ${tp}`,
        ].join('\n');
        this._emitArchitect('✅ ENTERED', body);
      }

      if (this.user) {
        const label = this._labelFor(strategy || 'unknown');
        const slBucket = exitContract && exitContract.stopLossPercent != null
          ? slTpBucket(exitContract.stopLossPercent)
          : '—';
        const tpBucket = exitContract && exitContract.takeProfitPercent != null
          ? slTpBucket(exitContract.takeProfitPercent)
          : '—';
        const payload = {
          type: 'narrator_event',
          scope: 'USER',
          event: 'entered',
          timestamp: Date.now(),
          strategy_label: label,
          direction: (direction || 'long').toLowerCase(),
          conviction: confidenceBucket(confidence || 0),
          risk_frame: slBucket,
          profit_frame: tpBucket,
        };
        this._emitUser(
          `🎯 Entry taken by ${label} — ${payload.direction.toUpperCase()}, conviction ${payload.conviction}, ${payload.risk_frame}/${payload.profit_frame} risk frame.`,
          payload
        );
      }
    } catch (_) { /* swallow */ }
  }

  tierExit(ctx) {
    if (!this.enabled) return;
    try {
      if (!ctx) return;
      const {
        tradeId,
        tier,
        exitPrice,
        exitSize,
        remainingSize,
        profitPercent,
        partialPnl,
      } = ctx;

      if (this.architect) {
        const body = [
          `   tradeId:       ${tradeId || '—'}`,
          `   tier:          ${tier != null ? tier : '—'}`,
          `   exit price:    ${fmtPrice(exitPrice)}`,
          `   exited size:   ${fmtUsd(exitSize)}`,
          `   remaining:     ${fmtUsd(remainingSize)}`,
          `   locked profit: ${fmtPct((profitPercent || 0) * 100, 2)}  (${fmtUsd(partialPnl)})`,
        ].join('\n');
        this._emitArchitect(`📦 TIER ${tier} EXIT`, body);
      }

      if (this.user) {
        const ctxRec = this._getCtx(tradeId);
        const label = ctxRec && ctxRec.strategy
          ? this._labelFor(ctxRec.strategy)
          : 'Strategy-?';
        const payload = {
          type: 'narrator_event',
          scope: 'USER',
          event: 'tier_exit',
          timestamp: Date.now(),
          strategy_label: label,
          tier: tier || 1,
          locked_pct: Number(((profitPercent || 0) * 100).toFixed(2)),
          pnl_usd: partialPnl != null ? Number(partialPnl.toFixed(2)) : null,
        };
        this._emitUser(
          `💰 ${label} took partial at tier ${payload.tier} — locked ${fmtPct(payload.locked_pct, 2)} (${fmtUsd(payload.pnl_usd || 0)}).`,
          payload
        );
      }
    } catch (_) { /* swallow */ }
  }

  closed(ctx) {
    if (!this.enabled) return;
    try {
      if (!ctx) return;
      const {
        tradeId,
        strategy,
        direction,
        entryPrice,
        exitPrice,
        pnl,
        pnlPercent,
        reason,
        holdMs,
      } = ctx;

      const ctxRec = this._getCtx(tradeId);
      const strat = strategy || (ctxRec && ctxRec.strategy) || 'unknown';
      const entry = entryPrice != null ? entryPrice : (ctxRec && ctxRec.entryPrice);
      const held = holdMs != null ? holdMs
                  : ctxRec && ctxRec.enteredAt ? (Date.now() - ctxRec.enteredAt)
                  : 0;
      const dir = direction || (ctxRec && ctxRec.direction) || 'long';
      const isWin = (pnl || 0) > 0;

      if (this.architect) {
        const body = [
          `   tradeId:    ${tradeId || '—'}`,
          `   strategy:   ${strat}`,
          `   direction:  ${String(dir).toUpperCase()}`,
          `   entry ⇒ exit: ${fmtPrice(entry)} → ${fmtPrice(exitPrice)}`,
          `   P&L:        ${fmtUsd(pnl)}  (${fmtPct(pnlPercent || 0, 2)})`,
          `   hold:       ${fmtMs(held)}`,
          `   reason:     ${reason || '—'}`,
        ].join('\n');
        this._emitArchitect(isWin ? '🟢 TRADE CLOSED (WIN)' : '🔴 TRADE CLOSED (LOSS)', body);
      }

      if (this.user) {
        const label = this._labelFor(strat);
        const payload = {
          type: 'narrator_event',
          scope: 'USER',
          event: 'closed',
          timestamp: Date.now(),
          strategy_label: label,
          direction: String(dir).toLowerCase(),
          result: isWin ? 'win' : (pnl === 0 ? 'flat' : 'loss'),
          pnl_pct: pnlPercent != null ? Number(pnlPercent.toFixed(2)) : null,
          pnl_usd: pnl != null ? Number(pnl.toFixed(2)) : null,
          hold_seconds: Math.floor(held / 1000),
          reason: this._safeReason(reason),
        };
        const icon = payload.result === 'win' ? '🟢' : payload.result === 'loss' ? '🔴' : '⚪';
        this._emitUser(
          `${icon} ${label} closed ${payload.direction.toUpperCase()} — ${payload.result.toUpperCase()} ${fmtPct(payload.pnl_pct || 0, 2)} (${fmtUsd(payload.pnl_usd || 0)}) held ${fmtMs(held)}.`,
          payload
        );
      }

      // Trade is done — free the context slot
      if (tradeId) this._ctx.delete(tradeId);
    } catch (_) { /* swallow */ }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Internal helpers
  // ═══════════════════════════════════════════════════════════════════════

  _emitArchitect(title, body) {
    if (!this.architect) return;
    // ARCHITECT goes to stdout only, never to WS — prevents accidental
    // exfiltration of internal naming to the dashboard.
    const bar = '─'.repeat(60);
    // eslint-disable-next-line no-console
    console.log(`\n┌─ ${title} ${bar.slice(title.length + 3)}\n${body}\n└${bar}`);
  }

  _emitUser(line, payload) {
    if (!this.user) return;
    // eslint-disable-next-line no-console
    console.log(`🎙️  [USER] ${line}`);
    // Inject the USER-scope prose into the broadcast payload so dashboard
    // handlers can render it directly without reconstructing from structured
    // fields. Stdout still gets the raw `line`; WS consumers read `payload.text`.
    this._broadcast({ ...payload, text: line });
  }

  _broadcast(payload) {
    if (!this.user) return;
    const ws = this._ws;
    if (!ws) return;
    try {
      if (ws.readyState !== 1) return; // OPEN === 1
      // Back-pressure guard: if the socket's send buffer is already
      // holding more than 1MB of unsent data, the dashboard is slow
      // or stalled. Dropping this narrator event is preferable to
      // letting the buffer grow unbounded (memory leak) or blocking
      // the event loop on drain. Narrator is non-critical telemetry
      // — missing a few events beats stalling the trading loop.
      if (typeof ws.bufferedAmount === 'number' && ws.bufferedAmount > 1_048_576) {
        return;
      }
      ws.send(JSON.stringify(payload));
    } catch (_) { /* swallow — WS must never break the bot */ }
  }

  /**
   * Read a context record with LRU refresh — per MANIFEST §6 the _ctx cache
   * is LRU-bounded, so every read must promote the entry to the end of the
   * Map (newest position) so it outlasts entries that haven't been touched.
   * Without this, eviction degenerates to FIFO and a long-held trade's
   * context can be dropped despite recent tier-exit activity on it.
   */
  _getCtx(tradeId) {
    if (!tradeId) return null;
    const rec = this._ctx.get(tradeId);
    if (!rec) return null;
    // Re-insert to move to the tail of the Map (LRU update).
    this._ctx.delete(tradeId);
    this._ctx.set(tradeId, rec);
    return rec;
  }

  _rememberCtx(tradeId, rec) {
    if (this._ctx.size >= this._ctxMax) {
      // Drop the oldest — Map preserves insertion order, and _getCtx
      // refreshes on read so the oldest here is truly LRU (least
      // recently accessed OR inserted, whichever is older).
      const firstKey = this._ctx.keys().next().value;
      if (firstKey != null) this._ctx.delete(firstKey);
    }
    this._ctx.set(tradeId, rec);
  }

  _safePatternName(name) {
    // Keep the human name of the pattern ("Bull Flag", "Hammer", etc).
    // Patterns are public taxonomy, not proprietary — safe to show.
    // Just sanitize length.
    const s = String(name || 'Pattern').slice(0, 40);
    return s.replace(/[^\w\s\-]/g, '').trim() || 'Pattern';
  }

  _safeReason(reason) {
    // Collapse internal exit reasons to a small public vocabulary.
    const r = String(reason || '').toLowerCase();
    if (!r) return 'closed';
    if (r.includes('stop') || r.includes('sl')) return 'risk_stop';
    if (r.includes('target') || r.includes('tp') || r.includes('profit_tier')) return 'profit_target';
    if (r.includes('trail')) return 'trailing_stop';
    if (r.includes('time')) return 'time_exit';
    if (r.includes('reversal') || r.includes('flip')) return 'signal_flip';
    if (r.includes('manual')) return 'manual';
    return 'closed';
  }
}

// Public label accessor — exposes the deterministic strategy → "Strategy-X"
// mapping so other broadcasters (heatbar, battleground) can use the same
// IP-safe labels the narrator uses. Returns the raw name if narrator
// hasn't been initialized.
TradeNarrator.prototype.labelFor = function (strategyName) {
  if (typeof this._labelFor !== 'function') return strategyName || 'Strategy-?';
  return this._labelFor(strategyName);
};

// ─── Singleton ────────────────────────────────────────────────────────────
let _instance = null;
function getNarrator() {
  if (!_instance) _instance = new TradeNarrator();
  return _instance;
}

module.exports = {
  TradeNarrator,
  getNarrator,
};
