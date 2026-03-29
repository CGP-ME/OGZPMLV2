// core/PineRuntime.js
const PineArray = require('./PineArray');
const PineTALib = require('./PineTALib');
const SessionTracker = require('../helpers/SessionTracker');
const PineStrategyBridge = require('./PineStrategyBridge');

class PineRuntime {
  constructor(source) {
    const Lexer = require('./PineLexer');
    const Parser = require('./PineParser');

    const lexer = new Lexer(source);
    const tokens = lexer.lex();
    const parser = new Parser(tokens);
    this.ast = parser.parse();

    // Persistent state (var declarations) - survives across candles
    this.state = {};

    // Keep a reference to the whole history (array of candle objects)
    this.history = [];

    // Session tracker (IVB, daily loss, etc.)
    this.session = new SessionTracker();

    // Strategy bridge - collects entry/exit requests
    this.bridge = new PineStrategyBridge();
  }

  // -----------------------------------------------------------------
  // Public API - call once per candle
  // -----------------------------------------------------------------
  evaluate(candle) {
    // push candle to history (the newest is at the end)
    this.history.push(candle);
    // keep only as many bars as the script may need (max look-back)
    const maxLookback = 500; // safe default - can be increased later
    if (this.history.length > maxLookback) this.history.shift();

    // Update session state
    this.session.update(candle);

    // run the whole program
    this._execBlock(this.ast.body);

    // after execution, ask the bridge for the signal
    return this.bridge.flushSignal();
  }

  // -----------------------------------------------------------------
  // Execution helpers
  // -----------------------------------------------------------------
  _execBlock(statements) {
    for (const stmt of statements) {
      this._execStatement(stmt);
    }
  }

  _execStatement(node) {
    switch (node.type) {
      case 'VarDecl':
        if (!(node.id in this.state)) {
          this.state[node.id] = node.init ? this._evalExpression(node.init) : null;
        }
        break;
      case 'ExpressionStatement':
        this._evalExpression(node.expression);
        break;
      case 'IfStatement':
        if (this._evalExpression(node.test)) {
          this._execBlock(node.consequent.body);
        } else if (node.alternate) {
          this._execBlock(node.alternate.body);
        }
        break;
      case 'ForStatement':
        {
          const start = Math.floor(this._evalExpression(node.start));
          const end = Math.floor(this._evalExpression(node.end));
          for (let i = start; i <= end; i++) {
            this.state[node.id] = i;
            this._execBlock(node.body.body);
          }
        }
        break;
      case 'WhileStatement':
        {
          // safeguard - max 1000 iterations to avoid infinite loops
          let iter = 0;
          while (this._evalExpression(node.test) && iter < 1000) {
            this._execBlock(node.body.body);
            iter++;
          }
        }
        break;
      case 'FunctionDecl':
        // store the function object (params + body) in state
        this.state[node.name] = {
          params: node.params,
          body: node.body,
        };
        break;
      case 'AssignmentExpression':
        {
          const value = this._evalExpression(node.right);
          // left side must be an Identifier (persistent var) or a SeriesLookup (illegal)
          if (node.left.type !== 'Identifier')
            throw new Error('Only identifiers can be assigned with :=');
          this.state[node.left.name] = value;
        }
        break;
      case 'break':
        throw { type: 'BreakSignal' };
      case 'continue':
        throw { type: 'ContinueSignal' };
      default:
        throw new Error(`Unsupported statement type ${node.type}`);
    }
  }

  // -----------------------------------------------------------------
  // Expression evaluator
  // -----------------------------------------------------------------
  _evalExpression(node) {
    switch (node.type) {
      case 'Literal':
        return node.value;
      case 'Identifier':
        // built-in objects (math, ta, array, strategy, etc.)
        if (node.name === 'math') return Math;
        if (node.name === 'ta') return PineTALib;
        if (node.name === 'array') return PineArray;
        if (node.name === 'strategy') return this.bridge;
        if (node.name === 'session') return this.session;
        // built-in series
        if (node.name === 'close') return this._getCurrentCandle()?.close;
        if (node.name === 'open') return this._getCurrentCandle()?.open;
        if (node.name === 'high') return this._getCurrentCandle()?.high;
        if (node.name === 'low') return this._getCurrentCandle()?.low;
        if (node.name === 'volume') return this._getCurrentCandle()?.volume;
        if (node.name === 'bar_index') return this.history.length - 1;
        // user variable
        return this.state[node.name];
      case 'SeriesLookup':
        return this._lookupSeries(node.series, this._evalExpression(node.offset));
      case 'CallExpression':
        return this._callFunction(node.callee, node.arguments);
      case 'UnaryExpression':
        {
          const arg = this._evalExpression(node.argument);
          switch (node.operator) {
            case '+':
              return +arg;
            case '-':
              return -arg;
            case '!':
              return !arg;
            default:
              throw new Error(`Unsupported unary operator ${node.operator}`);
          }
        }
      case 'BinaryExpression':
        {
          const left = this._evalExpression(node.left);
          const right = this._evalExpression(node.right);
          switch (node.operator) {
            case '+':
              return left + right;
            case '-':
              return left - right;
            case '*':
              return left * right;
            case '/':
              return left / right;
            case '%':
              return left % right;
            case '>':
              return left > right;
            case '<':
              return left < right;
            case '>=':
              return left >= right;
            case '<=':
              return left <= right;
            case '==':
              return left === right;
            case '!=':
              return left !== right;
            default:
              throw new Error(`Unsupported binary operator ${node.operator}`);
          }
        }
      case 'LogicalExpression':
        {
          const left = this._evalExpression(node.left);
          if (node.operator === 'and') return left && this._evalExpression(node.right);
          if (node.operator === 'or') return left || this._evalExpression(node.right);
          throw new Error(`Unsupported logical operator ${node.operator}`);
        }
      default:
        throw new Error(`Unsupported expression type ${node.type}`);
    }
  }

  // -----------------------------------------------------------------
  // Get current candle
  // -----------------------------------------------------------------
  _getCurrentCandle() {
    return this.history[this.history.length - 1];
  }

  // -----------------------------------------------------------------
  // Series look-back - e.g. close[3]
  // -----------------------------------------------------------------
  _lookupSeries(name, offset) {
    // offset must be a non-negative integer
    const idx = Math.max(0, this.history.length - 1 - Math.floor(offset));
    const candle = this.history[idx];
    if (!candle) return null;
    // Pine series names are lower-case properties of the candle object
    return candle[name];
  }

  // -----------------------------------------------------------------
  // Function / method call
  // -----------------------------------------------------------------
  _callFunction(callee, args) {
    // Resolve the callee - could be a built-in object or a user function
    const target = this._resolveCallee(callee);
    const evaluatedArgs = args.map((a) => this._evalExpression(a));

    // If target is a PineArray class static method (array.new_float etc.)
    if (typeof target === 'function') {
      return target.apply(null, evaluatedArgs);
    }

    // If target is a user-defined function stored in state
    if (target && target.params) {
      // create a temporary scope for function execution
      const previousState = { ...this.state };
      target.params.forEach((p, i) => {
        this.state[p] = evaluatedArgs[i];
      });
      const result = this._evalExpression(target.body);
      // restore previous state (functions have no side-effects in SMS)
      this.state = previousState;
      return result;
    }

    // Fallback - try to call as method on built-in objects
    // e.g. ta.sma(high, length)
    const parts = callee.split('.');
    if (parts.length === 2) {
      const objName = parts[0];
      const method = parts[1];
      const obj = this._resolveCallee(objName);
      if (obj && typeof obj[method] === 'function') {
        return obj[method](...evaluatedArgs);
      }
    }

    throw new Error(`Unable to resolve callee ${callee}`);
  }

  _resolveCallee(name) {
    // built-ins
    if (name === 'math') return Math;
    if (name === 'ta') return PineTALib;
    if (name === 'array') return PineArray;
    if (name === 'strategy') return this.bridge;
    if (name === 'session') return this.session;

    // user variable / function
    return this.state[name];
  }
}

module.exports = PineRuntime;
