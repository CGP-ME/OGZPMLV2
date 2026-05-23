'use strict';

const mockStateManager = {
  get: jest.fn(),
  getAvailableCapital: jest.fn(),
  isHalted: jest.fn(() => false),
  getHaltReason: jest.fn(() => null),
  isSymbolHalted: jest.fn(() => false),
  getSymbolHaltReason: jest.fn(() => null),
};

jest.mock('../core/StateManager', () => ({
  getInstance: () => mockStateManager,
}));

const OrderExecutor = require('../core/OrderExecutor');

function makeExecutor(config = {}, ctx = {}) {
  return new OrderExecutor({
    config: {
      brokerId: 'alpaca',
      assetClass: 'stocks',
      timeframe: '15m',
      executionMode: 'paper',
      enableBacktestMode: false,
      ...config,
    },
    backtestMode: false,
    paperTrading: true,
    orderRouter: { sendOrder: jest.fn() },
    ...ctx,
  });
}

describe('OrderExecutor pause gate', () => {
  let errorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return false;
      if (key === 'pauseReason') return 'manual pause';
      if (key === 'lastError') return null;
      return null;
    });
    mockStateManager.getAvailableCapital.mockReturnValue(10000);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  test('blocks paused non-backtest entries before sizing or routing', async () => {
    const executor = makeExecutor();

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 75 },
      {},
      425,
      {},
      [],
      null,
      {},
      'TSLA'
    );

    expect(result).toBeNull();
    expect(mockStateManager.getAvailableCapital).not.toHaveBeenCalled();
    expect(executor.ctx.orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('trading paused (manual pause)'));
  });

  test('does not apply runtime pause gate to backtest entries', async () => {
    const executor = makeExecutor(
      { enableBacktestMode: true, executionMode: 'backtest' },
      { backtestMode: true, paperTrading: false }
    );
    mockStateManager.getAvailableCapital.mockReturnValue(0);

    await executor.executeTrade(
      { action: 'BUY', confidence: 75 },
      {},
      425,
      {},
      [],
      null,
      {},
      'TSLA'
    );

    expect(mockStateManager.getAvailableCapital).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('trading paused'));
  });

  test('rejects backtest execution-mode spoofing outside runtime backtest mode', async () => {
    const executor = makeExecutor({ enableBacktestMode: true, executionMode: 'paper' });

    await expect(executor.executeTrade(
      { action: 'BUY', confidence: 75 },
      {},
      425,
      {},
      [],
      null,
      {},
      'TSLA'
    )).rejects.toThrow('[ENTRY-MODE]');

    expect(mockStateManager.getAvailableCapital).not.toHaveBeenCalled();
    expect(executor.ctx.orderRouter.sendOrder).not.toHaveBeenCalled();
  });

  test('rejects unsupported action names before sizing or routing', async () => {
    const executor = makeExecutor();

    await expect(executor.executeTrade(
      { action: 'BUY_LIMIT', confidence: 75 },
      {},
      425,
      {},
      [],
      null,
      {},
      'TSLA'
    )).rejects.toThrow('[ENTRY-ACTION]');

    expect(mockStateManager.getAvailableCapital).not.toHaveBeenCalled();
    expect(executor.ctx.orderRouter.sendOrder).not.toHaveBeenCalled();
  });
});
