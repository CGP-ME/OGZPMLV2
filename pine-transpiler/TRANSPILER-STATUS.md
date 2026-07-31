# Pine Transpiler Status Report

## Current State: REFUSE-LOUDLY ENFORCED

Any Pine feature the transpiler does not support fails at load time, by name.
Nothing unmapped limps through as a silent null at runtime. This replaces the
former "WORKING / production-ready" claim, which is retracted below.

## Retraction: the former WORKING claim

The previous version of this document claimed the transpiler was
"production-ready for SmartMoneySweep-v4" with 419 signals against a ~397
target. That number was measured on a mis-parsed script:

- SMS-v4 lines 334-337 use history access on call expressions
  (`isBearish()[1]`). The pre-T-B1 parser turned these into
  `IndexExpression(CallExpression, n)`, which evaluated to JS
  `true[1]` = `undefined` at runtime - the whole exhaustion-detection block
  ran as undefined-soup while the script appeared to work.
- From commit `da4d3ff3` (T-B1) until this cut, SMS-v4 did not parse at all;
  the stranded bracket died as a misnamed tuple SyntaxError. No test parsed
  SMS-v4, so nothing caught it.

## Flagship status

`modules/SmartMoneySweep-v4.js`: UNSUPPORTED-PENDING-MISSION-TWO. It refuses
at load, by name: `history access on call expressions (e.g. fn()[1])`.
Mission two item one builds the real call-history semantics; the refusal is
the catalog entry, not the endpoint.

## Refusal architecture (three layers)

1. Import gate (`tools/pine-import.js` + `core/PineFeatureScanner.js`) -
   blocklist of known-dangerous repaint/untested features (lookahead
   request.security, calc_on_every_tick=true, varip, array.from, recursion,
   switch). Exit code 2, features named. (Codex-2 T3 lane.)
2. Load gate (`core/PineRuntime.js` constructor `_validateSupportedSurface`) -
   allowlist walk of the parsed AST against the actual supported surface.
   Collects every violation and throws once, `code: PINE_LOAD_REFUSED`,
   naming each unsupported feature. Runs for every consumer because it lives
   in the constructor: generated modules, parity harness, strategy-parity.
   The parser additionally refuses call-history (`fn()[1]`) by name during
   parse.
3. Runtime backstops - the six former silent-null seams in member/identifier
   resolution now throw `code: PINE_RUNTIME_BYPASS` with the label
   "unreachable: constructor gate should have refused this". A backstop
   firing is evidence of a load-gate bypass, not a random error.

## Enforced supported surface (what the load gate allows)

Statements: `var`/regular/typed declarations, tuple assignment, `:=`,
`if`/`else`, `for`, `while`, `break`, `continue`, single-expression user
functions (`f(x) =>`), expression statements.

Value roots: `close`, `open`, `high`, `low`, `volume`, `bar_index`, `na`;
`hl2`/`hlc3`/`ohlc4` as direct `ta.*` arguments only.

Namespaces (member surface reflected from the live implementations):

- `ta.*` - PineTALib statics plus dispatcher specials: sma, ema, emaSeries,
  rsi, stdev, highest, lowest, atr, macd, vwap, crossover, crossunder,
  change, valuewhen.
- `math.*` - JS `Math` members verbatim (`math.pi` is NOT supported - JS
  spells it `Math.PI`; Pine-spelling aliases are mission-two coverage).
- `array.*` - new_float, new_int, set, get, size, push, clear, copy, sort.
- `strategy.*` - entry, exit, close, long, short, position_size,
  position_avg_price, equity, closedtrades; `strategy(...)` header call.
- `session.*` - SessionTracker surface (getESTTime, update, recordDailyLoss,
  canTrade, plus tracked fields).
- `timeframe.*` - multiplier, period, isminutes. `syminfo.*` - ticker,
  mintick. `input.*` - any member; returns the declared default.
- Callable roots: `nz`, `na`, `time`, `input`, user-declared functions.

Ignored by design (never refused, never trading-relevant): direct calls to
plot, plotshape, plotchar, plotarrow, plotbar, plotcandle, bgcolor, fill,
hline, line, label, box, table, alertcondition, alert; the visualization/
formatting namespaces color.*, table.*, str.*, label.*, line.*, box.*
resolve as sanctioned no-ops.

Everything else refuses at load, by name. Every named refusal is an entry on
the mission-two build list.

## Known gaps (ruled, sequenced)

1. CLOSED: ATR truth. `PineTALib.atr` now delegates to
   `IndicatorCalculator.calculateWilderATR` (Wilder RMA), matching
   TradingView's `ta.atr` including the first-bar TR (high-low, na prev
   close). The golden-test tripwire that held the seat is replaced by
   delegation assertions; all pine suites green.
2. Call-history semantics (`fn()[1]`) - mission two item one; unblocks
   SMS-v4.
3. Mission two fetch loop: EXECUTED 2026-07-31. 20 real TradingView scripts
   fetched verbatim (pine-facade API / page-embedded JSON), 19 unique after
   dedup, all in `corpus/` and scored by
   `__tests__/PineCorpus.catalog.test.js` on every test run. Result:
   1 LOADS (TV built-in MACD Strategy v6), 9 REFUSED_NAMED, 9 PARSE_ERROR.
   Ranked build list from the catalog:
   - Parser: multi-line user function bodies (`f(x) =>` with indented
     block) - crash signature "token string", gates 5 scripts incl. v6
     QQE MOD.
   - Parser: "token operator (=)" signature (tuple destructuring /
     named-arg forms) - gates 3 scripts; "token indent" continuation
     lines gate 1 more.
   - v2-v4 dialect layer: `study()` header + bare TA builtins aliased to
     `ta.*` (8 of 9 named refusals) + bare color names as no-ops (5).
   - plot-as-value handles fed to `fill()`; bare `hl2`/`hlc3`/`ohlc4`
     roots; v6 `indicator()` header; hex color literals (`#cad850`
     currently mis-lexes); `strategy.cash`/`close_all`; `timestamp()`.

## Test Commands

```bash
npx jest pine-transpiler/__tests__ --runInBand
```

Probes: `PineRuntime.load-refusal.test.js` (refusal by name, multi-violation
collection, no-op namespaces, backstop labels),
`PineRuntime.sms-v4-behavior.test.js` (SMS-v4 refuses by name; behavior
freeze on the parsing corpus), plus the T3 scanner refusal, tuple, parity,
and TA-golden suites.
