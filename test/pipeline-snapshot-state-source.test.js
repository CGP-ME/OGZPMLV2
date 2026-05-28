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
});
