[MERCURY-BRIDGE] Index contains 14675 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/ledger/frontend/panel-emitter-mapping-2026-05-09.md:28-36 (doc_section: 2. Pattern Analysis Card (pattern-card)) sim=0.659
  2. ogz-meta/ledger/frontend/js/ARCHITECTURE.md:1282-1309 (doc_section: 8.13 PatternCard) sim=0.625
  3. ogz-meta/ledger/frontend/js/panels/PATTERN-CARD-INTEGRATION.md:159-183 (doc_section: Event: `pattern_analysis` (TODO - UNVERIFIED)) sim=0.620
  4. ogz-meta/ledger/frontend/js/ARCHITECTURE-AUDIT.md:65-73 (doc_section: `pattern_analysis`) sim=0.601
  5. ogz-meta/ledger/frontend/js/panels/PATTERN-CARD-INTEGRATION.md:365-384 (doc_section: FAQ) sim=0.590
  6. core/TradeNarrator.js:251-294 (method: patternSpotted) sim=0.606
  7. ogz-meta/ledger/pc/phase-C/01-TradeNarrator.js:241-284 (method: patternSpotted) sim=0.606
  8. ogz-meta/ledger/frontend/js/panels/PATTERN-CARD-INTEGRATION.md:105-131 (doc_section: Visual Tests) sim=0.578
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 415 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.94, 8 iters, used 0x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (188ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace not captured: skipped_worse_quality

═══ ANSWER ═══

**Result – the patch closes all of the intended attack surface except two cases.**

| # | Attack goal | What the code does | Does a breach exist? | Evidence (file : line) |
|---|--------------|--------------------|----------------------|------------------------|
| 1 | Render `[object Object]` (object‑coercion) | `recordDetection` extracts `patternName` as `typeof pattern === 'string' ? pattern : pattern.name`. If `pattern` is an object without a string `name`, the early‑return on line 544 stops processing, so no object is ever rendered. | **No breach** – the payload is rejected before any rendering. | `public/js/panels/pattern-card.js:540‑544` |
| 2 | Missing‑symbol payload accepted | The first guard `if (!event || !event.pattern || !event.symbol) return;` (line 541) discards any event lacking a `symbol`. | **No breach** – the payload never reaches UI state. | `public/js/panels/pattern-card.js:540‑542` |
| 3 | Malformed pattern payload that crashes `recordDetection()` | When `event.pattern` is an object, the code does `Number(pattern.confidence)` (lines 545‑547). If `pattern.confidence` is a **`Symbol`** (or any value that throws when coerced to a number), `Number(Symbol())` throws a `TypeError`, bubbling up and crashing the handler. | **Breach** – a crafted payload can crash the parser. | `public/js/panels/pattern-card.js:545‑547` |
| 4 | Valid backend‑shaped payload with explicit `symbol` that is rejected | The backend shape (`run-empire-v2.js` lines 2637‑2649) creates a `pattern` object with a non‑empty `name`. `recordDetection` will accept it (line 544 passes) and store it, so it is **not** rejected. | **No breach** – the payload is accepted as intended. | `run-empire-v2.js:2637‑2649` |
| 5 | Confidence value that escapes the 0‑1 clamp or yields `NaN` in rendered state | The confidence is clamped with `Math.min(1, Math.max(0, Number.isFinite(confidence) ? confidence : 0))` (line 554). Any non‑finite value (Infinity, `NaN`, Symbol, etc.) is replaced by `0`. | **No breach** – the clamp prevents out‑of‑range or `NaN` values from reaching the UI. | `public/js/panels/pattern-card.js:550‑555` |
| 6 | Public API path that still fabricates pattern state without a real `pattern_analysis` socket frame | The public API (lines 29‑35) only exposes `init`, `setSymbol`, `getHistory`, `clearHistory`, `teardown`, and `_compute`. No injection method remains; the removed `recordPattern` was the only way to fabricate state. | **No breach** – there is no remaining public entry point for fabrication. | `public/js/panels/pattern-card.js:29‑35` |
| 7 | Existing consumer that breaks because `PatternCard.recordPattern()` was removed | The demo “showcase‑mode” script still calls `OGZ.PatternCard?.recordPattern?.({…})` (lines 158‑162). The optional‑chaining prevents a runtime exception, but the call silently does nothing, breaking the intended demo flow (patterns never appear). | **Breach** – a consumer now silently fails to inject patterns. | `ogz-meta/ledger/frontend/showcase-mode.js:158‑162` |

### Concrete payload that **crashes** `recordDetection()`

```json
{
  "symbol": "TSLA",
  "pattern": { "name": "double_bottom", "confidence": Symbol("boom") },
  "ts": 1700000000000,
  "bias": "long"
}
```

*When this object is sent as a `pattern_analysis` WS event, the line `Number(pattern.confidence)` (public/js/panels/pattern-card.js : 545‑547) throws a `TypeError`, aborting the handler.*

### Concrete consumer that **breaks** after the removal

```js
// ogz-meta/ledger/frontend/showcase-mode.js (lines 158‑162)
OGZ.PatternCard?.recordPattern?.({
  ts: Date.now(),
  symbol: 'TSLA',
  pattern: 'double_bottom',
  confidence: 0.78,
  bias: 'long',
});
```

*The call now resolves to `undefined` because `recordPattern` no longer exists, so the demo never records the pattern and the UI stays empty.*

---

**Summary**

- The parser’s validation (missing fields, empty names, confidence clamping) is solid – no payload can coerce objects, bypass the symbol check, or escape the confidence range.
- A malformed `confidence` value (e.g., a `Symbol`) can still cause a runtime crash (see `public/js/panels/pattern-card.js:545‑547`).
- The only existing consumer that now fails is the showcase‑mode demo, which still attempts to call the removed `recordPattern` method (see `ogz-meta/ledger/frontend/showcase-mode.js:158‑162`).

[iterations: 17 | termination: answer_given | latency: 23352ms]
