# Mercury Bridge — OGZPrime In-House Code Knowledge

**Purpose:** Give Mercury-2 full awareness of the OGZPrime codebase via RAG.
Replaces `scripts/mercury-analyze.js` which could only see 3 hardcoded files.

**Scope:** RAG-backed adversarial verifier with native ReAct tools.
Mercury retrieves repo memory, reads current code, checks git evidence, and can
run isolated proof commands without write access to live repo code.

---

## What this does

1. Walks the OGZPrime repo and chunks source files intelligently
2. Embeds each chunk with `nomic-embed-text` via local Ollama (CPU-friendly)
3. Stores chunks + embeddings + metadata in MongoDB
4. Query time: embeds the question, runs cosine similarity, retrieves top-K chunks
5. Builds a prompt with retrieved chunks as context + the question
6. Calls Mercury-2 via existing `core/persistent_llm_client.js`
7. Returns Mercury's answer with inline file:line citations

**Before this bridge:** Mercury hallucinated answers about files it had never seen.
**After this bridge:** Mercury answers with the actual code loaded as context.

---

## Prerequisites (verify before running the indexer)

### 1. MongoDB running on VPS
```bash
sudo systemctl status mongod
# if not installed:
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

Default: local MongoDB on `mongodb://localhost:27017`. Override via
`MONGO_URI` env var if using Atlas or a remote instance.

### 2. OpenAI API key (for embeddings)
The bridge uses OpenAI's `text-embedding-3-small` by default. You need
an OpenAI API account at `platform.openai.com` (separate from ChatGPT).

Add to `.env`:
```
OPENAI_API_KEY=<required-openai-api-key>
```

Cost: ~1-2 cents per full repo reindex. Query embeddings are fractions
of a cent. Effectively unlimited rate (Tier 1: 3000 RPM, 1M TPM).

**Alternative — GitHub Models (free, rate-limited):**
If you'd rather not use OpenAI direct, swap to GitHub Models free tier:
```
EMBED_ENDPOINT=https://models.github.ai/inference/embeddings
EMBED_MODEL=openai/text-embedding-3-small
EMBED_API_KEY=<required-github-models-token>
EMBED_MIN_INTERVAL_MS=4500
EMBED_BATCH_MAX_CHUNKS=30
EMBED_BATCH_MAX_TOKENS=50000
```
GitHub Models free tier limits: 150 req/day, 15 req/min. Full repo reindex
fits in ~114 batches (about 76% of daily quota), so you can do ~1 full
reindex per day with ~36 query requests left over. Generate the PAT at
`https://github.com/settings/personal-access-tokens` — fine-grained, no
special permissions needed for the free tier.

### 3. Mercury API key for inference
Already set up from earlier TRAI work. Verify:
```bash
echo $INCEPTION_API_KEY
```
If empty, add to `.env`: `INCEPTION_API_KEY=sk_xxx`

### 4. npm dependency (one-time)
```bash
npm install mongodb
```

That's the only new dep. Everything else uses built-in Node modules or
existing files in the repo.

---

## Cost / rate-limit math

**Default config — OpenAI direct:**
- Full ~3000-chunk repo reindex: ~795,000 tokens × $0.02/M = **~1.6 cents**
- Query embedding: ~10-50 tokens × $0.02/M = fraction of a cent
- Reindex daily for a month: **~50 cents/month total**
- Rate limits: Tier 1 OpenAI account = 3000 RPM, 1M TPM (effectively unlimited)
- No pacing needed (`EMBED_MIN_INTERVAL_MS=0`)

**Alternative config — GitHub Models free tier:**
- 15 req/min, 150 req/day, 64K tokens/req
- Full repo reindex: ~114 batches at 4.5s pacing = ~8.6 minutes wall clock
- ~76% of daily quota for one reindex
- ~36 query requests/day remaining for asking Mercury questions
- Free, but reindex frequency and query volume both constrained

The indexer paces requests automatically via `EMBED_MIN_INTERVAL_MS`. Default
0 (no pacing) for OpenAI direct. Set to 4500 for GitHub Models free tier.

---

## File layout

```
trai_brain/mercury-bridge/
├── README.md          This file
├── config.js          Env-driven config (Mongo URI, Ollama URL, collection names)
├── mongo-store.js     MongoDB wrapper: init, insert chunks, cosine retrieve, stats
├── indexer.js         Entry: walk repo → chunk → embed → store. Run once + on changes.
├── searcher.js        Entry: embed query → retrieve → prompt assembly → Mercury call
└── ask.js             CLI entry for one-off questions
```

---

## Usage

### Build the index (one-time + on repo changes)
```bash
node trai_brain/mercury-bridge/indexer.js
```

RAG/chunk memory writes are explicit. `ask.js` reads the indexed chunks but does
not update the chunk collection. Only run the indexer after the repo/docs state is
approved for Mercury retrieval.

Expected output:
```
[MERCURY-BRIDGE] Indexer starting...
[MERCURY-BRIDGE] MongoDB: mongodb://localhost:27017
[MERCURY-BRIDGE] Ollama:  http://localhost:11434
[MERCURY-BRIDGE] Walking repo from /opt/ogzprime/OGZPMLV2/
[MERCURY-BRIDGE] Found 234 files to index
[MERCURY-BRIDGE] Chunking... 2847 chunks total
[MERCURY-BRIDGE] Embedding chunks (this takes 2-7 min on CPU)...
[MERCURY-BRIDGE] [####################] 2847/2847 chunks embedded
[MERCURY-BRIDGE] Storing to MongoDB...
[MERCURY-BRIDGE] Done. 2847 chunks indexed in ogz_knowledge.chunks
```

### Ask a question
```bash
node trai_brain/mercury-bridge/ask.js "How does MaxProfitManager handle BE scale-out?"
```

Investigation trace memory is also manual-write. Normal asks may retrieve prior
trace hints, but a successful answer is not saved as a new trace unless
`--capture-trace` is supplied. Treat the two write decisions independently:
reindex RAG with `indexer.js` only when repo/docs content should be refreshed,
and use `--capture-trace` only when the specific Mercury answer should teach
future investigations.

Expected output:
```
[MERCURY-BRIDGE] Embedding query...
[MERCURY-BRIDGE] Retrieving top-8 chunks by cosine similarity...
[MERCURY-BRIDGE] Top matches:
  1. core/MaxProfitManager.js:432-467 (function: BE_SCALE_OUT_BLOCK) sim=0.847
  2. core/MaxProfitManager.js:628-656 (function: executePartialExit)  sim=0.723
  3. core/TradingConfig.js:654-680 (section: exitLogic)               sim=0.691
  ...
[MERCURY-BRIDGE] Calling Mercury-2 with 8 chunks as context...
[MERCURY-BRIDGE] Mercury responded in 1247ms

ANSWER:
MaxProfitManager handles BE scale-out in the update() method between lines 432-467.
When profit crosses the trigger threshold (1:1 R by default from
core/MaxProfitManager.js:437), it sets beScaleOutFired = true, computes
scaleOutSize as remainingSize * scaleOutFraction (default 0.5), and returns
an action object with exitSize and reason: 'be_scaleout'.

NOTE: The returned exitSize is in absolute units, not a normalized fraction.
This creates a contract mismatch with OrderExecutor.js:561 which checks
exitSize < 1. See SESSION-HANDOFF-2026-04-07.md for the fix plan.
```

---

## How chunking works

### JavaScript files
- Regex finds `function name()`, `const name = () =>`, `async function name()`, `class Name`, `methodName() {`
- Extracts from the match to the matching closing brace
- Each function/class/method becomes one chunk with metadata: `{kind: 'function'|'class'|'method', name, startLine, endLine}`
- Files with no matched functions fall back to a 1500-char sliding window with 150-char overlap
- Comments immediately above a function are attached as header context

### Markdown files
- Split by `## ` and `### ` headers
- Each section = one chunk with `{kind: 'doc_section', headerText, startLine, endLine}`
- Files with no headers fall back to the sliding window

### Files skipped
- `node_modules/`, `.git/`, `data/`, `backtest-results/`, `logs/`, `dist/`, `build/`
- Binary files (`.png`, `.jpg`, `.zip`, `.gz`, `.pdf`)
- Files over 500KB (huge generated files aren't useful context)
- Files matching `.gitignore` patterns

### Known limitation (documented, not a bug)
The regex chunker misses some edge cases like functions defined inside object
literals, dynamically-named methods, or unusual arrow function patterns. For
MVP this is acceptable — the sliding window fallback catches whatever the
regex misses. If accuracy becomes an issue, upgrade to AST parsing with
`acorn` or `@babel/parser` in a v2 commit.

---

## MongoDB collections

### `ogz_knowledge.chunks`
```js
{
  _id: ObjectId,
  file_path: "core/MaxProfitManager.js",
  kind: "function",              // 'function' | 'class' | 'method' | 'doc_section' | 'window'
  name: "update",                // function name, class name, or header text
  start_line: 368,
  end_line: 505,
  text: "update(currentPrice, options = {}) { ... }",
  embedding: [0.0234, -0.0871, ...],   // 768-dim Float32 from nomic-embed-text
  file_sha: "a1b2c3d4...",       // git blob hash for incremental reindex
  indexed_at: ISODate("2026-04-07T22:14:33Z")
}
```

Indexes:
- `{file_path: 1}` — for incremental updates
- `{kind: 1}` — for filtered queries
- `{indexed_at: -1}` — for recency queries

**No vector index for MVP.** Cosine is computed in JS after retrieving candidates.
At ~3000 chunks this is <100ms on CPU — fine for MVP. Move to Atlas Vector
Search ($vectorSearch) later if scale demands it.

---

## Design choices (and why)

### Why MongoDB (not LanceDB / Chroma / Postgres)
Trey requested MongoDB explicitly. Tradeoffs:
- **Pro:** Document-oriented, flexible schema, familiar, runs locally on VPS with no extra infra
- **Pro:** Incremental updates are trivial (filter by file_path, replace chunks)
- **Con:** No native vector index without Atlas (Atlas Vector Search is paid)
- **Con:** Must compute cosine in JS for self-hosted
- **Verdict for MVP:** fine. Cosine-in-JS over <10K chunks is fast enough. Upgrade later.

### Why `nomic-embed-text` (not OpenAI embeddings / sentence-transformers)
- Free, local, runs on CPU via existing Ollama setup
- 768 dims, solid quality for code
- Zero API cost, zero rate limits, zero data leaving VPS
- No GPU required — important because VPS is downgrading GPU → CPU

### Why regex chunker (not AST)
- MVP speed. AST adds dependency, more failure modes, slower
- Regex covers 85%+ of JavaScript function definitions in this codebase
- Sliding window fallback catches the rest
- Upgrade to AST in v2 if accuracy is measurably worse

### Why cosine-in-JS (not $vectorSearch)
- Self-hosted Mongo doesn't have $vectorSearch (Atlas only)
- Cosine over 3000 768-dim vectors: ~50ms on CPU
- Zero new infrastructure
- Can swap to $vectorSearch later by adding a Mongo Atlas deployment

### Why extend existing persistent_llm_client.js (not new HTTP client)
- Already handles Mercury auth, error handling, provider abstraction
- Already has fallback for content filter errors
- Matches existing TRAI patterns
- Extension is just adding a method that accepts a messages array instead of a prompt string

---

## What's NOT in MVP (deferred to v2)

1. **TRAI hot-path integration** — Mercury via this bridge is not yet wired into TRAI's `processDecision` flow. v2 does that wiring once the bridge proves out.

2. **Incremental reindex** — MVP reindexes the whole repo each run. v2 adds git diff detection + selective reindex on post-commit hook.

3. **Reranking** — MVP returns top-K by cosine only. v2 can add BM25 hybrid rerank or lexical boost for filename matches.

4. **Multi-turn conversation history** — MVP is single-turn: one question, one answer. v2 adds conversation context across follow-ups.

5. **Streaming responses** — MVP waits for the full Mercury response. v2 can stream tokens back to the CLI.

6. **Cross-encoder rerank** — Not needed at this scale.

---

## Testing checklist

After indexing, verify the following queries return accurate answers:

1. **Direct file question:** "What does StopLossChecker.js do?"
   - Should cite `core/exit/StopLossChecker.js` with line numbers
   - Should describe hard stop + account drawdown + strategy SL with BE

2. **Cross-file question:** "How does MPM's BE scale-out interact with OrderExecutor's partial close logic?"
   - Should cite both `core/MaxProfitManager.js` and `core/OrderExecutor.js`
   - Should identify the contract mismatch (exitSize absolute vs fraction)

3. **Architecture question:** "What are the exit logic modules and which one is the authority?"
   - Should cite ExitContractManager + MaxProfitManager + BreakEvenManager
   - Should describe the current split (ECM safety + MPM profit)

4. **Concept question:** "Explain the per-trade sealed environment concept"
   - Should pull from SESSION-HANDOFF-2026-04-07.md architecture spec
   - Should describe trade.exitEnv + trade.exitState

If Mercury gets any of these wrong, the bridge isn't working — debug before trusting it for architecture review.

---

## Integration with architecture refactor (the whole point)

During the 8-phase architecture refactor:

**Before executing any phase:**
```bash
node trai_brain/mercury-bridge/ask.js "For the phase [N] changes to [file], identify any dependencies I'm missing"
```

**After each phase commit:**
```bash
node trai_brain/mercury-bridge/indexer.js   # reindex with the new code
node trai_brain/mercury-bridge/ask.js "Review the changes in [file] and flag any new edge cases"
```

Mercury becomes a second pair of eyes at every commit. Claudito executes, Mercury
validates, Trey decides. Three AIs in their proper roles — Mercury is in-house,
grounded, and can cite file:line for every claim.
