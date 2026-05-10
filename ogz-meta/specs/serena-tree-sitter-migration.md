# Serena Tree-Sitter Migration Spec

**Date:** 2026-05-10
**Branch:** `rebuild/clean-from-baseline`
**Status:** SPEC (not yet implemented)
**Predecessor:** `ogz-meta/specs/serena-mercury-integration.md` lines 220-232 ("Tree-sitter migration (next spec)")
**Owner:** CC-C (Claude Code, this instance)
**Reviewer:** Trey + Claude Desktop

---

## Why this exists

Serena's current dep-scanner is regex-based. It tracks 6 dep types (`require`, `OGZ.register/get` ×2, `broker_factory`, `ws.emit`, `ws.on`). For each new dependency mechanism we wire in another regex. That ceiling has been hit.

The triggering event: CC-C Multi-Symbol Commit 6a (Mercury attack pass, 2026-05-10) returned 6 real findings. Determining the blast radius of a single property — `ctx.priceHistory` — required a fallback to grep, which over-counts (string-literal matches, comments) and under-classifies (cannot distinguish read from write from method-call from destructure). Grep cannot tell you "which call sites *write* to `priceHistory.length` vs *read* it."

Tree-sitter changes this from a string-search problem into a symbol-resolution problem.

## What it unlocks

1. **Property-level blast radius.** Given a property name (`priceHistory`, `symbolContexts`, `tradingPair`) return every `read`, `write`, `mutate`, `destructure`, and `delete` site classified by receiver (`this.ctx`, `bot`, `symCtx`, etc.). This is what was missing for the 6a investigation.
2. **Method-level blast radius.** Given `CandleStore.getCandles`, return every call site, with awareness of the receiver chain (so `this._candleStore.getCandles(...)` inside `CandleProcessor` is not confused with `bot.candleStore.getCandles(...)` in `run-empire-v2.js`).
3. **Class-field surface.** Given a class name (`SymbolTradingContext`), enumerate the fields it exposes (constructor assignments + getters + setters). Used to detect "added field on one branch, missing read on the other" drift.
4. **Frontend panel destructure verification.** "Which panels destructure `data.indicators.rsi` off the `price` event" becomes mechanically detectable. Closes the bug class at `live-readouts.js:486` (handler reads `data.indicators` but backend emits `data.data.indicators`).
5. **Robustness.** No false positives from string literals, comments, or commented-out code blocks. Regex sees them; AST does not.

## What it does NOT cover

- **Cross-module data-flow.** Tree-sitter answers "where is symbol `X` referenced?" It does NOT answer "where does the value at this site originate from?" That requires control-flow analysis (out of scope).
- **Dynamic dispatch.** `obj[propName]` where `propName` is a runtime variable — flagged but not resolved.
- **Browser-side modules loaded via `<script>` tags without `require/import`.** Existing `OGZ.register/get` regex extractor already handles the dashboard pattern; tree-sitter inherits it via the same scanner.

---

## Public API additions

All additions in `tools/dep-scanner.js` (extends the existing `module.exports`).

### `getPropertyReferences(propName, opts) → Reference[]`

Find every reference to a property name across the repo.

```js
getPropertyReferences('priceHistory', {
  receivers: ['this.ctx', 'bot', 'symCtx', '*'],  // '*' = all
  ops:       ['read', 'write', 'mutate', 'destructure', 'delete'],
  scope:     ['core/**', 'brokers/**', 'modules/**', 'run-empire-v2.js'],
});
// → Reference[]
```

`Reference` shape:
```js
{
  file:        'core/CandleProcessor.js',
  line:        88,
  column:      9,
  receiver:    'this.ctx',                            // direct-receiver classifier (Depth 1)
  receiverPath:'this.ctx',                            // full member-chain (Depth 2) — equals receiver when shallow
  resolvedFrom:null,                                  // alias source if Depth 3 resolved (e.g. 'this._candleStore')
  op:          'mutate:push',                         // op classifier including call+*-return variants
  context:     'this.ctx.priceHistory.push(candle)',  // source slice
  enclosing:   'CandleProcessor.processNewCandle',    // function/method
}
```

When alias resolution kicks in (Depth 3), the `receiver` field shows the surface identifier (`store`) and `resolvedFrom` shows what it was bound to at the function's binding site (`this._candleStore`). Queries can filter on either: `--receiver this._candleStore` returns alias-resolved hits; `--receiver-surface store` returns only the literal-name hits.

### `getMethodCallers(methodName, opts) → Reference[]`

Find every call site of a method, optionally filtered by receiver shape.

```js
getMethodCallers('getCandles', {
  receivers: ['this._candleStore', 'bot.candleStore', '*'],
  scope:     ['core/**', 'run-empire-v2.js'],
});
```

Mirror shape of `getPropertyReferences`, with `op: 'call'` and an additional `args: string[]` field (source slices of each argument, useful for "which calls pass which symbol").

### `getClassFields(className) → ClassSurface`

Enumerate fields exposed by a class. Sources: constructor `this.X = ...`, defined methods, getters, setters, static fields.

```js
getClassFields('SymbolTradingContext');
// → {
//     file:    'core/SymbolTradingContext.js',
//     fields:  [{ name: 'symbol', kind: 'instance', line: 22 }, ...],
//     getters: [{ name: 'priceHistory', line: 129 }, ...],
//     setters: [],
//     methods: [...],
//   }
```

---

## Receiver classifier (rules)

Walks the parent chain of each member-access node and emits the FULL receiver path. Per spec amendment 2026-05-10 (this commit), the classifier is no longer artificially capped — going deeper is the whole point.

### Depth 1 — Direct receiver

| AST shape                        | Classified receiver |
|----------------------------------|---------------------|
| `this.X`                         | `this`              |
| `ctx.X` (param named ctx)        | `ctx`               |
| `bot.X`                          | `bot`               |
| `symCtx.X`                       | `symCtx`            |
| Identifier-only (`foo.X`)        | `<identifier>`      |
| Computed access (`obj[name].X`)  | `*dynamic*`         |

### Depth 2 — Multi-level receiver paths

The classifier emits the full member-expression chain leading to the property of interest. This means `this.ctx.symbolContexts.get('TSLA').priceHistory` is reported with receiver=`this.ctx.symbolContexts.get(...).` — preserving the distinction between root-snapshot access and per-symCtx access.

| AST shape                                                       | Classified receiver                          |
|-----------------------------------------------------------------|----------------------------------------------|
| `this.ctx.X`                                                    | `this.ctx`                                   |
| `this.ctx.foo.X`                                                | `this.ctx.foo`                               |
| `this.ctx.foo.bar.X`                                            | `this.ctx.foo.bar`                           |
| `this.ctx.symbolContexts.get('TSLA').X`                         | `this.ctx.symbolContexts.get(<arg>).`        |
| `bot.ctx.X`                                                     | `bot.ctx`                                    |
| `bot.candleStore.X`                                             | `bot.candleStore`                            |

Implementation: walk the parent chain until you hit either (a) a non-`member_expression` ancestor, (b) an identifier root, or (c) `this`. Concatenate properties separated by `.`. Method calls in the chain become `<methodName>(<arg>)` where `<arg>` is the source slice of the first argument (this preserves the per-symbol distinction without growing receiver strings unboundedly).

### Depth 3 — Intra-procedural alias chains

Within a single function body, track local-variable rebindings of member-access expressions and resolve them at use sites. A single pass per function: collect `const X = expr` and `let X = expr` assignments where `expr` is a member-expression chain, build a within-function alias map, then resolve.

| Setup in function body                       | Receiver at use site             | Effective receiver |
|----------------------------------------------|----------------------------------|--------------------|
| `const store = this._candleStore`            | `store.getCandles(s, t)`         | `this._candleStore` |
| `const symCtx = bot.symbolContexts.get(s)`   | `symCtx.priceHistory`            | `bot.symbolContexts.get(<arg>).` |
| `let history = symCtx.priceHistory`          | `history.push(c)`                | `symCtx.priceHistory` (op: `mutate:push`) |

Reassignment invalidates the alias entry. If `store` is reassigned later in the function, only references between the two assignments resolve to the first binding — references after the reassignment resolve to the new binding (or `<identifier>` if the new binding is non-trivial). No flow-sensitive analysis beyond top-to-bottom scan.

**Out of scope:** alias tracking across function boundaries. If a function takes `store` as a parameter, references inside resolve to `<store>` only. Determining the type of `<store>` at every call site is the inter-procedural points-to analysis we are deliberately not building (10× scope, unbounded test surface).

### Depth 4 (deferred) — Inter-procedural points-to

Tracks what a function parameter resolves to by examining every caller. Documented here as the explicit next-spec line — when a real audit blocks on cross-function aliasing, that's the trigger to scope this. NOT implemented in Phase A/B/C; written into the spec so the boundary is clear, not so it ships.

## Op classifier (rules)

For each property reference, classify the operation by inspecting the *parent* AST node:

| Parent context                                              | Op                          |
|-------------------------------------------------------------|-----------------------------|
| RHS of `=`, function arg, return value, `if (x.foo)` test   | `read`                      |
| LHS of `=` (direct assignment)                              | `write`                     |
| LHS of `+= -= *= /= ??= ||= &&=`                            | `write:compound`            |
| `delete x.foo`                                              | `delete`                    |
| `x.foo.push/pop/shift/unshift/splice`                       | `mutate:<method>`           |
| `x.foo[i] = ...`                                            | `write:index`               |
| `x.foo.length = ...`                                        | `write:length`              |
| `const { foo } = x` / `({ foo } = x)`                       | `destructure`               |
| `x.foo()`                                                   | `call`                      |
| `x.foo(...).push(...)` / `.splice(...)` / etc.              | `call+mutate-return:<method>` |
| `x.foo(...)[0]` (index access on return)                    | `call+read-return`          |
| `x.foo(...).bar = y` (assign through return)                | `call+write-return:bar`     |

The `call+*-return` ops are the method-chain awareness layer (Depth 3 of the design intent). They surface the shallow-copy bug class: a consumer doing `getCandles(s, t).push(c)` is mutating the return value, not the store. Today an `op === call+mutate-return:push` query returns every site where this pattern appears across the repo — mechanically.

Anything unclassified becomes `read` (conservative default — surfaces it in output but doesn't lie about op).

---

## CLI surface

Extends the existing dep-scanner CLI:

```bash
# Property blast radius — Depth 1 / 2 / 3 controlled via flags
node tools/dep-scanner.js --refs priceHistory
node tools/dep-scanner.js --refs priceHistory --receiver this.ctx --op write,mutate
node tools/dep-scanner.js --refs priceHistory --receiver-path 'this.ctx.symbolContexts.get(*)'
node tools/dep-scanner.js --refs priceHistory --resolved-from this._candleStore
node tools/dep-scanner.js --refs priceHistory --json   # machine-readable

# Method blast radius — alias-aware
node tools/dep-scanner.js --calls candleStore.getCandles
node tools/dep-scanner.js --calls getCandles --receiver bot.candleStore
node tools/dep-scanner.js --calls getCandles --op 'call+mutate-return:*'   # shallow-copy bug class

# Class surface
node tools/dep-scanner.js --class-fields SymbolTradingContext
```

Flag semantics:
- `--receiver` filters by direct-receiver classifier (Depth 1) OR alias-resolved receiver (Depth 3) — whichever the caller wants. Default: prefers resolved.
- `--receiver-path` filters by full member-chain (Depth 2). Supports `*` wildcard for argument slots in method links.
- `--resolved-from` filters by the alias source (Depth 3 only). Returns sites where the use-site identifier was bound to the named expression.
- `--op` accepts comma-separated ops or wildcards (`mutate:*`, `call+*-return:*`, `write*`).

Output format mirrors the existing `getCallers` CLI — table by default, `--json` for tooling.

---

## Bridge wrappers (Mercury integration)

In `tools/serena-bridge.js`:

```js
async function getSymbolBlastRadius(propName, opts = {}) { /* wraps getPropertyReferences with timeout + classifyRisk */ }
function   formatSymbolBlastForMercury(blastRadius)      { /* same shape as formatForMercury */ }

async function getMethodBlastRadius(methodName, opts = {}) { /* wraps getMethodCallers */ }
function   formatMethodBlastForMercury(blastRadius)        { /* same shape */ }
```

Both follow the existing `getBlastRadius`/`formatForMercury` contract: 5s timeout via `Promise.race`, fail-soft on parser crashes, returns formatted Markdown for inline injection into Mercury prompts.

In `trai_brain/mercury-bridge/tool-adapter.js` register three new tools so Mercury can call them directly during ReAct loops:

```js
{ name: 'find_property_refs', description: '...', input_schema: {...} }
{ name: 'find_method_calls',  description: '...', input_schema: {...} }
{ name: 'class_fields',       description: '...', input_schema: {...} }
```

Mercury's existing `read_file` + `grep` + `find_callers` tools stay; tree-sitter tools are additive.

---

## AST traversal design (tree-sitter-javascript)

Single pass per file, three accumulators (`propRefs`, `methodCalls`, `classDefs`), one parser cache by `(filepath, mtime)`.

Node types of interest:

| Node                       | Why we visit it |
|----------------------------|-----------------|
| `member_expression`        | Every `obj.prop` — feed to property-ref accumulator |
| `subscript_expression`     | Every `obj[expr]` — feed as `*dynamic*` op |
| `call_expression`          | Every `f(...)` — if callee is `member_expression`, feed to method-call accumulator |
| `assignment_expression`    | Used by op classifier to detect write side |
| `update_expression`        | `++` / `--` → write:compound |
| `unary_expression` (`delete`) | delete op |
| `object_pattern`           | Destructuring → destructure op |
| `class_declaration`        | Field surface accumulator |
| `method_definition`        | Field surface accumulator |
| `field_definition`         | Field surface accumulator (class fields proposal) |

Enclosing-function lookup: walk parents until hitting `function_declaration`, `method_definition`, `arrow_function`, or `function_expression`. Top-of-file refs return `<module>`.

---

## Performance budget

Per spec amendment 2026-05-10, depth additions raise the cold-scan ceiling:

- Cold whole-repo scan: **<800ms** (was <500ms before depth additions; Depth 3 alias pass adds ~150-300ms on a 100kLOC repo).
- Cached repeat: **<80ms** (was <50ms; alias maps cached per-function alongside parse trees, invalidated by mtime).
- Per-file parse + alias-pass: **<8ms p50, <80ms p99** for any file in the repo.

If the cold scan exceeds 800ms, profile in this order: (1) parse-cache hit rate, (2) alias-pass cost on the largest files (likely `run-empire-v2.js`), (3) member-chain walk depth on `core/`. We are NOT pre-emptively building incremental compilation.

Memory ceiling: keep parse trees live only during the scan. Discard after results are returned. Alias maps are ~10-50 entries per function; per-file aggregate stays in single-digit MB.

---

## Test plan

`tools/dep-scanner.test.js` (new file). Tests:

1. **Smoke: empty repo.** `getPropertyReferences('foo', { scope: ['nonexistent/'] })` returns `[]`. Does not crash.
2. **Property read vs write classifier.** Synthetic file with both `x.foo` (read) and `x.foo = 1` (write). Both surface, ops correctly classified.
3. **Mutate detection.** Synthetic file with `arr.foo.push(...)` → op === `mutate:push`.
4. **Destructure detection.** `const { foo } = x` → op === `destructure`.
5. **Receiver classifier — Depth 1.** Synthetic file with `this.ctx.X` and `this.X` and `ctx.X` — three distinct receivers in output (`this.ctx`, `this`, `ctx`).
6. **Receiver classifier — Depth 2 (multi-level paths).** Synthetic file with `this.ctx.X` and `this.ctx.foo.X` — two distinct receivers in output (`this.ctx` vs `this.ctx.foo`). Verifies the chain is preserved, not collapsed.
7. **Receiver classifier — Depth 2 (method-call links).** Synthetic file with `this.ctx.symbolContexts.get('TSLA').X` — receiver path includes `symbolContexts.get(<arg>)`. Verifies the per-symCtx distinction is preserved.
8. **Receiver classifier — Depth 3 (alias resolution).** Synthetic file with `const store = this._candleStore; store.getCandles(s, t)` — call site reports `receiver === 'store'`, `resolvedFrom === 'this._candleStore'`.
9. **Receiver classifier — Depth 3 (alias invalidation).** Reassignment within function invalidates the prior alias; references after the reassignment do NOT carry the original `resolvedFrom`.
10. **Method-chain op classifier.** Synthetic file with `getCandles(s, t).push(c)` — op === `call+mutate-return:push`. This is the shallow-copy bug class detector.
11. **String literal exclusion.** File contains `"x.priceHistory"` as a string — must NOT appear in results.
12. **Comment exclusion.** File contains `// x.priceHistory = 1` — must NOT appear in results.
13. **Real-repo: priceHistory blast radius.** Run against current repo, assert >= 30 references found across `core/`, `brokers/`, `modules/`, `run-empire-v2.js`. (Floor, not exact — repo evolves.)
14. **Real-repo: parity with grep floor.** Tree-sitter must find at least every reference grep finds in *uncommented, non-string* code.
15. **Real-repo: shallow-copy detector.** Query `getCandles` with op filter `call+mutate-return:*` against the current repo. Documents how many shallow-copy mutation sites exist today (zero, one, or N) — establishes the baseline before the architecture refactor.
16. **Performance: <500ms cold full repo.**

Tests run via existing jest config. No new test runner.

---

## Phase 0 invariance

Tools are read-only. They do NOT touch `core/`, `brokers/`, `modules/`, `run-empire-v2.js` runtime paths. The Phase 0 baseline command:

```bash
ALPACA_SYMBOLS=TSLA SYMBOL_PROFILE_OVERRIDE=stock_default \
ALPACA_FEED=iex ALPACA_FEED_OVERRIDE=iex BACKTEST_FEE=0 \
node run-empire-v2.js backtest "EMA + SMA Crossover (50/200)" \
  2026-04-10T13:30 2026-05-08T20:00 1m 100000 \
  > /tmp/p0-after-tree-sitter.log 2>&1
```

Expected (bit-identical): `$18,497.278595001146 / 1,384 trades / 60.0% WR / 2.63% MaxDD / 2.85 PF`.

Run AFTER implementation (not part of this spec). If results drift, the implementation touched something it shouldn't have.

---

## Failure modes

| Failure                                          | Behavior                                          | Recovery |
|--------------------------------------------------|---------------------------------------------------|----------|
| File parse error (syntax error in source)        | Skip file, log to stderr, continue scan           | Tree-sitter is error-recovering; partial trees usable |
| `tree-sitter` native binding fails to load       | Fallback to `@babel/parser` (already installed)   | Implementation MUST handle both backends behind a common visitor interface |
| Computed property access (`obj[name]`)           | Emit reference with op === `*dynamic*`            | Mercury sees the dynamic flag and treats as unclassified |
| Property name collision across receivers         | Each match emitted separately, classified by receiver | Caller filters by receiver if needed |
| Massive file (>1MB single source)                | Parse anyway; if >50ms, log warning               | Optimize only if it shows up in profiling |

---

## Implementation phases

Per spec amendment 2026-05-10 the depth additions raise the LOC + session budget. Updated estimate: ~400-600 LOC, 2-3 sessions. The original 200-400 / 1-2 estimate stays valid for Depth 1 only, which is no longer the target.

**Phase A — Property blast radius, Depth 1 + 2 (1 session).**
- Add tree-sitter dependency wiring.
- Implement `getPropertyReferences` with Depth 1 + Depth 2 receiver classifier (full member-chain paths) + op classifier (without `call+*-return` variants).
- CLI flag `--refs <propName>` with `--receiver-path` filter.
- Tests 1-7, 11-13.
- Bridge wrapper `getSymbolBlastRadius` in serena-bridge.js.

**Phase B — Depth 3 alias resolution + method-chain op classifier (1 session).**
- Implement intra-procedural alias chain pass (per-function scan, top-to-bottom, reassignment-aware).
- Add `resolvedFrom` field to Reference shape; CLI flag `--receiver` resolves through aliases.
- Add `call+mutate-return:*`, `call+read-return`, `call+write-return:*` ops to op classifier.
- Tests 8-10, 15.
- Bridge wrapper update for alias-resolved queries.

**Phase C — Method blast radius + class fields (0.5 session).**
- Implement `getMethodCallers` (reuses Phase A's traversal + Phase B's alias resolution).
- Implement `getClassFields`.
- CLI flags `--calls`, `--class-fields`.
- Test 14.
- Bridge wrappers for both.

**Phase D — Mercury tool registration (0.5 session).**
- Register `find_property_refs`, `find_method_calls`, `class_fields` in tool-adapter.js.
- Smoke test: dispatch a Mercury attack with `priceHistory` blast radius pre-populated using Depth 2 paths + Depth 3 alias resolution.
- Compare against grep-based blast radius from 2026-05-10 architecture finding. Document the delta (count, classification breakdown) in the architecture finding doc.

Total: 3 sessions. The depth additions cost +1 session vs the original estimate; the payoff is that Mercury queries can mechanically distinguish root-snapshot writes from per-symCtx writes, and shallow-copy mutation sites surface without manual hunting. Without the depth, Mercury would still need grep fallbacks for those classes.

---

## Cross-references

- **Predecessor:** `ogz-meta/specs/serena-mercury-integration.md` (lines 220-232 — names this spec)
- **Triggering finding:** `ogz-meta/sessions/session-2026-05-10-cc-c-6a-architecture-finding.md` (Mercury attack on Multi-Symbol commit 6a, blast radius via grep marked PRELIMINARY pending this spec's implementation)
- **Related capability:** WS event blast-radius (`getEventEmitters` / `getEventSubscribers`) shipped in commit `634f3b2` — same pattern, regex-based. After this spec lands, those two functions get tree-sitter rewrites for free (they share the AST walker).
- **dep-scanner origin:** Created 2026-03-06 to prevent the kraken_adapter_simple archive disaster
- **Memory:** `feedback-mercury-scope-hot-path.md` — hot-path-only Mercury attack scope still applies; tree-sitter just gives sharper blast radius for the same scope.

---

## Decision points (for Desktop review)

1. **Primary parser choice.** Spec commits to `tree-sitter` as primary, `@babel/parser` as fallback. Alternative: skip native binding entirely, use `@babel/parser` only (slower, no incremental but pure JS). **Default: keep tree-sitter primary.**
2. **CLI naming.** `--refs` vs `--property` — committed to `--refs` for parity with grep's mental model. Open to override.
3. **Receiver classifier depth.** ~~Spec is intentionally shallow.~~ **Resolved 2026-05-10 via spec amendment (this commit):** classifier ships with Depth 1 (direct receiver) + Depth 2 (full member-chain path) + Depth 3 (intra-procedural alias resolution). Depth 4 (inter-procedural points-to) remains explicitly deferred — that's the genuine 10× cliff. Trigger to scope Depth 4: a real audit that blocks on cross-function aliasing.
4. **Should this land before or after the 6a architecture refactor decision?** Recommendation: this lands FIRST so the architecture finding doc can be re-scored with authoritative blast radius data before any refactor decision is made.
