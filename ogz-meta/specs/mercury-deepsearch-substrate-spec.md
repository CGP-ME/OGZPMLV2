# Mercury DeepSearch Substrate Spec

**Date:** 2026-06-27
**Status:** Spec - Phase 0, doc-only
**Scope:** Mercury investigation substrate, work artifacts, code-intelligence tools, and review observability
**Non-scope:** Runtime trading behavior, broker behavior, dashboard behavior, P0 anchors, PM2 process changes
**Source brief:** Operator-provided `sourcegraphpdf.md` attachment, read 2026-06-27

---

## Why this exists

The Sourcegraph/DeepSearch lesson is not "put more text in the prompt." The
lesson is that agent quality in a large codebase is mostly determined by the
substrate around the model: what context is loaded by default, what context can
be discovered on demand, what artifacts survive the session, which tools are
selected, and what the operator can see without reconstructing the run.

Mercury already has the right posture for OGZPrime: adversarial review, current
file citations, RAG as orientation, bounded repo tools, no write access, and
execution artifacts for allowed checks. The next step is to make that posture
more DeepSearch-like without re-caging Mercury:

- Durable work records over chat memory.
- Discovered code context over larger ambient prompts.
- Code intelligence as a first-class tool surface, not only grep.
- Tool descriptions shaped around developer intent.
- Review rules codified as executable greps.
- Observability that shows which tools Mercury actually uses and when they fail.

This spec defines that substrate. It does not authorize implementation by
itself.

---

## Sourcegraph principles to carry over

Source brief anchors from the operator attachment:

- `sourcegraphpdf.md:177-190`: agents are unreliable, work records are durable.
- `sourcegraphpdf.md:191-204`: context is bounded, available context is
  boundless.
- `sourcegraphpdf.md:225-279`: ambient, discovered, persistent, and
  operator-visible context are separate surfaces.
- `sourcegraphpdf.md:323-359`: codebase compasses and code intelligence are the
  high-leverage discovered-context layer.
- `sourcegraphpdf.md:362-380`: first-line tool descriptions materially change
  tool adoption.
- `sourcegraphpdf.md:431-485`: small-step loops, canaries, and tool
  observability are the substrate.
- `sourcegraphpdf.md:503-516`: stable work IDs join issue, plan, review,
  commit, and later audit artifacts.
- `sourcegraphpdf.md:669-715`: human interruptions should be limited to
  invariant conflicts, controller-reliability issues, review-finding patterns,
  and stability commitments.
- `sourcegraphpdf.md:827-871`: rules as greps plus the primitive test keep
  mechanism in code and policy in prompts.
- `sourcegraphpdf.md:875-885`: operator-stance memory should stay distinct from
  agent narrative.

### Asymmetry one: unreliable agents, durable work records

The Sourcegraph brief frames the durable work record as the recovery layer when
sessions crash, context compacts, workers resume on the wrong base, or model
behavior drifts. For Mercury, the equivalent is a run ledger that ties prompt,
repo state, dirty diff, tool calls, execution artifacts, answer-quality flags,
and verdict together under one stable work ID.

Current gap: Mercury has execution artifacts and tool telemetry, but not a
single durable run envelope that can be joined across prompt, answer, tests,
commit, and later review.

### Asymmetry two: bounded context, boundless available context

The brief separates ambient context from discovered context. Ambient context is
always loaded; discovered context is pulled during the session. The biggest
lever is not loading more by default. It is giving the agent better ways to find
the right files, symbols, call sites, and prior incidents when needed.

For Mercury, this means:

- Keep `mercury.config.json` short and adversarial.
- Use RAG and trace memory as orientation, never as proof when current code is
  needed.
- Add summoned "compass" documents for subsystems instead of growing the system
  prompt.
- Add richer code-intelligence primitives so Mercury can discover references
  directly.

### Human attention is scarce

Mercury should interrupt Trey only for load-bearing categories:

- Invariant conflicts: a gate, P0 anchor, or safety rule says the change is
  wrong but the task claims otherwise.
- Controller reliability: Mercury, the bridge, tools, indexing, or run artifacts
  are unreliable enough that review claims cannot be trusted.
- Review-finding patterns: the same bug class keeps recurring and needs a rule,
  test, prompt change, or tool.
- Stability commitments: interfaces, schemas, or artifact contracts that future
  agents and tools will rely on.

Everything else should be handled by the substrate and surfaced in artifacts,
not turned into repeated operator interruptions.

---

## Current Mercury inventory

Current repo evidence, read 2026-06-27:

- `mercury.config.json:27-36` configures hybrid retrieval.
- `mercury.config.json:37-46` configures guarded trace memory with manual
  capture.
- `mercury.config.json:57-98` defines the adversarial agentic prompt, including
  tool-use discipline, RAG-as-orientation, reachable-control-flow proof, and
  repo citation requirements.
- `trai_brain/mercury-bridge/tool-adapter.js:1-20` centralizes Mercury's repo
  tools behind one bounds-checked read-only adapter.
- `trai_brain/mercury-bridge/tool-adapter.js:32-35` writes run-check execution
  artifacts under `ogz-meta/cognition-history/mercury-execution`.
- `trai_brain/mercury-bridge/tool-adapter.js:36-70` blocks unsafe command
  surfaces such as package managers, network tools, shell interpreters, PM2,
  and destructive binaries.
- `trai_brain/mercury-bridge/react-loop.js:205-314` summarizes tool telemetry:
  invocation count, success/failure, opened files, and run-check artifacts.

This is a strong base. The missing layer is not another confirmation prompt.
The missing layer is a recoverable, queryable investigation substrate.

---

## Design principles

1. Mechanism in code, policy in prompts.
   Tooling should expose deterministic primitives: find references, open files,
   run allowed checks, write run ledgers, and scan rules. It should not decide
   whether Mercury is "confused" or whether a finding is "important enough."

2. Fail closed at boundaries.
   Repo bounds, execution allowlists, secret filtering, artifact writes, and
   schema validation should fail closed. Answer-quality warnings can surface to
   the user, but host or repo boundary violations must not degrade silently.

3. Current code proof outranks memory.
   RAG chunks, trace memory, Sourcegraph-style compass docs, and prior session
   notes can route an investigation. They cannot replace current file:line
   evidence when Mercury makes a concrete claim.

4. Discovered context beats ambient expansion.
   Do not grow `mercury.config.json` into a large encyclopedia. Add summoned
   compasses, targeted tools, and durable artifacts that Mercury can fetch when
   the task needs them.

5. Tool adoption is a measurable product surface.
   If Mercury should use `serena_blast_radius`, `git_diff`, `run_check`, or a
   future `find_references` tool on a class of tasks, capture whether it did.
   Low adoption is a tool-description or prompt-routing bug.

6. One primitive per sharp edge.
   A new primitive earns its place only when it is atomic, improves as models
   improve, and contains no hidden judgment. Otherwise it belongs in prompt
   guidance or a compass document.

---

## Target substrate

### 1. Mercury work ID and run ledger

Add a durable run envelope under a repo-rooted path such as:

`ogz-meta/cognition-history/mercury-runs/YYYY-MM-DD.jsonl`

Each entry should be one JSON object with:

- `work_id`: stable join key, for example `MER-DS-0001`.
- `run_id`: unique invocation ID.
- `created_at`: ISO timestamp.
- `branch`, `head_sha`, `dirty_status_summary`.
- `prompt_hash`, `prompt_excerpt`, `attack_scope`.
- `source_refs`: explicit refs such as current diff, last commit, file paths,
  Sourcegraph brief section, or operator prompt.
- `tools_invoked`: current telemetry by tool.
- `files_opened`: exact file ranges.
- `run_check_artifacts`: artifact citations and exit codes.
- `answer_quality`: warnings emitted by the bridge.
- `verdict`: `found_break`, `no_break_found`, `cannot_verify`,
  `tool_failure`, or `blocked`.
- `commit_blocking`: boolean.
- `next_rule_candidate`: optional bug class that may need a rule-as-grep.

The ledger is not a chat transcript. It is the machine-readable audit contract
that lets a later agent reclaim, compare, or challenge the run.

Acceptance checks:

- Every agentic Mercury run writes exactly one final ledger row.
- A crash before final answer writes a partial row with `verdict: "blocked"` or
  `verdict: "tool_failure"` if the failure is known.
- Ledger rows do not include raw secrets, webhook URLs, or full prompt bodies
  when prompt text may contain secrets.

### 2. Codebase compass docs

Add summoned subsystem compasses under:

`ogz-meta/cognition/mercury-compasses/`

Each compass is short and names the first files Mercury should read for a class
of work. Candidate compasses:

- `trading-path.md`: orchestrator, broker factory, order execution,
  state/persistence, TTP/cutoff gates, active position semantics.
- `dashboard-ws.md`: WebSocket emitters, subscribers, `/ws` boundary,
  dashboard token containment, historical candle relay.
- `proof-track-record.md`: raw journals, generated proof JSON, partial/full
  close semantics, publisher entry points.
- `mercury-bridge.md`: config, ask entry point, ReAct loop, tool adapter,
  telemetry, indexer, run-check artifacts.
- `p0-gate.md`: canonical runner, current expected anchor, latest report
  pointer, stale-pointer landmine.

Compass rules:

- Maximum one screen if possible.
- List 3 to 6 files to read first.
- Name the common bug classes for that subsystem.
- Include current source-of-truth docs.
- Do not duplicate large architecture prose.

### 3. Intent-shaped tool descriptions

Rewrite Mercury tool descriptions so the first sentence maps to developer
intent. This follows the Sourcegraph finding that the first line of a tool
description drives adoption.

Examples:

- `grep`: "Find every current repo occurrence of a string when you need sibling
  violations, consumers, or exact literals."
- `regex_grep`: "Find all current repo matches for a bug pattern or rule when a
  literal search is too narrow."
- `git_diff`: "Inspect the active change, staged diff, or recent commit when the
  review depends on what changed."
- `serena_blast_radius`: "Find downstream files that can break when this file or
  event contract changes."
- `run_check`: "Run an allowed proof command and save the output artifact when a
  concrete claim depends on execution."

Acceptance checks:

- Tests assert the first sentence for each tool is present in the exported tool
  schema.
- Tool telemetry from canary runs shows expected tool adoption for at least one
  dependency-tracing, diff-review, and executable-proof task.

### 4. Symbol-level code-intelligence primitives

Current `serena_blast_radius` is useful, but it is still coarse. DeepSearch's
core advantage is code intelligence that can return full reference sets instead
of partial grep answers.

Add read-only primitives after the ledger and tool-description phases:

- `find_definition(symbol, file?)`: resolves a function, class, exported value,
  event constant, or config key definition.
- `find_references(symbol, file?)`: returns callers/usages/importers with
  file:line citations.
- `trace_callers(file_or_symbol)`: returns upstream callers and relevant event
  emitters/subscribers.
- `trace_consumers(dto_or_event)`: returns producer and consumer contract
  surfaces for DTO or WebSocket shape changes.

Implementation can start with existing Serena/dep-scanner machinery and ripgrep,
then graduate to AST/tree-sitter where regex cannot safely model the question.

Acceptance checks:

- These tools are read-only and repo-bounded.
- Results include file:line citations and truncation metadata.
- The tools expose uncertainty rather than fabricating a complete graph.
- Canary tasks demonstrate improved recall over grep-only investigations.

### 5. Rules as greps

Codify recurring Mercury and operator findings into a rule corpus:

`ogz-meta/cognition/mercury-rules/`

Each rule file should contain:

- `name`
- `pattern` or `patterns`
- `mode`: fixed string, regex, AST, or custom scanner
- `prevents`: one-line failure mode
- `source_incident`: session doc, commit, or run ledger ID
- `worked_example`
- `prune_condition`: when to delete or demote the rule

Candidate first rules:

- No public dashboard HTML with `WEBSOCKET_AUTH_TOKEN`.
- No proof JSON partial exits mislabeled as full close.
- No trading-path fallback that substitutes plausible defaults for missing
  trading-critical data.
- No same-direction active-position stacking unless a current spec explicitly
  allows it.
- No mode-only learned-state paths for asset-aware persistence.

Rules should be runnable by a future `rule_scan` Mercury tool and by human
scripts outside Mercury.

### 6. Canary suite

Maintain a small set of known-answer Mercury tasks. They are not production
reviews. They are substrate health checks.

Candidate canaries:

- Find the current P0 expected anchor in the gate runner.
- Identify why generated proof JSON cannot be trusted if partial/full close
  semantics disagree with raw journals.
- Trace consumers of a representative WebSocket event.
- Prove whether a change touches hot-path trading code or docs only.
- Find all callers/usages of a narrow function with expected recall count.

Canaries should run after Mercury bridge changes, indexer changes, and model or
tool-description changes.

### 7. Surfacer digest

Add a periodic digest that summarizes:

- Mercury runs by verdict.
- Tool invocation counts and failures.
- Runs with answer-quality warnings.
- Runs that used no `open_file` before making code claims.
- Runs after a push where indexer freshness was not proven.
- Rule candidates that appeared more than once.
- Canary regressions.

This digest protects operator attention. It surfaces substrate drift and
recurring bug classes instead of requiring Trey to remember which reviews felt
off.

---

## Phased rollout

### Phase 0 - Spec only

Create this spec. No code changes.

Done when:

- The desired substrate is written down.
- Current Mercury capabilities and gaps are named from repo evidence.
- The first implementation slice can be selected without touching runtime code.

### Phase 1 - Run ledger

Add the Mercury run ledger and one focused test around successful, failed, and
blocked runs.

Do not change prompt behavior in this phase.

### Phase 2 - Tool-description pass

Update the exported tool schemas so first-line descriptions map to developer
intent. Add schema tests and one or two canary prompts to observe adoption.

Do not change tool behavior in this phase.

### Phase 3 - Mercury compass docs

Add the first two compasses:

1. `mercury-bridge.md`
2. `trading-path.md`

Keep them summoned, not ambient. Wire no automatic prompt injection until the
manual docs prove useful.

### Phase 4 - Code-intelligence primitives

Add `find_definition` and `find_references` first. Use current Serena and grep
machinery where sufficient. Add `trace_callers` and `trace_consumers` only after
the first two prove stable.

### Phase 5 - Rules as greps

Create the rule corpus format and a read-only scanner. Start with three rules
from known OGZPrime incidents. Keep pruning criteria explicit so this does not
become another stale ambient rule pile.

### Phase 6 - Canary and surfacer

Add canary tasks and a digest command. The digest should read existing ledgers
and telemetry; it should not require live Mercury API calls to be useful.

---

## Implementation guardrails

- Mercury remains read-only against repo files.
- Any command execution stays behind the existing `run_check` allowlist and
  artifact writer.
- No hidden prompt steering is reintroduced for broad "break my fix" reviews.
- RAG, trace memory, compasses, and prior docs are routing context, not current
  proof.
- No runtime, broker, strategy, dashboard, PM2, or P0 gate changes are bundled
  with substrate work.
- Each phase is one logical change and one commit when approved.
- Mercury adversarial review is required for bridge code changes, but not for
  this doc-only Phase 0 spec.

---

## Open decisions

1. Work ID format: use `MER-DS-0001`, reuse pipeline mission IDs, or attach to
   the existing fix ledger ID.
2. Run ledger retention: keep all JSONL rows in git, gitignore raw prompt bodies,
   or curate summaries into git while leaving full rows local.
3. First compass after `mercury-bridge.md`: `trading-path.md` or
   `proof-track-record.md`.
4. Whether `rule_scan` is a Mercury tool only, a standalone script only, or both.
5. Whether canaries should call the live Mercury API, use fixture/mock clients,
   or support both modes.
