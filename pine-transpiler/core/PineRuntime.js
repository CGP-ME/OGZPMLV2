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
        // Persistent variable - only initialize once
        if (!(node.id in this.state)) {
          this.state[node.id] = node.init ? this._evalExpression(node.init) : null;
        }
        break;
      case 'RegularVarDecl':
        // Non-persistent variable - recalculate every candle
        this.state[node.id] = node.init ? this._evalExpression(node.init) : null;
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
        // callee can be Identifier, MemberExpression, or legacy string
        return this._callFunction(node.callee, node.arguments);
      case 'IndexExpression':
        // array[index] access
        const arrObj = this._evalExpression(node.object);
        const arrIdx = this._evalExpression(node.index);
        if (arrObj === null || arrObj === undefined) return null;
        return arrObj[arrIdx];
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
      case 'ConditionalExpression':
        // Ternary: test ? consequent : alternate
        return this._evalExpression(node.test)
          ? this._evalExpression(node.consequent)
          : this._evalExpression(node.alternate);
      case 'MemberExpression':
        {
          const obj = this._evalExpression(node.object);
          if (obj === null || obj === undefined) return null;
          return obj[node.property];
        }
      case 'AssignmentExpression':
        {
          // Handle := assignment as expression (returns the assigned value)
          const value = this._evalExpression(node.right);
          if (node.left.type === 'Identifier') {
            this.state[node.left.name] = value;
          }
          return value;
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
    // Evaluate arguments, handling NamedArguments
    const evaluatedArgs = args.map((a) => {
      if (a.type === 'NamedArgument') {
        return { name: a.name, value: this._evalExpression(a.value) };
      }
      return this._evalExpression(a);
    });

    // If callee is a MemberExpression (ta.sma, strategy.entry, etc.)
    if (typeof callee === 'object' && callee.type === 'MemberExpression') {
      const obj = this._evalExpression(callee.object);
      const method = callee.property;

      if (obj === null || obj === undefined) {
        // Some Pine built-ins resolve to null - just return null for their method calls
        return null;
      }

      // Special handling for ta.* - pass series arrays instead of scalars
      // We need the raw args to detect series identifiers
      if (obj === PineTALib) {
        return this._callTAMethod(method, args);
      }

      // Special handling for strategy.* - pass evaluated args including named ones
      if (obj === this.bridge) {
        return this._callStrategyMethod(method, evaluatedArgs);
      }

      // Special handling for input.* - return the default value
      if (callee.object.name === 'input') {
        const positional = evaluatedArgs.filter(a => !a || !a.name);
        return positional[0]; // First arg is the default value
      }

      // For other objects (array, math, etc.)
      if (typeof obj[method] === 'function') {
        // Extract positional args (ignore named args for simple methods)
        const positional = evaluatedArgs.filter(a => !a || !a.name);
        return obj[method](...positional);
      }

      // For objects without the method, return null (handles things like plot.style_linebr)
      return obj[method] !== undefined ? obj[method] : null;
    }

    // If callee is an Identifier (simple function call or user function)
    if (typeof callee === 'object' && callee.type === 'Identifier') {
      // Special case: strategy(...) header is configuration, not a function call
      if (callee.name === 'strategy') {
        // Store config but don't try to call it
        const config = {};
        evaluatedArgs.forEach((a, i) => {
          if (a && a.name) config[a.name] = a.value;
          else if (i === 0) config.title = a;
        });
        this.bridge.config = config;
        return null;
      }

      // Special case: input.*() returns the default value
      if (callee.name === 'input') {
        const positional = evaluatedArgs.filter(a => !a || !a.name);
        return positional[0];
      }

      // Ignore visualization/alerting functions - they don't affect trading logic
      if (['plot', 'plotshape', 'plotchar', 'plotarrow', 'plotbar', 'plotcandle',
           'bgcolor', 'fill', 'hline', 'line', 'label', 'box', 'table',
           'alertcondition', 'alert'].includes(callee.name)) {
        return null;
      }

      const target = this._resolveCallee(callee.name);

      // If target is a function (built-in)
      if (typeof target === 'function') {
        const positional = evaluatedArgs.filter(a => !a || !a.name);
        return target.apply(null, positional);
      }

      // If target is a user-defined function stored in state
      if (target && target.params) {
        const previousState = { ...this.state };
        const positional = evaluatedArgs.filter(a => !a || !a.name);
        target.params.forEach((p, i) => {
          this.state[p] = positional[i];
        });
        // Execute local variable declarations first
        if (target.locals) {
          for (const local of target.locals) {
            this._execStatement(local);
          }
        }
        // The body is the return expression (wrapped in ExpressionStatement)
        let result;
        if (target.body && target.body.type === 'ExpressionStatement') {
          result = this._evalExpression(target.body.expression);
        } else if (target.body) {
          result = this._evalExpression(target.body);
        }
        this.state = previousState;
        return result;
      }
    }

    // Legacy string callee support (shouldn't happen with new parser)
    if (typeof callee === 'string') {
      const target = this._resolveCallee(callee);
      if (typeof target === 'function') {
        return target.apply(null, evaluatedArgs);
      }
    }

    // If callee is a Literal (e.g., null), just return null
    if (typeof callee === 'object' && callee.type === 'Literal') {
      return callee.value;
    }

    throw new Error(`Unable to resolve callee ${JSON.stringify(callee)}`);
  }

  // -----------------------------------------------------------------
  // TA method calls - need to pass series arrays
  // Args are raw AST nodes so we can detect series identifiers
  // -----------------------------------------------------------------
  _callTAMethod(method, rawArgs) {
    // Helper to get series from identifier or evaluate expression
    const seriesNames = ['close', 'open', 'high', 'low', 'volume', 'hl2', 'hlc3', 'ohlc4'];

    const evalOrSeries = (arg) => {
      // If arg is an Identifier that's a known series, return the series array
      if (arg.type === 'Identifier' && seriesNames.includes(arg.name)) {
        return this._getSeries(arg.name);
      }
      // Otherwise evaluate normally
      return this._evalExpression(arg);
    };

    // Special series calculations
    const getComputedSeries = (name) => {
      switch (name) {
        case 'hl2': return this.history.map(c => (c.high + c.low) / 2);
        case 'hlc3': return this.history.map(c => (c.high + c.low + c.close) / 3);
        case 'ohlc4': return this.history.map(c => (c.open + c.high + c.low + c.close) / 4);
        default: return this.history.map(c => c[name]);
      }
    };

    // Override _getSeries for computed series
    const getSeries = (name) => getComputedSeries(name);

    switch (method) {
      case 'sma':
      case 'ema':
      case 'rsi':
      case 'stdev':
      case 'highest':
      case 'lowest': {
        // First arg is series, second is length
        const seriesArg = rawArgs[0];
        const lengthArg = rawArgs[1];

        let series;
        if (seriesArg.type === 'Identifier' && seriesNames.includes(seriesArg.name)) {
          series = getSeries(seriesArg.name);
        } else {
          // Evaluate - might be an expression or user variable
          const evaluated = this._evalExpression(seriesArg);
          series = Array.isArray(evaluated) ? evaluated : getSeries('close');
        }

        const length = this._evalExpression(lengthArg);
        return PineTALib[method](series, length);
      }
      case 'atr': {
        // Pine: ta.atr(length) - implicitly uses high, low, close
        const length = this._evalExpression(rawArgs[0]);
        return PineTALib.atr(getSeries('high'), getSeries('low'), getSeries('close'), length);
      }
      case 'vwap': {
        // Pine: ta.vwap(src) or ta.vwap() - default src is hlc3
        return PineTALib.vwap(
          getSeries('high'),
          getSeries('low'),
          getSeries('close'),
          getSeries('volume')
        );
      }
      case 'crossover':
      case 'crossunder': {
        // Both args could be series or single values
        let seriesA = evalOrSeries(rawArgs[0]);
        let seriesB = evalOrSeries(rawArgs[1]);
        // Wrap single values in arrays for comparison
        if (!Array.isArray(seriesA)) seriesA = [seriesA];
        if (!Array.isArray(seriesB)) seriesB = [seriesB];
        return PineTALib[method](seriesA, seriesB);
      }
      case 'change': {
        // ta.change(source, length=1)
        const series = evalOrSeries(rawArgs[0]);
        const length = rawArgs[1] ? this._evalExpression(rawArgs[1]) : 1;
        if (!Array.isArray(series) || series.length < length + 1) return null;
        return series[series.length - 1] - series[series.length - 1 - length];
      }
      case 'valuewhen': {
        // ta.valuewhen(condition, source, occurrence)
        // Simplified: return source value when condition was last true
        const source = evalOrSeries(rawArgs[1]);
        return Array.isArray(source) ? source[source.length - 1] : source;
      }
      default:
        // Try calling directly with evaluated args
        if (typeof PineTALib[method] === 'function') {
          const evaluated = rawArgs.map(a => this._evalExpression(a));
          return PineTALib[method](...evaluated);
        }
        throw new Error(`Unknown ta method: ${method}`);
    }
  }

  // -----------------------------------------------------------------
  // Strategy method calls - handle named arguments
  // -----------------------------------------------------------------
  _callStrategyMethod(method, args) {
    // Convert args array with named args to options object
    const getOpts = () => {
      const opts = {};
      args.forEach((a, i) => {
        if (a && a.name) {
          opts[a.name] = a.value;
        }
      });
      return opts;
    };

    switch (method) {
      case 'entry': {
        // strategy.entry(id, direction, qty=, comment=, etc.)
        const positional = args.filter(a => !a || !a.name);
        const id = positional[0];
        const direction = positional[1];
        const opts = getOpts();
        return this.bridge.entry(id, direction, opts);
      }
      case 'exit': {
        // strategy.exit(id, from_entry=, stop=, limit=, etc.)
        const positional = args.filter(a => !a || !a.name);
        const id = positional[0];
        const opts = getOpts();
        return this.bridge.exit(id, opts.from_entry, opts);
      }
      case 'close': {
        const positional = args.filter(a => !a || !a.name);
        const id = positional[0];
        return this.bridge.close(id, getOpts());
      }
      default:
        // For other strategy properties/methods, return null or try direct access
        if (typeof this.bridge[method] === 'function') {
          return this.bridge[method](...args.filter(a => !a || !a.name));
        }
        return this.bridge[method];
    }
  }

  _resolveCallee(name) {
    // built-ins
    if (name === 'math') return Math;
    if (name === 'ta') return PineTALib;
    if (name === 'array') return PineArray;
    if (name === 'strategy') return this.bridge;
    if (name === 'session') return this.session;
    if (name === 'nz') return (val, replacement = 0) => (val === null || val === undefined || Number.isNaN(val)) ? replacement : val;
    if (name === 'na') return (val) => val === null || val === undefined || Number.isNaN(val);
    if (name === 'time') return (session) => this._getCurrentCandle()?.timestamp || Date.now();
    if (name === 'timeframe') return { multiplier: 15, isminutes: true }; // default 15m
    if (name === 'syminfo') return { ticker: 'TSLA', mintick: 0.01 };
    if (name === 'dayofweek') return new Date(this._getCurrentCandle()?.timestamp || Date.now()).getDay();

    // user variable / function
    return this.state[name];
  }

  // -----------------------------------------------------------------
  // Get a full series array from history by property name
  // -----------------------------------------------------------------
  _getSeries(name) {
    return this.history.map(c => c[name]);
  }
}

module.exports = PineRuntime;
