'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
if (!process.argv.includes('--current')) {
  const overlay = JSON.parse(fs.readFileSync(path.join(__dirname, 'pages-after.json'), 'utf8'));
  for (const [file, source] of Object.entries(overlay.files)) fs.writeFileSync(file, source);
}
const sources = ['public/trade-journal.html', 'public/trade-replay.html', 'public/js/panels/trade-replay.js', 'public/js/panels/chart-panel.js', 'public/js/panels/live-report.js', 'public/js/core.js', 'public/js/websocket.js'];
const hashes = Object.fromEntries(sources.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));

// Execute the complete production page scripts and existing authenticated Socket.
// Only the browser DOM, chart library, timer and wire transport are synthetic.
function browser(html) {
  const elements = new Map(), sent = [], sockets = [], errors = [], series = [], timers = [];
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag; this.children = []; this.style = {}; this.dataset = {};
      this.attributes = {}; this.listeners = {}; this.hidden = false; this.clientWidth = 800;
      const classes = new Set();
      this.classList = { add: (...values) => values.forEach(v => classes.add(v)), remove: (...values) => values.forEach(v => classes.delete(v)), toggle: (v, on) => on ? classes.add(v) : classes.delete(v), contains: v => classes.has(v) };
    }
    set id(value) { this._id = value; elements.set(value, this); }
    get id() { return this._id; }
    set innerHTML(value) {
      this._html = value; this.children = [];
      for (const match of value.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
        const el = new Element(match[1]); el.id = match[2]; this.appendChild(el);
      }
    }
    get innerHTML() { return this._html || ''; }
    set textContent(value) { this._text = String(value); this._html = ''; this.children = []; }
    get textContent() { return this._text || ''; }
    appendChild(el) { this.children.push(el); el.parentNode = this; return el; }
    removeChild(el) { this.children = this.children.filter(child => child !== el); el.parentNode = null; if (el.id) elements.delete(el.id); }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(v => v !== fn); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key]; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
  }
  const document = new Element('document');
  document.body = new Element('body'); document.head = new Element('head');
  document.body.dataset.socketStream = 'settings'; document.body.innerHTML = html;
  document.getElementById = id => elements.get(id) || null;
  document.createElement = tag => new Element(tag);
  document.createElementNS = (_, tag) => new Element(tag);
  class Wire {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 0; sockets.push(this); }
    send(text) { sent.push(JSON.parse(text)); }
    close(code, reason) { this.readyState = 3; this.onclose({ code, reason }); }
  }
  const addSeries = kind => {
    const entry = { kind, setData(data) { this.data = data; }, setMarkers(data) { this.markers = data; }, createPriceLine() {}, applyOptions() {} };
    series.push(entry); return entry;
  };
  const context = {
    document, WebSocket: Wire, URLSearchParams, Date, Map, Set, JSON,
    location: { protocol: 'https:', host: 'fixture.invalid', pathname: '/replay', search: '?id=fixture-order&scope=fixture-scope', hash: '' },
    localStorage: { getItem: () => 'synthetic-dashboard-access', removeItem() {} },
    console: { log() {}, warn() {}, error: (...args) => errors.push(args.map(String).join(' ')) },
    setInterval: fn => { timers.push(fn); return timers.length; }, clearInterval() {}, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    addEventListener() {}, alert: message => { context.lastAlert = message; },
    fetch: () => { assert.fail('Reporting consumer unexpectedly used HTTP instead of authenticated Socket'); },
    ResizeObserver: class { observe() {} disconnect() {} },
    LightweightCharts: { CrosshairMode: { Normal: 0 }, LineStyle: { Dashed: 2 }, createChart: () => ({ addCandlestickSeries: () => addSeries('candles'), addLineSeries: () => addSeries('line'), addAreaSeries: () => addSeries('area'), addHistogramSeries: () => addSeries('volume'), priceScale: () => ({ applyOptions() {} }), timeScale: () => ({ fitContent() {} }), applyOptions() {}, remove() {} }) },
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ['public/js/core.js', 'public/js/websocket.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (match[1].trim()) vm.runInContext(match[1], context);
  const emit = message => sockets.at(-1).onmessage({ data: JSON.stringify(message) });
  const authenticate = () => {
    assert.equal(sockets.length, 1);
    assert.equal(sent.length, 0);
    const wire = sockets[0]; wire.readyState = 1; wire.onopen();
    assert.deepEqual(sent.map(row => row.type), ['auth']);
    emit({ type: 'auth_success' });
    assert.equal(sent.some(row => ['asset_change', 'request_historical'].includes(row.type)), false);
  };
  return { context, document, elements, sent, sockets, errors, series, emit, authenticate };
}
const time = 1794874080000;
const saved = {
  orderId: 'fixture-order', direction: 'long', accountingBasis: 'confirmed_net_after_fees',
  entry: { time: time + 1000, price: 100, confidence: 80, patterns: [], indicators: {} },
  exit: { time: time + 121000, price: 90, pnl: -4, pnlPercent: -4, holdTimeMs: 120000, reason: 'fixture close' },
  exitFills: [{ timestamp: time + 61000, exitPrice: 110, partialExit: true }, { timestamp: time + 121000, exitPrice: 90, partialExit: false }],
  candles: Array.from({ length: 3 }, (_, i) => ({ t: time + i * 60000, o: 100, h: 110, l: 90, c: 100, v: 0 })),
  postExitCandles: [], postExit: { scope: { scopeKey: 'fixture-scope', symbol: 'NVDA', timeframe: '1m' }, requestedCandles: 2, capturedCandles: 0 },
};
const replay = browser(fs.readFileSync('public/trade-replay.html', 'utf8'));
replay.authenticate();
assert.deepEqual(replay.sent.map(row => row.type), ['auth', 'identify', 'request_replay', 'request_replay_list']);
replay.emit({ type: 'replay_data', orderId: saved.orderId, scopeKey: 'another-scope', data: { ...saved, exit: { ...saved.exit, pnl: 999 } } });
assert.notEqual(replay.elements.get('v-pnl').textContent, '+$999.00');
replay.emit({ type: 'replay_data', orderId: saved.orderId, scopeKey: 'fixture-scope', data: saved });
assert.equal(replay.elements.get('v-pnl').textContent, '-$4.00');
assert.equal(replay.elements.get('s-rsi').textContent, 'Not recorded');
assert.equal(replay.elements.get('s-conf').textContent, '80%');
assert.deepEqual(Array.from(replay.series.find(row => row.kind === 'candles').markers, row => row.time), saved.candles.map(row => row.t / 1000));
assert.equal(replay.series.find(row => row.kind === 'volume').data.every(row => row.value === 0), true);
assert.equal(vm.runInContext('calculateVWAP([{ high: 110, low: 90, close: 100, volume: 0 }])[0]', replay.context), null);
assert.equal(vm.runInContext(`findClosestTime([{ time: ${time / 1000}, endTime: ${time / 1000 + 60} }], ${time / 1000 + 120})`, replay.context), null);
assert.deepEqual(replay.errors, []);

const journal = browser(fs.readFileSync('public/trade-journal.html', 'utf8'));
journal.authenticate();
assert.deepEqual(journal.sent.map(row => row.type), ['auth', 'identify', 'request_journal', 'request_journal_breakdowns', 'request_journal_equity', 'request_journal_calendar']);
journal.emit({ type: 'journal_snapshot', data: { status: 'unavailable', reason: 'Recorded fill is missing' } });
assert.equal(journal.elements.get('journal-content').hidden, true);
assert.equal(journal.elements.get('journal-availability').textContent, 'Recorded fill is missing');
assert.equal(vm.runInContext('formatUSD(-4)', journal.context), '-$4.00');
assert.equal(vm.runInContext('formatUSD(null)', journal.context), 'Unavailable');
journal.emit({ type: 'journal_export_failed', reason: 'Fixture destination is unavailable' });
assert.match(journal.context.lastAlert, /Fixture destination is unavailable/);
assert.deepEqual(journal.errors, []);

const modal = browser('<body></body>');
vm.runInContext(fs.readFileSync('public/js/panels/trade-replay.js', 'utf8'), modal.context);
const api = modal.context.OGZ.get('TradeReplay');
api.init(); modal.context.OGZ.get('Socket').connect(); modal.authenticate();
api.openReplay({ orderId: saved.orderId, scopeKey: 'fixture-scope' });
assert.equal(modal.sent.at(-1).type, 'request_replay');
modal.emit({ type: 'replay_data', orderId: saved.orderId, scopeKey: 'fixture-scope', data: saved });
const modalRoot = modal.document.getElementById('tradeReplayModal');
assert.ok(modalRoot, 'existing modal root must render');
assert.match(modalRoot.innerHTML, /-\$4\.00/);
assert.match(modalRoot.innerHTML, /80%/);
assert.doesNotMatch(modalRoot.innerHTML, /8000%|None detected|>Clean</);
const svg = modal.document.getElementById('trMiniChartContainer').children[0];
assert.equal(svg.tagName, 'svg');
assert.equal(svg.children.filter(row => row.tagName === 'circle').length, 4);
api.teardown();
assert.doesNotThrow(() => modal.emit({ type: 'replay_data', orderId: saved.orderId, scopeKey: 'fixture-scope', data: saved }));
assert.deepEqual(modal.errors, []);
console.log('REPORTING_CONSUMER_RECEIPT ' + JSON.stringify({
  sourceHashes: hashes, actualSharedSocketExecuted: true, requestsWaitForAuthentication: true,
  reportingPagesDoNotSendAssetChanges: true, savedScopeMatched: true,
  savedLossDisplayed: '-$4.00', savedConfidenceDisplayed: '80%', missingIndicatorDisplayed: 'Not recorded',
  partialAndFinalMarkersUseSavedEventTimes: true, noMarkerInventedAcrossGap: true,
  zeroVolumePreserved: true, zeroVolumeVwapUnavailable: true,
  missingFillHidesJournalTotals: true, exportFailureVisible: true,
  modalUsesSavedCandlesWithoutCurrentChart: true, modalHandlersRemovedOnTeardown: true,
  limitations: 'Synthetic DOM/chart/wire; no live browser pixels, session credentials, bot activation or broker execution.'
}));
