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

    // function definition (arrow)
    if (tok.type === 'identifier' && this.peek(1).type === 'punct' && this.peek(1).value === '(') {
      // could be a call or a definition - we look ahead for => token
      const idx = this.tokens.findIndex((t, i) => i > this.pos && t.type === 'operator' && t.value === '=>');
      if (idx !== -1) return this.functionDefinition();
    }

    // expression statement (including strategy.* calls)
    return this.expressionStatement();
  }

  varDeclaration() {
    this.consume('keyword', 'var');
    const id = this.consume('identifier').value;
    // optional type (float, int, etc.) - we ignore it for execution
    if (this.peek().type === 'identifier' && ['float', 'int', 'bool', 'string'].includes(this.peek().value)) {
      this.consume();
    }
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
    this.consume('punct', '(');
    const test = this.expression();
    this.consume('punct', ')');
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
      const p = this.consume('identifier').value;
      params.push(p);
      if (this.peek().type === 'punct' && this.peek().value === ',') this.consume('punct', ',');
    }
    this.consume('punct', ')');
    this.consume('operator', '=>');
    const body = this.expression(); // arrow functions in SMS are single-expression
    return { type: 'FunctionDecl', name, params, body };
  }

  block() {
    const stmts = [];
    // In Pine a block is simply a series of statements (no braces)
    // we stop when we encounter a token that ends the block:
    //   - another top-level keyword (if, for, while, var, etc.)
    //   - eof
    while (true) {
      const tok = this.peek();
      if (tok.type === 'eof') break;
      if (tok.type === 'keyword' && ['if', 'for', 'while', 'var', 'else', 'break', 'continue'].includes(tok.value)) break;
      stmts.push(this.statement());
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
    const left = this.logicalOr();
    if (this.peek().type === 'operator' && this.peek().value === ':=') {
      this.consume('operator', ':=');
      const right = this.assignment();
      return { type: 'AssignmentExpression', operator: ':=', left, right };
    }
    return left;
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
    if (tok.type === 'operator' && ['+', '-', '!'].includes(tok.value)) {
      const op = this.consume('operator').value;
      const argument = this.unary();
      return { type: 'UnaryExpression', operator: op, argument };
    }
    return this.primary();
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
    if (tok.type === 'identifier' && ['true', 'false', 'na', 'null'].includes(tok.value)) {
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

    // identifier (variable, function call, series look-back)
    if (tok.type === 'identifier') {
      const id = this.consume('identifier').value;

      // look-back e.g. close[3]
      if (this.peek().type === 'punct' && this.peek().value === '[') {
        this.consume('punct', '[');
        const offset = this.expression(); // must evaluate to number
        this.consume('punct', ']');
        return { type: 'SeriesLookup', series: id, offset };
      }

      // function call
      if (this.peek().type === 'punct' && this.peek().value === '(') {
        this.consume('punct', '(');
        const args = [];
        while (this.peek().type !== 'punct' || this.peek().value !== ')') {
          args.push(this.expression());
          if (this.peek().type === 'punct' && this.peek().value === ',') this.consume('punct', ',');
        }
        this.consume('punct', ')');
        return { type: 'CallExpression', callee: id, arguments: args };
      }

      // simple identifier reference
      return { type: 'Identifier', name: id };
    }

    this.error('Unexpected token');
  }
}

module.exports = PineParser;
