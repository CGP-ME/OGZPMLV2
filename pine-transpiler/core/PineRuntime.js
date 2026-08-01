// core/PineRuntime.js
const PineArray = require('./PineArray');
const PineTALib = require('./PineTALib');
const SessionTracker = require('../helpers/SessionTracker');
const PineStrategyBridge = require('./PineStrategyBridge');

// Sentinel for visualization/formatting namespaces that are ignored by
// design. Member access on it stays chainable; member calls resolve to null.
const PINE_NOOP = Object.freeze({ __pineNoop: true });

// Namespaces ignored by design: visualization and string formatting only.
// They never feed trading logic, so their members are sanctioned no-ops,
// not refusals. Everything else unmapped refuses at load.
const NOOP_NAMESPACES = new Set([
  'color', 'table', 'str', 'label', 'line', 'box',
  'plot', 'hline', 'shape', 'size', 'location', 'display', 'format',
]);

// v2-v4 dialect: bare builtin calls (sma(...), rsi(...)) alias onto the
// same ta.* dispatcher, so old-Pine scripts compute with the identical
// TV-verified definitions as their ta.* spellings.
const BARE_TA_ALIASES = new Set([
  'sma', 'ema', 'rsi', 'stdev', 'highest', 'lowest', 'atr', 'macd', 'vwap',
  'crossover', 'crossunder', 'cross', 'change', 'valuewhen',
  'wma', 'rma', 'linreg', 'stoch',
]);

// v2-v4 bare scalar math builtins. TV round() rounds half away from zero;
// JS Math.round rounds half toward +Infinity for negatives.
const BARE_SCALAR_FNS = {
  abs: Math.abs,
  log: Math.log,
  log10: Math.log10,
  sqrt: Math.sqrt,
  pow: Math.pow,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  max: Math.max,
  min: Math.min,
  round: (x) => (x < 0 ? -Math.round(-x) : Math.round(x)),
  avg: (...xs) => xs.reduce((a, b) => a + b, 0) / xs.length,
  iff: (cond, a, b) => (cond ? a : b),
};

// Bare color names and plot-style words from v2-v4 scripts. Visualization
// values only - they resolve to the no-op sentinel, never trading logic.
const BARE_VISUAL_IDENTIFIERS = new Set([
  'red', 'green', 'blue', 'lime', 'gray', 'grey', 'orange', 'aqua',
  'maroon', 'black', 'white', 'yellow', 'purple', 'silver', 'teal',
  'navy', 'olive', 'fuchsia',
  'histogram', 'area', 'columns', 'stepline', 'linebr', 'circles',
  'dashed', 'dotted', 'solid', 'cross',
]);

// Direct-call names ignored by design (visualization/alerting).
const IGNORED_CALL_NAMES = new Set([
  'plot', 'plotshape', 'plotchar', 'plotarrow', 'plotbar', 'plotcandle',
  'bgcolor', 'fill', 'hline', 'line', 'label', 'box', 'table',
  'alertcondition', 'alert',
]);

// Built-in bar series usable anywhere.
const SERIES_IDENTIFIERS = new Set(['close', 'open', 'high', 'low', 'volume']);

// Computed series only supported as direct ta.* arguments.
const TA_ONLY_SERIES = new Set(['hl2', 'hlc3', 'ohlc4']);

// ta.* methods special-cased by the runtime dispatcher beyond PineTALib statics.
const TA_SPECIAL_METHODS = new Set([
  'sma', 'ema', 'rsi', 'stdev', 'highest', 'lowest', 'atr', 'macd', 'vwap',
  'crossover', 'crossunder', 'change', 'valuewhen',
]);

// Namespace roots valid in value position.
const ROOT_NAMESPACES = new Set([
  'math', 'ta', 'array', 'strategy', 'session', 'timeframe', 'syminfo', 'input',
]);

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

    // State history - snapshot of state after each candle (for series lookback on user vars)
    this.stateHistory = [];

    // Session tracker (IVB, daily loss, etc.)
    this.session = new SessionTracker();

    // Strategy bridge - collects entry/exit requests
    this.bridge = new PineStrategyBridge();

    // Load gate: every unsupported feature refuses here, by name, before
    // a single candle is evaluated. Silent nulls at runtime are banned.
    this._validateSupportedSurface();
  }

  // -----------------------------------------------------------------
  // Load gate - walk the AST and refuse every unsupported feature by name
  // -----------------------------------------------------------------
  _validateSupportedSurface() {
    const declared = new Set();

    const collectStmt = (node) => {
      if (!node || typeof node !== 'object') return;
      switch (node.type) {
        case 'VarDecl':
        case 'RegularVarDecl':
          declared.add(node.id);
          break;
        case 'TupleAssignment':
          node.ids.forEach((id) => declared.add(id));
          break;
        case 'FunctionDecl':
          declared.add(node.name);
          (node.params || []).forEach((p) => declared.add(p));
          (node.locals || []).forEach(collectStmt);
          break;
        case 'IfStatement':
          collectStmts(node.consequent && node.consequent.body);
          if (node.alternate) collectStmts(node.alternate.body);
          break;
        case 'ForStatement':
          declared.add(node.id);
          collectStmts(node.body && node.body.body);
          break;
        case 'WhileStatement':
          collectStmts(node.body && node.body.body);
          break;
        case 'ExpressionStatement':
          if (
            node.expression &&
            node.expression.type === 'AssignmentExpression' &&
            node.expression.left &&
            node.expression.left.type === 'Identifier'
          ) {
            declared.add(node.expression.left.name);
          }
          break;
        case 'AssignmentExpression':
          if (node.left && node.left.type === 'Identifier') declared.add(node.left.name);
          break;
        default:
          break;
      }
    };
    const collectStmts = (stmts) => (stmts || []).forEach(collectStmt);
    collectStmts(this.ast.body);

    const staticNames = (klass) =>
      Object.getOwnPropertyNames(klass).filter((n) => typeof klass[n] === 'function');
    const surfaces = {
      ta: new Set([...staticNames(PineTALib), ...TA_SPECIAL_METHODS]),
      array: new Set(staticNames(PineArray)),
      strategy: new Set(
        Object.getOwnPropertyNames(PineStrategyBridge.prototype).filter(
          (n) => !['constructor', 'flushSignal', 'updatePosition'].includes(n)
        )
      ),
      session: new Set([
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(this.session)).filter(
          (n) => n !== 'constructor'
        ),
        ...Object.getOwnPropertyNames(this.session),
      ]),
      timeframe: new Set(['multiplier', 'period', 'isminutes']),
      syminfo: new Set(['ticker', 'mintick']),
    };

    const violations = new Set();
    const refuse = (label) => violations.add(label);

    const walkExpr = (node, ctx) => {
      if (!node || typeof node !== 'object') return;
      switch (node.type) {
        case 'Literal':
          return;
        case 'Identifier': {
          const name = node.name;
          if (declared.has(name)) return;
          if (SERIES_IDENTIFIERS.has(name)) return;
          if (name === 'bar_index' || name === 'na') return;
          if (TA_ONLY_SERIES.has(name) || name === 'tr' || name === 'time') return;
          if (BARE_VISUAL_IDENTIFIERS.has(name)) return;
          if (NOOP_NAMESPACES.has(name)) return;
          if (ROOT_NAMESPACES.has(name)) return;
          refuse(`identifier '${name}'`);
          return;
        }
        case 'SeriesLookup':
          if (!SERIES_IDENTIFIERS.has(node.series) && !declared.has(node.series)) {
            refuse(`series '${node.series}[...]'`);
          }
          walkExpr(node.offset, ctx);
          return;
        case 'MemberExpression': {
          const objNode = node.object;
          if (objNode && objNode.type === 'Identifier') {
            const ns = objNode.name;
            if (NOOP_NAMESPACES.has(ns) || ns === 'input') return;
            if (ns === 'math') {
              // Surface = what the runtime actually resolves: JS Math members
              // verbatim. Pine spellings like math.pi are mission-two coverage.
              if (!(node.property in Math)) refuse(`'math.${node.property}'`);
              return;
            }
            if (surfaces[ns]) {
              if (!surfaces[ns].has(node.property)) refuse(`'${ns}.${node.property}'`);
              return;
            }
            // Member access on a user value - dynamic, backstop covers it.
            walkExpr(objNode, ctx);
            return;
          }
          walkExpr(objNode, ctx);
          return;
        }
        case 'CallExpression': {
          const callee = node.callee;
          const args = node.arguments || [];
          const walkArgs = (argCtx) =>
            args.forEach((a) => walkExpr(a && a.type === 'NamedArgument' ? a.value : a, argCtx));
          if (callee && callee.type === 'Identifier') {
            const name = callee.name;
            if (
              IGNORED_CALL_NAMES.has(name) ||
              NOOP_NAMESPACES.has(name) ||
              BARE_TA_ALIASES.has(name) ||
              Object.prototype.hasOwnProperty.call(BARE_SCALAR_FNS, name) ||
              ['strategy', 'study', 'indicator', 'input', 'nz', 'na', 'time', 'timestamp'].includes(name) ||
              declared.has(name)
            ) {
              walkArgs(undefined);
              return;
            }
            refuse(`function '${name}()'`);
            walkArgs(undefined);
            return;
          }
          if (callee && callee.type === 'MemberExpression') {
            const isTa =
              callee.object && callee.object.type === 'Identifier' && callee.object.name === 'ta';
            walkExpr(callee, undefined);
            walkArgs(isTa ? { inTaArgs: true } : undefined);
            return;
          }
          walkExpr(callee, undefined);
          walkArgs(undefined);
          return;
        }
        case 'NamedArgument':
          walkExpr(node.value, ctx);
          return;
        case 'UnaryExpression':
          walkExpr(node.argument, ctx);
          return;
        case 'BinaryExpression':
        case 'LogicalExpression':
          walkExpr(node.left, ctx);
          walkExpr(node.right, ctx);
          return;
        case 'ConditionalExpression':
          walkExpr(node.test, ctx);
          walkExpr(node.consequent, ctx);
          walkExpr(node.alternate, ctx);
          return;
        case 'IndexExpression':
          walkExpr(node.object, ctx);
          walkExpr(node.index, ctx);
          return;
        case 'AssignmentExpression':
          walkExpr(node.left, ctx);
          walkExpr(node.right, ctx);
          return;
        default:
          refuse(`expression type '${node.type}'`);
      }
    };

    const walkStmt = (node) => {
      if (!node || typeof node !== 'object') return;
      switch (node.type) {
        case 'VarDecl':
        case 'RegularVarDecl':
          walkExpr(node.init, undefined);
          return;
        case 'TupleAssignment':
          walkExpr(node.init, undefined);
          return;
        case 'ExpressionStatement':
          walkExpr(node.expression, undefined);
          return;
        case 'IfStatement':
          walkExpr(node.test, undefined);
          walkStmts(node.consequent && node.consequent.body);
          if (node.alternate) walkStmts(node.alternate.body);
          return;
        case 'ForStatement':
          walkExpr(node.start, undefined);
          walkExpr(node.end, undefined);
          walkStmts(node.body && node.body.body);
          return;
        case 'WhileStatement':
          walkExpr(node.test, undefined);
          walkStmts(node.body && node.body.body);
          return;
        case 'FunctionDecl':
          (node.locals || []).forEach(walkStmt);
          walkStmt(node.body);
          return;
        case 'AssignmentExpression':
          walkExpr(node.left, undefined);
          walkExpr(node.right, undefined);
          return;
        case 'break':
        case 'continue':
          return;
        default:
          refuse(`statement type '${node.type}'`);
      }
    };
    const walkStmts = (stmts) => (stmts || []).forEach(walkStmt);
    walkStmts(this.ast.body);

    if (violations.size > 0) {
      const names = [...violations].sort();
      const error = new Error(`Pine load refused: unsupported feature(s): ${names.join(', ')}`);
      error.code = 'PINE_LOAD_REFUSED';
      error.unsupported = names;
      throw error;
    }
  }

  // -----------------------------------------------------------------
  // Backstop error - fires only if the load gate missed something.
  // A firing here is evidence of a gate bypass, not a random error.
  // -----------------------------------------------------------------
  _bypassError(detail) {
    const error = new Error(
      `Unsupported Pine feature reached runtime (${detail}) - unreachable: ` +
        'constructor gate should have refused this; a firing here is evidence of a load-gate bypass'
    );
    error.code = 'PINE_RUNTIME_BYPASS';
    return error;
  }

  _describeNode(node) {
    if (!node || typeof node !== 'object') return String(node);
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'MemberExpression') {
      return `${this._describeNode(node.object)}.${node.property}`;
    }
    if (node.type === 'CallExpression') return `${this._describeNode(node.callee)}()`;
    return node.type;
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

    // Save state snapshot for series lookback on user variables
    this.stateHistory.push({ ...this.state });
    if (this.stateHistory.length > maxLookback) this.stateHistory.shift();

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
      case 'TupleAssignment':
        {
          const values = this._evalExpression(node.init);
          if (!Array.isArray(values)) {
            throw new Error('Tuple assignment expected a tuple-returning expression');
          }
          node.ids.forEach((id, index) => {
            if (id !== '_') {
              this.state[id] = values[index] === undefined ? null : values[index];
            }
          });
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
            try {
              this._execBlock(node.body.body);
            } catch (e) {
              if (e && e.type === 'BreakSignal') break;
              if (e && e.type === 'ContinueSignal') continue;
              throw e;
            }
          }
        }
        break;
      case 'WhileStatement':
        {
          // safeguard - max 1000 iterations to avoid infinite loops
          let iter = 0;
          while (this._evalExpression(node.test) && iter < 1000) {
            try {
              this._execBlock(node.body.body);
            } catch (e) {
              if (e && e.type === 'BreakSignal') break;
              if (e && e.type === 'ContinueSignal') { iter++; continue; }
              throw e;
            }
            iter++;
          }
        }
        break;
      case 'FunctionDecl':
        // store the function object (params + body + locals) in state
        this.state[node.name] = {
          params: node.params,
          body: node.body,
          locals: node.locals,
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
        // Hex color literals are cosmetic - resolve to the inert PINE_NOOP
        // sentinel (parity with named colors) so a color never leaks a raw
        // string into arithmetic/comparison. Real string literals are unaffected.
        if (node.isColor) return PINE_NOOP;
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
        // built-in objects for member access
        if (node.name === 'timeframe') return { multiplier: 15, period: '15', isminutes: true };
        if (node.name === 'syminfo') return { ticker: 'TSLA', mintick: 0.01 };
        // na in value position is Pine's empty value
        if (node.name === 'na') return null;
        // Computed bar values and visual words - user declarations shadow
        // them (v4 scripts commonly reassign builtin names like atr).
        if (!(node.name in this.state)) {
          const cur = this._getCurrentCandle();
          if (node.name === 'hl2') return cur ? (cur.high + cur.low) / 2 : null;
          if (node.name === 'hlc3') return cur ? (cur.high + cur.low + cur.close) / 3 : null;
          if (node.name === 'ohlc4') {
            return cur ? (cur.open + cur.high + cur.low + cur.close) / 4 : null;
          }
          if (node.name === 'tr') {
            if (!cur) return null;
            const prev = this.history[this.history.length - 2];
            if (!prev) return cur.high - cur.low;
            return Math.max(
              cur.high - cur.low,
              Math.abs(cur.high - prev.close),
              Math.abs(cur.low - prev.close)
            );
          }
          if (node.name === 'time') return cur ? cur.timestamp ?? null : null;
          if (BARE_VISUAL_IDENTIFIERS.has(node.name)) return PINE_NOOP;
        }
        // visualization/formatting namespaces are sanctioned no-ops
        if (NOOP_NAMESPACES.has(node.name)) return PINE_NOOP;
        // user variable - must be declared; anything else bypassed the gate
        if (!(node.name in this.state)) {
          throw this._bypassError(`identifier '${node.name}'`);
        }
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
          // A cosmetic value (color/PINE_NOOP) is not-a-number - Pine treats it
          // as na rather than coercing the sentinel object.
          if (arg === PINE_NOOP) return null;
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
          // A cosmetic value (color/PINE_NOOP) has no numeric or ordinal meaning.
          // Pine's type checker rejects color-in-arithmetic at compile time; since
          // we evaluate at runtime, treat any PINE_NOOP operand as na (null) rather
          // than concatenating it as "[object Object]..." or comparing the sentinel.
          if (left === PINE_NOOP || right === PINE_NOOP) return null;
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
          if (obj === PINE_NOOP) return PINE_NOOP;
          if (obj === null || obj === undefined) {
            throw this._bypassError(
              `member access '${this._describeNode(node.object)}.${node.property}' on empty value`
            );
          }
          const value = obj[node.property];
          if (value === undefined && !(node.property in Object(obj))) {
            throw this._bypassError(
              `member '${this._describeNode(node.object)}.${node.property}'`
            );
          }
          return value;
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
  // Round to tick - match TradingView's precision behavior
  // -----------------------------------------------------------------
  _roundToTick(value) {
    if (value === null || value === undefined || isNaN(value)) return value;
    const tick = 0.01; // syminfo.mintick for TSLA
    return Math.round(value / tick) * tick;
  }

  // -----------------------------------------------------------------
  // Series look-back - e.g. close[3]
  // -----------------------------------------------------------------
  _lookupSeries(name, offset) {
    const offsetInt = Math.floor(offset);
    const currentIdx = this.history.length - 1;
    const targetIdx = Math.max(0, currentIdx - offsetInt);

    // Check if this is a user variable (exists in stateHistory)
    // For user variables, we need to look at the state snapshot from that bar
    if (this.stateHistory.length > targetIdx && targetIdx >= 0) {
      const historicalState = this.stateHistory[targetIdx];
      if (historicalState && name in historicalState) {
        return historicalState[name];
      }
    }

    // Otherwise, look up from candle OHLCV
    const candle = this.history[targetIdx];
    if (!candle) return null;
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
      // Special handling for input.* - return the default value (before evaluating obj)
      if (callee.object.type === 'Identifier' && callee.object.name === 'input') {
        const named = evaluatedArgs.find(a => a && a.name === 'defval');
        if (named) return named.value;
        const positional = evaluatedArgs.filter(a => !a || !a.name);
        return positional[0]; // First arg is the default value
      }

      const obj = this._evalExpression(callee.object);
      const method = callee.property;

      // Sanctioned visualization/formatting no-op namespaces
      if (obj === PINE_NOOP) return null;

      if (obj === null || obj === undefined) {
        throw this._bypassError(
          `call '${this._describeNode(callee.object)}.${method}()' on empty value`
        );
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

      // For other objects (array, math, etc.)
      if (typeof obj[method] === 'function') {
        // Extract positional args (ignore named args for simple methods)
        const positional = evaluatedArgs.filter(a => !a || !a.name);
        return obj[method](...positional);
      }

      if (obj[method] !== undefined) return obj[method];
      throw this._bypassError(
        `method '${this._describeNode(callee.object)}.${method}()'`
      );
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

      // study(...) / indicator(...) headers are metadata, not calls
      if (callee.name === 'study' || callee.name === 'indicator') {
        const meta = {};
        evaluatedArgs.forEach((a, i) => {
          if (a && a.name) meta[a.name] = a.value;
          else if (i === 0) meta.title = a;
        });
        this.scriptMeta = meta;
        return null;
      }

      // Special case: input.*() returns the default value
      if (callee.name === 'input') {
        const named = evaluatedArgs.find(a => a && a.name === 'defval');
        if (named) return named.value;
        const positional = evaluatedArgs.filter(a => !a || !a.name);
        return positional[0];
      }

      // Ignore visualization/alerting functions - they don't affect trading logic
      if (['plot', 'plotshape', 'plotchar', 'plotarrow', 'plotbar', 'plotcandle',
           'bgcolor', 'fill', 'hline', 'line', 'label', 'box', 'table',
           'alertcondition', 'alert'].includes(callee.name)) {
        return null;
      }

      // v2-v4 dialect: bare builtins route through the ta.* dispatcher with
      // the same TV-verified definitions. User declarations shadow: a var
      // named atr wins in value position, but a bare atr(...) CALL is only
      // shadowed by a user FUNCTION of that name, never by a plain value.
      const shadow = this.state[callee.name];
      const shadowIsUserFn = shadow && typeof shadow === 'object' && !!shadow.params;
      if (!shadowIsUserFn && BARE_TA_ALIASES.has(callee.name)) {
        return this._callTAMethod(callee.name, args);
      }
      if (!shadowIsUserFn && Object.prototype.hasOwnProperty.call(BARE_SCALAR_FNS, callee.name)) {
        const positional = evaluatedArgs.filter(a => !a || !a.name);
        return BARE_SCALAR_FNS[callee.name](...positional);
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
    const seriesNames = ['close', 'open', 'high', 'low', 'volume', 'hl2', 'hlc3', 'ohlc4', 'tr'];

    // Special series calculations
    const getComputedSeries = (name) => {
      switch (name) {
        case 'hl2': return this.history.map(c => (c.high + c.low) / 2);
        case 'hlc3': return this.history.map(c => (c.high + c.low + c.close) / 3);
        case 'ohlc4': return this.history.map(c => (c.open + c.high + c.low + c.close) / 4);
        case 'tr': return this.history.map((c, i) => {
          if (i === 0) return c.high - c.low;
          const pc = this.history[i - 1].close;
          return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
        });
        default: return this.history.map(c => c[name]);
      }
    };

    // Override _getSeries for computed series
    const getSeries = (name) => getComputedSeries(name);

    // Per-bar history of a user variable: state snapshots for past bars
    // plus the value computed so far on the current bar - TV series
    // semantics for expressions like sma(wt1, 4).
    const userVarSeries = (name) => {
      const values = this.stateHistory.map((s) => (name in s ? s[name] : null));
      values.push(this.state[name]);
      return values;
    };

    const isUserVar = (name) => {
      if (!(name in this.state)) return false;
      const v = this.state[name];
      return !(v && typeof v === 'object' && v.params);
    };

    const evalOrSeries = (arg) => {
      // If arg is an Identifier that's a known series, return the series array
      if (arg.type === 'Identifier' && seriesNames.includes(arg.name)) {
        return this._getSeries(arg.name);
      }
      if (arg.type === 'Identifier' && isUserVar(arg.name)) {
        return userVarSeries(arg.name);
      }
      // x[1] over a resolvable base: the same series shifted one bar back
      if (arg.type === 'SeriesLookup') {
        let base = null;
        if (seriesNames.includes(arg.series)) base = getSeries(arg.series);
        else if (isUserVar(arg.series)) base = userVarSeries(arg.series);
        if (base) {
          const off = Math.floor(this._evalExpression(arg.offset));
          return off > 0 ? base.slice(0, base.length - off) : base;
        }
      }
      // Otherwise evaluate normally
      return this._evalExpression(arg);
    };

    // Series-argument resolution for window functions. Non-series scalars
    // keep the legacy close fallback until every expression shape carries
    // per-bar history.
    const resolveSeriesArg = (arg) => {
      if (arg.type === 'Identifier' && seriesNames.includes(arg.name)) {
        return getSeries(arg.name);
      }
      if (arg.type === 'Identifier' && isUserVar(arg.name)) {
        return userVarSeries(arg.name);
      }
      if (arg.type === 'SeriesLookup') {
        const shifted = evalOrSeries(arg);
        if (Array.isArray(shifted)) return shifted;
      }
      const evaluated = this._evalExpression(arg);
      return Array.isArray(evaluated) ? evaluated : getSeries('close');
    };

    switch (method) {
      case 'sma':
      case 'ema':
      case 'rsi':
      case 'stdev':
      case 'highest':
      case 'lowest':
      case 'wma':
      case 'rma': {
        // First arg is series, second is length
        const series = resolveSeriesArg(rawArgs[0]);
        const length = this._evalExpression(rawArgs[1]);
        // Round to mintick to match TradingView precision
        return this._roundToTick(PineTALib[method](series, length));
      }
      case 'linreg': {
        // ta.linreg(source, length, offset)
        const series = resolveSeriesArg(rawArgs[0]);
        const length = this._evalExpression(rawArgs[1]);
        const offset = rawArgs[2] ? this._evalExpression(rawArgs[2]) : 0;
        return this._roundToTick(PineTALib.linreg(series, length, offset));
      }
      case 'stoch': {
        // ta.stoch(source, high, low, length)
        const source = resolveSeriesArg(rawArgs[0]);
        const highs = resolveSeriesArg(rawArgs[1]);
        const lows = resolveSeriesArg(rawArgs[2]);
        const length = this._evalExpression(rawArgs[3]);
        return PineTALib.stoch(source, highs, lows, length);
      }
      case 'atr': {
        // Pine: ta.atr(length) - implicitly uses high, low, close
        const length = this._evalExpression(rawArgs[0]);
        // Round to mintick to match TradingView precision
        return this._roundToTick(PineTALib.atr(getSeries('high'), getSeries('low'), getSeries('close'), length));
      }
      case 'macd': {
        const seriesArg = rawArgs[0];
        const series = seriesArg.type === 'Identifier' && seriesNames.includes(seriesArg.name)
          ? getSeries(seriesArg.name)
          : evalOrSeries(seriesArg);
        const fastLength = this._evalExpression(rawArgs[1]);
        const slowLength = this._evalExpression(rawArgs[2]);
        const signalLength = this._evalExpression(rawArgs[3]);
        return PineTALib.macd(series, fastLength, slowLength, signalLength);
      }
      case 'vwap': {
        // Pine: ta.vwap(src) or ta.vwap() - default src is hlc3
        let source = rawArgs[0] ? evalOrSeries(rawArgs[0]) : getSeries('hlc3');
        if (!Array.isArray(source)) source = [source];
        return this._roundToTick(PineTALib.vwap(source, getSeries('volume')));
      }
      case 'crossover':
      case 'crossunder':
      case 'cross': {
        // Both args could be series or single values
        let seriesA = evalOrSeries(rawArgs[0]);
        let seriesB = evalOrSeries(rawArgs[1]);
        // Wrap single values in arrays for comparison
        if (!Array.isArray(seriesA)) seriesA = [seriesA];
        if (!Array.isArray(seriesB)) seriesB = [seriesB];
        // A constant leg (crossover(wt1, 0)) stretches to the series leg's
        // length so the prior-bar comparison exists - TV semantics.
        if (seriesA.length === 1 && seriesB.length > 1) {
          seriesA = new Array(seriesB.length).fill(seriesA[0]);
        }
        if (seriesB.length === 1 && seriesA.length > 1) {
          seriesB = new Array(seriesA.length).fill(seriesB[0]);
        }
        return PineTALib[method](seriesA, seriesB);
      }
      case 'change': {
        // ta.change(source, length=1)
        const series = evalOrSeries(rawArgs[0]);
        const length = rawArgs[1] ? this._evalExpression(rawArgs[1]) : 1;
        if (!Array.isArray(series) || series.length < length + 1) return null;
        return this._roundToTick(series[series.length - 1] - series[series.length - 1 - length]);
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
        throw this._bypassError(`ta method 'ta.${method}()'`);
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
        if (typeof this.bridge[method] === 'function') {
          return this.bridge[method](...args.filter(a => !a || !a.name));
        }
        if (method in this.bridge) return this.bridge[method];
        throw this._bypassError(`strategy member 'strategy.${method}'`);
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
    if (name === 'timestamp') {
      // timestamp("2021-10-01T00:00:00") or timestamp(year, month, day, hour, minute[, sec])
      return (...a) => {
        if (typeof a[0] === 'string') {
          const parsed = Date.parse(a[0]);
          return Number.isNaN(parsed) ? null : parsed;
        }
        const [y, m = 1, d = 1, h = 0, min = 0, s = 0] = a;
        if (typeof y !== 'number') return null;
        return Date.UTC(y, (m || 1) - 1, d, h, min, s);
      };
    }
    if (name === 'timeframe') return { multiplier: 15, isminutes: true }; // default 15m
    if (name === 'syminfo') return { ticker: 'TSLA', mintick: 0.01 };
    if (name === 'dayofweek') return new Date(this._getCurrentCandle()?.timestamp || Date.now()).getDay();

    // user variable / function - must be declared; anything else bypassed the gate
    if (!(name in this.state)) {
      throw this._bypassError(`function '${name}()'`);
    }
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
