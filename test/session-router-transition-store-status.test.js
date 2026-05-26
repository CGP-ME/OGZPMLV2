'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SessionRouter = require('../core/SessionRouter');

describe('SessionRouter TransitionStore status projection', () => {
  let tempDir;
  let consoleLogSpy;

  function makeRouter(options = {}) {
    return new SessionRouter({
      enabled: false,
      clock: () => Date.parse('2026-05-26T14:30:00.000Z'),
      transitionStoreOptions: { dir: tempDir },
      ...options
    });
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-router-store-status-'));
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('disabled router exposes idle transition store status when files are missing', () => {
    const router = makeRouter();

    const status = router.getStatus();

    expect(status.enabled).toBe(false);
    expect(status.transitionStore).toEqual(expect.objectContaining({
      state: 'IDLE',
      recoveryRequired: false,
      transitionId: null,
      epoch: 0,
      freezeNewEntries: false
    }));
  });

  test('corrupt transition state projects recovery-required status', () => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'transition-state.json'), '{ broken json', 'utf8');
    const router = makeRouter();

    const status = router.getStatus();

    expect(status.transitionStore).toEqual(expect.objectContaining({
      state: 'RECOVERY_REQUIRED',
      recoveryRequired: true,
      freezeNewEntries: true
    }));
    expect(status.transitionStore.safeModeReason).toMatch(/corrupt transition-state\.json/);
  });

  test('transition store read failure projects recovery-required status instead of throwing', () => {
    const router = makeRouter({
      transitionStore: {
        readStatus: jest.fn(() => {
          throw new Error('read failed');
        })
      }
    });

    const status = router.getStatus();

    expect(status.transitionStore).toEqual(expect.objectContaining({
      state: 'RECOVERY_REQUIRED',
      recoveryRequired: true,
      freezeNewEntries: true,
      safeModeReason: 'TransitionStore status read failed: read failed'
    }));
  });
});
