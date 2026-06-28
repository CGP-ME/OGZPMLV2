'use strict';

const fs = require('fs');
const path = require('path');

describe('legacy chart startup contract', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public/js/chart.js'),
    'utf8'
  );

  test('legacy asset and timeframe sends require a connected socket and valid selected asset', () => {
    expect(source).toContain("function selectedLegacyAsset(selector)");
    expect(source).toContain("if (!selected || selected.toLowerCase() === 'none') return '';");
    expect(source).toContain("const optionExists = Array.prototype.some.call(selector.options, opt => cleanSelectorValue(opt.value) === selected);");
    expect(source).toContain("return optionExists ? selected : '';");
    expect(source).toContain("function socketReady(socket)");
    expect(source).toContain("if (typeof socket.isConnected === 'function' && !socket.isConnected()) return false;");
    expect(source).toContain("if (socketReady(socket) && asset) {");
    expect(source).not.toContain("asset: document.getElementById('assetSelector')?.value || 'TSLA'");
  });
});
