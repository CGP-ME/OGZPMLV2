'use strict';

const fs = require('fs');
const path = require('path');

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
});
