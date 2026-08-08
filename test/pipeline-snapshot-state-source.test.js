describe('PipelineSnapshot state source', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../core/StateManager');
  });

  function buildSnapshotInstance(PipelineSnapshot, bot = {}) {
    const snapshot = Object.create(PipelineSnapshot.prototype);
    snapshot.bot = {
      priceHistory: [],
      ...bot,
    };
    snapshot.startTime = Date.now();
    snapshot.snapshotCount = 0;
    return snapshot;
  }

  function emptyStateManager() {
    return {
      get: jest.fn(() => undefined),
      getAllTrades: jest.fn(() => []),
    };
  }

  test('uses the StateManager singleton when bot.stateManager is not attached', () => {
    jest.resetModules();

    const activeTrade = {
      orderId: 'SIM_TEST_1',
      direction: 'short',
      entryPrice: 73341.31,
      entryTime: Date.now() - 60000,
    };
    const stateManager = {
      get: jest.fn((key) => ({
        position: -1217.23,
        balance: 9737.87,
        activeTrades: new Map([[activeTrade.orderId, activeTrade]]),
      }[key])),
      getAllTrades: jest.fn(() => [activeTrade]),
    };

    jest.doMock('../core/StateManager', () => ({
      getInstance: jest.fn(() => stateManager),
    }));

    const PipelineSnapshot = require('../core/PipelineSnapshot');
    const snapshot = buildSnapshotInstance(PipelineSnapshot, {
      position: 0,
      balance: 0,
    })._buildSnapshot();

    expect(snapshot.position).toBe(-1217.23);
    expect(snapshot.balance).toBe(9737.87);
    expect(snapshot.activeTrades).toHaveLength(1);
    expect(snapshot.activeTrades[0]).toMatchObject({
      orderId: activeTrade.orderId,
      direction: 'short',
      entryPrice: activeTrade.entryPrice,
    });
  });

  test('projects active trades with unknown direction as coded refusal', () => {
    jest.resetModules();

    const missingDirectionTrade = {
      orderId: 'SNAP_BAD_DIRECTION',
      action: 'BUY',
      entryPrice: 410.25,
      entryTime: Date.now() - 60000,
    };
    const paddedDirectionTrade = {
      ...missingDirectionTrade,
      orderId: 'SNAP_PADDED_DIRECTION',
      direction: ' long ',
    };
    const actionVocabDirectionTrade = {
      ...missingDirectionTrade,
      orderId: 'SNAP_ACTION_DIRECTION',
      direction: 'BUY',
    };
    const activeTrades = [missingDirectionTrade, paddedDirectionTrade, actionVocabDirectionTrade];
    const stateManager = {
      get: jest.fn((key) => ({
        position: 1000,
        balance: 9000,
        activeTrades: new Map(activeTrades.map((trade) => [trade.orderId, trade])),
      }[key])),
      getAllTrades: jest.fn(() => activeTrades),
    };

    jest.doMock('../core/StateManager', () => ({
      getInstance: jest.fn(() => stateManager),
    }));

    const PipelineSnapshot = require('../core/PipelineSnapshot');
    const snapshot = buildSnapshotInstance(PipelineSnapshot)._buildSnapshot();

    expect(snapshot.activeTrades).toHaveLength(3);
    for (const projectedTrade of snapshot.activeTrades) {
      expect(projectedTrade).toEqual(expect.objectContaining({
        direction: null,
        directionIntegrityRefusal: true,
        refusalCode: 'active_trade_direction_unknown',
      }));
    }
  });

  test('keeps explicit bot.stateManager as the first state source', () => {
    jest.resetModules();

    const botStateManager = {
      get: jest.fn((key) => ({
        position: 42,
        balance: 12000,
        activeTrades: new Map(),
      }[key])),
      getAllTrades: jest.fn(() => []),
    };

    const moduleGetInstance = jest.fn(() => ({
      get: jest.fn(() => -999),
      getAllTrades: jest.fn(() => []),
    }));
    jest.doMock('../core/StateManager', () => ({
      getInstance: moduleGetInstance,
    }));

    const PipelineSnapshot = require('../core/PipelineSnapshot');
    const snapshot = buildSnapshotInstance(PipelineSnapshot, {
      stateManager: botStateManager,
      position: 0,
      balance: 0,
    })._buildSnapshot();

    expect(snapshot.position).toBe(42);
    expect(snapshot.balance).toBe(12000);
    expect(moduleGetInstance).not.toHaveBeenCalled();
  });

  test('does not fall back to stale bot-local state when StateManager has no value', () => {
    jest.resetModules();

    const botStateManager = {
      get: jest.fn(() => undefined),
      getAllTrades: jest.fn(() => []),
    };

    const PipelineSnapshot = require('../core/PipelineSnapshot');
    const snapshot = buildSnapshotInstance(PipelineSnapshot, {
      stateManager: botStateManager,
      position: 999,
      balance: 99999,
    })._buildSnapshot();

    expect(snapshot.position).toBeNull();
    expect(snapshot.balance).toBeNull();
  });

  test('records explicit regime absence when no regime source is attached', () => {
    jest.resetModules();

    const PipelineSnapshot = require('../core/PipelineSnapshot');
    const snapshot = buildSnapshotInstance(PipelineSnapshot, {
      stateManager: emptyStateManager(),
    })._buildSnapshot();

    expect(snapshot.regime).toMatchObject({
      current: 'REGIME_SOURCE_NOT_ATTACHED',
      status: 'not_ready',
      unavailableReason: 'REGIME_SOURCE_NOT_ATTACHED',
      source: null
    });
    expect(JSON.stringify(snapshot.regime)).not.toMatch(/unknown|undefined|unclassified/i);
  });

  test('records explicit regime not-ready state instead of propagating ambiguous source values', () => {
    jest.resetModules();

    const PipelineSnapshot = require('../core/PipelineSnapshot');
    const snapshot = buildSnapshotInstance(PipelineSnapshot, {
      marketRegime: {
        currentRegime: 'unknown',
        confidence: 88,
        parameters: { sampleWindow: 250 }
      },
      stateManager: emptyStateManager(),
    })._buildSnapshot();

    expect(snapshot.regime).toMatchObject({
      current: 'REGIME_NOT_READY',
      confidence: 0,
      status: 'not_ready',
      unavailableReason: 'REGIME_NOT_READY',
      source: 'marketRegime.currentRegime',
      parameters: { sampleWindow: 250 }
    });
    expect(JSON.stringify(snapshot.regime)).not.toMatch(/unknown|undefined|unclassified/i);
  });

  test('keeps real regime values and source attribution', () => {
    jest.resetModules();

    const PipelineSnapshot = require('../core/PipelineSnapshot');
    const snapshot = buildSnapshotInstance(PipelineSnapshot, {
      marketRegime: {
        currentRegime: 'ranging',
        confidence: '67.5',
        parameters: { source: 'test' }
      },
      stateManager: emptyStateManager(),
    })._buildSnapshot();

    expect(snapshot.regime).toMatchObject({
      current: 'ranging',
      confidence: 67.5,
      source: 'marketRegime.currentRegime',
      status: 'ready',
      parameters: { source: 'test' }
    });
  });

  test('records regime read failures as error metadata, not current regime telemetry', () => {
    jest.resetModules();

    const bot = {
      stateManager: emptyStateManager(),
      marketRegime: {},
    };
    Object.defineProperty(bot.marketRegime, 'currentRegime', {
      get() {
        throw new Error('regime source exploded');
      }
    });

    const PipelineSnapshot = require('../core/PipelineSnapshot');
    const snapshot = buildSnapshotInstance(PipelineSnapshot, bot)._buildSnapshot();

    expect(snapshot.regime).toMatchObject({
      current: null,
      status: 'error',
      unavailableReason: 'REGIME_READ_FAILED',
      errorMessage: 'regime source exploded'
    });
  });
});
