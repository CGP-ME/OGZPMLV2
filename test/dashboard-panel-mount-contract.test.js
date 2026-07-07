const fs = require('fs');
const path = require('path');

function readPanel(file) {
  return fs.readFileSync(path.join(__dirname, '..', 'public/js/panels', file), 'utf8');
}

describe('dashboard panel mount contracts', () => {
  test('RiskGauge replaces the existing v2 shell node instead of treating it as mounted', () => {
    const source = readPanel('risk-gauge.js');
    const mountBody = source.match(/function mount\(\) \{[\s\S]*?\n    \}/)[0];

    expect(mountBody).toContain('let root = document.getElementById(ROOT_ID);');
    expect(mountBody).toContain("if (state.mounted && root && root.querySelector('.rg-ring-wrap')) return true;");
    expect(mountBody).toContain('state.mounted = false;');
    expect(mountBody).toContain('root.innerHTML = `');
    expect(mountBody).not.toContain('if (document.getElementById(ROOT_ID)) {\n            state.mounted = true;\n            return true;\n        }');
  });

  test('RiskGauge no-Intl session fallback follows Eastern DST boundaries', () => {
    const source = readPanel('risk-gauge.js');

    expect(source).toContain('function easternOffsetHours(ms)');
    expect(source).toContain('const dstStart = nthSundayUtc(year, 2, 2, 7);');
    expect(source).toContain('const dstEnd = nthSundayUtc(year, 10, 1, 6);');
    expect(source).toContain('return (ms >= dstStart && ms < dstEnd) ? 4 : 5;');
    expect(source).not.toContain('Date.now() - 5 * 3600 * 1000');
  });

  test('TradeLog exposes an idempotent init that clears the placeholder empty shell', () => {
    const source = readPanel('trade-log.js');

    expect(source).toContain('init: function()');
    expect(source).toContain("document.getElementById('tradeLog')");
    expect(source).toContain('trade-log-empty');
    expect(source).toContain('if (!session.timerId)');
    expect(source).toContain('TradeLog.init();');
  });

  test('SystemHealth omits unknown crash, error, and commit placeholders', () => {
    const source = readPanel('system-health.js');
    const css = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'css', 'panels', 'system-health.css'),
      'utf8'
    );

    expect(source).not.toContain("crashLabel.textContent = 'LAST CRASH:'");
    expect(source).not.toContain("formatCrashTime(crashTime)");
    expect(source).not.toContain("errValue.textContent = '?'");
    expect(source).not.toContain("commitValue.textContent = commit || '?'");
    expect(source).toContain('if (state.haveErrorEmitter || errCount > 0)');
    expect(source).toContain('if (commit) {');
    expect(css).not.toContain('LAST CRASH TIME');
    expect(css).not.toContain('.sh-crash-time');
  });

  test('SystemHealth derives broker posture from runtime scope, not chart selector', () => {
    const source = readPanel('system-health.js');

    expect(source).toContain('runtimeScope: null');
    expect(source).toContain('function runtimeScopeFromFrame(frame)');
    expect(source).toContain('function brokerFromRuntimeScope(scope)');
    expect(source).toContain("routerLabel.textContent = 'RUNTIME:';");
    expect(source).toContain("renderBroker(activeBroker, 'BROKER:');");
    expect(source).toContain('const broker = brokerFromRuntimeScope(state.runtimeScope) || symbolToBroker(state.currentSymbol);');
    expect(source).toContain('state.runtimeScope = runtimeScope;');
    expect(source).not.toContain("routerLabel.textContent = 'SESSIONROUTER:';");
    expect(source).not.toContain("renderBroker('kraken', 'KRAKEN:');");
    expect(source).not.toContain("renderBroker('alpaca', 'ALPACA:');");
    expect(source).not.toContain("document.getElementById('cp-assetSelector')");
  });
});
