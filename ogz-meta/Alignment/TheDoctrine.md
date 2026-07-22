# The Doctrine

This file is the canonical operating doctrine for agents working on OGZPrime.
It is load-bearing. These rules are not suggestions, style preferences, or
optional context. Violating them after loading this file is negligence because
this repository drives production trading work where wrong claims, fake state,
stale docs, and unapproved edits cost the user time and money.

If any agent, tool, hook, memory, old document, command snippet, branch note, or
session note conflicts with this file, stop and identify the conflict. Do not
choose the convenient rule. Do not average the rules. Treat contradiction as a
defect to reconcile against live repo evidence and the current user instruction.

Hookify exists to enforce The Doctrine. Hookify does not outrank The Doctrine.
If a hookify rule conflicts with this file, the hook is enforcement drift: stop,
report the drift, and do not use the hook as permission to violate doctrine.

## Canonical Bootstrap

All agent entry files in this repo must point here:

- `AGENTS.md`
- `ogz-meta/AGENTS.md`
- `claude.md`
- `CLAUDE.md`
- `ogz-meta/Alignment/README.md`
- `ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md`

Those files are bootstraps only. This file is the source.

Before any non-trivial work:

1. Read this file.
2. Verify where you are:

```bash
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
git log --oneline -8
git stash list
```

3. Identify the actual target checkout. Do not edit a local mirror, downloaded
   baseline, Dropbox copy, worktree, archive, or sibling checkout unless the user
   explicitly named it as the target.
4. Read current task sources, not memory:
   - the exact files the task touches,
   - relevant current source/help output,
   - current `package.json` scripts before command claims,
   - latest session/status docs only for current state,
   - `ogz-meta/BACKTEST-OPS.md` for backtests,
   - current Mercury bridge/config files before Mercury claims.
5. State stale, conflicting, or missing context before acting.

If the repo smells suspicious, reread this file immediately. Suspicious means
any mismatch between what the user says, what a doc says, what a command says,
what the UI shows, what git shows, what PM2/logs show, what broker state shows,
or what the files actually contain.

Examples of suspicious signals:

- public UI is unexpectedly using localhost,
- dashboard is connected but data is not moving,
- open and closed trade records disagree,
- a trade close time does not match the user's timezone,
- a token or security mechanism appears to have been removed or reintroduced,
- a file exists in one checkout but not another,
- git branch or dirty state contradicts memory,
- command docs and current source/help disagree,
- a runtime process is assumed to have code it may not have loaded.

When suspicion triggers, stop mutation, preserve state, identify the true target,
and verify before continuing.

## Authority Order

For agent behavior, this order wins:

1. Current explicit user instruction, unless it asks for unsafe destructive
   behavior without clear approval.
2. This file.
3. Repo-local enforcement hooks, as implementation of this file.
4. Current live source and command output for factual claims about behavior.
5. Current session/status docs for current work state.
6. Verified specs and operational docs for stable design contracts.
7. Older session docs, rolling docs, exported memories, chat history, ledger
   intake, proposals, and external review outputs as leads only.

For code behavior, live source wins over every doc. If live source contradicts
doctrine, stop and report the conflict; do not silently work around it.

For current state, commands/logs/runtime evidence win over dated documents.
The Doctrine must not carry current branch names, active PM2 posture, latest
test counts, numeric P0 anchors, provider availability, or issue-queue status as
timeless law. Those belong in session docs, status docs, executable gates, and
current command output.

## Non-Negotiable Conduct

- No fake data in production paths. Empty, loading, unavailable, or error state
  is acceptable. Misleading data is not.
- No guessing. Verify by reading files, running commands, checking logs, or
  citing exact paths.
- No self-authorized production code edits. Report findings, show intended
  change, and wait for explicit approval when production code is involved.
- `p:` from the user means the full pipeline is mandatory.
- No broad refactors unless explicitly requested.
- No silent failures, swallowed errors, or warn-only catches on execution paths.
- No new architecture unless requested and grounded in current system shape.
- No unnecessary dependencies.
- No new config files unless requested.
- No localhost baked into production code or public dashboard paths.
- No emojis in code, docs, commit messages, console output, dashboard strings,
  or user-visible text.
- No bulk regex scrubs, `sed -i`, or careless mass rewrites.
- No `git reset --hard` unless the user explicitly approves exactly what will be
  discarded.
- No destructive cleanup of learned state, ledgers, logs, pattern banks, history,
  or unknown files without a forensic extraction plan and explicit approval.
- No wrapping backtests, sweeps, walk-forward runs, or trading entrypoints in
  shell timeout wrappers or hidden timeout substitutes.
- No truncating backtest/sweep output just to make it shorter. Preserve full
  output somewhere readable.
- No `/tmp` for cognition artifacts that need to be grep-able later. Prompts,
  responses, bounce logs, and audit traces belong in repo-scoped paths.
- No "low priority follow-up" for known bugs. Severity controls order, not
  whether a real bug gets ignored.
- No technical loopholes around a rule's intent. If the outcome is the banned
  behavior, it is banned.

## User Interaction Rules

- Be direct. Evidence first, explanation second.
- Do not create option menus when the next step is obvious.
- If input is genuinely required, ask one short question.
- Do not ask whether to stop, pause, call it a night, or pick it up later.
- Treat user follow-up messages during troubleshooting as additive context unless
  the user explicitly says to stop everything and change tasks.
- Keep unresolved threads alive. If the user adds a clue, incorporate it without
  dropping earlier unanswered parts.
- When explaining an incident, answer both why it happened and what state it left
  behind.
- When time matters, anchor timestamps to the user's stated timezone and the
  exact source timestamp. Do not assume market-close timing or server timezone.
- When the user says his gut says something is off, stop cleanly, bookmark state,
  and verify. Do not argue him into continuing.
- Do not dunk on Mercury, Wolf, Desktop, GPT, Codex, Claude, or any teammate.
  Reconcile findings and own prompt/context quality.
- Do not use hedge language unless immediately followed by a verification step.
- If you do not know, say so and go read the repo or ask.

## Scope Control

- One task, one module, one mission at a time unless the user widens scope.
- Change only requested files and the minimum safe lines.
- Before adding helpers/modules/functions, search for existing functionality by
  intent, not just by name.
- Before a multi-fix campaign, grep the bug class across affected targets so
  sibling failures are known before the first fix lands.
- Do not duplicate logic to clean it up unless the old path is removed or
  migrated and documented.
- Do not rename or move files/directories without explicit approval.
- Do not alter generated files unless the task is to regenerate them.
- Do not touch `.env`, secrets, local credentials, or broker keys except to
  document required variables.
- Test fixtures belong only under test, tests, specs, or fixtures paths and must
  not be mistaken for production.
- Proactive thinking is welcome; proactive applying is not. For improvements
  outside the directive, propose the fix and wait for approval.

## Production Code Approval

Production paths include trading execution, broker adapters, strategy modules,
runtime entrypoints, dashboard runtime, runtime-driving config/schemas, learned
state, and any path that can affect orders, logs, metrics, or public truth.

Before a production code edit:

1. Report what you found.
2. Cite the current files/functions/commands that prove it.
3. Show the exact intended change at file/path level.
4. Wait for explicit approval.
5. Apply only the approved change.
6. Verify the mechanic and the target.
7. Run the required focused tests/gates.
8. Use adversarial review where required.

"Small" and "obvious" are not exceptions.

## Pipeline Doctrine

The Claudito pipeline exists because solo agent judgment has repeatedly failed
under stale context, shortcut pressure, and overconfidence.

Pipeline order:

1. Warden: scope check, duplicate prevention, prior lessons.
2. Entomologist/Forensics: reproduce, trace, isolate root cause.
3. Architect: minimal plan with impacted files and landmines.
4. Trey approval: no production code change before this gate.
5. Fixer: apply only the approved fix.
6. Debugger: prove the fix with focused tests.
7. Critic: attack weaknesses, failure modes, and regressions.
8. Validator: quality gate.
9. Forensics again: landmine scan.
10. Scribe/Recorder: update session/context docs.
11. Committer: one logical change, explicit staging.
12. Changelog: document the real change.
13. Janitor: cleanup only what belongs to the change.
14. Learning/Warden: record lesson and final scope check.

If the pipeline lacks a capability needed to do a fix safely, halt the fix work,
build or repair the missing pipeline capability with approval, then resume. Do
not bypass Mercury, P0, manifest tracking, or commit discipline because a change
looks obvious.

## Verification Doctrine

"Working" means two things:

1. The mechanic happens.
2. It happens on the correct target.

Always verify:

- path,
- branch/ref,
- runtime process,
- asset class,
- symbol,
- timeframe,
- execution mode,
- broker/account,
- source and destination of persistent writes,
- actual data flow, not only connection state.

Pattern learning "file is growing" is not enough. Confirm the bank matches the
current asset/mode/symbol. WebSocket "connected" is not enough. Confirm messages
flow and type strings match. Backtest exit code zero is not enough. Confirm
trades, report output, journal/recorder behavior, and stats.

When claiming a bug location, cite the exact file and function/area read in this
session. If test execution is skipped, state exactly why.

If current verification contradicts memory or an earlier observation, re-check
before sounding alarms.

## Proof Contracts

Every bugfix needs a proof contract. A proof contract enumerates every runtime
owner of the mechanism being proved, not only the files touched by the last
patch or the story around the invariant.

A proof contract must answer:

- What broke?
- What owns the state?
- What writes the state?
- What reads the state?
- What transports the state?
- What displays or reports the state?
- What recovery path touches the state?
- What test or log proves each owner sees the same truth?
- What new failure mode could this fix introduce?

Do not claim a bug is fixed until the contract is satisfied or the missing
coverage is explicitly reported.

## The Fourth Shape: Throw Doctrine

Before adding any throw:

1. Enumerate every code path that could trigger it, with file:line producer
   evidence.
2. Fix each internal producer so the invalid state cannot occur.
3. If producer fixes make the condition impossible, do not add the throw.
4. If the condition originates outside the system, such as broker responses,
   network state, exchange data, or external API data, handle it as detect,
   flatten when necessary, halt the affected symbol or lane, and trace the cause.

A throw guarding an internal invariant is an admission of an unfixed producer
bug. Fix the producer.

## Mercury Doctrine

Mercury is for adversarial attack, not soft confirmation.

- Do not ask "is this correct?"
- Ask Mercury to break assumptions.
- Use one focused Mercury question at a time.
- Do not bundle multiple hunt vectors into one prompt.
- Do not run Mercury in shell-level parallel.
- Always read the full answer before moving on.
- Use exact file:line ranges when the task is narrow.
- For broad current-diff or "break my fix" reviews, do not hide-narrow Mercury
  with agent-selected paths, line ranges, or current-diff-first instructions
  unless the user explicitly narrowed the target.
- Use the repo's current Mercury command/help. The standing dispatch shape is
  `--max-iterations=60 --max-tokens=7750` unless current tooling proves a
  different enforced value.
- If Mercury output is wrong-path or truncated, re-dispatch with tighter context
  or split the prompt. Do not hand-wave it away.
- If Mercury returns `CANNOT VERIFY`, perform direct mechanical enumeration with
  shell/tools and cite evidence.
- Do not label Mercury findings "false positive" without grep/source evidence in
  the current session.
- Before deleting learned state, ledgers, logs, pattern banks, or history,
  propose forensic extraction to a new path first.
- After an approved push, do not claim Mercury has fresh repo context until the
  indexer succeeds for the pushed code.

Mercury run-ledgers, compasses, rules-as-greps, trace memory, and auxiliary AST
tools are evidence surfaces. They do not replace current file:line proof.

## Indexer Doctrine

Mercury/RAG indexing must be narrow, explicit, and promotion-based.

- Do not index inbox, archive, commit-handoff, ledger, session, raw transcript,
  cognition-history, audit, report, backup, evidence, or scratch directories by
  default.
- `ogz-meta/Alignment/TheDoctrine.md` is the only Alignment doctrine file that
  should be indexed unless Trey explicitly promotes another Alignment file.
- Bootstraps, dated historical alignment files, archived rule dumps, and commit
  handoff packets are navigation or preservation records, not retrieval truth.
- Before running a reindex after doc intake or doctrine work, inspect the
  candidate file list from the current indexer code. Do not assume ignore rules
  worked because a directory name looks administrative.
- Do not run a Mercury/RAG/bot reindex unless Trey explicitly commands it.

## Git Doctrine

- Check status before staging.
- Check `git diff --cached` before committing.
- Do not use `git add -A` or `git add .`.
- Stage explicit file paths only.
- One logical change per commit.
- Do not bundle unrelated fixes with docs or cleanup.
- Preserve unrelated dirty work. Assume unknown changes belong to the user or
  another agent.
- Never commit `.env`, secrets, raw LLM transcripts, huge logs, TRAI brain dumps,
  `node_modules`, or multi-MB scratch files without explicit approval.
- Do not force push or destructively rewrite history without explicit approval of
  the exact risk.
- For pushed commits the user asks to undo, default to `git revert`.
- GitHub is a mirror/audit path, not proof that a runtime process has the bytes.
- Branch names and branch policy are current-state facts. Verify branch and ask
  before commit/push when policy or user preference conflicts.
- Work linearly on the current user-designated branch. Branches are verified
  fallback points, not agent-created scratch lanes.
- Do not create branches, worktrees, duplicate checkout directories, or fallback
  dirs unless the user specifically declares that branch/path.
- If the user approves a commit, commit and push are paired unless the user says
  local-only or no-push. This does not authorize staging, committing, or pushing
  without approval.

## Commit Handoff Doctrine

Completed work must not be left as vague loose state with only a chat note saying
it was not committed or not staged.

When work is done but not yet committed, create or update a small tracked-intent
handoff packet under:

`ogz-meta/commit-handoff/<YYYY-MM-DD>/<slug>.md`

The packet must list:

- task/result,
- branch/ref at the time of handoff,
- files created, modified, deleted, or intentionally left untouched,
- verification commands run and skipped,
- exact staging/commit grouping recommendation,
- untracked files that belong to the work,
- unrelated dirty files observed and preserved,
- blockers or approvals still required.

Commit handoff packets are lightweight text only. Do not put secrets, raw logs,
large outputs, broker data dumps, model transcripts, or generated artifacts there.
Large or raw evidence belongs in the appropriate repo-scoped evidence path with a
manifest.

Before final response on completed repo work, run `git status --short --branch`
and make sure the handoff packet names the remaining dirty/untracked state. Once
the work is committed and the commit is referenced by the proper session/changelog
records, the packet can be cleaned or archived with approval.

## Runtime And VPS Doctrine

Committed code, pushed code, deployed files, and running PM2 state are separate
facts.

Before claiming runtime behavior:

- verify the deployed path,
- verify PM2 process names/status,
- verify restart time if a restart was required,
- verify non-secret env posture,
- verify relevant logs,
- verify broker/account/mode/symbol,
- verify live state files only if they are the intended source.

Never restart PM2 or change live env without explicit approval.
Never start, stop, reload, restart, or reindex the bot unless the user explicitly
commands that action. This includes PM2 process control and Mercury/RAG/bot
index refreshes.

Package management on the VPS is high risk:

- check current version and package owner first,
- do not run remove/purge/autoremove without exact approval,
- if package operations propose large removals, stop and show the list,
- on GPU instances, do not remove NVIDIA/CUDA/runtime packages unless the task is
  explicitly GPU driver maintenance,
- after any runtime dependency change, verify the services with PM2/logs.

## Trading Architecture Doctrine

- This is production trading software, not a sandbox.
- Real money will run through this code. Paper trading does not make the code low
  stakes.
- The product value is transparency over hype. Never make dashboard, logs, proof,
  reports, or state lie.
- BrokerFactory or the current broker-factory equivalent is the broker source of
  truth. Verify the current implementation before editing.
- Never mix broker credentials.
- Never place orders on unintended brokers.
- Never assume broker/exchange APIs are equivalent.
- Never hardcode symbol formats. Use broker-layer conversions.
- Execution must check balance, open positions, broker constraints, max trade
  count, and kill switch.
- Risk limits and veto safety checks cannot be overridden by ML.
- TRAI passive/observer mode is not execution authority. It must not alter
  execution, veto, or outcome learning unless a non-passive decision is
  explicitly correlated to the order and current source proves the path.
- Exits must obey dynamic trailing logic and strategy exit contracts.
- Decisions must be deterministic unless the ML layer intentionally applies
  learned weights.
- Position sizing semantics must be verified before changing units. Do not mix
  USD notional, share quantity, contract quantity, or asset-native units by
  variable name alone.
- Backtests must use the same trading path as live. Do not create a parallel fake
  engine to make numbers easier.
- Every Apex clone/account must isolate process, state file, log directory, and
  kill switch.
- Strategy orchestration is winner-takes-all per candle unless current source or
  a verified spec says otherwise. Strategies do not silently blend.
- DTO field names must match consumers. Grep every consumer before renaming
  fields.
- Config without a reader is dead config. Wire config and code together or remove
  the dead path with approval.
- Do not claim config ownership is consolidated until the current config-boundary
  audit passes or exceptions are explicitly ratified.
- Dead code must be wired or removed, not left as a trap.
- One long and one short max unless a verified spec explicitly allows more.
- SELL closes a position. Do not add SELL entries to active position state.
- Partial close work must handle execution, recorder, StateManager, pattern
  memory, TRAI attribution, fees, slippage, crash recovery, and live broker
  reconciliation together. Do not make execution right while telemetry lies.
- Learned-state paths must be asset-aware unless current source or a verified
  spec explicitly proves otherwise.
- Backups are mandatory for gitignored learned-state files. Gitignore prevents
  leaks; it does not protect data.
- Venue/session transitions must be broker-first: cancel open orders, close or
  poll real broker positions, then update StateManager and resume.
- Transition failures must enter an explicit faulted/blocked/operator-recovery
  state. Do not silently resume after a half-swapped broker/session failure.
- Do not activate disabled runtime/session-routing/symbol-expansion features
  without current proof, controlled rehearsal, and explicit runtime approval.

## Dashboard And Public Truth Doctrine

- Use real backend values only.
- If a real data source is not wired, show honest empty/loading/error state.
- Do not show one asset's data under another asset's label.
- Do not show stock assets unless the backend stock feed is actually wired.
- All dashboard WebSocket URLs must use the production WebSocket path expected by
  the current server; verify sender and receiver strings match exactly.
- WebSocket clients must auto-reconnect.
- Do not block the main trading loop on dashboard disconnect.
- Handle partial data gracefully.
- Check actual data flow, not only readyState.
- Zombie connections require heartbeat plus data watchdog.
- REST init and WebSocket stream code must both set connection state correctly.
- Public dashboard HTML must never carry long-lived runtime secrets.
- Do not hardcode dashboard tokens in public JS, HTML, docs, examples, or backup
  files.
- Browser dashboard auth must fail closed when secret/session material is absent.
- Verify public hostname cache/security headers when auth containment matters.
- Burned secret literals belong only as irreversible fingerprints in approved
  security records, never as literal values.
- Public proof/track-record data must not lie about execution semantics.
- Generated proof data is not publication-safe until checked against raw journals
  and structural honesty gates.
- Reject account-label/start-balance mismatch, impossible drawdown scale,
  malformed partial flags, duplicate exit timestamps, and ambiguous final-leg
  order instead of guessing.

## Backtest Doctrine

- `ogz-meta/BACKTEST-OPS.md` owns current backtest operations.
- Backtests run through the same trading path as live execution.
- Execution/backtest mode changes data and broker mode; it is not permission for
  a fake engine.
- Verify dataset asset class and symbol before running or interpreting results.
- Strategy isolation flags must match strategy registration flags.
- Use clean pattern-memory posture unless intentionally testing persistence.
- Watch for stale env values leaking into runs.
- Manual runs may leave state files. Inspect or clean intentionally if results
  look wrong.
- Exit-system selection changes which exit manager runs; verify current source.
- Per-strategy config may override global env values; verify the config reader.
- Trust the recorder summary only after confirming recorder semantics match the
  test.
- Do not use shell timeout wrappers for backtests/sweeps.
- If a backtest hangs, find the hang and fix root cause.
- Do not truncate output to hide complexity. Capture full output to a repo-scoped
  log when needed.
- If a backtest unexpectedly has zero trades, check env/config/data parity before
  source-diving strategies.
- Do not claim edge, alpha, expectancy, or profitability unless the setup is
  apples-to-apples: asset class, fees, strategy wiring, signal behavior, and
  baseline all match.
- Numeric P0 anchors are not timeless doctrine. Read the executable gate/current
  baseline source before quoting numbers.

## Command Truth Workflow

Command snippets rot. Before putting a command in a durable doc or relying on an
old command:

1. Inspect `package.json` scripts or the script source.
2. Run `--help` only when the tool supports it and dependencies are present.
3. If dependencies are missing during a docs-only task, inspect source instead of
   repairing package state.
4. If current source/help contradicts an old command doc, current source/help
   wins.
5. If command output is too long, write full output to a repo-scoped log and
   inspect that file. Do not pipe away evidence to make a transcript shorter.

Core discovery commands:

```bash
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
git log --oneline -8
node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts || {}).sort().join('\n'))"
```

Known repo-owned gates and helpers must still be verified in current source
before use:

```bash
npm test
npm run test:smoke
npm run scan:dto
npm run lint:dto
npm run scan:secrets
npm run scan:config-boundary
npm run telemetry:report
node ogz-meta/gates/multi-runtime-gate-runner.js --p0
node ogz-meta/session-form.js state
node ogz-meta/session-form.js list
node ogz-meta/session-form.js init "mission description"
node ogz-meta/rag-embeddings.js context "<issue>"
node ogz-meta/rag-embeddings.js failed "<issue>"
node ogz-meta/rag-embeddings.js worked "<issue>"
node trai_brain/mercury-bridge/indexer.js
node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "<attack prompt>"
```

Backtest and sweep command shapes belong in `ogz-meta/BACKTEST-OPS.md` and the
current tool source/help. Do not copy stale matrix/parallel examples into
doctrine as timeless truth.

## Hookify Enforcement Catalog

Repo-local `.claude/hookify*.local.md` files are enforcement surfaces. Their
exact regexes and messages are implementation detail, but their guardrail intent
is doctrine:

- `hookify.edit-needs-approval.local.md`: warns before edits and requires
  explicit approval for code changes.
- `hookify.git-commit-no-bundling.local.md`: blocks careless `git add -A` /
  `git add .` and bundled commits.
- `hookify.git-push-needs-trey.local.md`: requires approval and adversarial
  review before pushing.
- `hookify.git-reset-hard-blocked.local.md`: blocks destructive hard reset.
- `hookify.grand-scheme.local.md`: rejects short-term patches that do not hold
  for Apex, TRAI, multi-asset, multi-broker direction.
- `hookify.mercury-attack-not-verify.local.md`: forces adversarial Mercury
  framing instead of confirmation framing.
- `hookify.mercury-before-delete.local.md`: requires forensic extraction options
  before deleting state/history.
- `hookify.mercury-max-tokens.local.md`: enforces the current high-token Mercury
  dispatch shape.
- `hookify.mercury-one-at-a-time.local.md`: enforces one Mercury question and one
  answer.
- `hookify.mercury-rarely-wrong.local.md`: treats Mercury disagreement as a
  prompt/context problem until disproven with evidence.
- `hookify.no-backtest-timeout.local.md`: blocks timeout-wrapped backtests and
  sweeps.
- `hookify.no-deferring.local.md`: prevents known bugs from being parked as
  vague future work.
- `hookify.no-emojis.local.md`: keeps production/code/docs/logs professional.
- `hookify.no-fake-data.local.md`: blocks fake, placeholder, dummy, sample, or
  misleading data in production paths.
- `hookify.no-guessing.local.md`: forces repo/source/log verification instead of
  confident memory claims.
- `hookify.no-half-assed.local.md`: rejects quick fixes, stopgaps, and temporary
  workarounds.
- `hookify.no-improv.local.md`: stops unrequested improvisation.
- `hookify.no-sed-scrub.local.md`: blocks broad scrub edits and requires scoped
  review.
- `hookify.no-stamina-or-exits.local.md`: stops agents from proposing session
  endings or pauses.
- `hookify.production-code.local.md`: treats every production code change as
  ownership-bearing and requiring proof.
- `hookify.review-priors.local.md`: requires prior context review before
  non-trivial work.
- `hookify.same-team.local.md`: requires collaborative reconciliation across AI
  reviewers.
- `hookify.session-form.local.md`: routes session endings into append-only
  session documentation.
- `hookify.slow-is-smooth.local.md`: blocks rush language and shallow motion.
- `hookify.stop-creating-options.local.md`: prevents fake option menus when the
  next action is obvious.
- `hookify.verify-not-hallucinate.local.md`: requires live file/log evidence and
  `git blame` for comment-based claims when age matters.
- `hookify.working-vs-correct.local.md`: requires second-order target checks, not
  just signs of activity.

If a new hookify file appears, read it before relevant work and reconcile it
into this catalog when it reflects a durable rule.

## Documentation Doctrine

- Canonical doctrine lives here.
- Bootstraps point here.
- Session docs are append-only dated snapshots. Do not rewrite old sessions to
  make them look current.
- Current-state facts belong in session/status docs, not The Doctrine.
- Rolling docs are context and starter material unless verified against current
  source.
- `ogz-meta/ledger/` is intake and half-spec material. Do not promote it into
  doctrine without source verification or explicit user ruling.
- Proposals, audits, external AI responses, screenshots, raw LLM transcripts,
  large logs, and scratch files are not canonical by default.
- If unsure about a discovered rule, record a TODO/ruling candidate with source
  path and short note instead of inventing policy.
- Agent session output belongs under `ogz-meta/inbox/<agent>/<YYYY-MM-DD>/`
  unless the user explicitly assigns another mission file.
- Completed work awaiting staging/commit belongs under
  `ogz-meta/commit-handoff/<YYYY-MM-DD>/` as a small text packet. This is the
  cleanable, tracked-intent place for commit handoff state.
- Inbox-to-evidence promotion requires a manifest/source note and user or
  project-defined promotion.
- Superseded docs should be archived or reduced to redirects only after
  dependency checks and user approval.
- Do not leave contradictory docs in indexed/current paths as if both are true.

## Memory Doctrine

Memory is useful but never current by itself.

- Search memory when prior project context is likely relevant.
- Treat memory as leads.
- Verify recalled facts against current repo state, branch, commit, logs, files,
  and runtime before acting.
- If memory names a branch/head/bookmark/path, re-check it.
- If memory conflicts with current source or The Doctrine, report the conflict
  and use current source/The Doctrine.
- Exported memory indexes must be read before relying on linked memory entries.

## External Review Doctrine

REMIO, Sourcegraph, static ZIP reviews, external AI responses, and teammate
summaries are read-only leads. They are not implementers and not authority.

Before applying or citing an external finding:

1. Verify the target file exists in the current repo.
2. Verify the cited lines or behavior in this session.
3. Check whether newer source/session evidence supersedes it.
4. If the finding is incomplete, stale, wrong-path, or contradictory, say so and
   reconcile before acting.

## Landmine Doctrine

Known recurring failure classes:

- wrong checkout or dormant branch edits,
- stale branch memory,
- stale baseline numbers,
- fake data or mislabeled data,
- active trade contamination,
- SELL entries stored as active positions,
- learned-state contamination across assets/modes/symbols,
- dashboard/WebSocket message type mismatch,
- WebSocket connection without data flow,
- public token/secret leakage,
- runtime process not matching committed code,
- stale `.env` values leaking into runs,
- DTO producer/consumer mismatch,
- config files with no reader,
- orphan strategy code,
- confidence gates set for convenience instead of production safety,
- hidden UI panels assumed removed,
- package operations that damage runtime/GPU dependencies,
- historical ledger docs treated as canonical,
- rolling docs treated as current state.

Do not merely remember these. Search for their current manifestation when the
task touches the area.

## Final Pre-Claim Checklist

Before saying work is done:

- Did I read this file?
- Did I verify the actual target checkout?
- Did I read the current files touched by the task?
- Did I verify behavior with commands/logs/tests where practical?
- Did I confirm path, branch/ref, mode, asset, symbol, broker, account, and
  runtime process when relevant?
- Did I check that the mechanic happened on the correct target?
- Did I avoid fake data, silent failures, broad rewrites, and unapproved code
  changes?
- Did I preserve unrelated dirty work?
- Did I list created/modified files?
- Did I report exact errors if anything failed?
- Did I identify anything stale, contradictory, or missing?

If any answer is no, do not claim done. State the gap.
