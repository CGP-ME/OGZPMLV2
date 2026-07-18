const PineLexer = require('../core/PineLexer');
const PineParser = require('../core/PineParser');
const PineRuntime = require('../core/PineRuntime');
const PineTALib = require('../core/PineTALib');

describe('Pine tuple assignment T-B1', () => {
  test('parser builds a TupleAssignment node for bracket destructuring', () => {
    const lexer = new PineLexer('[macdLine, signalLine, histLine] = ta.macd(close, 3, 5, 3)');
    const parser = new PineParser(lexer.lex());
    const ast = parser.parse();

    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'TupleAssignment',
      ids: ['macdLine', 'signalLine', 'histLine'],
    });
  });

  test('ta.macd returns TradingView-style macd, signal, histogram tuple', () => {
    const closes = [1, 2, 3, 4, 10, 10, 10, 10, 10, 10];

    // TV reference using EMA seeded by SMA(length):
    // fast EMA(3): seed at bar 2 = 2, then 3, 6.5, 8.25, 9.125, 9.5625, 9.78125, 9.890625.
    // slow EMA(5): seed at bar 4 = 4, then 6, 7.3333333333, 8.2222222222,
    //              8.8148148148, 9.2098765432.
    // MACD last = 9.890625 - 9.2098765432 = 0.6807484568.
    // Signal EMA(3) over MACD values:
    // seed = (2.5 + 2.25 + 1.7916666667) / 3 = 2.1805555556,
    // then 1.7604166667, 1.3634259259, 1.0220871914.
    // Hist last = 0.6807484568 - 1.0220871914 = -0.3413387346.
    const [macdLine, signalLine, histLine] = PineTALib.macd(closes, 3, 5, 3);

    expect(macdLine).toBeCloseTo(0.6807484568, 10);
    expect(signalLine).toBeCloseTo(1.0220871914, 10);
    expect(histLine).toBeCloseTo(-0.3413387346, 10);
  });

  test('runtime destructures ta.macd into state variables', () => {
    const runtime = new PineRuntime([
      '//@version=5',
      'strategy("Tuple smoke")',
      '[macdLine, signalLine, histLine] = ta.macd(close, 3, 5, 3)',
      '',
    ].join('\n'));

    [1, 2, 3, 4, 10, 10, 10, 10, 10, 10].forEach((close, index) => {
      runtime.evaluate({
        timestamp: index + 1,
        open: close,
        high: close,
        low: close,
        close,
        volume: 100,
      });
    });

    expect(runtime.state.macdLine).toBeCloseTo(0.6807484568, 10);
    expect(runtime.state.signalLine).toBeCloseTo(1.0220871914, 10);
    expect(runtime.state.histLine).toBeCloseTo(-0.3413387346, 10);
  });

  test('runtime supports ignored tuple slots with underscore', () => {
    const runtime = new PineRuntime([
      '//@version=5',
      'strategy("Tuple underscore")',
      '[macdLine, _, histLine] = ta.macd(close, 3, 5, 3)',
      '',
    ].join('\n'));

    [1, 2, 3, 4, 10, 10, 10, 10, 10, 10].forEach((close, index) => {
      runtime.evaluate({
        timestamp: index + 1,
        open: close,
        high: close,
        low: close,
        close,
        volume: 100,
      });
    });

    expect(runtime.state.macdLine).toBeCloseTo(0.6807484568, 10);
    expect(runtime.state._).toBeUndefined();
    expect(runtime.state.histLine).toBeCloseTo(-0.3413387346, 10);
  });
});
