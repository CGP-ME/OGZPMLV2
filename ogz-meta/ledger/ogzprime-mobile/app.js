/* OGZPrime Mobile — v1 monitor cockpit
 * Read-only client for an OGZPrime dashboard WebSocket.
 * Handshake mirrors ogzprime-ssl-server.js: auth -> identify(dashboard) -> snapshot replay -> live.
 * No operator controls in v1 (backend command handlers do not exist yet).
 */
(() => {
  'use strict';

  // ---------- tiny helpers ----------
  const $ = (id) => document.getElementById(id);
  const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
  const pick = (obj, ...keys) => {
    for (const k of keys) {
      if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
      if (obj && obj.data && obj.data[k] !== undefined && obj.data[k] !== null) return obj.data[k];
    }
    return undefined;
  };
  const money = (v) => {
    const n = num(v); if (n === null) return '—';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const pnlText = (v) => { const n = num(v); if (n === null) return { t: '—', c: 'flat' }; const s = money(Math.abs(n)); return { t: (n >= 0 ? '+' : '-') + s, c: n > 0 ? 'up' : n < 0 ? 'down' : 'flat' }; };
  const clock = (ts) => { const d = ts ? new Date(num(ts) > 1e12 ? num(ts) : num(ts) * 1000) : new Date(); return isNaN(d) ? '' : d.toLocaleTimeString(); };

  // ---------- config store (device-local, non-secret only) ----------
  const CFG = 'ogzm.cfg';
  const stored = (() => { try { return JSON.parse(localStorage.getItem(CFG)) || {}; } catch { return {}; } })();
  const cfg = { url: stored.url || '' };
  let sessionToken = '';
  const saveCfg = () => { try { localStorage.setItem(CFG, JSON.stringify({ url: cfg.url })); } catch {} };
  saveCfg();

  // ---------- state ----------
  const S = { ws: null, authed: false, frames: 0, lastType: '—', wantOpen: false, retry: 0, pingTimer: null, trades: [], alerts: [], raw: [] };

  // ---------- view router ----------
  document.querySelectorAll('.nav button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.nav button').forEach((x) => x.classList.toggle('active', x === b));
    const v = b.dataset.view;
    document.querySelectorAll('.view').forEach((sec) => sec.classList.toggle('active', sec.id === 'view-' + v));
  }));

  // ---------- connection UI ----------
  function setConn(stateClass, text) {
    const c = $('conn'); c.className = 'conn ' + stateClass; $('connTxt').textContent = text;
    $('sState').textContent = stateClass === 'online' ? 'open' : stateClass === 'connecting' ? 'connecting' : 'closed';
    $('sAuth').textContent = S.authed ? 'yes' : 'no';
  }

  // ---------- WebSocket lifecycle ----------
  function connect() {
    if (!cfg.url) { flash('Set a WebSocket URL in Settings first.'); return; }
    if (!sessionToken) { flash('Enter the WebSocket auth token for this session.'); return; }
    disconnect(true, true);
    S.wantOpen = true;
    let ws;
    try { ws = new WebSocket(cfg.url); } catch (e) { flash('Bad URL: ' + e.message); return; }
    S.ws = ws;
    setConn('connecting', 'connecting…');

    ws.onopen = () => {
      S.retry = 0;
      // SECURITY: server requires auth as the FIRST message within 10s.
      send({ type: 'auth', token: sessionToken });
    };

    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      route(msg);
    };

    ws.onclose = (ev) => {
      S.authed = false;
      clearInterval(S.pingTimer);
      setConn('offline', 'offline');
      if (S.wantOpen) {
        S.retry = Math.min(S.retry + 1, 6);
        const wait = Math.min(1000 * 2 ** S.retry, 15000);
        setConn('offline', `reconnecting in ${Math.round(wait / 1000)}s`);
        setTimeout(() => { if (S.wantOpen) connect(); }, wait);
      }
    };
    ws.onerror = () => { /* surfaced via onclose */ };
  }

  function disconnect(silent, preserveToken = false) {
    S.wantOpen = false;
    clearInterval(S.pingTimer);
    if (S.ws) { try { S.ws.onclose = null; S.ws.close(); } catch {} S.ws = null; }
    S.authed = false;
    if (!preserveToken) {
      sessionToken = '';
      const tokenInput = $('wsToken');
      if (tokenInput) tokenInput.value = '';
    }
    if (!silent) setConn('offline', 'offline');
  }

  function send(obj) { try { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(obj)); } catch {} }

  // ---------- frame router ----------
  function route(msg) {
    const type = msg.type || 'unknown';
    S.frames++; S.lastType = type;
    $('sFrames').textContent = S.frames; $('sLast').textContent = type;
    pushRaw(type, msg);

    switch (type) {
      case 'auth_success':
        S.authed = true; setConn('online', 'authenticated');
        // Identify as a dashboard client so the server replays cached snapshots + streams live.
        send({ type: 'identify', source: 'dashboard' });
        startPing();
        break;
      case 'error':
        flash('Server: ' + (msg.message || 'error'));
        if (/auth/i.test(msg.message || '')) setConn('offline', 'auth rejected');
        break;
      case 'ping':            // server liveness probe -> answer
        send({ type: 'pong', id: msg.id, timestamp: msg.timestamp || Date.now() }); break;
      case 'pong':            // reply to our ping; nothing to do
        break;
      case 'identification_confirmed':
        break;
      case 'state_update':    renderState(msg); break;
      case 'bot_thinking':    renderThinking(msg); break;
      case 'broker_status':   renderBroker(msg); break;
      case 'trade': case 'fill': case 'trade_closed': case 'trade_opened': case 'order_filled':
        renderTrade(type, msg); break;
      case 'alert': case 'notification': case 'warning':
        renderAlert(type, msg); break;
      // price / ticker / candle frames are high-volume; visible in Inspect, skipped in cockpit
      default: break;
    }
  }

  function startPing() {
    clearInterval(S.pingTimer);
    S.pingTimer = setInterval(() => send({ type: 'ping', id: 'm' + Date.now(), timestamp: Date.now() }), 20000);
  }

  // ---------- renderers (defensive field mapping) ----------
  function renderState(m) {
    const bal = pick(m, 'balance', 'equity', 'accountBalance', 'totalEquity', 'cash');
    if (bal !== undefined) $('balance').textContent = money(bal);

    const sess = pick(m, 'sessionPnl', 'sessionPnL', 'dayPnl', 'realizedToday');
    const tot = pick(m, 'totalPnl', 'totalPnL', 'pnl', 'unrealized', 'netPnl');
    const wr = pick(m, 'winRate', 'winrate');
    if (sess !== undefined) { const x = pnlText(sess); const el = $('sessionPnl'); el.textContent = x.t; el.className = 'mono ' + x.c; }
    if (tot !== undefined) { const x = pnlText(tot); const el = $('totalPnl'); el.textContent = x.t; el.className = 'mono ' + x.c; }
    if (wr !== undefined) { const n = num(wr); $('winRate').textContent = n === null ? '—' : (n <= 1 ? (n * 100).toFixed(0) : n.toFixed(0)) + '%'; }

    const rec = pick(m, 'recoveryMode', 'recovery');
    const recOn = rec === true || rec === 'on' || rec === 1;
    $('recoveryTag').textContent = recOn ? 'RECOVERY MODE' : '';
    $('gRecovery').textContent = rec === undefined ? '—' : (recOn ? 'ACTIVE' : 'off');

    // position
    const pos = pick(m, 'position', 'openPosition') || (m.data && m.data.position);
    renderPosition(pos);

    // guardrails (best-effort)
    const risk = pick(m, 'riskPosture', 'guardrails', 'risk');
    const size = pick(m, 'sizePreview', 'positionSize', 'nextSize');
    const maxLoss = pick(m, 'maxLoss', 'maxDailyLoss', 'lossCap');
    if (risk !== undefined) $('gRisk').textContent = typeof risk === 'string' ? risk : (risk ? 'ARMED' : '—');
    if (size !== undefined) $('gSize').textContent = String(size);
    if (maxLoss !== undefined) $('gMaxLoss').textContent = money(maxLoss);
  }

  function renderPosition(pos) {
    const box = $('positionBox');
    if (!pos || (typeof pos === 'object' && !Object.keys(pos).length) || pos === 'flat' || pos === 'none') {
      box.innerHTML = '<div class="empty">No open position reported.</div>'; return;
    }
    if (typeof pos !== 'object') { box.innerHTML = `<div class="trade"><span class="sym">${esc(pos)}</span></div>`; return; }
    const sym = pick(pos, 'symbol', 'asset', 'ticker') || '—';
    const side = String(pick(pos, 'side', 'direction') || '').toLowerCase();
    const qty = pick(pos, 'qty', 'size', 'quantity', 'contracts');
    const entry = pick(pos, 'entry', 'entryPrice', 'avgPrice');
    const upnl = pick(pos, 'unrealized', 'unrealizedPnl', 'pnl');
    const x = pnlText(upnl);
    box.innerHTML = `<div class="trade">
      <span class="side ${side === 'sell' || side === 'short' ? 'sell' : 'buy'}">${esc(side ? side.toUpperCase() : 'POS')}</span>
      <span class="sym">${esc(sym)}</span>
      <span class="meta">${qty !== undefined ? esc(qty) + ' @ ' : ''}${entry !== undefined ? esc(entry) : ''}<br>
        <span class="${x.c}">${upnl !== undefined ? x.t : ''}</span></span></div>`;
  }

  function renderThinking(m) {
    const txt = pick(m, 'reasoning', 'thought', 'text', 'message', 'chainOfThought') || '';
    const strats = pick(m, 'strategyStack', 'strategies', 'stack');
    if (txt) $('thinkBox').textContent = String(txt);
    if (Array.isArray(strats) && strats.length) {
      $('traiStrats').innerHTML = '';
      $('thinkBox').insertAdjacentHTML('afterbegin',
        strats.map((s) => `<span class="strat">${esc(typeof s === 'string' ? s : (s.name || s.id || ''))}</span>`).join('') + '\n\n');
    }
  }

  function renderBroker(m) {
    const name = pick(m, 'name', 'broker', 'feed') || 'broker';
    const ok = pick(m, 'ok', 'healthy', 'connected');
    const reason = pick(m, 'reason', 'source', 'status');
    const cls = ok === true ? 'ok' : ok === false ? 'bad' : 'warn';
    const wrap = $('healthChips');
    if (wrap.querySelector('.empty')) wrap.innerHTML = '';
    let chip = wrap.querySelector(`[data-name="${cssSafe(name)}"]`);
    if (!chip) { chip = document.createElement('span'); chip.dataset.name = cssSafe(name); wrap.appendChild(chip); }
    chip.className = 'chip ' + cls;
    chip.innerHTML = `<span class="led"></span>${esc(String(name).toUpperCase())}${reason ? ' · ' + esc(reason) : ''}`;
  }

  function renderTrade(type, m) {
    const sym = pick(m, 'symbol', 'asset', 'ticker') || '—';
    const side = String(pick(m, 'side', 'action', 'direction') || '').toLowerCase();
    const price = pick(m, 'price', 'fillPrice', 'exit', 'entry');
    const pnl = pick(m, 'pnl', 'realized', 'profit');
    const ts = pick(m, 'timestamp', 'time', 'at');
    S.trades.unshift({ sym, side, price, pnl, ts: clock(ts), type });
    S.trades = S.trades.slice(0, 40);
    const list = $('tradeList');
    list.innerHTML = S.trades.map((t) => {
      const x = pnlText(t.pnl);
      return `<div class="trade">
        <span class="side ${t.side === 'sell' || t.side === 'short' ? 'sell' : 'buy'}">${esc(t.side ? t.side.toUpperCase() : t.type)}</span>
        <span class="sym">${esc(t.sym)}</span>
        <span class="meta">${t.price !== undefined ? '@ ' + esc(t.price) : ''} ${t.pnl !== undefined ? '<span class="' + x.c + '">' + x.t + '</span>' : ''}<br>${esc(t.ts)}</span></div>`;
    }).join('');
  }

  function renderAlert(type, m) {
    const text = pick(m, 'message', 'text', 'alert', 'reason') || JSON.stringify(m);
    const sev = (pick(m, 'severity', 'level') || (type === 'warning' ? 'warn' : 'info')) + '';
    const cls = /err|crit|fail/i.test(sev) ? 'err' : /warn/i.test(sev) || type === 'warning' ? 'warn' : /ok|good/i.test(sev) ? 'ok' : '';
    S.alerts.unshift({ text, cls, ts: clock(pick(m, 'timestamp', 'time')) });
    S.alerts = S.alerts.slice(0, 30);
    $('alertList').innerHTML = S.alerts.map((a) =>
      `<div class="alert ${a.cls}"><span class="bar"></span><div>${esc(a.text)}<time>${esc(a.ts)}</time></div></div>`).join('');
  }

  // ---------- raw inspector ----------
  let rawFilter = '';
  $('rawFilter').addEventListener('input', (e) => { rawFilter = e.target.value.trim().toLowerCase(); paintRaw(); });
  $('rawClear').addEventListener('click', () => { S.raw = []; paintRaw(); $('frameCount').textContent = '0'; });
  function pushRaw(type, msg) {
    S.raw.unshift({ type, ts: new Date().toLocaleTimeString(), body: safeJson(msg) });
    S.raw = S.raw.slice(0, 200);
    $('frameCount').textContent = S.frames;
    paintRaw();
  }
  function paintRaw() {
    const rows = S.raw.filter((r) => !rawFilter || r.type.toLowerCase().includes(rawFilter));
    $('rawFeed').innerHTML = rows.map((r) =>
      `<div class="ln"><span class="t mono">${esc(r.ts)} ${esc(r.type)}</span><span class="j mono">${esc(r.body)}</span></div>`).join('') ||
      '<div class="ln"><span class="j">No frames match.</span></div>';
  }

  // ---------- utils ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function cssSafe(s) { return String(s).replace(/[^a-z0-9_-]/gi, '_'); }
  function safeJson(o) { try { const s = JSON.stringify(o); return s.length > 600 ? s.slice(0, 600) + '…' : s; } catch { return '[unserializable]'; } }
  function flash(msg) {
    const a = { message: msg, severity: 'info', timestamp: Date.now() };
    renderAlert('notification', a);
  }

  // ---------- settings wiring ----------
  $('wsUrl').value = cfg.url; $('wsToken').value = '';
  $('connectBtn').addEventListener('click', () => {
    cfg.url = $('wsUrl').value.trim();
    sessionToken = $('wsToken').value;
    saveCfg();
    connect();
  });
  $('disconnectBtn').addEventListener('click', () => disconnect());

  // expose minimal debug hook without leaking the session token
  window.OGZM = { state: S, config: () => ({ url: cfg.url, tokenStored: false }), connect, disconnect };

  // register service worker (best-effort, for installability)
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  // Do not auto-connect: the auth token is intentionally not persisted.
})();
