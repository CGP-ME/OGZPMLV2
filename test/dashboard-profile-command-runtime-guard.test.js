'use strict';

const WebSocketManager = require('../core/WebSocketManager');
const PerformanceDashboardIntegration = require('../core/PerformanceDashboardIntegration');
const stateManager = require('../core/StateManager').getInstance();

describe('dashboard profile command runtime guard', () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('rejects stale dashboard profile commands instead of mutating deleted profileManager', () => {
    const send = jest.fn();
    const setActiveProfile = jest.fn();
    const manager = new WebSocketManager({
      profileManager: { setActiveProfile },
      dashboardWs: { readyState: 1, send }
    });

    const result = manager.rejectDashboardProfileCommand('switch_profile', 'legacy-wide');

    expect(result).toBe(false);
    expect(setActiveProfile).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][0])).toEqual({
      type: 'command_rejected',
      command: 'switch_profile',
      profile: 'legacy-wide',
      reason: 'runtime_profile_switch_not_wired',
      message: 'Runtime profile switching is disabled until a flat-state profile owner safely applies and verifies all affected tunables.'
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Rejecting dashboard command switch_profile'));
  });

  test('rejects performance dashboard profile tracking and runtime switches', () => {
    expect(() => new PerformanceDashboardIntegration({ enableProfileTracking: true }))
      .toThrow(/Profile tracking is disabled: runtime_profile_switch_not_wired/);

    const integration = new PerformanceDashboardIntegration({ updateInterval: 60000 });

    try {
      expect(integration.getLiveMetrics().profiles).toEqual({
        enabled: false,
        reason: 'runtime_profile_switch_not_wired',
        activeProfile: null,
        availableProfiles: [],
        profileStats: null
      });

      expect(() => integration.switchProfile('legacy-wide'))
        .toThrow(/Runtime profile switch rejected for 'legacy-wide': runtime_profile_switch_not_wired/);
    } finally {
      integration.shutdown();
    }
  });

  test('dashboard pause and resume carry explicit operator authority metadata', () => {
    const send = jest.fn();
    const pauseSpy = jest.spyOn(stateManager, 'pauseTrading').mockResolvedValue({ success: true });
    const resumeSpy = jest.spyOn(stateManager, 'resumeTrading').mockResolvedValue({ success: true });
    const manager = new WebSocketManager({
      dashboardWs: { readyState: 1, send }
    });

    try {
      manager.pauseTradingFromDashboard(' operator pause ');
      manager.resumeTradingFromDashboard();

      expect(pauseSpy).toHaveBeenCalledWith('operator pause', {
        source: 'dashboard_manual',
        recoverable: false
      });
      expect(resumeSpy).toHaveBeenCalledWith({
        source: 'dashboard_manual'
      });
      expect(JSON.parse(send.mock.calls[0][0])).toEqual(expect.objectContaining({
        type: 'pause_confirmed',
        reason: 'operator pause',
        source: 'dashboard_manual'
      }));
      expect(JSON.parse(send.mock.calls[1][0])).toEqual(expect.objectContaining({
        type: 'resume_confirmed',
        source: 'dashboard_manual'
      }));
    } finally {
      pauseSpy.mockRestore();
      resumeSpy.mockRestore();
    }
  });
});
