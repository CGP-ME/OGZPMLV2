// core/PineParser.js
class PineParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    // Old-Pine comma-separated declarations (a = 1, b = 2, ... on one
    // line) parse as plain RegularVarDecls; the trailing ones queue here
    // and statement() drains them in order - no new node type, so the
    // gate walk and runtime exec see ordinary declarations.
    this.pendingStatements = [];
  }

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------
  peek(offset = 0) {
    return this.tokens[this.pos + offset];
  }

  consume(type = null, value = null) {
    const tok = this.peek();
    if (type && tok.type !== type) this.error(`Expected token type ${type}`);
    if (value && tok.value !== value) this.error(`Expected token value ${value}`);
    this.pos++;
    return tok;
  }

  error(msg) {
    const tok = this.peek();
    throw new SyntaxError(`${msg} at token ${tok.type} (${tok.value})`);
  }

  // True when the identifier+paren at the current position closes with a ')'
  // whose very next token is '=>' - i.e. this statement IS the definition.
  isFunctionDefAhead() {
    let i = this.pos + 2; // past 'name' and '('
    let depth = 1;
    while (depth > 0) {
      const t = this.tokens[i];
      if (!t || t.type === 'eof') return false;
      if (t.type === 'punct' && t.value === '(') depth++;
      if (t.type === 'punct' && t.value === ')') depth--;
      i++;
    }
    const after = this.tokens[i];
    return !!after && after.type === 'operator' && after.value === '=>';
  }

  // -----------------------------------------------------------------
  // Entry point
  // -----------------------------------------------------------------
  parse() {
    const program = { type: 'Program', body: [] };
    while (this.peek().type !== 'eof') {
      program.body.push(this.statement());
    }
    return program;
  }

  // -----------------------------------------------------------------
  // Statements
  // -----------------------------------------------------------------
  statement() {
    if (this.pendingStatements.length) return this.pendingStatements.shift();
    const tok = this.peek();

    // var declaration (persistent)
    if (tok.type === 'keyword' && tok.value === 'var') {
      return this.varDeclaration();
    }

    // Tuple destructuring declaration [a, b] = expr - only when `=` follows
    // the closing bracket. A bare [a, b] is a tuple-literal EXPRESSION
    // (user-function bodies end with one to return multiple values).
    if (tok.type === 'punct' && tok.value === '[') {
      let look = 1;
      let depth = 1;
      while (depth > 0) {
        const t = this.peek(look);
        if (!t || t.type === 'eof') break;
        if (t.type === 'punct' && t.value === '[') depth += 1;
        if (t.type === 'punct' && t.value === ']') depth -= 1;
        look += 1;
      }
      const after = this.peek(look);
      if (after && after.type === 'operator' && after.value === '=') {
        return this.tupleAssignment();
      }
      return this.expressionStatement();
    }

    // if / else
    if (tok.type === 'keyword' && tok.value === 'if') {
      return this.ifStatement();
    }

    // for loop
    if (tok.type === 'keyword' && tok.value === 'for') {
      return this.forStatement();
    }

    // while loop
    if (tok.type === 'keyword' && tok.value === 'while') {
      return this.whileStatement();
    }

    // break / continue
    if (tok.type === 'keyword' && (tok.value === 'break' || tok.value === 'continue')) {
      this.consume('keyword');
      return { type: tok.value };
    }

    // function definition (arrow)
    if (tok.type === 'identifier' && this.peek(1).type === 'punct' && this.peek(1).value === '(') {
      // A definition only when '=>' directly follows THIS call's closing
      // paren: f(a, b) => body. Anything else (study(...), fill(...)) is a
      // plain call, even if another definition appears later in the file.
      if (this.isFunctionDefAhead()) return this.functionDefinition();
    }

    // Regular variable declaration: identifier = expression or type identifier = expression
    // (non-persistent, recalculated each candle)
    const typeKeywords = ['float', 'int', 'bool', 'string', 'color', 'line', 'label', 'box', 'table'];
    if ((tok.type === 'identifier' || tok.type === 'keyword') &&
        this.peek(1).type === 'operator' && this.peek(1).value === '=') {
      return this.regularVarDeclaration();
    }
    // v5 type-qualifier prefix: const/simple/series before a typed
    // declaration (const string g = '...', const color c = color.white).
    // Qualifier only when the full shape follows - the bare words stay
    // usable as ordinary identifiers. Runtime semantics are unchanged
    // (recalculated per candle); TV's reassignment ban on const is
    // compile-side strictness we do not enforce yet.
    if (
      tok.type === 'identifier' &&
      ['const', 'simple', 'series'].includes(tok.value) &&
      // type words lex as identifier OR keyword (color/table are lexer
      // keywords) - match on value, not token type
      typeKeywords.includes(this.peek(1).value) &&
      this.peek(2).type === 'identifier' &&
      this.peek(3).type === 'operator' &&
      this.peek(3).value === '='
    ) {
      this.consume(); // qualifier
      return this.regularVarDeclaration();
    }
    // Type-annotated declaration: float x = expr or float[] x = expr.
    // Type words lex as identifier OR keyword (color/table are lexer
    // keywords) - match on value.
    if ((tok.type === 'identifier' || tok.type === 'keyword') && typeKeywords.includes(tok.value)) {
      // Look ahead to find = after type and optional [] and identifier
      let lookAhead = 1;
      if (this.peek(lookAhead).type === 'punct' && this.peek(lookAhead).value === '[') {
        lookAhead += 2; // skip []
      }
      if (this.peek(lookAhead).type === 'identifier' &&
          this.peek(lookAhead + 1).type === 'operator' &&
          this.peek(lookAhead + 1).value === '=') {
        return this.regularVarDeclaration();
      }
    }

    // Compound assignment: identifier += expression or identifier -= expression
    if ((tok.type === 'identifier' || tok.type === 'keyword') &&
        this.peek(1).type === 'operator' && ['+=', '-='].includes(this.peek(1).value)) {
      return this.compoundAssignment();
    }

    // expression statement (including strategy.* calls)
    return this.expressionStatement();
  }

  // Tuple destructuring declaration: [a, b, c] = ta.macd(...)
  tupleAssignment() {
    const ids = [];
    this.consume('punct', '[');
    while (this.peek().type !== 'punct' || this.peek().value !== ']') {
      const tok = this.peek();
      if (tok.type !== 'identifier' && tok.type !== 'keyword') {
        this.error('Expected identifier in tuple assignment');
      }
      ids.push(this.consume().value);
      if (this.peek().type === 'punct' && this.peek().value === ',') {
        this.consume('punct', ',');
      }
    }
    this.consume('punct', ']');
    this.consume('operator', '=');
    const init = this.expression();
    return { type: 'TupleAssignment', ids, init };
  }

  // Regular (non-persistent) variable declaration: x = expr or type x = expr
  regularVarDeclaration() {
    const typeKeywords = ['float', 'int', 'bool', 'string', 'color', 'line', 'label', 'box', 'table'];
    let id;

    // Check if first token is a type annotation
    if (typeKeywords.includes(this.peek().value)) {
      this.consume(); // consume type
      // handle array type: float[]
      if (this.peek().type === 'punct' && this.peek().value === '[') {
        this.consume('punct', '[');
        this.consume('punct', ']');
      }
      id = this.consume('identifier').value;
    } else {
      id = this.consume().value; // identifier or keyword
    }

    this.consume('operator', '=');
    const init = this.expression();
    const decl = { type: 'RegularVarDecl', id, init };
    // Old-Pine multi-declaration: `a = expr, b = expr, ...`. A statement-
    // level comma followed by the `identifier =` shape continues the
    // declaration list (inside brackets commas are consumed by the call
    // parser and never reach here). Queue the trailing declarations.
    while (
      this.peek().type === 'punct' && this.peek().value === ',' &&
      (this.peek(1).type === 'identifier' || this.peek(1).type === 'keyword') &&
      this.peek(2).type === 'operator' && this.peek(2).value === '='
    ) {
      this.consume('punct', ',');
      const nextId = this.consume().value;
      this.consume('operator', '=');
      this.pendingStatements.push({
        type: 'RegularVarDecl',
        id: nextId,
        init: this.expression(),
      });
    }
    return decl;
  }

  // Compound assignment: x += expr or x -= expr
  compoundAssignment() {
    const id = this.consume().value;
    const op = this.consume('operator').value; // += or -=
    const right = this.expression();
    // Desugar to: x := x + expr or x := x - expr
    const binaryOp = op === '+=' ? '+' : '-';
    return {
      type: 'AssignmentExpression',
      operator: ':=',
      left: { type: 'Identifier', name: id },
      right: {
        type: 'BinaryExpression',
        operator: binaryOp,
        left: { type: 'Identifier', name: id },
        right
      }
    };
  }

  varDeclaration() {
    this.consume('keyword', 'var');
    // optional type annotation (float, int, bool, string, float[], etc.)
    // Note: some type names like 'table' are lexed as keywords
    const typeKeywords = ['float', 'int', 'bool', 'string', 'color', 'line', 'label', 'box', 'table'];
    if ((this.peek().type === 'identifier' || this.peek().type === 'keyword') &&
        typeKeywords.includes(this.peek().value)) {
      this.consume(); // consume type
      // handle array type: float[]
      if (this.peek().type === 'punct' && this.peek().value === '[') {
        this.consume('punct', '[');
        this.consume('punct', ']');
      }
    }
    // now get the actual variable name
    const id = this.consume('identifier').value;
    // optional initializer
    let init = null;
    if (this.peek().type === 'operator' && this.peek().value === '=') {
      this.consume('operator', '=');
      init = this.expression();
    }
    return { type: 'VarDecl', id, init };
  }

  ifStatement() {
    this.consume('keyword', 'if');
    // Pine v5: condition is just an expression, no mandatory parens
    // The expression parser handles parentheses naturally
    const test = this.expression();
    const consequent = this.block();
    let alternate = null;
    if (this.peek().type === 'keyword' && this.peek().value === 'else') {
      this.consume('keyword', 'else');
      if (this.peek().type === 'keyword' && this.peek().value === 'if') {
        // else-if chain: nest the if directly. Routing it through block()
        // left the alternate with no indent token, and the heuristic block
        // swallowed same-level statements AFTER the chain (qqe-mod's
        // trailing declaration + tuple return disappeared into the else).
        alternate = this.ifStatement();
      } else {
        alternate = this.block();
      }
    }
    return { type: 'IfStatement', test, consequent, alternate };
  }

  forStatement() {
    this.consume('keyword', 'for');
    const id = this.consume('identifier').value;
    this.consume('operator', '=');
    const start = this.expression();
    this.consume('keyword', 'to');
    const end = this.expression();
    const body = this.block();
    return { type: 'ForStatement', id, start, end, body };
  }

  whileStatement() {
    this.consume('keyword', 'while');
    const test = this.expression();
    const body = this.block();
    return { type: 'WhileStatement', test, body };
  }

  functionDefinition() {
    const name = this.consume('identifier').value;
    this.consume('punct', '(');
    const params = [];
    while (this.peek().type !== 'punct' || this.peek().value !== ')') {
      // Handle typed parameters: float x, int y
      const typeKeywords = ['float', 'int', 'bool', 'string', 'color', 'line', 'label', 'box', 'table'];
      // Type-qualifier prefix on params (f(simple int x)) - qualifier only
      // when a type keyword follows, so a param actually named const/simple/
      // series stays an ordinary identifier.
      if (
        ['const', 'simple', 'series'].includes(this.peek().value) &&
        typeKeywords.includes(this.peek(1).value)
      ) {
        this.consume(); // skip qualifier
      }
      if (typeKeywords.includes(this.peek().value)) {
        this.consume(); // skip type
      }
      const p = this.consume('identifier').value;
      params.push(p);
      if (this.peek().type === 'punct' && this.peek().value === ',') this.consume('punct', ',');
    }
    this.consume('punct', ')');
    const arrow = this.consume('operator', '=>');

    // Multi-line functions have statements followed by a return expression.
    // With indentation tracking, we consume indent and parse until dedent.
    const statements = [];

    // Check for indent token (multi-line function body)
    const hasIndent = this.peek().type === 'indent';
    if (hasIndent) {
      this.consume('indent');
    }

    // Keep parsing statements while we can
    while (this.peek().type !== 'eof') {
      // Stop at dedent token
      if (this.peek().type === 'dedent') {
        if (hasIndent) {
          this.consume('dedent');
        }
        break;
      }

      // A non-indented body is single-line: it ends at the line break.
      // Anything on a later line is top-level, not part of this function.
      if (!hasIndent && this.peek().line > arrow.line) {
        break;
      }

      statements.push(this.statement());
    }

    // The last statement is the return value (should be an expression)
    // Earlier statements are local variable declarations
    const body = statements.length > 0 ? statements[statements.length - 1] : null;
    const locals = statements.slice(0, -1);

    return { type: 'FunctionDecl', name, params, body, locals };
  }

  block() {
    const stmts = [];

    // Check for indent token - if present, this block has indented content
    const hasIndent = this.peek().type === 'indent';
    if (hasIndent) {
      this.consume('indent'); // Consume the indent token
    }

    // Parse statements until we see dedent, EOF, or block-ending pattern
    while (this.peek().type !== 'eof') {
      const tok = this.peek();

      // Stop at dedent token (block ends)
      if (tok.type === 'dedent') {
        if (hasIndent) {
          this.consume('dedent'); // Consume the dedent token
        }
        break;
      }

      // Stop at else keyword (for if-else chains)
      if (tok.type === 'keyword' && tok.value === 'else') {
        break;
      }

      // For blocks without explicit indent tokens, use heuristics:
      if (!hasIndent && stmts.length > 0) {
        // Stop at control flow keywords (new statement at same level)
        if (tok.type === 'keyword' &&
            ['if', 'for', 'while', 'var'].includes(tok.value)) {
          break;
        }

        // Stop at type-annotated declarations (float x = ...)
        const typeKeywords = ['float', 'int', 'bool', 'string', 'color', 'line', 'label', 'box', 'table'];
        if (tok.type === 'identifier' && typeKeywords.includes(tok.value)) {
          break;
        }

        // Stop at plot/alertcondition (top-level directives)
        if (tok.type === 'keyword' &&
            ['plot', 'plotshape', 'bgcolor', 'alertcondition'].includes(tok.value)) {
          break;
        }

        // Stop at strategy() header declaration
        if (tok.type === 'keyword' && tok.value === 'strategy') {
          if (this.peek(1).type === 'punct' && this.peek(1).value === '(') {
            break;
          }
        }
      }

      const stmt = this.statement();
      stmts.push(stmt);

      // Stop after break/continue - code after them belongs to outer scope
      if (stmt.type === 'break' || stmt.type === 'continue') {
        // Consume any dedent that matches our indent level
        if (hasIndent && this.peek().type === 'dedent') {
          this.consume('dedent');
        }
        break;
      }
    }

    return { type: 'BlockStatement', body: stmts };
  }

  expressionStatement() {
    const expr = this.expression();
    return { type: 'ExpressionStatement', expression: expr };
  }

  // -----------------------------------------------------------------
  // Expressions (recursive-descent, precedence climbing)
  // -----------------------------------------------------------------
  expression() {
    return this.assignment();
  }

  assignment() {
    const left = this.ternary();
    if (this.peek().type === 'operator' && this.peek().value === ':=') {
      this.consume('operator', ':=');
      const right = this.assignment();
      return { type: 'AssignmentExpression', operator: ':=', left, right };
    }
    return left;
  }

  // Ternary: condition ? trueExpr : falseExpr
  ternary() {
    let node = this.logicalOr();
    if (this.peek().type === 'operator' && this.peek().value === '?') {
      this.consume('operator', '?');
      const consequent = this.expression();
      this.consume('punct', ':');
      const alternate = this.ternary();
      node = { type: 'ConditionalExpression', test: node, consequent, alternate };
    }
    return node;
  }

  logicalOr() {
    let node = this.logicalAnd();
    while (this.peek().type === 'operator' && this.peek().value === 'or') {
      const op = this.consume('operator').value;
      const right = this.logicalAnd();
      node = { type: 'LogicalExpression', operator: op, left: node, right };
    }
    return node;
  }

  logicalAnd() {
    let node = this.equality();
    while (this.peek().type === 'operator' && this.peek().value === 'and') {
      const op = this.consume('operator').value;
      const right = this.equality();
      node = { type: 'LogicalExpression', operator: op, left: node, right };
    }
    return node;
  }

  equality() {
    let node = this.comparison();
    while (this.peek().type === 'operator' && ['==', '!='].includes(this.peek().value)) {
      const op = this.consume('operator').value;
      const right = this.comparison();
      node = { type: 'BinaryExpression', operator: op, left: node, right };
    }
    return node;
  }

  comparison() {
    let node = this.additive();
    while (this.peek().type === 'operator' && ['<', '>', '<=', '>='].includes(this.peek().value)) {
      const op = this.consume('operator').value;
      const right = this.additive();
      node = { type: 'BinaryExpression', operator: op, left: node, right };
    }
    return node;
  }

  additive() {
    let node = this.multiplicative();
    while (this.peek().type === 'operator' && ['+', '-'].includes(this.peek().value)) {
      const op = this.consume('operator').value;
      const right = this.multiplicative();
      node = { type: 'BinaryExpression', operator: op, left: node, right };
    }
    return node;
  }

  multiplicative() {
    let node = this.unary();
    while (this.peek().type === 'operator' && ['*', '/', '%'].includes(this.peek().value)) {
      const op = this.consume('operator').value;
      const right = this.unary();
      node = { type: 'BinaryExpression', operator: op, left: node, right };
    }
    return node;
  }

  unary() {
    const tok = this.peek();
    // Handle +, -, !, and 'not' as unary operators
    if (tok.type === 'operator' && ['+', '-', '!', 'not'].includes(tok.value)) {
      const op = this.consume('operator').value;
      const argument = this.unary();
      // Normalize 'not' to '!' for the runtime
      return { type: 'UnaryExpression', operator: op === 'not' ? '!' : op, argument };
    }
    return this.postfix();
  }

  // Handle postfix operations: member access (.), array access ([]), function calls (())
  postfix() {
    let node = this.primary();

    while (true) {
      const tok = this.peek();

      // Member access: obj.property
      if (tok.type === 'punct' && tok.value === '.') {
        this.consume('punct', '.');
        const next = this.peek();
        // Property can be identifier or keyword (strategy.long, ta.sma, etc.)
        if (next.type !== 'identifier' && next.type !== 'keyword') {
          this.error('Expected property name after dot');
        }
        const property = this.consume().value;
        node = { type: 'MemberExpression', object: node, property };
        continue;
      }

      // Array/series access: arr[index]
      if (tok.type === 'punct' && tok.value === '[') {
        // A bracket here is same-line indexing/history (x[1]) OR the next
        // line's tuple - an assignment ([a,b] = fn(...)) or a bare tuple
        // return ([a, b] ending a function body). Tokens carry no line
        // numbers, so scan the bracket: a following '=' or a top-level
        // comma inside (outside any parens) marks a statement boundary,
        // never an index on this expression.
        {
          let scan = this.pos + 1;
          let depth = 1;
          let parens = 0;
          let topLevelComma = false;
          while (scan < this.tokens.length && depth > 0) {
            const t = this.tokens[scan];
            if (t.type === 'punct' && t.value === '[') depth++;
            if (t.type === 'punct' && t.value === ']') depth--;
            if (t.type === 'punct' && t.value === '(') parens++;
            if (t.type === 'punct' && t.value === ')') parens--;
            if (depth === 1 && parens === 0 && t.type === 'punct' && t.value === ',') {
              topLevelComma = true;
            }
            scan++;
          }
          const after = this.tokens[scan];
          const isAssignment = after && after.type === 'operator' && after.value === '=';
          if (topLevelComma || isAssignment) {
            break; // statement boundary: the bracket starts a tuple
          }
        }
        if (node.type === 'CallExpression') {
          // Same-line history access on a call (fn()[1]) - refuse by name
          // instead of stranding the bracket at statement position, where
          // it would die as a misnamed tuple error. Real call-history
          // semantics are mission-two item one.
          const error = new Error(
            'Pine load refused: unsupported feature(s): history access on call expressions (e.g. fn()[1])'
          );
          error.code = 'PINE_LOAD_REFUSED';
          error.unsupported = ['history access on call expressions'];
          throw error;
        }
        this.consume('punct', '[');
        const index = this.expression();
        this.consume('punct', ']');
        // If node is an identifier, this is a series lookup (close[1])
        if (node.type === 'Identifier') {
          node = { type: 'SeriesLookup', series: node.name, offset: index };
        } else {
          node = { type: 'IndexExpression', object: node, index };
        }
        continue;
      }

      // Function call: func(args)
      if (tok.type === 'punct' && tok.value === '(') {
        this.consume('punct', '(');
        const args = this.parseCallArgs();
        this.consume('punct', ')');
        node = { type: 'CallExpression', callee: node, arguments: args };
        continue;
      }

      break;
    }

    return node;
  }

  // Parse function call arguments, handling named args (name=value)
  parseCallArgs() {
    const args = [];
    while (this.peek().type !== 'punct' || this.peek().value !== ')') {
      // Check for named argument: identifier followed by =
      if ((this.peek().type === 'identifier' || this.peek().type === 'keyword') &&
          this.peek(1).type === 'operator' && this.peek(1).value === '=') {
        const name = this.consume().value;
        this.consume('operator', '=');
        const value = this.expression();
        args.push({ type: 'NamedArgument', name, value });
      } else {
        args.push(this.expression());
      }
      if (this.peek().type === 'punct' && this.peek().value === ',') {
        this.consume('punct', ',');
      }
    }
    return args;
  }

  primary() {
    const tok = this.peek();

    // literals
    if (tok.type === 'number') {
      this.consume();
      return { type: 'Literal', value: tok.value };
    }
    if (tok.type === 'string') {
      this.consume();
      return { type: 'Literal', value: tok.value };
    }
    // Hex color literal (#RRGGBB / #RRGGBBAA). Colors are cosmetic - the runtime
    // resolves this to the inert PINE_NOOP sentinel (same as named colors like
    // color.red), so it flows only into visual noops and never carries a raw
    // string into computation. The isColor flag tells the runtime to do that
    // without string-sniffing (a real string literal '#foo' must stay a string).
    if (tok.type === 'color') {
      this.consume();
      return { type: 'Literal', value: tok.value, isColor: true };
    }
    // Boolean/null literals (can be keyword or identifier depending on lexer).
    // na followed by ( is the is-na FUNCTION call, not the empty-value
    // literal - it must fall through to the identifier/call path, else
    // na(x) parses as Literal(null) invoked as a callee and every na()
    // check in every script silently evaluates to null instead of a boolean.
    if ((tok.type === 'keyword' || tok.type === 'identifier') &&
        ['true', 'false', 'na', 'null'].includes(tok.value) &&
        !(tok.value === 'na' &&
          this.peek(1).type === 'punct' && this.peek(1).value === '(')) {
      this.consume();
      const map = { true: true, false: false, na: null, null: null };
      return { type: 'Literal', value: map[tok.value] };
    }

    // parenthesised expression
    if (tok.type === 'punct' && tok.value === '(') {
      this.consume('punct', '(');
      const expr = this.expression();
      this.consume('punct', ')');
      return expr;
    }

    // Tuple / array literal: [e1, e2, ...]. Two real-world producers:
    // tuple returns from user functions ([qqeTrendLine, smoothedRsi]) and
    // input options=[...] metadata lists.
    if (tok.type === 'punct' && tok.value === '[') {
      this.consume('punct', '[');
      const elements = [];
      while (this.peek().type !== 'punct' || this.peek().value !== ']') {
        elements.push(this.expression());
        if (this.peek().type === 'punct' && this.peek().value === ',') {
          this.consume('punct', ',');
        }
      }
      this.consume('punct', ']');
      return { type: 'TupleExpression', elements };
    }

    // identifier or keyword used as identifier (strategy, ta, array, etc.)
    // Keywords can be used as identifiers in expression positions for member access
    if (tok.type === 'identifier' || tok.type === 'keyword') {
      const id = this.consume().value;
      // postfix() handles ., [], () - just return the identifier
      return { type: 'Identifier', name: id };
    }

    this.error('Unexpected token');
  }
}

module.exports = PineParser;
