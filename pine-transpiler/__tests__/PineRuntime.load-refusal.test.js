const PineRuntime = require('../core/PineRuntime');

// Known-answer probes for the load gate: every unsupported Pine feature
// refuses at construction, by name, before any candle is evaluated.
// The silent-null species this kills: unmapped members limping through
// as null/undefined at runtime.

describe('PineRuntime load gate refuses unsupported features by name', () => {
  const refusalCases = [
    {
      title: 'request.security (previously silent null at runtime)',
      source: 'dailyClose = request.security(syminfo.tickerid, "D", close)\nplot(dailyClose)',
      names: ["identifier 'request'"],
    },
    {
      title: 'unknown namespace (matrix)',
      source: 'm = matrix.new()\nplot(close)',
      names: ["identifier 'matrix'"],
    },
    {
      title: 'unknown ta method at load time, not candle time',
      source: 'st = ta.supertrend(3, 10)\nplot(close)',
      names: ["'ta.supertrend'"],
    },
    {
      title: 'unknown strategy member',
      source: 'n = strategy.opentrades\nplot(close)',
      names: ["'strategy.opentrades'"],
    },
    {
      title: 'undeclared bare identifier',
      source: 'q = somethingUndeclared + 1\nplot(q)',
      names: ["identifier 'somethingUndeclared'"],
    },
    {
      // math.pi resolved here until PINE_MATH shipped it; math.sum is a
      // real TV function this runtime genuinely does not define yet.
      title: 'math member the runtime cannot resolve',
      source: 'p = math.sum(close, 5)\nplot(p)',
      names: ["'math.sum'"],
    },
  ];

  test.each(refusalCases)('refuses $title', ({ source, names }) => {
    let thrown;
    try {
      new PineRuntime(source);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_LOAD_REFUSED');
    names.forEach((name) => {
      expect(thrown.unsupported).toContain(name);
      expect(thrown.message).toContain(name);
    });
  });

  test('collects every violation into one refusal, all named', () => {
    const source = [
      'a = request.security(syminfo.tickerid, "D", close)',
      'b = ta.supertrend(3, 10)',
      'c = strategy.opentrades',
      'plot(close)',
    ].join('\n');

    let thrown;
    try {
      new PineRuntime(source);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_LOAD_REFUSED');
    expect(thrown.unsupported).toEqual(
      expect.arrayContaining([
        "identifier 'request'",
        "'ta.supertrend'",
        "'strategy.opentrades'",
      ])
    );
  });

  test('supported surface constructs without refusal', () => {
    const source = [
      '//@version=5',
      'strategy("Supported surface")',
      'var float peak = na',
      'peak := math.max(nz(peak, high), high)',
      'fast = ta.sma(close, 2)',
      'slow = ta.sma(close, 3)',
      'prev = close[1]',
      'cell = color.new(color.red, 50)',
      'if fast > slow and close > open',
      '    strategy.entry("L", strategy.long)',
      'if fast < slow and close < open',
      '    strategy.entry("S", strategy.short)',
      'plot(fast)',
    ].join('\n');

    expect(() => new PineRuntime(source)).not.toThrow();
  });

  test('visualization namespaces are sanctioned no-ops, not refusals or crashes', () => {
    const source = [
      'strategy("Noop namespaces")',
      'c = color.new(color.red, 50)',
      's = str.tostring(close)',
      'plot(close, c)',
    ].join('\n');

    const runtime = new PineRuntime(source);
    const signal = runtime.evaluate({
      timestamp: 1,
      open: 1,
      high: 2,
      low: 1,
      close: 2,
      volume: 10,
    });
    expect(signal.direction).toBeNull();
  });
});

describe('runtime backstops fire as labeled bypass evidence', () => {
  test('an identifier that slips past the gate throws the bypass label', () => {
    const runtime = new PineRuntime('plot(close)');
    let thrown;
    try {
      runtime._evalExpression({ type: 'Identifier', name: 'ghostFeature' });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_RUNTIME_BYPASS');
    expect(thrown.message).toContain('load-gate bypass');
    expect(thrown.message).toContain("ghostFeature");
  });

  test('a member call on an empty value throws the bypass label', () => {
    const runtime = new PineRuntime('plot(close)');
    let thrown;
    try {
      runtime._callFunction(
        {
          type: 'MemberExpression',
          object: { type: 'Literal', value: null },
          property: 'anything',
        },
        []
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('PINE_RUNTIME_BYPASS');
    expect(thrown.message).toContain('load-gate bypass');
  });
});
