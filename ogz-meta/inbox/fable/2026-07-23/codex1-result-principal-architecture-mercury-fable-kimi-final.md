# Principal Systems Architecture Review — Mercury + Fable + Kimi Final

Author: Kimi K3 final synthesis over Mercury + Fable reports
Mode: direct Moonshot API, no repo tools; supplied artifacts only
Prompt: ogz-meta/inbox/fable/2026-07-23/principal-systems-architecture-review-kimi-final-prompt.md
Mercury source: ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-architecture.md
Fable source: ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-fable.md
Raw receipt: ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-fable-kimi-final.raw.json
Model: kimi-k3
Usage: {"prompt_tokens":15354,"completion_tokens":10450,"total_tokens":25804}
# KIMI K3 FINAL ARCHITECTURE SYNTHESIS
## OGZPMLV2 Principal Systems Architecture Review — Fourth-Eye Consolidation

**Synthesis Date:** 2026-07-23  
**Authoritative Repository:** `/opt/ogzprime/OGZPMLV2` @ `codex/multi-asset-symbol-state`  
**Evidence Base:** Original prompt, Mercury tool-backed report, Fable max-effort review  
**Synthesis Method:** Adversarial reconciliation, evidence-weighted arbitration, gap-preserving consolidation

---

## 1. EVIDENCE LIMITS

### 1.1 What I Can Verify From Supplied Artifacts

**Directly evidenced in both reports (high confidence):**
- File paths, line numbers, and code behavior cited identically by Mercury and Fable
- Configuration structures in `mercury.config.json`, `config.js`
- Tool registry shape in `tool-adapter.js`
- Test file existence and coverage areas
- MongoDB collection names and document counts (Fable verified live; Mercury implied)

**Evidenced in Fable only (medium-high confidence):**
- Live MongoDB state (10,329 active chunks, 42,117 stale 768-dim chunks, zero active traces)
- KillSwitch flag active on disk since 2026-07-23 05:11 UTC
- PM2 process architecture (four apps including live trader)
- `.claude/settings.json` hook wiring and empirical enforcement during Fable's review
- Git history (1,877 commits, branch divergence)
- `fixes.jsonl` (90 incident receipts)
- Legacy Mongo collections (`chunks_local_nomic_refresh_20260603`)

**Evidenced in Mercury only (lower confidence due to Fable's refutations):**
- Specific line ranges in `config.js:130-160` for ignore parsing
- `trace-memory.js:61-63` quality score formula (Fable confirmed at `:60-63`)
- `run-ledger.js:8-18` directory validation logic (Fable confirmed at `:12-18`)

### 1.2 What Neither Report Could Verify

**Explicitly labeled gaps:**
- GitHub mirror state vs VPS checkout (directive declares VPS authoritative; not independently verified)
- Sourcegraph deployment status (no on-VPS infrastructure found; OAuth unavailable)
- Runtime PM2 process state (read-only contract forbade inspection)
- The 972 KB Fable raw stream in `ogz-meta/inbox/fable/2026-07-23/` (not read)
- Legacy Mongo collection contents (counted, not sampled)
- The advisor tool (disabled for both agents)

**Fable-specific gaps:**
- `ogz-meta/cognition-history/mercury-runs/2026-07-23.jsonl:2` (read-protected by claude-bridge ignore policy; metadata taken from run directive)
- `ask.js`, `react-loop.js`, `indexer.js` internals (agent-summarized, not read line-by-line by Fable)

**Mercury-specific blind spots (structural, confirmed by Fable):**
- `.claude/` and `ogz-meta/cognition/` excluded by `mercury.ignore:17,24` — Mercury could not see the enforcement plane it concluded "does not exist"
- Adversarial review subsystem (`adversarial-review.js`)
- `rule_scan` engine with incident-derived rules
- KillSwitch existence and unwired state
- `run_check` sandbox and mutation detector
- Run-ledger receipt schema binding to `head_sha`

### 1.3 Evidence Conflicts Requiring Arbitration

| Claim | Mercury | Fable | Resolution |
|-------|---------|-------|------------|
| `MERCURY_RUN_LEDGER_DIR` exfiltration risk | "Can redirect logs outside repo" | "Rejects absolute paths and `..` segments" | **Fable correct** — Mercury cited `run-ledger.js:12-18` while claiming the opposite of what the code does |
| Trace threshold configurability | "Hard-coded, cannot be tuned" | "All five knobs load from `mercury.config.json:44-53`" | **Fable correct** — only the quality *formula* is code, thresholds are config |
| Write-access risk | "Malicious tool could write bypassing guard" | "18 tools, zero write/edit/patch primitives" | **Fable correct** — Mercury's claim refuted by tool registry inspection |
| Ownership enforcement | "No explicit ownership model" | "Eight hook events wired to fail-closed gates" | **Fable correct at tool layer** — Mercury blind to `.claude/` enforcement |
| Mongo workload mixing | "Read-heavy retrieval + write-heavy trace" | "Trace capture manual-only, zero active traces" | **Fable correct** — trace layer is dormant |
| BM25 rebuild per query | Performance concern | Confirmed and quantified (250 MB/query) | **Both correct** — Fable adds measurement |
| Quality score lacks correctness | Identified | Confirmed | **Both correct** |

### 1.4 Structural Evidence Quality Assessment

**Mercury's report:**
- 15/15 tool calls succeeded (per run directive)
- Citations mangled (`【open_file†L70-L124】` tool-handle artifacts)
- Reviewed an engineering runtime whose governance layer was excluded by its own safety contract
- `--architecture` mode shipped the day before the run (`cf9ec3d9`, 2026-07-23)
- 7,750-token output cap mismatched to 18-deliverable prompt

**Fable's review:**
- Eight bridge files read verbatim
- Live MongoDB interrogated
- Hook enforcement empirically probed (gates fired during review)
- Three parallel subagent sweeps with file:line citations
- $17.09 cost reported
- Some agent-summarized evidence for `ask.js`/`react-loop.js` internals

**Confidence weighting:** Where reports conflict, Fable's evidence is stronger due to: (a) empirical verification of enforcement gates, (b) live database queries, (c) Mercury's structural blindness to the enforcement plane, (d) Mercury's citation format violations.

---

## 2. MERCURY VS FABLE RECONCILIATION

### 2.1 Where Fable Corrects Mercury (Adopted)

| Mercury Claim | Fable Correction | Synthesis Position |
|---------------|------------------|-------------------|
| Run-ledger directory exfiltration risk | Code rejects absolute paths; Mercury cited the lines while misreading them | **Adopt Fable** — no exfiltration vector via `MERCURY_RUN_LEDGER_DIR` |
| Trace thresholds hard-coded | All thresholds load from `mercury.config.json`; only formula is code | **Adopt Fable** — narrow kernel (formula) survives, broad claim refuted |
| Write-access bypass possible | Tool registry has zero write primitives; `run_check` sandboxed with mutation detector | **Adopt Fable** — claimed vector does not exist |
| No ownership model | Eight hook events enforce read-before-edit, protected surfaces, attack-framing, finish-gate | **Adopt Fable** — Mercury was structurally blind to enforcement plane |
| Mongo workload mixing | Trace capture manual-only; zero active traces; trading runtime Mongo-free | **Adopt Fable** — concern is theoretical, not operational |
| Store is naive, no interface | `MongoStore` is the seam with five-field embedding-identity lane scoping | **Partially adopt Fable** — seam exists; formalizing interface is still worthwhile |
| Ignore list static, no runtime enforcement | Per-call enforcement; name-based matching covers new directories automatically | **Adopt Fable** — Mercury misunderstood the matching semantics |

### 2.2 Where Mercury Survives Fable's Critique (Retained)

| Mercury Finding | Fable Assessment | Synthesis Position |
|-----------------|------------------|-------------------|
| BM25 rebuilt per query | Confirmed and quantified (250 MB/query full fetch) | **Retain** — this is the dominant performance issue |
| Quality score lacks correctness term | Confirmed (`iterations*10 + latency/1000`) | **Retain** — fast-wrong can replace slow-right within dedup band |
| Formal store interface worth extracting | Agreed as "cheap insurance" | **Retain** — name the seam `VectorStore` |
| Per-call structured error codes absent | Confirmed — ReAct loop cannot branch on `POLICY_BLOCKED` vs `RUNTIME_ERROR` | **Retain** — add error-code enum |
| Policy drift between parallel lists | Confirmed in spirit — two ignore contracts exist with no drift test | **Retain** — add synchronization test |
| Redaction lists pattern-brittle | Confirmed — novel secret format would pass | **Retain** — acceptable residual, document |
| Config-schema validation (ajv) | Agreed as "marginal but cheap upgrade" | **Retain** — adopt |
| Signed/append-only receipt hardening | Agreed, right-sized | **Retain** — hash-chaining + session signature |
| Canary/feature-flag rollout | Agreed, matches repo discipline | **Retain** — adopt |

### 2.3 Where Fable Adds New Findings (Incorporated)

| Finding | Evidence | Synthesis Position |
|---------|----------|-------------------|
| **KillSwitch unwired** | `killswitch.flag` active on disk; only test callers for `isKillSwitchOn()`/`throwIfActive()`; `AuthFailureGuard.js:111` is writer-only | **Critical** — this is the "green tests that failed to prove intended invariants" failure class, live, in the highest-stakes subsystem |
| **250 MB/query retrieval cost** | `fetchAllForScoring()` ships all active chunks (embedding + text) out of Mongo; design comment "fine at ~3000 chunks" outgrown 13× | **Critical** — dominant latency term, not BM25 CPU |
| **42,117 stale 768-dim chunks (80% of collection)** | Live Mongo query | **High** — lane GC needed |
| **Sandbox residuals** | `run_check` symlinks live `node_modules`; non-inline node scripts lack `--permission` scoping; mutation detector uses `--untracked-files=no` | **High** — three cheap, targeted hardening fixes |
| **Adversarial review default-off** | `consensus.defaultEnabled:false` and `adversarialReview.defaultEnabled:false` | **High** — cross-family check is opt-in exactly where it matters most |
| **Self-review blindness** | `mercury.ignore` excludes `.claude/` and `ogz-meta/cognition/` — the enforcement plane | **High** — governance reviews need bounded sight line |
| **Document drift** | Mermaid charts last touched 2026-02-10 (5 months, ~1,150 commits stale); CLAUDE.md stale on Mercury scope; README drifts; `package.json` `main` points at legacy entrypoint | **Medium** — standing hallucination sources |
| **CI gap** | GitHub Actions runs secrets-scan, smoke, patterns, 30-second startup probe — not the 177-file Jest suite | **Medium** — green CI proves far less than green local `npm test` |
| **Main branch divergence** | Working branch 1,150 commits ahead, 0 behind | **Medium** — doctrine says work on main; reality differs |

### 2.4 Where Fable Critiques Mercury's Recommendations (Adopted)

| Mercury Recommendation | Fable Critique | Synthesis Position |
|------------------------|----------------|-------------------|
| Buy Qdrant/Pinecone/Weaviate | "Enterprise reference architecture transplanted onto single-VPS, single-operator system"; bottleneck is 250 MB/query fetch, not ANN recall at 10k vectors | **Adopt Fable** — defer; fix in place, embedded if needed |
| Buy OPA | "Claude-bridge gates plus declarative JSON rule files *are* the policy engine — versioned, tested, self-protecting" | **Adopt Fable** — reject for now; adopt drift test instead |
| Buy Elastic/Splunk | "Receipts are line-cited JSONL; `substrate-digest.js` already aggregates them; jq + digest covers one operator" | **Adopt Fable** — reject |
| Buy Vault | "Config already indirects keys through named env vars and refuses credentials in URLs" | **Adopt Fable** — reject; adopt `sops`/`age` if desired |
| FAISS for trace similarity | "Cap is 10,000 traces; current count is zero; brute cosine is microseconds at that scale" | **Adopt Fable** — reject; wire capture first |

### 2.5 Reconciliation Summary

**Mercury's contribution:**
- Identified the retrieval performance problem (correct direction, understated magnitude)
- Identified the trace quality correctness gap
- Identified the need for structured error codes
- Identified policy drift risk between ignore contracts
- Provided initial build-vs-buy framework

**Fable's contribution:**
- Corrected Mercury's factual errors with empirical evidence
- Quantified the retrieval cost (250 MB/query)
- Discovered the KillSwitch unwired invariant (critical)
- Discovered the sandbox residuals
- Discovered the adversarial review default-off gap
- Provided right-sized build-vs-buy analysis grounded in measured scale
- Identified Mercury's structural blindness as the root cause of its errors

**Net assessment:** Fable's review is substantially more accurate and complete. Mercury's report suffered from: (a) structural blindness to the enforcement plane, (b) dispatch design mismatch (18 deliverables in one prompt), (c) citation format violations, (d) enterprise-pattern recommendations mismatched to actual scale. However, Mercury's core technical findings (retrieval cost, quality correctness, error codes, policy drift) survive and are incorporated.

---

## 3. FINAL ARCHITECTURE

### 3.1 The Six-Plane Model (Evidence-Grounded)

The architecture that survives both reviews is a **six-plane system** where doctrine is compiled into fail-closed gates, verification is evidence-bound and read-only, receipts bind every run to repository state, and human approval is recorded state separate from execution.

```
┌─────────────────────────────────────────────────────────────────┐
│ Plane 5: GOVERNANCE                                             │
│ Human approval as recorded state · claudito commands · doctrine │
├─────────────────────────────────────────────────────────────────┤
│ Plane 4: KNOWLEDGE                                              │
│ Lane-isolated RAG · Serena AST · rule_scan · trace memory       │
├─────────────────────────────────────────────────────────────────┤
│ Plane 3: EVIDENCE/RECEIPTS                                      │
│ Run-ledger JSONL · fixes.jsonl · cognition-history · sessions   │
├─────────────────────────────────────────────────────────────────┤
│ Plane 2: VERIFICATION                                           │
│ Mercury-2 ReAct loop · adversarial review · answer-quality gates│
├─────────────────────────────────────────────────────────────────┤
│ Plane 1: ENFORCEMENT                                            │
│ claude-bridge hooks · ignore policies · finish-gate · pre-bash  │
├─────────────────────────────────────────────────────────────────┤
│ Plane 0: PRODUCT RUNTIME                                        │
│ PM2 apps · trader (LIVE) · dashboard · Stripe · supervisor      │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Plane 0: Product Runtime

**What exists:**
- PM2 runs four apps (`ecosystem.config.js`):
  - Trader (`run-empire-v2.js`, 3,339 lines, `LIVE_TRADING=true`, `BROKER=alpaca`, five symbols)
  - Dashboard/websocket server
  - Stripe integration
  - Supervisor daemon
- Hot path: `core/` (OrderExecutor 4,869 lines, StateManager 3,995), `brokers/`, `modules/`, `run-empire-v2.js`
- Mongo-free by design (grep confirms no Mongo client in `core/`, `brokers/`, `modules/`)

**Critical gap:**
- KillSwitch declared (`core/KillSwitch.js:8-9`: "blocks ALL order execution") but unwired
- `killswitch.flag` active on disk since 2026-07-23 05:11 UTC (tripped by `AuthFailureGuard.js:111` after nine Alpaca auth failures)
- Only test callers for `isKillSwitchOn()`/`throwIfActive()` — no production read-side consumers

**Architecture decision:**
- **Preserve** the PM2 process separation and Mongo-free hot path
- **Repair** the KillSwitch read-side wiring as Phase 0 (highest priority)

### 3.3 Plane 1: Enforcement

**What exists:**
- `trai_brain/claude-bridge/` compiled doctrine into fail-closed PreToolUse/Stop gates:
  - Reads blocked on ignore-policy paths
  - Edits blocked unless file was Read this session (`pre-edit.js:63-73`)
  - Bash blocked on mutation/redirect/inline-runtime patterns (`pre-bash.js:24-31`)
  - Mercury dispatches rejected unless attack-framed (`pre-bash.js:31-41` + `shared/break-my-fix-frame.js`)
  - Session close blocked until every hot-path edit carries diff-fingerprinted adversarial Mercury proof and green P0 gate (`finish-gate.js:266-303`)
- Self-protecting stack (`policy.js:20-31`)
- Eight hook events wired in `.claude/settings.json`

**Empirical validation:**
- Gates fired repeatedly during Fable's review (blocks respected, not bypassed)
- This is the repo's answer to "freehand engineering does not scale"

**Architecture decision:**
- **Preserve** the hook-based enforcement plane — it demonstrably works
- **Extend** with drift test between `mercury.ignore` and `ignore-policy.json`
- **Repair** document drift in CLAUDE.md and doctrine files

### 3.4 Plane 2: Verification

**What exists:**
- Mercury-2 (Inception Labs) in ReAct loop:
  - 60-iteration/7,750-token caps pinned so flags can only restate config (`ask.js:203-210`)
  - 18 read-only tools including sandboxed `run_check` proof execution
  - Answer-quality gates flagging uncited claims (`react-loop.js:32-192`)
  - Optional cross-family adversarial reviewer (currently Kimi-k3 via Moonshot, `mercury.config.json:64-77`)
  - Two-recheck loop with structured verdict protocol
- Five LLM providers supported (`config.js:310`)

**Critical gaps:**
- `consensus.defaultEnabled:false` and `adversarialReview.defaultEnabled:false` — cross-family check is opt-in exactly where it matters most
- Mercury's structural blindness to `.claude/` and `ogz-meta/cognition/` (excluded by `mercury.ignore:17,24`)

**Architecture decision:**
- **Preserve** the multi-provider abstraction and ReAct loop discipline
- **Repair** adversarial review default to on for hot-path attack scopes
- **Extend** with bounded self-review lane for governance missions

### 3.5 Plane 3: Evidence/Receipts

**What exists:**
- Every Mercury run writes redacted, schema-versioned JSONL receipt binding:
  - Prompt hash
  - Branch
  - `head_sha`
  - Dirty-state
  - Tool telemetry
  - Artifacts
  - Verdict (`run-ledger.js:217-290`)
- `fixes.jsonl` (90 incident receipts feeding UserPromptSubmit hook as prior-fix context)
- 45 `cognition-history/` receipt families
- 51 append-only session docs
- `run_check` execution artifacts

**Architecture decision:**
- **Preserve** the JSONL receipt format and append-only discipline
- **Extend** with daily hash-chaining and session-end signature (right-sized tamper-evidence)
- **Repair** redaction list brittleness (document as acceptable residual)

### 3.6 Plane 4: Knowledge

**What exists:**
- Lane-isolated RAG:
  - 10,329 active chunks
  - Hybrid BM25+cosine+RRF with literature constants cited in code (`config.js:264-270`)
  - Five-field embedding-identity lane scoping (`mongo-store.js:20-29`)
  - Fail-closed asserts on every fetched chunk (`mongo-store.js:218-239`)
- Serena AST tools (four tools)
- Incident-derived `rule_scan` rules (`tool-adapter.js:505-614`, rules carrying `prevents` and `source_incident` fields)
- Trace memory (designed well, operationally dormant — zero traces in active collection, 479 stranded in legacy)

**Critical gaps:**
- 250 MB/query full fetch (`fetchAllForScoring()` ships all active chunks out of Mongo)
- BM25 index rebuilt from scratch per query (`searcher.js:270, :306`)
- 42,117 stale 768-dim chunks (80% of collection)
- Design comment "fine at ~3000 chunks" (`mongo-store.js:11`) outgrown 13×

**Architecture decision:**
- **Preserve** the lane-isolation and identity-assertion discipline
- **Repair** retrieval operating point (in-store scoring, persisted BM25 stats, lane GC)
- **Repair** trace memory by wiring verdict feedback, then enable auto-capture
- **Extend** Serena with tree-sitter migration (spec exists at `ogz-meta/specs/serena-tree-sitter-migration.md`)

### 3.7 Plane 5: Governance

**What exists:**
- Human approval as recorded state separate from execution (`approve.js` → `--execute`)
- 26 claudito slash commands
- 27 advisory hookify rules
- Doctrine docs
- NO-CODE-WITHOUT-APPROVAL law

**Critical gaps:**
- 4,276-session, single-human governance loop — every gate ultimately routes to one person's attention
- Document drift (mermaid charts 5 months stale, CLAUDE.md stale on Mercury scope, README drifts)

**Architecture decision:**
- **Preserve** the approval-as-state separation and claudito command surface
- **Repair** document truth via truth sweep
- **Extend** with bounded self-review lane to reduce cognitive load

---

## 4. OWNERSHIP BOUNDARIES

### 4.1 Enforced Boundaries (Evidence-Verified)

| Surface | Owner | Enforcement Point | Evidence |
|---------|-------|-------------------|----------|
| Mercury runtime tunables, caps, prompts | `mercury.config.json` | Sole authority; env cannot override; CLI flags must equal config or throw | `ask.js:203-210`; `test/mercury-llm-config-contract.test.js:71,:538` |
| Mercury's repo visibility | `mercury.ignore` | Name-based, per-call enforcement | `config.js:130-166`; `tool-adapter.js:229-239`; `mercury-index-scope.test.js:208-614` |
| Claude's repo visibility + mutation rights | `trai_brain/claude-bridge/ignore-policy.json` + `policy.js` | Hooks in `.claude/settings.json` | `policy.js:107-129`; empirical blocks during Fable's review |
| Repo I/O for Mercury | `tool-adapter.js` | Single choke point, read-only registry (18 tools, zero write primitives) | `tool-adapter.js:1689-1848` |
| Chunk lifecycle + index identity | `indexer.js` + `mongo-store.js` | Lane scoping; `ogz-meta` eligibility hard-coded to TheDoctrine + specs | `mongo-store.js:20-29,:218-239`; `indexer.js:30-79` |
| Investigation discipline + answer quality | `react-loop.js` | Iteration caps, evidence gates | `react-loop.js:32-192,:516` |
| Receipts | `run-ledger.js` | Repo-relative only, redacted, append-only | `run-ledger.js:12-18,:299-324` |
| Mission state | `approve.js`/`reject.js` + `manifests/` | Approval is state; execution is separate explicit step | `approve.js:67-84` |
| Session close | `finish-gate.js` | Proof-or-block | `finish-gate.js:266-303,:358-360` |
| Emergency halt | `core/KillSwitch.js` | **Declared owner with no read-side consumers** | Repo-wide grep; `AuthFailureGuard.js:43,:111` is writer-only |
| Human law | `CLAUDE.md` + doctrine docs + hookify advisories | Advisory only | Stale in places |

### 4.2 Boundary Defects Requiring Repair

| Defect | Evidence | Repair |
|--------|----------|--------|
| KillSwitch unwired | Only test callers for `isKillSwitchOn()`/`throwIfActive()` | Add `throwIfActive()` at OrderExecutor submit path + supervisor check |
| Two ignore contracts drift-untested | `mercury.ignore` vs `ignore-policy.json` with deliberately different allowances | Add drift test asserting divergence only on explicit allowlist |
| Enforcement code cohabitation | `trai_brain/` contains claude-bridge beside unrelated legacy TRAI Python/GGUF subsystem | Document boundary; consider extraction |
| Duplicated bridge copies | `_1`/`_2`-suffixed copies in `ogz-meta/` | Remove duplicates |
| Main branch ownership nominal | Doctrine says work on main; reality is working branch 1,150 commits ahead | Resolve branch strategy |

---

## 5. DATA FLOW AND INVARIANTS

### 5.1 Dispatch Flow (Corrected)

```
operator/claudito prompt
  → UserPromptSubmit hook (prior-fixes injection from fixes.jsonl)
  → ask.js (flags pinned to config)
  → query-router (heuristic mode/boost/starter-context policy)
  → embedText → retrieveTopK
      [lane-scoped fetch → cosine + BM25 → RRF → kind/content boosts]
  → runReactLoop:
      system prompt + starter context + trace hint (if any) + Serena auto-blast
      loop ≤60: Mercury-2 tool_calls → tool-adapter (boundary-checked) → results
  → answer-quality gates (citation/proof flags)
  → optional Fable adversarial review (Kimi-k3) → ≤2 bounded rechecks
  → run-ledger receipt (redacted, head_sha-bound, verdict-classified)
  → artifacts to cognition-history/ · report to inbox/
  → human curation → specs/ → reindex
```

### 5.2 Invariants With Enforcement Points

| # | Invariant | Enforcement Point | Test Status |
|---|-----------|-------------------|-------------|
| 1 | All file access resolves inside repo root | `tool-adapter.js:198-208` | Tested |
| 2 | Ignored directory names block reads/lists/chunks/diffs per call | `tool-adapter.js:147-151,:229-239` | Tested (`mercury-index-scope.test.js:208-614`) |
| 3 | Every retrieved chunk must match active embedding lane and dimension | `mongo-store.js:218-239` | Tested |
| 4 | Retrieval refuses to serve any ignored path (forces reindex) | `searcher.js:39-47` | Tested |
| 5 | `run_check` cannot mutate live repo: no shell, argv-only, no absolute paths, snapshot cwd, git read-only allowlist, sanitized env, before/after tracked-status check | `tool-adapter.js:1135-1275` | Tested (:720, :774) — **residuals exist** |
| 6 | Caps cannot be widened at dispatch time | `ask.js:203-210` | Tested |
| 7 | Only successful, explicitly-requested, evidence-grounded investigations teach | `trace-memory.js:69-83` | Tested ("failed investigations never teach") |
| 8 | Receipts are repo-relative, secret-redacted, append-only, bound to `head_sha` + prompt hash | `run-ledger.js:12-18,:40-65,:242` | Tested |
| 9 | Hot-path edits require prior Read, adversarial Mercury proof, green P0 gate before session close | `pre-edit.js:63-73`, `finish-gate.js:266-303` | Empirically enforced |
| 10 | Mercury dispatches must be attack-framed | `pre-bash.js:31-41` | Empirically enforced |
| 11 | **BROKEN:** Kill switch blocks all order execution | Declared (`KillSwitch.js:8-9`), written (`AuthFailureGuard.js:111`), **never read in production** | **No wire** |

### 5.3 Sandbox Residuals (Requiring Hardening)

| Residual | Evidence | Risk |
|----------|----------|------|
| `run_check` symlinks live `node_modules` | `tool-adapter.js:1128-1131` | Sandboxed script writing there crosses boundary |
| Non-inline node scripts lack `--permission` fs scoping | Only inline eval gets scoping (`:1177-1186`) | Script-file runs have broader fs access |
| Mutation detector uses `--untracked-files=no` | `tool-adapter.js:1019` | New-file creation on live side is invisible |

---

## 6. BUILD VS BUY

### 6.1 Reconciled Analysis

| Capability | Mercury Verdict | Fable Verdict | Final Synthesis | Reasoning |
|------------|-----------------|---------------|-----------------|-----------|
| Vector store | Buy Qdrant/Pinecone | Defer; fix in place | **Defer; fix in place, embedded if needed** | Bottleneck is 250 MB/query fetch, not ANN recall at 10k vectors. First: in-store scoring + BM25 stats persisted + lane GC. If 10× scale: `sqlite-vec` or LanceDB behind `VectorStore` seam — zero new daemons. |
| Trace similarity | FAISS + Mongo split | Reject | **Reject** | Cap is 10,000 traces; current count is zero. Brute cosine is microseconds at that scale. Wire capture first. |
| Policy engine | Buy OPA | Reject for now | **Reject for now** | Claude-bridge gates + declarative JSON rule files *are* the policy engine — versioned, tested, self-protecting. OPA earns complexity with multiple operators/services. Adopt drift test instead. |
| Log/observability | Buy Elastic/Splunk | Reject | **Reject** | Receipts are line-cited JSONL; `substrate-digest.js` aggregates. jq + digest covers one operator. If outgrown: SQLite ingest, daemon-free. |
| Secrets | Vault + schema | Reject; adopt cheap half | **Reject Vault; adopt ajv + sops/age** | Config already indirects keys through named env vars, refuses credentials in URLs. JSON-Schema validation: adopt. Rotation/encryption: `sops`/`age` if desired. |
| Receipt integrity | git-notes/GPG | Adopt, right-sized | **Adopt, right-sized** | Daily hash-chaining + session-end signature (minisign). Aligns with in-toto/SLSA thinking without machinery. |
| Repo intelligence | (not addressed) | Build on existing | **Build on existing** | tree-sitter in devDependencies with migration spec. Finish Serena migration. Sourcegraph remains external augment. |
| Orchestration | (implicit) | Reject Temporal/LangGraph | **Reject workflow engines** | Deterministic value delivered by hooks + Node scripts + JSONL state — inspectable, replayable, greppable. Workflow engine adds daemon + abstraction layer. |
| LLM layer | (n/a) | Keep multi-provider | **Keep** | Five providers supported, identity-asserted clients, cross-family reviewer. Portable "engineering OS" contract working. |
| CI | (n/a) | Extend GitHub Actions | **Extend** | Add full Jest suite (or tiered subset) rather than buying. |

### 6.2 Build Vs Buy Decision Framework

**Buy when:**
- Multiple operators/services require the capability
- Daemon operational cost is justified by scale
- Existing solution is mature and matches requirements exactly

**Build when:**
- Single operator, single VPS
- Existing hooks/scripts already deliver the value
- Daemon adds operational surface without matching problem
- Doctrine can be compiled directly into gates

**Defer when:**
- Current scale doesn't justify the solution
- Seam exists for later adoption
- Fix-in-place addresses the immediate bottleneck

---

## 7. TOP ARCHITECTURE RISKS

### 7.1 Critical Risks (Immediate Action Required)

| Risk | Evidence | Impact | Mitigation |
|------|----------|--------|------------|
| **KillSwitch unwired** | Flag active on disk; only test callers; `AuthFailureGuard.js:111` writer-only | Live trading continues despite declared halt invariant | Phase 0: Add `throwIfActive()` at OrderExecutor submit path + supervisor check |
| **250 MB/query retrieval cost** | `fetchAllForScoring()` ships all chunks; design assumption outgrown 13× | Dispatch latency dominates; will degrade further | Phase 1-2: Lane GC, in-store scoring, persisted BM25 stats |
| **Adversarial review default-off** | `consensus.defaultEnabled:false`, `adversarialReview.defaultEnabled:false` | Cross-family check opt-in exactly where it matters most | Config flip: default-on for hot-path attack scopes |

### 7.2 High Risks (Near-Term Action)

| Risk | Evidence | Impact | Mitigation |
|------|----------|--------|------------|
| **Sandbox residuals** | node_modules symlink, non-inline node fs scope, untracked-file blindness | Sandboxed script could cross boundary | Phase 3: Three targeted hardening fixes |
| **Trace quality inversion** | `iterations*10 + latency/1000` ignores correctness | Fast-wrong replaces slow-right within dedup band | Phase 4: Feed ledger verdict into quality score |
| **Self-review blindness** | `mercury.ignore` excludes `.claude/` and `ogz-meta/cognition/` | Governance reviews structurally impossible | Phase 6: Bounded self-review lane |
| **Document drift** | Mermaid charts 5 months stale; CLAUDE.md stale on Mercury scope | Standing hallucination sources | Phase 7: Truth sweep |

### 7.3 Medium Risks (Planned Action)

| Risk | Evidence | Impact | Mitigation |
|------|----------|--------|------------|
| **CI gap** | GitHub Actions doesn't run 177-file Jest suite | Green CI proves far less than green local test | Phase 7: Add tiered test suite to CI |
| **Policy drift** | Two ignore contracts with no drift test | Contracts could diverge unintentionally | Phase 6: Drift test |
| **Redaction brittleness** | Pattern-based; novel secret format would pass | Credential leakage | Document as acceptable residual |
| **Main branch divergence** | 1,150 commits ahead, 0 behind | Doctrine/reality mismatch | Resolve branch strategy |

### 7.4 Systemic Risks (Architectural)

| Risk | Evidence | Impact | Mitigation |
|------|----------|--------|------------|
| **Single-human governance loop** | 4,276 sessions; every gate routes to one person | Decision volume scaling limit | Reduce cognitive load per decision; cannot eliminate |
| **Determinism at temperature 0.8** | Mercury-2 runs at 0.8 (`mercury.config.json:62`) | "Deterministic wherever practical" stops at model boundary | Receipts give replayability of evidence, not reasoning |
| **Right-sizing bet** | Rejecting Qdrant/OPA/Elastic assumes staying small | Retrofitting under load is worse | `VectorStore` seam and drift tests are hedges |

---

## 8. MIGRATION ROADMAP

### 8.1 Phase 0: Safety Wire (Hot Path, Smallest Possible Diff)

**Goal:** Wire the declared-but-dead KillSwitch invariant

**Steps:**
1. Add `killSwitch.throwIfActive()` at OrderExecutor order-submission choke point
2. Add supervisor-daemon flag check
3. Jest contract test asserting active flag prevents order placement end-to-end
4. Decide current flag's disposition (active since 2026-07-23 05:11 UTC)

**Gate:** P0 law with Mercury attack pass

**Risk:** Can halt live trading on false positive; wire must land with threshold review and explicit operator-unlock runbook

### 8.2 Phase 1: Index Hygiene

**Goal:** Remove stale embedding lanes and legacy collections

**Steps:**
1. Snapshot current Mongo state
2. Drop non-active-lane chunks (42,117 docs)
3. Drop two legacy collections (~42k more docs)
4. Add lane-GC to indexer's post-run step
5. Fix `*_local_nomic` naming or document as lane-partitioned
6. Measure query latency before/after (golden-query set, ~20 prompts)

**Gate:** Golden-query results identical-or-better

### 8.3 Phase 2: Retrieval Scale

**Goal:** Eliminate 250 MB/query full fetch

**Steps:**
1. Persist BM25 doc-frequency stats at index time
2. Move cosine scoring in-store (Mongo aggregation) or adopt `sqlite-vec` behind named `VectorStore` interface
3. Formalize `VectorStore` seam with `search/upsert/clear` and lane identity as first-class parameter

**Gate:** p50 latency under 1s; golden-query results identical-or-better

### 8.4 Phase 3: Sandbox Hardening

**Goal:** Close three `run_check` residuals

**Steps:**
1. Replace node_modules symlink with read-only exposure
2. Extend `--permission` scoping to script-file node runs
3. Switch mutation detector to include untracked files
4. Extend `mercury-index-scope.test.js` for each

**Gate:** New tests pass; existing tests unchanged

### 8.5 Phase 4: Verification Depth

**Goal:** Wire verdict feedback and enable trace memory

**Steps:**
1. Feed ledger verdict + consensus outcome into trace quality score
2. Enable auto-capture behind existing guarded mode
3. Flip adversarial review default to on for hot-path attack scopes
4. Add second consensus provider rotation (Kimi + one other family) to decorrelate

**Gate:** Trace capture operational; adversarial review default-on

### 8.6 Phase 5: Receipts Hardening

**Goal:** Tamper-evident receipts

**Steps:**
1. Daily hash-chain field in run-ledger entries
2. Session-end signature (minisign)
3. Promote `substrate-digest` output into indexable specs surface

**Gate:** Hash chain verifiable; signatures valid

### 8.7 Phase 6: Governance Sight Line

**Goal:** Bounded self-review capability

**Steps:**
1. Create bounded self-review index lane + tool profile for runtime-review missions
2. Lane can read `.claude/`, `ogz-meta/cognition/`, `trai_brain/claude-bridge/` (excluding secrets and `session-state/`)
3. Add drift test asserting `mercury.ignore` and `ignore-policy.json` diverge only on explicit allowlist

**Gate:** Self-review lane operational; drift test passes

### 8.8 Phase 7: Truth Sweep + CI

**Goal:** Repair document drift and close CI gap

**Steps:**
1. Regenerate or retire mermaid charts (generated atlas from code preferred)
2. Update CLAUDE.md's Mercury-scope section
3. Fix README/package.json drifts
4. Dedupe `claude.md`
5. Remove `ogz-meta` bridge copies
6. Remove 10.2 MB committed zip
7. Bring full test suite (tiered) into CI
8. Resolve main-branch strategy

**Gate:** Documentation accurate; CI runs full suite

---

## 9. DECISIONS TREY MUST MAKE

### 9.1 Immediate (Blocking Phase 0)

| Decision | Context | Options |
|----------|---------|---------|
| **KillSwitch flag disposition** | Flag active since 2026-07-23 05:11 UTC (nine Alpaca auth failures) | (a) Clear flag and resume trading; (b) Keep flag and investigate root cause; (c) Wire read-side first, then decide |
| **Phase 0 approval** | Wiring KillSwitch makes previously inert flag lethal | (a) Approve with threshold review; (b) Approve with operator-unlock runbook; (c) Defer pending investigation |

### 9.2 Near-Term (Blocking Phases 1-4)

| Decision | Context | Options |
|----------|---------|---------|
| **Mongo lane GC approval** | 42,117 stale chunks (80% of collection) + 2 legacy collections | (a) Approve snapshot + drop; (b) Approve with retention period; (c) Defer |
| **Adversarial review default** | Currently opt-in; Fable recommends default-on for hot-path | (a) Flip to default-on; (b) Keep opt-in with documentation; (c) Gate by mission type |
| **Trace memory activation** | Currently dormant (zero active traces); wiring requires verdict feedback | (a) Wire and enable; (b) Delete layer; (c) Keep dormant |
| **Golden-query set adoption** | ~20 canonical prompts with expected top-K files | (a) Adopt as standing regression gate; (b) Adopt informally; (c) Defer |

### 9.3 Strategic (Blocking Phases 5-7)

| Decision | Context | Options |
|----------|---------|---------|
| **Self-review lane** | Bounded lane reading `.claude/` and `ogz-meta/cognition/` | (a) Approve with restrictions; (b) Reject (accept blindness); (c) Defer |
| **Receipt signing** | Daily hash-chain + session-end signature | (a) Adopt minisign; (b) Adopt GPG; (c) Reject |
| **Main branch strategy** | Working branch 1,150 commits ahead, 0 behind | (a) Merge to main; (b) Amend doctrine to name this branch as trunk; (c) Continue divergence |
| **CI scope** | Full Jest suite vs tiered subset | (a) Full suite; (b) Tiered; (c) Keep current |

### 9.4 Architectural (Ongoing)

| Decision | Context | Options |
|----------|---------|---------|
| **Right-sizing bet** | Rejecting Qdrant/OPA/Elastic assumes staying small | (a) Accept bet with hedges (`VectorStore` seam, drift tests); (b) Adopt enterprise stack now; (c) Revisit at scale trigger |
| **Determinism boundary** | Mercury-2 at temperature 0.8 | (a) Accept model boundary; (b) Investigate lower temperature; (c) Document as aspirational |
| **Single-human governance** | 4,276 sessions; decision volume scaling limit | (a) Accept with cognitive load reduction; (b) Add second operator; (c) Automate more decisions |

---

## 10. NEXT LANES

### 10.1 Immediate (This Week)

1. **Decide KillSwitch flag disposition** — it has been set since 2026-07-23 05:11 UTC; the bot's intended state needs Trey's call
2. **Approve Phase 0 read-side wire** — the one finding where paper and production disagree on a live-trading invariant
3. **Approve Mongo lane GC** — snapshot, then drop 42k stale-lane chunks + 2 legacy collections; capture before/after query latency as Phase 2 baseline

### 10.2 Near-Term (This Month)

4. **Adopt golden-query set** — ~20 canonical prompts with expected top-K files as standing retrieval-regression gate
5. **Flip adversarial review default-on for hot-path attack scopes** — config-only change, immediately reversible
6. **Run truth sweep as doc-only batch commit** — mermaid regeneration/retirement, CLAUDE.md Mercury-scope correction, README/package.json drifts, claude.md dedupe, ogz-meta bridge-copy removal

### 10.3 Strategic (This Quarter)

7. **Re-dispatch principal-architecture mission to Mercury as sectioned campaign** — one dispatch per section, each under one-question law with exact file:line scopes, using new self-review lane once it exists
8. **Add ignore-contract drift test and run_check sandbox-residual tests** — pure test additions, no runtime change, immediate invariant coverage
9. **Wire trace memory with verdict feedback** — feed ledger verdict into quality score, enable auto-capture behind guarded mode

### 10.4 Ongoing

10. **Monitor right-sizing bet** — if scale 10×s, revisit Qdrant/OPA/Elastic decisions
11. **Reduce single-human governance load** — each phase should reduce cognitive load per decision
12. **Maintain document truth** — Document Accuracy Rule enforcement

---

## APPENDIX: STRONGEST CRITICISMS OF THIS SYNTHESIS

1. **Reliance on Fable's evidence over Mercury's** — Fable's review is more thorough, but Mercury's report was structurally handicapped. A hostile reviewer should press on whether Fable's corrections are themselves complete.

2. **Right-sizing is a bet on staying small** — Rejecting Qdrant/OPA/Elastic assumes one operator, one VPS, ~10k chunks. If Houston/white-glove scaling arrives, several "defer" verdicts flip, and retrofitting under load is worse than adopting early.

3. **Phase 0 can halt live trading on a false positive** — Wiring the kill switch makes a previously inert flag lethal; a mis-threshold in AuthFailureGuard becomes an outage.

4. **The self-review lane reopens a closed attack surface** — History/receipt exclusion is prompt-injection defense; receipts contain adversarial text by design. A lane that reads them must be non-indexed, read-only, and used only under explicit mission type.

5. **This synthesis cannot verify the KillSwitch finding independently** — The finding rests on Fable's grep evidence. A future repo-tool pass should verify: (a) `isKillSwitchOn()`/`throwIfActive()` callers, (b) OrderExecutor submit path, (c) supervisor daemon check points.

6. **The roadmap does not solve the deepest process debt** — A 4,276-session, single-human governance loop. Every gate ultimately routes to one person's attention; the architecture reduces cognitive load per decision but not the decision volume.

7. **Determinism remains aspirational at temperature 0.8** — The verification gate runs Mercury-2 at 0.8; "deterministic wherever practical" currently stops at the model boundary.

---

## FINAL ANSWER

**If I inherited this engineering ecosystem today:**

**What I would preserve:**
- The six-plane shape — doctrine compiled into fail-closed gates, a read-only evidence-bound verifier, receipts binding every run to repo state, human approval as recorded state
- The hook-based enforcement plane — it demonstrably works, including against Fable during its review
- The multi-provider LLM abstraction — five providers, identity-asserted clients, cross-family reviewer
- The lane-isolated RAG with embedding-identity scoping
- The JSONL receipt format with `head_sha` binding
- The claudito command surface and approval-as-state separation

**What I would build differently:**
- Wire the declared-but-dead KillSwitch invariant (Phase 0)
- Fix the retrieval plane's outgrown operating point in place rather than buying a platform (Phases 1-2)
- Make the cross-family reviewer the default rather than the exception (Phase 4)
- Give the system a bounded way to see itself (Phase 6)

**Concrete technical steps:**
1. Add `killSwitch.throwIfActive()` at OrderExecutor submit path + supervisor check
2. Drop 42,117 stale 768-dim chunks + 2 legacy collections after snapshot
3. Persist BM25 stats at index time; move cosine scoring in-store
4. Close three `run_check` sandbox residuals
5. Feed ledger verdict into trace quality; enable auto-capture
6. Flip adversarial review default-on for hot-path scopes
7. Add daily hash-chain + session-end signature to receipts
8. Create bounded self-review lane with drift test
9. Run truth sweep on stale documentation
10. Bring full Jest suite into CI

**The clearest lesson of this exercise:** The verifier's blind spot, not the verifier's intelligence, is what made the Mercury report wrong. The architecture that survives is one where the enforcement plane is visible to governance reviews, where declared invariants are wired to production code, and where receipts bind every run to repository state.

---

**End of Kimi K3 Final Architecture Synthesis**
