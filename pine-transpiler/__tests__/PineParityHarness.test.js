const fs = require('fs');
const path = require('path');
const {
  compareSignalLists,
  formatDivergentBars,
  runParityFixture,
  sha256File,
} = require('../core/PineParityHarness');

const repoRoot = path.resolve(__dirname, '..', '..');
const tmpDir = path.join(__dirname, '.tmp-pine-parity');

function writeJson(filePath, body) {
  fs.writeFileSync(filePath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

function writeFixture({ expectedSignals, expectedCandleFileSha256, expectedPineSourceSha256 }) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const pinePath = path.join(tmpDir, 'fixture.pine');
  const candlePath = path.join(tmpDir, 'candles.json');
  const fixturePath = path.join(tmpDir, 'fixture.json');

  fs.writeFileSync(
    pinePath,
    [
      '//@version=5',
      'strategy("Parity fixture")',
      'if close > open',
      '    strategy.entry("L", strategy.long)',
      'if close < open',
      '    strategy.entry("S", strategy.short)',
      '',
    ].join('\n'),
    'utf8'
  );

  writeJson(candlePath, [
    { t: 1000, o: 1, h: 2, l: 1, c: 2, v: 10 },
    { t: 2000, o: 2, h: 2, l: 1, c: 1, v: 11 },
    { t: 3000, o: 3, h: 3, l: 3, c: 3, v: 12 },
  ]);

  writeJson(fixturePath, {
    name: 'synthetic parity fixture',
    pathsRelativeTo: 'fixture',
    pineSourcePath: 'fixture.pine',
    candleFilePath: 'candles.json',
    expectedPineSourceSha256: expectedPineSourceSha256 ?? sha256File(pinePath),
    expectedCandleFileSha256: expectedCandleFileSha256 ?? sha256File(candlePath),
    expectedSignals,
  });

  return fixturePath;
}

describe('PineParityHarness', () => {
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('passes an exact bar-for-bar signal list', () => {
    const fixturePath = writeFixture({
      expectedSignals: [
        { barIndex: 0, timestamp: 1000, direction: 'long' },
        { barIndex: 1, timestamp: 2000, direction: 'short' },
      ],
    });

    const result = runParityFixture(fixturePath);

    expect(result.status).toBe('passed');
    expect(result.comparison.match).toBe(true);
    expect(result.comparison.actualCount).toBe(2);
    expect(result.comparison.countDelta).toBe(0);
  });

  test('passes a TradingView CSV candle and trade-list fixture', () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    const pinePath = path.join(tmpDir, 'fixture.pine');
    const candlePath = path.join(tmpDir, 'tv-candles.csv');
    const tradePath = path.join(tmpDir, 'tv-trades.csv');
    const fixturePath = path.join(tmpDir, 'fixture.json');

    fs.writeFileSync(
      pinePath,
      [
        '//@version=5',
        'strategy("TV CSV parity fixture")',
        'if close > open',
        '    strategy.entry("L", strategy.long)',
        'if close < open',
        '    strategy.entry("S", strategy.short)',
        '',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      candlePath,
      [
        'time,open,high,low,close,volume',
        '2026-01-02T14:30:00Z,1,2,1,2,10',
        '2026-01-02T14:45:00Z,2,2,1,1,11',
        '',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      tradePath,
      [
        'bar_index,time,direction',
        '0,2026-01-02T14:30:00Z,long',
        '1,2026-01-02T14:45:00Z,short',
        '',
      ].join('\n'),
      'utf8'
    );

    writeJson(fixturePath, {
      name: 'synthetic TradingView CSV parity fixture',
      pathsRelativeTo: 'fixture',
      pineSourcePath: 'fixture.pine',
      expectedPineSourceSha256: sha256File(pinePath),
      candleFilePath: 'tv-candles.csv',
      candleFileFormat: 'tradingview_csv',
      expectedCandleFileSha256: sha256File(candlePath),
      expectedSignalListPath: 'tv-trades.csv',
      expectedSignalListFormat: 'tradingview_trade_csv',
      expectedSignalListSha256: sha256File(tradePath),
      expectedSignals: null,
    });

    const result = runParityFixture(fixturePath);

    expect(result.status).toBe('passed');
    expect(result.comparison.actualCount).toBe(2);
    expect(result.comparison.countDelta).toBe(0);
  });

  test('fails closed on candle SHA mismatch', () => {
    const fixturePath = writeFixture({
      expectedCandleFileSha256: '0'.repeat(64),
      expectedSignals: [],
    });

    const result = runParityFixture(fixturePath);

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('sha256_mismatch');
    expect(result.hashFailures[0].actual).toMatch(/^[a-f0-9]{64}$/);
  });

  test('names divergent bars instead of only reporting count delta', () => {
    const comparison = compareSignalLists(
      [
        { barIndex: 10, timestamp: 10000, direction: 'long' },
        { barIndex: 12, timestamp: 12000, direction: 'short' },
      ],
      [
        { barIndex: 10, timestamp: 10000, direction: 'buy' },
        { barIndex: 13, timestamp: 13000, direction: 'sell' },
      ]
    );

    expect(comparison.match).toBe(false);
    expect(comparison.countDelta).toBe(0);
    expect(formatDivergentBars(comparison)).toEqual([
      { barIndex: 12, timestamp: 12000, expected: 'sell', actual: 'none' },
      { barIndex: 13, timestamp: 13000, expected: 'none', actual: 'sell' },
    ]);
  });

  test('blocks SMS-v4 fixture until the TradingView candle and trade exports are present', () => {
    const fixturePath = path.join(
      repoRoot,
      'pine-transpiler',
      'fixtures',
      'parity',
      'sms-v4.fixture.json'
    );

    const result = runParityFixture(fixturePath);

    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('missing_fixture_exports');
    expect(result.missingFixtureFiles).toEqual([
      path.join(repoRoot, 'pine-transpiler', 'fixtures', 'parity', 'tradingview', 'sms-v4-candles.csv'),
      path.join(repoRoot, 'pine-transpiler', 'fixtures', 'parity', 'tradingview', 'sms-v4-trades.csv'),
    ]);
  });
});
