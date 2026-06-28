const fs = require('fs');
const path = require('path');

describe('dashboard layout containment', () => {
  test('right rail panels stay bounded inside the dashboard viewport', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'unified-dashboard-v2.html'),
      'utf8'
    );
    const traiBrainCss = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'css', 'panels', 'trai-brain.css'),
      'utf8'
    );

    expect(html).toContain('aside.dash-right-rail');
    expect(html).toContain('height: max(560px, calc(100vh - var(--dashboard-top-chrome-height)));');
    expect(html).toContain('max-height: 100%;');
    expect(html).toContain('flex: 0 0 auto;');
    expect(html).toContain('aside.dash-right-rail #openPositions');
    expect(html).toContain('height: 180px !important;');
    expect(html).toContain('aside.dash-right-rail #riskGauge { order: 2; }');
    expect(html).toContain('#edgeAnalyticsPanel,\n        #traiBrain');
    expect(html).toContain('max-height: 180px;');
    expect(html).not.toContain('flex: 0 1 auto;');
    expect(traiBrainCss).toContain('min-height: 160px;');
    expect(traiBrainCss).not.toContain('min-height: 100%;');
  });
});
