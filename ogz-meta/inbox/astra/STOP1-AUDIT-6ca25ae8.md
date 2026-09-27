# STOP 1 independent audit

Repository: CGP-ME/OGZPMLV2. Branch requested: `codex/multi-asset-symbol-state`.

Source under examination: **6ca25ae80cfcef12eec79e64c7d14162d9d4c751**. Comparison baseline: **e54a8b8dc40c4a5bf52984b823d1438c4de39f62**. All unqualified repository `file:line` citations below refer to 6ca25ae8. A historical commit or supplied document is identified explicitly when used. This is a source and design audit, not a runtime acceptance receipt.

## A. Overall verdict

**STOP 1 REQUIRES ARCHITECTURAL RECONCILIATION BEFORE CONTINUING**

Trey, I would not execute LAND-NOW literally. Several individually plausible changes depend on capabilities that the proposed order supplies later, or never supplies. Some instructions still contradict your words. The largest problems are demonstrable in production call chains: paper mode does not govern every submission path; the configuration snapshot is not the sole runtime owner; planned open-trade freezing misses indirect fee readers; the proposed required-module continuation cannot construct the runner when RiskManager is absent; and the singleton's signal handlers can terminate the process before the runner finishes shutdown. See findings G01–G25.

I would preserve useful work, correct the specific wrong behavior, and replace the contradictory execution instructions. A wholesale revert of the 18-commit range would also remove unrelated tooling changes and would not fix the inherited runtime defects. L1's truthful required-module enumeration and L6's explicit exit-status plumbing are separable from the unauthorized or incomplete failure behavior around them.

**Coverage qualification:** I established the architecture and the concrete defects described here. The attached inventories exhaust their stated mechanical source sets. They do **not** establish every dynamically resolved configuration consumer, every semantic unit, or the private runtime's effective values. The configuration evidence ledger deliberately retains unresolved entries. Therefore this report is not a completed leaf-by-leaf migration clearance, and I do not represent the mission's exhaustive consumer-proof requirement as satisfied. Those named gaps are material work, not permission to move or delete the affected leaves. No repository tests, bot boot, PM2 operation, broker request, trade, provider run, or notification was performed for this audit.

## B. What STOP 1 actually is

STOP 1 must establish the bot's configuration authority and the lifecycle that makes that authority real: customer settings in one place, static implementation values in another, credentials supplied once, no behavioral environment backdoor, one runtime read surface, explicit mode and account identity, and consumer-visible settings receipts. It also includes the changes Trey expressly pulled into this boundary, and the prerequisites without which those changes would be misleading or unsafe. Moving files while leaving constructors, environment reads, aliases, mode decisions, or open-trade readers authoritative does not complete it.

The controlling sources were read before evaluating the plans:

| Source | Controlling requirement and conflict resolution |
|---|---|
| `ogz-meta/inbox/fable/2026-09-09/OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM.md:14` | A0: values must genuinely have one configuration authority; no hidden override. |
| Same repository file, `:140` | A21: two configuration categories—customer/UI values and static loader values. Exact filenames are implementation choices; ownership is the requirement. |
| Same repository file, `:18`, `:26`, `:58`, `:64`, `:158` | Scheduled switching, 30/15/5 wind-down, watchlists, both directions with one trade per asset, configurable schedule, paper launch. These are not established by changing one profile field. |
| Same repository file, `:34`, `:94` | Pattern-earned 1.5× sizing and the later sizing words including 7.5 and 25. A multiplier formula or the denominator of an aggregate cap must not be invented from a plan's field names. |
| Same repository file, `:104`, `:106`, `:108`, `:110`, `:116` | Remove the live/eval weld and loss cooldown; warnings and the specifically authorized daily-loss entry pause are distinct from arbitrary global shutdown or flattening. |
| Same repository file, `:144`, `:152`, `:154` | Settings receipts/freeze context and hot changes, including an edit to one particular trade. Editorial bracketed wording is not an additional verbatim ruling. |
| Same repository file, `:162`, `:163`, `:164`, `:168` | Full shape now; singleton must prevent a second bot; recovery must be evidenced and loud; later publisher-off words supersede the earlier keep-on interpretation at `:136`. |
| `ogz-meta/Alignment/TREY-DOCTRINE-FABLE-LANE.md:7`, `:11`, `:15`, `:17`, `:21`, `:25`, `:49`, `:51`, `:59`, `:61`, `:75`, `:77` | Fail loudly, preserve the process and healthy components, repair producers under the Fourth Shape, avoid new cages and silent defaults, establish totality, and limit claims to receipts. |
| `ogz-meta/Alignment/TREY-RULINGS.md:7`, `:12`, `:25`, `:29` | One net position per ticker; scoped broker-authentication failure handling; authority ceiling and receipts. Older conflicting cooldown/aggregation rulings do not override newer words. |
| Supplied `LAND-NOW-2026-09-10.md:10` | Contains the direct quotation rejecting boot refusal. Its proposed implementation remains a plan, not proof that continuation works. |

Further conflicts must be made explicit. The old 1m aggregation/TFE direction in `TREY-RULINGS.md:8` conflicts with the later native-timeframe doctrine at `TREY-DOCTRINE-FABLE-LANE.md:33` and the walk at `ogz-meta/inbox/fable/2026-09-09/OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM.md:82–84`. Old loss-stop instructions in `TREY-RULINGS.md:9` do not authorize preserving the newer-rejected cooldown. The code-first authority wording in `OGZ-MASTER-ALIGNMENT.md:96` establishes neither intended behavior nor a right to preserve a defect. Watchdog endorsements in `ogz-meta/AGENTS.md:311` and `:428` lose to your current express rejection. Part B's later-stop editorial assignments do not defeat Part A's explicit directions.

The supplied v4 is internally inconsistent about mode ownership, refusal, deferral, and restart approval. Its A27 story at `STOP1-BOUNDARY-MISSION-v4-2026-09-10.md:20` is an attribution, not an original Trey quotation. I searched the walk variants and available authority history; I did not find original words establishing the proposed `.env` flip/UI-write-to-`.env` exception. The July 10 context-parameter document says a missing context refuses **that trade**, not that any old environment key must kill the whole process (`ogz-meta/inbox/fable/2026-07-16/session-doctrine/TREY-CONTEXT-PARAMS-SPEC-2026-07-10.md:24–30`).

## C. Intended architecture

This needs clearer ownership in the existing components, not another supervisory framework.

| Responsibility | Single owner and lifecycle | What must cease being an independent authority |
|---|---|---|
| Credentials | One bootstrap credential load, passed to the services that need it. Secret values remain outside settings receipts. Each service reports its own unavailable credential or authentication outcome. | Notifier-side dotenv loads, launcher/runtime disagreement, credentials guessed from unrelated routes. |
| Bootstrap | Existing launcher owns process entrypoint, paths and invocation inputs. Loader consumes explicitly classified bootstrap inputs. | Behavioral PM2 stamps and mutable environment aliases. Do not classify a trading choice as bootstrap merely to leave it in `.env`. |
| Customer settings | `config/settings.json`, as proposed, owns editable behavior; presets are explicit values or explicit selections within that owner. | Trading JSON, features JSON, env overrides, shadow constructor policy, independently mutable feature manager. |
| Static internals | `config/internals.json` owns actual static implementation values. Code constants remain only where they are implementation facts, not alternate tunable trading policy. | Calling a trading-relevant cadence or candidate cap “performance-only” without tracing its consequences. |
| Parsing and runtime reads | Existing ConfigLoader loads a typed, source-tracked revision. Every public getter projects that same revision. Invalid input is named at its producing boundary. | Import-time BASE_CONFIG as a competing fallback, partial numeric parsing, stale aliases, fabricated defaults, blanket process death. |
| Settings mutation | One existing settings service/write path validates and durably commits the next settings revision, then makes the accepted revision visible to consumers and receipts. | Independent UI `.env` writes, direct file edits by multiple components, a revision/hash stamp that does not cover the values consumed. |
| Open-trade policy | PolicyBuilder binds all operative exit inputs at entry; StateManager owns durable trade state. Exit consumers use the trade's policy. | Later global trail, break-even, fee, max-hold or contract reads silently changing an existing trade. |
| One-trade edit | Existing trade-state owner accepts a fully identified operator edit, commits its explicit policy revision and operative contract together, persists it, and acknowledges that trade. | Mutating global settings, bypassing immutable-policy checks, changing only a decorative frozen object, a UI command without trade identity. |
| Mode and execution | One resolved execution mode is carried into the existing execution owner and every submission/cancellation/recovery producer. Data source and execution venue are separate identities. | Paper/live flags evaluated independently, webhook enablement taking precedence over paper, direct recovery submissions without mode identity. |
| Sizing | Existing OrderExecutor builds final quantity from ruled settings and StateManager's scoped exposure. All subsequent quantity adjustments remain within the same sizing decision. | Confidence/confluence multiplying a purported cap, an unused PositionSizer posing as the owner, a per-order percentage posing as aggregate exposure. |
| Fees | The execution venue/account fee policy is resolved and bound to the trade; modeled fill slippage remains a separate concept. | Selecting fees by the market-data broker, live global fee reads for an older trade, treating zero commission as a broker receipt of zero total charges. |
| Switching | Existing SessionRouter owns the schedule and transition; broker adapters own truthful connection/subscription/account acquisition. StateManager owns the resulting scoped state. | A dashboard scope being treated as execution scope, first-symbol-only subscription, successful REST or local deletion being called completed broker flattening. |
| Failure/recovery | The producer responsible for the original condition obtains evidence that repairs it. Existing scoped state records only that condition's lifecycle. | Watchdog trading authority, unconditional global resume, blind removal of a replacement halt, recoverable faults terminating the process. |
| Singleton and shutdown | Existing SingletonLock owns exclusive acquisition/release; the runner owns orderly operator-requested shutdown. | Rename-as-lock acquisition, multiple competing exit handlers, a renamed lock allowing an old and new process to coexist. |
| Notifications and publisher | Existing notification and logger components own their actual attempts/results. Publisher-off applies to every publication write path. | “Installed,” “queued,” “scheduled,” or HTTP success being reported as phone delivery or trading success. |
| Backtest | Same configuration and trading semantics, explicitly identified replay inputs and separate state/pattern persistence. | Backtest-only overrides leaking into live, replay proving subscriptions or PM2 behavior, a simulation flag hiding a live submission path. |

An unavailable component, incomplete trading initialization, a running process, permitted entries, functioning exits and a recovered broker are different states. The design must say which exists. In particular, “continue” must not mean constructing required consumers with `undefined`, and “invalid settings” must not mean guessing a trading configuration.

## D. Current system at HEAD

### D1. Startup and configuration chain

`run-empire-v2.js:4–5` requires and silently loads ConfigLoader before the bootstrap exception handlers at `:316–328`, module loading at `:337`, StateManager/ExitContractManager creation at `:343–348`, and the backtest override application at `:353`. The loader itself imports trading JSON and constructs separate configuration structures (`foundation/ConfigLoader.js:28`, `:2199`, `:3898`, `:4480`). Therefore a handler registered later in `main()` cannot cover every import-time failure.

The loader parses dotenv into a local object (`foundation/ConfigLoader.js:473–481`), merges the supplied/process environment over that file (`:1478–1484`), applies launch-profile and tuning-profile values, validates and freezes a snapshot, and caches `load()` (`:1521–1547`). Tuning-profile environment values are explicitly written over the selected environment at `:518–520`. `get()` checks overrides, mapped snapshot paths, direct snapshot paths and then BASE_CONFIG (`:3898–3943`). `getSection()` starts with BASE_CONFIG and overlays only mapped paths (`:3949–3966`); `getExitContract()` reads BASE_CONFIG directly (`:3972–3974`); `getTimeframeConfig()` has a separate BASE/override path (`:3980–4012`); `getAll()` is another BASE/override view (`:4373`). These are not one consumer surface.

The mode producer chooses `PROFILE` from env or the launch-profile default (`foundation/ConfigLoader.js:548–569`). Mode fields and old direct env readers coexist. The runner derives its execution context at `run-empire-v2.js:1246–1292`; FeatureFlagManager independently reads tier at `core/FeatureFlagManager.js:68`; BotStateFrame independently composes mode telemetry at `core/BotStateFrame.js:136–148`; SingletonLock's skip decision uses legacy env at `core/SingletonLock.js:25–28`. Presence of the new profile mechanism does not eliminate those owners.

### D2. Module loading, process lifecycle and notification chain

ModuleAutoLoader loads directory members, treats named required failures specially, validates an explicit three-module list and returns references (`core/ModuleAutoLoader.js:142–197`, `:257–276`). The runner later calls the required RiskManager constructor (`run-empire-v2.js:448`, `:643`). L1b's proposed catch-and-continue therefore does not by itself create a usable runner.

The lock is acquired during module initialization (`run-empire-v2.js:429–437`); it registers signal/fatal handlers (`core/SingletonLock.js:119`, `:145–166`) before the runner's later `main()` handlers (`run-empire-v2.js:3625–3641`). The normal runner shutdown is asynchronous and ultimately exits with its parameter (`:3516–3586`). L6 changed the startup catch to request status 1 (`:1924`); it did not replace the other process-exit owners.

Ntfy is installed much later (`run-empire-v2.js:1063–1082`). Missing topic produces a null factory result (`core/NtfyTraceNotifier.js:194–207`) without the planned runner absence branch. Its event selection, queue and HTTP handling are separate stages (`:90–110`, `:145–190`). A returned `true` means an event was accepted into that queue, not that a phone received it.

### D3. Trading and submission chain

The runner creates WebhookOrderAdapter and EvalRuleEngine and injects OrderExecutor (`run-empire-v2.js:1303–1358`). OrderExecutor calculates size, builds the order plan and chooses webhook ahead of its local paper/backtest branch (`core/OrderExecutor.js:2809`, `:2853–2859`, `:3104–3138`, `:3418`, `:3603–3655`). OrderRouter then calls the registered broker adapter (`core/OrderRouter.js:180–206`). Kraken delegates to its simple adapter's private AddOrder request (`brokers/KrakenIBrokerAdapter.js:159–187`; `kraken_adapter_simple.js:749–773`). Alpaca chooses its endpoint from its own mode and posts `/v2/orders` (`brokers/AlpacaAdapter.js:47–61`, `:457–483`). No claim here establishes that any actual order was sent.

There are additional senders: exit-desynchronization flattening (`core/OrderExecutor.js:1431–1453`) and TTP orphan recovery (`core/TtpCutoffEnforcer.js:681–704`). The cutoff enforcer is invoked by the runner interval (`run-empire-v2.js:2453–2460`) and receives broker-management permission based on webhook configuration (`:1369–1389`), not paper/live mode. That is a second source-proven submission conflict, discussed in G07.

### D4. Policy, state and switching chain

PolicyBuilder freezes contract, profit-management and fee groups (`core/PolicyBuilder.js:558–598`). ExitContractManager dispatches stop-loss and max-hold checks (`core/ExitContractManager.js:335–377`), while live trail logic and several direct configuration reads remain in that manager (`:700–950`). StopLossChecker delegates break-even calculation to BreakEvenManager, which reads FeeModel's live global configuration (`core/exit/StopLossChecker.js:35–40`; `core/exit/BreakEvenManager.js:65`, `:104–105`; `core/FeeModel.js:109`). Frozen fields existing in state do not prove consumers use them.

StateManager owns pause and halt state, trade updates, normalization and persistence. Global pause/resume is at `core/StateManager.js:2554–2634`; symbol halt/reset is at `:4115–4182`; cooldown production/normalization is at `:3973–4088`, with startup restoration at `:4388–4465`. The method proposed for one-trade edits rejects a changed frozen policy and intentionally does not save (`:2850–2884`).

SessionRouter has real static and scheduled branches, calendar-driven wind-down, transition persistence, broker REST checks and pattern handoff. Its startup, failed state, transitions and backtest branch are at `core/SessionRouter.js:275–313`, `:340–548`, `:1003–1188`, `:1302–1446`, `:1481–1780`. The existence of those pieces is not proof of a completed transition. G10–G13 identify the missing identity, acquisition, recovery and pause behavior.

## E. Landed-work audit

The bounded interval contains **18 commits**. Their union changes **81 paths: 51 documentation/data paths, 18 code paths and 12 test/fixture paths**. Six commits are documentation-only. Across the interval there are 53 code-file change entries and 33 test/fixture change entries; the combined diff inventory contains 311 hunks. These are Git/diff counts, not executable-change or behavioral-proof counts. The bot runtime files changed in this interval are ModuleAutoLoader, the runner and the shared persistent LLM client; the large configuration migration has not landed. `foundation/ConfigLoader.js`, `config/trading.config.json` and `ecosystem.config.js` have no diff in this interval.

The comparison is each commit against its parent, followed through to HEAD; exact parent SHAs, path lists and hunk ranges are in the evidence archive. Documentation-only rows below describe documentary effects, not bot execution.

| Commit | Intended change | Actual behavior and current evidence | Authority | Proof status | Current verdict |
|---|---|---|---|---|---|
| `079f91ab` | First leaf manifest | Adds manifest/packet; current manifest still has 341 HOLD rows and 11 absent trading empty-array paths. `ogz-meta/inbox/cc/2026-09-06/stop1-manifest/MANIFEST.tsv:1`. | A0 requires a real inventory; proposed placements are not rulings. | File/Git proof only. | LANDED BUT INCOMPLETE |
| `a7d497f2` | Publish STOP 1 intake | Adds sort, walk, boundary and bridge mission documents; no executable diff. `ogz-meta/inbox/fable/2026-09-07/STOP1-BOUNDARY-MISSION-2026-09-06.md:1`. | The walk's direct words control; intake claims do not. | Source-document existence. | NO LIVE BEHAVIORAL EFFECT |
| `b364d364` | Correct DELETE classifications | Revises documentary dispositions; does not remove those readers or values. Current manifest and `ogz-meta/inbox/codex/2026-09-07/direct-runtime-config-audit/MANIFEST.md:1` are historical intake, not accepted proof here. | A0/producer ownership. | Documentary diff; individual deletions still need consumer proof. | LANDED BUT INCOMPLETE |
| `66d852fc` | Evidence receipts and two-phase Mercury reading | Changes prompts, doctrine assessment, ReAct phase acceptance and ledger fields. Current heading acceptance remains at `trai_brain/mercury-bridge/react-loop.js:983–1029`; doctrine conditions at `trai_brain/mercury-bridge/doctrine-review.js:124–209`. | Trey reader-method quotation is carried in `mercury.config.json:247`; method does not make formatting a truth test. | Source path; no provider run. | LANDED BUT INCOMPLETE |
| `3b2b7aef` | Default agentic mode and recomputed panel authority | Rechecks replace seat fields while retaining evaluation history (`trai_brain/mercury-bridge/ask.js:728–761`). A no-claim seat can count toward two successful seats while only one seat supplies the agreed claim (`trai_brain/mercury-bridge/reviewer-panel.js:165–208`). | Independent investigation; no authority from consensus alone. | Source counterexample G19. | LANDED BUT INCOMPLETE |
| `5640f7fd` | Kimi truncation retry | Raises shared client's accepted timeout ceiling to 600000; changes Kimi token/timeout settings and retries provider-reported truncation. The prior 300000 ceiling is visible in this exact diff; HEAD constructor is `core/persistent_llm_client.js:116`. | Tooling support; not a new TrAI policy. | Static branch/parameter proof, no provider response. | LANDED BUT RUNTIME-UNPROVEN |
| `170ca89c` | Preserve candidate evidence through rereads | Adds union of opened-file receipts/citations and recheck sources (`trai_brain/mercury-bridge/react-loop.js:80–201`; `trai_brain/mercury-bridge/run-ledger.js:79–98`). This supersedes the earlier fixed-first-pass restriction. | Totality supports further reading; union is not semantic verification. | Source proof. | LANDED BUT RUNTIME-UNPROVEN |
| `39c04cc5` | Manifest 0.1b | Changes manifest/packet only. Missing structural paths and unresolved ownership remain at HEAD. `ogz-meta/inbox/cc/2026-09-06/stop1-manifest/EVIDENCE.md:1`. | Inventory obligation. | Independent JSON/TSV comparison. | LANDED BUT INCOMPLETE |
| `c51e76c2` | Seat, usage and cost receipts | Adds cost normalization/aggregation, attempt metadata, no-tools behavior and tooling notifications; shared client now carries usage and stop reason (`core/persistent_llm_client.js:558–586`). Also introduced cost-alert policy later removed. | Observability is useful; cost thresholds were not authority to govern the bot. | Source only; invoices/provider billing unverified. | LANDED BUT INCOMPLETE |
| `b6bbd44c` | Remove cost-alert policy | Removes daily/monthly threshold inputs, threshold checks and associated notifications; keeps cost sums (`trai_brain/mercury-bridge/run-ledger.js:369–397`; `trai_brain/mercury-bridge/ask.js:831–853`). | Removes invented policy without discarding receipts. | Exact diff and current references. | LANDED BUT RUNTIME-UNPROVEN |
| `f99a7a22` | Sept 8 reconciliation intake | Adds/revises documents, not runtime. Contradictory refusal and deferred-reader instructions remain in its historical boundary (`ogz-meta/inbox/fable/2026-09-08/STOP1-BOUNDARY-MISSION-2026-09-06.md:33–40`, `:79`). | Superseded intake. | Documentary proof. | NO LIVE BEHAVIORAL EFFECT |
| `d2e4f3ff` | Sept 9 v3/reconciliation intake | Adds v3, B/C tables and updated walk. `ogz-meta/inbox/fable/2026-09-09/STOP1-BOUNDARY-MISSION-v3-2026-09-09.md:1`. | Direct words win over accompanying interpretation. | Documentary proof. | NO LIVE BEHAVIORAL EFFECT |
| `3412c5c0` | L1 required-module honesty | Removes an unconditional claim and adds explicit validation/required failure propagation (`core/ModuleAutoLoader.js:183–197`, `:257–276`). It also makes required absence refuse initialization. Later L1b is not landed. | Truthful reporting authorized; blanket boot refusal rejected. | Unit fixture assertions; no real boot receipt. | LANDED BUT INCORRECT |
| `124efac4` | L6 startup exit status | Exactly three changed runner lines: `shutdown(1)`, default `exitCode=0`, forwarding to `process.exit(exitCode)` (`run-empire-v2.js:1924`, `:3516`, `:3586`). Other fatal/signal owners remain. | Honest terminal status does not authorize terminal handling of recoverable defects. | Mocked-unit/source assertions; no real SIGTERM/PM2 proof. | LANDED BUT INCOMPLETE |
| `0fe95806` | Independent direct-question entrypoint | Adds provider-selected neutral prompt/tool loop and direct ledger; no panel call is needed (`trai_brain/mercury-bridge/direct-question.js:213–328`, `:334–468`; `trai_brain/mercury-bridge/run-ledger.js:862–949`). Failure after earlier tool use can lose tool history, G20. | Fits literal independent questions; not bot product logic. | Static path and test assertions only. | LANDED BUT INCOMPLETE |
| `7bac1619` | Correct direct DeepSeek/Kimi settings | Changes selected model/pricing catalog and per-provider temperature resolution (`mercury.config.json:83–120`, `:190–205`; `trai_brain/mercury-bridge/config.js:284–310`). Source labels claiming externally verified pricing are not independently verified invoices here. | Tooling configuration; not STOP 1 sizing or strategy authority. | Source selection only. | LANDED BUT RUNTIME-UNPROVEN |
| `0f2e1da1` | Remove direct iteration ceiling | Replaces default limit with a nonterminal steer; explicit positive operator limit remains (`trai_brain/mercury-bridge/direct-question.js:244–328`, `:353–362`). Adds loop-policy receipt fields. | Continue material investigation; count is not totality. | Source, not successful long provider run. | LANDED BUT RUNTIME-UNPROVEN |
| `6ca25ae8` | Remove Mercury iteration ceiling | Same default-unbounded policy in ReAct and caller; slash router no longer supplies 60 (`trai_brain/mercury-bridge/react-loop.js:761–847`, `:948–959`; `ogz-meta/slash-router.js:2616–2622`; `trai_brain/mercury-bridge/run-ledger.js:779–789`). | Tooling support; not a production bot gate. | Static source. | LANDED BUT RUNTIME-UNPROVEN |

The shared client warrants an explicit distinction. TrAI constructs it through `core/trai_core.js:130` and calls its plain response method at `:491`. That path returns cleaned text (`core/persistent_llm_client.js:171–222`, `:617–645`), not the new receipt object. TrAI's configuration still constrains its timeout to at most 300000 (`core/trai_llm_config.js:82`). Thus the diff disproves the claim that adding usage metadata or allowing a 600000 client timeout necessarily changed TrAI's configured timeout or answer shape. It does not prove identical provider latency or live TrAI outcomes.

The backfill tool produces a separate report; it does not rewrite the historical JSONL ledger (`tools/backfill-mercury-costs.js:158–172`). However, requested provider/model are inferred from filenames (`:55–67`), and its source SHA is a supplied argument checked only for shape (`:24–25`, `:129`). Those fields are reconstruction assertions, not recovered execution identity. I did not read raw model answers to verify its historical totals.

## F. STOP 1 item ledger

The accompanying **STOP1-ITEM-LEDGER.csv** contains 158 current disposition rows for the principal R/Part/L/B/C/D/V3 behaviors and additional unnumbered obligations. Distinct subbehaviors are split where one historical label bundles them. The evidence archive also preserves the complete mechanical action catalog: 2,298 literal occurrences across 53 source blobs, all 99 requested identifiers present, 109 principal identifiers including D subrows and historical Parts 2B/2C, 481 other explicit row identifiers, and 415 unlabeled requirement-language passages. Those are source occurrences, not 2,298 independent requirements.

The catalog is not a substitute for a disposition. Historical repetitions, a test's assertion, an agent's self-report and an actual requested change are different kinds of entries. The unresolved manifest rows are retained in the configuration evidence ledger; I have not converted all of them into policy questions for you or accepted their old DELETE/HOLD labels as engineering conclusions.

## G. Design defects, counterexamples and contradictions

Each constructed sequence below is a source-derived counterexample, not a claim that I observed it on the running bot.

### G01. L1b's promised continuation is not a complete producer repair

**Document:** supplied LAND-NOW `:10`, v4 `:42`; L1 commit `3412c5c0`.

**Code proves:** required failures propagate from ModuleAutoLoader (`core/ModuleAutoLoader.js:183–197`, `:257–276`); the runner fetches RiskManager at `run-empire-v2.js:448` and constructs it at `:643`.

**Constructed sequence:** RiskManager is absent or fails evaluation; the proposed L1b catch logs the coded error and continues from `loadAll()`; no usable RiskManager constructor exists.

**Mechanical consequence:** continuation reaches a required constructor call with no constructor. Removing the explicit refusal has not repaired initialization. Conversely, allowing entries without that required state would violate the mission's prohibition on corrupted or fabricated trading state.

**Runtime unknown:** which missing-module cases occur on the private box; actual process survival and which services would remain usable.

**Replacement:** retain truthful per-module results; repair required acquisition/construction and its failure ownership. Initialize available operational services independently of the failed trading component. Report the exact incomplete initialization; do not fabricate a RiskManager, add a global gate, or pretend the runner completed. L1b cannot be accepted with a test that only catches the original loader error.

### G02. L6 does not resolve shutdown ownership or import-time failure

**Document:** LAND-NOW `:15`, v4 `:42`, `:162–163`.

**Code proves:** ConfigLoader runs before the runner's handlers (`run-empire-v2.js:4–5`, `:316–328`); SingletonLock registers its handlers before `main()` installs the runner's handlers (`core/SingletonLock.js:119`, `:145–166`; `run-empire-v2.js:434`, `:3625–3641`). The lock's SIGINT/SIGTERM cleanup calls `process.exit(0)`; the runner's shutdown awaits cleanup (`:3516–3586`). The bootstrap handlers also call `process.exit(1)` directly.

**Constructed sequence:** a normally constructed bot receives SIGTERM. The lock's earlier listener executes first and calls process exit.

**Mechanical consequence:** the later runner listener cannot establish completion of its asynchronous shutdown in that event sequence. Node dispatches listeners in registration order, and `process.exit()` forces termination without waiting for pending asynchronous work. [Node event dispatch](https://nodejs.org/api/events.html#emitteremiteventname-args), [Node process exit](https://nodejs.org/api/process.html#processexitcode).

**Runtime unknown:** actual managed position, flush, close, disconnect and PM2 outcomes. The L6 test replaces SingletonLock and uses prototype fixtures (`test/startup-exit-code.test.js:30–36`, `:46–55`); its signal check is source inspection (`:89–91`). It does not exercise this sequence.

**Replacement:** one runner-owned orderly shutdown, with the existing lock released by that lifecycle. Distinguish deliberate operator shutdown from a producer failure. Preserve meaningful terminal exit status where termination is actually intended; do not retain process death for recoverable module, configuration, provider or symbol faults. Startup notification/error reporting must exist before the operations whose failures it must report.

### G03. Snapshot parity is not consumer parity; its fingerprint misses nested values

**Document:** v4 `:59`, `:72–73`, `:82–84`, `:95–97`; older boundary's one-view promise at `ogz-meta/inbox/fable/2026-09-08/STOP1-BOUNDARY-MISSION-2026-09-06.md:36–39`.

**Code proves:** the multiple read orders described in D1 exist. `track()` expects a value/source envelope (`foundation/ConfigLoader.js:649–656`), while the EMA strategy object is supplied directly at `:1030`; a BASE fallback can still supply that strategy (`:2995–3015`, `:3928–3941`). Snapshot omission therefore does not prove absence at the strategy consumer. Fingerprinting uses `JSON.stringify(safe, Object.keys(safe).sort())` (`:1444–1454`), an array replacer that restricts nested object keys too.

**Constructed sequence:** change a nested fee or stop field whose name is not a root key; or compare the snapshot's EMA field with the getter's BASE-derived value.

**Mechanical consequence:** nested values can fail to affect the serialized fingerprint; two output surfaces can disagree while each looks populated. A migration that preserves only the snapshot can change the strategy's actual inputs.

**Runtime unknown:** every effective consumer value under the private `.env`/PM2 state, and any actual receipt collision.

**Replacement:** remove duplicate authority only after tracing its live values into the canonical owner; all getters must project one accepted revision. Hash recursively canonicalized non-secret values and their intended identity, not a top-level property allowlist. Compare consumer inputs, including constructor captures and dynamic strategy/contract paths. Preserve valid zero, false, null and empty containers according to each consumer's actual semantics.

### G04. L8 cannot delete environment loading independently

**Document:** LAND-NOW `:17`; v4 `:58–59`, `:68–70`.

**Code proves:** ConfigLoader's dotenv function parses bytes and returns an object (`foundation/ConfigLoader.js:473–481`); it does not populate `process.env`. Telegram captures its token/chat ID from process.env at import (`utils/telegramNotifier.js:44–52`); Discord captures webhook URLs similarly (`utils/discordNotifier.js:48–54`). The runner requires these modules after ConfigLoader (`run-empire-v2.js:388–392`).

**Constructed sequence:** bare Node launch; credentials exist only in `.env`; remove both notifier `dotenv.config()` calls as specified.

**Mechanical consequence:** ConfigLoader can have credentials in its local parsed environment while notifier constants are absent. A zero-result `git grep dotenv utils/` would pass the proposed deletion check while notifications become unavailable.

**Runtime unknown:** actual launcher-provided tokens and delivery on the private system.

**Replacement:** move the credential producer and every credential consumer in one coherent change. Decide and document the one bootstrap load, then inject or read its credential output. The supplied plan's two-line deletion is technically wrong; determining that does not require asking Trey to invent a new credential policy. Include dynamic TrAI key selection (`core/trai_llm_config.js:56–70`), logger inputs and tooling with their correct process boundaries.

### G05. The plan still combines incompatible refusal, mode and activation instructions

**Documents:** v4 `:8`, `:20`, `:42`, `:56`, `:58–59`, `:69–73`, `:95`, `:175`; LAND-NOW `:3`, `:10`, `:20`, `:29`.

V4 simultaneously rejects boot refusal and prescribes legacy-env refusal and hash-mismatch boot refusal. It puts PROFILE in settings while attributing an `.env` mode flip/UI writer to A27. It says there is no separate activation gate while preserving language requiring separate PM2 approval. LAND-NOW repeats a similar contradiction between its opening execution instruction and footer assumption.

**Code relevance:** mode actually resolves from PROFILE env/default (`foundation/ConfigLoader.js:548–569`); live confirmation and eval checks can throw (`:1185`, `:1250–1254`); later `verifyTradingMode` fallback does not undo an earlier throw. These implementation facts establish neither A27's authority nor a blanket-refusal policy.

**Replacement:** one controlling boundary document, with original Trey words linked and superseded clauses explicitly withdrawn. Treat obsolete behavioral env as a migration input to remove from the producer, not authority to kill the bot. Reject an invalid proposed settings update at the writer while retaining a known accepted revision; if no usable initial revision exists, name the unavailable initialization and repair its source without inventing one. The present task explicitly prohibits operation, regardless of historical restart authorization.

### G06. Paper mode can reach a non-dry webhook

**Document:** v4 `:20`, `:131–134`; LAND-NOW excludes execution-boundary correction at `:5`.

**Code proves:** `useWebhook` is based on not-backtest and webhook enablement, not paper mode (`core/OrderExecutor.js:2809`, `:2853–2859`); webhook handling precedes local simulation (`:3418`, `:3603`). The adapter's live/dry-run check rejects live plus dry-run, but paper plus enabled plus dryRun=false can reach its HTTPS POST (`core/WebhookOrderAdapter.js:43–55`, `:97–154`).

**Constructed sequence:** paper profile; valid webhook URL; enabled=true; dryRun=false; otherwise eligible order reaches execution.

**Mechanical consequence:** a network order submission is reachable while the bot's resolved mode is paper. A successful HTTP response is not proof of the downstream venue accepting or filling an order.

**Runtime unknown:** actual webhook configuration, downstream service behavior, order acceptance/fill or financial effect.

**Replacement:** paper mode must determine execution behavior before route selection. Carry resolved execution identity into the existing order path; no new “paper safety” feature flag or downstream watchdog. Check both entry and exit webhook paths and persisted exit-intent recovery before mode switching is declared implemented.

### G07. TTP recovery is another submission owner, and nested policy can outlive the global eval switch

**Document:** v4 `:104`, `:111`, `:133`; LAND-NOW `:12` proposes only removing the loader weld.

**Code proves:** runner interval invokes TTP enforcement (`run-empire-v2.js:2458`). It injects broker-order management as `!webhookExecutionRoute`, with no paper test (`:1369–1389`). Cutoff recovery directly sends orphan close orders (`core/TtpCutoffEnforcer.js:239–253`, `:681–704`) and can cancel orders (`:587`). Its market-time state reads only `ttp.marketTime.enabled` (`core/EvalRuleEngine.js:109–112`), whereas entry checking separately honors global eval and TTP enabled flags (`:22–27`).

**Constructed sequence A:** paper runner, stock route, webhook disabled, nested TTP market-time enabled; an enforcement window and broker position not tracked locally satisfy the orphan branch. First complete startup against a flat account; then a broker position appears outside local trade state before the enforcement window. Set the independent `ALPACA_MODE=live`: the loader maps it separately (`foundation/ConfigLoader.js:978`) and validates membership, not equality to bot mode (`:1273–1286`). The runner passes it unchanged into the adapter (`run-empire-v2.js:179–190`, `:852–858`); the factory constructs the registered adapter (`brokers/BrokerFactory.js:25–40`; `brokers/BrokerRegistry.js:66–69`). The adapter selects the live URL from that value (`brokers/AlpacaAdapter.js:47–61`). This constructed ordering avoids assuming an already non-flat account could pass initial activation.

**Mechanical consequence A:** the direct broker send bypasses the main OrderExecutor simulation branch. Whether the endpoint is paper or live depends on the independent adapter mode; the bot's paper mode does not decide it.

**Constructed sequence B:** turn global eval/TTP off while the nested market-time setting remains enabled and the other enforcement conditions hold.

**Mechanical consequence B:** entry checks report eval disabled, but the cutoff producer can still obtain an enabled liquidation state. Similarly, stock share-range sizing reads TTP numeric caps without consulting eval enablement (`core/OrderExecutor.js:2278–2302`). Removing the loader's “live requires eval” throw does not fully separate the eval product from ordinary operation.

**Runtime unknown:** actual nested settings, broker positions, cancellation outcomes and requests. No live leakage was observed in this audit.

**Replacement:** correct these existing producers to consume the same ruled mode/eval identity. Include cancellation and orphan recovery, not just normal entries. This is a STOP 1 mode/ownership prerequisite; do not defer it as unrelated exit strategy work.

### G08. The R7 field assignment would not implement 5/7.5/25

**Document:** v4 `:26`, `:63`, `:135`; its later row withdraws the earlier mapping but does not supply the replacement.

**Code proves:** the executor uses `positionSizing.maxPositionSize` as its **base**, multiplies it by confidence up to 2.5, and makes its nominal maximum the same setting times 2.5 (`core/OrderExecutor.js:3104–3118`). It then applies confluence and a per-order cap against available capital (`:2378`, `:2392–2396`). Available capital subtracts existing exposure (`core/StateManager.js:789–800`). The separate PositionSizer is constructed (`run-empire-v2.js:653`) but I found no live call to its sizing method; DPS is explicitly unwired (`:1043–1045`, `:1351`).

**Constructed sequence:** apply the withdrawn plan's max=.075 and absolute=.25. With normalized confidence 1, the base becomes .1875; with a confluence multiplier 2, the requested fraction becomes .375 and the later per-order cap permits .25. If two distinct otherwise eligible trades serially use 25% of remaining capital, allocations are 25% plus 18.75% of initial equity, or 43.75%, before any different constraints.

**Mechanical consequence:** those assignments do not impose a 7.5% boosted trade or a 25% aggregate-account cap. Same-symbol/strategy/direction concurrency and scale-in checks (`core/OrderExecutor.js:1657–1786`) are not that aggregate cap.

**Runtime unknown:** which confidence, confluence, available-capital and other eligibility conditions occur live; this does not claim such trades executed.

**Replacement:** one final sizing calculation in the existing executor, with normal/earned boost/aggregate allocation as distinct ruled concepts; use StateManager's correctly scoped exposure and include pending opening allocations so concurrent decisions cannot spend the same remaining allocation. Do not implement the percentages by renaming existing fields. The precise account denominator and unresolved boost qualification details belong in K, not an invented formula.

### G09. A later share minimum can undo an earlier dollar cap

**Document:** v4 sizing work at `:63`, `:135` omits this downstream adjustment.

**Code proves:** `_buildEntryPlan` caps dollars, converts to quantity, then calls `_applyStockShareRange`; that function can raise quantity to minShares (`core/OrderExecutor.js:2392–2413`, `:2316–2322`). It then recomputes planned dollars from that larger quantity. The share caps use configured share/notional and TTP figures, not the earlier currentBalance × absoluteCap calculation (`:2266–2306`).

**Constructed sequence:** price $100, available capital $1,000, earlier cap .15, minimum 10 shares, and all other share caps at least 10. The earlier cap is $150; quantity rounds to one share; the minimum raises it to ten; planned dollars become $1,000.

**Mechanical consequence:** the returned sizing plan can exceed the cap it just reported applying. A later unrelated gate may block the order; that does not make the sizing producer correct.

**Runtime unknown:** whether current selected settings and live eligibility reach this combination; no actual cap breach is claimed.

**Replacement:** all quantity rules must be resolved within the same allocation calculation. If the venue/minimum requirements cannot fit the ruled allocation, the producer must return that named unsatisfiable order decision; it must not silently enlarge the allocation. This is not a new supervisory gate.

### G10. Scheduled switching is implemented, but the configured schedule is not its owner

**Document:** v4 `:18`, `:45–46`, `:145–147`; older boundary `:70` says to discover whether scheduled mode exists.

**Code proves:** both mode names exist (`foundation/ConfigLoader.js:527`; `core/SessionRouter.js:56–69`), and the loader validates schedule data (`foundation/ConfigLoader.js:572–605`). SessionRouter's constructor and calendar evaluation use the calendar and explicit timing logic instead of consuming the profile's schedule object (`core/SessionRouter.js:40–129`, `:340–475`). Stock transitions subscribe the stock list; crypto activation/switching selects only `cryptoSymbols[0]` (`:1642–1646`, `:1705–1709`).

**Constructed sequence:** operator edits a supported schedule field or supplies multiple crypto watchlist symbols, then selects scheduled mode.

**Mechanical consequence:** the schedule edit is not established as a decision input by this owner; the explicit crypto subscription intent covers only the first symbol. Actual broker data for other symbols cannot be inferred from registration or subscription-cache entries.

**Runtime unknown:** actual broker subscriptions/candles and switching across a live session boundary, including holidays and early closes.

**Replacement:** SessionRouter consumes the operator's schedule; calendar facts remain broker/market facts rather than guessed opening times. Complete the desired symbol/timeframe acquisition in the adapters, with STOP 2 native-candle admission proof before claiming activated watchlist behavior.

### G11. Target identity and transition receipts can use different accounts

**Document:** v4 `:144`, `:111`; calling credential correction “moot” does not repair identity acquisition.

**Code proves:** target scope tries adapter account identity, then allows config identity only for a matching broker (`core/SessionRouter.js:891–943`). KrakenIBrokerAdapter inherits `brokers/IBrokerAdapter`, not the separate foundation interface (`brokers/KrakenIBrokerAdapter.js:16–26`). The inspected Kraken wrapper has no account identity method/field; its inherited constructor has none (`brokers/IBrokerAdapter.js:19–25`). Account-bearing operations remain delegated rather than establishing that identity (`brokers/KrakenIBrokerAdapter.js:133–152`). Target scope is built before transition operations (`core/SessionRouter.js:1585`), while broker-intent receipts and pattern handoff read `ctx.config.accountId` (`:749–775`, `:1040–1050`). Dashboard scope writes go to StateManager (`:946–963`); the transition listener changes the active adapter, not the runner's account configuration (`run-empire-v2.js:1025–1037`).

**Constructed sequence:** current config identifies Alpaca account A, switching target is Kraken, whose wrapper supplies no account ID.

**Mechanical consequence:** the target scope cannot borrow Alpaca's identity and throws. Supplying only a target scope elsewhere would still leave intent/pattern receipt construction reading the source account unless those producers are corrected too.

**Runtime unknown:** actual instantiated adapters and externally supplied identity; no live account confusion is claimed.

**Replacement:** acquire broker-native/authoritative account identity in the broker producer, carry it through transition, execution, pattern and trace contexts, and prove it matches the intended account. Never fill the absence with `default`, the previous broker's account, or the dashboard label.

### G12. Failed transitions can become permanent global pauses, and successful ones clear unrelated pauses

**Document:** v4 `:18`, `:24`, `:146`, `:170`.

**Code proves:** startup failure enters failed-safe handling and returns before the periodic check is installed (`core/SessionRouter.js:300–313`). `failedSafeMode` is initialized false at `:78`, set true at `:1388`, and checked to skip evaluation at `:357`; I found no reset assignment in the complete file. It also rejects OHLC in that state (`:1156–1161`). Failed handling uses global StateManager pause (`:1437–1456`). Successful transitions call unconditional `resumeTrading()` (`:1562`, `:1663`), which clears global pause state (`core/StateManager.js:2597–2634`).

**Constructed sequence A:** transient startup broker failure enters failed state; the broker later becomes available.

**Mechanical consequence A:** no source-proven self-recovery path reinstalls normal evaluation from that startup return. The global pause and OHLC rejection can remain until some outside lifecycle action, so healthy services cannot be assumed unaffected.

**Constructed sequence B:** an operator or another producer pauses entries during an in-flight transition, then the transition completes.

**Mechanical consequence B:** unconditional resume can clear the unrelated pause. A first-symbol field in the pause metadata does not make the pause symbol-local: StateManager changes the global trading field (`core/StateManager.js:2554–2590`) and OrderExecutor reads it (`core/OrderExecutor.js:2907`).

**Runtime unknown:** actual overlap, broker recovery and exit-data continuity.

**Replacement:** transition acquisition/recovery remains with SessionRouter and its adapters; recovery retries the original failed producer and proves its result. Scope pause ownership and resume only the state that transition owns. Remove the failed-state dependency that starves necessary data/exit processing; do not add a replacement downstream watchdog.

### G13. A halt reset exists, but equality with broker holdings is not sufficient recovery

**Document:** v4 `:24`, `:148`, `:170` claims about clear paths; R6.

**Code proves:** StateManager has a real reset method, deleting the symbol entry (`core/StateManager.js:4162–4174`), and halt creation overwrites that symbol's record (`:4115–4140`). TTP has a condition-specific reset caller (`core/TtpCutoffEnforcer.js:877–884`). Persisted exit-intent reconciliation separately tracks reservation release and unresolved direction (`core/OrderExecutor.js:1339–1386`).

**Constructed sequence:** recovery of halt A begins; halt B replaces A for the same normalized symbol; A's recovery calls the blind reset.

**Mechanical consequence:** B is deleted. A statement that local quantity equals broker quantity also does not prove a pending exit intent is resolved, an unknown-direction trade is repaired, an order's final state is known or a broker truth outage has ended for the same account.

**Runtime unknown:** actual replacement race and durable recovery outcomes.

**Replacement:** each original producer proves the named condition's repair, with broker/account/mode/symbol and the original record identity checked before committing its removal. Use the existing state owner and persistence; retain unrelated state. Do not introduce a general “clear everything when REST succeeds” recovery component.

### G14. Cooldown deletion must include durable state and its producers

**Document:** v4 `:24`, `:105`, `:148`, `:150`; LAND-NOW excludes it at `:5`.

**Code proves:** closing a trade reaches cooldown/loss-streak production (`core/StateManager.js:1676`, `:3973–4045`), halt normalization can expire/drop disabled cooldown records (`:4053–4088`), and restart loading restores/normalizes those fields (`:4388–4465`). This disproves “nothing ever clears.” It also means deleting only an env key or JSON toggle leaves fallback-bearing readers and old persisted records.

**Replacement:** remove the ruled cooldown producer/callers and settings, deliberately migrate only its persisted loss-streak/cooldown records, and preserve unrelated financial-integrity halts. Prove a restart cannot resurrect it. This is source/state ownership correction, not a new cooldown duration or replacement loss cage.

### G15. R4's freeze list is incomplete, including indirect readers

**Document:** v4 `:30`, `:43`, `:95–97`, `:137`, `:117`.

**Code proves:** PolicyBuilder freezes fees, contract and profit groups but does not include the current trail configuration (`core/PolicyBuilder.js:577–598`). ExitContractManager captures BASE trail config and reads BASE break-even/fee-buffer fields (`core/ExitContractManager.js:263`, `:729–794`, `:821–836`). More importantly, a real stop check calls BreakEvenManager and then `FeeModel.roundTripFeePercentForTrade()`, which reconstructs fees from current ConfigLoader values (`core/ExitContractManager.js:373`; `core/exit/StopLossChecker.js:35–40`; `core/exit/BreakEvenManager.js:104–105`; `core/FeeModel.js:49–56`, `:109`). MaxHoldChecker also uses current fees to classify the exit (`core/exit/MaxHoldChecker.js:17`, `:41–42`).

**Constructed sequence:** trade is opened with policy revision A; the planned hot settings writer accepts global fee/break-even/trail revision B; a later exit evaluation of the old trade reads the global path.

**Mechanical consequence:** the old trade can be evaluated with B despite containing a frozen A object. The current lack of a completed hot writer does not make the planned sequence safe.

**Runtime unknown:** no hot settings update or old-trade exit change was observed.

**Replacement:** freeze every actual operative exit input before enabling global hot changes, including the indirect fee reads and contract fallback paths. Prove old trade A retains A, new trade B receives B, and both survive restart with the same identities. I checked TrailingStopChecker too: the current coordinator does not construct/call it, so its fee read is a legacy concern, not evidence that this particular live trail runs through it (`core/ExitContractManager.js:258–267`, `:373–398`).

### G16. The proposed one-trade edit path rejects the edit and does not durably save it

**Document:** v4 `:28`, `:95–97`, `:137`, `:139`.

**Code proves:** `updateActiveTrade()` rejects a changed frozen policy hash (`core/StateManager.js:2850–2857`), rebuilds the trade record from the supplied object (`:2861–2867`), and deliberately does not save (`:2881–2884`). Exit checking uses `trade.exitContract` (`core/ExitContractManager.js:359–365`; `core/exit/StopLossChecker.js:35–40`). The operator UI emits `update_stop_loss` without a complete trade/account/symbol identity (`public/js/operator/trade-manager.js:53`); the inspected bot message switch has no handler for that command (`core/WebSocketManager.js:170–310`).

**Constructed sequence:** implement the v4 wording by passing a new frozen policy alone to `updateActiveTrade()` or by relying on the existing UI command.

**Mechanical consequence:** the policy-change call throws; bypassing the hash check alone still does not update every operative field or persist an acknowledged edit. A UI send is not application by the bot.

**Runtime unknown:** the complete deployed browser/server relay and any successful customer edit receipt were not obtained.

**Replacement:** define the explicit one-trade mutation in the existing StateManager-owned lifecycle. Supply full trade identity and expected prior policy, update operative contract plus its policy together, persist, then acknowledge. Keep the existing immutable entry-policy provenance rather than falsifying its original hash. Global settings and per-trade state are different durable objects even if the UI offers both.

### G17. Fees cannot be selected by data-broker name alone

**Document:** v4 `:114` says fees keyed by active broker; R2/R7/R4 interact here.

**Code proves:** the entry plan distinguishes execution venue `signalstack_ttp` from its market-data broker (`core/OrderExecutor.js:2853–2859`), but FeeModel reads a global fee group (`core/FeeModel.js:49–56`, `:109`). State accounting also uses FeeModel (`core/StateManager.js:1208`, `:1604`, `:1843`). Paper fills separately apply `fees.slippage` (`core/OrderExecutor.js:3613–3620`); current JSON keeps `.0005` slippage with zero maker/taker fields (`config/trading.config.json:2326–2331`).

**Constructed sequence:** Alpaca supplies prices while execution is through SignalStack/TTP; choose an Alpaca fee profile solely because the data broker is Alpaca.

**Mechanical consequence:** fee policy can be attributed to the wrong execution venue/account. Setting all fee fields to zero would additionally erase the existing modeled slippage if done indiscriminately.

**Runtime unknown:** actual contractual fees, fills, broker charge receipts and per-venue account arrangements.

**Replacement:** select by actual execution venue/account and freeze the selected policy where trade semantics require it. Keep commissions, other broker charges and simulated slippage explicitly distinguished. Alpaca describes paper as simulated execution with separate keys/endpoint, not a live fill receipt; it also distinguishes commission policy from regulatory fees. [Alpaca paper trading](https://docs.alpaca.markets/us/docs/paper-trading), [commission/clearing fees](https://alpaca.markets/support/commission-clearing-fees), [regulatory fees](https://alpaca.markets/support/regulatory-fees). These documents do not establish this bot's account-specific charges.

### G18. Notification and publisher receipts overstate what the proposed checks can prove

**Documents:** LAND-NOW `:10`, `:14`, `:16`, `:18`; v4 `:103`, `:151`.

**Code proves:** Ntfy's max selector looks for particular event substrings/manual reconciliation, while errors use a different high-priority path (`core/NtfyTraceNotifier.js:90–110`). The proposed `REQUIRED_MODULE_ABSENT`, `CONFIG_WARNING` and `NTFY_NOTIFIER_ABSENT` names do not themselves match max; `CONFIG_ERROR` matches high. Its handler queues asynchronously and returns before delivery (`:176–190`). Loader errors can throw before a returned snapshot is available (`foundation/ConfigLoader.js:1521–1535`), making “print snapshot.errors after load” insufficient. Installation happens after module loading (`run-empire-v2.js:337`, `:1063–1082`).

Publisher writes have more than a scheduling entrypoint: delayed callbacks and shutdown/exit flushes call the writer (`ogz-meta/claudito-logger.js:717–729`, `:828–841`). Trade proof append and another live-proof path are separate (`:617–629`).

**Constructed sequence:** schedule publication while enabled; then the future hot writer disables publication; a previously scheduled callback or shutdown flush executes. Separately, emit the planned module-absence event before the notifier is installed.

**Mechanical consequence:** gating only new scheduling cannot guarantee publisher-off for pending work; emitting an event does not guarantee a max notification, much less a phone receipt.

**Runtime unknown:** actual queued work, service acceptance and phone delivery. A missing topic cannot deliver its own absence to that missing channel.

**Replacement:** gate/cancel at the existing publication owner's actual write paths, preserve trade proof, retain optional account inputs while disabled, and name absence. Install/use early reporting for early failures and route the requested events explicitly. Separate emitted trace, attempted send, service response and watched phone delivery. Do not defer these narrow prerequisites while accepting L1b/L7/L9 on promises of later notifier repair.

### G19. Supporting evidence tooling can grade formatting or promote an incomplete claim set

**Documents:** bridge mission and v4 `:122`; not bot trading authority.

**Code proves:** ReAct refuses a content-only first reply unless it has the prescribed candidate heading (`trai_brain/mercury-bridge/react-loop.js:983–1000`), and source-count/inherited-section requirements remain in doctrine assessment (`trai_brain/mercury-bridge/doctrine-review.js:124–161`). With no changed files, zero tools and no missing-citation flag, the no-mechanical-evidence absence is not added (`:144–153`); a syntactic citation does not validate its claim. Panel agreement needs two qualifying successful seats but only one claiming seat (`trai_brain/mercury-bridge/reviewer-panel.js:173–188`).

**Constructed sequence A:** a substantively complete first answer lacks the prescribed heading. It is rejected as Phase 1 regardless of its evidence. **Sequence B:** two independently identified, evidence-qualified seats succeed; one has pass, the other no_claim; no selected seat fails.

**Mechanical consequence:** formatting can suppress the first answer, and the panel function can return FULL agreement with only one affirmative claim. This does not mean a particular historical verdict was wrong; that would require its actual inputs and receipts. The later evidence-union change does correctly retain additional reads (`react-loop.js:80–201`), but union/subset checks prove neither exhaustive investigation nor semantic truth.

**Replacement:** do not use these outputs to clear STOP 1. If retained as tooling, receipts should report precisely which claim had which evidence and which participants actually made it; original evidence and findings remain visible independently of formatting. No new panel/consensus regime is needed for this audit.

### G20. Direct-question failure can lose earlier tool receipts

**Document:** supporting direct-question changes `0fe95806`, `0f2e1da1`.

**Code proves:** history is local to `runDirectToolLoop()` (`trai_brain/mercury-bridge/direct-question.js:244`); the provider call is awaited without a local history-preserving catch (`:252–259`). `executeDirectQuestion()` receives a loop result only on resolution and otherwise looks for an attached result or falls back to empty telemetry (`:374–384`, `:424`, `:452–460`).

**Constructed sequence:** iteration one successfully opens a file; the next provider request fails permanently before the loop returns.

**Mechanical consequence:** provider-attempt receipts can exist while the outer failed-run receipt has no earlier tool history. The happy-path test named “every provider turn, tool receipt” is not proof of this failure path.

**Runtime unknown:** no such provider run was executed in this audit.

**Replacement:** preserve already obtained tool receipts on the existing loop's error return/throw and report actual termination. This is a bounded evidence-tooling correction, not a new bot framework or a prerequisite to implementing an unrelated cosmetic change.

### G21. Singleton acquisition is not exclusive

**Document:** v4 `:22`, `:143`, `:115` defers the race; Trey explicitly requires preventing a second bot.

**Code proves:** the lock checks existence, then uses AtomicWrite (`core/SingletonLock.js:49–107`). AtomicWrite writes a temp file and renames it (`core/AtomicWrite.js:25–28`); it does not exclusively claim the destination. A later monitor is not acquisition exclusivity (`core/SingletonLock.js:175–220`).

**Constructed sequence:** A and B both observe no lock; A completes its write/rename; B then completes its write/rename using its own token.

**Mechanical consequence:** both acquisitions can report success before any later monitor detects a discrepancy. Changing a lock filename during migration can likewise create two lock domains; no rename is needed to fix the core defect.

**Runtime unknown:** actual double-starts, OS/filesystem behavior and PM2 timing.

**Replacement:** repair exclusive acquisition in the existing lock and keep its established identity during migration. Coordinate release with G02. Verify competing process starts and stale-owner recovery on the target filesystem, without starting a second trading bot. Node documents exclusive file-open flags separately from rename; the filesystem/platform still needs its own receipt. [Node filesystem API](https://nodejs.org/api/fs.html).

### G22. The migration denominator and “dead/performance-only” classifications are not proven

**Document:** v4 `:65`, `:87–91`, `:149`, `:167–168`; B08/B09/D1.

The independent structural census finds 1,748 primitive-or-empty-container trading paths and 113 primitive feature paths. The manifest matches 1,737 trading paths and omits 11 empty arrays. Its 110 apparent feature-path mismatches are explained mechanically by an omitted `features/` wrapper, not missing feature values. The attached comparison lists every path and line. This is not evidence that those aliases are accepted by a runtime getter.

The manifest also bundles some constructor/literal objects, and 341 HOLD rows are not a completed ownership mapping. Source evidence contradicts two concrete D1 claims: BreakRetest's ten-bar recomputation and top-ten level selection feed NTZ/entry qualification (`modules/BreakAndRetest.js:143`, `:206`, `:270–277`); FVG's `config.minFVGPercent || 0.05` replaces a supplied numeric zero with 0.05 (`modules/FairValueGapDetector.js:26`). A parent passing a property does not make that fallback inert.

**Constructed sequence and limit:** supply numeric zero as `minFVGPercent` to this constructor. JavaScript truthiness mechanically chooses 0.05. Whether a current production caller supplies zero, whether that zero is allowed by its full parameter contract, and the resulting trade consequence remain unproven. The BreakAndRetest reads establish a decision dependency; they do not prove an observed changed trade.

**Replacement:** finish a leaf-and-consumer manifest from actual producer/read paths, including empty containers, dynamic aliases, constructor fallbacks and tooling writers. Keep unresolved facts unresolved; do not label them DELETE or ask Trey for 341 policy decisions merely because the old spreadsheet says HOLD. Source absence searches and AST candidates narrow investigation; neither alone proves runtime deadness.

### G23. “Delete the circuit breaker” and boot cosmetics are narrower than their names suggest

**Document:** LAND-NOW `:11`, `:13`; v4 `:113–115`.

`core/ErrorHandler.js` exports a class whose constructor installs the counter; loading the file is not constructing it (`core/ErrorHandler.js:45–66`, `:159`). I found autoloader/tooling references but no live instantiation of that class in the runner path. The feature manager loads the CIRCUIT_BREAKER block, which is different from a trading consumer acting on it (`core/FeatureFlagManager.js:71`, `:113–123`; `config/features.json:60`). Removing dead policy/configuration is justified cleanup, but it does not establish that the current bot's real fault handlers were repaired.

Cosmetics can be a small, separate commit. They do not prove singleton exclusivity, correct shutdown, or startup completion. Keep the current lock identity until its lifecycle is coherently migrated; changing log text is not a reason to change it.

### G24. Pattern-memory initialization must move before the old environment source is removed

**Document:** v4 `:68–69`, `:138`; one-load cleanup is necessary but insufficient.

**Code proves:** initial mode can use an explicit argument or cached loader result (`core/UnifiedPatternMemory.js:182–184`), but the live/paper initial asset bucket uses process.env and throws without ASSET_CLASS/BROKER (`:191–206`). Persistence and paths have additional env authority (`:230`, `:248–249`). Construction loads the bank and installs its save timer (`:257–263`). First singleton creation wins; later arguments are ignored (`:1196–1200`). Real consumers can request the singleton without configuration (`core/EnhancedPatternRecognition.js:393`; `core/trai_core.js:124`; `core/TRAIDecisionModule.js:517`).

**Constructed sequence:** remove old broker/asset env keys, or inject corrected configuration only after an earlier no-argument singleton request.

**Mechanical consequence:** bank initialization can fail or already be committed to the wrong initial source before the later injection. Merely replacing `load()` with `get()` cannot repair asset-bucket resolution. A backtest bank filename fallback of `default` is explicitly present (`core/UnifiedPatternMemory.js:197`), not a proved ticker identity.

**Runtime unknown:** actual first caller, active bank contents and any historical cross-bank contamination were not observed.

**Replacement:** move mode, asset, persistence and path inputs with every first-creation caller; change the resolver to consume the actual explicit contract before deleting old inputs. Prove correct bank selection and old-bank flush/new-bank load across transition and restart. Broader pattern-quality/learning behavior belongs to its later walk stop; this configuration/identity prerequisite does not.

### G25. Initial activation requires broker flatness even when restarting existing trade management

**Document:** v4 `:8`, `:38–49` requires repeated real restarts, while `:28–30` requires existing positions to retain policy. The repository walk leaves restart-with-open-positions explicitly unresolved in editorial B3 (`ogz-meta/inbox/fable/2026-09-09/OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM.md:194`); that note is not a ruling to quarantine or flatten.

**Code proves:** initial stock activation calls `_reconcileBrokerRestBeforeActivation(null, target, ...)` before order-router registration and candle subscription (`core/SessionRouter.js:1746–1773`); initial crypto activation does the same (`:1694–1709`). The common method rejects any normalized target open position or open order (`:1333–1358`), without comparing those holdings to valid restored local trades. Startup catches that failure and enters the failed state described in G12 (`:275–313`). StateManager separately restores/normalizes trade scope, quarantines invalid records and records broker-verification issues (`core/StateManager.js:4470–4501`; `:2354–2437`); a later restored-count log is not permission or evidence of resumed management (`:4590`).

**Constructed sequence:** an otherwise valid process restarts while its target broker has a normalized nonzero position, including one correctly represented in restored local state. REST calls succeed and report that position.

**Mechanical consequence:** the common flatness predicate rejects activation anyway. A successful REST response and restored trade Map therefore do not prove that its market-data and management path resumed. This is distinct from the ruled requirement to flatten the source before switching sessions.

**Runtime unknown:** actual restart holdings, credential/account alignment, restored records and which exit paths remain functional. I did not observe a stranded position or an order.

**Replacement:** distinguish startup restoration from a session switch in the existing state/transition owners, and complete their account/mode-specific producer reconciliation before claiming restart acceptance. Do not solve this by deleting the flatness condition everywhere, pretending a nonzero broker position is flat, adding a startup cage, or silently executing a live recovery order from paper mode. The cross-mode legacy-position policy is K4; engineering proof of existing same-identity management is J6/J13/L.

## H. Configuration ownership table

The companion configuration evidence ledger records each inventoried source leaf/empty container, literal environment candidate, BASE-only definition and manifest-only row separately, with exact source locations and candidate reader/mapping links. It is an **evidence ledger**, not an approved migration map: dynamic readers, unproven liveness, units and actual private runtime values remain explicitly unresolved where not established. The following table gives the engineering dispositions established for the traced classes; a class covers only the listed paths, not every child of a similarly named object.

“Preserve” below means preserve the **consumer-effective semantics**, with the authorized behavior changes separately recorded. It does not mean preserve a rejected feature or a shadow value merely because it currently exists.

| Leaf or precisely bounded class | Old/current owner and readers | Canonical owner | Type/unit/zero/empty semantics established | Defaults/fallbacks and required disposition |
|---|---|---|---|---|
| Broker API credentials; notifier credentials; selected TrAI API key | dotenv/process.env; loader `foundation/ConfigLoader.js:473–481`; notifiers `utils/telegramNotifier.js:47–52`, `utils/discordNotifier.js:53–54`; dynamic TrAI key `core/trai_llm_config.js:56–70` | One credential producer; service-specific consumers | Secret strings; absent credentials are named service absence, not fabricated values. Exact optional/required status follows the actual route/service. | Move producer and captures together; retain no notifier-side file load. Redact receipts. |
| `DOTENV_CONFIG_PATH` | `foundation/ConfigLoader.js:1479` | Bootstrap path | Path string; exact absent behavior currently `.env` | An actual bootstrap input, unlike trading mode. Preserve explicit path resolution and report source without exposing contents. |
| `PROFILE`; `launchProfiles.defaultProfile`; profile `mode`/`confirmLive` | `foundation/ConfigLoader.js:548–569`, `:1185` | Settings-owned selection and derived runtime mode, subject only to an evidenced explicit Trey exception | Enumerated mode; boolean confirm. Empty profile selects the configured default today. | Resolve A27 attribution; remove alternate mode stamps with their readers. Do not leave two selectable owners. |
| `EXECUTION_MODE`, `TRADING_MODE`, `PAPER_TRADING`, `LIVE_TRADING`, `BACKTEST_MODE`, `CANDLE_SOURCE` mode effects | Loader plus `core/BotStateFrame.js:136–148`, `core/SingletonLock.js:25–28`, `instrument.js:57` | Derived mode from the accepted settings/invocation contract | Existing booleans/string modes have different parsing today; do not merge by truthiness. | Remove behavioral env authority after consumer parity; include telemetry and lock skipping. |
| `webhookOrders.enabled`, `dryRun`, URL, timeout, order-log cap | `run-empire-v2.js:1303–1309`; `core/WebhookOrderAdapter.js:43–55` | Settings for behavior/internals for implementation limits; URL credential if secret-bearing; one resolved execution identity | Booleans; milliseconds for timeout; count for log cap; URL string | Existing enabled/dry-run precedence can bypass paper. Fix G06/G07 before mode activation. No extra flag. |
| Global eval enabled and TTP enabled | `core/EvalRuleEngine.js:22–27`, `:109–112`; `core/OrderExecutor.js:2278–2302` | Existing eval-policy selection | Booleans; false must mean the ruled eval behavior is off at **all** its producers | Remove live/eval weld plus hidden nested consumers; do not preserve cutoff/sizing control merely because child values remain. |
| `positionSizing.maxPositionSize`; corresponding env/entry-sizing aliases | `core/OrderExecutor.js:3107–3118`; separate `core/PositionSizer.js:28`, `:67–81` | Existing executor's normal/boost sizing settings after semantic reconciliation | Decimal fraction of the chosen account measure; currently used as base and multiplied | Not a literal maximum today. Preserve neither its misleading name nor conflicting independent value. R7 mapping requires formula correction. |
| `entryLogic.sizing.absoluteCapPercent` | `core/OrderExecutor.js:2392–2396`, `:3125–3128` | Separate ruled aggregate-allocation concept, applied in final sizing | Current decimal fraction of available capital **per plan**, not aggregate account exposure | Cannot become aggregate 25% by assignment alone. Include existing/pending allocation in the same producer. |
| `features.enableDynamicSizing`; inline confidence constants `.5`, `2.5`, `4.0`; confluence multiplier | `core/OrderExecutor.js:3104–3118`, `:2378` | Ruled sizing semantics | Boolean plus multipliers; false selects flat current calculation; missing uses true/default 1 | These alter actual size. Do not treat as static constants or leave a second boosting owner. |
| `stockShareRange.enabled`, `minShares`, `maxShares`, `maxNotionalUsd` | `core/OrderExecutor.js:2239–2275`, `:2316–2322` | Same final sizing owner | Shares/count and USD; min=0 disables minimum; current max≤0 means no cap from that leaf | A minimum may enlarge quantity after dollar capping. Reconcile with allocation; do not silently raise size. |
| `stockShareRange.consistencyCapBuffer`, `dailyLossRiskFraction`; TTP numeric caps | `core/OrderExecutor.js:2278–2302` | Selected eval policy plus sizing consumer | Fractions constrained >0 and ≤1 when used; dollars/ratio are distinct fields | Merely positive TTP numbers currently activate caps; condition on the actual selected policy and preserve explicit semantics. |
| `fees.makerFee`, `takerFee`, `totalRoundTrip`, `model`, `perShare`, `minOrderFee` | `core/FeeModel.js:49–56`, `:109`; state/PnL consumers | Execution venue/account fee policy | Model enum/string; percent/fraction versus USD/share must follow model conversion; zero fee is valid | Freeze operative per-trade inputs, remove global post-entry authority. Do not infer fees from data broker. |
| `fees.slippage` | `core/OrderExecutor.js:3613–3620`; JSON `config/trading.config.json:2329` | Settings-owned simulated fill assumption | Decimal price fraction; finite nonnegative, zero permitted; current .0005 | Keep separate from commission; an authorized commission-zero change is not slippage-zero authority. |
| `fees.safetyBuffer`, trail fee buffer | `core/PolicyBuilder.js:545–555`; `core/ExitContractManager.js:836` | Explicit exit-policy inputs | Preserve the consumed unit; do not assume all fee-named fields share one unit | Move and freeze with consumers, not only FeeModel. |
| `exitLogic.trail` operative fields | `core/ExitContractManager.js:263`, `:729–794` | Entry-bound policy from settings | Mix of booleans, multipliers and percent distances; null/missing is not an invented zero | Canonicalize every listed consumer field; constructor capture and subsequent reads must use the correct trade revision. |
| `exitLogic.breakEvenStop.enabled`, `triggerPercent`; related break-even inputs | `core/ExitContractManager.js:821–836`; `core/exit/BreakEvenManager.js:65–105` | Entry-bound policy | Boolean and percentage thresholds; preserve explicit disable semantics | Include direct BASE and indirect global fee paths in the same freeze boundary. |
| `exitContracts.<strategy>.stopLossPercent`, `maxHoldTimeMinutes`, invalidations, ownership fields | `core/PolicyBuilder.js:590`; `core/ExitContractManager.js:359–377`; `core/exit/StopLossChecker.js:35–40` | Strategy settings → entry-bound operative contract | Per-field semantics: null/0 stop is deliberately distinct from a positive/negative stop; empty invalidation array means no such conditions | Do not bulk-normalize null→0 or remove empty arrays; trace each strategy's binding rather than treating the whole JSON family as live/dead. |
| Timeframe `trailPct`, `maxHoldMin`, `slPct`, `tpPct` | `foundation/ConfigLoader.js:3980–4012`; caller `core/ExitContractManager.js:950` | Settings projections with explicit timeframe identity | Ratio fields and minutes differ; numeric coercion currently permits values beyond mere source type | Preserve consumer values while removing BASE duplication; unknown timeframe already throws instead of defaulting to 15m. |
| EMA strategy object and its children | Snapshot `foundation/ConfigLoader.js:1030`; BASE `:2995–3015`; consumer `core/StrategyOrchestrator.js:466`, `:865` | Strategy settings, one getter projection | Typed per actual EMA consumer; this audit does not invent zero semantics for all children | Fix tracking envelope and remove fallback only after preserving the values the actual constructor receives. |
| FVG `minFVGPercent`, `maxFVGPercent` constructor defaults | `modules/FairValueGapDetector.js:26–27` | Strategy settings/explicit caller contract | Percent thresholds; current `||` replaces zero. Whether zero is a permitted requested setting needs its consumer contract, not truthiness. | Remove the shadow policy when the canonical required inputs are supplied. Do not call it dead because its parent usually passes values. |
| BreakRetest ten-bar cadence and ten-level selection | `modules/BreakAndRetest.js:206`, `:270–277`, entry at `:143` | Explicit strategy parameter ownership, not presumed performance internals | Bars and candidate count | Changes NTZ/qualification; HOLD requires semantic analysis, not blanket retention as performance-only. |
| Loss cooldown fields and persisted loss streak | `core/StateManager.js:1676`, `:3973–4088`, `:4388–4465` | Removed by ruling; StateManager owns migration | Remove only the ruled feature's state, not unrelated halts | Delete producers/readers/settings together; prove no restart resurrection. |
| Warning levels 3/4/5 and 5/10/15; daily-loss 50% | `ogz-meta/inbox/fable/2026-09-09/OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM.md:110–122`; implementation families remain separate | Customer settings and existing risk/state producer | Counts versus percent; warnings do not flatten; daily threshold blocks new entries and preserves exits | Do not claim implemented because settings exist. Complete the STOP 1 contract and name later risk-behavior proof dependency explicitly. |
| Router mode, static session, schedule, wind-down | `foundation/ConfigLoader.js:572–605`; `core/SessionRouter.js:340–475` | SessionRouter consumes settings; calendar supplies market facts | Mode strings; timezone/local times/minutes must be explicit; empty watchlist is not a default symbol | Correct unused schedule and full watchlist acquisition before switching acceptance. |
| Stock/crypto symbol lists | `core/SessionRouter.js:111–129`, `:1540`, `:1642–1646` | Settings → existing acquisition owner | Arrays of identified instruments; preserve ordering only where semantically required, not as authority to ignore all but index 0 | Registering a list is not subscribing/admitting it. STOP 2 proves native candle delivery for each intended tuple. |
| Pattern mode/asset bucket/persistence/path inputs | `core/UnifiedPatternMemory.js:182–206`, `:230`, `:248–263`, `:1196–1200` | Explicit initial contract from canonical settings/bootstrap; existing memory owner | Mode/asset identity; path string; persist boolean; no invented `default` ticker | Move before first singleton creation and remove env overrides with their readers. Preserve mode/asset bank separation. |
| `TRADING_TIER` and resolved bot tier | `core/FeatureFlagManager.js:68`; runner tier construction | One settings-owned tier identity and one intended scaling table | Enum/tier identity; missing currently falls back to `ml` in this reader | Do not retain env as compatibility. Reconcile actual differing consumer effects before choosing values. |
| `features.*.enabled` for retained live features | `core/FeatureFlagManager.js:71`, `:113–125`; separate runner import `run-empire-v2.js:308` | Settings; same accepted revision | Booleans with per-feature liveness established individually | A reload method's existence is not a live hot-update receipt; remove independent file owner with the consumers. |
| CIRCUIT_BREAKER feature block and ErrorHandler counter | `config/features.json:60`; `core/ErrorHandler.js:45–66` | Delete rejected/dead policy after exact reference cleanup | Metadata fields are not customer trading parameters merely because they occur inside this block | No live counter invocation established; deleting it does not repair real fault producers. |
| `trackRecordPublisher.enabled` and nine account/publication inputs | Planned leaf; existing logger `ogz-meta/claudito-logger.js:327–431`, `:717–729`, `:828–841` | Existing publisher settings and credential/input owners | Boolean off; account labels/string/date/count/dollar fields are not one type; inputs optional while off | Explicit authorized enablement, not a generic safety flag. Gate all actual publication writes; preserve proof append. |
| Runtime source/hash/revision fields | `foundation/ConfigLoader.js:1444–1454`, `:1528–1534`; frozen policy `core/dto/FrozenExitPolicy.js:29–53` | One configuration revision; separate trade policy revision | Version identity and deterministic hash; timestamps are not revision identity | Nested hash fix; source labels and consumers must agree. Do not confuse valid frozen-policy hash with broken config fingerprint. |
| `tuningProfiles.definitions.*.env.*` entries | Dynamic assignment `foundation/ConfigLoader.js:495–522`; mapping `:2016`, `:3833` | Explicit presets within settings | Current values become strings before env parsing; original type cannot be silently changed | Expand each key and alias in ledger; no live/backtest override leakage; remove obsolete env-payload authority with tooling writers. |
| 11 missing empty arrays | Exact paths/lines in structural comparison | Each owning setting/contract, if retained | Empty list is structural data, not absence | Add before migration; do not fabricate elements or omit them from parity. |
| All remaining BASE-only, manifest-only, env and literal candidates | Per-row evidence ledger | **Unresolved until actual owner/consumer is established** | Types recorded mechanically; valid units/zero semantics are not guessed | No migration clearance from a regex, AST hit, inherited HOLD, or report total. These are an explicit remaining completeness limit. |

## I. Corrected complete design

The smallest coherent correction keeps the existing runner, ConfigLoader, StateManager, PolicyBuilder, OrderExecutor, SessionRouter, broker adapters, lock and notification/logger components. It gives each responsibility one owner and removes the competing inputs. It does not insert a new guard component between bad producers and trading.

A settings update is an explicit operation: validate the proposed values and ownership, commit the accepted revision durably, publish that revision to the consumers that should observe it, and acknowledge what actually changed. Runtime reads cannot wander into BASE or stale process.env. An open trade continues with its entry-bound operative policy; an explicit one-trade edit has its own identified, persisted transition. Configuration identity, trade policy identity and broker execution identity are related receipts, not interchangeable hashes.

Paper/live behavior must be consistent at normal order, webhook, cutoff, cancellation, flattening and recovery producers. The data broker remains explicit and distinct from execution venue. Sizing produces a final executable quantity inside the ruled allocation after all adjustments. Fee policy follows actual execution identity and preserves the separate simulated slippage assumption.

Startup acquires actual components and records their outcomes. An unavailable producer is repaired and reported in place; the process and unaffected services survive. A component absence cannot be fabricated into trading readiness. Operator shutdown is a separate runner-owned lifecycle with awaited persistence and lock release. The singleton exclusively claims its one existing identity. Recovery clears only the condition it proves repaired, for the same scoped record, and never clears an unrelated operator or financial-integrity pause.

Switching cannot be declared complete until its intended watchlist and timeframes reach the actual downstream consumers with correct identities. Native candle acquisition/admission itself remains STOP 2. The watchdog is not retained or replaced as an answer to producer failures.

## J. Corrected execution order

This is an implementation plan for a later authorized execution task. This audit made no repository changes and did not operate the bot. A logical change can cross several files when its producer and consumers must change together; LAND-NOW's one/two-file and non-overlapping-line claims are not a valid dependency model.

Before the first implementation commit, capture the actual non-secret runtime/consumer baseline and finish unresolved ownership rows needed by the proposed edit. An unidentified value is not authorization to guess it. Preserve the exact private credential environment locally on the box without publishing it. Each logical commit must have a reversible source/state boundary and the appropriate real-process receipt before dependent activation; do not use the historical test counts as that receipt.

| Order / logical work package | Authority and complete-read boundary before editing | Dependency and exact implementation boundary | Proof before successor / restart / rollback |
|---|---|---|---|
| J0 — Reconcile controlling specification and finish affected-leaf baseline | Newest walk Part A, doctrine, supplied mission; complete current v4/LAND-NOW, all contradictory clauses and affected manifest rows | Publish one executable specification; withdraw boot refusal, stale activation wording, invalid sizing assignment and silent deferrals. No product code. Resolve original A27 words and only genuine remaining policy questions. | Every affected leaf has owner, all callers, unit, zero/null/empty semantics, baseline consumer value or a named unavailability. No restart. Rollback is documentary; do not resurrect superseded authority. |
| J1 — One credential producer and early failure reporting | A0, fails-loud doctrine, G01/G04/G18; fully read launcher, ConfigLoader, runner bootstrap, Telegram/Discord/Ntfy, TraceSpine and each credential-reading constructor touched | Credential loading and captures move together. Make actual early failures reportable before trading constructors; remove late-only notification assumptions. Do not add a supervisor or alter strategy policy. | Bare-node and actual launcher inputs reach the same intended services; absence names the service; real notification service/phone receipts separated. Restart required for import captures. Roll back producer and consumers together, keeping secrets private. |
| J2 — Exclusive singleton acquisition | A26b, G21; whole SingletonLock, AtomicWrite and runner acquisition/lifecycle callers | Repair acquisition in the existing lock without changing its identity; handle stale owner evidence explicitly. | Real OS competing non-trading process probe proves one owner, no second successful acquisition; stale/corrupt cases and filesystem receipts. Bot restart only under the later execution task's authority. Rollback cannot create a second lock domain. |
| J3 — One shutdown/failure lifecycle | Doctrine, A26b, boot-refusal rejection, G02; whole runner entry/start/main/shutdown and every registered signal/fatal/exit handler, including logger flush | Remove competing immediate process-exit ownership. Operator shutdown awaits existing services/state/lock cleanup. Producer failures report scoped unavailability and continue available work; do not fabricate readiness. | Actual signals on a real initialized process demonstrate ordered durable cleanup and truthful exit status; import/initialization failure is observed separately. Restart required. Roll back lifecycle and lock integration together. |
| J4 — Correct required-component acquisition and initialization | L1 honesty plus rejection of refusal; G01; whole ModuleAutoLoader and every required consumer constructor/import | Retain accurate enumeration; correct required missing/evaluation failure handling through its actual runner consumer. No fake RiskManager and no process-global cage. | Real initialization failure shows the process alive, the exact component unavailable, no entry produced from missing required state, and unaffected operational services functioning. Recovery obtains the real component. Restart required. Roll back constructor/loader contract together. |
| J5 — One execution mode across all order producers | Paper/default and eval-separation words; G06/G07; whole runner execution wiring, OrderExecutor, OrderRouter, WebhookOrderAdapter, TtpCutoffEnforcer, EvalRuleEngine and selected broker submission/cancel methods | Make normal orders, webhooks, cutoff/orphan recovery, cancellation and desync flattening consume the same execution identity. Remove loader live/eval weld and nested eval authority that survives an off selection. Do not introduce another flag. | In declared paper operation, capture every outbound mutation boundary and prove no live-venue mutation; actual paper result identity is explicit. Normal operation with eval off has no hidden eval cutoff/sizing owner. Restart required for captured contexts. Rollback all changed route/policy consumers atomically. |
| J6 — Complete entry-bound exit policy | R4/A23, G15; whole PolicyBuilder, FrozenExitPolicy, ExitContractManager, all called exit checkers/planners, FeeModel and StateManager open/restore paths | Bind current operative trail, contract, break-even, fee and other actual post-entry inputs; eliminate direct/global post-entry policy reads for an existing trade. Preserve legacy trade provenance; do not fabricate a missing old policy from today's settings. | Old trade A, new trade B and restored trade A consume their correct policies. Explicitly exercise indirect fee and fallback contract readers. Restart/state restoration proof required. Rollback source with compatible state reader; preserve original policy data. |
| J7 — Canonical settings/internals cut with all consumers | A0/A21; completed J0 leaf rows; whole ConfigLoader, feature manager, affected constructors, profile/sweep/backtest writers, runtime proof and PM2 file | One typed revision and one getter surface. Move source and readers together; remove BASE/JSON/env compatibility authority and obsolete validators only after replacement. Preserve meaningful empty/null/false/zero values. No hot UI activation yet. | Full consumer parity against private baseline, except individually ruled changes; nested hash changes; no live reader of removed source. Restart required. Rollback configuration, launcher and consumers together with exact prior accepted values. |
| J8 — Pattern initialization and bank-state migration within the cut | A0/A10/A23; G24; whole UnifiedPatternMemory, PatternMemoryBank and actual first-creation callers, transition handoff and persistence | This is an atomic sub-boundary of J7 if those env/path inputs are removed there; otherwise it must precede their removal. Pass explicit mode/asset/path/persistence before first singleton creation. | All relevant modes/assets select correct bank and do not load/write another mode's bank; restart and transition preserve it. Restart required. Rollback retains both old bank bytes and explicit identity mapping; never merge contaminated banks. |
| J9 — Accepted settings revisions and UI update path | A21/A23 and receipt direction; J6–J8; whole actual settings API/UI/relay, writer, ConfigLoader runtime update and receipts | One durable settings update owner, recursively correct hash, exact accepted revision acknowledgement and consumer adoption. Invalid proposed update remains a named failed update; no hash-mismatch boot cage. | An actual UI update changes the intended consumer, not only a file/snapshot; partial writes/restart restore an accepted revision; old trades remain bound. Initial deployment restart; subsequent ordinary hot changes do not require a restart unless explicitly structural. Rollback to prior accepted revision, not stale env overrides. |
| J10 — One-trade operator edit | A23's one-specific-trade words; G16; whole trade UI/relay/handler, StateManager trade mutation/save, policy binding and exit consumers | Implement identified trade-specific edit through existing state owner; expected prior policy, operative contract and persistence update together. Do not mutate unrelated trades/global settings. | Actual UI→bot→persisted trade→exit-consumer receipt, unchanged other trades, restart retention, stale/unknown trade request named accurately. Deploy restart; individual edits hot. Rollback preserves prior policy history and migration compatibility. |
| J11a — Fee identity and accounting policy | A22, G17; J6 policy provenance and J7 owner cut; whole FeeModel, execution-venue resolution, accounting/PnL/backtest and bound-policy consumers | Select fees by execution venue/account; preserve modeled slippage; preserve already-open trade policy provenance. No sizing formula change in this commit. | Actual selected venue/account and consumed fee policy on new/restored trades; fill-friction and commission separate. Deploy restart. Roll back fee settings/consumer contract together without rewriting old trades from current globals. |
| J11b — Final allocation and quantity | A5/A8/A15, G08/G09; resolved K2; whole entry-plan, rounding, scale-in, active/pending allocation and StateManager capital path | Implement ruled normal/earned boost/aggregate allocation in existing executor. Every share minimum/rounding and pending allocation participates in the same final quantity decision. | Receipts show account basis, boost evidence, existing/pending exposure and final units; cross-asset/concurrent cases. Deploy restart and restored-state proof. Roll back settings/formula/reservation contract together. Arithmetic checks do not prove fills or financial results. |
| J12 — Remove cooldown, migrate its state, preserve unrelated halts | Explicit “none/take it out”; G14; whole StateManager close/loss/halt/save/load paths, loader/env writers and every cooldown caller | Delete producer and persisted cooldown state intentionally; do not clear other halt codes. | Loss sequence and restart produce no cooldown; unrelated halt survives; warnings still behave as ruled. Restart required. Rollback requires an explicit state-compatible decision, never silently restoring a rejected feature. |
| J13a — Condition-specific halt recovery | Fourth Shape/A26c, G13; J12 cooldown migration; whole original halt producers, StateManager records/save/load, broker/order/exit reconciliation and every reset caller | Repair each original condition and clear only the exact current matching record. Preserve unrelated faults and operator/daily pauses. No generic recovery framework. | Fault identity→producer repair evidence→conditional durable clear→consumer result; a concurrently replaced fault survives. Restart/rehydration proof. Roll back producer/state schema together. |
| J13b — Schedule, transition and startup restoration | A1/A9/R2, G10–G12/G25; J1/J5/J6/J8/J13a and K4 where applicable; whole SessionRouter, transition store, acquisition/identity, pause/resume, REST and startup-restore callers | Consume actual settings schedule; correct full-watchlist/account identity and scoped pause/retry. Separate restoring known same-identity trades from flatten-before-switch. Producer acquisition remains responsible; no watchdog. | Transient startup failure recovers; restored management and source/target transition have their own receipts; unrelated pause persists; actual source flatness and target admitted data are observed. J18 required for acquisition acceptance. Restart proof. Roll back transition/state contract together. |
| J14 — Complete ruled warning/daily-entry-pause contract | A17's newest wording; whole actual loss/equity producers, RiskManager/StateManager consumers, notifications and reset lifecycle | The settings and existing producers must implement the authorized warning counts and the sole normal daily-loss entry pause, without flattening. A “numbers now, behavior later” claim cannot count as implemented. Broader risk mathematics remain the later-stop review dependency. | Actual loss/equity input receipt→warning or 50% entry-only pause→exits continue→operator restart semantics; no automatic transition resume clearing it. Deploy restart; preserve scoped persistent state. No new loss gate beyond the explicit ruling. |
| J15 — Publisher off and precise notification outcomes | A24 and fails-loud doctrine; G18; whole logger scheduling/write/exit paths, all trace producers newly claimed accepted and Ntfy transport | Disable the requested publisher at all actual writes, preserve trade proof and optional inputs, cancel pending publication where needed. Complete new event routing and report attempts/results distinctly. | Real paper trade still writes its proof; no publication after disable, including pending/shutdown; installed/queued/service/phone receipts separate. Deploy restart, hot-disable proof. Rollback publisher state deliberately, not by blanking account fields. |
| J16 — Dead policy cleanup and cosmetics | Circuit-breaker rejection/boot cosmetics; G23; whole class/feature block and all real imports/tooling references; lock lines if changed | Remove dead ErrorHandler policy/config and cosmetic logs only. Keep ownership fixes distinct. | Source/caller proof of removal; boot output; no claimed financial behavior change. Restart only to observe boot cosmetics. Straight source rollback, preserving lock identity. |
| J17 — Evidence-tooling repairs | Mission's supporting-change audit; G19/G20; whole relevant bridge loop, panel assessor, telemetry and ledger consumer | Preserve tool history on failure and describe claim/evidence status accurately. Avoid suppression by formatting and inflated panel agreement. This may be a separate tooling commit; it need not block unrelated product work that is proved directly. | Actual controlled provider failure receipts include prior tool reads; raw inputs and outputs support claimed metadata. No bot restart required. Reversible tooling/schema update. |
| J18 — Joined STOP 1/STOP 2 acquisition acceptance | A1/A3/native-candle doctrine; complete broker acquisition, normalization, admission, StateManager/candle consumer paths under STOP 2 | STOP 1 owns configured intent and identities; STOP 2 owns producer repair for broker-native candles and removal of watchdog authority/side effects. Do not toggle scheduled operation and call full activation proved before the producer path works. | Real broker-native data reaches intended consumers for every configured tuple, across silence/reconnect/replay and transition. No live trading required to establish acquisition. Any paper execution receipt must use the corrected mode boundaries. Close only the scopes actually evidenced. |

J11a/J11b and J13a/J13b are separate logical commits in their respective work families; references to J11 or J13 cover those explicitly split dependencies. J7/J8 are one deployable configuration-contract change where their inputs overlap, not two independently restartable partial states. J6 precedes hot mutation. J5 precedes any acceptance exercise that might otherwise reach a live endpoint. J1/J3/J4 precede accepting “missing component, process continues, max phone alert” as a working behavior. These dependencies are why LAND-NOW's line-disjoint ordering is insufficient.

PM2 requires a receipt of the actual non-secret child environment, process revision and entrypoint. Its documented `--update-env` and ecosystem behavior make “restart never updates environment” too broad, but neither command spelling proves deleted behavioral keys vanished or the intended process loaded the new configuration. [PM2 process management](https://pm2.keymetrics.io/docs/usage/process-management/), [PM2 environment behavior](https://pm2.io/docs/runtime/best-practices/environment-variables/). Follow the then-authorized restart procedure and inspect the resulting child; do not substitute a generic approval ritual or cached-env assumption.

## K. Rulings Trey still must make

These are policy ambiguities or missing original authority, not questions about whether to repair a demonstrated defect. No recommended answer is supplied.

1. **Mode persistence/selection exception:** does an original newer ruling authorize the specific `.env` mode flip and UI `.env` writer attributed as A27, and what happens on the next process start after an operator selected live? The supplied v4 contradicts itself. Current mode comes from PROFILE env/default and profile mode (`foundation/ConfigLoader.js:548–569`); several old env readers also exist. The original words would resolve this without inventing another mode owner.
2. **Exact sizing denominator and earned boost qualification:** your words establish account-relative normal sizing, a pattern-earned uplift example and later 7.5/25 values. They do not fully specify whether the account measure is current marked equity, another broker account measure, or how much pattern history qualifies the example of 80% wins. Current executor uses available capital and continuous confidence/confluence scaling (`core/StateManager.js:789–800`; `core/OrderExecutor.js:3107–3135`, `:2378–2396`). These are material behavioral choices; the plan must not quietly substitute them for your intended values.
3. **Daily-loss measurement details, only if no newer original ruling exists:** what account/session boundary and realized/unrealized measure define “50% lost in a day,” including a broker/session change and operator restart? Your newest words settle entry-only pause and no forced sale (`ogz-meta/inbox/fable/2026-09-09/OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM.md:116–122`). Current TTP policy has its own start-of-day equity/date semantics (`core/EvalRuleEngine.js:390–398`, `:428–482`); those do not establish the normal-product daily-loss definition. Do not copy them as an unstated ruling.

4. **Paper-on-boot with earlier live positions:** if a restart selects paper but the broker still holds positions from an earlier live session, what management authority should that process have over those identified live positions? Paper simulation and permission to mutate a live account are different facts. Current initial activation rejects normalized target positions/orders (`core/SessionRouter.js:1333–1358`, `:1758–1760`), while cutoff recovery can independently send broker orders (G07), and restore has its own verification/quarantine treatment (`core/StateManager.js:2354–2437`, `:4470–4501`). The available words do not resolve that cross-mode conflict; the old handoff's “quarantine/neither manage nor flatten” testimony is not adopted as policy. No recommended answer is supplied.

No ruling is needed to discover a caller, preserve an already intended zero, repair exclusive acquisition, remove an unauthorized cooldown/watchdog, or keep paper mode from submitting live orders. An unresolved manifest reader is engineering work, not automatically a question for you.

## L. Live acceptance plan

No receipt below was obtained in this audit. These are the actual outcomes I would require during the later authorized execution task. A real process remaining alive for 120 seconds proves only survival for 120 seconds.

| Receipt | What must be captured | What it does not establish by itself |
|---|---|---|
| Revision/launch identity | Exact checked-out SHA, executable/entrypoint, working directory, PID/start time, PM2 app identity, intended account/broker/mode and non-secret effective child environment | File existence or a Git push is not loaded runtime revision. |
| Consumer baseline and migration parity | For every affected leaf, historical source, effective pre-change value at each actual consumer, accepted new revision/value/source, type/unit and named authorized delta; include captured constructors, specialized getters, dynamic strategy/profile aliases and tooling inputs | Snapshot equality or one matching hash does not prove consumer parity. |
| Settings update | Actual UI request→identified accepted revision→durable file/state→consumer adoption→acknowledgement; old/new hashes cover nested data; rejected malformed update is named | A written file, emitted event or UI toast is not applied settings. |
| Open-trade freeze | Trade A opened at revision A; global update B; old A's exit consumer still reads A; new trade uses B; restart restores each; direct and indirect fee/trail paths included | Object.freeze or a policy hash does not prove the exit coordinator used that policy. |
| One-trade edit | Operator identifies one exact trade/account/mode; the existing state owner applies and persists the edit; the next relevant exit evaluation uses it; other trades/global settings remain correct | WebSocket send or a changed frozen object is not an operative/durable edit. |
| Mode boundaries | Corrected paper process with real market input; every order/cancel/recovery producer's attempted destination recorded; actual paper order/fill/state receipts; explicit evidence of no live endpoint mutation in the exercised paths | Paper log text, dry-run toggle or a mocked HTTP test is not proof of all submission paths. Alpaca paper fills are simulations, not live exchange fills. |
| Broker-native acquisition and switching | Configured tuple set: data broker, account/session generation, symbol, timeframe; requests, broker responses/events, normalized/admitted candle identity and consumer receipt; full watchlists; 30/15/5 transitions; source orders/positions truly resolved before target activation | Connected socket, registered symbol, subscription request/cache, HTTP 200 or SESSION_TARGET_ACTIVATED trace does not prove admitted data or completed flattening. |
| Silence/recovery | Deliberately observed acquisition silence under controlled authorized conditions; producer retry/reconnect/re-request; actual resumed native candles admitted; scoped state corrected; healthy services and exits demonstrably continue | Timer firing or REST success does not prove the original failure ended. No watchdog with trading authority is an acceptable substitute. |
| Fault identity and persistence | Original fault record and scoped identity; producer repair evidence; conditional state commit; subsequent consumer behavior; restart restoration; concurrent replacement fault remains | Deleting a halt or setting isTrading=true is not recovery. |
| Singleton/operator shutdown | Real non-trading contention probe; only one exclusive owner; actual initialized process SIGTERM/SIGINT; awaited state/notification/service cleanup as applicable; lock release; process/PM2 status | Jest source matching, mocked lock or expected exitCode does not prove real shutdown. |
| Publisher and notifications | Publisher disabled before all actual writes, including pending/shutdown; proof record still written; notification event→send attempt→service acceptance separately; watched target phone receipt for required buzz | “Installed,” “queued,” or HTTP success is not phone delivery; a missing channel cannot prove its own remote delivery. |
| Sizing/accounting | Original signal and boost evidence, account measure, existing/pending exposure, every multiplier, final rounded quantity and units, allocation after order, venue/account fee identity, actual accounting commit | An arithmetic fixture, quantity plan or accepted order is not a fill, realized PnL or financial outcome. |
| Backtest parity | Same configuration/decision/exit/accounting owners with explicitly identified historical input; identical causal input gives the corresponding decision; separate mode/asset state/pattern data | Green replay does not prove live subscription, correction handling, scheduling, PM2 state or phone delivery. |
| Rollback | A compatible prior accepted configuration/state schema restored to the correct runtime; no resurrected mode env authority, rejected cooldown, wrong bank, second lock domain or lost trade-policy history | Reverting code alone is not restoring state or environment. |

The externally documented order boundaries match the source: Alpaca distinguishes paper keys and `paper-api.alpaca.markets` from live, while the adapter chooses URL independently (`brokers/AlpacaAdapter.js:47–61`). Kraken's AddOrder uses `pair`, `type`, `ordertype`, `volume`, and optional `validate`; the repository maps the first four and does not set `validate` (`kraken_adapter_simple.js:761–773`). Kraken documents validate=true as validation without matching-engine trading; the default is false. [Alpaca paper trading](https://docs.alpaca.markets/us/docs/paper-trading), [Kraken AddOrder](https://docs.kraken.com/api-reference/trading/add-order). This proves what request the source constructs, not that Kraken received or filled it.

## M. Refusal-to-close conditions

I would refuse to close STOP 1 while any of the following remains:

- Conflicting controlling instructions about mode, boot refusal, ownership, restart or deferral; unverified A27 attribution used as authority.
- An affected configuration leaf, empty container, alias, constructor default, tooling writer or dynamic reader lacking a resolved owner and consumer-effective parity/authorized-delta receipt.
- BASE_CONFIG, feature JSON, process.env, presets or constructor policy remaining an independent behavioral authority after the claimed cut.
- A settings fingerprint that omits operative nested values, a revision acknowledgement without durable consumer adoption, or a hot edit that silently changes an existing trade.
- A one-trade command that is unhandled, insufficiently identified, rejected by the actual mutation contract, non-operative or non-durable.
- Paper mode reaching any exercised live submission/cancel/recovery boundary, or mode/data-broker/execution-venue/account identity conflated in state or receipts.
- Sizing implemented by the withdrawn .05/.075/.25 assignment, cap violation after quantity adjustment, or no correctly scoped aggregate/pending allocation calculation.
- Fee policy selected by market-data broker or later globals rather than the intended execution/trade identity; modeled slippage silently removed.
- Required-component continuation that only catches a loader error and fails later, or permits entries from missing/fabricated state.
- Multiple immediate-exit/signal owners, nonexclusive singleton acquisition, or an unproved real shutdown/restore lifecycle.
- Cooldown resurrected by a reader or persisted state; a recovery deleting another condition's halt; transitions clearing an operator/daily-loss pause.
- A failed acquisition/transition left permanently global without producer repair, or a watchdog/downstream cage retained as the answer.
- Configured switching/watchlist/schedule claims exceeding actual native-candle admission and consumer evidence; source flattening reported from a local-map deletion or request alone.
- Notification claims exceeding service/phone receipts; publisher writes still reachable after disable; error reporting installed too late to report the failure accepted as proved.
- Any missing runtime revision, private consumer baseline, mode/account, persistence or rollback receipt required by the changed path.
- Green tests, a populated catalog, a panel verdict, a code comment or an emitted trace offered as a substitute for those outcomes.

## Boundary findings outside STOP 1

These are dependencies, not silent authorization to implement the rest of the walk. Moving their configuration without preserving current consumers remains STOP 1 work.

| Later station | Its remaining product boundary | STOP 1 dependency that must be satisfied now |
|---|---|---|
| STOP 2 | Complete broker-native acquisition, normalization, candle admission/correction/replay and producer silence recovery; full removal of rejected watchdog authority and downstream effects | Explicit configured broker/account/mode/session/symbol/timeframe intent; correct transition and subscription identity. G10–G12 establish the STOP 1 defects, not complete STOP 2 coverage. J18 requires actual admitted-input receipts before full switching activation is called complete. |
| STOP 3 | Full strategy pipelines, confidence/confluence explanations, actual short paths and the internal SmartMoneySweep loss-gate review | Resolve strategy-setting owners and preserve consumer semantics. Changing the profile's directionFilter alone does not prove all short paths. One-trade-per-asset also requires its actual decision/execution/state proof; `_entryConcurrencyBlock` counts same-strategy, same-direction trades (`core/OrderExecutor.js:1640–1646`, `:1686–1697`), so this method alone does not establish that broader requirement. I have not proved an actual duplicate same-symbol position from the full production chain. |
| STOP 4 | Broader PID/DPS signal integration and sizing/quality review | Implement the already-ruled normal/earned-boost/aggregate allocation boundary and final quantity correctness now; do not defer a demonstrated cap defect. The existing scale-in risk cap is a different calculation (`core/OrderExecutor.js:1742–1786`). StateManager does calculate exposure (`core/StateManager.js:803–889`), including close-state accounting at `:1653–1656`; existence of those calculations does not make them a 25% aggregate entry-cap consumer. |
| STOP 6 | Full strategy-local exit architecture and layer consolidation | Complete entry-bound policy and one-trade edits now. A later exit redesign is not a reason for hot settings to change an existing trade through the demonstrated global readers. |
| STOP 7 | Complete ledger/dashboard/trace presentation product | Every STOP 1 acceptance claim needs truthful trace, persistence and notification outcomes now. Publisher-off is already ruled; its wider future product is separate. |
| STOP 8 | Broader operational risk and session review | Switching, the ruled warning/daily-entry-pause contract and exact pause recovery cannot be left as unused settings. Broader risk mathematics remain outside this design audit; K3 identifies the unresolved daily-loss measure. |
| STOP 9 | Pattern learning and statistics correctness | Explicit bank identity, initial configuration and persistence migration now. Earned boost cannot rely on unproved pattern statistics; the pattern-quality receipt is a dependency, not a fabricated qualification. |
| STOP 10 | TrAI product overhaul | Shared-client changes in this commit range require their own regression boundary and truthful receipts. This audit does not claim TrAI is operational or redesign its product. |
| STOP 11–12 | Remaining final-walk integration and acceptance | No claim of their completion from this STOP 1 source audit. The station numbers are scope references to the walk, not a claim that their code was fully reviewed. |

The task is an independent audit. Supporting bridge defects can be corrected separately and need not become another architecture that governs product work. A direct source-and-runtime proof does not need a panel verdict to become true.

## WHAT I SEARCHED

I used the GitHub connection to inspect the repository and designated branch, then fetched and examined the frozen source locally. I verified the full HEAD and baseline, enumerated every intervening commit, each parent diff and the union of changed paths. The final checkout remained detached at the specified SHA with no tracked or untracked changes.

Repository discovery began with tracked-file and `rg` censuses, then AST/token extraction and caller follow-up. Search families included STOP1/STOP 1, v1/v2/v3/v4, reconciliation, attack, manifest, LAND-NOW, receipts, OPEN/PENDING/OBLIGATION, required-module validation, all process-exit/signal owners, dotenv/process.env/aliased env helper reads, JSON imports, BASE_CONFIG, get/getSection/getAll/getExitContract/getTimeframeConfig, overrides/source tracking/hash/reload/writers, hot updates, mode/profile/webhook/paper/live, order/cancel/orphan/flatten producers, account/venue/broker identity, sizing multipliers/caps/exposure/share rounding, frozen exits/fee readers, pause/resume/halt/reset/cooldown/load/save, schedule/session transition/retry/failed state, pattern singleton initialization, Ntfy filtering/queue/transport, publisher scheduling/write/shutdown, and bridge loop/provider/candidate/authority/ledger metadata.

I searched all reachable Git history for the supplied v4/LAND-NOW filenames and original A27 authority leads, including the July 10 context-parameter source. The two current supplied files were absent from the inspected Git history and were obtained as supplied attachments. Absence from that history does not establish they never existed elsewhere. I inspected authoritative Node, PM2, Alpaca and Kraken documentation for the particular external semantics cited above; I did not call a broker or provider.

Mechanical helpers enumerated paths, extracted exact historical text, indexed diffs and joined source candidates. They were not asked for a verdict or independent engineering conclusions. Historical review/acceptance material was treated as an object of this requested lineage audit, never as authority to adopt a conclusion. A file-search result also exposed snippets from two unrequested prior reports; I did not open those reports or use their conclusions. This is a narrower, accurate statement than claiming no prior-answer snippet ever appeared.

## WHAT I READ COMPLETELY

The seven required repository authority files were completely read before evaluating STOP 1 plans:

- `AGENTS.md` — completely.
- `ogz-meta/AGENTS.md` — completely.
- `ogz-meta/Alignment/README.md` — completely.
- `ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md` — completely.
- **`ogz-meta/Alignment/TREY-DOCTRINE-FABLE-LANE.md` — completely.**
- **`ogz-meta/Alignment/TREY-RULINGS.md` — completely.**
- `ogz-meta/inbox/fable/2026-09-09/OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM.md` — completely; Part A ranked above editorial notes.

Current supplied materials, each separately:

- `Pasted text(20260912-105510).txt` — complete STOP 1 mission.
- `STOP1-BOUNDARY-MISSION-v4-2026-09-10.md` — completely, 180 displayed lines; supplied file, not a repository HEAD file.
- `LAND-NOW-2026-09-10.md` — completely, 29 displayed lines; supplied file, not a repository HEAD file.

Other whole-file reads, sometimes accumulated over contiguous ranges:

- `ogz-meta/inbox/fable/2026-07-16/session-doctrine/TREY-CONTEXT-PARAMS-SPEC-2026-07-10.md`.
- `ogz-meta/inbox/fable/2026-09-07/STOP1-CONFIG-SORT-2026-09-05-FABLE.md` and `STOP1-BOUNDARY-MISSION-2026-09-06.md` in that directory.
- `ogz-meta/inbox/fable/2026-09-08/STOP1-BOUNDARY-MISSION-2026-09-06.md`.
- In `ogz-meta/inbox/fable/2026-09-09/`: `STOP1-BOUNDARY-MISSION-v3-2026-09-09.md`, `STOP1-RECONCILIATION-B01-B21-2026-09-08.md`, `STOP1-RECONCILIATION-ATTACK-v2-2026-09-09.md`, and `STOP1-TRACEABILITY-MATRIX-2026-09-08.md`. These are historical instructions/claims for reconciliation; their other-model conclusions were not substituted for source investigation.
- `core/ModuleAutoLoader.js`, `core/ModuleInitializer.js`, `core/SessionRouter.js`, `core/RuntimeConfigProof.js`, `core/dto/FrozenExitPolicy.js`, `core/FeeModel.js`, `core/SingletonLock.js`, `core/AtomicWrite.js`, `core/WebhookOrderAdapter.js`, `core/PositionSizer.js`, `core/ErrorHandler.js`, `core/NtfyTraceNotifier.js`, and `core/trai_llm_config.js`.
- `core/exit/StopLossChecker.js`, `core/exit/BreakEvenManager.js`, `core/exit/MaxHoldChecker.js`, and `core/exit/TrailingStopChecker.js`.
- `brokers/KrakenIBrokerAdapter.js` and `brokers/BrokerFactory.js`.
- `public/js/operator/trade-manager.js`.
- `trai_brain/mercury-bridge/direct-question.js`, `trai_brain/mercury-bridge/cost-accounting.js`, `tools/backfill-mercury-costs.js`, and the short `trai_brain/persistent_llm_client.js` re-export.
- `test/module-auto-loader-required.test.js`, `test/startup-exit-code.test.js`, and the L1/L6 `EVIDENCE.md` packet files under `ogz-meta/inbox/codex/2026-09-10/`. The tests were read, not run. Those packets themselves distinguish their bounded checks from missing full boot/signal receipts.

The L1 and L6 complete code diffs were read, as were the materially cited supporting-change diffs and current consumers in E/G. A mechanically extracted full-diff archive is not represented as a parent whole-file read of every changed file.

Earlier supplied STOP 2 files are named separately for continuity: `OGZ-HANDOFF-2026-09-02-FABLE-WALK(1).md` and `OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM(3).md`. They were earlier-task attachments; this STOP 1 audit does not count them as new whole-file reads or use them to establish implementation at 6ca25ae8. The current repository walk listed above was the complete required authority read.

## WHAT I READ PARTIALLY

Targeted source reads included `foundation/ConfigLoader.js`, `config/trading.config.json`, `config/features.json`, `ecosystem.config.js`, `run-empire-v2.js`, `core/StateManager.js`, `core/OrderExecutor.js`, `core/OrderRouter.js`, `core/TradingLoop.js`, `core/RiskManager.js`, `core/PolicyBuilder.js`, `core/ExitContractManager.js`, `core/EvalRuleEngine.js`, `core/TtpCutoffEnforcer.js`, `core/FeatureFlagManager.js`, `core/BotStateFrame.js`, `core/WebSocketManager.js`, `core/UnifiedPatternMemory.js`, `core/PatternMemoryBank.js`, `core/EnhancedPatternRecognition.js`, `core/TRAIDecisionModule.js`, `core/StrategyOrchestrator.js`, `core/trai_core.js`, `core/persistent_llm_client.js`, `brokers/AlpacaAdapter.js`, `brokers/BrokerRegistry.js`, `brokers/IBrokerAdapter.js`, `foundation/IBrokerAdapter.js`, `kraken_adapter_simple.js`, `modules/BreakAndRetest.js`, `modules/FairValueGapDetector.js`, `utils/telegramNotifier.js`, `utils/discordNotifier.js`, `ogz-meta/claudito-logger.js`, `ogz-meta/slash-router.js`, `ogzprime-ssl-server.js`, and `instrument.js`. The full JSON files were mechanically parsed for the structural census; that is not a claim I manually read every leaf and consumer.

Other supporting bridge files—`ask.js`, `react-loop.js`, `reviewer-panel.js`, `doctrine-review.js`, `run-ledger.js`, `config.js`, `adversarial-review.js`, `llm-client.js`, `provider-preflight.js`, `deploy-layer4.sh`, and root `mercury.config.json`—were examined through relevant source ranges, parent diffs and downstream follow-up. Remaining changed test/fixture files were inventoried and inspected by affected assertions/diffs as needed; they were not all completely read or executed.

Historical packet MANIFEST/WORK/MISSION/INHERITED/REVIEW/receipt rows were mechanically cataloged with targeted reads. The report does not claim whole-file reading of every historical review or every one of the 127 broad filename candidates. `STOP1-HISTORY-CLASSIFICATION.csv` classifies 53 distinct source blobs, and the alias table preserves duplicates without counting them as independent evidence. Unrelated older response bodies were not opened to obtain another model's answer.

## WHAT I TRACED

- Startup imports → loader → required-module export → runner constructor → lock acquisition → start → signal/fatal handlers → asynchronous cleanup and process exit.
- Launcher/dotenv/profile/override/BASE producers → all identified public loader surfaces → representative captured and live consumers → revision/hash/receipt and absent settings-write boundaries.
- Normal entry and exit routing → webhook/local simulation/router → broker adapters, plus cutoff orphan management, cancellation and exit-desync recovery.
- Available capital → confidence scaling → confluence → absolute dollars → stock-share adjustment → final plan; contrast with same-strategy scale-in risk and state exposure accounting.
- Entry policy binding → direct exit reads → indirect break-even/max-hold fee readers → state mutation and restart implications.
- Trade UI command → inspected relay/handler boundary → StateManager's actual immutable-policy and persistence contract; unproved relay completion explicitly retained.
- Session startup/static/scheduled paths → wind-down → persisted transition → REST reconciliation → account scope → pattern handoff → register/subscribe → pause/resume/failed state.
- Loss close → cooldown/halt producer → normalization/save/load/reset; condition-specific TTP recovery versus blind shared reset.
- Pattern singleton first creation → mode/asset/path/persist resolution → bank load/save and transition handoff.
- Trace producer → keyword filter → queue → HTTP outcome; publisher proof append → debounce → write → pending shutdown flush.
- Supporting bridge prompt/candidate loop → tool receipts → doctrine/panel assessment → recheck/ledger; direct provider failure and shared TrAI client branches.

## WHAT I PROVED

The evidence supports the source-derived behavior and constructed consequences in G01–G25, with the scope stated in each finding. In particular, it proves the conflicting owners/call order and incomplete paths; it does not prove that each constructed event happened on Trey's bot.

The independent mechanical inventories prove their stated bounded Git, JSON, AST/token, mapping and historical-ID counts. All 18 commits and 18 unique changed code paths were accounted for. The meaningful product migration is still absent from this commit interval; two small product changes do not supply its missing runtime lifecycle. Git status establishes the audit left this checkout unchanged.

No runtime acceptance result was proved. No test count is presented as evidence of bot correctness.

## WHAT I DISPROVED

These apparent concerns were investigated and narrowed or rejected; none of these counter-findings supplies unrelated runtime proof.

| Apparent concern | Source evidence and precise counter-finding |
|---|---|
| SessionRouter has no scheduled implementation | Scheduled/calendar/wind-down logic exists (`core/SessionRouter.js:340–475`); the actual defect is the unused configured schedule and incomplete identity/recovery/acquisition contract. |
| There is no halt-reset or expiry path | `core/StateManager.js:4053–4088`, `:4162–4182`; `core/TtpCutoffEnforcer.js:877–884`. Such paths exist; their exact conditions/scope still matter. |
| First-symbol pause metadata means other symbols keep entering | StateManager writes a global pause (`core/StateManager.js:2554–2590`), consumed at `core/OrderExecutor.js:2907`. Metadata is not scoped enforcement. |
| Every feature leaf missing by exact manifest path is absent data | The 110 mismatches are prefix-normalizable in the mechanical path comparison. That disproves the data-omission count, not runtime alias correctness. |
| L1 did nothing, or still requires the phantom name | The actual changed required list and validation call exist (`core/ModuleAutoLoader.js:257–276`). The remaining problem is authority and complete initialization. |
| L6 changes every operator shutdown to exit 1 | Its default parameter remains zero (`run-empire-v2.js:3516`); only the start catch explicitly requests 1 (`:1924`). Signal preemption is a different defect. |
| Loading ErrorHandler proves an active breaker instance | Class export/constructor (`core/ErrorHandler.js:45–66`, `:159`) and autoloader directory scanning are not instantiation. No live instance was established in the investigated runner chain. |
| Missing EMA snapshot value proves no EMA runtime consumer | BASE/getter fallback can still supply it (`foundation/ConfigLoader.js:1030`, `:2995–3015`, `:3928–3941`); StrategyOrchestrator reads it (`core/StrategyOrchestrator.js:466`, `:865`). |
| Unknown timeframe automatically falls back to 15m | The specialized getter rejects an unknown timeframe (`foundation/ConfigLoader.js:3980–4012`); this is not the claimed fallback. |
| Zero available capital is currently upgraded to $10,000 | The executor names and stops that entry when available capital is nonpositive (`core/OrderExecutor.js:3044–3055`); the cited old fallback is removed on this path. |
| No exposure calculation exists anywhere | StateManager has exposure accounting (`core/StateManager.js:803–889`, `:1653–1656`); the named per-order cap still is not the ruled aggregate-entry consumer. |
| TrailingStopChecker is the active coordinator trail path | Inspected live dispatch instead uses the coordinator/channel/profit/planner routes (`core/ExitContractManager.js:398–415`); that legacy class's mere presence is not live trail proof. |
| TrAI has an independent direct trading-JSON loader here | `core/trai_llm_config.js:3–15` uses the shared loader's cached snapshot/BASE projection; dynamic credential env selection remains at `:56–70`. This narrows the duplicate-owner claim. |
| The bridge client ceiling change means TrAI now times out at 600 seconds | The shared client allows that ceiling, but TrAI's config caps its timeout at 300 seconds (`core/trai_llm_config.js:82`). No provider timing receipt was obtained. |
| All bridge changes are outside bot runtime | The shared persistent client is used by TrAI (`core/trai_core.js:130`, `:491`); separate metadata and ordinary response paths must be audited. |
| Publisher tries a publication on every trade without debounce | Trade recording can schedule a debounced write (`ogz-meta/claudito-logger.js:617–629`, `:717–729`); actual publication and delivery remain different stages. |
| Successful gate/panel status proves exhaustive evidence | Current assessment conditions can pass weaker claim combinations or enforce formatting (`trai_brain/mercury-bridge/reviewer-panel.js:165–179`; `trai_brain/mercury-bridge/react-loop.js:983–1029`). They do not prove semantic totality. |

## WHAT I INFERRED

I infer that executing the current plan literally could produce failed initialization, wrong-mode submission, mislabeled transition/bank identity, settings drift, false recovery, cap violations or misleading acceptance. The exact source/event/mechanical consequence is separated in G. None is an assertion of an observed order, loss, contaminated bank, missed phone alert or double-running bot.

I infer that the smallest coherent path is coordinated source/consumer/lifecycle repair, not a wholesale revert and not another supervisory component. That is engineering judgment constrained by the direct words, with implementation and rollback boundaries in J.

## WHAT I COULD NOT ESTABLISH

- The private running process's revision, actual PM2 child environment, secrets, effective profile/account, constructed services, active trades, persistent bank data or broker receipts. Git HEAD is not runtime HEAD.
- An original A27 quotation establishing the particular `.env` mode writer/persistence exception. Only the conflicting attribution was found in the supplied plan.
- Complete semantic leaf ownership and every live dynamic consumer across the full candidate inventory. Types, units, valid zero/false/null/empty semantics and consumer-effective values remain unresolved for many entries. Section H's bounded traced classes do not replace that work.
- A complete semantic disposition of every one of the 481 additional explicit lexical row IDs and 415 unlabeled requirement-language passages. They are preserved in the source catalog, not quietly omitted or declared safe. The 158-row item ledger covers the 109 principal identifiers plus named split/OPEN/obligation/dependency rows; this is not an honest denominator for every possible actionable sentence in historical prose.
- Whole-file manual reads or fully traced production blast radius for every one of the 18 changed code files and all historical review assertions. The changed-path/hunk census is complete, while semantic depth is reported separately.
- Completed live candle flow, subscription admission, paper fills, broker flattening, safe cancellation, recovered original fault, full UI relay/consumer mutation, PM2 restart, exclusive target-filesystem acquisition, phone delivery, rollback or financial outcomes.
- Full STOP 2 watchdog/acquisition totality, full short-strategy and one-trade-per-asset behavior, pattern-statistics quality, TrAI functionality, or completion of any later walk station. These were not silently promoted from scope dependencies into proved implementations.

Those limitations mean this is a substantiated adverse architecture audit and execution plan, **not completed exhaustive migration clearance**. The supplied mission's full consumer/leaf and every-actionable-item requirements remain incompletely discharged. I would not close them using the attached counts or an approval label.

## COVERAGE — N OF M

The denominators below are bounded by the stated source/method. “Enumerated” does not mean “live,” “read completely,” “correct,” or “safe to delete.”

| Census | Coverage | What the count means |
|---|---|---|
| Mandatory authority reads | **7 of 7, completely** | Read before plan evaluation; includes doctrine and rulings separately. |
| Current supplied STOP 1 documents | **2 of 2, completely** | v4 and LAND-NOW; mission attachment also completely read. |
| Baseline→HEAD commits | **18 of 18 enumerated and dispositioned** | Parent-by-parent history, later supersession and current source evidence in E. |
| Changed path union | **81 of 81 enumerated** | 51 docs/data, 18 code, 12 tests/fixtures. |
| Code/test change entries and hunks | **86 of 86 entries; 311 of 311 hunks indexed** | 53 code + 33 test entries; textual diff coverage, not manual semantic proof of all changed lines. |
| Changed code path universe | **18 of 18 accounted for** | Three bot/shared-runtime files plus supporting tooling; source-read depth disclosed above. |
| Tracked repository blobs/paths | **2,433 of 2,433 enumerated** | Frozen tree, not whole-file review. |
| Broad STOP 1/history filename candidates | **127 of 127 listed** | Lexical/path selection includes unrelated and duplicate historical material; unrelated response bodies excluded. |
| Scoped historical source records | **53 of 53 cataloged and classified** | 51 distinct Git blobs (44 current, 7 historical) plus 2 supplied documents; not all whole-file parent reads. |
| Source aliases | **101 of 101 retained** | 48 unique alias paths; repeats are not independent evidence. |
| Broader nested duplicates | **4 of 4 identified nested groups** | 28 total duplicate-blob groups in the broader inventory. |
| Supplied-name history search | **2,202 commits / 2,173 unique trees / 40 refs searched** | Neither current supplied filename was found in that bounded reachable history; external/unreachable history unknown. |
| Principal item identifiers | **109 of 109 represented; 99 of 99 requested-family identifiers found literally** | 158 parent-disposition rows after named splits and additional obligations. No row is LANDED AND PROVEN on a runtime claim. |
| Requirement-language source catalog | **2,298 of 2,298 occurrences retained** | 481 other explicit IDs and 415 unlabeled passages remain semantic candidates; lexical repetition is not an action count. |
| JSON nodes | **2,283 of 2,283 indexed** | Trading: 2,138 nodes; features: 145. No duplicate JSON object keys found by the mechanical parser. |
| JSON primitive/empty leaves | **1,861 of 1,861 indexed** | Trading 1,748 (1,727 primitive plus 21 empty); features 113. Nonempty containers are also retained in node inventory. |
| Current trading manifest matches | **1,737 of 1,748** | Exactly 11 absent empty arrays; no extra trading paths. |
| Current feature manifest values | **113 of 113 prefix-normalizable** | 3 exact matches + 110 missing `features/` prefix; semantic runtime alias acceptance unproved. |
| Historical manifest rows | **2,358 of 2,358 retained** | Includes 341 HOLD assertions, which were not adopted as final ownership decisions. |
| BASE nodes and leaf facts | **963 of 963 nodes; 817 of 817 leaf/empty facts** | 810 primitive/expression/null plus 7 empty; 718 exact JSON-path candidates and 99 BASE-only rows. Effective expression values remain unexecuted. |
| Explicit mapping tables | **259 of 259 entries indexed** | 148 runtime + 69 launch-profile + 42 profile-env mappings. |
| Snapshot track calls | **198 of 198 indexed** | Source-tracking syntax, not proof of every correct envelope/value/consumer. |
| Broad initial config references | **3,451 candidates across 821 selected JS/JSX/JSON files** | 1,046 production-path, 1,684 test, 403 documentation, 318 tooling candidates. Path labels do not establish runtime reachability. |
| Narrow direct production-path env accesses | **206 of 206 syntax occurrences** | 196 literal occurrences/125 names + 10 computed accesses; includes 200 read-syntax, 5 writes and 1 delete. Not 206 runtime readers. |
| Broader env-name candidate union | **575 names across all path classes; 492 production-path names** | Production union = 125 direct + 9 additional alias + 357 helper-spelling + 1 map-only name. No historical manifest assertion adds a name to this current-source union. |
| Broader dynamic env sites | **307 sites across all classes; 71 production-path candidates** | Production 71 = 10 computed direct + 6 aliases + 39 whole process.env objects + 2 token fallback + 14 helper cases. Not 71 dynamically named readers. |
| Production JS fallback scan | **348 of 348 selected files processed; 347 AST-parsed, 1 token-fallback** | 4,762 literal-RHS `||`/`??` syntax candidates; 3,986 scalar and 776 container. Of scalar lexical-config candidates, 425 use `||`, 57 `??`; 289 occur nearest a constructor. Scope is syntax, not all live defaults. |
| Joined configuration evidence ledger | **3,277 of 3,277 rows retained** | 1,861 JSON + 99 BASE-only + 575 env names + 307 dynamic env sites + 435 manifest-only candidates. Historical labels and unresolved fields remain explicit. |
| Unresolved/dynamic evidence | **5,994 records retained** | Different overlapping syntax/dataflow uncertainties; not 5,994 proven defects or unique live readers. |
| Live acceptance receipts obtained | **0** | No bot/repository-test/PM2/provider/broker/notification operations were performed. Required outcome families are listed in L; runtime event cardinality is not knowable from this audit. |

No honest denominator is established for **all semantically affected live consumers, all independently actionable historical prose requirements, all possible dynamic dispatches, or all runtime failure sequences**. The mechanical ledgers narrow that remaining investigation and make it reviewable; they do not discharge it.

Evidence files: `STOP1-ITEM-LEDGER.csv`, `STOP1-CONFIG-EVIDENCE.csv`, and `STOP1-EVIDENCE-6ca25ae8.zip`. The archive includes the source-census methods, historical classification/aliases, parent-diff hunk index, unresolved-reference table and exact source coordinates. It contains generated audit records, not a replacement repository checkout or a live receipt.
