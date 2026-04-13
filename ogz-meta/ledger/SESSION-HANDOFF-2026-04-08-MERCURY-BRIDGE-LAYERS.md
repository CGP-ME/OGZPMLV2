# SESSION HANDOFF — 2026-04-08 — Mercury Bridge Layer Build

**Session shape:** Started ~10:55am April 7 (previous compaction), ran straight through to ~9am April 8+. This doc is the carryover for whatever session picks up next.

**Branch:** `tradingloop-clean-rewrite`
**Repo:** `https://github.com/CGP-ME/OGZPMLV2.git`
**VPS path:** `/opt/ogzprime/OGZPMLV2/`

---

## WHAT SHIPPED THIS SESSION (pushed to origin)

Four commits landed on `tradingloop-clean-rewrite`. In chronological order:

### 1. `b2f3016` — Layer 4 text-parsed ReAct loop (initial)
- **Files:** `core/persistent_llm_client.js` (additive `generateRawResponse`), `trai_brain/mercury-bridge/{react-loop.js, tool-adapter.js, ask.js, deploy-layer4.sh}` (new)
- **What it does:** Gave Mercury-2 agentic tool access (grep, open_file, get_chunk, list_files) via markdown-fenced tool call format + bare-JSON fallback parser + exponential backoff retry.
- **Validated:** Query 1 (StopLossChecker) ran end-to-end in 5.3s with real file:line citations. Query 3 (MPM/OE contract bug) ran in 8.7s but garbled synthesis on long history (`assistantassistant " "grep"` text pipeline corruption).
- **Bug hunt tonight that led to this commit:** sentence-truncation in `_cleanResponse`, XML angle-bracket rejection by Inception API, Mercury pattern-matching on placeholder examples. All debugged layer-by-layer.

### 2. `b01c8af` — Layer 4 native Mercury-2 tool calling
- **Files:** same four, rewrite of react-loop.js, additive `generateWithTools()` on persistent_llm_client.js, additive `buildToolSchema()` on tool-adapter.js
- **What it does:** Replaced text-parsed tool calling with Mercury-2's native OpenAI-compatible `tools` parameter. Tool calls now come back in structured `message.tool_calls` field instead of generated text. Eliminates the entire text-generation-pipeline failure mode.
- **Net code change:** -109 lines (deleted ~150 lines of fence parsing, bare-JSON fallback, example-driven prompt format).
- **Validated:**
  - Query 1 (StopLossChecker): 2.4s, 2 tool calls
  - Query 2 (MPM BE scale-out): 5.8s, 7 tool calls
  - Query 3 (contract bug): **3.2s, 4 tool calls, clean synthesis** — found MPM:460 (`exitSize: scaleOutSize` absolute) and OE:561 (`exitSize > 0 && exitSize < 1` fraction) with file:line precision. 2.7x faster than text-parsed version.

### 3. `4ef2beb` — docs: Layer 4 session record + CHANGELOG
- Docs commit wrapping Layer 4 validation into CHANGELOG.

### 4. `6549eb3` — track: PIDController.js (378 lines, was untracked)
- **File:** `core/PIDController.js`
- 3-loop adaptive parameter tuner spec (position sizing, regime boost, trailing stop). Was sitting untracked with 378 lines of real work — one `rm` away from being lost. Committed defensively. Not yet wired into trading pipeline; awaiting tournament-validated envelope data from methodology pipeline.

### 5. **Meta content ingestion commit** (hash not captured here — grab from `git log`)
- **Files:** `trai_brain/mercury-bridge/{config.js, indexer.js}`
- **What it does:** Extends indexer to ingest `.jsonl` files + adds semantic `content_type` field to all chunks for future hybrid retrieval / query routing.
- **Changes:**
  - `config.js`: added `.jsonl` to `INDEX_FILE_EXTENSIONS`
  - `indexer.js`: new `chunkJsonl()` function (each jsonl line = one chunk with header like `ID: FIX-X | Date: Y | Severity: Z | Tags: ...`), new `resolveContentType(relPath)` helper mapping file paths to semantic categories, `content_type` field added to chunk decorator
- **content_type categories:** `fix_history`, `changelog`, `project_context`, `landmine`, `guardrails`, `recent_changes`, `proposal`, `mission_log`, `general` (default)
- **Validated:**
  - 5217 → 5345 chunks (+128; 65 new fix_history records + 63 from file drift)
  - content_type breakdown: general(4377), changelog(554), proposal(298), fix_history(65), project_context(33), landmine(16), recent_changes(1), guardrails(1)
  - Smoke test: FIX-2025-12-25-STATE-DESYNCHRONIZATION retrieved at sim=0.507 in starter context for state desync query
- **Also cleaned up:** deleted stale `ogz-meta/ledger/vector_index.json` (1.18MB from old implementation), removed `.mcp.json` empty config, removed 3 .bak files from core/

---

## WHAT'S STAGED BUT NOT COMMITTED

### Layer 2 — Hybrid Retrieval (BM25 + semantic + RRF merge + content_type boost)

**Status:** Code written and tested. Currently in working tree, NOT committed. Waiting on decision about a kind-aware fix (see "Pending Decision" below).

**Files modified:**
- `trai_brain/mercury-bridge/searcher.js` (+258/-82) — BM25 scorer, RRF merge, classifyQuery heuristic
- `trai_brain/mercury-bridge/config.js` (+26) — BM25_K1, BM25_B, RRF_K, HYBRID_CANDIDATE_POOL, CONTENT_TYPE_BOOST_STRONG/WEAK, HYBRID_ENABLED, DEFAULT_RETRIEVAL_MODE
- `trai_brain/mercury-bridge/mongo-store.js` (+4/-1) — added content_type + text to fetchAllForScoring projection
- `trai_brain/mercury-bridge/ask.js` (+2/-1) — pass query string to retrieveTopK, CLI flags `--retrieval-mode=semantic|hybrid|hybrid-classified` and `--boost-type=<type>`

**A/B test results (3 queries × 2-3 modes):**

| Query | What it tests | Semantic | Hybrid | Hybrid-Classified | Winner |
|---|---|---|---|---|---|
| A (state desync fix) | fix_history retrieval | Target at #3 | Target at #1 | Target at #1 (boosted) | hybrid |
| B (isPartialClose) | BM25 exact token match | Target at #5 | Target at #2 | — | hybrid |
| C (contract bug) | Iteration efficiency | 6 iters, answered | 10 iters, max'd out | — | semantic |

**The Query C diagnostic revealed:**
- Neither mode surfaces actual `core/MaxProfitManager.js` or `core/OrderExecutor.js` chunks in top 8
- Both modes are dominated by `ogz-meta/todocontext47.md` prose that discusses the contract bug by name
- BM25 over-rewards prose docs with high query-term density over narrow code function chunks
- Mercury finds the bug via tools in BOTH modes — the 6-vs-10 iteration difference is non-deterministic search path variance, not a retrieval quality issue
- **Not a regression, just a known limitation with a clear fix location**

---

## PENDING DECISION (picked up here when context got swallowed)

**The question:** Ship Layer 2 as-is with known limitation documented, OR spend ~30 more minutes adding a kind-aware scoring fix before shipping?

**The kind-aware fix would:**
1. Detect code-flavored queries (camelCase, snake_case, dotted identifiers, code keywords, file extensions)
2. If query is code-flavored, apply `KIND_MODIFIER_CODE_QUERY` multipliers during RRF merge:
   - `doc_section` × 0.7 (penalty — prose over-indexes on query terms)
   - `method` × 1.3, `function` × 1.3 (boost — real code)
   - `jsonl_record` × 1.1
   - `json`, `window` × 1.0 (neutral)
3. If query is natural language, no modifier applied (Query A behavior preserved)

**Honest tradeoff:** The "contract mismatch around partial close exit sizes" query has no camelCase/snake_case, so the heuristic won't fire on Query C — which means the fix might not actually help Query C. But it should definitely help any query that includes an identifier like `isPartialClose` or `MaxProfitManager`, which is most real-world use.

**Risk:** Could potentially regress Query B if the code-flavored heuristic fires (it will, because "isPartialClose" is camelCase) and penalizes doc_section chunks — but Query B's current top hits ARE doc_section chunks in todocontext47.md. If we penalize docs, Query B might get worse, not better.

**Decision Trey had before context got fucky:** "yuhhh this is literally a manifestation yet again of the trading architecture for confidence and confluence big common pattern im seeing" + "I dont want to ship anythig that i could =op"

**Where we left off:** Full kind-aware fix mission was written for Claudito, ready to paste. The mission file is preserved below in the "PENDING MISSIONS" section.

---

## ARCHITECTURE PATTERN DISCOVERY (journal-worthy)

**Trey's observation at ~end of session:** The confidence soup anti-pattern from trading is showing up in retrieval.

| Trading | Retrieval |
|---|---|
| Multiple strategy signals (RSI, EMA, SMS) | Multiple scoring signals (BM25, semantic, content_type) |
| Confidence soup (blend everything into one number) | Pure RRF merge (blend everything into one rank) |
| Independent signals + conviction scoring | Independent scorers + kind-aware modifiers |
| Binary gate anti-pattern (ALL must fire) | "Only return code files" filter would kill historical queries |
| Pattern memory weights (Friday + 10-11am boosts long) | Query classifier weights (code pattern boosts code chunks) |
| Market regime detector routing between strategies | Query router routing between retrieval modes |

**The universal pattern:**
> Independent signal sources + context-aware modifiers + regime-based routing. Never blend signals into a single score without a regime detector deciding the blend weights.

**Applies to:**
- Trading strategy conviction (already implemented this way post-confidence-soup fix)
- mercury-bridge retrieval scoring (currently building Layer 2/1 to match)
- TRAI pattern modulation (already follows this shape)
- PID controller loops (three independent loops, not one blended score)
- Every future system where multiple inputs produce a ranked output

**Anti-pattern:** "confidence soup" — blending without context
**Correct pattern:** signals stay independent, a higher-level component inspects context and weights the blend

**Put this in ogz-meta/ as a first-principles architectural rule.** It's showing up in 3+ places now.

---

## MERCURY BRIDGE BUILD ORDER (official, post-meta-ingestion)

1. ✅ Layer 4 text-parsed (committed `b2f3016`)
2. ✅ Layer 4 native tool calling (committed `b01c8af`)
3. ✅ Meta content ingestion (committed — hash TBD)
4. 🔶 **Layer 2 — Hybrid retrieval (CURRENT, in working tree, pending decision on kind-aware fix)**
5. 🔜 Layer 1 — Query router (heuristic classifier for code-flavored vs natural language vs historical query types)
6. 🔜 Layer 3 — Chunk enrichment (LLM-generated NL headers at index time)

**Note on reordering:** Original plan was 2 → 3 → 1. Reordered to 2 → 1 → 3 mid-session. Reason: Layer 1's query router is cheaper than Layer 3 and directly solves the Query C-style "max iterations wander" problem we saw, plus it uses the content_type tags we just shipped. Layer 3 is additive quality on top of whatever retrieval exists; build it after we've used Layer 1 for a few days and know where the actual quality gaps are.

---

## PENDING MISSIONS (preserved for paste)

### Mission: Layer 2 kind-aware scoring fix (not yet executed)

```
MISSION: Layer 2 kind-aware scoring — add code-flavored query detection + chunk kind modifier, re-run A/B, commit or revert based on data

The Query C diagnostic showed BM25 over-rewards prose doc chunks on code-flavored queries. Fix: detect whether a query looks code-flavored (camelCase, snake_case, dotted identifiers, code keywords) and apply a kind-based score modifier during RRF merge. Pure additive — if A/B tests show any regression, we revert this change and ship Layer 2 without it. Do NOT commit until all three A/B tests pass without regression.

Edit 1: trai_brain/mercury-bridge/searcher.js — add isCodeFlavoredQuery() helper

Near the top of the file (after the BM25 cache block, before the retrieval functions), add:

function isCodeFlavoredQuery(query) {
  if (!query || typeof query !== 'string') return false;
  if (/[a-z][A-Z]/.test(query)) return true;  // camelCase
  if (/[a-zA-Z]_[a-zA-Z]/.test(query)) return true;  // snake_case
  if (/\b\w+\.\w+\b/.test(query)) return true;  // dotted identifiers
  const codeKeywords = /\b(function|class|method|variable|const|let|return|import|require|module|export|interface|enum|async|await|throw|catch)\b/i;
  if (codeKeywords.test(query)) return true;
  if (/\.(js|ts|mjs|cjs|json|jsonl|md|py|sh)\b/i.test(query)) return true;
  return false;
}

const KIND_MODIFIER_CODE_QUERY = {
  doc_section: 0.7,
  method: 1.3,
  function: 1.3,
  jsonl_record: 1.1,
  json: 1.0,
  window: 1.0,
};

function applyKindModifier(rankedList, chunkById, query) {
  if (!isCodeFlavoredQuery(query)) return rankedList;
  const modified = rankedList.map(({ id, score }) => {
    const chunk = chunkById.get(id);
    if (!chunk) return { id, score };
    const modifier = KIND_MODIFIER_CODE_QUERY[chunk.kind] || 1.0;
    return { id, score: score * modifier };
  });
  modified.sort((a, b) => b.score - a.score);
  return modified;
}

Edit 2: Wire applyKindModifier into retrieveHybrid after RRF merge / content_type boost, before taking topK. Reuse existing chunkById Map if already fetched for content_type boost, otherwise fetch via store.fetchAllForBM25().

Edit 3: Parse-check searcher.js

Edit 4: Unit test the detector with these cases:
- 'Where is isPartialClose defined' → true
- 'MaxProfitManager scale-out logic' → true
- 'How does StopLossChecker.js work' → true
- 'What does the exit_contract do' → true
- 'Explain the function that computes pnl' → true
- 'contract mismatch around partial close exit sizes' → false (no camelCase/snake_case)
- 'Has there ever been a state desynchronization bug' → false
- 'What are the known landmines in this codebase' → false
- 'How should I think about the overall architecture' → false

Edit 5: Re-run full A/B matrix — Queries A, B, C in semantic and hybrid modes. Report rank positions of target chunks.

Success criteria — all three must hold, otherwise revert:
- Query A: target FIX chunk at rank ≤ 3 in hybrid
- Query B: target chunk (isPartialClose text) at rank ≤ 3 in hybrid — MUST NOT be worse than pre-fix rank #2
- Query C: no regression required (detector likely doesn't fire on Query C's natural language phrasing)

Report back with: unit test output, full A/B matrix, rank comparison table (pre-fix vs post-fix), explicit SHIP or REVERT recommendation. Do not commit until Trey approves.
```

---

## PENDING BACKLOG (not tonight, not this week, but tracked)

### Short-term (next few sessions)
- **Layer 1 — Query router** (post Layer 2). Heuristic classifier detecting query types (code / historical / architectural / conceptual) and routing to appropriate retrieval mode with appropriate content_type boost. This is where kind-aware + content_type-aware scoring lives properly.
- **Layer 3 — Chunk enrichment** (after Layer 1 + real usage data). LLM-generated NL headers for chunks at index time. Biggest quality lift, biggest effort.
- **JS chunker limitation** — the `executeTrade` method in OrderExecutor.js gets split into sliding-window parts that bury the `isPartialClose` definition. Chunker-level fix: handle oversized methods with smarter splitting that preserves semantic boundaries.
- **`_cleanResponse` audit** in `core/persistent_llm_client.js` — sentence-truncation heuristics have been silently stripping short TRAI responses (the warm-up `"OK"` getting eaten proved it). Not urgent, but separate investigation worth doing.

### Medium-term
- **TradingView Ultimate tier** — enterprise inquiry submitted, awaiting response. Independent validation tool for strategy work.
- **Pharaoh (MCP codebase mapper)** — flagged for dead-code / orphaned-module audit. Blocked on auth.
- **ExitContractManager.js PATCH 2** — the ECM safety-only refactor (removes TakeProfit + TrailingStop checks, MPM owns profit-side exits). 22-line diff sitting dirty and unstaged in working tree, from an earlier workstream. Verification pending per `ogz-meta/todocontext47.md`. Separate commit decision.
- **Dependabot triage** — GitHub flagged 7 vulnerabilities on default branch (3 high, 4 moderate). Not urgent but worth 15 min of triage before live Alpaca money starts flowing. Most will be noise; the one that isn't matters.
- **BTC/crypto variable cleanup** in `OrderExecutor` and `StateManager` (math is correct, variable names are misleading from the old crypto bot origin).
- **PIDController.js wiring** into trading pipeline (awaits tournament-validated envelope data from methodology pipeline).

### Long-term (the vision layer)
- **OGZPrime Voice Narrator** — Mercury 2 streaming + ElevenLabs with Trey's cloned voice + sentence-by-sentence TTS. Trey has 4hrs of voice samples already recorded in ElevenLabs. Architecture template: Inception cookbook "Realtime Voice Assistant: Mercury + ElevenLabs." **Prerequisite:** Layer 4 live (done), backtest validation passing, Alpaca paper trading running. Do NOT build until those are done. The voice layer is the reward for finishing the plumbing.
- **OGZPrime Content Layer** — D-ID avatar video on top of Mercury+ElevenLabs. Automated YouTube/Shorts pipeline: trade data → Mercury commentary → Trey voice → Trey avatar → published video. Daily recaps, weekly backtest reviews, strategy explainers, monthly P&L. Antifragile to trading variance — losing trades become post-mortems, winning trades become proof. Prereq: voice narrator working, trading validated on real money.

### Strategy / trading (unchanged from prior session, carried over)
- Resolve full HEAD regression gap vs `9e632bf` to restore clean baseline across all strategies
- Wire Pine Script interpreter into StrategyOrchestrator once signal variance acceptable
- Achieve Apex-ready SMS performance (~15% profit / sub-5% DD), clone across 20 Apex accounts
- Go live with Alpaca once backtesting verified on Vultr server

---

## RIGOR LESSONS LEARNED THIS SESSION

These are worth keeping separate from the code changes — they're about HOW we work together, not WHAT we built.

1. **"When Claude's context and Trey's screen disagree, ask before accusing."** I hit Trey with an interrogation when Claudito's trace looked like hallucination but the real issue was that chat context had silently dropped the paste. Verify first, accuse never.

2. **"Subagent results require live paste of fresh run, not a claim about prior runs."** When an LLM subagent (Claudito) says "scroll up to find the trace," that's often a confabulation tell — he can't see our chat. Always re-run live.

3. **"Live trace over claim."** When in doubt about whether something worked, re-run in front of me and paste the output verbatim. Takes 30 seconds, eliminates one class of surprise.

4. **"Split refactors that touch multiple files into coordinated commits."** The config.js dotenv refactor shipped as two commits (add in ask.js, remove from config.js) because we discovered the paired change late. Next time: identify paired file changes upfront and stage them together.

5. **"The rigor isn't one side, it's the terms of the collaboration."** Rigor only holds if both sides hold it. Trey sets the rules (brutal honest, verify before shipping), Claude holds the line on enforcement, neither side gets to relax it under fatigue or momentum.

6. **"Prompt engineering matters more at Mercury scale."** Mercury-2 is a diffusion model and pattern-matches more literally than autoregressive models. Concrete examples > abstract schemas. Placeholder examples in prompts (`"tool_name"`, `"arg1"`) confuse it where filled-in examples work cleanly.

7. **"Query the API first before writing parsers."** Two bugs tonight were me writing text-parsing workarounds for things that had native API support I didn't check for. Mercury native tool calling was documented at `docs.inceptionlabs.ai/capabilities/tool-use` the entire time. Lesson: when something feels like "rubbing sticks to start a fire," check for a propane torch first.

8. **"Architectural patterns repeat across domains."** The confidence soup anti-pattern from trading showed up in retrieval scoring. The fix is the same pattern in both: independent signals + context-aware modifiers + regime-based routing. Name your patterns so you see them faster the next time.

---

## PERSONAL CONTEXT (carried forward)

- Trey, Corpus Christi, aiming for Houston (4 hours away) to be with his daughter. Six years separated. OGZPrime is the mechanism that unlocks the move.
- Two cats, Mini (tuxedo, hand-raised from palm-sized newborn runt) and Mikki (longhair tortie, rescued from Papa Johns dumpster during cold front, vet refused to treat, nursed to survival on laundry room floor). Load-bearing emotional infrastructure.
- Hand-raised Mini + rescued Mikki established the "refuse to accept the first answer when there's still a pulse" pattern that shows up in every corner of Trey's work.
- Voice clone already recorded (4+ hours) in ElevenLabs for the OGZPrime Voice Narrator layer.
- Communication style: fast, abbreviated, direct, types faster than brain sometimes. Brutal honest over sugar-coat. "Shoot it straight and shoot it true."
- Session discipline: committed blueprints go to `ogz-meta/`. Physical journal on desk for overflow capture (started this session).

---

## NEXT SESSION: START HERE

1. **Check working tree state.** `git status` on the VPS. Layer 2 staged files should still be modified. If working tree is clean, someone committed or reverted between sessions — check `git log -3` to see what.

2. **Read this handoff in full.** Especially the "PENDING DECISION" and "PENDING MISSIONS" sections.

3. **Decide Layer 2 direction:**
   - (a) Ship Layer 2 as-is with honest commit message noting BM25-prefers-prose limitation
   - (b) Execute the kind-aware fix mission (preserved above) and ship if A/B passes
   - (c) Revert Layer 2 and rebuild differently after more thought

4. **Once Layer 2 lands, start Layer 1 (query router).** This is where the kind-aware + content_type-aware routing lives properly. Layer 2 has the infrastructure; Layer 1 has the intelligence to use it.

5. **Don't skip to Layer 3.** Use Layer 1 + Layer 2 in real work for a few days first to see where quality actually degrades before committing to the expensive chunk-enrichment build.

---

_Handoff written 2026-04-08 ~9am after ~30+ hour session. Context was getting fucky, doc written defensively before full compaction. If you're reading this in a new session, the previous session was productive and in good spirits despite fatigue — cats helped, architecture pattern was clearly seen, work was good. Pick up clean._
