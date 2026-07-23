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


# FABLE REVIEW TASK

You are Fable, the second architecture-review seat. This is read-only. Do not edit files. Do not write files. Do not run PM2. Do not inspect .env, secrets, broker/account data, or raw cognition-history dumps. The repository is public on GitHub, but the authoritative evidence is the VPS checkout named in the directive.

Your job is not to summarize Mercury. Your job is to attack Mercury's architecture answer, use your available read-only repo tools/resources, and produce the evolved Mercury+Fable architecture report. Do not stop at the first plausible critique. Keep investigating until the major plausible architecture shapes have been compared.

Required output: a full architecture review with sections for Mercury critique, evidence limits, evolved architecture, ownership boundaries, data flow, invariants, build-vs-buy, migration roadmap, risks/criticisms, and next lanes.

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

# MERCURY ARCHITECTURE MODE REPORT TO REVIEW

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


