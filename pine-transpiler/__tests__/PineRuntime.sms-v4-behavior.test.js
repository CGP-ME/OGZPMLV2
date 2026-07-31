const fs = require('fs');
const path = require('path');
const PineRuntime = require('../core/PineRuntime');

const repoRoot = path.resolve(__dirname, '..', '..');

function loadSmsSource() {
  const smsModule = fs.readFileSync(
    path.join(repoRoot, 'pine-transpiler', 'modules', 'SmartMoneySweep-v4.js'),
    'utf8'
  );
  const match = smsModule.match(/const SOURCE = `([\s\S]*?)`;/);
  if (!match) throw new Error('SMS-v4 embedded SOURCE not found');
  return match[1];
}

describe('SMS-v4 flagship status under the refuse-loudly cut', () => {
  test('refuses by name: history access on call expressions (mission-two item one)', () => {
    // SMS-v4 lines 334-337 use isBearish()[1]-style call history. Before this
    // cut the parser died with a misnamed tuple error (since T-B1) and before
    // that silently mis-evaluated the exhaustion block as undefined. Now it
    // refuses loudly, naming the feature, until mission two builds the real
    // semantics.
    let thrown;
    try {
      new PineRuntime(loadSmsSource());
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_LOAD_REFUSED');
    expect(thrown.message).toContain('history access on call expressions');
  });
});

describe('behavior freeze on the corpus that parses', () => {
  // Deterministic mini-corpus exercising the supported surface end to end:
  // var/na/:=/nz/math.max/ta.sma/series lookback/if blocks/strategy entries.
  // The frozen signal sequence below is the known answer; any transpiler
  // change that alters it changed trading behavior, not error reporting.
  const CORPUS = [
    '//@version=5',
    'strategy("Freeze corpus")',
    'var float peak = na',
    'peak := math.max(nz(peak, high), high)',
    'fast = ta.sma(close, 2)',
    'slow = ta.sma(close, 3)',
    'if fast > slow and close > open',
    '    strategy.entry("L", strategy.long)',
    'if fast < slow and close < open',
    '    strategy.entry("S", strategy.short)',
    'plot(fast)',
  ].join('\n');

  const CANDLES = [
    { timestamp: 1, open: 10, high: 11, low: 9, close: 11, volume: 100 },
    { timestamp: 2, open: 11, high: 12, low: 10, close: 12, volume: 110 },
    { timestamp: 3, open: 12, high: 13, low: 11, close: 13, volume: 120 },
    { timestamp: 4, open: 13, high: 13, low: 10, close: 11, volume: 130 },
    { timestamp: 5, open: 11, high: 11, low: 8, close: 9, volume: 140 },
    { timestamp: 6, open: 9, high: 10, low: 7, close: 8, volume: 150 },
    { timestamp: 7, open: 8, high: 12, low: 8, close: 12, volume: 160 },
    { timestamp: 8, open: 12, high: 14, low: 11, close: 14, volume: 170 },
  ];

  test('reproduces the frozen signal sequence exactly', () => {
    const runtime = new PineRuntime(CORPUS);
    const sequence = CANDLES.map((candle) => {
      const signal = runtime.evaluate(candle);
      return signal && signal.direction ? signal.direction : '-';
    });

    console.log(`[behavior-freeze] sequence=${sequence.join(',')} peak=${runtime.state.peak}`);

    // Frozen known answer - measured at the cut that introduced the load
    // gate, asserted exact ever since.
    expect(sequence).toEqual(['-', 'buy', '-', '-', 'sell', '-', 'buy', '-']);
    expect(runtime.state.peak).toBe(14);
  });
});
