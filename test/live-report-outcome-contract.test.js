'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createElementStub() {
  return {
    textContent: '',
    innerHTML: '',
    className: '',
    dataset: {},
    style: {},
    title: '',
    classList: { add: jest.fn(), remove: jest.fn() },
    appendChild: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    querySelector: jest.fn(() => null),
  };
}

function loadLiveReportWithSocket({ selectableAssets = null } = {}) {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'panels', 'live-report.js'),
    'utf8'
  );
  const refs = new Map();
  [
    'fresh',
    'symbol',
    'tf',
    'account',
    'position',
    'balance',
    'realized',
    'trades',
    'mode',
    'reason',
    'reasonMeta',
    'trace',
    'traceMeta',
    'todayTrades',
    'todayPnl',
    'todayWR',
    'streak',
    'tradesMeta',
    'tradeList',
  ].forEach(key => refs.set(key, createElementStub()));
  const root = createElementStub();
  root.querySelector = jest.fn(selector => {
    const match = selector.match(/data-k="([^"]+)"/);
    return match ? refs.get(match[1]) || null : null;
  });

  const handlers = {};
  const socket = {
    registerHandler: jest.fn((type, cb) => {
      handlers[type] = cb;
    }),
  };
  let registered = null;
  const context = {
    console,
    localStorage: { getItem: jest.fn(() => null) },
    setInterval: jest.fn(() => 17),
    clearInterval: jest.fn(),
    setTimeout: jest.fn(),
    document: {
      getElementById: jest.fn(id => {
        if (id === 'liveReport') return root;
        if (id === 'cp-assetSelector' && selectableAssets) {
          return { options: selectableAssets.map(value => ({ value })) };
        }
        return null;
      }),
      createElement: jest.fn(() => createElementStub()),
      createDocumentFragment: jest.fn(() => createElementStub()),
      addEventListener: jest.fn(),
      head: { appendChild: jest.fn() },
    },
    window: {
      OGZ: {
        get: jest.fn(name => (name === 'Socket' ? socket : null)),
        register: jest.fn((name, module) => {
          if (name === 'LiveReport') registered = module;
        }),
      },
    },
  };
  context.window.window = context.window;
  context.window.document = context.document;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { liveReport: registered, refs, handlers, socket };
}

function readFile(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function walkJsFiles(dir) {
  const absDir = path.join(__dirname, '..', dir);
  const out = [];
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const abs = path.join(absDir, entry.name);
    const rel = path.relative(path.join(__dirname, '..'), abs);
    if (entry.isDirectory()) {
      out.push(...walkJsFiles(rel));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(rel);
    }
  }
  return out;
}

function extractStringSet(source, setName) {
  const match = source.match(new RegExp(`const\\s+${setName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) return new Set();
  const values = new Set();
  const re = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(match[1]))) values.add(m[1]);
  return values;
}

function extractStaticEmitTraceEvents() {
  const events = new Set();
  for (const rel of [...walkJsFiles('core'), 'run-empire-v2.js']) {
    const source = readFile(rel);
    const re = /emitTrace\s*\([^,]+,\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(source))) events.add(m[1]);
  }
  return events;
}

describe('LiveReport closed-trade outcome contract', () => {
  test('preserves backend outcome and does not render zero money as positive', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'js', 'panels', 'live-report.js'),
      'utf8'
    );

    expect(source).toContain('function normalizeOutcome');
    expect(source).toContain("outcome:    d.outcome || null");
    expect(source).toContain("const isWin = outcome ? outcome === 'win' : pnl != null && pnl > 0");
    expect(source).toContain("const sign = v > 0 ? '+' : v < 0 ? '-' : ''");
  });

  test('renders real trace_event payloads without inventing trade data', () => {
    const source = readFile('public/js/panels/live-report.js');
    const empireSource = readFile('public/js/run-frontend-empire-v2.js');

    expect(empireSource).toContain("'trace_event'");
    expect(source).toContain('const TRACE_EVENTS_FOR_REPORT = new Set');
    expect(source).toContain("socket.registerHandler('trace_event'");
    expect(source).toContain('function summarizeTraceEvent');
    expect(source).toContain("reason ' + eventText(reason)");
    expect(source).toContain('Waiting for first trace_event frame.');
    expect(source).not.toContain('unclassified trace event');
    expect(source).not.toContain('unknown error');
  });

  test('labels the seed deposit as starting balance, not current balance', () => {
    const source = readFile('public/js/panels/live-report.js');

    expect(source).toContain('Starting Balance');
    expect(source).not.toContain('<div class="lr-k">Balance</div><div class="lr-v" data-k="balance">');
  });

  test('uses complete state_update runtimeScope for symbol when asset_switched is absent', () => {
    const { liveReport, refs, handlers } = loadLiveReportWithSocket();

    liveReport.init();
    handlers.state_update({
      type: 'state_update',
      runtimeScopeStatus: 'complete',
      runtimeScope: {
        symbol: 'BTC-USD',
        brokerId: 'kraken',
        broker: 'kraken',
        accountId: 'paper-main',
        assetClass: 'crypto',
        executionMode: 'paper',
        timeframe: '1m',
        scopeKey: 'paper:kraken:paper-main:crypto:BTC-USD:1m',
        scopeKeyVersion: 2,
        scopeComplete: true,
        missingFields: [],
      },
      state: {
        balance: 5000,
        realizedPnL: -17.47,
        tradeCount: 12,
        position: 0,
        runtimeScopeStatus: 'complete',
        runtimeScope: {
          symbol: 'BTC-USD',
          brokerId: 'kraken',
          accountId: 'paper-main',
          assetClass: 'crypto',
          executionMode: 'paper',
          timeframe: '1m',
          scopeKey: 'paper:kraken:paper-main:crypto:BTC-USD:1m',
          scopeKeyVersion: 2,
          scopeComplete: true,
          missingFields: [],
        },
      },
    });

    expect(refs.get('symbol').textContent).toBe('BTC-USD');
    expect(refs.get('account').textContent).toBe('paper-main');
    expect(refs.get('balance').textContent).toBe('$5,000.00');
    expect(refs.get('realized').textContent).toBe('-$17.47');
    expect(liveReport._compute().hasAsset).toBe(true);
  });

  test('does not invent a symbol from incomplete runtimeScope', () => {
    const { liveReport, refs, handlers } = loadLiveReportWithSocket();

    liveReport.init();
    handlers.state_update({
      type: 'state_update',
      runtimeScopeStatus: 'incomplete',
      runtimeScope: {
        symbol: 'BTC-USD',
        brokerId: 'kraken',
        assetClass: 'crypto',
        executionMode: 'paper',
        timeframe: '1m',
        scopeComplete: false,
        missingFields: ['accountId'],
      },
      state: {
        balance: 5000,
        runtimeScopeStatus: 'incomplete',
        runtimeScope: {
          symbol: 'BTC-USD',
          brokerId: 'kraken',
          assetClass: 'crypto',
          executionMode: 'paper',
          timeframe: '1m',
          scopeComplete: false,
          missingFields: ['accountId'],
        },
      },
    });

    expect(refs.get('symbol').textContent).toBe('—');
    expect(refs.get('account').textContent).toBe('—');
    expect(liveReport._compute().hasAsset).toBe(false);
  });

  test('clears stale symbol when a later state_update has incomplete runtimeScope', () => {
    const { liveReport, refs, handlers } = loadLiveReportWithSocket();

    liveReport.init();
    handlers.state_update({
      type: 'state_update',
      runtimeScopeStatus: 'complete',
      runtimeScope: {
        symbol: 'BTC-USD',
        brokerId: 'kraken',
        accountId: 'paper-main',
        assetClass: 'crypto',
        executionMode: 'paper',
        timeframe: '1m',
        scopeComplete: true,
      },
      state: {
        balance: 5000,
        runtimeScopeStatus: 'complete',
        runtimeScope: {
          symbol: 'BTC-USD',
          brokerId: 'kraken',
          accountId: 'paper-main',
          assetClass: 'crypto',
          executionMode: 'paper',
          timeframe: '1m',
          scopeComplete: true,
        },
      },
    });
    expect(refs.get('symbol').textContent).toBe('BTC-USD');

    handlers.state_update({
      type: 'state_update',
      runtimeScopeStatus: 'incomplete',
      runtimeScope: {
        symbol: 'ETH-USD',
        brokerId: 'kraken',
        assetClass: 'crypto',
        executionMode: 'paper',
        timeframe: '1m',
        scopeComplete: false,
        missingFields: ['accountId'],
      },
      state: {
        balance: 5000,
        runtimeScopeStatus: 'incomplete',
        runtimeScope: {
          symbol: 'ETH-USD',
          brokerId: 'kraken',
          assetClass: 'crypto',
          executionMode: 'paper',
          timeframe: '1m',
          scopeComplete: false,
          missingFields: ['accountId'],
        },
      },
    });

    expect(refs.get('symbol').textContent).toBe('—');
    expect(refs.get('account').textContent).toBe('—');
    expect(liveReport._compute().hasAsset).toBe(false);
  });

  test('refuses partial asset_switched payloads after a valid runtime scope', () => {
    const { liveReport, refs, handlers } = loadLiveReportWithSocket();

    liveReport.init();
    handlers.state_update({
      type: 'state_update',
      runtimeScopeStatus: 'complete',
      runtimeScope: {
        symbol: 'BTC-USD',
        brokerId: 'kraken',
        accountId: 'paper-main',
        assetClass: 'crypto',
        executionMode: 'paper',
        timeframe: '1m',
        scopeComplete: true,
      },
      state: {
        balance: 5000,
        runtimeScopeStatus: 'complete',
        runtimeScope: {
          symbol: 'BTC-USD',
          brokerId: 'kraken',
          accountId: 'paper-main',
          assetClass: 'crypto',
          executionMode: 'paper',
          timeframe: '1m',
          scopeComplete: true,
        },
      },
    });
    expect(refs.get('symbol').textContent).toBe('BTC-USD');

    handlers.asset_switched({
      type: 'asset_switched',
      data: { label: 'ETH-USD' },
    });

    expect(refs.get('symbol').textContent).toBe('—');
    expect(refs.get('account').textContent).toBe('—');
    expect(liveReport._compute().hasAsset).toBe(false);
  });

  test('accepts asset_switched only when it carries complete runtime scope', () => {
    const { liveReport, refs, handlers } = loadLiveReportWithSocket({
      selectableAssets: ['BTC-USD', 'ETH-USD']
    });

    liveReport.init();
    handlers.asset_switched({
      type: 'asset_switched',
      data: {
        runtimeScopeStatus: 'complete',
        runtimeScope: {
          symbol: 'ETH-USD',
          brokerId: 'kraken',
          accountId: 'paper-main',
          assetClass: 'crypto',
          executionMode: 'paper',
          timeframe: '1m',
          scopeComplete: true,
        },
      },
    });

    expect(refs.get('symbol').textContent).toBe('ETH-USD');
    expect(refs.get('account').textContent).toBe('paper-main');
    expect(liveReport._compute().hasAsset).toBe(true);
  });

  test('rejects asset_switched runtime scope for a non-selectable dashboard symbol', () => {
    const { liveReport, refs, handlers } = loadLiveReportWithSocket({
      selectableAssets: ['BTC-USD', 'ETH-USD']
    });

    liveReport.init();
    handlers.asset_switched({
      type: 'asset_switched',
      data: {
        runtimeScopeStatus: 'complete',
        runtimeScope: {
          symbol: 'SOL-USD',
          brokerId: 'kraken',
          accountId: 'paper-main',
          assetClass: 'crypto',
          executionMode: 'paper',
          timeframe: '1m',
          scopeComplete: true,
        },
      },
    });

    expect(refs.get('symbol').textContent).toBe('—');
    expect(refs.get('account').textContent).toBe('—');
    expect(liveReport._compute().hasAsset).toBe(false);
  });

  test('rejects asset_switched runtime scope when no dashboard selector defines selectable assets', () => {
    const { liveReport, refs, handlers } = loadLiveReportWithSocket();

    liveReport.init();
    handlers.asset_switched({
      type: 'asset_switched',
      data: {
        runtimeScopeStatus: 'complete',
        runtimeScope: {
          symbol: 'SOL-USD',
          brokerId: 'kraken',
          accountId: 'paper-main',
          assetClass: 'crypto',
          executionMode: 'paper',
          timeframe: '1m',
          scopeComplete: true,
        },
      },
    });

    expect(refs.get('symbol').textContent).toBe('—');
    expect(refs.get('account').textContent).toBe('—');
    expect(liveReport._compute().hasAsset).toBe(false);
  });

  test('rejects malformed complete runtimeScope when required scope fields are missing', () => {
    const { liveReport, refs, handlers } = loadLiveReportWithSocket();

    liveReport.init();
    handlers.state_update({
      type: 'state_update',
      symbol: 'ETH-USD',
      accountId: 'paper-main',
      runtimeScopeStatus: 'complete',
      runtimeScope: {
        symbol: 'ETH-USD',
        brokerId: 'kraken',
        assetClass: 'crypto',
        executionMode: 'paper',
        timeframe: '1m',
        scopeComplete: true,
      },
      state: {
        balance: 5000,
        runtimeScopeStatus: 'complete',
        runtimeScope: {
          symbol: 'ETH-USD',
          brokerId: 'kraken',
          assetClass: 'crypto',
          executionMode: 'paper',
          timeframe: '1m',
          scopeComplete: true,
        },
      },
    });

    expect(refs.get('symbol').textContent).toBe('—');
    expect(refs.get('account').textContent).toBe('—');
    expect(liveReport._compute().hasAsset).toBe(false);
  });

  test('rejects top-level symbol and account when runtimeScope is absent', () => {
    const { liveReport, refs, handlers } = loadLiveReportWithSocket();

    liveReport.init();
    handlers.state_update({
      type: 'state_update',
      symbol: 'ETH-USD',
      accountId: 'paper-main',
      runtimeScopeStatus: 'complete',
      state: {
        balance: 5000,
        accountId: 'paper-main',
      },
    });

    expect(refs.get('symbol').textContent).toBe('—');
    expect(refs.get('account').textContent).toBe('—');
    expect(liveReport._compute().hasAsset).toBe(false);
  });

  test('classifies every current static backend trace event name', () => {
    const source = readFile('public/js/panels/live-report.js');
    const knownEvents = extractStringSet(source, 'TRACE_EVENTS_FOR_REPORT');
    const emittedEvents = extractStaticEmitTraceEvents();
    const missing = [...emittedEvents].filter(eventName => !knownEvents.has(eventName)).sort();

    expect(emittedEvents.size).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  test('updates the live report from a real trace_event reason payload', () => {
    const { liveReport, refs, handlers, socket } = loadLiveReportWithSocket();

    liveReport.init();

    expect(socket.registerHandler).toHaveBeenCalledWith('trace_event', expect.any(Function));
    handlers.trace_event({
      type: 'trace_event',
      event: 'DECISION_SKIP',
      traceId: 'candle_1',
      symbol: 'BTC-USD',
      timeframe: '1m',
      brokerId: 'kraken',
      accountId: 'default',
      executionMode: 'paper',
      scopeKey: 'paper:kraken:default:crypto:BTC-USD:1m',
      fields: {
        reason: 'hold_direction|below_min_confidence',
        finalDirection: 'hold',
        confidencePct: 0,
        minConfidencePct: 50,
      },
    });

    expect(refs.get('trace').textContent).toContain('DECISION_SKIP');
    expect(refs.get('trace').textContent).toContain('reason hold_direction|below_min_confidence');
    expect(refs.get('trace').textContent).toContain('confidence 0%');
    expect(refs.get('traceMeta').textContent).toContain('BTC-USD');
    expect(refs.get('traceMeta').textContent).toContain('broker kraken');
    expect(liveReport._compute().hasTrace).toBe(true);
  });

  test('surfaces future unmapped trace events as actionable schema work', () => {
    const { liveReport, refs, handlers } = loadLiveReportWithSocket();

    liveReport.init();
    handlers.trace_event({
      type: 'trace_event',
      event: 'FUTURE_BACKEND_EVENT',
      timestamp: Date.now() - 120000,
      symbol: 'BTC-USD',
      timeframe: '1m',
      fields: {
        reason: 'halted',
        confidence: 0.72,
        minConfidence: 0.5,
      },
    });

    expect(refs.get('trace').textContent).toContain('UNMAPPED_TRACE_EVENT');
    expect(refs.get('trace').textContent).toContain('event FUTURE_BACKEND_EVENT');
    expect(refs.get('trace').textContent).toContain('action required add trace vocabulary');
    expect(refs.get('trace').textContent).not.toContain('unclassified');
    expect(refs.get('trace').textContent).not.toContain('unknown');
    expect(refs.get('trace').textContent).not.toContain('undefined');
    expect(refs.get('trace').textContent).toContain('reason halted');
    expect(refs.get('trace').textContent).toContain('confidence 72%');
    expect(refs.get('trace').textContent).toContain('min 50%');
    expect(refs.get('traceMeta').textContent).toContain('BTC-USD');
    expect(refs.get('traceMeta').textContent).toContain('action required add trace vocabulary');
    expect(refs.get('traceMeta').textContent).toContain('field keys confidence,minConfidence,reason');
    expect(refs.get('traceMeta').textContent).toContain('trace stale');
    expect(liveReport._compute().hasTrace).toBe(true);
  });

  test('turns missing trace event names into explicit schema errors', () => {
    const { liveReport, refs, handlers } = loadLiveReportWithSocket();

    liveReport.init();
    handlers.trace_event({
      type: 'trace_event',
      timestamp: Date.now(),
      symbol: 'TSLA',
      brokerId: 'alpaca',
      fields: {
        reason: undefined,
        confidencePct: undefined,
      },
    });

    expect(refs.get('trace').textContent).toContain('TRACE_SCHEMA_ERROR');
    expect(refs.get('trace').textContent).toContain('missing required field event');
    expect(refs.get('trace').textContent).not.toContain('unknown');
    expect(refs.get('trace').textContent).not.toContain('unclassified');
    expect(refs.get('trace').textContent).not.toContain('undefined');
    expect(refs.get('traceMeta').textContent).toContain('event field missing');
    expect(refs.get('traceMeta').textContent).toContain('schema path trace_event.event');
    expect(refs.get('traceMeta').textContent).toContain('action required fix trace payload schema');
    expect(refs.get('traceMeta').textContent).toContain('field keys confidencePct,reason');
    expect(refs.get('traceMeta').textContent).toContain('TSLA');
    expect(refs.get('traceMeta').textContent).toContain('broker alpaca');
  });

  test.each([
    ['kraken', 'BTC-USD', 'crypto'],
    ['alpaca', 'TSLA', 'stocks'],
  ])('renders the shared order signal path as classified for %s', (brokerId, symbol, assetClass) => {
    const { liveReport, refs, handlers } = loadLiveReportWithSocket();
    const traceId = `trace_${brokerId}_1`;
    const base = {
      type: 'trace_event',
      traceId,
      signalId: `signal_${brokerId}_1`,
      symbol,
      timeframe: '1m',
      brokerId,
      accountId: 'default',
      assetClass,
      executionMode: 'live',
      scopeKey: `live:${brokerId}:default:${assetClass}:${symbol}:1m`,
    };
    const pathEvents = [
      ['EXECUTE_HANDOFF', { action: 'BUY', finalDirection: 'buy', confidencePct: 72 }],
      ['ORDER_EXECUTE_START', { action: 'BUY', confidencePct: 72 }],
      ['ORDER_PLAN', { action: 'BUY', side: 'buy', sizeUsd: 100, orderQuantity: 1 }],
      ['BROKER_ORDER_REQUEST', { side: 'buy', sizeUsd: 100, orderQuantity: 1 }],
      ['BROKER_ORDER_RESULT', { success: true, orderId: `${brokerId.toUpperCase()}_1` }],
      ['EXECUTE_RETURN', { success: true, action: 'BUY' }],
    ];

    liveReport.init();

    for (const [eventName, fields] of pathEvents) {
      handlers.trace_event({
        ...base,
        event: eventName,
        fields: {
          ...fields,
          brokerId,
          symbol,
        },
      });

      expect(refs.get('trace').textContent).toContain(eventName);
      expect(refs.get('trace').textContent).not.toContain('UNMAPPED_TRACE_EVENT');
      expect(refs.get('trace').textContent).not.toContain('unclassified');
      expect(refs.get('trace').textContent).not.toContain('unknown');
      expect(refs.get('trace').textContent).not.toContain('undefined');
      expect(refs.get('traceMeta').textContent).toContain(symbol);
      expect(refs.get('traceMeta').textContent).toContain(`broker ${brokerId}`);
    }
  });

  test('normalizes known trace event names and refuses nonnumeric confidence text', () => {
    const { liveReport, refs, handlers } = loadLiveReportWithSocket();

    liveReport.init();
    handlers.trace_event({
      type: 'trace_event',
      event: 'decision_skip ',
      timestamp: Date.now(),
      fields: {
        reason: 'line\nbreak',
        confidencePct: '<script>alert(1)</script>',
      },
    });

    expect(refs.get('trace').textContent).toContain('DECISION_SKIP');
    expect(refs.get('trace').textContent).not.toContain('UNMAPPED_TRACE_EVENT');
    expect(refs.get('trace').textContent).not.toContain('unclassified');
    expect(refs.get('trace').textContent).toContain('reason line break');
    expect(refs.get('trace').textContent).toContain('confidence invalid');
    expect(refs.get('trace').textContent).not.toContain('<script>');
    expect(refs.get('traceMeta').textContent).toContain('raw event decision_skip');
  });

  test('rejects out-of-range numeric confidence values', () => {
    const { liveReport, refs, handlers } = loadLiveReportWithSocket();

    liveReport.init();
    handlers.trace_event({
      type: 'trace_event',
      event: 'STRATEGY_DECISION',
      fields: {
        confidence: 12345,
        minConfidence: -1,
      },
    });

    expect(refs.get('trace').textContent).toContain('STRATEGY_DECISION');
    expect(refs.get('trace').textContent).toContain('confidence invalid');
    expect(refs.get('trace').textContent).toContain('min invalid');
    expect(refs.get('trace').textContent).not.toContain('12345%');
  });

  test('logs trace handler failures instead of silently swallowing them', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { liveReport, refs, handlers } = loadLiveReportWithSocket();
      const fields = {};
      Object.defineProperty(fields, 'reason', {
        get() {
          throw new Error('trace reason getter failed');
        },
      });

      liveReport.init();
      expect(() => handlers.trace_event({
        type: 'trace_event',
        event: 'DECISION_SKIP',
        fields,
      })).not.toThrow();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('socket handler failed for trace_event'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('trace reason getter failed'));
      expect(liveReport._compute().hasTrace).toBe(true);
      expect(refs.get('trace').textContent).toContain('TRACE_HANDLER_ERROR');
      expect(refs.get('traceMeta').textContent).toContain('trace reason getter failed');
    } finally {
      warn.mockRestore();
    }
  });
});
