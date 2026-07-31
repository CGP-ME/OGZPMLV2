const PineLexer = require('../core/PineLexer');
const PineParser = require('../core/PineParser');

// Call-vs-definition dispatch tripwires. The pre-fix dispatcher treated any
// statement-position `identifier(` as a function definition whenever ANY
// '=>' token existed later in the file - so study(...) / fill(...) in every
// script that also defined a user function misparsed, dying on the header
// string or a named argument. A definition is only the statement whose own
// closing paren is directly followed by '=>'.

function parse(source) {
  return new PineParser(new PineLexer(source).lex()).parse();
}

describe('PineParser call-vs-definition dispatch', () => {
  test('study(...) stays a call even when a definition exists later', () => {
    const ast = parse(
      'study("Hull Suite by InSilico", overlay=true)\n' +
      'HMA(_src, _length) => wma(2 * wma(_src, _length / 2) - wma(_src, _length), _length)\n'
    );
    expect(ast.body[0].type).toBe('ExpressionStatement');
    expect(ast.body[0].expression.type).toBe('CallExpression');
    expect(ast.body[0].expression.callee.name).toBe('study');
    expect(ast.body[1].type).toBe('FunctionDecl');
    expect(ast.body[1].name).toBe('HMA');
  });

  test('fill(...) with named args stays a call when a definition exists later', () => {
    const ast = parse(
      'fill(mPlot, upPlot, title="UpTrend Highligter", color=longFillColor)\n' +
      'window() => time\n'
    );
    expect(ast.body[0].type).toBe('ExpressionStatement');
    expect(ast.body[0].expression.callee.name).toBe('fill');
    expect(ast.body[1].type).toBe('FunctionDecl');
    expect(ast.body[1].params).toEqual([]);
  });

  test('single-line and multi-line definitions still parse', () => {
    const ast = parse(
      'f(x) => x + 1\n' +
      'g(a, b) =>\n' +
      '    c = a + b\n' +
      '    c * 2\n' +
      'y = g(1, 2)\n'
    );
    expect(ast.body[0].type).toBe('FunctionDecl');
    expect(ast.body[0].name).toBe('f');
    expect(ast.body[1].type).toBe('FunctionDecl');
    expect(ast.body[1].name).toBe('g');
    expect(ast.body[1].locals).toHaveLength(1);
    expect(ast.body[2].type).toBe('RegularVarDecl');
  });

  test('continuation lines inside an open call lex without indent tokens', () => {
    // Squeeze Momentum wraps linreg's arguments onto an indented next line;
    // the lexer must treat that as expression flow, not block structure.
    const ast = parse(
      'val = linreg(source - avg(x, y),\n' +
      '            lengthKC, 0)\n' +
      'next = val\n'
    );
    expect(ast.body[0].type).toBe('RegularVarDecl');
    expect(ast.body[0].id).toBe('val');
    expect(ast.body[1].type).toBe('RegularVarDecl');
  });

  test('call-history access still refuses by name', () => {
    let err = null;
    try {
      parse('a = foo()[1]\n');
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect(err.code).toBe('PINE_LOAD_REFUSED');
    expect(err.unsupported).toEqual(['history access on call expressions']);
  });
});
