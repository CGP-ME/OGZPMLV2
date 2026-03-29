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
    this.operators = new Set(['+', '-', '*', '/', '%', '=', ':=', '>', '<', '>=', '<=', '==', '!=']);
    this.punctuations = new Set(['(', ')', '[', ']', '{', '}', ',', ';', ':']);
  }

  isWhitespace(ch) {
    return /\s/.test(ch);
  }

  isDigit(ch) {
    return /[0-9]/.test(ch);
  }

  isAlpha(ch) {
    return /[a-zA-Z_]/.test(ch);
  }

  peek(offset = 0) {
    return this.source[this.pos + offset];
  }

  advance(n = 1) {
    this.pos += n;
  }

  addToken(type, value) {
    this.tokens.push({ type, value });
  }

  lex() {
    while (this.pos < this.source.length) {
      const ch = this.peek();

      // Whitespace
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
        while (!(this.peek() === '*' && this.peek(1) === '/') && this.pos < this.source.length) this.advance();
        this.advance(2);
        continue;
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

      // Identifiers / keywords
      if (this.isAlpha(ch)) {
        let id = '';
        while (this.isAlpha(this.peek()) || this.isDigit(this.peek())) {
          id += this.peek();
          this.advance();
        }
        const type = this.keywords.has(id) ? 'keyword' : 'identifier';
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
