# Principal Architecture Review Run Directive

This directive is prepended to the original principal architecture prompt for the
2026-07-23 rerun.

Do not stop at the first plausible architecture, first obvious tool result, or
first attractive framework answer. Use all available tools, repository evidence,
symbol search, file reads, git evidence, current docs, and model reasoning budget
needed to produce the correct supported answer.

The target repo is public on GitHub:

`https://github.com/CGP-ME/OGZPMLV2`

The authoritative local checkout is the VPS repo at `/opt/ogzprime/OGZPMLV2`
on branch `codex/multi-asset-symbol-state`. That checkout outranks GitHub if
they differ. Repository reality supersedes documentation, prompts, assumptions,
prior reports, and model memory.

Required posture:

- Build the answer from evidence, not from the first remembered pattern.
- Prefer current file paths, ownership boundaries, data flow, invariants, and
  failure modes over generic architecture advice.
- Label any evidence gap instead of inventing a repo fact.
- Keep investigating until the major plausible architecture shapes have been
  compared and rejected or retained with reasons.
- If recommending buy/build/replace, state why the recommendation survives this
  repo's current constraints.
- The output must be a full architecture review, not a short summary.


# KIMI FINAL SYNTHESIS TASK

You are Kimi K3, the fourth-eye/final synthesis seat. You do not have repo tools in this direct API pass. The VPS repo is authoritative, and the evidence available to you is the original user prompt, Mercury's tool-backed architecture report, and Fable's max-effort tool-backed architecture review.

Do not stop at the first plausible conclusion. Attack both reports, reconcile disagreements, preserve evidence limits, and produce the final evolved architecture answer. Do not invent file:line evidence outside the supplied artifacts. If a claim needs a future repo-tool pass, label it.

Required output:
1. Evidence Limits
2. Mercury vs Fable Reconciliation
3. Final Architecture
4. Ownership Boundaries
5. Data Flow And Invariants
6. Build Vs Buy
7. Top Architecture Risks
8. Migration Roadmap
9. Decisions Trey Must Make
10. Next Lanes

# ORIGINAL USER PROMPT

Principal Systems Architecture Review
Mission

You are acting as a Principal Systems Architect, AI Platform Architect, and Engineering Runtime Designer.

You are not reviewing code.

You are designing the next generation of an engineering runtime intended to support long-horizon AI-assisted software engineering.

The objective is to maximize:

Correctness
Auditability
Determinism
Architectural integrity
Engineering throughput
Repository understanding
Verification quality
Reproducibility
Human trust
Long-term maintainability

This is not a greenfield project.

This is the evolution of an existing engineering ecosystem that has been built through extensive iteration, failures, debugging, architectural redesign, and operational lessons.

Repository

Repository:

https://github.com/CGP-ME/OGZPMLV2

Primary Branch:

codex/multi-asset-symbol-state

Read the repository broadly.

Do not assume documentation is correct.

Repository reality supersedes documentation.

Repository reality supersedes prompts.

Repository reality supersedes assumptions.

Context

Over the course of development, numerous engineering systems, guardrails, verification layers, prompts, runtime components, orchestration layers, receipts, memory systems, and engineering tools have been built.

These were not created because they were architecturally elegant.

They were created because specific engineering failures occurred.

Every system below exists because it solved, or attempted to solve, a real failure mode encountered during development.

Treat these systems as available engineering assets.

They are not architectural commitments.

You are free to:

retain them
modify them
merge them
decompose them
extract them
replace them
delete them
recommend existing open-source alternatives
recommend commercial alternatives
recommend entirely different approaches

Do not preserve anything merely because it already exists.

Existing Engineering Assets

For each system below, assume the following information will be supplied:

Technical purpose
Internal architecture
Current implementation
Existing capabilities
Known limitations
Failure mode(s) it was originally designed to address
Current operational maturity
Current prompts
Current tooling
Current integrations
Current repository location

Examples include (but are not limited to):

Mercury

Repository-grounded engineering verification system.

Current capabilities include, but are not limited to:

Canonical repository RAG
Multi-vector semantic retrieval
Repository indexing
Cross-module reasoning
Symbol-aware engineering search
Repository-grounded responses
Adversarial engineering analysis
Bug-class hunting
Architectural contract verification
Ownership verification
Configuration authority analysis
Repository evidence retrieval
Session-aware engineering reasoning
Receipt consumption
Long-context engineering support

Current limitations and implementation details will be provided.

Clauditos

Bounded specialist engineering workers.

Current capabilities include:

Narrowly scoped engineering tasks
Structured outputs
Limited-context execution
Independent task execution
Intermediate engineering artifact generation
Isolation from unrelated work
Specialized engineering responsibilities

Current limitations and implementation details will be provided.

Repository Receipts

Durable engineering evidence system.

Current capabilities include:

Repository mutation history
Engineering decision recording
Process evidence
Mission evidence
Engineering replay
Historical context
Engineering traceability

Current implementation details will be provided.

Engineering Memory

Current capabilities include:

Project memory
Session memory
Engineering doctrine
Architecture history
Repository history
Long-term engineering context

Implementation details will be provided.

Repository Intelligence

Current capabilities include:

Semantic search
Embeddings
Symbol graph
Repository graph
Cross-reference analysis
Architecture indexing
Code intelligence

Implementation details will be provided.

Runtime / Orchestration

Current capabilities include:

Tool execution
Mission execution
Capability routing
Repository interaction
Testing
Session persistence
Multi-model interaction
Engineering workflows

Implementation details will be provided.

Additional Systems

Additional prompts, tooling, automation, verification systems, engineering utilities, orchestration layers, guardrails, doctrine, and runtime components will also be supplied.

Treat every one of them as engineering inventory.

Not architectural truth.

Engineering Philosophy

The goal of this project is not to build autonomous coding agents.

The goal is to build a portable engineering operating system capable of producing trustworthy software regardless of which language models participate.

Language models are replaceable.

The engineering process is the durable asset.

Fundamental Engineering Requirement

One of the primary lessons learned during development is that freehand engineering does not scale.

The repository must never again evolve primarily through undocumented, one-off, discretionary edits performed independently by humans or AI.

Instead:

Meaningful repository mutations should emerge from defined engineering processes that are:

inspectable
replayable
attributable
continuously optimized
evidence-producing
receipt-generating
deterministic wherever practical

The engineering process—not the individual model—is the primary unit of engineering.

The target architecture should minimize undocumented discretionary work and maximize engineering work produced through standardized, observable processes.

Human Governance

The human operator is not expected to possess complete implementation knowledge of every subsystem.

The architecture should reduce cognitive load by making engineering work understandable through evidence, process, and traceability rather than requiring complete manual reconstruction of repository state.

The human governs the engineering system.

The engineering system performs the engineering work.

Existing Engineering Problems

Throughout development the following classes of failures have repeatedly occurred:

Architectural drift
Configuration authority violations
Hidden ownership
Hidden state
Silent repository mutations
Production/test divergence
False confidence
Correlated reviewer failures
Prompt contamination
Incomplete repository search
Local reasoning instead of global reasoning
Repository hallucination
Regression caused by partial understanding
Long-horizon context loss
Hidden assumptions
Green tests that failed to prove intended invariants

Assume these are real engineering failures.

Your architecture should specifically address them.

Research Expectations

Leverage:

Existing open-source projects
Academic research
AI engineering research
Verification research
Workflow engines
Agent orchestration systems
Event sourcing
Provenance systems
Build systems
CI/CD architecture
Static analysis
Formal verification
Repository intelligence systems
Multi-agent research

Do not reinvent existing technology unless there is a compelling architectural reason.

Whenever possible:

cite projects
cite papers
cite architectural patterns
cite implementation examples
Your Assignment

Given:

the repository
the supplied engineering assets
the existing prompts
the existing tooling
the current runtime
current AI capabilities
modern software engineering practices
existing open-source ecosystems
current research

Design the engineering runtime that you would build.

Do not feel obligated to preserve current modules.

Do not feel obligated to preserve current naming.

Do not feel obligated to preserve current architecture.

If existing systems should survive, explain why.

If they should be merged, explain why.

If they should be replaced, explain why.

If they should be extracted into reusable infrastructure, explain why.

If existing open-source software already solves a problem better than the current implementation, recommend it.

If commercial systems should replace internally built components, explain why.

If entirely different architecture should be used, explain why.

Every recommendation should be technically justified.

Deliverables

Produce:

Overall architecture
Runtime architecture
Engineering process architecture
Repository intelligence architecture
Verification architecture
Memory architecture
Receipt architecture
Mission architecture
Capability architecture
Orchestration architecture
Governance architecture
Recommended open-source components
Recommended commercial components
Build vs. buy analysis
Migration strategy
Incremental implementation roadmap
Expected risks
Failure modes
Strongest criticisms of your own proposal

Finally answer:

If you inherited this engineering ecosystem today, what would you build differently, what would you preserve, and what concrete technical steps would you take to evolve it into the strongest AI-assisted engineering runtime you know how to build?

# MERCURY ARCHITECTURE REPORT

# Principal Systems Architecture Review — Mercury Architecture Mode

Author: Mercury-2 via mercury-bridge --architecture
Mode: agentic architecture, local VPS branch codex/multi-asset-symbol-state
Raw receipt: ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-architecture.raw.txt
Run ledger: ogz-meta/cognition-history/mercury-runs/2026-07-23.jsonl:2
Reliability: answer_given, 15/15 tool calls succeeded, no failed calls; report is preserved but thin for the prompt scope.



**Overall Verdict – The current OGZPMLV2 stack already contains a fairly complete “Mercury‑bridge” verification layer, a modular indexing‑retrieval pipeline, a trace‑memory bias system, and a real‑time engineering‑receipt logger.  However, the architecture is still a collection of loosely‑coupled scripts that rely on ad‑hoc JSON configuration, a single MongoDB instance for both vector storage and trace memory, and a custom‑built hybrid‑retrieval implementation.  The biggest gaps are:**

| Gap | Evidence | Why it matters |
|-----|----------|----------------|
| **Unified repository‑wide safety envelope** – All repo‑access tools (grep, open_file, git_diff, run_check, …) are gated by a *single* ignore list (`mercury.ignore`) that is parsed once at start‑up.  The parser is strict (rejects globs, requires trailing “/”), but there is no runtime enforcement for *new* paths that may be created after the process starts. | `trai_brain/mercury-bridge/config.js` – lines 130‑160 define `loadMercuryIgnore` and `isPathIgnoredByMercury`mercury.ignore:130-166 | A malicious or buggy tool could write a file under a previously non‑existent directory that is later *not* covered by the static ignore set, bypassing the guard. |
| **Single‑point‑of‑failure for vector storage** – All embeddings and chunk metadata live in one Mongo collection (`chunks`).  The code does not abstract the store behind an interface that could be swapped for a dedicated vector DB (e.g., Pinecone, Qdrant). | `trai_brain/mercury-bridge/config.js` – lines 174‑176 define `MONGO_URI`, `MONGO_DB_NAME`, `MONGO_COLLECTION_CHUNKS`).  The code does not abstract the store behind an interface that could be swapped for a dedicated vector DB (e.g.:174-178 | Scaling to millions of chunks will hit Mongo’s document‑size limits and performance ceilings; also, the same DB is used for trace‑memory, mixing read‑heavy (retrieval) and write‑heavy (trace) workloads. |
| **Hybrid‑retrieval code complexity** – `searcher.js` implements BM25, cosine similarity, RRF, and a custom “code‑flavored query” booster all in a single file.  The implementation is correct but hard to test in isolation, and the BM25 index is rebuilt on every query (no persistence). | `trai_brain/mercury-bridge/searcher.js` – lines 70‑124 show BM25 index construction, lines 146‑158 show code‑flavored detection, lines 173‑176 show query‑type boosts【open_file†L70-L124】【open_file†L146-L158】searcher.js:173-176 | Any bug in these heuristics can silently degrade retrieval quality; also, rebuilding the BM25 index for each query is O(N) and will become a latency bottleneck as the chunk store grows. |
| **Trace‑memory dedup & quality scoring** – `trace-memory.js` deduplicates traces using a cosine‑similarity threshold (0.92) and a hand‑rolled quality score (`iterations*10 + latency/1000`).  The threshold and scoring constants are hard‑coded and not configurable. | `trai_brain/mercury-bridge/trace-memory.js` – lines 40‑44 define `CURRENT_FIX_QUERY_PATTERN`; lines 69‑80 define `shouldCaptureTrace`; lines 61‑63 define `computeQualityScore`【open_file†L40-L44】【open_file†L69-L80】trace-memory.js:61-63 | The fixed threshold may be too aggressive (dropping useful traces) or too lax (allowing near‑duplicates).  The quality function does not consider result correctness, so a fast but wrong trace could replace a slower, correct one. |
| **Limited observability of tool‑adapter failures** – `tool-adapter.js` blocks a whitelist of binaries and git sub‑commands, but when a command is blocked it only returns an error string; no structured error code or telemetry is emitted. | `trai_brain/mercury-bridge/tool-adapter.js` – lines 45‑49 list blocked binaries, lines 57‑60 list blocked git sub‑commands, lines 71‑73 show error handling for blocked commands【open_file†L45-L60】tool-adapter.js:71-73 | Downstream components (e.g., the ReAct loop) cannot programmatically distinguish “blocked by policy” from “real runtime error”, making automated remediation harder. |
| **No explicit ownership model** – The repo contains many “ogz‑meta” markdown files that encode policies (e.g., guardrails, receipts) but there is no code‑level enforcement of who may modify which sections.  The only enforcement is through naming conventions (`ogz-meta/...`). | `ogz-meta/claudito-logger.js` – lines 44‑46 define the log directory; the file mentions “All decisions must be logged” but does not enforce per‑owner write permissions| **No explicit ownership model** – The repo contains many “ogz‑meta” markdown files that encode policies (e.g.:44-46 | Without a programmable ownership layer, a bug that writes to a protected directory could go unnoticed until a manual audit. |
| **Hard‑coded “run‑ledger” directory** – `run-ledger.js` resolves its output directory from an env var but validates it only for “repo‑relative” paths; the directory can be overwritten by a malicious env value, causing logs to be written outside the repo. | `trai_brain/mercury-bridge/run-ledger.js` – lines 8‑18 show default and validation logicrun-ledger.js:8-18 | An attacker who can set `MERCURY_RUN_LEDGER_DIR` could redirect logs to a location they control, facilitating exfiltration. |

---

## 1. Ownership Boundaries & Data‑Flow

| Component | Primary Owner (code location) | Data Produced | Data Consumed |
|-----------|-----------------------------|---------------|---------------|
| **Mercury Config** | `trai_brain/mercury-bridge/config.js` | Tunables for embeddings, LLM, retrieval, trace‑memory, safety | All Mercury‑bridge modules (indexer, searcher, tool‑adapter, trace‑memory, run‑ledger)【open_file†L14-L21】trai_brain/mercury-bridge/config.js:170-197 |
| **Tool Adapter** | `trai_brain/mercury-bridge/tool-adapter.js` | Normalised repo‑file reads, git diffs, safe subprocesses | ReAct loop, query‑router, searcher, run‑ledger【open_file†L13-L20】trai_brain/mercury-bridge/tool-adapter.js:45-53 |
| **Indexer** | `trai_brain/mercury-bridge/indexer.js` | Chunk documents (text, embeddings, metadata) stored in Mongo `chunks` collection | Searcher (semantic retrieval), trace‑memory (optional embedding of query)【open_file†L1-L5】trai_brain/mercury-bridge/indexer.js:70-78 |
| **Searcher** | `trai_brain/mercury-bridge/searcher.js` | Ranked list of chunk IDs (semantic + BM25) | Query‑router (to feed LLM)【open_file†L1-L5】trai_brain/mercury-bridge/searcher.js:70-124 |
| **Trace‑Memory** | `trai_brain/mercury-bridge/trace-memory.js` | Cached investigative traces (query embeddings, tool‑call logs) | ReAct loop (as hint injection)【open_file†L1-L12】trai_brain/mercury-bridge/trace-memory.js:69-80 |
| **Run‑Ledger** | `trai_brain/mercury-bridge/run-ledger.js` | Execution artefacts (prompt excerpts, tool telemetry, verdict) | Auditing UI, receipt generation |open_file†L1-L12】trai_brain/mercury-bridge/run-ledger.js:8-18 |
| **Claudito Logger** | `ogz-meta/claudito-logger.js` | Real‑time console + JSONL logs of decisions, errors, metrics | Human operators, CI dashboards |open_file†L44-L46】ogz-meta/claudito-logger.js:70-84 |

**Data‑flow diagram (textual):**  

```
[Repo] ──► (tool‑adapter) ──► (indexer) ──► Mongo chunks
   │                                 │
   │                                 ▼
   │                     (searcher) ──► ranked chunk IDs
   │                                 │
   ▼                                 ▼
(query‑router) ◄─── (LLM client) ◄─── (run‑ledger) ◄──► (trace‑memory)
   │                                 │
   ▼                                 ▼
[ReAct loop] ◄─── (tool‑adapter) ◄─── (user / CI)
```

All paths are gated by the **ignore list** (`mercury.ignore`) and the **environment‑variable whitelist** in `tool‑adapter.js`.

---

## 2. Verification Architecture

* **Safety checks** – `tool‑adapter.js` validates every file path against `config.SKIP_DIRS` and blocks a curated set of binaries (`RUN_CHECK_BLOCKED_BINARIES`) and Git sub‑commands (`RUN_CHECK_BLOCKED_GIT_SUBCOMMANDS`).【open_file†L45-L53】tool‑adapter.js:57-66  
* **Config validation** – All required fields are type‑checked at start‑up (`requiredString`, `requiredNumber`, `requiredBoolean`).  Missing or malformed config aborts the process.【open_file†L22-L48】  
* **Trace‑memory dedup** – Cosine similarity ≥ 0.92 triggers a replacement only if the new trace’s quality score is lower.  Usage count protects frequently‑used traces from eviction.【open_file†L69-L80】* **Trace‑memory dedup** – Cosine similarity ≥ 0.92:61-63  
* **Hybrid retrieval** – BM25 is built on‑the‑fly per query (`buildBM25Index`).  RRF merges semantic and lexical scores, with content‑type‑specific boosts (`CONTENT_TYPE_BOOST_STRONG`/`WEAK`).  Query‑type detection (`isCodeFlavoredQuery`) adjusts boosts for code‑flavored queries.【open_file†L119-L124】【open_file†L146-L158】【open_file†L173-L176】  

**Invariant** – Every tool call that touches the filesystem or Git must pass through `isPathIgnoredByMercury` (defined in config.js:162-166 before any I/O.  This invariant is enforced in `tool‑adapter.js` (line 17‑22) and in `run‑ledger.js` (line 39‑45).  

---

## 3. Build‑vs‑Buy Analysis

| Capability | Current Implementation | Open‑source / Commercial Alternative | Build‑vs‑Buy Verdict |
|------------|-----------------------|------------------------------------|----------------------|
| **Vector store & hybrid retrieval** | Mongo collection + custom BM25 + on‑the‑fly index | **Qdrant**, **Pinecone**, **Weaviate** (vector DB with built‑in BM25) | **Buy** – mature, scalable, offers persisted lexical indexes; reduces O(N) BM25 rebuild cost. |
| **Trace‑memory bias** | Hand‑rolled cosine similarity + Mongo collection | **FAISS** + persistent similarity search + TTL collections (Mongo) | **Build‑or‑Buy** – FAISS is open‑source and can be wrapped; keep custom quality logic but replace storage with FAISS + Mongo for metadata. |
| **Tool‑adapter safety layer** | Whitelist of binaries, path‑checks, custom error strings | **OPA (Open Policy Agent)** or **AWS IAM‑style policy engine** | **Buy** – OPA provides declarative policies, audit logs, and can be hot‑reloaded without code changes. |
| **Run‑ledger & audit trail** | JSON‑L files under `ogz-meta/cognition-history/mercury-execution` | **Elastic Stack (Filebeat → Elasticsearch)** or **Splunk** | **Buy** – gives searchable, indexed logs, retention policies, and alerting. |
| **Receipt/decision logging** | `claudito-logger.js` writes JSON‑L to `ogz-meta/logs` | **Git‑based provenance (e.g., `git‑notes` or `GPG‑signed commits`)** | **Build** – receipts already map to repo commits; a thin wrapper around `git notes` would give cryptographic integrity with minimal code. |
| **Configuration management** | JSON file + env vars, no schema enforcement beyond runtime checks | **HashiCorp Vault + HCL schema** or **Kubernetes ConfigMaps + OPA** | **Buy** – central secret management and schema validation reduce drift. |

---

## 4. Migration Path (incremental)

| Phase | Goal | Concrete Steps | Evidence / Code to modify |
|------|------|----------------|---------------------------|
| **0 – Baseline** | Freeze current behaviour | Tag current commit (`v0‑baseline`) and run full integration test suite (if any). | N/A |
| **1 – Config & Ownership** | Move config validation to a JSON‑Schema validator (e.g., `ajv`). | Add `config-schema.json`; replace `required*` helpers with `ajv` compile step. | `config.js` (lines 22‑48) |
| **2 – Policy Engine** | Replace custom binary whitelist with OPA. | Create `policy.rego` that mirrors `RUN_CHECK_BLOCKED_BINARIES` and `RUN_CHECK_BLOCKED_GIT_SUBCOMMANDS`; inject OPA evaluation in `tool-adapter.createToolAdapter`. | `tool-adapter.js` (lines 45‑53) |
| **3 – Vector Store Swap** | Switch from Mongo `chunks` to Qdrant (or Pinecone). | Implement `VectorStore` abstraction (`store.embed`, `store.search`); migrate existing chunks via a one‑off script; update `searcher.js` to call `store.search`. | `indexer.js` (lines 1‑5) and `searcher.js` (lines 1‑5) |
| **4 – Persistent BM25** | Persist lexical index in Qdrant (or Elastic) to avoid per‑query rebuild. | Extend `VectorStore` to store term‑frequency metadata; modify `searcher.buildBM25Index` to load persisted index. | `searcher.js` (lines 119‑124) |
| **5 – Trace‑Memory Upgrade** | Replace Mongo trace collection with FAISS + Mongo metadata. | Create `faiss-client.js` exposing `add`, `query`; adjust `trace-memory.captureTrace` and `retrieveSimilarTrace`. | `trace-memory.js` (lines 69‑80) |
| **6 – Auditing & Receipts** | Push run‑ledger JSON‑L into Elastic. | Install Filebeat config, point to `run-ledger` output dir; add structured fields (`run_id`, `verdict`). | `run-ledger.js` (lines 1‑12) |
| **7 – Ownership & Permission Layer** | Enforce per‑directory write permissions via Git hooks + OPA. | Add pre‑commit hook that runs OPA `allow_write(path, user)`; reject commits that modify `ogz-meta` outside allowed owners. | No code yet – new hook. |
| **8 – Full‑stack Tests** | End‑to‑end verification of new pipeline. | Write integration test that indexes a small repo, runs a query, checks that the retrieved chunks come from Qdrant, and that a trace is stored in FAISS. | Use existing `test/mercury-index-scope.test.js` as a template. |

Each phase can be toggled via feature flags in `mercury.config.json`, allowing a **canary roll‑out**.

---

## 5. Expected Risks & Failure Modes

| Risk | Trigger | Current Mitigation | Residual Gap |
|------|---------|--------------------|--------------|
| **Ignore‑list bypass** – A new directory is created after the process starts, not present in `mercury.ignore`. | `tool‑adapter` reads ignore file only at start‑up. | `isPathIgnoredByMercury` checks each call, but the set is static. | No runtime watcher → possible silent repo mutation. |
| **Mongo outage** – Both chunk store and trace memory become unavailable. | Network partition, DB crash. | Errors bubble up as `run_check blocked` messages; no retry logic. | No graceful degradation (e.g., fallback to local file cache). |
| **BM25 performance collapse** – Chunk count > 10 k leads to O(N) index rebuild per query. | Scaling the repo. | No caching; `searcher` rebuilds on every request. | Retrieval latency spikes → time‑outs. |
| **Quality‑score inversion** – A fast but incorrect trace replaces a slower correct one. | `computeQualityScore` ignores result correctness. | Only iteration count & latency used. | No correctness metric → possible regression. |
| **Policy‑drift** – OPA policy file diverges from code whitelist. | Manual edits to `tool‑adapter` without updating OPA. | No test that compares the two lists. | Inconsistent enforcement. |
| **Credential leakage via run‑ledger** – `run-ledger` sanitises only known patterns. | New secret pattern appears (e.g., “API_TOKEN”). | `redactSensitiveText` regex list is hard‑coded. | Undetected secrets could be written to logs. |

---

## 6. Strongest Criticisms of the Current Proposal

1. **Monolithic “Mercury” code base** – All core functions (indexing, retrieval, safety, trace‑memory) live under a single repo path (`trai_brain/mercury-bridge`).  This makes independent versioning, testing, and replacement difficult.  
2. **Hard‑coded thresholds** – `TRACE_DEDUP_THRESHOLD` (0.92) and `TRACE_INJECT_THRESHOLD` (config‑driven but default not shown) are magic numbers; they cannot be tuned per‑project without code change.  
3. **No formal ownership model** – The system relies on naming conventions (`ogz-meta/...`) and runtime logs to enforce “who may edit what”.  A malicious insider could still edit protected files.  
4. **Single‑process design** – All components run in the same Node process; a crash in the LLM client or a blocked binary can bring down the entire verification pipeline.  
5. **Limited observability** – Tool failures are returned as plain strings; no structured telemetry is emitted to a monitoring system, making automated alerting impossible.  

---

## 7. What I Would Build Differently (Concrete Steps)

| Step | Action | Reason |
|------|--------|--------|
| **a. Extract a **Policy Engine** (OPA) and replace the hand‑rolled binary whitelist. | Guarantees a single source of truth for command safety, enables live updates, and provides audit logs. |
| **b. Introduce a **Vector‑DB abstraction** (`VectorStore`) and migrate chunks to Qdrant. | Removes the O(N) BM25 rebuild, scales to millions of chunks, and gives built‑in lexical search. |
| **c. Split **Trace‑Memory** into two services: a FAISS‑based similarity store and a Mongo metadata store. | Allows independent scaling; FAISS handles fast nearest‑neighbor queries, Mongo keeps usage counters. |
| **d. Replace **Run‑Ledger** with an Elastic‑Stack pipeline (Filebeat → Elasticsearch). | Provides searchable, indexed logs, retention policies, and Kibana dashboards for auditors. |
| **e. Harden **Configuration** with JSON‑Schema + Vault‑backed secrets. | Prevents drift, enforces types at load‑time, and stores API keys securely. |
| **f. Add **Git‑hook based ownership enforcement** (pre‑commit hook that checks OPA for file‑path → owner mapping). | Guarantees that only authorized owners can modify guarded files, closing the “hidden ownership” failure mode. |
| **g. Implement **Structured Tool‑Result Objects** (status code, error enum, payload) instead of raw strings. | Enables downstream components (ReAct loop, orchestration) to make deterministic decisions on failures. |
| **h. Write **Integration Tests** that cover the full data‑flow (index → retrieve → trace‑memory → run‑ledger). | Guarantees regressions are caught early, especially after swapping out storage back‑ends. |
| **i. Deploy **Canary Instances** for each new component (OPA, Qdrant, FAISS) behind feature flags. | Allows incremental rollout and immediate rollback if performance or correctness degrades. |

---

### Bottom‑line

The OGZPMLV2 repository already contains the essential building blocks for an AI‑assisted engineering runtime, but the architecture is still **fragile, monolithic, and not horizontally scalable**.  By **modularising the safety policy, swapping the vector store for a purpose‑built DB, persisting the lexical index, and moving logs to an observable stack**, we can eliminate the most critical failure modes (silent repo mutations, retrieval bottlenecks, and un‑auditable tool failures) while keeping the existing “Mercury” semantics.  The migration can be performed incrementally, with each phase guarded by feature flags and a comprehensive test suite, ensuring that the system remains deterministic, auditable, and maintainable for the long term.



# FABLE MAX-EFFORT REVIEW

# Principal Systems Architecture Review — Mercury + Fable

Author: Fable/Claude Code over Mercury architecture report
Mode: max-effort stream-json, read-only architecture synthesis
Prompt: ogz-meta/inbox/fable/2026-07-23/principal-systems-architecture-review-fable-fallback-prompt.md
Mercury source: ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-architecture.md
Raw receipt: ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-fable.raw.stream.jsonl
Status: completed
Cost reported by Claude CLI: $17.086154
The advisor is disabled for this conversation, and both agents hit the same wall — I'll proceed on the assembled evidence, which is extensive: eight bridge files read verbatim, live Mongo interrogated, hook enforcement empirically probed, and three parallel sweeps with file:line citations. Here is the complete evolved Mercury+Fable architecture report.

---

# 1. Evidence Limits

**Verified first-hand (files read in full, verbatim):** `trai_brain/mercury-bridge/config.js` (510 lines), `tool-adapter.js` (2,359), `searcher.js` (462), `trace-memory.js` (368), `run-ledger.js` (336), `mongo-store.js` (242), `mercury.config.json`, `mercury.ignore`. Live read-only MongoDB queries against `ogz_knowledge` (chunk counts, embedding-dimension distribution, trace counts, index-run stats). Repo-wide greps for KillSwitch consumers. Git log and branch divergence.

**Verified via three parallel read-only subagent sweeps** (each returned file:line-cited notes): (a) `ask.js`, `react-loop.js`, `indexer.js`, `llm-client.js`, `adversarial-review.js`, `query-router.js`, the 12 `test/mercury-*.test.js` suites; (b) the `ogz-meta/` pipeline inventory (35 top-level scripts), `.claude/settings.json` hook wiring, all `trai_brain/claude-bridge/` gate handlers, receipts (`fixes.jsonl`, `cognition-history/`, `sessions/`, `manifests/`), doctrine timestamps; (c) product runtime shape (PM2 apps, package.json, CI workflows, dashboard serving, contributor stats). Agent-reported claims I considered load-bearing (KillSwitch dead read-side, hook fail-closed behavior) were independently re-verified by my own greps or observed directly.

**Gaps, labeled:**
- `ogz-meta/cognition-history/mercury-runs/2026-07-23.jsonl:2` (the run receipt for the Mercury report under review) is read-protected by the claude-bridge ignore policy, which blocked my read and instructed that the policy decision be surfaced to Trey. I respected the gate. Its metadata (answer_given, 15/15 tool calls) is taken from the supplied run directive, unverified.
- The GitHub mirror was not compared against the VPS checkout; per the directive the VPS is authoritative.
- Sourcegraph: no on-VPS deployment exists in repo infrastructure (zero hits across docker/deploy/config); the `sg` MCP connector requires OAuth and is unavailable this session. Its live indexing status is unverifiable here.
- The 972 KB Fable raw stream in `ogz-meta/inbox/fable/2026-07-23/` was not read.
- Legacy Mongo collections (`chunks` 16,420 docs; `investigation_traces` 479; `chunks_local_nomic_refresh_20260603` 25,414) were counted, not content-sampled.
- Runtime process state (PM2 live status) was not inspected — read-only contract, and the task forbade PM2.
- The advisor tool is disabled this conversation; no external review of this report occurred.
- The claude-bridge Bash gates (redirect, inline-runtime, ignore-policy) reshaped several commands. Every block was respected, not bypassed; the blocks themselves are cited below as enforcement evidence.

---

# 2. Mercury Critique

Transparent scorecard of Mercury's report — every finding classified with grep-verified evidence, per the standing categorization rule:

| # | Mercury claim | Verdict | Evidence |
|---|---|---|---|
| 1 | `MERCURY_RUN_LEDGER_DIR` can redirect logs outside the repo (exfiltration) | **Wrong** | `run-ledger.js:12-18` rejects absolute paths and `..` segments and throws. Mercury cited these exact lines while claiming the opposite. |
| 2 | Trace thresholds/constants "hard-coded… cannot be tuned per-project without code change" | **Wrong (narrow kernel survives)** | All five knobs load from `mercury.config.json:44-53` via `config.js:285-289`. Only the quality *formula* is code (`trace-memory.js:60-63`) — that narrowed kernel is real (see §3). |
| 3 | "A malicious or buggy tool could write a file… bypassing the guard" | **Wrong** | The registry (`tool-adapter.js:1689-1848`) exposes 18 tools, zero write/edit/patch primitives. `run_check` executes non-git commands in an isolated tracked-snapshot tmpdir (`tool-adapter.js:1091-1133`) with a before/after mutation detector (`:1264-1275`), and this is asserted by tests (`test/mercury-index-scope.test.js:720, :774`). Narrower real residuals exist (§6), but not the claimed vector. |
| 4 | Blocked tools "only return an error string; no structured telemetry… automated remediation impossible" | **Mostly wrong** | The run ledger records per-tool calls/succeeded/failed with per-iteration detail (`run-ledger.js:87-115`) and classifies every run into seven durable verdicts including `tool_failure` vs `blocked` (`run-ledger.js:121-146`). What's missing is only a per-call error-code enum (§3). |
| 5 | "No explicit ownership model… only enforcement is naming conventions" | **Wrong at the tool layer; partially right at the org layer** | `.claude/settings.json` wires eight hook events to `trai_brain/claude-bridge/`: forced read-before-edit (`pre-edit.js:63-73`), protected write surfaces that make the enforcement stack self-protecting (`policy.js:20-31`), a Bash mutation/inline-runtime/redirect gate (`pre-bash.js:24-31`), `.claude/hooks/enforce-pipeline.sh` blocking direct hot-path edits, and a Stop-time finish-gate demanding an adversarial Mercury proof plus a green P0 gate for every hot-path edit (`finish-gate.js:266-303`). These gates fired repeatedly during this review. What genuinely doesn't exist: a per-path *owner map* — defensible in a repo whose entire history is effectively one human (`git shortlog`: CGP-ME, 1,877 commits). |
| 6 | Single Mongo mixes "read-heavy retrieval and write-heavy trace workloads" | **Wrong in practice** | Trace capture is manual-only (`mercury.config.json:47`) and the active trace collection holds **zero documents** (live query). The trading runtime is entirely Mongo-free (grep across `core/`, `brokers/`, `modules/`, `run-empire-v2.js`: no Mongo client). Mongo serves RAG reads almost exclusively. |
| 7 | Store is naive; "does not abstract the store behind an interface" | **Half-wrong** | `MongoStore` *is* the seam, and it is far from naive: every read/write/delete is scoped to a five-field embedding-identity lane (`mongo-store.js:20-29`) with fail-closed asserts on every fetched chunk (`:218-239`), covered by 13 dedicated identity tests (`test/mercury-embed-index-identity.test.js`). Formalizing the interface for swap-ability is still worthwhile (§3). |
| 8 | Ignore list "parsed once at start-up… no runtime enforcement for new paths" | **Misleading** | Enforcement is per-call (`tool-adapter.js:229-239`), matching by directory *name* anywhere in the tree (`config.js:162-166`, `mercury.ignore:2`) — a newly created directory with an ignored name is covered automatically, and Mercury runs are short-lived CLI processes that re-read the contract each dispatch. |
| 9 | BM25 rebuilt per query; retrieval latency will degrade | **Correct** — and understated (see §3) |
| 10 | Quality score ignores correctness; fast-wrong can replace slow-right | **Correct** (§3) |

**What Mercury structurally could not see — and why.** The report reviewed an engineering runtime whose governance layer lives in `.claude/` and `ogz-meta/cognition/` — both excluded by name in `mercury.ignore:17,24`. The reviewer was blind, by its own safety contract, to the enforcement plane it concluded "does not exist." It likewise never mentioned: the Fable/consensus adversarial-review subsystem (`adversarial-review.js:386`, `mercury.config.json:64-101`), the incident-derived `rule_scan` engine (`tool-adapter.js:505-614`, rules carrying `prevents` and `source_incident` fields), the four Serena AST tools, the `run_check` sandbox and execution artifacts, the run-ledger receipt schema binding every run to `head_sha` + prompt hash, the answer-quality gates in `react-loop.js:32-192`, the `configExactInteger` flag-pinning contract (`ask.js:203-210`), trace-capture gating, embed-lane identity, `approve.js`/`reject.js` mission gates, the fixes ledger, session docs, and the KillSwitch.

**Why the report was thin — dispatch design, not model failure.** Three compounding causes, all consistent with this repo's own documented Mercury doctrine: (i) the prompt bundled roughly eighteen deliverables into one dispatch, the exact failure mode the one-dispatch-one-question law exists to prevent; (ii) the 7,750-token output cap cannot carry an eighteen-deliverable answer; (iii) `--architecture` mode shipped the day before the run (`cf9ec3d9`, 2026-07-23). The correct read is that the dispatch contract was mismatched to the mission, and the ignore contract blinded the reviewer to half the subject matter.

**Form defects.** The report's citations are mangled tool-handles (`【open_file†L70-L124】`) and corrupted table rows — violating Mercury's own system-prompt citation contract (`mercury.config.json:140`: tool-handle citations "do not count"). The answer-quality gate that flags exactly this (`react-loop.js`) evidently warned without blocking; warnings that never block become noise.

**Recommendation-quality defects.** Mercury's buy-list (OPA, Elastic/Filebeat, Vault, Qdrant/Pinecone, FAISS-as-a-service) is an enterprise reference architecture transplanted onto a single-VPS, single-operator system. Each adds a daemon to operate, patch, and secure on the same box that runs live trading. At 10,329 active chunks and ~90 receipt lines, none of these clears the bar (§7).

---

# 3. What Mercury Kept Correct

Credit where the evidence supports it — several findings are real, and two are important:

1. **Per-query retrieval cost is real and now quantified.** Every query calls `fetchAllForScoring()` (`mongo-store.js:128-154`), shipping all active chunks — embedding *and* text — out of Mongo into Node, then rebuilds the BM25 index from scratch (`searcher.js:270, :306`). At the measured operating point (10,329 active chunks × 3072-dim vectors ≈ 250 MB of BSON per query) this dominates dispatch latency. The design comment "fine at ~3000 chunks" (`mongo-store.js:11`) documents an assumption reality has outgrown 13×. Mercury pointed at the smaller term (BM25 CPU) and framed the ceiling as "millions of chunks," but the direction was right.
2. **Trace quality scoring lacks a correctness term.** `computeQualityScore = iterations*10 + latency/1000` (`trace-memory.js:60-63`). Within the 0.92 dedup band, a fast wrong investigation replaces a slow right one. The capture gates (answer_given-only, manual mode, git_diff-required for current-fix queries, `trace-memory.js:69-83`) narrow the blast radius but do not close it. The run ledger already computes the missing signal — `verdict` and consensus outcome — and simply doesn't feed it back.
3. **A formal store interface is worth extracting.** The seam exists (`MongoStore`); naming it (`VectorStore` with `search/upsert/clear` and lane identity as a first-class parameter) is cheap insurance for the swap that §7 defers.
4. **Per-call structured error codes are absent.** Tool failures are `{error: "message"}` shapes; the ledger-level verdicts recover the distinction after the fact, but the ReAct loop itself cannot branch on `POLICY_BLOCKED` vs `RUNTIME_ERROR` mid-investigation.
5. **Policy-drift risk between parallel lists is real in spirit.** Two ignore contracts exist — `mercury.ignore` (Mercury's boundary) and `trai_brain/claude-bridge/ignore-policy.json` (Claude's boundary) — with deliberately different allowances (the bridge permits `ogz-meta/ledger/` and `sessions/` reads; Mercury does not). Today the difference is intentional; nothing *tests* that the intent stays synchronized the way `mercury-index-scope.test.js:1020` locks the ripgrep globs to `SKIP_DIRS`.
6. **Redaction lists are pattern-brittle.** `run-ledger.js:40-65` covers bearer tokens, key-shaped assignments, webhook URLs, and generically redacts secret-named keys — good coverage, but a novel secret format would pass. Fair.
7. **Config-schema validation (ajv or equivalent)** — a marginal but cheap upgrade over the hand-rolled `required*` validators, which already fail closed at load.
8. **Signed/append-only receipt hardening and pre-commit ownership checks** — both directionally correct and adopted in §8 in right-sized form.
9. **Canary/feature-flag incremental rollout** — matches the repo's existing lane discipline; adopted.

Scorecard: of Mercury's seven risk-table rows, two confirmed (retrieval cost, quality inversion), two partially (policy drift, redaction), three refuted (ignore bypass as stated, Mongo outage severity as stated, credential exfiltration via ledger dir). Of its architecture claims, the ownership and write-risk claims are refuted with the strongest evidence.

---

# 4. Architecture That Survives The Evidence

What actually exists is stronger than either the prompt's inventory or Mercury's description. Stated as the six planes the evidence supports:

**Plane 0 — Product runtime.** PM2 runs four apps (`ecosystem.config.js`): the trader (`run-empire-v2.js`, 3,339 lines, `LIVE_TRADING=true`, `BROKER=alpaca`, five symbols), the dashboard/websocket server, Stripe, and a supervisor daemon. The hot path (`core/` — OrderExecutor 4,869 lines, StateManager 3,995 — `brokers/`, `modules/`, `run-empire-v2.js`) is the protected surface every other plane exists to defend. It is Mongo-free by design.

**Plane 1 — Enforcement (the box).** `trai_brain/claude-bridge/` compiled doctrine into fail-closed PreToolUse/Stop gates: reads blocked on ignore-policy paths, edits blocked unless the file was Read this session, Bash blocked on mutation/redirect/inline-runtime patterns, Mercury dispatches rejected unless attack-framed (`pre-bash.js:31-41` + `shared/break-my-fix-frame.js`), and session close blocked until every hot-path edit carries a diff-fingerprinted adversarial Mercury proof and a green P0 gate (`finish-gate.js:199-207, :266-303`). The stack is self-protecting (`policy.js:20-31`). This is the repo's answer to "freehand engineering does not scale," and it demonstrably works — it constrained this very review.

**Plane 2 — Verification.** Mercury-2 (Inception Labs) in a ReAct loop: 60-iteration/7,750-token caps pinned so flags can only restate config (`ask.js:203-210`); 18 read-only tools including sandboxed `run_check` proof execution; answer-quality gates flagging uncited claims; an optional cross-family adversarial reviewer (currently Kimi-k3 via Moonshot, `mercury.config.json:64-77`) with a structured verdict protocol and a two-recheck loop. Five LLM providers are supported (`config.js:310`) — the "models are replaceable, the process is the asset" philosophy is already implemented, not aspirational.

**Plane 3 — Evidence/receipts.** Every Mercury run writes a redacted, schema-versioned JSONL receipt binding prompt hash, branch, `head_sha`, dirty-state, tool telemetry, artifacts, and verdict (`run-ledger.js:217-290`), with per-line citations. Around it: `fixes.jsonl` (90 incident receipts feeding the UserPromptSubmit hook as prior-fix context), 45 `cognition-history/` receipt families, 51 append-only session docs, `run_check` execution artifacts.

**Plane 4 — Knowledge.** Lane-isolated RAG (10,329 active chunks; hybrid BM25+cosine+RRF with the literature constants cited in code, `config.js:264-270`); Serena AST tools; incident-derived `rule_scan` rules; trace memory (designed well, operationally dormant — zero traces in the active collection, 479 stranded in a legacy one).

**Plane 5 — Governance.** Human approval as recorded state separate from execution (`approve.js` → `--execute`); 26 claudito slash commands; 27 advisory hookify rules; doctrine docs; the NO-CODE-WITHOUT-APPROVAL law.

**The evolved design keeps this shape and closes the measured gaps.** The prompt's sixteen failure classes map almost one-to-one onto existing mechanisms; the architecture work is repair and completion, not replacement:

1. **Wire the KillSwitch read side (trading-safety P0).** `killswitch.flag` is active on disk right now (tripped 2026-07-23 by `AuthFailureGuard.js:111` after nine Alpaca auth failures), yet repo-wide the only `isKillSwitchOn()`/`throwIfActive()` callers are tests. The module's own claim — "blocks ALL order execution" (`core/KillSwitch.js:8-9`) — is unwired. This is the prompt's "green tests that failed to prove intended invariants" failure class, live, in the highest-stakes subsystem. Add `throwIfActive()` at the OrderExecutor submit path and a supervisor-daemon check.
2. **Fix retrieval's operating point.** Store BM25 term statistics at index time; score in-store (Mongo aggregation for cosine, or an embedded vector index — §7) so queries stop shipping 250 MB; garbage-collect dead embedding lanes (42,117 stale 768-dim chunks, 80% of the collection) and the two legacy collections (~42k more docs).
3. **Close the three narrow sandbox residuals.** `run_check`'s snapshot symlinks the live `node_modules` (`tool-adapter.js:1128-1131`) — a sandboxed script writing there crosses the boundary; non-inline node scripts get no `--permission` fs scoping (only inline eval does, `:1177-1186`); the mutation detector uses `--untracked-files=no` (`:1019`) so new-file creation on the live side is invisible. All three are cheap, targeted hardening.
4. **Feed verdicts back into trace quality, then turn trace memory on** — auto-capture candidates whose ledger verdict is `no_break_found`/`found_break` with consensus pass, quality = f(iterations, latency, verdict). Or delete the layer; dormant infrastructure is doc-drift waiting to happen. Wiring it is the better half of the fork because the missing signal already exists in the ledger.
5. **Make the correlated-reviewer defense non-optional for hot-path missions.** `consensus.defaultEnabled:false` and `adversarialReview.defaultEnabled:false` mean the cross-family check is opt-in exactly where it matters most. Gate it by attack scope: hot-path dispatches get Fable review by default.
6. **Give governance reviews a sight line.** Create a bounded self-review profile — a second index lane and tool policy that can read `.claude/`, `ogz-meta/cognition/`, and `trai_brain/claude-bridge/` (still excluding secrets and `session-state/`) — used only for missions whose subject is the runtime itself. The blindness that protects trading-code reviews from receipt-contamination made this architecture review structurally impossible for Mercury.
7. **Repair document truth.** The three mermaid charts CLAUDE.md declares CRITICAL required reading were last touched 2026-02-10 — five months and ~1,150 commits stale; CLAUDE.md's "Mercury indexes ogz-meta/*.js" section is stale against the tightened indexer scope (only `TheDoctrine.md` + `specs/`, `indexer.js:30-33`, shipped 2026-07-22); README drifts on chunk window, embedding model, and consensus provider; `package.json` `main` points at a legacy entrypoint and the `dashboard` script at a nonexistent filename; `CLAUDE.md`/`claude.md` case-duplicates coexist; `_1`/`_2`-suffixed copies of bridge files sit in `ogz-meta/`. Under this repo's own Document Accuracy Rule, each is a standing hallucination source.
8. **Declare or close the CI gap.** GitHub Actions runs secrets-scan, smoke, patterns, and a 30-second startup probe — not the 177-file Jest suite. Green CI currently proves far less than green local `npm test`. Either run the suite in CI or codify the split so nobody mistakes the badge for the invariant.

---

# 5. Ownership Boundaries

| Surface | Owner (enforced where) | Evidence |
|---|---|---|
| Mercury runtime tunables, caps, prompts | `mercury.config.json` — sole authority; env cannot override, CLI flags must equal config or throw | `ask.js:203-210`; `test/mercury-llm-config-contract.test.js:71,:538` |
| Mercury's repo visibility | `mercury.ignore` (name-based, per-call) | `config.js:130-166`; enforced `tool-adapter.js:229-239`; tested `mercury-index-scope.test.js:208-614` |
| Claude's repo visibility + mutation rights | `trai_brain/claude-bridge/ignore-policy.json` + `policy.js`; hooks in `.claude/settings.json` | `policy.js:107-129`; empirical blocks this session |
| Repo I/O for Mercury | `tool-adapter.js` (single choke point, read-only registry) | `tool-adapter.js:1689-1848` |
| Chunk lifecycle + index identity | `indexer.js` + `mongo-store.js` lanes; `ogz-meta` eligibility hard-coded to TheDoctrine + specs | `mongo-store.js:20-29,:218-239`; `indexer.js:30-79` |
| Investigation discipline + answer quality | `react-loop.js` (iteration caps, evidence gates) | `react-loop.js:32-192,:516` |
| Receipts | `run-ledger.js` (repo-relative only, redacted, append-only) | `run-ledger.js:12-18,:299-324` |
| Mission state | `approve.js`/`reject.js` + `manifests/` (approval is state; execution is a separate explicit step) | `approve.js:67-84` |
| Session close | `finish-gate.js` (proof-or-block) | `finish-gate.js:266-303,:358-360` |
| Emergency halt | `core/KillSwitch.js` — **declared owner with no read-side consumers; boundary exists on paper only** | repo-wide grep; `AuthFailureGuard.js:43,:111` is writer-only |
| Human law | `CLAUDE.md` + doctrine docs + hookify advisories | stale in places (§4.7) |

Boundary defects: the two ignore contracts drift-untested against each other; enforcement code lives in `trai_brain/` beside an unrelated legacy TRAI Python/GGUF subsystem (cohabitation invites accidental coupling); duplicated bridge copies in `ogz-meta/` blur which files are canonical; `main` branch ownership is nominal (doctrine says work on main; reality is a working branch 1,150 commits ahead, 0 behind).

---

# 6. Data Flow And Invariants

**Dispatch flow (corrected):**

```
operator/claudito prompt
  → UserPromptSubmit hook (prior-fixes injection from fixes.jsonl)
  → ask.js (flags pinned to config)
  → query-router (heuristic mode/boost/starter-context policy)
  → embedText → retrieveTopK  [lane-scoped fetch → cosine + BM25 → RRF → kind/content boosts]
  → runReactLoop: system prompt + starter context + trace hint (if any) + Serena auto-blast
      loop ≤60: Mercury-2 tool_calls → tool-adapter (boundary-checked) → results
  → answer-quality gates (citation/proof flags)
  → optional Fable adversarial review (Kimi-k3) → ≤2 bounded rechecks
  → run-ledger receipt (redacted, head_sha-bound, verdict-classified)
  → artifacts to cognition-history/ · report to inbox/ → human curation → specs/ → reindex
```

**Invariants, with enforcement point and test status:**

1. All file access resolves inside the repo root — `tool-adapter.js:198-208`; tested.
2. Ignored directory names block reads/lists/chunks/diffs per call, with three explicit receipt-prefix exceptions — `tool-adapter.js:147-151,:229-239`; tested (`mercury-index-scope.test.js:208-614`).
3. Every retrieved chunk must match the active embedding lane and dimension, else throw — `mongo-store.js:218-239`; retrieval additionally refuses to serve any ignored path, forcing reindex — `searcher.js:39-47`; tested.
4. `run_check` cannot mutate the live repo: no shell, argv-only, no absolute paths, snapshot cwd, git read-only allowlist, sanitized env, before/after tracked-status check — `tool-adapter.js:1135-1275`; tested (:720, :774). *Residuals: node_modules symlink, non-inline node fs scope, untracked-file blindness (§4.3).*
5. Caps cannot be widened at dispatch time — `ask.js:203-210`; tested.
6. Only successful, explicitly-requested, evidence-grounded investigations teach — `trace-memory.js:69-83`; tested ("failed investigations never teach").
7. Receipts are repo-relative, secret-redacted, append-only, and bound to `head_sha` + prompt hash — `run-ledger.js:12-18,:40-65,:242`; tested.
8. Hot-path edits require prior Read, adversarial Mercury proof, and a green P0 gate before the session may close — `pre-edit.js:63-73`, `finish-gate.js:266-303`; empirically enforced.
9. Mercury dispatches must be attack-framed — `pre-bash.js:31-41`; empirically enforced.
10. **Broken invariant:** "kill switch blocks all order execution" — declared (`KillSwitch.js:8-9`), written (`AuthFailureGuard.js:111`, flag active on disk), never read in production. The single most important invariant in the system is the one without a wire.

---

# 7. Build Vs Buy

Counter-analysis to Mercury's table, grounded in the measured scale (10,329 active chunks, ~90 fix receipts, one operator, one VPS also running live trading):

| Capability | Mercury's verdict | Evolved verdict | Reasoning |
|---|---|---|---|
| Vector store | Buy Qdrant/Pinecone/Weaviate | **Defer; fix in place, embedded if needed** | The bottleneck is the 250 MB/query full fetch, not ANN recall at 10k vectors. First: in-store scoring + BM25 stats persisted at index time + lane GC. If scale 10×s: embedded `sqlite-vec` or LanceDB behind the formalized `VectorStore` seam — zero new daemons. A vector-DB server on the trading VPS is operational surface without a matching problem. |
| Trace similarity | FAISS + Mongo split | **Reject** | Cap is 10,000 traces (`mercury.config.json:51`); current count is zero. Brute cosine is microseconds at that scale. The work is wiring capture, not accelerating search. |
| Policy engine | Buy OPA | **Reject for now** | The claude-bridge gates plus declarative JSON rule files (`mercury-rules/`, `ignore-policy.json`) *are* the policy engine — versioned, tested, self-protecting. OPA earns its complexity with multiple operators/services; here it would re-platform working, tested enforcement. Adopt Mercury's underlying point as a drift test between the two ignore contracts instead. |
| Log/observability | Buy Elastic/Splunk | **Reject** | Receipts are line-cited JSONL; `substrate-digest.js` already aggregates them. jq + digest covers the query load of one operator. Elastic on this VPS is RAM, patching, and attack surface. If receipts outgrow grep: SQLite ingest, still daemon-free. |
| Secrets | Vault + schema | **Reject; adopt the cheap half** | Config already indirects keys through named env vars and refuses credentials in URLs (`config.js:216-229`). Rotation/encryption at rest: `sops`/`age` on `.env` if desired. Vault is a fleet tool. JSON-Schema validation of `mercury.config.json` (ajv): **adopt** — cheap, strictly better errors. |
| Receipt integrity | git-notes/GPG | **Adopt, right-sized** | Daily hash-chaining of ledger files plus a signed tag per session (or minisign) gives tamper-evidence for near-zero cost. Aligns with in-toto/SLSA provenance thinking without adopting their machinery. |
| Repo intelligence | (not addressed) | **Build on what exists** | tree-sitter is already in devDependencies with a migration spec (`ogz-meta/specs/serena-tree-sitter-migration.md`) — finish moving Serena from regex+AST-lite to tree-sitter. Sourcegraph remains an external augment (its substrate integration was branched and then quarantined per branch history); do not make retrieval depend on an OAuth service the box doesn't control. |
| Orchestration | (implicit workflow engines) | **Reject Temporal/LangGraph-class engines** | The deterministic value is already delivered by hooks + Node scripts + JSONL state — inspectable, replayable, greppable. A workflow engine would add a daemon and an abstraction layer between doctrine and enforcement, the opposite of this system's core trick: doctrine compiled directly into gates. |
| LLM layer | (n/a) | **Keep the multi-provider abstraction** | Five providers supported, identity-asserted clients, cross-family reviewer. This is the portable "engineering OS" contract working as designed. |
| CI | (n/a) | **Extend GitHub Actions** | Already present; add the full Jest suite (or a tiered subset) rather than buying anything. |

---

# 8. Migration Roadmap

Ordered by risk-to-production, each phase one-change-one-commit-one-push, hot-path changes under the P0 law with a Mercury attack pass. All phases are proposals — nothing here is executed without approval.

- **Phase 0 — Safety wire (hot path, smallest possible diff).** Add `killSwitch.throwIfActive()` at the OrderExecutor order-submission choke point and a supervisor-daemon flag check; jest contract test asserting an active flag prevents order placement end-to-end. Also decide the *current* flag's disposition (it is active now; the bot's intended state needs Trey's call).
- **Phase 1 — Index hygiene.** One-off GC script: drop non-active-lane chunks (42,117 docs) and the two legacy collections after a snapshot; add lane-GC to the indexer's post-run step; fix the `*_local_nomic` naming or document it as lane-partitioned. Measure query latency before/after (golden-query set, ~20 prompts).
- **Phase 2 — Retrieval scale.** Persist BM25 doc-frequency stats at index time; move cosine scoring in-store (aggregation) or adopt sqlite-vec behind a named `VectorStore` interface. Gate: golden-query results identical-or-better, p50 latency target under 1s.
- **Phase 3 — Sandbox hardening.** Replace the node_modules symlink with read-only exposure; extend `--permission` scoping to script-file node runs; switch the mutation detector to include untracked files. Extend `mercury-index-scope.test.js` for each.
- **Phase 4 — Verification depth.** Feed ledger verdict + consensus outcome into trace quality; enable auto-capture behind the existing guarded mode; flip adversarial review default to on for hot-path attack scopes; add a second consensus provider rotation (Kimi + one other family) to decorrelate.
- **Phase 5 — Receipts hardening.** Daily hash-chain field in run-ledger entries; session-end signature; promote `substrate-digest` output into the indexable specs surface so verified history (not raw receipts) reaches RAG.
- **Phase 6 — Governance sight line.** Bounded self-review index lane + tool profile for runtime-review missions; drift test asserting `mercury.ignore` and `ignore-policy.json` diverge only on an explicit allowlist.
- **Phase 7 — Truth sweep + CI.** Regenerate or retire the mermaid charts (generated atlas from code preferred); update CLAUDE.md's Mercury-scope section; fix README/package.json drifts; dedupe `claude.md`; remove `ogz-meta` bridge copies; remove the 10.2 MB committed zip; bring the full test suite (tiered) into CI; resolve the main-branch strategy (either merge the 1,150 commits or amend doctrine to name this branch as trunk).

Each phase is independently shippable and independently revertible; none blocks another except 1→2.

---

# 9. Top Risks And Criticisms

Strongest criticisms of this proposal, stated against myself:

1. **Right-sizing is a bet on staying small.** Rejecting Qdrant/OPA/Elastic assumes one operator, one VPS, ~10k chunks. If Houston/white-glove scaling arrives, several "defer" verdicts flip, and retrofitting under load is worse than adopting early. Mitigation: the `VectorStore` seam and drift tests are exactly the hedges that make later flips cheap.
2. **Phase 0 can halt live trading on a false positive.** Wiring the kill switch makes a previously inert flag lethal; a mis-threshold in AuthFailureGuard becomes an outage. The wire must land with threshold review and an explicit operator-unlock runbook.
3. **Default-on adversarial review costs real latency and money,** and Kimi-k3 alone is a single-vendor correlation risk in the layer meant to break correlation. Rotation helps but complicates receipt comparability.
4. **The self-review lane reopens a closed attack surface.** History/receipt exclusion is prompt-injection defense: receipts contain adversarial text by design. A lane that reads them must be non-indexed, read-only, and used only under explicit mission type — and even then, a poisoned receipt steering a governance review is a live threat this proposal accepts consciously.
5. **Receipt signing without key discipline is theater.** On a single box, the signing key sits beside the data it protects; it defends against accident and drive-by, not a root-level attacker.
6. **Determinism remains aspirational at temperature 0.8.** The verification gate runs Mercury-2 at 0.8 (`mercury.config.json:62`) — possibly necessary for the diffusion model's quality, but "deterministic wherever practical" currently stops at the model boundary; receipts give replayability of evidence, not of reasoning.
7. **This report leans on agent-summarized evidence for `ask.js`/`react-loop.js`/`indexer.js` internals** (cited, but not read by me line-by-line) and could not read the run receipt for the very Mercury run under review. Both are labeled, neither is fatal, but a hostile reviewer should press there first.
8. **The roadmap does not solve the deepest process debt:** a 4,276-session, single-human governance loop. Every gate ultimately routes to one person's attention; the architecture reduces his cognitive load per decision but not the decision volume. That is a scaling limit no tool in this report removes.

---

# 10. Next Lanes

In order, each small enough to be one approval:

1. **Decide the active killswitch flag's disposition** (it has been set since 2026-07-23 05:11 UTC) and approve the Phase-0 read-side wire — the one finding in this report where paper and production disagree on a live-trading invariant.
2. **Approve the Mongo lane GC** (snapshot, then drop 42k stale-lane chunks + 2 legacy collections) and capture before/after query latency as the Phase-2 baseline.
3. **Adopt the golden-query set** (~20 canonical prompts with expected top-K files) as the standing retrieval-regression gate before any retrieval change.
4. **Flip adversarial review default-on for hot-path attack scopes** — config-only change, immediately reversible.
5. **Run the truth sweep as a doc-only batch commit** (mermaid regeneration/retirement, CLAUDE.md Mercury-scope correction, README/package.json drifts, claude.md dedupe, ogz-meta bridge-copy removal) under the existing Document Accuracy Rule.
6. **Re-dispatch the principal-architecture mission to Mercury as a sectioned campaign** — one dispatch per section of this report's contract, each under the one-question law with exact file:line scopes, using the new self-review lane once it exists. Compare its section-by-section output against this report; where the two independent reviewers disagree, that disagreement is the next investigation queue.
7. **Add the ignore-contract drift test and the run_check sandbox-residual tests** — pure test additions, no runtime change, immediate invariant coverage.

**The inherited-ecosystem answer, in one paragraph:** I would preserve the shape — doctrine compiled into fail-closed gates, a read-only evidence-bound verifier, receipts binding every run to repo state, human approval as recorded state — because the evidence shows it working, including against me during this review. I would build differently in four places: wire the declared-but-dead safety invariant, fix the retrieval plane's outgrown operating point in place rather than buying a platform, make the cross-family reviewer the default rather than the exception, and give the system a bounded way to see itself — because the clearest lesson of this exercise is that the verifier's blind spot, not the verifier's intelligence, is what made the Mercury report wrong.

