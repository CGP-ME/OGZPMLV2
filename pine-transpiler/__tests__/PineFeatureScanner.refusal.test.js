const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const PineFeatureScanner = require('../core/PineFeatureScanner');

const repoRoot = path.resolve(__dirname, '..', '..');
const importCli = path.join(repoRoot, 'pine-transpiler', 'tools', 'pine-import.js');
const tmpDir = path.join(__dirname, '.tmp-pine-import-refusal');

describe('PineFeatureScanner refusal gate', () => {
  const refusalCases = [
    {
      feature: 'request.security() lookahead',
      source: 'mtf = request.security(syminfo.tickerid, "D", close, lookahead=barmerge.lookahead_on)',
    },
    {
      feature: 'calc_on_every_tick=true',
      source: 'strategy("Tick repaint", calc_on_every_tick=true)\nplot(close)',
    },
    {
      feature: 'varip',
      source: 'varip float intrabarHigh = na\nintrabarHigh := high',
    },
    {
      feature: 'array.from',
      source: 'levels = array.from(high, low, close)',
    },
    {
      feature: 'recursive functions',
      source: 'fib(n) =>\n    n <= 1 ? n : fib(n - 1) + fib(n - 2)\nvalue = fib(5)',
    },
    {
      feature: 'switch',
      source: 'signal = switch close > open\n    true => 1\n    false => -1',
    },
  ];

  test.each(refusalCases)('refuses $feature', ({ feature, source }) => {
    const scanner = new PineFeatureScanner();
    const result = scanner.scan(source);

    expect(result.refusalRequired).toBe(true);
    expect(result.refusalFeatures.map((entry) => entry.feature)).toContain(feature);
    expect(() => scanner.assertImportable(source)).toThrow(new RegExp(feature.replace(/[().]/g, '\\$&')));
  });

  test('does not refuse request.security without lookahead', () => {
    const result = new PineFeatureScanner().scan(
      'dailyClose = request.security(syminfo.tickerid, "D", close)'
    );

    expect(result.features.requestSecurity).toBe(true);
    expect(result.features.requestSecurityLookahead).toBe(false);
    expect(result.refusalRequired).toBe(false);
  });

  test('does not refuse SMS-v4 current source for arrays, loops, or calc_on_every_tick=false', () => {
    const smsModule = fs.readFileSync(
      path.join(repoRoot, 'pine-transpiler', 'modules', 'SmartMoneySweep-v4.js'),
      'utf8'
    );
    const sourceMatch = smsModule.match(/const SOURCE = `([\s\S]*?)`;/);

    expect(sourceMatch).not.toBeNull();
    const result = new PineFeatureScanner().scan(sourceMatch[1]);

    expect(result.features.arrays).toBe(true);
    expect(result.features.loops).toBe(true);
    expect(result.features.calcOnEveryTickTrue).toBe(false);
    expect(result.refusalRequired).toBe(false);
  });

  test('ignores refusal tokens inside comments and strings', () => {
    const result = new PineFeatureScanner().scan(`
      // varip request.security(s, "D", close, lookahead=barmerge.lookahead_on)
      label = "switch array.from calc_on_every_tick=true"
      plot(close)
    `);

    expect(result.refusalRequired).toBe(false);
  });

  test('detects tuple assignment without refusing after T-B1 support', () => {
    const result = new PineFeatureScanner().scan(
      '[macdLine, signalLine, histLine] = ta.macd(close, 3, 5, 3)'
    );

    expect(result.features.tupleAssignments).toBe(true);
    expect(result.refusalRequired).toBe(false);
  });
});

describe('pine-import refusal gate', () => {
  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(path.join(repoRoot, 'pine-transpiler', 'modules', 'refuse-lookahead.js'), { force: true });
  });

  test('exits non-zero and does not write a module for refused features', () => {
    const pinePath = path.join(tmpDir, 'refuse-lookahead.pine');
    fs.writeFileSync(
      pinePath,
      'mtf = request.security(syminfo.tickerid, "D", close, lookahead=barmerge.lookahead_on)\n',
      'utf8'
    );

    const result = spawnSync(process.execPath, [importCli, pinePath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Pine import refused');
    expect(result.stderr).toContain('request.security() lookahead');
    expect(fs.existsSync(path.join(repoRoot, 'pine-transpiler', 'modules', 'refuse-lookahead.js'))).toBe(false);
  });
});
