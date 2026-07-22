# Principal Systems Architecture Review — Kimi Independent Report

Author: Kimi K3
Mode: independent raw Moonshot OpenAI-compatible HTTP call
Prompt: `ogz-meta/inbox/fable/2026-07-22/principal-systems-architecture-review-prompt.md`
Started: 2026-07-22T23:39:23.627Z
Ended: 2026-07-22T23:42:51.609Z
Status: success
Raw response: `ogz-meta/inbox/fable/2026-07-22/codex1-result-principal-architecture-kimi-independent.raw.json`

Let me think carefully about this task. The user is asking me to act as a Principal Systems Architect and produce an architecture review of a repository at https://github.com/CGP-ME/OGZPMLV2, branch codex/multi-asset-symbol-state.

Critical constraint: I have no ability to browse the internet or access GitHub. The system prompt explicitly says "No secrets, no account data. Produce a technically justified architecture review and clearly state evidence limitations."

So I must:
1. Clearly state that I cannot access the repository — this is an evidence limitation.
2. Not hallucinate repository contents. The instructions say "Repository reality supersedes documentation" — but I can't observe repository reality. I must be honest about this.
3. Still produce a maximally useful, technically deep architecture review based on: the described systems (Mercury, Clauditos, Receipts, Memory, Repository Intelligence, Runtime/Orchestration), the described failure modes, and my knowledge of the open-source/commercial landscape and research.

The user explicitly asks for citations of projects, papers, architectural patterns, implementation examples. I should do this from my training knowledge, being careful to only cite things I'm confident exist and flag uncertainty where it exists.

Let me plan the deliverables:

1. **Evidence limitations** — up front, clearly: I cannot fetch the repo; analysis is based on the supplied system descriptions and failure modes; recommendations are architecture-level, not code-level; any claim about repo internals must be verified.

2. **Overall architecture** — The core thesis: the durable asset is the engineering process; models are replaceable. So the architecture should be:
   - An event-sourced engineering kernel (the ledger of record)
   - Deterministic workspace semantics (hermetic sandboxes, content-addressed artifacts)
   - A repository intelligence plane (SCIP/LSIF-based indexing, tree-sitter, code property graphs)
   - A verification plane (policy as code, proof-carrying diffs, test selection, metamorphic testing)
   - An orchestration plane (durable execution — Temporal-style; agents as ephemeral workers)
   - A governance plane (human-in-the-loop checkpoints, capability-based authority, segregation of duties)

3. Key architectural positions I should take and justify:
   - **Event sourcing + content-addressed storage as the spine.** Everything — prompts, model outputs, diffs, tool calls, test results, approvals — is an event in an append-only log. Receipts become projections, not a bespoke subsystem. Cite: event sourcing (Fowler), Pat Helland "Data on the Outside vs. Data on the Inside", Oxigraph/TerminusDB maybe, Kafka/NATS JetStream, or simpler: a single-writer log (like SQLite-backed or a Git-notes approach). Actually a pragmatic recommendation: use Git itself as the source of truth for repo state, and an event log (NATS JetStream or Postgres with an append-only table, or Event Store DB) for engineering events. Provenance: W3C PROV-O, in-toto, SLSA, Sigstore.
   - **Content addressing**: Nix-style hermeticity; CAS like Bazel's remote cache; IPFS-style CIDs for artifacts. Reproducibility: Nix, Bazel, Pants, Buck2. Recommendation: adopt Nix for dev shells and hermetic toolchains; Bazel or Pants if monorepo build performance matters — but weigh complexity.
   - **Repository intelligence**: replace bespoke embeddings-first RAG with a hybrid: tree-sitter for syntax, SCIP (Sourcegraph's code intelligence format) / LSIF for symbol graphs, Glean (Facebook's code query system, open-sourced) or CodeQL (GitHub; free for open source, commercial for private) for semantic queries; embeddings as a recall layer only, always verified by deterministic lookup before claims are made. Cite: Sourcegraph, SCIP spec, tree-sitter, CodeQL, Glean, Joern (code property graphs), Kythe (Google). The "repository hallucination" failure mode is directly addressed by: no natural-language claim about the repo without a resolvable evidence URI (file:lines + content hash + commit).
   - **Verification architecture**: 
     - Policy as code: OPA/Rego for governance rules (config authority, ownership, forbidden paths).
     - Pre-merge gates: hermetic CI, deterministic builds, test selection (e.g., Launchable-style or Bazel's test caching), mutation testing (Stryker, mutmut, cosmic-ray for Python; PIT for JVM), coverage of invariants not lines.
     - Property-based testing: Hypothesis (Python), fast-check (JS), QuickCheck. Metamorphic testing for AI outputs.
     - Formal methods where cheap: TLA+ for protocol/model checking of orchestration invariants; Alloy for data-model invariants. The orchestration kernel itself is the highest-value target for a TLA+ spec (determinism, exactly-once semantics, no lost receipts).
     - Differential testing of AI-produced code; shadow execution.
     - The "green tests that failed to prove intended invariants" failure mode: introduce contract-level tests, mutation testing to prove tests actually constrain behavior, and "invariant-first" task specs: every mission must declare verifiable acceptance predicates before execution (like design-by-contract + fit criteria; cite "requirements as tests", property-based testing, and maybe "test desiderata" — also Hamlet's idea of adequate testing).
     - Two-reviewer correlation: diversify reviewers (different model families, different context windows, different tools), and crucially, make one verifier non-LLM where possible (static analysis, tests, type systems). Cite: N-version programming, ensemble diversity research, "LLMs as judges" failure literature.
   - **Orchestration**: durable execution engines — Temporal (open source, MIT), Cadence, Restate, DBOS. Strong recommendation: Temporal for mission execution; agents become stateless activities; retries, timeouts, heartbeats, replay (Temporal's workflow replay gives determinism requirements that align beautifully: workflow code must be deterministic — which forces the discipline this project wants). LangGraph etc. are agent frameworks but weaker on durability; could be used inside activities. Cite: Temporal's determinism model, event history replay. Also mention: durable execution vs bespoke runtime — the current bespoke runtime/orchestration should be replaced by Temporal unless there's a compelling reason; the custom code moves into activities + policies.
   - **Sandboxing/execution isolation**: microVMs (Firecracker), gVisor, Kata; devcontainers; Gitpod/Devpod; e2b, Modal; or simply OCI containers with seccomp + network policies. For AI-executed commands: default-deny network, read-only mounts except workspace, no credentials ambient. Cite: Firecracker paper (NSDI'20), gVisor.
   - **Secrets**: no secrets in agent context ever; short-lived credentials via OIDC/SPIFFE/SPIRE; Vault. This aligns with "no secrets" in system prompt.
   - **Memory architecture**: split into (a) immutable facts (event log/receipts), (b) derived indexes (embeddings, graphs) which are disposable and rebuildable, (c) doctrine (versioned, human-governed markdown in the repo, applied via prompts as data), (d) model context assembly as a pure function of (task, indexes, doctrine). Memory writes go through a "promotion" pipeline: session note → reviewed fact → committed doctrine. Prevents prompt contamination: provenance-tagged context, instruction hierarchy, data/instruction separation, spotlighting (cite Microsoft "Defending Chatbots against prompt injection" — spotlighting paper), CaMeL (Google DeepMind's capability-based defense), MCP security considerations.
   - **Prompt contamination / injection**: treat all repository content and tool outputs as untrusted data. Use structured channels (not string concatenation), signed/trusted instructions only from governance layer, CaMeL-style capabilities for tool use, and output filtering. Cite: Simon Willison's lethal trifecta, CaMeL paper (Debenedetti et al. 2025), spotlighting, "prompt injection" defenses literature; also the AgentDojo benchmark.
   - **Receipt architecture**: standardize on in-toto attestations + SLSA provenance levels; Sigstore for signing; receipts as W3C PROV documents; store alongside artifacts in an OCI registry (oci artifacts, e.g., via ORAS). Each mission emits: mission spec (hash), plan, events stream (hash chain), diff (commit), verification results (attestations), approvals. Hash chaining (like Certificate Transparency logs, Merkle trees) for tamper evidence. Cite: in-toto paper (USENIX Sec'19), SLSA, Sigstore, Rekor transparency log.
   - **Mission architecture**: define Mission = (intent, scope, acceptance invariants, authority budget, evidence requirements). Missions are data (declarative YAML/JSON), not code. Decompose: planner → plan (DAG of tasks with contracts) → workers (Clauditos equivalents, ephemeral) → verifiers (independent) → committer (only path to mutation). Segregation of duties: the agent that writes code cannot approve it; the tool that mutates the repo only accepts diffs with valid attestations (policy-enforced, not prompt-enforced). This is the key anti-drift mechanism: **make the engineering process the only write path** — enforce at the tooling level (branch protection, CODEOWNERS, OPA admission checks, required attestations on PRs), not at the prompt level.
   - **Capability architecture**: capability-based security (object capabilities, capabilities as unforgeable tokens); each worker gets least authority (which files, which tools, which network, time budget). Cite: Mark Miller's capability work, Capsicum (FreeBSD), Macaroons/Biscuit tokens for decentralized auth. Biscuit is nice for attenuable tokens.
   - **Governance**: risk-tiered autonomy — tier 0 (read-only) fully automated; tier 1 (tests, docs, small refactors) automated with receipts; tier 2 (behavior changes) requires human approval checkpoint; tier 3 (security-critical, auth, crypto, infra) requires human-authored or human-co-signed changes. Define blast-radius controls, canary merges, feature flags. Human governance UI: the human reviews evidence bundles, not raw diffs alone — diff + invariants + test evidence + provenance. Cite: Google's "human in the loop" SRE practices, code review research.
   - **Determinism**: record/replay of LLM calls (seed control where available, caching layer like a model gateway — LiteLLM, Portkey, Helicone — but for engineering use a content-addressed model-call cache keyed by (model, params, prompt hash) so replays are deterministic); temperature 0 for verification paths; canonical serialization (JCS/JSON canonicalization) before hashing; timezone/locale pinning; hermetic toolchains.
   - **Build vs buy**: 
     - Buy/adopt: Temporal (or self-host), Postgres, NATS, OPA, Sigstore/in-toto, tree-sitter/SCIP/CodeQL, Nix, devcontainers, OpenTelemetry, Grafana/Prometheus or better: use OTel + a warehouse. 
     - Keep internal: doctrine, mission schemas, the policy packs, the verifier prompts (as data), the evidence schemas, repo-specific invariants. 
     - Commercial options: Sourcegraph (Cody/Amp? careful), GitHub Copilot Workspace, Cursor, CodeQL (free for OSS), SonarQube, Linear-style tracking, Honeycomb/Datadog, Modal/e2b for sandboxes, Launchable (test selection, though Launchable was acquired—need care; maybe say "predictive test selection, e.g., the approach popularized by Launchable/Meta's Sapienz" — Sapienz is a testing tool, predictive test selection from Meta paper). Actually keep commercial recs generic with examples and flag that procurement is context-dependent.
   - **Mercury/Clauditos/Receipts/Memory/RepoIntel/Runtime verdicts**:
     - Mercury (repo-grounded verification, RAG): retain the *function* (adversarial verification, contract verification) but re-platform retrieval onto deterministic code intelligence (SCIP/tree-sitter/graph) + embeddings as recall; make every claim evidence-linked; split "retrieval" from "adversarial review"; reviewers must be independent and tool-diverse.
     - Clauditos: the concept (bounded workers) is right; re-implement as ephemeral sandboxed workers spawned by the orchestrator with capability tokens; structured outputs via JSON Schema function calling; no shared mutable state between workers; workers never hold credentials.
     - Receipts: migrate to standard attestation formats (in-toto/SLSA) over a hash-chained log; keep existing receipts via a one-time import as legacy events.
     - Memory: decompose into event log (facts), derived indexes (rebuildable), doctrine (versioned), and context assembly (pure function); memory promotion pipeline with human review.
     - Repo intelligence: replace bespoke index with SCIP indexers + tree-sitter + a graph store; keep embeddings layer but only as recall with deterministic verification.
     - Runtime/orchestration: replace the bespoke engine with durable execution (Temporal); keep the capability routing ideas as activity registries and policy.
   - **Repository search completeness**: dual-index strategy — lexical (Zoekt, Sourcegraph's indexer, or ripgrep at query time for exactness) + symbol graph + embeddings. Rule: embeddings never authoritative; exact-match cross-check. Cite Zoekt.
   - **Long-horizon context**: missions decompose into small tasks with explicit context bundles; the event log allows reconstruction; "context as a build artifact" — context bundles are content-addressed and cached; progressive disclosure. Cite: context engineering practices, MemGPT/Letta research for memory tiers, and "Lost in the Middle" (Liu et al. 2023) for why stuffing context fails.
   - **False confidence / correlated reviewer failures**: N-version review with diversity mandates (different model providers, different prompts, one deterministic analyzer); calibration: track verifier precision/recall against ground truth from CI outcomes; verifier scorecards; require at least one non-LLM check for tier ≥1.
   - **Config authority violations**: single source of truth enforced by policy: config schema registry, config linter in CI, "no config outside X" OPA rules, runtime config attestation.
   - **Hidden state/ownership**: CODEOWNERS generated from the event log + module graph; state inventory scans; forbid global mutable state via static analysis (custom Semgrep rules).
   - **Silent mutations**: repo write path only via orchestrator service identity; branch protection; signed commits (Sigstore gitsign); audit alerts on any out-of-band change (periodic reconciliation: compare event log vs git log — any commit without matching mission events is flagged; humans can commit but commits get reconciled and attributed).
   - **Production/test divergence**: environment as code (Nix/devcontainers/OCI image digests), test against the same artifact digest that ships; hermetic CI; ephemeral environments (Kubernetes namespaces or local kind).
   - **Regression from partial understanding**: impact analysis from the symbol graph drives test selection and mandatory review scope; "you changed X, its dependents Y must be covered".
   - **Green tests ≠ invariants**: mission requires invariant declarations; verifier checks invariants map to tests; mutation testing sample on critical modules to prove test strength; property tests for core domains.

4. **Migration strategy**: strangler-fig pattern. Phase 0: evidence baseline (start logging events now, even without new architecture — wrap existing runtime). Phase 1: receipts standardization + git reconciliation loop + branch protection. Phase 2: Temporal adoption for one mission type (e.g., "run tests and attest"). Phase 3: repo intelligence rebuild (SCIP index nightly, query API). Phase 4: worker sandboxing + capabilities. Phase 5: policy as code enforcement (OPA in CI admission). Phase 6: memory refactor. Each phase shippable, with kill criteria. Also: dual-run old/new with reconciliation; never big-bang.

5. **Roadmap**: concrete 0-30/31-90/91-180/180+ day plan with measurable exit criteria (e.g., "% of commits with mission attestation", "verifier escape rate", "median time to reconstruct any historical decision", "rebuild time of indexes", "replay determinism rate").

6. **Risks/failure modes of my own proposal**: complexity explosion, event-log bloat, Temporal learning curve, over-governance killing throughput, policy ossification, cost of N-version review, sandbox escape risk remains, model determinism limits (providers don't guarantee determinism; mitigate via caching + pinning + replay validation), Nix adoption cost, SCIP indexer gaps for dynamic languages, CodeQL licensing for private repos, team of one/human governance bottleneck, "the process becomes the bottleneck" — must have escape hatches with audit.

7. **Strongest criticisms of my own proposal**: 
   - It's a lot of infrastructure for what may be a small team; the honest answer may be "80% of this is overkill; do the 20%: write path control, receipts, durable orchestration, repo intelligence rebuild".
   - Durable execution + event sourcing can become a religion; simple Postgres + idempotent workers might suffice at this scale.
   - N-version review costs tokens and time; correlated failures may persist anyway.
   - Evidence-linked claims don't prevent semantic-level hallucination (wrong interpretation of correct code).
   - Temporal's determinism constraints are painful with LLM nondeterminism; you must isolate all LLM calls into activities — doable but requires discipline.
   - Standardization (in-toto/SLSA) is designed for supply chain, not cognition; fitting "engineering reasoning" into attestations is novel and may need custom payloads.

8. **What I'd preserve / build differently / concrete steps**: the final answer section. Preserve: the *intent* of Mercury (adversarial verification), bounded workers, receipts concept, doctrine-as-data, the failure-mode catalog itself (it's gold — turn it into a test suite for the runtime: "chaos engineering for the engineering process": inject silent mutation, check detection). Build differently: stop building bespoke infra where mature tools exist; put enforcement at tooling layer; models as commodities behind a gateway.

Also the user asked to "read the repository broadly" — I must be honest: I cannot. I'll state that clearly, and structure the review so it's conditional: "verify these assumptions against repo reality" checklists. I should avoid fabricating any specifics about the repo (file names, languages) — although I can note the branch name suggests multi-asset/symbol-state work (sounds like trading/finance domain? "multi-asset symbol state" suggests possibly a trading system). I should be careful: don't assume domain. Mention that if it's Python/TS the tool choices differ; give per-language notes (Semgrep language-agnostic, mutation testing per-language, etc.).

Citations I should use (only ones I'm confident about):
- Temporal (temporal.io), durable execution; workflow determinism & replay docs.
- Event sourcing: Martin Fowler's bliki; Pat Helland, "Life beyond Distributed Transactions" / "Data on the Outside vs. Data on the Inside" (2005/2016). 
- in-toto: Torres-Arias et al., USENIX Security 2019. SLSA framework (slsa.dev). Sigstore (sigstore.dev), Rekor transparency log; gitsign.
- W3C PROV-O provenance model.
- OPA/Rego (openpolicyagent.org).
- tree-sitter (Max Brunsfeld), SCIP (Sourcegraph), LSIF (Microsoft), Glean (Facebook, open-sourced 2022/2023), CodeQL (Semmle/GitHub), Joern (code property graph, ShiftLeft → Qwiet; open source), Kythe (Google). Zoekt (Sourcegraph code search).
- Nix (NixOS), Bazel, Pants, Buck2; hermetic builds; remote caching; "Reproducible Builds" project.
- Hypothesis (David MacIver), QuickCheck (Claessen & Hughes, ICFP 2000), fast-check.
- Mutation testing: academic roots (DeMillo, Lipton, Sayward 1978 "Hints on test data selection"); Stryker, mutmut, PIT.
- TLA+ (Lamport; "The TLA+ Home Page"; Amazon's use of TLA+ — Newcombe et al., "How Amazon Web Services Uses Formal Methods", CACM 2015). Alloy (Daniel Jackson).
- Property/metamorphic testing: Chen et al. "Metamorphic Testing: A Review of Challenges and Opportunities" (2018).
- N-version programming: Avizienis & Chen (1977).
- Firecracker: Agache et al., NSDI 2020 ("Firecracker: Lightweight Virtualization for Serverless Applications"). gVisor.
- Capsicum (Watson et al., FreeBSD capabilities), Macaroons (Birgisson et al., 2014), Biscuit tokens.
- SPIFFE/SPIRE for workload identity.
- Prompt injection defenses: "StruQ" (Chen et al. 2024, structured queries), "Spotlighting" (Hines et al., Microsoft 2024), CaMeL (Debenedetti et al., Google DeepMind 2025), AgentDojo benchmark (Debenedetti et al., NeurIPS 2024 D&B), Simon Willison's "lethal trifecta" essays, OWASP LLM Top 10.
- "Lost in the Middle": Liu et al., TACL 2024.
- MemGPT (Packer et al. 2023) / Letta.
- Retrieval: dense retrieval — DPR (Karpukhin et al. 2020); hybrid retrieval; RAG (Lewis et al. 2020). Repo-level: "RepoBench", "SWE-bench" (Jimenez et al. 2023), "SWE-bench Verified". GraphRAG (Microsoft). Code search neural net (Gu et al.). Maybe keep to confident ones.
- Tracing: OpenTelemetry.
- DORA metrics / Accelerate (Forsgren, Humble, Kim) for throughput measurement.
- Supply chain: "Backstabber's Knife Collection" (Ohm et al. 2020) maybe unnecessary.
- Sapienz (Mao et al., Facebook) for automated testing; predictive test selection (Meta/Facebook "Predictive Test Selection" — Machalica et al. 2019).
- Google: "Testing at the speed and scale of Google" (Whittaker et al.), TAP (Train of failures?). Fine.
- Chaos engineering: Netflix Chaos Monkey; "chaos engineering" principles — adapt as "process chaos": inject known failure modes.
- Humble & Farley Continuous Delivery; "Trunk-based development"; branch protection; CODEOWNERS.
- Conftest (OPA for config files), Checkov maybe.
- Semgrep (r2c; LGPL engine).
- CodeCarbon? unnecessary.
- DVC? unnecessary.
- LakeFS (data versioning) — maybe mention as option for large artifacts.
- Dolt (versioned SQL DB) — maybe as curiosity.
- NATS JetStream, Kafka, EventStoreDB, Postgres logical decoding / Debezium for CDC.
- CRDTs? probably not needed; skip or brief.
- Trunk/Monorepo: Bazel only if needed; caution.
- DevContainers spec, Gitpod, Codespaces.
- Model gateway: LiteLLM (open source), Helicone, Portkey; prompt caching semantics; OpenAI seed parameter (best-effort determinism), Anthropic... careful with claims about determinism guarantees: state that providers offer best-effort, not guaranteed determinism.
- Human oversight: EU AI Act? unnecessary.
- "Google SRE book" for toil, error budgets — adapt error budgets to autonomy budgets.
- ADRs (Architecture Decision Records — Michael Nygard's post) — fold into receipts/doctrine.
- C4 model (Simon Brown) for architecture docs.
- OpenRewrite / Moderne for large-scale automated refactoring (source-to-source transforms as recipes) — great fit: "refactoring as code" instead of freehand edits. Also jscodeshift, comby, ast-grep (nice!), grit.io (GritQL — acquired by Honeycomb; open source). ast-grep is a great recommendation for policy-as-code over syntax.
- Renode? no.
- Testcontainers for integration testing.
- Snapshot testing caution.
- Property contracts: Pact for consumer-driven contracts (services).
- Schema registry for events (Confluent Schema Registry or JSON Schema + Buf/Protobuf).
- Buf for protobuf management.
- OpenAPI for tool schemas.
- MCP (Model Context Protocol) — Anthropic's protocol, open standard, 2024; recommend adopting MCP as the tool interface layer so tools are model-agnostic; note MCP security issues and need for gateway/proxy (e.g., MCP gateways emerging). Good fit with "models replaceable".
- A2A (Agent2Agent, Google) — optional mention.
- LangGraph, CrewAI, AutoGen (Microsoft) — assess: use them only inside sandboxes/activities if at all; orchestration backbone stays Temporal.
- SWE-agent (Princeton), Aider, OpenHands (formerly OpenDevin) — existing agent runtimes; maybe reference as comparators, not adopt.
- Honeycomb/Datadog/Grafana LGTM stack; OpenObserve; Tempo/Jaeger.
- Faros? no.
- Keycloak? probably not needed.
- Vault (HashiCorp), SOPS + age (Mozilla SOPS) for secrets at rest, External Secrets Operator.
- Teleport? skip.
- Ory? skip.
- Rekor, Fulcio.
- Cosign for signing OCI artifacts; ORAS for pushing attestations.
- Guac (GUAC — Graph for Understanding Artifact Composition) — optional.
- OpenBao (Vault fork) — maybe mention licensing: HashiCorp BUSL; OpenBao is Linux Foundation fork. Careful accuracy: yes, OpenBao exists (2023/2024).
- Bacalhau? no.
- DBOS (durable execution on Postgres, FoundationDB? DBOS uses Postgres; MIT) — mention as lighter alternative to Temporal.
- Restate — lightweight durable execution; mention.
- Hatchet, Windmill, Prefect/Dagster (data), Kestra — workflow engines; Windmill is dev-toolish. Mention alternatives briefly.
- Inngest — durable functions; mention as SaaS option.
- LittleHorse? skip.
- Zep/Graphiti (temporal knowledge graph for agent memory) — interesting for memory layer; mention Graphiti (getzep) as optional.
- Mem0 — agent memory OSS; mention with caution (semantic memory drift).
- LlamaIndex/LangChain — cautionary: glue code, not durable.
- "The Log: What every software engineer should know about real-time data's unifying abstraction" — Jay Kreps (2013). Great citation for the event-log spine.
- "Designing Data-Intensive Applications" (Kleppmann) — general.
- "Thinking in Promises" (Burgess) — maybe skip.
- Promise theory / convergent systems — skip.
- "Out of the Tar Pit" (Moseley & Marks, 2006) — excellent citation for the philosophy: minimize accidental complexity, state management. Use.
- "No Silver Bullet" (Brooks) — essential vs accidental complexity.
- SRE Workbook — toil.
- "Site Reliability Engineering" — error budgets → autonomy budgets.
- "A Philosophy of Software Design" (Ousterhout) — deep modules; maybe.
- "Software Architecture: The Hard Parts" (Ford, Richards et al.) — fitness functions! Evolutionary architecture (Ford, Parsons, Kua — "Building Evolutionary Architectures") — fitness functions are a perfect match for this project: architecture governance as automated checks. Cite.
- "Fundamentals of Software Architecture" — tradeoff framing.
- "Engineering a Safer World" (Leveson) — STAMP; maybe for governance: treat AI agent failures as control problems. Nice: Leveson's STAMP/STPA for hazard analysis of the agentic runtime. Could cite briefly.
- ARACNE? no.
- "Verifier's dilemma"? skip.
- Anthropic's "Building effective agents" (Dec 2024) — simple composable patterns over frameworks; cite as guidance: prefer workflows to autonomous agents.
- OpenAI "A practical guide to building agents" — optional.
- "SWE-bench" and "SWE-bench Verified" (OpenAI 2024).
- "Multi-agent debate" (Du et al. 2023) — for diverse reviewers; also "self-consistency" (Wang et al. 2022). Use for reviewer ensemble justification.
- "Constitutional AI" (Bai et al. 2022) — doctrine-as-constitution; optional.
- "Reflexion" (Shinn et al. 2023) — agent self-critique with episodic memory; relevant to Clauditos + memory.
- "Voyager" (Wang et al. 2023) — skill library; relevant to capability architecture.
- "Generative Agents" (Park et al. 2023) — memory stream + reflection; relevant to memory architecture.
- "DSPy" (Khattab et al.) — prompts as compiled, optimizable programs; great fit for "continuously optimized" processes: version prompts, evaluate, optimize. Recommend prompt management as data + eval harness (e.g., promptfoo, Braintrust, LangSmith (commercial), Arize Phoenix (OSS)).
- OpenTelemetry GenAI semantic conventions — for tracing model calls.
- "MLflow"? no.
- Evidently AI? skip.
- "RAGAS" for RAG evals — mention for Mercury's retrieval quality measurement.
- "CodeRAG-Bench"? maybe too niche; skip or mention repo-level evals (RepoEval, CrossCodeEval — CCEval (Ding et al.) for cross-file code completion). Use RepoBench/CrossCodeEval cautiously; SWE-bench is the anchor.
- "TracePair"? no.
- "JaCoCo"? per-language coverage; skip details.
- "Diffblue Cover" (commercial Java test gen) — commercial example; "CodiumAI/Qodo" (test gen); "Symflower"; "Trunk" (meta-linter); "Graphite" (stacked diffs) — stacked changes are a great throughput pattern for AI agents; mention.
- "Merge queues" (GitHub merge queue, Bors-NG, Zuul) — recommend merge queue as the single mutation gateway. Excellent fit: all mutations land via merge queue with required checks — deterministic, ordered, auditable.
- "Trunk-Based Development" site (Paul Hammant).
- "Bazel remote execution"? maybe.
- "Earthly"? skip.
- "Dagger" — programmable CI; optional mention.
- "GitHub Actions / GitLab CI / Buildkite" — CI substrate; Buildkite for hybrid control; GHA fine.
- "Forgejo/Woodpecker"? skip.
- "Renovate/Dependabot" — dependency updates as missions! Great: dependency upgrades are the canonical automated-mission archetype.
- "OpenSSF Scorecard" — optional.
- "OpenRewrite" again for recipe-based refactors — strong rec.
- "Semgrep" for custom rules to kill hidden state patterns.
- "ast-grep" for codemods.
- "grcov/tarpaulin"? skip.
- "cargo-nextest"? language-specific; skip unless noting per-language matrix.
- "Pact" for contract tests.
- "Schemathesis" for API property testing — optional.
- "Toxiproxy" for fault injection; "Chaos Monkey".
- "Antithesis" (commercial deterministic simulation testing — FoundationDB-style; very relevant to determinism goal!) — cite Antithesis as commercial; FoundationDB's simulation testing paper ("FoundationDB: A Distributed Unbundled..."). Deterministic simulation for the runtime itself is aspirational; mention.
- "Hermit" (Cash App's toolchain manager), "asdf", "mise" — dev tool pinning alternatives to Nix (lighter). Mention mise as pragmatic alternative.
- "Devbox" (jetify) — Nix made easy; mention.
- "Flox" — commercial-ish Nix; mention.
- "devpod" — OSS devcontainers.
- "Coder" — OSS workspaces; mention as option for sandboxed dev envs.
- "E2B", "Modal", "Fly.io machines", "Kata", "Firecracker" for sandboxes.
- "nsjail" (Google