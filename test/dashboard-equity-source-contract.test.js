'use strict';

const fs = require('fs');
const path = require('path');

const originalEnv = { ...process.env };
process.env = {
  ...originalEnv,
  DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
  EXECUTION_MODE: 'paper',
  CANDLE_SOURCE: 'alpaca_ws',
  BACKTEST_MODE: 'false',
  BACKTEST_FAST: 'false',
  BROKER: 'alpaca',
  ALPACA_MODE: 'paper',
  ALPACA_API_KEY: 'test-alpaca-key',
  ALPACA_API_SECRET: 'test-alpaca-secret',
  TRADING_PAIR: 'TSLA',
  ALPACA_SYMBOLS: 'TSLA',
  ASSET_CLASS: 'stocks',
  RISK_MANAGER_BYPASS: 'false',
  ACCOUNT_DRAWDOWN_BYPASS: 'false',
  MAX_DRAWDOWN: '5',
  MAX_DAILY_LOSS: '1',
  MAX_WEEKLY_LOSS: '5',
  MAX_MONTHLY_LOSS: '5',
};

const ConfigLoader = require('../foundation/ConfigLoader');
ConfigLoader.load({ force: true, silent: true, loadDotenv: false });

const CandleProcessor = require('../core/CandleProcessor');
const { getInstance: getStateManager } = require('../core/StateManager');

function makeCtx(send) {
  return {
    symbolContexts: new Map(),
    tradingPair: 'TSLA',
    candleTimeframe: '15m',
    _candleStore: { addCandle: jest.fn() },
    priceHistory: [],
    indicatorEngine: {
      updateCandle: jest.fn(),
      getRenderPacket: jest.fn(() => ({ indicators: {}, overlays: {} })),
      getSnapshot: jest.fn(() => ({ indicators: {} })),
    },
    mtfAdapter: null,
    emaCrossover: null,
    maDynamicSR: null,
    liquiditySweep: null,
    volumeProfile: null,
    candleSaveCounter: 0,
    saveCandleHistory: jest.fn(),
    config: {
      enableBacktestMode: false,
      brokerId: 'alpaca',
      accountId: 'acct-dashboard-equity',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      dataFeed: {
        bootRestHydrationLimit: 60,
        livenessBackfillLimit: 10,
        livenessCheckIntervalMs: 60000,
        maxDataSilenceMs: 120000,
        activeTimeframeMultiplier: 1.5,
        activeTimeframeSlackMs: 60000,
        maxBackfillAgeMultiplier: 2,
        maxBackfillAgeSlackMs: 60000,
        staleDataMaxAgeMs: 120000,
        staleDataRecoveryAgeMs: 30000,
        gapThresholdMultiplier: 1.5,
        gapBackfillBufferCandles: 5,
        gapRecoveryCleanCandlesRequired: 3,
        gapBackfillRetryDelayMs: 60000,
        expectedQuietLogIntervalMs: 300000,
      },
    },
    dashboardWsConnected: true,
    dashboardWs: {
      readyState: 1,
      send,
    },
    getCandlesForTimeframe: jest.fn(() => []),
    broadcastEdgeAnalytics: jest.fn(),
  };
}

describe('dashboard equity source contract', () => {
  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    const stateManager = getStateManager();
    stateManager.set('initialBalance', 5000);
    stateManager.set('balance', 4700);
    stateManager.set('realizedPnL', 10);
    stateManager.set('position', 3);
    stateManager.set('totalTrades', 0);
    stateManager.set('closedTrades', []);
    stateManager.set('lastPrices', new Map([['TSLA', 110]]));
    stateManager.set('activeTrades', new Map([
      ['TRADE-1', {
        symbol: 'TSLA',
        entryPrice: 100,
        sizeUsd: 300,
        direction: 'long',
        entryOrderQuantity: 3,
        entryOrderQuantityUnit: 'shares',
        remainingOrderQuantity: 3,
        remainingOrderQuantityUnit: 'shares',
      }],
    ]));
  });

  test('CandleProcessor price payload publishes equity instead of free-cash balance', () => {
    const sent = [];
    const ctx = makeCtx((message) => sent.push(JSON.parse(message)));
    const processor = new CandleProcessor(ctx);

    processor.handleMarketData({
      symbol: 'TSLA',
      timeframe: '15m',
      brokerId: 'alpaca',
      accountId: 'acct-dashboard-equity',
      assetClass: 'stocks',
      executionMode: 'paper',
      data: {
        symbol: 'TSLA',
        timeframe: '15m',
        t: 1781299200000,
        etime: 1781300100000,
        o: 100,
        h: 111,
        l: 99,
        c: 110,
        v: 1000,
      },
    });

    const priceFrame = sent.find(message => message.type === 'price');
    expect(priceFrame).toBeTruthy();
    expect(priceFrame.equity).toBe(5040);
    expect(priceFrame.data.equity).toBe(5040);
    expect(priceFrame.balance).toBeUndefined();
    expect(priceFrame.data.balance).toBeUndefined();
    expect(priceFrame.totalPnL).toBe(40);
  });

  test('StateManager dashboard state_update publishes fee-aware totalPnL from equity minus initial balance', () => {
    const stateManager = getStateManager();
    const sent = [];
    stateManager.dashboardWs = {
      readyState: 1,
      send(message) {
        sent.push(JSON.parse(message));
      },
    };
    stateManager.set('initialBalance', 5000);
    stateManager.set('realizedPnL', -17.47);
    stateManager.set('unrealizedPnL', 0);
    stateManager.set('totalPnL', 33.53);
    stateManager.set('activeTrades', new Map());

    const ok = stateManager.broadcastToDashboard({}, { reason: 'fee_aware_dashboard_contract' });

    expect(ok).toBe(true);
    const frame = sent.find(message => message.type === 'state_update');
    expect(frame).toBeTruthy();
    expect(frame.initialBalance).toBe(5000);
    expect(frame.state.initialBalance).toBe(5000);
    expect(frame.equity).toBeCloseTo(4982.53, 5);
    expect(frame.totalPnL).toBeCloseTo(-17.47, 5);
    expect(frame.state.totalPnL).toBeCloseTo(-17.47, 5);
    expect(frame.realizedPnL).toBeCloseTo(-17.47, 5);
    expect(frame.unrealizedPnL).toBeCloseTo(0, 5);
    expect(frame.pnlStatus).toBe('priced');
    expect(frame.pnlMissingPriceSymbols).toEqual([]);
  });

  test('StateManager dashboard state_update does not fake unrealized P&L for unpriced open trades', () => {
    const stateManager = getStateManager();
    const sent = [];
    stateManager.dashboardWs = {
      readyState: 1,
      send(message) {
        sent.push(JSON.parse(message));
      },
    };
    stateManager.set('initialBalance', 5000);
    stateManager.set('realizedPnL', -17.47);
    stateManager.set('unrealizedPnL', 0);
    stateManager.set('totalPnL', 33.53);
    stateManager.set('lastPrices', new Map());
    stateManager.set('activeTrades', new Map([
      ['TRADE-UNPRICED', {
        id: 'TRADE-UNPRICED',
        symbol: 'TSLA',
        entryPrice: 100,
        sizeUsd: 1000,
        direction: 'long',
        entryOrderQuantity: 10,
        entryOrderQuantityUnit: 'shares',
        remainingOrderQuantity: 10,
        remainingOrderQuantityUnit: 'shares',
      }],
    ]));

    const ok = stateManager.broadcastToDashboard({}, { reason: 'unpriced_open_trade_contract' });

    expect(ok).toBe(true);
    const frame = sent.find(message => message.type === 'state_update');
    expect(frame).toBeTruthy();
    expect(frame.equity).toBeNull();
    expect(frame.totalPnL).toBeNull();
    expect(frame.unrealizedPnL).toBeNull();
    expect(frame.state.equity).toBeNull();
    expect(frame.state.totalPnL).toBeNull();
    expect(frame.state.unrealizedPnL).toBeNull();
    expect(frame.realizedPnL).toBeCloseTo(-17.47, 5);
    expect(frame.pnlStatus).toBe('unpriced_open_position');
    expect(frame.pnlMissingPriceSymbols).toEqual(['TSLA']);
  });

  test('StateManager dashboard state_update does not mark normalized-only price aliases as priced', () => {
    const stateManager = getStateManager();
    const sent = [];
    stateManager.dashboardWs = {
      readyState: 1,
      send(message) {
        sent.push(JSON.parse(message));
      },
    };
    stateManager.set('initialBalance', 5000);
    stateManager.set('realizedPnL', 0);
    stateManager.set('unrealizedPnL', 0);
    stateManager.set('totalPnL', 0);
    stateManager.set('lastPrices', new Map([['BTC-USD', 110]]));
    stateManager.set('activeTrades', new Map([
      ['TRADE-SLASH', {
        id: 'TRADE-SLASH',
        symbol: 'BTC/USD',
        entryPrice: 100,
        sizeUsd: 1000,
        direction: 'long',
        entryOrderQuantity: 10,
        entryOrderQuantityUnit: 'shares',
        remainingOrderQuantity: 10,
        remainingOrderQuantityUnit: 'shares',
      }],
    ]));

    const ok = stateManager.broadcastToDashboard({}, { reason: 'normalized_alias_contract' });

    expect(ok).toBe(true);
    const frame = sent.find(message => message.type === 'state_update');
    expect(frame).toBeTruthy();
    expect(frame.equity).toBeNull();
    expect(frame.totalPnL).toBeNull();
    expect(frame.pnlStatus).toBe('unpriced_open_position');
    expect(frame.pnlMissingPriceSymbols).toEqual(['BTC-USD']);
  });

  test('equity curve samples state and balance events from equity fields only', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'public/js/panels/equity-curve.js'),
      'utf8'
    );
    const stateHandler = source.match(/function handleStateUpdate\(data\) \{[\s\S]*?\n    \}/)[0];
    const balanceHandler = source.match(/function handleBalanceUpdate\(data\) \{[\s\S]*?\n    \}/)[0];

    expect(stateHandler).toContain('const equity = captureAccountSnapshot(data);');
    expect(stateHandler).toContain('addEquitySample(data.ts || data.timestamp || Date.now(), equity)');
    expect(stateHandler).not.toContain('data.balance');
    expect(balanceHandler).toContain('const equity = captureAccountSnapshot(data);');
    expect(balanceHandler).toContain('addEquitySample(data.ts || data.timestamp || Date.now(), equity)');
    expect(balanceHandler).not.toContain('data.balance');
    expect(source).toContain('latestTotalPnL: null');
    expect(source).toContain('accountEquityAvailable: true');
    expect(source).toContain('accountPnlAvailable: true');
    expect(source).toContain('accountPnlBlockedByStatus: false');
    expect(source).toContain('function captureAccountSnapshot(data)');
    expect(source).toContain("label: 'Current Equity'");
    expect(source).not.toContain("label: 'Current Balance'");
    expect(source).toContain('const source = Object.assign({}, data);');
    expect(source).toContain('Object.assign(source, data.data);');
    expect(source).toContain('Object.assign(source, data.state);');
    expect(source).toContain("if (value === null || value === undefined || value === '') return null;");
    expect(source).toContain("if (state.accountPnlBlockedByStatus && source.pnlStatus !== 'priced')");
    expect(source).toContain('state.latestTotalPnL = null;');
    expect(source).toContain("if (source.equity === null || explicitPnl === null || source.pnlStatus === 'unpriced_open_position')");
    expect(source).toContain('state.accountPnlAvailable = false;');
    expect(source).toContain('state.accountPnlBlockedByStatus = true;');
    expect(source).toContain("if (source.pnlStatus === 'priced')");
    expect(source).toContain('state.accountPnlBlockedByStatus = false;');
    expect(source).toContain('const current = state.accountEquityAvailable ? lastSample.equity : null;');
    expect(source).toContain('const pnl = state.accountPnlAvailable');
    expect(source).toContain('source.totalPnL != null ? source.totalPnL : source.totalPnl');
    expect(source).toContain('state.startingEquity = equity - totalPnL');
    expect(source).toContain('Number.isFinite(state.latestTotalPnL) ? state.latestTotalPnL : lastSample.equity - starting');
    expect(source).toContain('const equity = captureAccountSnapshot(data);');
    expect(source).toContain('addEquitySample(data.ts || data.timestamp || Date.now(), equity)');
    expect(source).not.toContain('addTradeMarker(data.ts || Date.now(), data.symbol, data.side, data.pnl, data.balance)');
    expect(source).not.toContain(': 50000');
  });

  test('dashboard price consumers do not fall back from equity to balance', () => {
    const riskGauge = fs.readFileSync(
      path.join(__dirname, '..', 'public/js/panels/risk-gauge.js'),
      'utf8'
    );
    const sizePreview = fs.readFileSync(
      path.join(__dirname, '..', 'public/js/panels/size-preview.js'),
      'utf8'
    );
    const headerStrip = fs.readFileSync(
      path.join(__dirname, '..', 'public/js/panels/header-strip.js'),
      'utf8'
    );
    const goalTracker = fs.readFileSync(
      path.join(__dirname, '..', 'public/js/panels/goal-tracker.js'),
      'utf8'
    );
    const customAlerts = fs.readFileSync(
      path.join(__dirname, '..', 'public/js/panels/custom-alerts.js'),
      'utf8'
    );
    const milestoneEffects = fs.readFileSync(
      path.join(__dirname, '..', 'public/js/panels/milestone-effects.js'),
      'utf8'
    );

    expect(riskGauge).toContain('currentEquity: null');
    expect(riskGauge).toContain('function updateEquity(equity)');
    expect(riskGauge).toContain('const eq = data && data.equity;');
    expect(riskGauge).toContain('const eq = d && (d.equity != null ? d.equity : (d.data && d.data.equity));');
    expect(riskGauge).toContain('const eq = d && (d.equity != null ? d.equity : (d.state && d.state.equity));');
    expect(riskGauge).toContain('ogz.risk.sessionStartEquity');
    expect(riskGauge).toContain('ogz.risk.sessionPeakEquity');
    expect(riskGauge).not.toContain('data.equity != null ? data.equity : data.balance');
    expect(riskGauge).not.toContain('d.balance != null ? d.balance : (d.data && d.data.balance)');
    expect(riskGauge).not.toContain('d.state && d.state.balance');
    expect(riskGauge).not.toContain('onTradePnl');
    expect(riskGauge).not.toContain("registerHandler('trade'");
    expect(riskGauge).not.toContain('sessionStartBalance');
    expect(sizePreview).toContain('const eq = data.equity;');
    expect(sizePreview).toContain('const eq = d && (d.equity != null ? d.equity : (d.data && d.data.equity));');
    expect(sizePreview).toContain('const eq = d && (d.equity != null ? d.equity : (d.state && d.state.equity));');
    expect(sizePreview).not.toContain('data.equity != null ? data.equity : data.balance');
    expect(sizePreview).not.toContain('d.balance != null ? d.balance : (d.data && d.data.balance)');
    expect(sizePreview).not.toContain('d.state && d.state.balance');
    expect(headerStrip).toContain('const equity  = Number(s.equity);');
    expect(headerStrip).toContain('state.equity = equity;');
    expect(headerStrip).toContain('const equity = Number(data && data.equity);');
    expect(headerStrip).toContain('sessionOpenEquity');
    expect(headerStrip).not.toContain('state.equity = balance +');
    expect(headerStrip).not.toContain('state.balance');
    expect(headerStrip).not.toContain('const balance = Number(data && data.balance)');
    expect(headerStrip).not.toContain('sessionOpenBalance');
    expect(goalTracker).toContain('const tracked = state.longTerm.currentSaved || state.equity || 0;');
    expect(goalTracker).toContain('const equity = Number(s.equity) || 0;');
    expect(goalTracker).toContain('function onMilestoneEquity(payload)');
    expect(goalTracker).not.toContain('state.balance');
    expect(goalTracker).not.toContain('payload.balance');
    expect(goalTracker).not.toContain('currentSaved || state.balance');
    expect(customAlerts).toContain('const equity = Number(s.equity) || 0;');
    expect(customAlerts).toContain("OGZ.bus.emit('celebration:milestone', { equity });");
    expect(customAlerts).not.toContain('lastBalance');
    expect(customAlerts).not.toContain('OGZ.bus.emit(\'celebration:milestone\', { balance })');
    expect(milestoneEffects).toContain('peakEquity');
    expect(milestoneEffects).toContain('function onMilestoneEquity(payload)');
    expect(milestoneEffects).not.toContain('peakBalance');
    expect(milestoneEffects).not.toContain('payload.balance');
  });
});
