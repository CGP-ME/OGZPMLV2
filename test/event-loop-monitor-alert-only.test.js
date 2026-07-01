'use strict';

const pauseTrading = jest.fn();
const mockGetInstance = jest.fn(() => ({ pauseTrading }));

jest.mock('../core/StateManager', () => ({
  getInstance: mockGetInstance,
}));

describe('EventLoopMonitor critical lag policy', () => {
  let originalDashboardWs;
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    jest.resetModules();
    pauseTrading.mockClear();
    mockGetInstance.mockClear();
    originalDashboardWs = global.dashboardWs;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.dashboardWs = originalDashboardWs;
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('critical lag alerts only and does not pause trading', async () => {
    const send = jest.fn();
    global.dashboardWs = { send };

    const { EventLoopMonitor } = require('../core/EventLoopMonitor');
    const stateManager = require('../core/StateManager');
    const onCritical = jest.fn();
    const monitor = new EventLoopMonitor({ onCritical });

    await monitor.handleCriticalLag(777);

    expect(stateManager.getInstance).not.toHaveBeenCalled();
    expect(pauseTrading).not.toHaveBeenCalled();
    expect(onCritical).toHaveBeenCalledWith(777, expect.objectContaining({
      criticalCount: 1,
    }));
    expect(send).toHaveBeenCalledWith(expect.stringContaining('"action":"ALERT_ONLY"'));
    expect(send).not.toHaveBeenCalledWith(expect.stringContaining('TRADING_PAUSED'));
  });
});
