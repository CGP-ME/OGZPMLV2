# Mercury Workflow Alignment — DOC-ESTATE Census

Mission date: 2026-08-25
Alignment performed: 2026-08-26
Checkout: `/opt/ogzprime/OGZPMLV2` on `ogzprime-prod-001`
Branch: `codex/multi-asset-symbol-state`
Current HEAD: `be4f3ac5b058d47369228ee3b3622a4e9037f602`
Scope: read-only workflow proof before any DOC-ESTATE adversarial dispatch

## Stop-state receipt

- No DOC-ESTATE file was staged, committed, or pushed from the canceled instruction.
- `git diff --cached --name-status` is empty.
- Current HEAD equals the configured upstream `origin/codex/multi-asset-symbol-state` at `be4f3ac5b058d47369228ee3b3622a4e9037f602`.
- The HEAD advance from the census snapshot was not created by this lane.
- The original census and manifest remain untracked. This workflow-alignment receipt is also untracked.
- Preserved unrelated untracked paths remain `data/session-router/`, `data/supervisor-ledger.jsonl`, `ogz-meta/Alignment/TREY-DOCTRINE-FABLE-LANE.md`, and `ogz-meta/inbox/fable/2026-08-24/`.
- No Mercury census attack, Fable review, Kimi adjudication, reindex, stage, commit, push, PM2 action, environment change, production-code edit, or broker-state access occurred during workflow alignment.

## One pre-STOP provider preflight already occurred

Before the STOP/workflow-correction message was received, this lane ran:

```bash
node trai_brain/mercury-bridge/ask.js --check-providers
```

This was provider warm-up only, not an agentic Mercury census review. It returned overall `ok: false`:

- Mercury: provider `mercury`, model `mercury-2`, failed with HTTP 402 `Account is inactive`, classified `quota_or_billing`.
- Configured `fable_consensus`: provider `openai`, model `kimi-k3`, passed with one warm-up request.

The preflight path does not call `runAgentic` or `writeRunLedgerEntry`; `ask.js:857-861` only runs the preflight and exits. The absence of any `2026-08-26` Mercury run-ledger file confirms that no agentic review row was created. No provider command was repeated after the STOP.

## Live doctrine resolved

1. Root `AGENTS.md:95-117` requires one focused question at a time, attack framing, `--max-tokens=7750`, and `--max-iterations=60`. Broad current-diff audits use the visible `Mercury, break my fix.` frame without hidden agent-selected targets unless Trey explicitly narrows the target. Current file evidence outranks indexed recall.
2. `ogz-meta/AGENTS.md:188-229` requires one dispatch/one answer, sequential dispatches only, splitting prompts over 150 lines or multiple concerns, reading the full answer, provider posture before a full agentic run, and direct mechanical proof after `CANNOT VERIFY`.
3. `ogz-meta/sessions/session-2026-06-24-clean-tree-and-exit-audit-handoff.md:288-304` preserves the visible minimal broad attack frame and requires cited-code verification of suspected false positives.
4. `ogz-meta/sessions/session-2026-06-27-mercury-deepsearch-substrate.md:111-160` makes RAG, traces, compasses, rules, and Serena routing/evidence surfaces rather than authority; tool non-use and tool failure must be diagnosed before rerun.
5. `ogz-meta/sessions/session-2026-06-16-catchup-handoff-and-gap-register.md:141-151` forbids claiming index freshness until the indexer succeeds for the pushed code.
6. `ogz-meta/sessions/session-2026-07-02-fable-consensus-exit-telemetry-and-sweep-config.md:5-18,29-35` documents provider preflight, Fable review, commit-blocking consensus failure, and local producer verification. Its then-current `claude-code`/`claude-fable-5` provider posture is historical and does not override today's live config.
7. `ogz-meta/sessions/session-2026-08-03-06-posthog-p0-removal-directional-audit.md:36-55,80-99` requires dispatch receipts, records repeated paid/cap-starved/timeout failures, and forbids another paid run without a verified correction.
8. `ogz-meta/inbox/fable/2026-08-04/agent-review-receipts.md:9-15,40-46` requires every review agent to report verdict, files actually read, tool failures, assumptions, and unverified items; an unreceipted report is incomplete.
9. `ogz-meta/sessions/session-2026-08-20-session-recording-resumed.md:128-150` says unverified Mercury freshness cannot support coverage claims and current source/commit receipts outrank stale handoff state.
10. Root and `ogz-meta/AGENTS.md` cite `ogz-meta/sessions/session-2026-06-25-mercury-deconstraint-handoff.md`, but that path is absent from the live checkout and has no `git log --all` history. The surviving rules are enforceable from current AGENTS text and the live implementation, but the cited session receipt is a missing doctrine reference.

## Current CLI and configured stack

The live help path is unusual: `--help` is not a recognized flag, so it prints `[ask] Unknown flag: --help`, emits usage, and exits 1. The usage implementation at `trai_brain/mercury-bridge/ask.js:213-246` confirms the operative flags.

The exact eventual agentic invocation shape is:

```bash
node trai_brain/mercury-bridge/ask.js \
  --agentic \
  --show-history \
  --adversarial-review \
  --max-iterations=60 \
  --max-tokens=7750 \
  "<one focused visible attack question with the relevant verbatim census excerpt>"
```

This command is not authorized to run yet. `ask.js:383-389` resolves the configured limits and `ask.js:204-210` rejects numeric values that differ from config. `mercury.config.json:54-104` currently configures:

- Mercury: Inception `mercury-2`, 7,750 client tokens.
- Legacy consensus default: false.
- Adversarial review default: true, maximum two Mercury rechecks.
- Review client: OpenAI-compatible Moonshot endpoint, model `kimi-k3`, 2,000 client tokens, thinking disabled.

The command should keep `--adversarial-review` explicit even though the config default is currently true.

### Current Fable/Kimi naming conflict

The live CLI does not currently provide two independent Fable and Kimi model clients:

- `mercury.config.json:64-96` gives the single consensus client a Fable system prompt but configures provider `openai` and model `kimi-k3`.
- `provider-preflight.js:73-82` labels that single configured client `fable_consensus`.
- `adversarial-review.js:593-644` creates both the first “Fable” review and final “Kimi” adjudication through the same `createConsensusLlmClient` factory.
- `ask.js:560-614` runs the first review, up to two Mercury rechecks only when that review is blocking, and final Kimi adjudication only when the first review remains blocking.

Therefore the current automatic sequence is Mercury -> Kimi-k3 under a Fable role prompt -> conditional Mercury recheck(s) -> the same Kimi-k3 provider/model under a Kimi role prompt. It is not independent model consensus. The eventual requirement for a verified stack “including Fable and Kimi” needs a Trey-approved resolution before it can be claimed satisfied; no config or provider wiring change is authorized in this mission.

## Artifact visibility and lawful supply

Mercury cannot directly inspect the untracked census receipt at its current path:

1. The artifact is 339 lines at `ogz-meta/inbox/codex/2026-08-25/DOC-ESTATE-CENSUS-RECEIPT.md`.
2. `mercury.ignore:19` ignores every `inbox/` directory.
3. `tool-adapter.js:214-239,631-681` blocks `open_file` for ignored paths outside a narrow internal allowlist.
4. `tool-adapter.js:993-1013` filters ignored paths from `git_diff` file discovery.
5. `tool-adapter.js:1106-1147,1203-1219,1258-1289` builds non-Git `run_check` commands from `git ls-files` in an isolated tracked snapshot and blocks ignored script paths. An untracked ignored census file is absent from that snapshot.
6. `test/mercury-index-scope.test.js:663-844,926-932,1054-1073` exercises the isolated tracked snapshot and ignored-path blocking behavior.

Do not stage the census to make it visible, do not create a shadow copy outside the authorized output route, and do not claim Mercury inspected the path directly.

Trey explicitly narrowed the eventual audit to this census artifact and four attack lanes. That explicit target permits visible artifact-specific prompts without violating the broad current-diff deconstraint. The safe supply mechanism is to place the relevant census text verbatim in each prompt, keep each prompt under 150 lines, disclose the stale/contaminated index, and tell Mercury to verify each cited producer/consumer against accessible live files. The four questions remain sequential:

1. Omitted writers/path estates and unsupported producer claims, supplied with the Phase 1 estate rows and footer/trailer contract section.
2. False size/count/growth and rotation/cap evidence, supplied with the Phase 1 rows and measured-estate summary.
3. Unsafe `LOAD-BEARING | COMPRESS | CULL-CANDIDATE` proposals, supplied with `DOC-ESTATE-CENSUS-RECEIPT.md:132-182` verbatim.
4. Contract hazards and Phase 3 direction, supplied with the authority boundary, contract-hazard section, reconciled hazards, and `:184-186` verbatim.

If any focused prompt approaches the provider input limit despite staying under 150 lines, split that lane into additional sequential one-question prompts. Do not lower coverage or limits.

## Index posture

A read-only `mongosh` query of `ogz_knowledge.index_stats_local_nomic` returned the latest stats document:

- indexed at `2026-08-23T15:53:59.991Z`
- branch `codex/multi-asset-symbol-state`
- indexed HEAD `343bb12c98036b07aa2e0456ddb2c14f8a8b9b1c`
- `dirty_tracked: true`
- dirty summary `M core/SessionRouter.js`
- 623 files walked, 9,904 chunks embedded, 0 embedding errors

Current HEAD is `be4f3ac5...`. The index is stale and contaminated by a dirty tracked source snapshot. `ask.js:424-440,802-816` reports staleness in the dispatch receipt but does not fail the run. Indexed recall may orient tool choice but cannot adjudicate this mission; all findings require current live file/tool evidence.

## Receipt and ledger behavior

For every agentic success or failure, `ask.js:674-709` writes an automatic JSONL run row through `run-ledger.js:361-385` at:

```text
ogz-meta/cognition-history/mercury-runs/YYYY-MM-DD.jsonl
```

The row includes branch/HEAD/dirty state, prompt hash/excerpt, options, tools and per-call details, files opened, run-check artifacts, quality flags/evidence, review/rechecks/final review, termination, iterations, latency, verdict, error, and answer excerpt (`run-ledger.js:277-351`). Consensus failure is explicit, and non-`answer_given` termination is blocked (`run-ledger.js:126-165`; `test/mercury-run-ledger.test.js:308-517`).

The stdout package is also mandatory. `ask.js:723-820,903-970` prints the full answer, termination/iterations/latency, quality evidence, run checks, named tool failures, tool telemetry, blast-radius errors, review/final-adjudication state, dirty tree, index freshness, ledger citation, Fable answer, Mercury rechecks, adversarial packet, and `--show-history` tool trace. `ask.js:1001-1017` prints a failure receipt with error and ledger citation.

The printed receipt summarizes called tools but does not enumerate tools that were never called. That absence must be determined by comparing `tools_invoked`/tool history against the evidence the answer required. The `--show-history` display truncates each rendered tool result at 1,000 characters (`ask.js:959-968`), so the JSONL call details and cited run-check artifacts must also be inspected.

## Output routing conflict requiring a ruling

`ogz-meta/ROUTING.md:5-24` requires raw Mercury prompts/responses/attack traces under `ogz-meta/inbox/mercury/<date>/`, raw Fable output under `ogz-meta/inbox/fable/<date>/`, and Codex mission products under `ogz-meta/inbox/codex/<date>/`. The earlier mission instruction requested all adversarial outputs under this same Codex mission directory. Those instructions conflict for raw transcripts.

The doctrine-consistent proposed routing is:

- capture each complete CLI stdout/stderr package under `ogz-meta/inbox/mercury/2026-08-26/` with a manifest;
- route any genuinely independent Fable-agent receipt under `ogz-meta/inbox/fable/2026-08-26/` with a manifest;
- preserve automatic JSONL ledger and run-check citations where the implementation writes them under ignored `ogz-meta/cognition-history/`;
- write the separate live-repo adjudication and reconciliation addendum under this authorized Codex mission directory, with this manifest linking every raw receipt and ledger citation.

Do not create those paths or dispatch until Trey rules whether this routing or same-directory duplication controls.

## Completeness and rerun law

Mercury output is never authority. A result is consumable only when it has a complete, nonempty answer with `termination: answer_given`, a receipt and ledger citation, reviewed tool telemetry, and no unresolved truncation/cap/tool/provider failure. Timeout, `max_iterations`, truncation, empty/incomplete output, or cap-starvation is incomplete and cannot serve as a verdict.

For every dispatch:

1. Read the full stdout receipt and automatic ledger row first: exact tools called, required tools not called, failed calls, files opened, run checks/artifacts, quality flags/evidence, provider/index freshness, termination, review failure, and final adjudication.
2. Diagnose the specific failure before rerun. Do not repeat an identical paid dispatch.
3. Correct only the proven prompt/input-size/tool-access/provider issue, then rerun the unresolved focused question with 60 iterations and 7,750 Mercury tokens.
4. If scope/input size caused failure, split into sequential one-question dispatches; never lower coverage.
5. Continue until a complete receipted answer exists or a concrete provider/tool blocker is proven and surfaced.
6. If Mercury remains unreliable after one focused correction, use Trey's authorized escalation only after fresh provider preflight and a proven distinct Fable/Kimi stack. Preserve every failure receipt.

Every Mercury finding then gets separate live-repository adjudication. Inspect its exact cited file:line/tool evidence, enumerate relevant producers and consumers, mechanically reproduce counts where applicable, search contradictory evidence, and record `VERIFIED`, `FALSE POSITIVE`, `INTENDED`, `UNSUPPORTED`, or `UNRESOLVED` only from current repo proof. Findings without current evidence remain unverified and block conclusions. Preserve the raw Mercury receipt separately from the repo-verified adjudication receipt.

## Current blockers

1. **Provider blocker:** latest preflight failed Mercury with HTTP 402 `Account is inactive`. No Mercury dispatch may proceed until a fresh preflight passes.
2. **Consensus-identity blocker:** the live automatic “Fable” and “Kimi” stages both use the same configured `openai`/`kimi-k3` client. This does not prove independent Fable/Kimi consensus.
3. **Artifact-access constraint:** the untracked ignored census cannot be opened by Mercury tools; prompts must carry verbatim focused excerpts.
4. **Routing conflict:** mission same-directory wording conflicts with the repository's provider-specific raw-output routing law.
5. **Freshness blocker:** the index is stale and contaminated. A run can still use live tools after provider recovery, but index recall cannot support current-authority claims.
6. **Missing doctrine citation:** the referenced June 25 deconstraint handoff does not exist in the live tree or all-ref history.

No adversarial lane is approved or executable while blockers 1, 2, and 4 remain unresolved.

## Exact files opened or line-scanned for this alignment

- `AGENTS.md`
- `ogz-meta/AGENTS.md`
- `ogz-meta/ROUTING.md`
- `mercury.config.json`
- `mercury.ignore`
- `trai_brain/mercury-bridge/ask.js`
- `trai_brain/mercury-bridge/config.js`
- `trai_brain/mercury-bridge/llm-client.js`
- `trai_brain/mercury-bridge/provider-preflight.js`
- `trai_brain/mercury-bridge/run-ledger.js`
- `trai_brain/mercury-bridge/tool-adapter.js`
- `trai_brain/mercury-bridge/adversarial-review.js`
- `trai_brain/mercury-bridge/mongo-store.js`
- `test/mercury-provider-preflight.test.js`
- `test/mercury-llm-config-contract.test.js`
- `test/mercury-index-scope.test.js`
- `test/mercury-run-ledger.test.js`
- `test/mercury-consensus.test.js`
- `test/mercury-react-loop.test.js`
- `ogz-meta/sessions/session-2026-06-16-catchup-handoff-and-gap-register.md`
- `ogz-meta/sessions/session-2026-06-24-clean-tree-and-exit-audit-handoff.md`
- `ogz-meta/sessions/session-2026-06-27-mercury-deepsearch-substrate.md`
- `ogz-meta/sessions/session-2026-07-02-fable-consensus-exit-telemetry-and-sweep-config.md`
- `ogz-meta/sessions/session-2026-08-03-06-posthog-p0-removal-directional-audit.md`
- `ogz-meta/sessions/session-2026-08-20-session-recording-resumed.md`
- `ogz-meta/inbox/fable/2026-08-04/agent-review-receipts.md`
- `ogz-meta/inbox/codex/2026-08-12/sessionrouter-throw-catch-landing-table.md`
- `ogz-meta/inbox/codex/2026-08-16/hunt-rank1-optimized-indicators-disposition.md`
- `ogz-meta/inbox/codex/2026-08-25/DOC-ESTATE-CENSUS-RECEIPT.md`
- `ogz-meta/inbox/codex/2026-08-25/MANIFEST.md`

## Disposition

Workflow alignment is complete. No Mercury dispatch is authorized. Wait for Trey to resolve the provider, distinct-consensus, and routing blockers and approve the exact first focused question.

## 2026-08-27 role-separation capability correction

fable_consensus was kimi-k3 until the 2026-08-27 adversarial reviewer role-separation fix; harness-Fable verdicts before that date are single-source.

The affected configuration period began with commit `cda6cd7aa1fddf98bc9fafc31bdfc7524aa37c9b` on 2026-07-17 (`Added Kimi fourth-eye provider — explicit consensus only`). That commit changed `mercury.config.json` consensus routing to provider `openai`, Moonshot's OpenAI-compatible endpoint, and model `kimi-k3`; the same role identity remained at pre-fix HEAD `34b879f839f53b5eeff4081d1d2fbd5b821f4ada`. The role-separation capability fix restores a genuine prompt-only Claude Code `fable` challenger, permits only the stable Claude Code `opus` alias as the emergency replacement after mechanically allowlisted Fable rate-limit/unavailability signals, and reserves Moonshot `kimi-k3` for conditional tie-breaking after a successful challenger. Model receipts remain pending live-repository adjudication and never become repository authority.
