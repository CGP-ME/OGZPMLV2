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
    expect(html).toContain('<section class="dash-news-band"');
    expect(html).toContain('<section class="dash-strategy-band"');
    expect(html).not.toContain('<section class="dash-intel-band"');
    expect(html).toContain('.dash-news-band #newsTicker');
    expect(html).toContain('.dash-strategy-band #confidenceHeatbar');
    expect(html).not.toContain('.dash-strategy-band #strategyLeaderboard');
    expect(html).toMatch(/<section class="dash-strategy-band"[\s\S]*<div id="confidenceHeatbar"><\/div>[\s\S]*<\/section>/);
    expect(html).not.toMatch(/<aside class="dash-left-rail">[\s\S]*<div id="confidenceHeatbar"><\/div>[\s\S]*<\/aside>/);
    expect(html).toMatch(/<aside class="dash-right-rail">[\s\S]*<div id="strategyLeaderboard"><\/div>[\s\S]*<\/aside>/);
    expect(html).toContain('<div id="strategyLeaderboard"></div>');
    expect(html).toContain('aside.dash-right-rail #edgeAnalyticsPanel');
    expect(html).toContain('order: 2;');
    expect(html).toContain('flex: 1 1 320px;');
    expect(html).toContain('aside.dash-right-rail #riskGauge { order: 3; }');
    expect(html).toContain('aside.dash-right-rail #strategyLeaderboard { order: 7; }');
    expect(html).not.toContain('#edgeAnalyticsPanel,\n        #traiBrain {\n            flex: 0 0 180px;');
    expect(html).toContain('max-height: 180px;');
    expect(html).not.toContain('flex: 0 1 auto;');
    expect(traiBrainCss).toContain('min-height: 160px;');
    expect(traiBrainCss).not.toContain('min-height: 100%;');
  });

  test('mobile shell overrides injected desktop floors instead of widening the viewport', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'unified-dashboard-v2.html'),
      'utf8'
    );

    expect(html).toContain('Mobile operator shell hardening.');
    expect(html).toMatch(/@media \(max-width: 768px\) \{[\s\S]*header#dashHeader \{[\s\S]*max-width: 100vw;/);
    expect(html).toMatch(/@media \(max-width: 768px\) \{[\s\S]*\.hs-status-cluster \{[\s\S]*flex-wrap: wrap !important;/);
    expect(html).toMatch(/@media \(max-width: 768px\) \{[\s\S]*\.ogz-layout-hint \{[\s\S]*display: none !important;/);
    expect(html).toMatch(/@media \(max-width: 768px\) \{[\s\S]*#chartPanel \{[\s\S]*min-height: 520px !important;/);
    expect(html).toMatch(/@media \(max-width: 768px\) \{[\s\S]*#chartPanel \.cp-container,[\s\S]*#chartPanel \.cp-tv-chart-container \{[\s\S]*min-height: 340px !important;/);
    expect(html).toMatch(/@media \(max-width: 768px\) \{[\s\S]*\.dash-bottom-row \{[\s\S]*max-height: none !important;/);
  });
});
