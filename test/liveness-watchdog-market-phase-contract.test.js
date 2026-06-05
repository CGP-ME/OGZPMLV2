'use strict';

const fs = require('fs');
const path = require('path');
const { getInstance: getMarketCalendar } = require('../foundation/MarketCalendar');

function readRunnerSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'run-empire-v2.js'), 'utf8');
}

describe('liveness watchdog market phase contract', () => {
  test('after-hours is an open market phase but not an RTH liveness phase', () => {
    const phase = getMarketCalendar().getMarketPhase(new Date('2026-06-05T21:17:28Z'));

    expect(phase).toEqual(expect.objectContaining({
      phase: 'ah',
      isOpen: true,
      isRTH: false,
    }));
  });

  test('regular trading hours reports explicit RTH liveness phase', () => {
    const phase = getMarketCalendar().getMarketPhase(new Date('2026-06-05T15:17:28Z'));

    expect(phase).toEqual(expect.objectContaining({
      phase: 'rth',
      isOpen: true,
      isRTH: true,
    }));
  });

  test('stock liveness expected-quiet check follows RTH, not broad open including after-hours', () => {
    const source = readRunnerSource();

    expect(source).toContain('if (phase.isRTH === true) return false;');
    expect(source).toContain("phase.phase !== 'rth' && phase.isRTH === true");
    expect(source).toContain("phase.phase === 'rth' && phase.isRTH !== true");
    expect(source).toContain('if (phase.isRTH !== false)');
    expect(source).toContain('market phase missing boolean isRTH; treating liveness as active');
    expect(source).not.toContain('if (phase.isRTH) return false;');
    expect(source).not.toContain('if (phase.isOpen) return false;');
  });
});
