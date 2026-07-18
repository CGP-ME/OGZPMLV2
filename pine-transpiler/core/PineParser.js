// core/PineParser.js
class PineParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
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
    const tok = this.peek();

    // var declaration (persistent)
    if (tok.type === 'keyword' && tok.value === 'var') {
      return this.varDeclaration();
    }

    // Tuple destructuring declaration: [a, b] = expr
    if (tok.type === 'punct' && tok.value === '[') {
      return this.tupleAssignment();
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
      // could be a call or a definition - we look ahead for => token
      const idx = this.tokens.findIndex((t, i) => i > this.pos && t.type === 'operator' && t.value === '=>');
      if (idx !== -1) return this.functionDefinition();
    }

    // Regular variable declaration: identifier = expression or type identifier = expression
    // (non-persistent, recalculated each candle)
    const typeKeywords = ['float', 'int', 'bool', 'string', 'color', 'line', 'label', 'box', 'table'];
    if ((tok.type === 'identifier' || tok.type === 'keyword') &&
        this.peek(1).type === 'operator' && this.peek(1).value === '=') {
      return this.regularVarDeclaration();
    }
    // Type-annotated declaration: float x = expr or float[] x = expr
    if (tok.type === 'identifier' && typeKeywords.includes(tok.value)) {
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
    return { type: 'RegularVarDecl', id, init };
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
      alternate = this.block();
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
      if (typeKeywords.includes(this.peek().value)) {
        this.consume(); // skip type
      }
      const p = this.consume('identifier').value;
      params.push(p);
      if (this.peek().type === 'punct' && this.peek().value === ',') this.consume('punct', ',');
    }
    this.consume('punct', ')');
    this.consume('operator', '=>');

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

      // For non-indented functions, use heuristics:
      if (!hasIndent) {
        // Stop if we hit a new function definition (identifier followed by () =>)
        if (this.peek().type === 'identifier') {
          let i = 1;
          if (this.peek(i).type === 'punct' && this.peek(i).value === '(') {
            let depth = 1;
            i++;
            while (depth > 0 && this.peek(i).type !== 'eof') {
              if (this.peek(i).value === '(') depth++;
              if (this.peek(i).value === ')') depth--;
              i++;
            }
            if (this.peek(i).type === 'operator' && this.peek(i).value === '=>') {
              break;
            }
          }
        }

        // Stop if we hit control flow keywords at top level
        if (this.peek().type === 'keyword' &&
            ['if', 'for', 'while', 'var', 'strategy', 'plot', 'plotshape', 'bgcolor', 'alertcondition'].includes(this.peek().value)) {
          break;
        }
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
        if (node.type === 'CallExpression') {
          break;
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
    // Boolean/null literals (can be keyword or identifier depending on lexer)
    if ((tok.type === 'keyword' || tok.type === 'identifier') &&
        ['true', 'false', 'na', 'null'].includes(tok.value)) {
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
