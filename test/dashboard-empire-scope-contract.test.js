const fs = require('fs');
const path = require('path');

describe('dashboard Empire scope contract', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public/js/run-frontend-empire-v2.js'),
    'utf8'
  );

  test('market-data frames are still symbol-required but do not mutate selected scope', () => {
    expect(source).toContain("const SCOPE_ACK_FRAMES = new Set([\n        'asset_switched'\n    ]);");
    expect(source).toContain("if (SCOPE_ACK_FRAMES.has(eventType)) {\n            syncScopeFromFrame(frame, 'frame:' + eventType);\n        }");
    expect(source).not.toContain("syncScopeFromFrame(frame, 'frame:' + eventType);\n        addFreshness(eventType, symbol);");
  });

  test('selected scope is bound to explicit dashboard selection inputs', () => {
    expect(source).toContain("document.getElementById('cp-assetSelector')");
    expect(source).toContain("selector.addEventListener('change', state.scopeInputHandler)");
    expect(source).toContain("OGZ.bus.on('watchlist:select', state.watchlistHandler)");
    expect(source).toContain("setSelectedScope(selector.value, null, 'chart-selector:init')");
  });
});
