// core/PineLexer.js
class PineLexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.tokens = [];
    this.keywords = new Set([
      'var', 'if', 'else', 'for', 'to', 'while', 'break', 'continue',
      'function', '=>', 'true', 'false', 'na', 'null',
      'strategy', 'input', 'time', 'dayofweek', 'session',
      'plot', 'plotshape', 'bgcolor', 'alertcondition',
      'array', 'math', 'ta', 'order', 'color', 'size', 'location',
      'shape', 'table', 'str', 'barstate',
    ]);
    this.operators = new Set(['+', '-', '*', '/', '%', '=', ':=', '=>', '>', '<', '>=', '<=', '==', '!=', '+=', '-=', '?']);
    this.punctuations = new Set(['(', ')', '[', ']', '{', '}', ',', ';', ':', '.']);
    // and/or/not are operators, not keywords - they need operator type for parser
    this.logicalOperators = new Set(['and', 'or', 'not']);
    // Indentation tracking
    this.indentStack = [0]; // Stack of indentation levels
    this.atLineStart = true; // Are we at the start of a line?
    // Inside an open ( or [ a newline is expression continuation, not block
    // structure - indent/dedent tokens are suppressed until it closes.
    this.bracketDepth = 0;
    // 1-based source line, stamped on every token so the parser can tell
    // same-line constructs (single-line function bodies) from next-line ones.
    this.line = 1;
  }

  isWhitespace(ch) {
    return ch !== undefined && /\s/.test(ch);
  }

  isDigit(ch) {
    return ch !== undefined && /[0-9]/.test(ch);
  }

  isAlpha(ch) {
    return ch !== undefined && /[a-zA-Z_]/.test(ch);
  }

  isHexDigit(ch) {
    return ch !== undefined && /[0-9a-fA-F]/.test(ch);
  }

  peek(offset = 0) {
    return this.source[this.pos + offset];
  }

  advance(n = 1) {
    this.pos += n;
  }

  addToken(type, value) {
    this.tokens.push({ type, value, line: this.line });
  }

  lex() {
    while (this.pos < this.source.length) {
      const ch = this.peek();

      // Handle line starts - measure indentation
      if (this.atLineStart) {
        let indent = 0;
        while (this.peek() === ' ' || this.peek() === '\t') {
          indent += this.peek() === '\t' ? 4 : 1; // Treat tab as 4 spaces
          this.advance();
        }
        // Skip empty lines and comment-only lines
        if (this.peek() === '\n' || (this.peek() === '/' && this.peek(1) === '/')) {
          this.atLineStart = false;
          continue;
        }
        // Continuation line inside an open bracket - no indent/dedent
        if (this.bracketDepth > 0) {
          this.atLineStart = false;
          continue;
        }
        // Check indentation level
        const currentIndent = this.indentStack[this.indentStack.length - 1];
        if (indent > currentIndent) {
          this.indentStack.push(indent);
          this.addToken('indent', indent);
        } else if (indent < currentIndent) {
          // Pop indentation levels and emit dedent tokens
          while (this.indentStack.length > 1 && this.indentStack[this.indentStack.length - 1] > indent) {
            this.indentStack.pop();
            this.addToken('dedent', indent);
          }
        }
        this.atLineStart = false;
        continue;
      }

      // Newline - next iteration will check indentation
      if (ch === '\n') {
        this.advance();
        this.line++;
        this.atLineStart = true;
        continue;
      }

      // Whitespace (non-newline)
      if (this.isWhitespace(ch)) {
        this.advance();
        continue;
      }

      // Comments (single line // and block /* */)
      if (ch === '/' && this.peek(1) === '/') {
        while (this.peek() !== '\n' && this.pos < this.source.length) this.advance();
        continue;
      }
      if (ch === '/' && this.peek(1) === '*') {
        this.advance(2);
        while (!(this.peek() === '*' && this.peek(1) === '/') && this.pos < this.source.length) {
          if (this.peek() === '\n') this.line++;
          this.advance();
        }
        this.advance(2);
        continue;
      }

      // Hex color literals - TradingView's valid forms are #RRGGBB / #RRGGBBAA.
      // We absorb ANY '#' followed by hex digits as an inert 'color' token, even
      // a malformed run (wrong digit count). That keeps a malformed color TYPED
      // as a color (a dead string that only flows into visual noops) instead of
      // falling through and letting the digits silently re-lex as a bogus number
      // or identifier that could corrupt a following token or reach arithmetic.
      // No throw, no refusal - the value simply can never lie as a number.
      if (ch === '#') {
        let hex = '';
        let i = 1;
        while (this.isHexDigit(this.peek(i))) { hex += this.peek(i); i++; }
        if (hex.length > 0) {
          this.addToken('color', '#' + hex);
          this.advance(1 + hex.length);
          continue;
        }
        // Bare '#' with no hex digits: no trailing digits to corrupt, so fall
        // through to the unknown-char skip below.
      }

      // Numbers (int & float)
      if (this.isDigit(ch) || (ch === '.' && this.isDigit(this.peek(1)))) {
        let num = '';
        let dotSeen = false;
        while (this.isDigit(this.peek()) || (!dotSeen && this.peek() === '.')) {
          if (this.peek() === '.') dotSeen = true;
          num += this.peek();
          this.advance();
        }
        this.addToken('number', parseFloat(num));
        continue;
      }

      // Strings (single or double quotes)
      if (ch === '"' || ch === "'") {
        const quote = ch;
        let str = '';
        this.advance();
        while (this.peek() !== quote && this.pos < this.source.length) {
          if (this.peek() === '\\') {
            this.advance();
            const esc = this.peek();
            const map = { n: '\n', r: '\r', t: '\t', '\\': '\\', '"': '"', "'": "'" };
            str += map[esc] || esc;
          } else {
            str += this.peek();
          }
          this.advance();
        }
        this.advance(); // closing quote
        this.addToken('string', str);
        continue;
      }

      // Identifiers / keywords / logical operators
      if (this.isAlpha(ch)) {
        let id = '';
        while (this.isAlpha(this.peek()) || this.isDigit(this.peek())) {
          id += this.peek();
          this.advance();
        }
        // and/or/not are operators for the parser
        let type;
        if (this.logicalOperators.has(id)) {
          type = 'operator';
        } else if (this.keywords.has(id)) {
          type = 'keyword';
        } else {
          type = 'identifier';
        }
        this.addToken(type, id);
        continue;
      }

      // Two-character operators (:=, >=, <=, ==, !=)
      const two = ch + this.peek(1);
      if (this.operators.has(two)) {
        this.addToken('operator', two);
        this.advance(2);
        continue;
      }

      // Single-character operators / punctuation
      if (this.operators.has(ch)) {
        this.addToken('operator', ch);
        this.advance();
        continue;
      }
      if (this.punctuations.has(ch)) {
        if (ch === '(' || ch === '[') this.bracketDepth++;
        if ((ch === ')' || ch === ']') && this.bracketDepth > 0) this.bracketDepth--;
        this.addToken('punct', ch);
        this.advance();
        continue;
      }

      // Unknown char - skip
      this.advance();
    }

    this.addToken('eof', null);
    return this.tokens;
  }
}

module.exports = PineLexer;
