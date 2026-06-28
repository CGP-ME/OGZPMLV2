'use strict';

const mockStateManager = {
  buildTradeScope: jest.fn(() => ({
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'acct-main',
    accountIdSource: 'config',
    assetClass: 'stocks',
    executionMode: 'paper',
    timeframe: '15m',
    key: 'paper:alpaca:acct-main:stocks:TSLA:15m',
  })),
  openPosition: jest.fn(),
};

jest.mock('../core/StateManager', () => ({
  getInstance: () => mockStateManager,
}));

const PositionTracker = require('../core/PositionTracker');

describe('PositionTracker exit ownership contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseParams = (overrides = {}) => ({
    size: 500,
    price: 100,
    side: 'long',
    entryStrategy: 'RSI',
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'acct-main',
    assetClass: 'stocks',
    executionMode: 'paper',
    timeframe: '15m',
    exitContract: {
      stopLossPercent: -0.5,
      takeProfitPercent: 1,
      useStructuralExits: false,
    },
    ...overrides,
  });

  test('rejects missing structural ownership before delegating to StateManager', async () => {
    const tracker = new PositionTracker();

    const result = await tracker.openPosition(baseParams({
      exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
    }));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/PositionTracker\.openPosition: exitContract\.useStructuralExits missing\/invalid/);
    expect(mockStateManager.buildTradeScope).not.toHaveBeenCalled();
    expect(mockStateManager.openPosition).not.toHaveBeenCalled();
  });

  test('delegates explicit ownership contracts to StateManager', async () => {
    mockStateManager.openPosition.mockResolvedValue({ success: true });
    const tracker = new PositionTracker();

    const result = await tracker.openPosition(baseParams());

    expect(result.success).toBe(true);
    expect(mockStateManager.buildTradeScope).toHaveBeenCalledTimes(1);
    expect(mockStateManager.openPosition).toHaveBeenCalledTimes(1);
    expect(mockStateManager.openPosition.mock.calls[0][2].exitContract.useStructuralExits).toBe(false);
  });
});
