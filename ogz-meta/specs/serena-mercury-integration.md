# Serena × Mercury Integration

**Date:** 2026-05-05
**Branch:** `rebuild/clean-from-baseline`
**Git SHA at integration:** `349172a` (commit pending)
**Source spec:** `ogz-meta/ledger/spec fixes/CC-SPEC-SERENA-MERCURY-INTEGRATION_1.md` (Wolf, 2026-05-05)
**Status:** LIVE — slash command `/critic-attack` available, end-to-end verified

---

## Purpose

Mercury attacks proposed code changes but does not know the call graph — it cannot infer which callers a change will affect from the file alone. Serena (`tools/dep-scanner.js`) traces require/loader.get/broker_factory dependencies project-wide. This integration runs Serena first to compute blast radius, then dispatches Mercury with that context injected as a system message before the user query.

---

## Architecture

```
User invokes /critic-attack <file> "<change>"
  │
  ├─► tools/serena-bridge.js
  │     getBlastRadius(file)
  │       └─► tools/dep-scanner.js
  │             getCallers(target)  ← inverse call-graph lookup
  │       returns { file, callers, callerCount, riskLevel, summary }
  │     formatForMercury(blastRadius)
  │       returns markdown system-message section (capped at 30 callers)
  │
  ├─► trai_brain/mercury-bridge/ask.js
  │     runAgentic(query, { blastRadius })
  │       └─► trai_brain/mercury-bridge/react-loop.js
  │             runReactLoop({ ..., blastRadius })
  │               injects blastRadius as system message at position 3
  │               (after starterContext, after traceHint, before userQuery)
  │
  └─► Mercury's verdict with file:line citations + caller-aware risk analysis
```

**Serial — never parallel.** Serena runs first with a 5-second timeout via `Promise.race`. If Serena fails or times out, Mercury runs without blast radius rather than blocking. Decision: visible degradation beats invisible delay.

---

## Public API

### `tools/serena-bridge.js`

```js
const { getBlastRadius, formatForMercury } = require('./tools/serena-bridge');

const br = await getBlastRadius('core/CandleProcessor.js', { timeoutMs: 5000 });
// {
//   file: 'core/CandleProcessor.js',
//   callers: [{ source, line, type, target }, ...],
//   callerCount: 1,
//   truncated: false,
//   riskLevel: 'low',  // isolated | low | medium | high
//   summary: 'core/CandleProcessor.js is required by 1 file(s): run-empire-v2.js.',
//   latencyMs: 57,
// }

const markdown = formatForMercury(br);
// "## Blast Radius — core/CandleProcessor.js\n\n**Risk level:** low\n..."
```

### `tools/dep-scanner.js`

```js
const { getCallers, findJSFiles, extractDeps } = require('./tools/dep-scanner');

const callers = getCallers('core/StateManager.js');
// [{ source: 'core/BacktestRunner.js', line: 14, type: 'require', target: '../core/StateManager' }, ...]
```

`getCallers` walks all JS files (excluding `node_modules`, `.git`, `archive`, `.claude`, `ogz-meta/ledger`), extracts deps from each, and returns the inverse map for the target. Path normalization handles `.js` suffix variance and `./` prefix variance.

### `trai_brain/mercury-bridge/ask.js` — programmatic entry

```js
const { runAgentic } = require('./trai_brain/mercury-bridge/ask');

const result = await runAgentic(attackPrompt, {
  blastRadius: formattedMarkdown,    // ← new param, threads through to react-loop
  maxTokens: 7750,
  maxIterations: 30,
});
```

---

## Decisions Locked

| Decision | Value | Rationale |
|----------|-------|-----------|
| Max callers in prompt | **30** | Prevents context overflow; covers blast radius for everything except framework-core files |
| Citation tolerance | **10 lines** | Mercury's line citations vary slightly with file edits between scan and answer |
| Sequencing | **Serial: Serena first, Mercury second** | Mercury can't reason about callers it doesn't see; race conditions if parallel |
| Serena timeout | **5000 ms via `Promise.race`** | dep-scanner currently runs ~60ms; 5s is 80x headroom for repo growth |
| Timeout fallback | **Mercury without blast radius** | Visible degradation beats invisible delay. Serena failures log; do not block |
| Mercury max-tokens | **7750** | Per `feedback-mercury-max-tokens.md` — never lower; cap-truncation silently drops tasks |
| Prompt framing | **Attack only — never verify** | Per `feedback-mercury-attack-not-verify.md`; verify framing returns soft findings |

---

## Files Touched

| File | Change | Lines |
|------|--------|-------|
| `tools/dep-scanner.js` | Added `getCallers(target)`, `module.exports`, `require.main` guard | +47 |
| `tools/serena-bridge.js` | NEW — `getBlastRadius` + `formatForMercury` + 5s timeout | +89 |
| `trai_brain/mercury-bridge/react-loop.js` | New `blastRadius` param, system-message injection at position 3 | +14 |
| `trai_brain/mercury-bridge/ask.js` | Thread `blastRadius` through `runAgentic` to `runReactLoop` | +1 |
| `.claude/commands/critic-attack.md` | NEW — slash command spec | +78 |

**Bot hot path: untouched.** None of these files are loaded by `run-empire-v2.js`. Phase 0 baseline (`$17,950.589592711076` on `tuning/tsla-15m-2y.json` for `EMASMACrossover` SOLO) is unaffected.

---

## Verification

### Unit-level

```bash
$ node -e "const {getCallers}=require('./tools/dep-scanner'); console.log(getCallers('core/StateManager.js').length)"
15  # CandleProcessor, OrderExecutor, ExchangeReconciler, KrakenAdapterV2, ...

$ node --check tools/dep-scanner.js && node --check tools/serena-bridge.js \
   && node --check trai_brain/mercury-bridge/react-loop.js \
   && node --check trai_brain/mercury-bridge/ask.js
# all OK
```

### End-to-end (mock client)

Invoking `runReactLoop` with mock client, mock toolAdapter, real `blastRadius` string. Confirms message ordering at Mercury's prompt boundary:

```
0. system   | DEFAULT_SYSTEM_PROMPT
1. system   | Starter context from RAG retrieval ...
2. system   | PRIOR INVESTIGATION HINT ...
3. system   | ## Blast Radius — <file> ...     ← injected here
4. user     | <user query>
```

Position 3 is intentional: the most recent context Mercury sees before reading the user query. LLMs weight recent tokens more heavily — we want Mercury thinking about callers when it reads the attack request, not at the start of a long context window.

---

## Slash Command

```
/critic-attack <file-path> "<change description>"
```

Examples:
```
/critic-attack core/CandleProcessor.js "RTH-aware gap detection (commit 349172a)"
/critic-attack core/SessionRouter.js "Force-close on session swap"
/critic-attack modules/NoWickImbalance.js "Switch ctx.candles to ctx.priceHistory"
```

Full spec: `.claude/commands/critic-attack.md`.

---

## When NOT to Use

- **Config files / docs / non-executable surfaces** — per `feedback-mercury-scope-hot-path.md`, Mercury attack passes are for hot-path/bot code only (`core/`, `brokers/`, `modules/`, `run-empire-v2.js`).
- **Single-file scripts with no callers** — Serena returns 0 callers, Mercury attack still runs but blast radius adds no signal.
- **Routine refactors with no behavioral change** — waste of Mercury's token budget.

---

## Failure Modes

| Failure | Behavior | Recovery |
|---------|----------|----------|
| Serena finds 0 callers | Mercury runs with `Risk level: isolated` — informs Mercury that callers are entry-point only or dynamic loads | None needed; valid signal |
| Serena exceeds 5s timeout | `Promise.race` rejects, Mercury runs without blast radius | None needed; degradation is visible in logs |
| dep-scanner crashes | Caught by serena-bridge's try/catch in the Promise wrapper | Caller logs and continues without blast radius |
| Mercury max-tokens hit mid-answer | Per Mercury Dispatch Playbook — bump cap or split prompt | Re-dispatch with smaller blast radius if 30-caller cap is the issue |

---

## Cross-References

- **Wolf's source spec:** `ogz-meta/ledger/spec fixes/CC-SPEC-SERENA-MERCURY-INTEGRATION_1.md`
- **Mercury Dispatch Playbook:** `~/.claude/projects/-opt-ogzprime-OGZPMLV2/memory/mercury-dispatch-playbook.md`
- **Mercury Attack Framing:** `~/.claude/projects/-opt-ogzprime-OGZPMLV2/memory/feedback-mercury-attack-not-verify.md`
- **Mercury Hot-Path Scope:** `~/.claude/projects/-opt-ogzprime-OGZPMLV2/memory/feedback-mercury-scope-hot-path.md`
- **dep-scanner origin:** Created 2026-03-06 to prevent the kraken_adapter_simple archive disaster
