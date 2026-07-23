# Principal Systems Architecture Review — Fable Independent Report

Author: Fable / Claude Code
Mode: independent `claude -p --model fable` run
Prompt: `ogz-meta/inbox/fable/2026-07-22/principal-systems-architecture-review-prompt.md`
Started: 2026-07-22T23:21:37.866Z
Ended: 2026-07-22T23:33:10.140Z
Exit status: 0
Raw JSON receipt: `ogz-meta/inbox/fable/2026-07-22/codex1-result-principal-architecture-fable-independent.raw.json`
File writes are blocked in this session's permission mode, so the review lives here in full — if you want it as a durable doc under `ogz-meta/inbox/`, say the word and I'll write it once permissions allow.

---

# Principal Systems Architecture Review — OGZPrime Engineering Runtime

**Basis:** five parallel repository surveys this session (Mercury bridge, Claudito orchestration + claude-bridge, receipts/memory surfaces, repository intelligence, trading runtime + gates), plus direct reads of TheDoctrine.md, GRAND-SCHEME.md, MASTER-ROLLOUT.md, and the claudito cognition refactor plan. Repository reality was the evidence source throughout; nothing below is a mutation — this is review and proposal only.

## 1. Thesis

The durable asset in this ecosystem is not the orchestration code. It is four things:

1. **The Doctrine** — process law derived from real incidents, with an explicit authority order and a landmine catalog.
2. **The fail-closed enforcement layer** — claude-bridge's PreToolUse/Stop gates: read-before-edit, inspection-only Bash, adversarial-proof-before-stop, task-contract write scopes. (It blocked my own shell redirects this session. It works.)
3. **The evidence discipline** — receipts, run ledgers, session docs, proof contracts.
4. **The executable invariants** — the P0 golden-run gate with ledger conservation, the config-boundary AST scan, the DTO lint, the secrets scan, and the genuinely shared backtest/live trading path.

Those four *are* the portable engineering operating system your mission statement asks for. Most of the rest — three divergent pipeline definitions, six overlapping index systems, five hand-synchronized record surfaces — is scaffolding that grew around them and now costs more than it returns. The next generation is a **consolidation, not a rebuild**: one mission engine, one receipt spine, one intelligence service, one policy source.

## 2. Ground truth (what the surveys actually found)

**Mercury is your strongest asset with the weakest operations.** The engineering is genuinely sophisticated: hybrid cosine+BM25+RRF retrieval, embedding-identity quarantine that prevents mixed-vector corruption (`mongo-store.js:218-239`), a sandboxed `run_check` that snapshots tracked files into a tmpdir with sanitized env and git-mutation blocks, cross-model Fable review that treats a malformed verdict as blocking (fail-safe), and redacted run ledgers. But operationally: the index is full-rebuild, manual-trigger only, and *nothing blocks queries against a stale index* — freshness is passive metadata. The answer-quality gates (missing file:line citation, uncited run_check claim) are advisory flags, not enforcement (`react-loop.js:599-609`). Retrieval is O(N) over the whole corpus per query. The README documents a different embedding model than the config uses — doc drift inside the anti-drift system.

**The Claudito pipeline has three competing definitions and one real spine.** `pipeline.js`'s static arrays, `pipeline-supervisor.js`'s 18-step prose flow, and the `.claude/commands/*.md` skills disagree on stage order. Roughly 150KB of phase code (`pipeline-phase7/7b/9/10/12.js`, `pipeline-supervisor.js`, `execute-mission.js`) is referenced nowhere. The inter-Claudito bus is one mutable `manifests/current.json` with no locking; the rich per-agent manifest schema is aspirational because real manifests are ephemeral. `/branch` is a no-op that prints merge guidance for a branch never created; `/committer` is never sequenced. Meanwhile the claude-bridge layer underneath is real, fail-closed engineering — but its hot-path list is triplicated across `enforce-pipeline.sh`, `finish-gate.js`, and `policy.js`, and "adversarialness" of a Mercury proof is judged by *counting keywords* — a lexical gate on a semantic property.

**Receipts: five surfaces, one reader, manual glue.** `fixes.jsonl` (90 entries) is the *only* machine-queried memory in the whole ecosystem — and it's regex-fed from markdown headings, with `commit: null` in every sampled row: receipts aren't linked to the commits they describe. The same fact is hand-propagated across up to six surfaces (fixes.jsonl, session doc, CHANGELOG, cognition-history, commit-handoff, recent-changes) via a human checklist. And the semantic vector index has **never been built** — `rag-embeddings.js` has silently fallen back to keyword-only since inception, and its consumers don't know.

**Repository intelligence: six systems, mostly dark.** Mercury's Mongo index (live, manual refresh); the never-built MiniLM RAG; a keyword RAG whose own 388KB precomputed index is defined but never read; bombardier's 12.3MB call-graph cache from March loaded with zero staleness check; broken orphan forks of the Mercury bridge in `ogz-meta/` that would throw MODULE_NOT_FOUND; and Sourcegraph/Pharaoh wired only through prose and interactive MCP auth, invisible to automated runs. Meanwhile `tools/serena-bridge.js` — already feeding blast-radius into Mercury dispatches — quietly overlaps four of them and actually works.

**The trading runtime has a strong invariant culture and concentrated fragility.** 177 Jest files skewed toward contract/ownership/scope tests; a P0 gate asserting both frozen golden numbers *and* per-trade ledger conservation; backtests genuinely driving the same runtime cycle as live with scope-identity refusal on mismatch. Against that: god files (ConfigLoader 4.5k lines, StateManager 4k, run-empire-v2 3.3k), config-boundary leaks still being chased (`UnifiedPatternMemory.js:230,248` reads `process.env` directly), and a half-wired multi-symbol migration ("Commit 2/6").

`★ Insight ─────────────────────────────────────`
The pattern across all five surveys is the same failure class in different clothes: **hand-maintained duplication**. Three pipeline definitions, three hot-path lists, six index systems, five record surfaces, README-vs-config drift. Your catalogued failures (architectural drift, stale docs, false confidence, hidden state) are mostly instances of "two copies of the truth, one rotted." The single highest-leverage architectural move available is not a new capability — it's collapsing every concern to one source of truth plus generated views.
`─────────────────────────────────────────────────`

## 3. Design principles derived from your failure record

1. **Enforcement at the tool layer, fail closed** — already doctrine, proven by the bridge; everything else assumes it.
2. **One source of truth per concern; everything else is a generated view.**
3. **Receipts must be born, not written** — any record a human must remember to propagate will drift; records should fall out of process execution, commit-linked at creation.
4. **Freshness is a gate, not metadata** — an index that silently serves stale truth turns the anti-hallucination system into a hallucination amplifier.
5. **Verify semantically what is gated lexically today** — structured verdicts, not keyword counts.
6. **Reviewer diversity beats reviewer redundancy** — Mercury + Fable cross-model review is the correct defense against correlated reviewer failure (LLM-judge bias research supports independent, differently-grounded reviewers). Deepen it.
7. **The escape hatch must exist** — a runtime permitting only formal missions gets bypassed under pressure ("you will if you can"). Exploration must be cheap and receipt-producing; only *mutation* gets gated.

## 4. Target architecture

**4.1 Policy layer (extract).** One module owning hot-path prefixes, protected paths, indexable paths, mutation rules, and Mercury dispatch law — consumed by the bridge, the finish-gate, the indexer, and the mission engine. Kills the three divergent hot-path lists. The Doctrine stays prose law; policy.json is its executable projection, with a test asserting every rule in the Hookify Enforcement Catalog maps to a live gate (doctrine-to-enforcement traceability).

**4.2 Enforcement layer (keep, harden).** claude-bridge survives architecturally intact. Changes: consume the policy layer; retire `enforce-pipeline.sh` (subsumed by pre-edit + policy, and its `^core/` anchor is bypassable by path spelling); replace lexical proof checks with structured verdicts. Critically, the bridge CLI is already harness-agnostic — the `.claude` hook wiring is a thin adapter. A second adapter for any other harness makes the enforcement portable, which is your "models are replaceable, process is the asset" requirement made concrete.

**4.3 Mission engine (replace three definitions with one).** Missions as *data*: one declarative, zod-validated spec defining stages, gate conditions, loop-back rules, and approval points. The pipeline arrays, supervisor prose, and skill docs collapse into projections of this one spec — the engine executes it, the human-readable doc is generated from it. Replace the mutable `current.json` with an **append-only mission journal** (`missions.jsonl`): one event per stage transition, evidence attachment, verdict, approval, commit. Current state is a fold over events (event sourcing, Fowler). This fixes concurrency (append-only), post-hoc audit (the journal *is* the audit), replay, and enables receipts-born-not-written. The two-phase ADVISORY→approve→EXECUTE gate survives unchanged — it's the doctrine's production-approval rule in code. `/branch` becomes a real git-worktree checkout (`trees/` already exists) for isolated EXECUTE missions. Add **exploration missions**: read-only scope, full journal trail, no mutations — the sanctioned escape hatch that keeps discretionary work observable instead of underground. Explicitly *no* external workflow engine: Temporal/BullMQ solve distributed-durability problems this single-VPS, single-operator system doesn't have; a JSONL journal plus a ~300-line engine is auditable by grep, which is worth more here than durability guarantees.

**4.4 Receipt spine (five surfaces → one log + views).** Every journal event carries mission id, actor, stage, evidence refs (paths + hashes), verdicts, and — on commit — the SHA (post-commit hook stamps it; commits carry a `Mission-Id:` git trailer for the reverse link). This adopts the *shape* of in-toto attestations / SLSA provenance ("artifact X was produced by process Y from inputs Z") without the signing machinery, which can come later for white-glove licensing. `fixes.jsonl`, CHANGELOG entries, session-doc skeletons, and recent-changes become **generated projections** of the journal — the manual Recorder checklist dies, replaced by `journal render`. The regex ingestion of SURGICAL/FIX-*.md dies with it. Session docs stay append-only dated files per doctrine — skeletons generated, human judgment added on top. The runtime's TraceSpine/RuntimeAuditSink stay separate (product telemetry ≠ engineering receipts) but adopt the same schema discipline; aligning field names with OpenTelemetry span conventions is cheap and keeps export options open.

**4.5 Verification layer (keep diversity, add teeth).** Extend `ask.js` to emit a machine-readable verdict object (verdict, citations[], checks_run[], unresolved[]) and make the finish-gate consume *that* instead of counting adversarial keywords. Flip the react-loop answer-quality assertions from advisory to blocking for hot-path missions: no file:line citations → no verdict. Give the Fable consensus pass **read-only repo tools bounded to the cited ranges** — today it has none (`adversarial-review.js:246`), so it cannot catch Mercury citing a stale line; grounded cross-model review is your best weapon against correlated reviewer failure and false confidence. Promote the conservation invariants (ledger conservation, tier caps, long-only artifacts) to the primary P0 contract, keeping the frozen golden tuple as a drift tripwire — and make re-baselining a first-class approved mission that atomically updates EXPECTED_P0 + anchor doc + journal (formalizing what anchor-runner/anchor-doc already attempt). Add a **CI mirror**: GitHub Actions running `scan:secrets`, `lint:dto`, `scan:dto`, config-boundary, jest, and the P0 gate on every push — GitHub is doctrine's audit path; making the mirror *verify* closes the pushed-vs-verified gap. Generalize the bait-fixture pattern (c2b/c2c planted bugs) into a small seeded-bug library the pipeline must catch before a release of the pipeline itself is trusted — cheap mutation testing without adopting Stryker.

**4.6 Repository intelligence (six systems → one substrate + one symbol layer).** Consolidate on Mercury's Mongo index as the single retrieval substrate: ledger/journal events become a content_type in the same index (your own DEC-015 said this in April), and `rag-query`'s keyword scoring folds into the BM25 side it duplicates. Add incremental indexing keyed on `git diff --name-only <last_indexed_sha>` plus a **freshness gate** in ask.js (refuse hot-path on stale, warn otherwise) — reindex stays operator-commanded per doctrine; staleness just becomes loud. Serena (LSP-backed, already integrated) is the sole surviving symbol/blast-radius layer; bombardier's tree-sitter cache and dep-scanner's regex graph retire into it, with any Mermaid output regenerated from live data keyed on file hashes. Delete (forensic-archive first, with approval): the three broken bridge forks, `rag_index.json`, and the never-built MiniLM path. Sourcegraph stays as the human exploration surface; Pharaoh gets wired programmatically or dropped from the automated story — an interactive-auth MCP tool cannot anchor a pipeline. Vector scale: brute-force cosine is *fine* at this corpus size; when it isn't, swap in Atlas Vector Search or sqlite-vec behind `searcher.js` — a data-layer change, not an architecture change.

**4.7 Memory and governance (keep shape, close loops).** Doctrine remains the constitution, authority order unchanged. Trey governs through approvals, rulings, and `journal render --since` — an evidence-first digest replacing manual reconstruction from six surfaces. Promotion stays human-gated, but intake older than N days without a ruling surfaces in the digest as stalled — stalling becomes visible without automating authority away.

## 5. Asset dispositions

| Asset | Verdict |
|---|---|
| TheDoctrine + hookify catalog | **Keep** — the real product of 4,000+ sessions |
| claude-bridge enforcement | **Keep + harden** (shared policy, structured verdicts) |
| Mercury bridge core | **Keep + ops fixes** (freshness gate, blocking citations, incremental index) |
| Fable adversarial review | **Keep + give it repo read tools** |
| P0 gate / conservation checks / contract tests | **Keep**; invariants primary, golden tuple secondary |
| Shared backtest/live path | **Keep at all costs** |
| pipeline.js + slash-router handlers | **Merge** into the one mission engine |
| `current.json` manifest bus | **Replace** with event journal |
| approve.js / reject.js | **Keep** unchanged |
| pipeline-supervisor + phase7/7b/9/10/12 + execute-mission | **Delete** (forensic archive; re-verify unreferenced at delete time) |
| indexer_1 / ask_1 / mongo-store_1, rag_index.json, MiniLM vector path | **Delete** — broken/orphaned/never functioned |
| bombardier + dep-scanner + call-graph cache | **Replace** with Serena-backed graph |
| fixes.jsonl / CHANGELOG / recent-changes | **Keep as generated views**, commit-linked |
| Sourcegraph | **Keep** (human surface) |
| Pharaoh MCP | **Wire or drop** |
| enforce-pipeline.sh | **Retire** (subsumed, bypassable) |
| trai_brain product/brain files | **Extract** — the product's AI brain and the engineering OS are different systems sharing a directory |

## 6. Build vs buy

**Build:** the enforcement bridge (no off-the-shelf tool enforces read-before-edit + adversarial-proof-before-stop at the tool layer), the ~300-500-line mission engine, the verdict contract. **Adopt OSS:** zod (already a dependency) for every schema; git worktrees; Serena/LSP + tree-sitter as the one symbol layer; GitHub Actions; in-toto/PROV as receipt vocabulary; sqlite-vec/Atlas later if needed. **Keep commercial:** Sourcegraph; pluggable model providers (the Mercury-2 / Fable / GitHub-Models embedding seam already proves multi-provider — that seam *is* the model-replaceability requirement). **Rejected:** LangChain/LlamaIndex-class frameworks (the bridge already does retrieval + tool calling closer to the metal with better auditability), external workflow engines, vector-DB services, monorepo build systems — wrong scale, wrong problems.

## 7. Migration roadmap (nothing touches the trading hot path)

- **Phase 0** (1 session): forensic-archive + delete the ~10 orphans; extract the policy module; retire enforce-pipeline.sh; add the doctrine-to-gate traceability test.
- **Phase 1** (1-2 sessions): journal event schema; stage handlers and update-ledger emit events; post-commit SHA stamping + Mission-Id trailers; `journal render` generates fixes.jsonl and the operator digest, verified by parallel run before the regex ingester retires.
- **Phase 2** (1 session): incremental Mercury reindex + freshness gate.
- **Phase 3** (2-3 sessions): mission spec schema; port the pipeline arrays; generate docs from spec; wire /committer; real worktree /branch; delete the two stale definitions.
- **Phase 4** (1-2 sessions): structured verdict contract; blocking citation gates; reviewer read-tools; CI mirror; re-baselining as a mission type.
- **Phase 5** (2 sessions): ledger/journal into Mercury's index; Serena-backed blast radius; trai_brain separation; the runtime (bridge + engine + journal + doctrine template) becomes the portable, licensable artifact — directly relevant to the white-glove path in the Grand Scheme.

Phases 1-2 pay for themselves during the current Pass-1 sweep campaign; Phases 3-5 should wait for a natural pause in trading work.

## 8. Strongest criticisms of my own proposal

1. **Meta-work vs Apex.** The gravest risk is polishing the engineering OS while the mission is Apex extraction. The phase ordering mitigates but does not eliminate this; this review must not become a mandate to stop shipping.
2. **Projection drift.** Generated views can be hand-edited into divergence — mitigated by generated-from headers and a regenerate-and-diff reconciliation check, but that's complexity spent to remove complexity.
3. **Consolidation concentrates failure.** One intelligence service means a Mongo or embedding-provider outage stalls cognition. The degraded-mode policy must be explicit: fail closed for hot-path missions, loudly fail open for docs work.
4. **Formalization ossifies.** If micro-missions and exploration missions aren't genuinely cheap, humans and agents will route around the system — the exact failure the bridge exists to prevent.
5. **Structured verdicts can be gamed one level up.** A verdict is only as honest as its emitter; the permanent defenses are cross-model grounded review plus the mechanical checks (diff fingerprints, cited-file existence) — never remove those.
6. **This review's epistemics.** Five surveys sampled a very large repo; "referenced nowhere" claims should be re-verified at execution time, and anything promoted from this document into action goes through normal verify-before-claiming discipline.

## 9. The direct answer

**Preserve:** the Doctrine and its enforcement traceability; the fail-closed bridge; Mercury's retrieval/sandbox/ledger core; the cross-model adversarial pass; the two-phase approval gate; the P0 conservation invariants; the shared backtest/live path; append-only session docs; human promotion authority.

**Build differently:** one mission spec instead of three pipeline definitions; an append-only journal instead of a mutable manifest and five hand-synced record surfaces; receipts born commit-linked instead of transcribed; freshness as a blocking gate instead of metadata; structured verdicts instead of keyword counts; one retrieval substrate and one symbol layer instead of six; one policy module instead of three drifting lists; a CI mirror so the audit path actually verifies.

**First concrete steps (pending your approval):** Phase 0's deletions and policy extraction, then the journal schema. None of it touches core/, brokers/, modules/, or run-empire-v2.js.

`★ Insight ─────────────────────────────────────`
The deepest thing this repo demonstrates: an engineering OS built from incident-derived law + tool-layer enforcement + evidence receipts is *already* model-agnostic in its bones — the bridge CLI fronts every gate, and three different model providers already plug into it. What's missing isn't a new architecture; it's closing the loop on the parts that were built and never finished: the vector index never built, the manifests never persisted, the receipts never commit-linked, the freshness never gated. The next generation is mostly the last mile of the current one.
`─────────────────────────────────────────────────`

One follow-up worth flagging: the write of this review to `ogz-meta/inbox/fable/2026-07-22/` was denied by the session's permission mode. Per commit-handoff doctrine, this work currently exists only in this conversation — approve the write (or re-run in a session with write permission) and I'll land it verbatim so it's grep-able and citable.
