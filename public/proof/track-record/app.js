/**
 * Track Record renderer
 *
 * DATA CONTRACT (consumed from /proof/track-record/data/):
 *
 *   index.json
 *     {
 *       updated: ISO timestamp,
 *       mode: "preview" | "live",
 *       accounts: [{ id, label, stage: "EVAL"|"SIM"|"FUNDED", status }]
 *     }
 *
 *   streams.json
 *     {
 *       live: { active: bool, youtube_id, scheduled_for, title },
 *       archive: [{ youtube_id, title, date, duration }]
 *     }
 *
 *   accounts/{id}.json
 *     {
 *       id, label,
 *       stage: "EVAL" | "SIM" | "FUNDED",
 *       status, broker,
 *       starting_balance, current_balance,
 *       profit_target, max_drawdown,
 *       days_traded, trades_recorded, min_trades_required,
 *       proof_summary: {
 *         trades_recorded, min_trades_required, winning_trades, losing_trades,
 *         win_rate, gross_profit, gross_loss, avg_pnl, symbols_traded,
 *         exit_reasons, partial_exits, full_exits, track_record_start_at
 *       },
 *       equity_series: [{ t: ISO, balance: number }],
 *       daily_pnl: [{ date: "YYYY-MM-DD", pnl: number, trades: number }],
 *       recent_trades: [{ t: ISO, symbol, side, entry, exit, pnl, pct }]
 *     }
 *
 * The bot writes these files as it trades. This page is a read-only consumer.
 */

const STATE = {
  index: null,
  streams: null,
  accounts: [],
  selectedId: 'aggregate',
  range: 'all'
};

const DATA_BASE = '/proof/track-record/data';

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

async function loadAll() {
  STATE.index = await fetchJson(`${DATA_BASE}/index.json`);
  try {
    STATE.streams = await fetchJson(`${DATA_BASE}/streams.json`);
  } catch {
    STATE.streams = { live: { active: false }, archive: [] };
  }
  STATE.accounts = [];
  for (const meta of STATE.index.accounts || []) {
    try {
      const acct = await fetchJson(`${DATA_BASE}/accounts/${meta.id}.json`);
      STATE.accounts.push(acct);
    } catch (e) {
      console.warn(`Account ${meta.id} unavailable:`, e.message);
    }
  }
}

function fmtUsd(n, signed = false) {
  if (n == null || isNaN(n)) return '—';
  const sign = signed && n > 0 ? '+' : '';
  return `${sign}$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function fmtCompactList(values, limit = 5) {
  if (!Array.isArray(values) || values.length === 0) return '—';
  const visible = values.slice(0, limit).join(', ');
  const hidden = values.length - limit;
  return hidden > 0 ? `${visible} +${hidden}` : visible;
}

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function aggregateEquity(accounts) {
  const byT = new Map();
  for (const a of accounts) {
    for (const p of a.equity_series || []) {
      byT.set(p.t, (byT.get(p.t) || 0) + p.balance);
    }
  }
  return [...byT.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, balance]) => ({ t, balance }));
}

function aggregateDailyPnl(accounts) {
  const byDate = new Map();
  for (const a of accounts) {
    for (const d of a.daily_pnl || []) {
      const cur = byDate.get(d.date) || { pnl: 0, trades: 0 };
      byDate.set(d.date, { pnl: cur.pnl + d.pnl, trades: cur.trades + d.trades });
    }
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, ...v }));
}

function aggregateTrades(accounts) {
  const all = [];
  for (const a of accounts) {
    for (const t of a.recent_trades || []) {
      all.push({ ...t, accountLabel: a.label });
    }
  }
  return all.sort((a, b) => b.t.localeCompare(a.t)).slice(0, 30);
}

function rangeFilter(points, range, key = 't') {
  if (range === 'all' || !points.length) return points;
  const days = range === '30' ? 30 : range === '90' ? 90 : 365;
  const cutoff = Date.now() - days * 86400000;
  return points.filter(p => new Date(p[key]).getTime() >= cutoff);
}

function renderEquityCurve(container, account, range) {
  container.innerHTML = '';
  const series = rangeFilter(account.equity_series || [], range, 't');
  if (series.length < 2) {
    container.innerHTML = '<div class="empty-state">No equity history yet — chart populates as trades land.</div>';
    return;
  }
  const w = container.clientWidth || 800;
  const h = 320;
  const padL = 70, padR = 20, padT = 20, padB = 30;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const ts = series.map(p => new Date(p.t).getTime());
  const bs = series.map(p => p.balance);

  const start = account.starting_balance || bs[0];
  const target = start + (account.profit_target || 0);
  const floor = start - (account.max_drawdown || 0);

  const yMin = Math.min(...bs, floor) * 0.998;
  const yMax = Math.max(...bs, target) * 1.002;
  const xMin = ts[0], xMax = ts[ts.length - 1];

  const x = t => padL + ((t - xMin) / (xMax - xMin || 1)) * innerW;
  const y = b => padT + innerH - ((b - yMin) / (yMax - yMin || 1)) * innerH;

  const svg = svgEl('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}` });

  if (account.max_drawdown) {
    svg.appendChild(svgEl('rect', {
      x: padL, y: y(floor), width: innerW, height: padT + innerH - y(floor),
      fill: 'rgba(255, 45, 45, 0.12)'
    }));
    svg.appendChild(svgEl('line', {
      x1: padL, y1: y(floor), x2: padL + innerW, y2: y(floor),
      stroke: '#FF2D2D', 'stroke-width': 1, 'stroke-dasharray': '4 4'
    }));
    const lbl = svgEl('text', { x: padL + 6, y: y(floor) - 4, fill: '#FF2D2D', 'font-size': 10, 'font-family': "'JetBrains Mono', monospace" });
    lbl.textContent = `Max DD floor ${fmtUsd(floor)}`;
    svg.appendChild(lbl);
  }

  if (account.profit_target) {
    svg.appendChild(svgEl('line', {
      x1: padL, y1: y(target), x2: padL + innerW, y2: y(target),
      stroke: '#FFB800', 'stroke-width': 1, 'stroke-dasharray': '4 4'
    }));
    const lbl = svgEl('text', { x: padL + 6, y: y(target) - 4, fill: '#FFB800', 'font-size': 10, 'font-family': "'JetBrains Mono', monospace" });
    lbl.textContent = `Profit target ${fmtUsd(target)}`;
    svg.appendChild(lbl);
  }

  svg.appendChild(svgEl('line', {
    x1: padL, y1: y(start), x2: padL + innerW, y2: y(start),
    stroke: '#665E45', 'stroke-width': 1
  }));

  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yMax - yMin) * (i / 4);
    const yy = y(v);
    const tick = svgEl('text', {
      x: padL - 8, y: yy + 3,
      fill: '#665E45', 'font-size': 10, 'text-anchor': 'end',
      'font-family': "'JetBrains Mono', monospace"
    });
    tick.textContent = fmtUsd(v);
    svg.appendChild(tick);
  }

  for (const i of [0, Math.floor(series.length / 2), series.length - 1]) {
    const date = new Date(ts[i]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const tx = svgEl('text', {
      x: x(ts[i]), y: padT + innerH + 18,
      fill: '#665E45', 'font-size': 10, 'text-anchor': 'middle',
      'font-family': "'JetBrains Mono', monospace"
    });
    tx.textContent = date;
    svg.appendChild(tx);
  }

  const pathD = ts.map((t, i) => `${i === 0 ? 'M' : 'L'} ${x(t)} ${y(bs[i])}`).join(' ');
  svg.appendChild(svgEl('path', {
    d: pathD, fill: 'none', stroke: '#FFB800', 'stroke-width': 2
  }));

  const lastT = ts[ts.length - 1], lastB = bs[bs.length - 1];
  svg.appendChild(svgEl('circle', { cx: x(lastT), cy: y(lastB), r: 4, fill: '#FFB800' }));

  container.appendChild(svg);
}

function renderHeroStats(container, account) {
  const start = account.starting_balance || 0;
  const cur = account.current_balance || start;
  const pnl = cur - start;
  const pct = start ? (pnl / start) * 100 : 0;
  const targetPct = account.profit_target ? (pnl / account.profit_target) * 100 : null;
  const stats = [
    { label: 'Current Balance', value: fmtUsd(cur) },
    { label: 'Total P&L', value: fmtUsd(pnl, true), klass: pnl >= 0 ? 'up' : 'down' },
    { label: 'Return', value: fmtPct(pct), klass: pct >= 0 ? 'up' : 'down' },
    targetPct != null ? { label: 'Target Progress', value: `${targetPct.toFixed(0)}%` } : null,
    account.trades_recorded != null && account.min_trades_required != null
      ? { label: 'Trade Progress', value: `${account.trades_recorded} / ${account.min_trades_required}` } : null,
    account.broker ? { label: 'Broker', value: account.broker } : null
  ].filter(Boolean);
  container.innerHTML = stats.map(s => `
    <div class="stat">
      <span class="label">${s.label}</span>
      <span class="value ${s.klass || ''}">${s.value}</span>
    </div>`).join('');
}

function mergeExitReasons(accounts) {
  const merged = {};
  for (const account of accounts) {
    const reasons = account.proof_summary?.exit_reasons || {};
    for (const [reason, count] of Object.entries(reasons)) {
      merged[reason] = (merged[reason] || 0) + count;
    }
  }
  return merged;
}

function aggregateProofSummary(accounts) {
  const trades = accounts.reduce((sum, a) => sum + (a.proof_summary?.trades_recorded || a.trades_recorded || 0), 0);
  const wins = accounts.reduce((sum, a) => sum + (a.proof_summary?.winning_trades || 0), 0);
  const losses = accounts.reduce((sum, a) => sum + (a.proof_summary?.losing_trades || 0), 0);
  const grossProfit = accounts.reduce((sum, a) => sum + (a.proof_summary?.gross_profit || 0), 0);
  const grossLoss = accounts.reduce((sum, a) => sum + (a.proof_summary?.gross_loss || 0), 0);
  return {
    trades_recorded: trades,
    min_trades_required: accounts.reduce((sum, a) => sum + (a.proof_summary?.min_trades_required || a.min_trades_required || 0), 0),
    winning_trades: wins,
    losing_trades: losses,
    win_rate: trades > 0 ? (wins / trades) * 100 : 0,
    gross_profit: grossProfit,
    gross_loss: grossLoss,
    avg_pnl: trades > 0 ? (grossProfit + grossLoss) / trades : 0,
    symbols_traded: Array.from(new Set(accounts.flatMap(a => a.proof_summary?.symbols_traded || []))).sort(),
    exit_reasons: mergeExitReasons(accounts),
    partial_exits: accounts.reduce((sum, a) => sum + (a.proof_summary?.partial_exits || 0), 0),
    full_exits: accounts.reduce((sum, a) => sum + (a.proof_summary?.full_exits || 0), 0),
    track_record_start_at: accounts.map(a => a.proof_summary?.track_record_start_at).filter(Boolean).sort()[0] || null
  };
}

function renderProofMatrix(container, account) {
  const summary = account.proof_summary || {};
  const exitReasons = Object.entries(summary.exit_reasons || {})
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${reason}: ${count}`);
  const startBoundary = summary.track_record_start_at
    ? new Date(summary.track_record_start_at).toLocaleString()
    : '—';
  const cards = [
    { label: 'Trade Progress', value: `${summary.trades_recorded ?? account.trades_recorded ?? 0} / ${summary.min_trades_required ?? account.min_trades_required ?? '—'}` },
    { label: 'Win Rate', value: fmtPct(summary.win_rate ?? 0) },
    { label: 'Symbols Covered', value: fmtCompactList(summary.symbols_traded || []) },
    { label: 'Avg P&L', value: fmtUsd(summary.avg_pnl ?? 0, true) },
    { label: 'Exit Evidence', value: fmtCompactList(exitReasons, 3) },
    { label: 'Proof Boundary', value: startBoundary }
  ];
  container.innerHTML = cards.map(c => `
    <div class="evidence-card">
      <span class="label">${c.label}</span>
      <span class="value">${c.value}</span>
    </div>
  `).join('');
}

function renderSparkline(values) {
  if (values.length < 2) return '';
  const w = 180, h = 40;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / span) * h}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="#FFB800" stroke-width="1.5"/></svg>`;
}

function renderFleet(container) {
  if (!STATE.accounts.length) {
    container.innerHTML = '<div class="empty-state">No accounts active yet. Cards populate when an Apex eval / SIM / funded account begins emitting data.</div>';
    return;
  }
  const cards = [
    {
      id: 'aggregate',
      label: 'All Accounts',
      stage: 'TOTAL',
      stageClass: 'preview',
      values: aggregateEquity(STATE.accounts).map(p => p.balance),
      pnl: STATE.accounts.reduce((s, a) => s + ((a.current_balance || 0) - (a.starting_balance || 0)), 0),
      starting: STATE.accounts.reduce((s, a) => s + (a.starting_balance || 0), 0)
    },
    ...STATE.accounts.map(a => ({
      id: a.id,
      label: a.label,
      stage: a.stage || 'PREVIEW',
      stageClass: (a.stage || 'preview').toLowerCase(),
      values: (a.equity_series || []).map(p => p.balance),
      pnl: (a.current_balance || 0) - (a.starting_balance || 0),
      starting: a.starting_balance || 0
    }))
  ];
  container.innerHTML = cards.map(c => {
    const pct = c.starting ? (c.pnl / c.starting) * 100 : 0;
    const isActive = c.id === STATE.selectedId;
    const pnlColor = c.pnl >= 0 ? '#00E676' : '#FF2D2D';
    return `
      <div class="fleet-card ${isActive ? 'active' : ''}" data-id="${c.id}">
        <div class="label">${c.label}</div>
        <span class="stage-pill ${c.stageClass}">${c.stage}</span>
        ${renderSparkline(c.values)}
        <div class="pnl" style="color:${pnlColor}">
          ${fmtUsd(c.pnl, true)} (${fmtPct(pct)})
        </div>
      </div>`;
  }).join('');
  container.querySelectorAll('.fleet-card').forEach(card => {
    card.addEventListener('click', () => {
      STATE.selectedId = card.dataset.id;
      rerender();
    });
  });
}

function renderStream(slotEl, archiveEl) {
  const s = STATE.streams || { live: { active: false }, archive: [] };
  if (s.live && s.live.active && s.live.youtube_id) {
    slotEl.innerHTML = `<iframe src="https://www.youtube.com/embed/${s.live.youtube_id}" allowfullscreen></iframe>`;
  } else if (s.live && s.live.scheduled_for) {
    const when = new Date(s.live.scheduled_for).toLocaleString();
    slotEl.innerHTML = `Next session: ${s.live.title || ''} — ${when}`;
  } else {
    slotEl.innerHTML = 'No active stream';
  }
  const archive = s.archive || [];
  archiveEl.innerHTML = archive.length
    ? archive.map(v => `
        <div class="vod-card" data-yt="${v.youtube_id}">
          <div class="vod-title">${v.title || 'Session'}</div>
          <div class="vod-date">${v.date || ''} ${v.duration ? '• ' + v.duration : ''}</div>
        </div>`).join('')
    : '';
  archiveEl.querySelectorAll('.vod-card').forEach(c => {
    c.addEventListener('click', () => window.open(`https://www.youtube.com/watch?v=${c.dataset.yt}`, '_blank'));
  });
}

function renderHeatmap(container, daily) {
  if (!daily.length) {
    container.innerHTML = '<div class="empty-state">Daily P&L heatmap populates after the first full trading day.</div>';
    return;
  }
  const cell = 12, gap = 2;
  const map = new Map(daily.map(d => [d.date, d.pnl]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = 365;
  const cells = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ date: key, day: d.getDay(), pnl: map.has(key) ? map.get(key) : null });
  }
  const weeks = [];
  let curWeek = new Array(7).fill(null);
  for (const c of cells) {
    if (c.day === 0 && curWeek.some(x => x !== null)) {
      weeks.push(curWeek);
      curWeek = new Array(7).fill(null);
    }
    curWeek[c.day] = c;
  }
  if (curWeek.some(x => x !== null)) weeks.push(curWeek);

  const w = weeks.length * (cell + gap);
  const h = 7 * (cell + gap);

  const colorFor = pnl => {
    if (pnl == null) return 'rgba(255,180,0,0.04)';
    if (pnl === 0) return 'rgba(255,200,50,0.06)';
    const mag = Math.min(1, Math.abs(pnl) / 500);
    const a = (0.2 + mag * 0.8).toFixed(2);
    return pnl > 0 ? `rgba(0, 230, 118, ${a})` : `rgba(255, 45, 45, ${a})`;
  };

  let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  for (let wi = 0; wi < weeks.length; wi++) {
    for (let di = 0; di < 7; di++) {
      const c = weeks[wi][di];
      if (!c) continue;
      const x = wi * (cell + gap);
      const y = di * (cell + gap);
      const title = c.pnl == null ? c.date : `${c.date}: ${fmtUsd(c.pnl, true)}`;
      svg += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${colorFor(c.pnl)}" rx="2"><title>${title}</title></rect>`;
    }
  }
  svg += '</svg>';
  container.innerHTML = svg;
}

function renderTrades(container, trades) {
  const tbody = container.querySelector('tbody');
  if (!trades.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No trades yet.</td></tr>';
    return;
  }
  tbody.innerHTML = trades.map(t => {
    const pnlClass = (t.pnl || 0) >= 0 ? 'pnl-up' : 'pnl-down';
    const time = new Date(t.t).toLocaleString();
    return `<tr>
      <td>${time}</td>
      <td>${t.accountLabel || ''}</td>
      <td>${t.symbol || ''}</td>
      <td>${t.side || ''}</td>
      <td>${t.entry != null ? t.entry : '—'}</td>
      <td>${t.exit != null ? t.exit : '—'}</td>
      <td class="${pnlClass}">${fmtUsd(t.pnl, true)} ${t.pct != null ? `(${fmtPct(t.pct)})` : ''}</td>
    </tr>`;
  }).join('');
}

function getSelectedAccount() {
  if (STATE.selectedId === 'aggregate' || !STATE.selectedId) {
    return {
      label: 'All Accounts',
      starting_balance: STATE.accounts.reduce((s, a) => s + (a.starting_balance || 0), 0),
      current_balance: STATE.accounts.reduce((s, a) => s + (a.current_balance || 0), 0),
      profit_target: STATE.accounts.reduce((s, a) => s + (a.profit_target || 0), 0),
      max_drawdown: STATE.accounts.reduce((s, a) => Math.max(s, a.max_drawdown || 0), 0),
      trades_recorded: STATE.accounts.reduce((s, a) => s + (a.trades_recorded || 0), 0),
      min_trades_required: STATE.accounts.reduce((s, a) => s + (a.min_trades_required || 0), 0),
      proof_summary: aggregateProofSummary(STATE.accounts),
      equity_series: aggregateEquity(STATE.accounts),
      daily_pnl: aggregateDailyPnl(STATE.accounts),
      recent_trades: aggregateTrades(STATE.accounts)
    };
  }
  return STATE.accounts.find(a => a.id === STATE.selectedId) || STATE.accounts[0];
}

function rerender() {
  const sel = getSelectedAccount();
  document.getElementById('heroTitle').textContent = sel.label;
  renderEquityCurve(document.getElementById('heroChart'), sel, STATE.range);
  renderHeroStats(document.getElementById('heroStats'), sel);
  renderFleet(document.getElementById('fleetGrid'));
  renderProofMatrix(document.getElementById('proofMatrix'), sel);
  renderStream(document.getElementById('streamSlot'), document.getElementById('vodArchive'));
  renderHeatmap(document.getElementById('heatmap'), sel.daily_pnl || []);
  const trades = STATE.selectedId === 'aggregate'
    ? aggregateTrades(STATE.accounts)
    : (sel.recent_trades || []).map(t => ({ ...t, accountLabel: sel.label }));
  renderTrades(document.getElementById('tradeTape'), trades);
}

function bindControls() {
  document.querySelectorAll('.range-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-toggle button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.range = btn.dataset.range;
      rerender();
    });
  });
}

function applyMode() {
  const banner = document.getElementById('modeBanner');
  if (STATE.index && STATE.index.mode === 'preview') {
    banner.textContent = 'Preview mode — illustrative scaffolding. Live data populates when the bot starts emitting per-account track records.';
    banner.classList.add('visible');
  } else {
    banner.classList.remove('visible');
  }
  document.getElementById('lastUpdated').textContent = STATE.index && STATE.index.updated
    ? new Date(STATE.index.updated).toLocaleString()
    : '—';
}

async function init() {
  bindControls();
  try {
    await loadAll();
    applyMode();
    rerender();
  } catch (e) {
    console.error('Track Record load failed:', e);
    document.getElementById('lastUpdated').textContent = 'Unavailable';
  }
}

init();
setInterval(() => {
  loadAll().then(() => { applyMode(); rerender(); }).catch(() => {});
}, 60_000);
